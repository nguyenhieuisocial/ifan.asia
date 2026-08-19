-- V6 (19/08/2026) — TRẦN GIẢM GIÁ THEO VAI, vượt trần thì CHỜ DUYỆT.
-- Quyết định 3 của thẻ design man-voucher-tich-diem.html, việc #180.
--
-- Luật gốc: "Nhân viên tự giảm cho khách quen là chuyện thường — nhưng phải có
-- mức trần. Vượt trần thì KHÔNG chặn cứng mà chuyển sang chờ duyệt; chặn cứng là
-- nhân viên mất khách ngay trước mặt."
--
-- ⚠️ VÌ SAO KHÔNG DÙNG HỆ DUYỆT SẴN CÓ (`wf_approval_requests`). Đã khảo sát:
--   · bảng đó KHÔNG có cột nào trỏ về thực thể nghiệp vụ (không order_id, không
--     entity_id) — muốn nối phải sửa bảng dùng chung của cả hệ workflow;
--   · duyệt xong KHÔNG có callback về nghiệp vụ gốc: phiếu sinh từ biểu mẫu chỉ
--     đổi trạng thái + gửi thông báo, không tác động ngược lại được;
--   · `wf_start_approval` đã revoke khỏi `authenticated`, tầng web không gọi được.
-- Sửa cả ba thứ đó để dùng lại là một cuộc mổ vào hệ dùng chung, rủi ro cao hơn
-- hẳn lợi ích. Ở đây làm một đường DUYỆT HẸP, tự chứa, chỉ cho đúng việc này.

-- ════════════════════════════════════════════════════════════════════
-- 1. TRẦN THEO VAI
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.discount_caps (
  tenant_id  uuid primary key references public.tenants(id) on delete cascade,
  -- Số phần trăm tối đa mỗi vai tự quyết. Chủ tiệm không có trần (thẻ design).
  staff_max_pct   smallint not null default 5  check (staff_max_pct   between 0 and 100),
  manager_max_pct smallint not null default 15 check (manager_max_pct between 0 and 100),
  admin_max_pct   smallint not null default 100 check (admin_max_pct  between 0 and 100),
  updated_at timestamptz not null default now(),
  -- Trần của vai cao KHÔNG được thấp hơn vai thấp: cấu hình ngược làm quản lý
  -- phải xin duyệt cho mức mà nhân viên tự quyết được, không ai hiểu nổi.
  constraint discount_caps_thu_tu check (staff_max_pct <= manager_max_pct
                                     and manager_max_pct <= admin_max_pct)
);

drop trigger if exists discount_caps_touch on public.discount_caps;
create trigger discount_caps_touch before update on public.discount_caps
  for each row execute function public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- 2. PHIẾU XIN DUYỆT GIẢM GIÁ
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.discount_approvals (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  order_line_id uuid not null references public.order_lines(id) on delete cascade,
  order_id      uuid not null references public.orders(id) on delete cascade,

  -- Ghi cả SỐ TIỀN lẫn TỶ LỆ tại thời điểm xin: giá dòng có thể đổi sau đó, mà
  -- người duyệt phải thấy đúng con số họ đã gật đầu.
  discount_vnd bigint   not null check (discount_vnd > 0),
  discount_pct numeric(5,2) not null check (discount_pct > 0),
  line_total_vnd bigint not null check (line_total_vnd > 0),

  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid not null references auth.users(id),
  requested_role text not null,
  reason       text check (reason is null or length(reason) <= 300),
  decided_by   uuid references auth.users(id),
  decided_at   timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 300),
  created_at   timestamptz not null default now(),

  -- Đã quyết thì PHẢI có người quyết và mốc quyết. Thiếu là phiếu mồ côi, sau
  -- này không truy được ai gật đầu cho khoản giảm đó.
  constraint discount_approvals_da_quyet check (
    (status = 'pending'  and decided_by is null and decided_at is null) or
    (status <> 'pending' and decided_by is not null and decided_at is not null)
  )
);

-- Một dòng hàng chỉ có MỘT phiếu đang chờ. Bấm xin duyệt nhiều lần không đẻ ra
-- một chồng phiếu cho người quản lý phải duyệt từng cái.
create unique index if not exists discount_approvals_mot_phieu_cho
  on public.discount_approvals (order_line_id) where status = 'pending';
create index if not exists discount_approvals_cho_duyet_idx
  on public.discount_approvals (tenant_id, status, created_at desc);

-- ════════════════════════════════════════════════════════════════════
-- 3. XIN GIẢM GIÁ — tự quyết được thì làm luôn, vượt trần thì xin duyệt
-- ════════════════════════════════════════════════════════════════════
-- Trả về jsonb: {ket_qua: 'da_ap' | 'cho_duyet', ...}. KHÔNG ném lỗi khi vượt
-- trần — vượt trần là một NHÁNH BÌNH THƯỜNG của nghiệp vụ, không phải lỗi.
create or replace function public.discount_request(
  p_order_line_id uuid,
  p_discount_vnd  bigint,
  p_reason        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role   text := (select public.app_role());
  v_dong   record;
  v_tran   smallint;
  v_goc    bigint;
  v_pct    numeric(5,2);
  v_cap    public.discount_caps;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role not in ('owner', 'admin', 'manager', 'staff') then raise exception 'forbidden'; end if;
  if p_discount_vnd is null or p_discount_vnd < 0 then raise exception 'invalid_discount'; end if;

  select l.id, l.qty, l.unit_price_vnd, o.status as order_status
    into v_dong
    from public.order_lines l
    join public.orders o on o.id = l.order_id
   where l.id = p_order_line_id and l.tenant_id = v_tenant;
  if not found then raise exception 'line_not_found'; end if;
  if v_dong.order_status not in ('draft', 'confirmed') then
    return jsonb_build_object('ket_qua', 'don_da_chot');
  end if;

  v_goc := (v_dong.qty * v_dong.unit_price_vnd)::bigint;
  if v_goc <= 0 then raise exception 'line_total_zero'; end if;
  if p_discount_vnd > v_goc then return jsonb_build_object('ket_qua', 'giam_qua_gia_dong'); end if;

  insert into public.discount_caps (tenant_id) values (v_tenant) on conflict do nothing;
  select * into v_cap from public.discount_caps where tenant_id = v_tenant;

  v_pct  := round(p_discount_vnd * 100.0 / v_goc, 2);
  v_tran := case v_role
              when 'staff'   then v_cap.staff_max_pct
              when 'manager' then v_cap.manager_max_pct
              when 'admin'   then v_cap.admin_max_pct
              else 100                       -- chủ tiệm: không trần (thẻ design)
            end;

  if v_pct <= v_tran then
    update public.order_lines set discount_vnd = p_discount_vnd where id = p_order_line_id;
    return jsonb_build_object('ket_qua', 'da_ap', 'giam_vnd', p_discount_vnd, 'giam_pct', v_pct);
  end if;

  -- VƯỢT TRẦN ⇒ KHÔNG áp, KHÔNG chặn cứng: dựng phiếu chờ duyệt và nói rõ.
  insert into public.discount_approvals
    (tenant_id, order_line_id, order_id, discount_vnd, discount_pct, line_total_vnd,
     requested_by, requested_role, reason)
  select v_tenant, p_order_line_id, l.order_id, p_discount_vnd, v_pct, v_goc,
         auth.uid(), v_role, p_reason
    from public.order_lines l where l.id = p_order_line_id
  on conflict (order_line_id) where status = 'pending' do update
     set discount_vnd = excluded.discount_vnd,
         discount_pct = excluded.discount_pct,
         line_total_vnd = excluded.line_total_vnd,
         reason = excluded.reason,
         created_at = now();

  return jsonb_build_object('ket_qua', 'cho_duyet', 'giam_pct', v_pct, 'tran_cua_ban', v_tran);
end;
$$;
revoke execute on function public.discount_request(uuid, bigint, text) from public, anon;
grant execute on function public.discount_request(uuid, bigint, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 4. QUYẾT PHIẾU — đây là chỗ có TÁC ĐỘNG NGƯỢC mà hệ duyệt cũ không có
-- ════════════════════════════════════════════════════════════════════
create or replace function public.discount_decide(
  p_id       uuid,
  p_approve  boolean,
  p_note     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role   text := (select public.app_role());
  v_p      public.discount_approvals;
  v_cap    public.discount_caps;
  v_tran   smallint;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role not in ('owner', 'admin', 'manager') then raise exception 'forbidden'; end if;

  select * into v_p from public.discount_approvals
   where id = p_id and tenant_id = v_tenant and status = 'pending' for update;
  if not found then return jsonb_build_object('ket_qua', 'khong_con_cho_duyet'); end if;

  -- KHÔNG tự duyệt phiếu của chính mình. Không có dòng này thì trần theo vai chỉ
  -- là một nút bấm thêm: nhân viên xin rồi tự gật, y như không có trần.
  if v_p.requested_by = auth.uid() then
    return jsonb_build_object('ket_qua', 'khong_tu_duyet');
  end if;

  -- Người duyệt phải có trần CAO HƠN mức đang xin. Quản lý trần 15% không được
  -- gật cho khoản giảm 40% — nếu không, "vượt trần" chỉ cần đi vòng qua đồng nghiệp.
  select * into v_cap from public.discount_caps where tenant_id = v_tenant;
  v_tran := case v_role when 'manager' then v_cap.manager_max_pct
                        when 'admin'   then v_cap.admin_max_pct
                        else 100 end;
  if p_approve and v_p.discount_pct > v_tran then
    return jsonb_build_object('ket_qua', 'vuot_tran_cua_nguoi_duyet', 'tran_cua_ban', v_tran);
  end if;

  update public.discount_approvals
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = p_note
   where id = p_id;

  if p_approve then
    -- TÁC ĐỘNG NGƯỢC vào nghiệp vụ gốc — thứ mà hệ duyệt dùng chung không làm
    -- được. Chỉ áp khi đơn còn sửa được; đơn đã chốt thì phiếu vẫn ghi nhận là
    -- đã duyệt (lịch sử), nhưng không đụng vào dòng hàng đã khoá.
    update public.order_lines l
       set discount_vnd = v_p.discount_vnd
      from public.orders o
     where l.id = v_p.order_line_id and o.id = l.order_id
       and o.status in ('draft', 'confirmed');
  end if;

  return jsonb_build_object('ket_qua', case when p_approve then 'da_duyet' else 'da_tu_choi' end);
end;
$$;
revoke execute on function public.discount_decide(uuid, boolean, text) from public, anon;
grant execute on function public.discount_decide(uuid, boolean, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 5. QUYỀN
-- ════════════════════════════════════════════════════════════════════
alter table public.discount_caps      enable row level security;
alter table public.discount_approvals enable row level security;

-- Trần: cả tiệm ĐỌC (nhân viên phải biết mình được giảm tới đâu), chủ/quản trị sửa.
create policy discount_caps_select on public.discount_caps
  for select using (tenant_id = (select public.current_tenant_id()));
create policy discount_caps_manage on public.discount_caps
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  );

-- Phiếu: cả tiệm ĐỌC (người xin phải theo dõi được phiếu của mình).
-- GHI chỉ qua hai hàm trên ⇒ không policy insert/update, không ai lách trần.
create policy discount_approvals_select on public.discount_approvals
  for select using (tenant_id = (select public.current_tenant_id()));

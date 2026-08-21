-- ════════════════════════════════════════════════════════════════════
-- #331 — CÔNG TẮC TÍNH NĂNG (thẻ design `man-quan-tri-cong-tac-tinh-nang.html`)
-- ════════════════════════════════════════════════════════════════════
-- Trước bản vá này, muốn tắt một tính năng đang gây lỗi thì CHỈ CÓ MỘT CÁCH:
-- sửa mã rồi ra bản mới — mất vài phút, và trong vài phút đó khách vẫn đang
-- gặp lỗi. Muốn mở một tính năng cho ba tiệm dùng thử trước cũng không có
-- đường nào ngoài mở cho tất cả.
--
-- ⚠️ ĐÂY KHÔNG PHẢI PHÂN QUYỀN. Công tắc chỉ quyết định CÓ HIỆN RA KHÔNG. Ai
--   biết đường dẫn vẫn gọi tới được. Việc chặn thật nằm ở RLS và ở chốt trong
--   lệnh máy chủ. Dùng công tắc để giấu thứ không được phép xem là sai theo
--   cách nguy hiểm nhất: nó TRÔNG như đã chặn.
--
-- ⚠️ KHÔNG CÓ CÔNG TẮC THÌ TÍNH NĂNG VẪN CHẠY. `co_bat()` trả `true` khi không
--   tìm thấy dòng nào. Nếu làm ngược lại thì một lần gõ sai tên khoá là cả
--   tính năng biến mất, và công tắc trở thành bẫy thay vì lưới an toàn.

create table if not exists public.feature_flags (
  -- Khoá do người viết mã đặt, dạng gạch nối: 'ai-tra-loi', 'bang-lenh'.
  khoa text primary key check (khoa ~ '^[a-z][a-z0-9-]{1,48}$'),
  ten text not null check (length(btrim(ten)) between 1 and 80),
  mo_ta text check (length(mo_ta) <= 400),
  pham_vi text not null default 'moi_tiem'
    check (pham_vi in ('tat', 'moi_tiem', 'vai_tiem', 'theo_vai')),
  -- Chỉ có nghĩa khi pham_vi = 'vai_tiem'.
  tiem_ids uuid[] not null default '{}',
  -- Chỉ có nghĩa khi pham_vi = 'theo_vai'.
  vai text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  -- Hai phạm vi "một phần" mà để danh sách RỖNG thì thành tắt-ngầm: màn hiện
  -- "mở một phần" nhưng thực tế không ai thấy. Bắt khai rõ ngay ở CSDL.
  constraint feature_flags_pham_vi_phai_co_danh_sach check (
    (pham_vi <> 'vai_tiem' or array_length(tiem_ids, 1) >= 1) and
    (pham_vi <> 'theo_vai' or array_length(vai, 1) >= 1)
  )
);

comment on table public.feature_flags is
  'Công tắc bật/tắt tính năng của chủ SaaS. KHÔNG phải phân quyền — chỉ quyết định có hiện ra không. Không có dòng ⇒ tính năng VẪN CHẠY (#331).';

-- ── SỔ GẠT CÔNG TẮC ─────────────────────────────────────────────────
-- Không có sổ thì một sáng nào đó tính năng tắt và không ai biết vì sao —
-- đúng lúc cần biết nhất.
create table if not exists public.feature_flag_log (
  id bigint generated always as identity primary key,
  khoa text not null,
  truoc jsonb,
  sau jsonb,
  boi uuid references auth.users(id) on delete set null,
  luc timestamptz not null default now()
);
create index if not exists feature_flag_log_khoa_luc on public.feature_flag_log (khoa, luc desc);

comment on table public.feature_flag_log is
  'Ai gạt công tắc nào, lúc nào, từ gì sang gì. Chỉ ghi bằng trigger — không ai chèn tay (#331).';

create or replace function public.feature_flags_ghi_so()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.feature_flag_log (khoa, truoc, sau, boi)
  values (
    coalesce(new.khoa, old.khoa),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists feature_flags_ghi_so on public.feature_flags;
create trigger feature_flags_ghi_so
  after insert or update or delete on public.feature_flags
  for each row execute function public.feature_flags_ghi_so();

-- ── RLS: KHÔNG AI ĐỌC THẲNG ─────────────────────────────────────────
-- Bật RLS mà KHÔNG khai policy nào ⇒ mọi người dùng thường đọc/ghi đều trượt.
-- Cố ý: `tiem_ids` là danh sách tiệm nào đang được ưu ái dùng thử — không phải
-- thứ để một chủ tiệm bất kỳ đọc được. Mọi đường đi hợp lệ đều qua hàm
-- security definer bên dưới.
alter table public.feature_flags enable row level security;
alter table public.feature_flag_log enable row level security;

-- ── ĐỌC CÔNG TẮC ────────────────────────────────────────────────────
create or replace function public.co_bat(p_khoa text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select case f.pham_vi
        when 'tat'      then false
        when 'moi_tiem' then true
        when 'vai_tiem' then public.current_tenant_id() = any (f.tiem_ids)
        when 'theo_vai' then public.app_role() = any (f.vai)
      end
      from public.feature_flags f
      where f.khoa = p_khoa
    ),
    -- Không có công tắc ⇒ tính năng VẪN CHẠY. Xem khối đầu file.
    true
  );
$$;

comment on function public.co_bat(text) is
  'Tính năng này có đang mở cho NGƯỜI ĐANG ĐĂNG NHẬP không. Không có công tắc ⇒ true. KHÔNG dùng thay cho phân quyền (#331).';

revoke all on function public.co_bat(text) from public, anon;
grant execute on function public.co_bat(text) to authenticated;

-- ── MÀN QUẢN TRỊ: ĐỌC ───────────────────────────────────────────────
create or replace function public.admin_cong_tac()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.is_platform_admin() then '[]'::jsonb else
    coalesce(
      (
        select jsonb_agg(x order by x->>'ten')
        from (
          select jsonb_build_object(
            'khoa', f.khoa,
            'ten', f.ten,
            'mo_ta', f.mo_ta,
            'pham_vi', f.pham_vi,
            'vai', f.vai,
            'updated_at', f.updated_at,
            -- Kèm luôn TÊN tiệm: màn cần hiện "Spa Hương Sen" chứ không phải
            -- một dãy mã, và bắt màn tự đi tra tên là thêm một lượt gọi nữa.
            'tiem', coalesce(
              (select jsonb_agg(jsonb_build_object('id', t.id, 'ten', t.name))
                 from public.tenants t where t.id = any (f.tiem_ids)),
              '[]'::jsonb
            )
          ) x
          from public.feature_flags f
        ) s
      ),
      '[]'::jsonb
    )
  end;
$$;

revoke all on function public.admin_cong_tac() from public, anon;
grant execute on function public.admin_cong_tac() to authenticated;

-- ── MÀN QUẢN TRỊ: GHI ───────────────────────────────────────────────
-- ⚠️ CHỐT `is_platform_admin()` NẰM TRONG THÂN HÀM, không ở tầng web. Hàm
--   security definer chạy bằng quyền chủ sở hữu, nên thiếu chốt là bất kỳ
--   người dùng đã đăng nhập nào cũng gạt được công tắc của cả nền tảng.
create or replace function public.admin_dat_cong_tac(
  p_khoa text,
  p_ten text,
  p_mo_ta text,
  p_pham_vi text,
  p_tiem_ids uuid[] default '{}',
  p_vai text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'ly_do', 'forbidden');
  end if;

  insert into public.feature_flags (khoa, ten, mo_ta, pham_vi, tiem_ids, vai, updated_by)
  values (p_khoa, p_ten, nullif(btrim(p_mo_ta), ''), p_pham_vi,
          coalesce(p_tiem_ids, '{}'), coalesce(p_vai, '{}'), auth.uid())
  on conflict (khoa) do update set
    ten = excluded.ten,
    mo_ta = excluded.mo_ta,
    pham_vi = excluded.pham_vi,
    tiem_ids = excluded.tiem_ids,
    vai = excluded.vai,
    updated_at = now(),
    updated_by = auth.uid();

  return jsonb_build_object('ok', true);
exception
  -- Ràng buộc CSDL từ chối (khoá sai dạng, phạm vi "một phần" mà danh sách
  -- rỗng…) ⇒ trả LÝ DO ĐỌC ĐƯỢC thay vì ném lỗi kỹ thuật lên màn.
  when check_violation then
    return jsonb_build_object('ok', false, 'ly_do', 'du_lieu_khong_hop_le');
end;
$$;

revoke all on function public.admin_dat_cong_tac(text, text, text, text, uuid[], text[]) from public, anon;
grant execute on function public.admin_dat_cong_tac(text, text, text, text, uuid[], text[]) to authenticated;

/**
 * TẮT NGAY — một bấm, không cần điền gì thêm.
 *
 * Lúc đang có sự cố thì thao tác phải là MỘT bấm. Bắt mở hộp sửa, chọn phạm
 * vi rồi bấm Lưu là ba bấm, và bấm thứ ba luôn là bấm bị quên.
 */
create or replace function public.admin_tat_cong_tac_ngay(p_khoa text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_co int;
begin
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'ly_do', 'forbidden');
  end if;
  update public.feature_flags
     set pham_vi = 'tat', updated_at = now(), updated_by = auth.uid()
   where khoa = p_khoa;
  get diagnostics v_co = row_count;
  if v_co = 0 then
    return jsonb_build_object('ok', false, 'ly_do', 'khong_thay');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_tat_cong_tac_ngay(text) from public, anon;
grant execute on function public.admin_tat_cong_tac_ngay(text) to authenticated;

/** Sổ gạt công tắc — 100 lần gần nhất. */
create or replace function public.admin_cong_tac_so(p_khoa text default null)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.is_platform_admin() then '[]'::jsonb else
    coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'khoa', l.khoa,
          'truoc', l.truoc->>'pham_vi',
          'sau', l.sau->>'pham_vi',
          'boi', u.email,
          'luc', l.luc
        ) order by l.luc desc)
        from (
          select * from public.feature_flag_log
          where p_khoa is null or khoa = p_khoa
          order by luc desc limit 100
        ) l
        left join auth.users u on u.id = l.boi
      ),
      '[]'::jsonb
    )
  end;
$$;

revoke all on function public.admin_cong_tac_so(text) from public, anon;
grant execute on function public.admin_cong_tac_so(text) to authenticated;

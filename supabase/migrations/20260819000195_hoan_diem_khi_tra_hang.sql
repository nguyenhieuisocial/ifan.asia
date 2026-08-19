-- TRẢ HÀNG PHẢI ĐỘNG TỚI ĐIỂM — cả hai chiều. (19/08/2026, việc #186)
--
-- ═══════════════════════════════════════════════════════════════════
-- LỖ LÀ GÌ
-- ═══════════════════════════════════════════════════════════════════
-- Hoàn hàng hiện KHÔNG đụng gì tới sổ điểm. Đo được ở `loyalty_earn_for_order`
-- (#158, vá ở #159): dòng `if v_order.kind <> 'order' then return 0` làm đơn
-- hoàn không tích điểm — đúng — nhưng KHÔNG có đường nào đi ngược lại. Hệ quả
-- là HAI lỗ, và lỗ thứ nhất là lỗ TIỀN CỦA KHÁCH:
--
--   ① KHÁCH MẤT TIỀN. Từ #194, khách trả một phần đơn bằng điểm ⇒ sinh
--      `order_payments.method='points'`. Trả hàng thì hàng về tiệm, nhưng số
--      điểm khách đã bỏ ra để trả đơn đó KHÔNG được trả lại. Và trong hệ này
--      KHÔNG có đường hoàn tiền mặt cho đơn hoàn (`order_payments.amount_vnd`
--      phải > 0 còn `order_payments_guard` so với tổng dòng ÂM của phiếu hoàn ⇒
--      mọi khoản chi trên phiếu hoàn đều bị chặn). Nghĩa là khách trả hàng xong
--      thì phần tiền họ đã trả bằng điểm BỐC HƠI. Đó là lấy tiền của khách.
--
--   ② TIỆM MẤT TIỀN. Điểm đã tặng cho đơn gốc vẫn nằm nguyên trong ví khách sau
--      khi hàng đã trả về. Mua 10 triệu lấy 1.000 điểm rồi trả hết hàng vẫn giữ
--      đủ 1.000 điểm — mà điểm là NỢ (ADR-0023), nên đó là nợ sinh ra từ một
--      giao dịch không còn tồn tại.
--
-- Lỗ này CÓ SẴN TỪ TRƯỚC #194, đã ghi ở mục 6 của ADR-0023 để không ai tưởng
-- là đã có. Bản này trả nó.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO THEO TỈ LỆ
-- ═══════════════════════════════════════════════════════════════════
-- Kho này cho hoàn MỘT PHẦN: phiếu hoàn là đơn mới, chọn từng dòng từng số
-- lượng (`createReturn` ở `app/app/orders/actions.ts`). Trả 1 trong 3 món thì
-- không thể thu lại toàn bộ điểm đã tặng, cũng không thể trả lại toàn bộ điểm
-- đã tiêu. Một con số duy nhất "có hoàn hay không" là sai ở mọi ca hoàn lẻ.
--
-- Tỉ lệ = GIÁ TRỊ HÀNG TRẢ / GIÁ TRỊ ĐƠN GỐC, cả hai đo bằng ĐÚNG công thức mà
-- `loyalty_earn_for_order` dùng để tính điểm (`qty × đơn giá − giảm giá`, và
-- giảm giá đã gồm cả phần voucher đã phân bổ về dòng — luật của #159). Dùng
-- cùng một công thức là để phần thu lại luôn khớp với phần đã tặng; lấy công
-- thức khác thì hoàn 100% đơn cũng không ra đúng 100% điểm.
--
-- ⚠️ MỘT CHỖ CỐ Ý LỆCH: giá trị hàng trả tính bằng `|qty| × đơn giá − giảm giá`
-- chứ KHÔNG phải `qty × đơn giá − giảm giá` như các nơi khác trong kho. Lý do:
-- dòng phiếu hoàn mang `qty` ÂM nhưng `discount_vnd` vẫn DƯƠNG (CHECK của #127
-- bắt `discount_vnd >= 0`), nên công thức chung ra `−(giá + giảm)` — tức là
-- LỚN HƠN giá trị thật đúng bằng hai lần khoản giảm. Ở đây phải đúng nên tính
-- riêng. (Chỗ dùng công thức chung cho phiếu hoàn — tổng đơn ở
-- `lib/catalog/orders.ts` và hoa hồng ở #180 — vẫn còn sai ở những đơn có giảm
-- giá; ghi ra đây chứ không sửa lẫn vào bản này.)
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO KHÔNG BAO GIỜ ĐỂ SỐ DƯ ÂM
-- ═══════════════════════════════════════════════════════════════════
-- Khách được tặng 100 điểm, tiêu hết 100 điểm ở đơn khác, rồi mới trả hàng.
-- Thu đủ 100 điểm thì ví về −100. Một cái ví âm nghĩa là: lần sau khách mua
-- hàng, điểm mới tự động bị nuốt để bù — tiệm đang ĐÒI NỢ khách một khoản
-- khách không biết mình nợ. Và cả hệ không có chỗ nào hiện số âm (view
-- `loyalty_balances` lọc `remaining > 0`), nên khoản đòi đó là một khoản đòi
-- KHÔNG NHÌN THẤY ĐƯỢC. Thu tới 0 rồi dừng: thu được bao nhiêu hay bấy nhiêu.
--
-- Kèm một chốt tinh hơn, phải nói ra vì rất dễ trượt: phần THU LẠI không được
-- đụng vào những lô sinh ra từ chính việc TRẢ LẠI (`reason='return_refund'`).
-- Lô đó là TIỀN CỦA KHÁCH vừa được trả về, không phải quà của tiệm. Thu vào đó
-- là lấy lại đúng khoản mình vừa hoàn. Hai lớp chặn:
--   · làm phần THU trước, phần TRẢ LẠI sau (lô mới chưa tồn tại lúc thu);
--   · và lọc thẳng `reason <> 'return_refund'` — cần cho ca hoàn NHIỀU LẦN,
--     khi lô trả-lại của phiếu hoàn trước đã nằm sẵn trong ví.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO ĐẶT Ở CSDL, KHÔNG ĐẶT Ở TẦNG WEB
-- ═══════════════════════════════════════════════════════════════════
-- Bài học đã trả giá trong kho này: trần giảm giá theo vai từng chỉ nằm ở tầng
-- web và bị đi vòng bằng đường ghi thẳng (#183 phải vá lại bằng trigger). Luật
-- nào chỉ nằm ở màn hình thì có ngày có đường thứ hai không đi qua màn hình đó.
-- Ở đây đường thứ hai đã thấy trước được: `completeOrder` của tầng web gọi
-- `loyalty_earn_for_order` bằng một lời gọi RIÊNG sau khi đổi trạng thái — đứt
-- mạng giữa hai bước là mất luôn phần điểm. Đặt ở trigger thì việc quyết toán
-- điểm nằm TRONG CÙNG giao dịch với việc chốt phiếu hoàn: hoặc cả hai cùng có,
-- hoặc cả hai cùng không.

-- ════════════════════════════════════════════════════════════════════
-- 1. HAI LÝ DO MỚI TRONG SỔ ĐIỂM
-- ════════════════════════════════════════════════════════════════════
-- Phân biệt được bằng chính cột `reason` chứ không bằng cách đọc `note`: chủ
-- tiệm nhìn ví điểm của khách phải thấy ngay dòng nào là "trả lại" (khách được
-- cộng) và dòng nào là "thu lại" (khách bị trừ). Gộp cả hai vào 'adjust' là mất
-- khả năng đó, và mất luôn khả năng ĐẾM để chống chạy hai lần.
alter table public.loyalty_ledger drop constraint if exists loyalty_ledger_reason_check;
alter table public.loyalty_ledger add constraint loyalty_ledger_reason_check
  check (reason in ('order', 'redeem', 'referral', 'manual', 'adjust',
                    'return_refund', 'return_clawback'));

comment on column public.loyalty_ledger.reason is
  'order = tich tu don · redeem = khach tieu · referral/manual/adjust = tang tay · return_refund = TRA LAI diem khach da tieu o don goc khi tra hang (#195) · return_clawback = THU LAI diem da tang cho phan hang da tra (#195).';

-- Chống chạy hai lần Ở CSDL, không ở trong hàm: mỗi phiếu hoàn có TỐI ĐA một
-- dòng trả-lại và một dòng thu-lại. Cùng khuôn `loyalty_ledger_order_unique`
-- (#157) đã chặn tích điểm hai lần cho một đơn.
create unique index if not exists loyalty_ledger_return_unique
  on public.loyalty_ledger (order_id, reason)
  where reason in ('return_refund', 'return_clawback');

-- ════════════════════════════════════════════════════════════════════
-- 2. QUYẾT TOÁN ĐIỂM CHO MỘT PHIẾU HOÀN
-- ════════════════════════════════════════════════════════════════════
-- `security definer` vì sổ điểm KHÔNG có policy ghi (#157) — mọi đường vào sổ
-- đều đi qua hàm. Không kiểm vai ở đây: hàm chỉ chạy từ trigger, mà trigger chỉ
-- nổ khi có người ĐÃ đổi được trạng thái phiếu hoàn sang 'completed' — tức là
-- đã qua policy `orders_update` (loại 'viewer'). Kiểm lại là kiểm hai nơi cho
-- cùng một luật.
--
-- Không lấy tiệm từ `current_tenant_id()` mà lấy thẳng từ dòng đơn: trigger
-- chạy trong ngữ cảnh của phiên đang sửa đơn đó, và dòng đơn là sự thật gần
-- nhất. Cũng nhờ vậy hàm chạy đúng cả khi được gọi tay để kiểm.
create or replace function public.loyalty_settle_return(p_return_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_don       public.orders;
  v_goc       public.orders;
  v_cfg       public.loyalty_config;
  v_gia_goc   bigint;
  v_gia_hoan  bigint;
  v_ty        numeric;
  v_da_tieu   integer;
  v_da_tra    integer;
  v_tra_lai   integer;
  v_da_tang   integer;
  v_da_thu    integer;
  v_muon_thu  integer;
  v_thu       integer;
  v_con       integer;
  v_lo        record;
  v_lay       integer;
  v_conlai    integer;
  v_ghi_chu   text;
begin
  select * into v_don from public.orders where id = p_return_order_id;
  if not found
     or v_don.kind <> 'return'
     or v_don.status <> 'completed'
     or v_don.deleted_at is not null
     or v_don.parent_order_id is null then
    return jsonb_build_object('tra_lai', 0, 'thu_lai', 0, 'ly_do', 'khong_phai_phieu_hoan_da_xong');
  end if;

  -- CHỐT CHẠY HAI LẦN. Chỉ mục duy nhất ở trên là chốt cứng cuối cùng, nhưng
  -- phải chặn TỪ ĐÂY: nếu để chạy tiếp thì phần trừ `remaining` của các lô đã
  -- kịp chạy lần thứ hai trước khi câu insert đụng chỉ mục.
  if exists (select 1 from public.loyalty_ledger
              where order_id = p_return_order_id
                and reason in ('return_refund', 'return_clawback')) then
    return jsonb_build_object('tra_lai', 0, 'thu_lai', 0, 'ly_do', 'da_quyet_toan');
  end if;

  select * into v_goc from public.orders
   where id = v_don.parent_order_id and tenant_id = v_don.tenant_id;
  if not found or v_goc.contact_id is null then
    return jsonb_build_object('tra_lai', 0, 'thu_lai', 0, 'ly_do', 'khong_ro_don_goc');
  end if;

  -- ── Tỉ lệ hoàn ──────────────────────────────────────────────────
  select coalesce(sum(qty * unit_price_vnd - discount_vnd), 0)::bigint
    into v_gia_goc from public.order_lines where order_id = v_goc.id;
  -- `|qty|` chứ không `qty` — xem khối ⚠️ ở đầu file.
  select coalesce(sum(greatest(abs(qty) * unit_price_vnd - discount_vnd, 0)), 0)::bigint
    into v_gia_hoan from public.order_lines where order_id = v_don.id;

  if v_gia_goc <= 0 or v_gia_hoan <= 0 then
    return jsonb_build_object('tra_lai', 0, 'thu_lai', 0, 'ly_do', 'khong_co_gia_tri');
  end if;
  -- Chặn trên ở 1: phiếu hoàn không thể trả về nhiều hơn thứ đã mua, và nếu dữ
  -- liệu lệch thì cũng không được nhân số điểm lên.
  v_ty := least(v_gia_hoan::numeric / v_gia_goc::numeric, 1);

  -- ── Chiều 1: THU LẠI điểm đã tặng ───────────────────────────────
  -- Làm TRƯỚC chiều trả lại, để lô trả lại chưa tồn tại lúc tính trần.
  select coalesce(sum(delta_points), 0)::integer into v_da_tang
    from public.loyalty_ledger
   where tenant_id = v_don.tenant_id and order_id = v_goc.id and reason = 'order';
  -- Đã thu ở các phiếu hoàn TRƯỚC của cùng đơn gốc (hoàn nhiều lần).
  select coalesce(sum(-g.delta_points), 0)::integer into v_da_thu
    from public.loyalty_ledger g
    join public.orders h on h.id = g.order_id
   where g.tenant_id = v_don.tenant_id and g.reason = 'return_clawback'
     and h.parent_order_id = v_goc.id;
  v_muon_thu := least(floor(v_da_tang * v_ty)::integer, greatest(v_da_tang - v_da_thu, 0));

  if v_muon_thu > 0 then
    -- Khoá lô của đúng khách này trước khi đọc số dư — cùng lý do với
    -- `loyalty_redeem` (#158): hai phiên cùng động vào một ví thì phải xếp hàng.
    perform 1 from public.loyalty_ledger
     where tenant_id = v_don.tenant_id and contact_id = v_goc.contact_id and remaining > 0
     for update;

    select coalesce(sum(remaining), 0)::integer into v_con
      from public.loyalty_ledger
     where tenant_id = v_don.tenant_id and contact_id = v_goc.contact_id
       and remaining > 0 and expires_at > now()
       and reason <> 'return_refund';

    v_thu := least(v_muon_thu, greatest(v_con, 0));
  else
    v_thu := 0;
    v_con := 0;
  end if;

  if v_thu > 0 then
    v_conlai := v_thu;
    for v_lo in
      select id, remaining from public.loyalty_ledger
       where tenant_id = v_don.tenant_id and contact_id = v_goc.contact_id
         and remaining > 0 and expires_at > now()
         and reason <> 'return_refund'
       -- Lấy trước từ CHÍNH lô sinh ra bởi đơn gốc: thu lại đúng thứ mình đã
       -- tặng. Hết lô đó mới lấn sang lô khác, và khi đó theo thứ tự SẮP HẾT
       -- HẠN TRƯỚC — cùng thứ tự `loyalty_redeem` tiêu, để khách không giữ lại
       -- một lô sắp bốc hơi trong khi lô còn hạn dài bị lấy mất.
       order by (case when order_id = v_goc.id and reason = 'order' then 0 else 1 end),
                expires_at asc, created_at asc
    loop
      exit when v_conlai <= 0;
      v_lay := least(v_lo.remaining, v_conlai);
      update public.loyalty_ledger set remaining = remaining - v_lay where id = v_lo.id;
      v_conlai := v_conlai - v_lay;
    end loop;

    v_ghi_chu := format('Trả hàng: thu lại %s điểm đã tặng cho phần hàng đã trả', v_thu);
    if v_thu < v_muon_thu then
      -- Chủ tiệm phải đọc được VÌ SAO thu hụt, không thì tưởng máy tính sai.
      v_ghi_chu := v_ghi_chu ||
        format(' (đáng lẽ %s điểm, nhưng ví khách chỉ còn %s nên dừng ở đó, không để ví âm)',
               v_muon_thu, v_con);
    end if;
    insert into public.loyalty_ledger
      (tenant_id, contact_id, delta_points, reason, order_id, note, remaining, created_by)
    values (v_don.tenant_id, v_goc.contact_id, -v_thu, 'return_clawback', p_return_order_id,
            v_ghi_chu, 0, auth.uid());
  end if;

  -- ── Chiều 2: TRẢ LẠI điểm khách đã tiêu ─────────────────────────
  select coalesce(sum(-delta_points), 0)::integer into v_da_tieu
    from public.loyalty_ledger
   where tenant_id = v_don.tenant_id and order_id = v_goc.id and reason = 'redeem';
  select coalesce(sum(g.delta_points), 0)::integer into v_da_tra
    from public.loyalty_ledger g
    join public.orders h on h.id = g.order_id
   where g.tenant_id = v_don.tenant_id and g.reason = 'return_refund'
     and h.parent_order_id = v_goc.id;
  -- `floor` chứ không làm tròn: hoàn nhiều lần thì tổng các phần làm tròn LÊN
  -- có thể vượt số khách đã tiêu — tự sinh ra nợ từ phép làm tròn. Trần
  -- `đã tiêu − đã trả lại` là chốt cứng cho cả chuỗi hoàn.
  v_tra_lai := least(floor(v_da_tieu * v_ty)::integer, greatest(v_da_tieu - v_da_tra, 0));

  if v_tra_lai > 0 then
    -- Hạn dùng tính LẠI TỪ ĐẦU theo cấu hình tiệm: điểm được trả về là điểm
    -- khách chưa dùng được ngày nào, không phải điểm cũ sắp hết hạn.
    v_cfg := public.loyalty_config_get(v_don.tenant_id);
    insert into public.loyalty_ledger
      (tenant_id, contact_id, delta_points, reason, order_id, note,
       expires_at, remaining, created_by)
    values (v_don.tenant_id, v_goc.contact_id, v_tra_lai, 'return_refund', p_return_order_id,
            format('Trả hàng: trả lại %s điểm khách đã dùng để trả đơn gốc', v_tra_lai),
            now() + make_interval(months => v_cfg.expire_months), v_tra_lai, auth.uid());
  end if;

  return jsonb_build_object('tra_lai', v_tra_lai, 'thu_lai', v_thu,
                            'muon_thu', v_muon_thu, 'ty_le', round(v_ty, 6));
end;
$fn$;

revoke execute on function public.loyalty_settle_return(uuid) from public, anon;
-- KHÔNG grant cho `authenticated`: đường vào duy nhất là trigger bên dưới, và
-- trigger chạy quyền chủ hàm nên không cần quyền của người bấm. Mở thêm một
-- cửa gọi tay là mở thêm một chỗ quyết toán sai thời điểm.

comment on function public.loyalty_settle_return(uuid) is
  'Quyet toan diem cho MOT phieu hoan da completed: tra lai diem khach da tieu o don goc + thu lai diem da tang, ca hai THEO TI LE gia tri hang tra. KHONG bao gio de vi am (thu toi 0 roi dung) va KHONG dung vao lo return_refund. Idempotent: chi muc loyalty_ledger_return_unique + kiem da-quyet-toan o dau ham.';

-- ════════════════════════════════════════════════════════════════════
-- 3. TRIGGER — nổ đúng lúc phiếu hoàn chốt xong
-- ════════════════════════════════════════════════════════════════════
create or replace function public.orders_quyet_toan_diem_hoan()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.loyalty_settle_return(new.id);
  return new;
end;
$$;
revoke execute on function public.orders_quyet_toan_diem_hoan() from public, anon;

drop trigger if exists orders_quyet_toan_diem_hoan on public.orders;
-- `after` chứ không `before`: dòng hàng của phiếu hoàn phải đã nằm đủ trong
-- bảng thì mới đo được giá trị hàng trả.
--
-- CHỈ bắt UPDATE, cố ý không bắt INSERT: đường tạo phiếu hoàn (`createReturn`)
-- luôn tạo ở trạng thái 'draft' rồi mới chốt, và một phiếu hoàn được INSERT
-- thẳng ở 'completed' thì `order_lines_lock_guard` (#127) chặn luôn việc thêm
-- dòng hàng ⇒ phiếu rỗng, không có gì để quyết toán. Bắt thêm INSERT là dựng
-- một nhánh không đường nào chạm tới.
create trigger orders_quyet_toan_diem_hoan
  after update of status on public.orders
  for each row
  when (new.kind = 'return' and new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.orders_quyet_toan_diem_hoan();

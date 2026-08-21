-- #296 — TIỀN TRẢ NHÀ CUNG CẤP KHÔNG HỀ TRỪ VÀO KÉT. Đo được 1,4 tỉ tiền mặt.
--
-- ════════════════════════════════════════════════════════════════════
-- LỖ ĐANG MỞ, VÀ VÌ SAO NÓ HẠI NGƯỜI CHỨ KHÔNG CHỈ HẠI SỐ
-- ════════════════════════════════════════════════════════════════════
--
-- Màn Két sắt ghi lệnh trả nhà cung cấp vào `supplier_payments` rồi dừng ở đó.
-- KHÔNG có trigger nào, KHÔNG có cột nối, KHÔNG có đường nào đưa khoản chi ấy
-- sang Sổ quỹ.
--
-- Đo trên dữ liệu thật (21/08):
--   · 20 lượt trả nhà cung cấp, tổng **2.946.747.500đ**
--   · trong đó trả bằng **TIỀN MẶT: 9 lượt, 1.404.223.500đ**
--   · Sổ quỹ biết đúng **1 dòng, 3.500.000đ** — và dòng đó là một khoản chi
--     ghi tay độc lập, không nối với lượt trả nào
--
-- **Tiền mặt là chỗ đau.** 1,4 tỉ đã rời két thật, nhưng lúc chốt ca máy vẫn
-- kỳ vọng số tiền đó còn trong két, rồi báo "quỹ thiếu". Chủ tiệm nhìn con số
-- thiếu ấy và **đi nghi nhân viên** — phần mềm không chỉ sai một con số, nó
-- vu oan cho một con người.
--
-- Chuyển khoản không rời két nhưng vẫn phải vào sổ: thiếu nó thì tổng chi
-- trong kỳ nhỏ hơn thật, và mọi phép tính "còn lại bao nhiêu" đều rộng tay hơn
-- thực tế.
--
-- ════════════════════════════════════════════════════════════════════
-- VÌ SAO CHỮA Ở TẦNG CSDL, KHÔNG PHẢI Ở MÀN HÌNH
-- ════════════════════════════════════════════════════════════════════
--
-- Chiều THU tiền đã đi đúng đường này từ lâu: `order_payments_emit_cash_entry`
-- là một trigger, nên **không đường ghi nào lọt được** — dù thu qua màn bán
-- hàng, qua cổng ngân hàng tự động, hay qua một màn chưa viết. Bản này làm
-- chiều CHI y hệt, đối xứng gương.
--
-- Nếu chữa ở màn hình thì mai có thêm một đường trả tiền nào khác (nhập hàng
-- hàng loạt, API, việc chạy nền) là lỗ mở lại — và mở lại **im lặng**.

-- ── 1. Cột nối, đối xứng với `order_payment_id` ────────────────────────────
alter table public.cash_entries
  add column if not exists supplier_payment_id uuid
    references public.supplier_payments(id) on delete set null;

-- Một lượt trả chỉ được sinh ĐÚNG MỘT dòng quỹ. Không có chỉ mục này thì một
-- lần chạy bù trùng hoặc một trigger bị gắn hai lần sẽ nhân đôi khoản chi — và
-- khoản chi nhân đôi trông y hệt khoản chi thật.
create unique index if not exists cash_entries_mot_dong_moi_luot_tra
  on public.cash_entries (supplier_payment_id)
  where supplier_payment_id is not null;

-- ── 2. Trigger: trả tiền là trừ quỹ ────────────────────────────────────────
create or replace function public.supplier_payments_emit_cash_entry()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  -- `fund` quyết định khoản này có nằm trong "tiền đếm được trong két" hay
  -- không. Trả tiền mặt ⇒ két vơi đi thật. Trả chuyển khoản ⇒ tài khoản vơi.
  -- Đây là chốt giữ cho phép chốt ca khớp với tiền đếm tay.
  insert into public.cash_entries
      (tenant_id, direction, amount_vnd, fund, category, supplier_payment_id, note, recorded_by)
    values
      (new.tenant_id, 'out', new.amount_vnd,
       case when new.payment_method = 'cash' then 'cash' else 'bank' end,
       'supplier_payment', new.id, new.note, new.recorded_by)
  on conflict (supplier_payment_id) where supplier_payment_id is not null do nothing;
  return new;
end $$;

drop trigger if exists supplier_payments_emit_cash on public.supplier_payments;
create trigger supplier_payments_emit_cash
  after insert on public.supplier_payments
  for each row execute function public.supplier_payments_emit_cash_entry();

-- ── 3. Bù 20 lượt trả đã có từ trước ───────────────────────────────────────
-- Toàn bộ 20 lượt hiện thuộc tiệm MẪU (đã đo: 6/6 tiệm đều `is_sample = true`,
-- không tiệm thật nào) — nên bù được mà không đụng sổ sách của ai. Nếu sau này
-- chạy lại trên dữ liệu có tiệm thật, chỉ mục duy nhất ở trên chặn nhân đôi.
--
-- CỐ Ý bỏ qua những lượt đã có sẵn một dòng quỹ khớp tiệm + khớp số tiền +
-- đúng loại `supplier_payment`: đó nhiều khả năng là cùng một khoản đã ghi tay,
-- và cộng thêm lần nữa là biến một lỗ ghi thiếu thành một lỗ ghi thừa.
insert into public.cash_entries
    (tenant_id, direction, amount_vnd, fund, category, supplier_payment_id, note, recorded_by, created_at)
select sp.tenant_id, 'out', sp.amount_vnd,
       case when sp.payment_method = 'cash' then 'cash' else 'bank' end,
       'supplier_payment', sp.id, sp.note, sp.recorded_by, sp.paid_at
  from public.supplier_payments sp
 where not exists (
         select 1 from public.cash_entries ce
          where ce.supplier_payment_id = sp.id)
   and not exists (
         select 1 from public.cash_entries ce
          where ce.tenant_id = sp.tenant_id
            and ce.direction = 'out'
            and ce.category = 'supplier_payment'
            and ce.supplier_payment_id is null
            and ce.amount_vnd = sp.amount_vnd);

comment on column public.cash_entries.supplier_payment_id is
  'Nối tới lượt trả nhà cung cấp đã sinh ra dòng chi này (#296). Đối xứng với order_payment_id ở chiều thu.';
comment on function public.supplier_payments_emit_cash_entry() is
  'Trả tiền nhà cung cấp là TRỪ quỹ. Trigger chứ không phải lệnh ở màn hình, để không đường ghi nào lọt — xem #296.';

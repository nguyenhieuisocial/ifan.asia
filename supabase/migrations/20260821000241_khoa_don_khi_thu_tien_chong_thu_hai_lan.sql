-- ═══════════════════════════════════════════════════════════════════════════
-- LỖ TIỀN: hai máy thu cùng một đơn cùng lúc → thu vượt, sổ quỹ phồng lên
-- ───────────────────────────────────────────────────────────────────────────
-- ĐO ĐƯỢC (rà 21/08): `order_payments_guard` (#206) đọc `sum(amount_vnd)` từ
-- chính `order_payments` để biết đã thu bao nhiêu, RỒI mới quyết cho ghi hay
-- chặn — nhưng KHÔNG khoá gì cả. Postgres mặc định READ COMMITTED: hai giao
-- dịch chạy song song đều thấy "đã thu 0đ", đều thấy chưa vượt, đều được ghi.
--
-- KỊCH BẢN THẬT: đơn 500.000đ. Hai nhân viên mở cùng một đơn trên hai máy,
-- cùng bấm "Đã nhận tiền" 500.000đ trong cùng khoảnh khắc → cả hai lọt chốt →
-- trigger `order_payments_emit_cash_entry` bắn hai lần → SỔ QUỸ GHI 1.000.000đ
-- cho đơn 500.000đ. Cuối ca, màn Két sắt báo tiền mặt phải có NHIỀU HƠN ngăn
-- kéo thật 500.000đ, và người bị nghi ăn bớt là nhân viên.
--
-- VÌ SAO CÁC CHỐT KHÁC KHÔNG ĐỠ:
--   · `disabled={pending}` ở giao diện chỉ chặn một người bấm hai lần trên MỘT
--     máy — không biết gì về máy thứ hai.
--   · Chỉ mục chống trùng `order_payments_idem (provider, provider_ref)` không
--     đụng: thu tay sinh `provider_ref = gen_random_uuid()` mỗi lần, hai lần
--     thu là hai mã khác nhau nên không bao giờ trùng (cố ý, ghi ở actions.ts).
--
-- BẢN VÁ: khoá DÒNG ĐƠN HÀNG (`select ... for update`) trước khi đếm. Hai giao
-- dịch cùng đơn buộc phải xếp hàng: người sau đọc được số người trước vừa ghi
-- và bị chặn đúng lúc. Khoá đặt ở `orders` chứ không ở `order_payments` vì đó
-- là thứ CÓ SẴN MỘT DÒNG để khoá — khoá trên bảng thu tiền không chặn được hai
-- lệnh chèn dòng MỚI (không có dòng nào để giành).
--
-- Khuôn này kho ĐÃ DÙNG cho `voucher_apply` (#200) và `loyalty_redeem`, kèm
-- đúng lời giải thích "hai quầy cùng gõ một mã — kiểm ở tầng web không đỡ
-- được". Đường TIỀN MẶT bị sót lại. Nay vá cho khớp.
--
-- Chỉ CREATE OR REPLACE FUNCTION — KHÔNG đụng cấu trúc bảng nóng nào.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.order_payments_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_total bigint;
  v_paid bigint;
  v_status text;
begin
  -- `for update`: xếp hàng mọi lệnh thu trên CÙNG một đơn. Đây là dòng làm nên
  -- bản vá — bỏ nó đi là mở lại lỗ thu hai lần. Cũng chặn luôn ca "một người
  -- huỷ đơn trong khi người kia đang thu": lệnh huỷ phải chờ hoặc bị thấy.
  select status into v_status
    from public.orders
   where id = new.order_id and tenant_id = new.tenant_id
   for update;

  if v_status = 'cancelled' then
    raise exception 'order_cancelled: đơn % đã huỷ — không thu tiền vào đơn đã huỷ; trả lại tiền thì tạo phiếu hoàn',
      new.order_id
      using errcode = '23514';
  end if;

  -- #206: `line_total_vnd` thay cho `qty * unit_price_vnd - discount_vnd`.
  select coalesce(sum(line_total_vnd), 0) into v_total
    from public.order_lines where order_id = new.order_id;
  select coalesce(sum(amount_vnd), 0) into v_paid
    from public.order_payments where order_id = new.order_id;
  if v_paid + new.amount_vnd > v_total then
    raise exception 'payment_exceeds_order_total: đơn % tổng %đ, đã thu %đ, thu thêm %đ sẽ vượt',
      new.order_id, v_total, v_paid, new.amount_vnd
      using errcode = '23514';
  end if;
  return new;
end $$;

comment on function public.order_payments_guard() is
  'Chot chan truoc khi ghi mot khoan thu: KHOA DONG DON (for update, #241) roi moi dem — hai may thu cung mot don cung luc bi xep hang thay vi cung lot. Don da huy thi khong thu (#204). Tong thu khong vuot tong don, doc `order_lines.line_total_vnd` (#206).';

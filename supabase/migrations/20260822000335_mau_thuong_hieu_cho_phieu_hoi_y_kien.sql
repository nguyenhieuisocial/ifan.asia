-- ════════════════════════════════════════════════════════════════════
-- #335 — MÀU THƯƠNG HIỆU CHO PHIẾU HỎI Ý KIẾN
-- ════════════════════════════════════════════════════════════════════
-- Phiếu hỏi ý kiến (`/survey/<mã>`) là trang KHÁCH CỦA TIỆM nhận sau khi dùng
-- dịch vụ, nên nó phải mang màu của tiệm như trang mặt tiền — nếu không thì
-- cùng một tiệm gửi cho khách hai trang hai màu khác nhau.
--
-- Hàm này đã sẵn `join public.tenants`, nên chỉ thêm ĐÚNG MỘT trường. Giữ
-- nguyên toàn bộ phần còn lại — không đụng gì tới `token`, `submitted_at`.
--
-- ⚠️ Trả MÃ MÀU, không trả mã hex — cùng lý do với #334: hex thì lách được
--   bảng tám màu đã đo tương phản.

create or replace function public.get_survey_info(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'shop_name',         t.name,
    'item_name',         i.name,
    'already_submitted', s.submitted_at is not null,
    'rating',            s.rating,
    'mau',               t.mau_thuong_hieu
  )
  into v_result
  from public.satisfaction_surveys s
  join public.appointments a on a.id = s.appointment_id
  join public.tenants      t on t.id = s.tenant_id
  left join public.items   i on i.id = a.item_id
  where s.token = p_token
  limit 1;

  return v_result;  -- null nếu token không tồn tại
end;
$function$;

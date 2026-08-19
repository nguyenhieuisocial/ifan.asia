-- V6 integrations — nút "Thử lại ngay" phải THẬT SỰ chạm được hàng đợi.
--
-- LỖI: `webhook_deliveries` bật RLS và CHỈ có policy SELECT (ghi là việc của
-- worker chạy service role — đúng chủ đích). Nhưng màn hình lại có nút "Thử lại
-- ngay" gọi UPDATE lên bảng đó ⇒ chạm 0 dòng và KHÔNG báo lỗi. Nút bấm được,
-- nhìn như đã làm gì đó, nhưng hàng đợi không nhúc nhích.
--
-- Đây đúng lớp "hỏng trong im lặng" mà cả ngày hôm nay đi vá. Chữa bằng RPC
-- security-definer TỰ KIỂM tiệm và vai, thay vì mở một policy UPDATE rộng —
-- policy rộng thì bất kỳ chỗ nào khác cũng ghi thẳng vào hàng đợi được.
create or replace function public.webhook_gui_lai(p_endpoint_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role   text := (select public.app_role());
  v_n      integer;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  -- Khớp RLS webhook_endpoints_manage: đường báo là cấu hình hạ tầng của tiệm.
  if v_role not in ('owner', 'admin') then raise exception 'forbidden'; end if;

  -- Lọc theo tiệm NGAY TRONG câu điều kiện: hàm definer bỏ qua RLS, nên thiếu
  -- dòng này là chủ tiệm A đẩy được hàng đợi của tiệm B (bài học #175/#177).
  if not exists (select 1 from public.webhook_endpoints
                  where id = p_endpoint_id and tenant_id = v_tenant) then
    raise exception 'endpoint_not_found';
  end if;

  update public.webhook_deliveries
     set next_attempt_at = now(), claimed_at = null
   where endpoint_id = p_endpoint_id
     and tenant_id = v_tenant
     and status = 'pending';
  get diagnostics v_n = row_count;

  -- Cho đường báo một cơ hội sạch: người dùng bấm "Thử lại" thường là vì họ VỪA
  -- sửa xong bên nhận. Giữ nguyên bộ đếm hỏng cũ thì nó vẫn đang bị coi là chết.
  update public.webhook_endpoints
     set consecutive_failures = 0, last_error = null, last_error_at = null
   where id = p_endpoint_id and tenant_id = v_tenant;

  return v_n;   -- số tin sẽ được gửi lại — màn hình nói ra con số này
end;
$$;
revoke execute on function public.webhook_gui_lai(uuid) from public, anon;
grant execute on function public.webhook_gui_lai(uuid) to authenticated;

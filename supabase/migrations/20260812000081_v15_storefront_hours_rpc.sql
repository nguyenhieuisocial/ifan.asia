-- ============================================================
-- iFan.asia — Migration #81: V1.5 — RPC thay nguyên bộ giờ mở cửa trong tuần
--
-- Màn Cài đặt → Kênh → Mặt tiền & giờ mở cửa (task #88, thẻ design man-cai-dat-
-- mat-tien.html) lưu CẢ TUẦN một lần ("Chép giờ T2 cho cả tuần", thêm/bớt khung
-- giờ) — xoá hết rồi ghi lại toàn bộ. Hai lệnh riêng (xoá, rồi thêm) từ tầng
-- web KHÔNG nguyên tử: mạng đứt giữa chừng để lại business_hours RỖNG mà màn
-- không biết để báo lại. business_storefront/closures vẫn dùng RLS trần (mỗi
-- lần chỉ 1 dòng, không cần bọc) — chỉ thao tác "thay cả tuần" mới cần hàm này.
-- ============================================================

create or replace function public.storefront_save_hours(p_hours jsonb)
returns void
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text := public.app_role();
  v_row jsonb;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role is null or v_role not in ('owner','admin','manager') then
    raise exception 'forbidden';
  end if;
  if jsonb_array_length(coalesce(p_hours, '[]'::jsonb)) > 30 then
    raise exception 'too_many_rows';
  end if;

  delete from public.business_hours where tenant_id = v_tenant;
  for v_row in select * from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb))
  loop
    insert into public.business_hours (tenant_id, weekday, is_closed, open_time, close_time)
      values (
        v_tenant,
        (v_row ->> 'weekday')::smallint,
        coalesce((v_row ->> 'is_closed')::boolean, false),
        nullif(v_row ->> 'open_time', '')::time,
        nullif(v_row ->> 'close_time', '')::time
      );
  end loop;
end $$;
revoke execute on function public.storefront_save_hours(jsonb) from public, anon;
grant execute on function public.storefront_save_hours(jsonb) to authenticated;

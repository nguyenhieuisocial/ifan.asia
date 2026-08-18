-- Việc #172 — vai "Chỉ xem" ĐANG GẮN/GỠ ĐƯỢC NHÃN cho khách.
--
-- Đo 18/08 trên CSDL thật (đóng đúng vai qua request.jwt.claims, tenant mẫu
-- demo-spa-huong-sen): viewer chèn được vào `contact_tags` — GẮN ĐƯỢC.
-- Phát hiện khi vá #170/#171 (agent làm sâu thẻ Hồ sơ khách): `contact_tags_all`
-- (migration #4) là MỘT policy `for all`, chỉ xét cùng tiệm, không xét vai —
-- cùng lớp lỗ đã vá cho messages/conversations (việc #170).
--
-- Vì sao TÁCH policy thay vì thêm điều kiện thẳng vào `contact_tags_all`:
-- `contact_tags` còn được ĐỌC (SELECT) để lọc danh sách khách theo nhãn
-- (app/app/contacts/queries.ts) — kể cả vai Chỉ xem của tiệm mẫu (khách bấm
-- "Xem demo nhanh") cần đọc được để lọc/xem nhãn trên hồ sơ. Nếu thêm điều
-- kiện vai vào policy `for all` thì chặn LUÔN cả đọc — làm gãy tính năng lọc
-- theo nhãn cho vai Chỉ xem, một hồi quy không ai muốn. Tách SELECT (giữ
-- nguyên, chỉ xét cùng tiệm) khỏi ghi (thêm điều kiện vai).

drop policy if exists contact_tags_all on public.contact_tags;

create policy contact_tags_select on public.contact_tags for select
  using (tenant_id = (select public.current_tenant_id()));

-- Postgres không cho gộp nhiều lệnh khác SELECT vào một `for` — 3 policy riêng,
-- cùng một điều kiện.
create policy contact_tags_insert on public.contact_tags for insert
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  );

create policy contact_tags_update on public.contact_tags for update
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  );

create policy contact_tags_delete on public.contact_tags for delete
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  );

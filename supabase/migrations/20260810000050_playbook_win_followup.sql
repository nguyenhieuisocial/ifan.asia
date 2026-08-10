-- ============================================================
-- iFan.asia — Migration #50: Playbook cài sẵn thứ 3 "Hỏi thăm sau khi chốt" (B11)
--
-- VÌ SAO: thắng deal xong không ai quay lại hỏi thăm là mất khách quay vòng —
-- tiền lần sau nằm ở đó. Playbook thứ 3: deal.won → tự tạo việc "Hỏi thăm sau
-- 7 ngày" giao cho người phụ trách cơ hội. Tắt/bật được ở Cài đặt → Quy trình
-- y như 2 playbook cũ (nó chỉ là một hàng workflows với is_system = true).
--
-- CÁCH LÀM — cố ý CHỈ đụng vào MỘT hàm:
--   1) Re-create wf_seed_playbooks(): chép NGUYÊN VĂN bản mới nhất (#32 —
--      KHÔNG phải bản gốc #15, câu chữ 2 playbook cũ đã đổi ở #32) + thêm mục
--      thứ 3. create_tenant (bản mới nhất #41) và ensure_workflow_playbooks
--      (#15) đều gọi hàm này ⇒ tenant MỚI lẫn seed on-demand tự có playbook
--      mới, KHÔNG cần re-create 2 hàm đó (mỗi lần chép lại là một cơ hội đè
--      mất bản mới nhất — regression đã dính 2 lần).
--   2) Backfill tenant HIỆN CÓ: gọi wf_seed_playbooks cho từng tenant.
--      on conflict (tenant_id, key) do nothing ⇒ 2 playbook cũ giữ nguyên
--      (kể cả tên/trạng thái tenant đã tự sửa), chỉ chèn thêm hàng mới.
--
-- Nội dung playbook là DỮ LIỆU của tenant → tiếng Việt (quy ước #15/#32,
-- cùng luật với lost_reasons/lead_sources). KHÔNG đi qua hệ đa ngữ giao diện.
-- "create or replace" GHI ĐÈ proconfig → ghim lại search_path = public, pg_temp (#40).
-- ============================================================

create or replace function public.wf_seed_playbooks(p_tenant uuid) returns void
language plpgsql
security definer set search_path = public, pg_temp as $$
begin
  if p_tenant is null then
    return;
  end if;

  insert into public.workflows
    (tenant_id, key, name, description, trigger_event, conditions, actions, is_system)
  values
    (p_tenant, 'lead_intake',
     'Tiếp nhận khách mới',
     'Có khách mới thì tạo ngay việc gọi trong 2 giờ và báo cho người phụ trách.',
     'contact.created',
     '{}'::jsonb,
     jsonb_build_array(
       jsonb_build_object(
         'type', 'create_task',
         'subject', 'Gọi khách mới trong 2 giờ',
         'body', 'Khách {{aggregate.full_name}} vừa được thêm vào hệ thống.',
         'due_in', '2 hours',
         'assign_to', 'owner'),
       jsonb_build_object(
         'type', 'notify',
         'title', 'Khách mới cần gọi',
         'body', '{{aggregate.full_name}} vừa vào hệ thống — gọi trong 2 giờ.',
         'link', '/app/contacts/{{aggregate.id}}',
         'to', 'owner')),
     true),
    (p_tenant, 'followup_357',
     'Nhắc chăm sóc lại theo lịch 3-5-7',
     'Cơ hội mới sẽ có 3 việc chăm sóc vào ngày thứ 3, 5 và 7 để khách không bị quên.',
     'deal.created',
     '{}'::jsonb,
     jsonb_build_array(
       jsonb_build_object(
         'type', 'create_task',
         'subject', 'Chăm sóc lần 1 — ngày thứ 3',
         'body', 'Lịch chăm sóc 3-5-7: chạm lại cơ hội {{aggregate.title}} lần đầu.',
         'due_in', '3 days',
         'assign_to', 'owner'),
       jsonb_build_object(
         'type', 'create_task',
         'subject', 'Chăm sóc lần 2 — ngày thứ 5',
         'body', 'Lịch chăm sóc 3-5-7: chạm lại cơ hội {{aggregate.title}} lần hai.',
         'due_in', '5 days',
         'assign_to', 'owner'),
       jsonb_build_object(
         'type', 'create_task',
         'subject', 'Chăm sóc lần 3 — ngày thứ 7',
         'body', 'Lịch chăm sóc 3-5-7: chạm lại cơ hội {{aggregate.title}} lần ba.',
         'due_in', '7 days',
         'assign_to', 'owner')),
     true),
    -- #50: thắng xong phải có hẹn quay lại — khách đã mua là khách dễ mua tiếp nhất
    (p_tenant, 'win_followup',
     'Hỏi thăm sau khi chốt',
     'Chốt thắng cơ hội thì tự tạo việc hỏi thăm khách sau 7 ngày cho người phụ trách.',
     'deal.won',
     '{}'::jsonb,
     jsonb_build_array(
       jsonb_build_object(
         'type', 'create_task',
         'subject', 'Hỏi thăm sau 7 ngày',
         'body', 'Khách vừa chốt cơ hội {{aggregate.title}} — hỏi thăm xem khách dùng có ổn không, sẵn dịp gợi mở lần mua sau.',
         'due_in', '7 days',
         'assign_to', 'owner')),
     true)
  on conflict (tenant_id, key) where key is not null do nothing;
end $$;

-- create or replace giữ nguyên quyền cũ; nhắc lại cho rõ (chuẩn #15/#32)
revoke execute on function public.wf_seed_playbooks from public, anon, authenticated;

-- ---------- Backfill: tenant hiện có nhận playbook mới ngay ----------
-- Không chờ ai mở màn Cài đặt → Quy trình (ensure_workflow_playbooks) mới có:
-- deal.won xảy ra ở màn Cơ hội, tenant có thể thắng deal mà chưa từng mở màn kia.
do $$
declare v_tenant uuid;
begin
  for v_tenant in select id from public.tenants loop
    perform public.wf_seed_playbooks(v_tenant);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- CHĂM SÓC SAU BUỔI HẸN VÀ SAU ĐƠN HÀNG — nối một đường đã có sẵn
-- ════════════════════════════════════════════════════════════════════
--
-- Thẻ thiết kế: `man-lo-hong-cham-soc`.
--
-- ⚠️ ĐÂY LÀ BỔ SUNG, KHÔNG DỰNG LẠI (luật founder chốt 13/08). Kiểm trước khi
--   làm, và phép kiểm cứu được một lần dựng lại thứ đã có:
--     · sự kiện `appointment.done`, `order.completed` — ĐÃ CÓ
--     · hành động tạo việc có hạn — ĐÃ CÓ
--     · quy trình mẫu 3-5-7 (`followup_357`) — ĐÃ CÓ
--   Thứ THẬT SỰ thiếu: chuỗi 3-5-7 chỉ chạy khi TẠO CƠ HỘI BÁN HÀNG, và máy
--   không tạo được việc từ buổi hẹn / đơn hàng.
--
-- ⚠️ HAI QUY TRÌNH MỚI ĐỂ TẮT SẴN. Bật hết cho mọi tiệm thì một tiệm đông khách
--   sẽ đẻ ra ba việc cho MỖI lượt khách — chôn vùi mọi việc khác. Chủ tiệm tự
--   bật khi muốn; thẻ thiết kế vẽ đúng nút đó ở trạng thái "chưa bật".
--
-- ⚠️ MÁY KHÔNG TỰ NHẮN CHO KHÁCH. Chỉ tạo VIỆC cho người phụ trách. iFan chưa
--   có đường gửi tin hàng loạt tới khách (Zalo OA còn chờ duyệt), và sổ sự thật
--   đã ghi thành luật: chưa có đường giao thì không được hứa là đã gửi.

CREATE OR REPLACE FUNCTION public.wf_exec_action(p_tenant uuid, p_action jsonb, p_event jsonb, p_agg jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_type text := p_action ->> 'type';
  v_agg_type text := p_event ->> 'aggregate_type';
  v_contact uuid;
  v_deal uuid;
  v_user uuid;
  v_due interval;
  v_tier text;
begin
  if v_agg_type = 'contact' then
    v_contact := (p_event ->> 'aggregate_id')::uuid;
  elsif v_agg_type = 'deal' then
    v_deal := (p_event ->> 'aggregate_id')::uuid;
    v_contact := nullif(p_agg ->> 'contact_id', '')::uuid;
  elsif v_agg_type in ('appointment', 'order') then
    -- ⚠️ THÊM 22/08. Trước đó buổi hẹn và đơn hàng KHÔNG suy ra được đích, nên
    --   mọi quy trình tự động chạy sau chúng chỉ gửi được thông báo, KHÔNG tạo
    --   được việc — `wf_task_needs_target`.
    --
    --   Hệ quả thật: chuỗi chăm sóc 3-5-7 chỉ chạy được sau khi TẠO CƠ HỘI BÁN
    --   HÀNG. Với spa và phòng khám thì lúc cần chăm là SAU BUỔI DỊCH VỤ — đúng
    --   lúc máy không làm gì được. Nghiên cứu trong vault gọi chuỗi này là thứ
    --   đáng giá nhất học được từ SCRM Trung Quốc, và nó đang chạy sai chỗ.
    --
    --   Cả hai bảng vốn ĐÃ CÓ `contact_id` trong dữ liệu sự kiện; chỉ là chưa
    --   ai nối. Không thêm bảng, không thêm cột — nối một đường đã có sẵn.
    --
    -- ⚠️ Buổi hẹn hoặc đơn KHÔNG gắn khách (khách vãng lai) thì `v_contact` vẫn
    --   null ⇒ `create_task` vẫn ném `wf_task_needs_target` như cũ. Đúng: không
    --   có khách thì không có ai để chăm, và tạo một việc trỏ vào hư không thì
    --   tệ hơn là không tạo.
    v_contact := nullif(p_agg ->> 'contact_id', '')::uuid;
  end if;

  if v_type = 'create_task' then
    if v_contact is null and v_deal is null then
      raise exception 'wf_task_needs_target';
    end if;
    v_user := public.wf_resolve_user(p_tenant, p_action ->> 'assign_to', p_agg);
    begin
      v_due := coalesce(nullif(p_action ->> 'due_in', ''), '0 minutes')::interval;
    exception when others then
      raise exception 'wf_bad_due_in: %', coalesce(p_action ->> 'due_in', '(null)');
    end;
    insert into public.activities
      (tenant_id, type, subject, body, contact_id, deal_id, owner_id, due_at)
    values
      (p_tenant, 'task',
       left(coalesce(public.wf_render(p_action ->> 'subject', p_event, p_agg), 'Việc tự động'), 200),
       public.wf_render(p_action ->> 'body', p_event, p_agg),
       v_contact, v_deal, v_user, now() + v_due);

  elsif v_type = 'notify' then
    v_user := public.wf_resolve_user(p_tenant, p_action ->> 'to', p_agg);
    insert into public.notifications (tenant_id, user_id, type, title, body, link)
    values
      (p_tenant, v_user, 'workflow',
       left(coalesce(public.wf_render(p_action ->> 'title', p_event, p_agg), 'Thông báo quy trình'), 200),
       public.wf_render(p_action ->> 'body', p_event, p_agg),
       public.wf_render(p_action ->> 'link', p_event, p_agg));

  elsif v_type = 'set_tier' then
    if v_contact is null then
      raise exception 'wf_set_tier_needs_contact';
    end if;
    v_tier := public.wf_render(p_action ->> 'tier', p_event, p_agg);
    update public.contacts set tier = v_tier
      where id = v_contact and tenant_id = p_tenant;

  elsif v_type = 'assign_owner' then
    v_user := public.wf_resolve_user(
      p_tenant, public.wf_render(p_action ->> 'to', p_event, p_agg), p_agg);
    if v_deal is not null then
      update public.deals set owner_id = v_user where id = v_deal and tenant_id = p_tenant;
    elsif v_contact is not null then
      update public.contacts set owner_id = v_user where id = v_contact and tenant_id = p_tenant;
    else
      raise exception 'wf_assign_needs_target';
    end if;

  else
    raise exception 'wf_unknown_action: %', coalesce(v_type, '(null)');
  end if;
end $function$;



-- ── MÁY PHẢI BIẾT ĐỌC BUỔI HẸN VÀ ĐƠN HÀNG ───────────────────────────
-- Nửa còn lại của cùng một lỗ. Không có phần này thì nhánh vừa thêm ở trên vô
-- dụng: nó tìm `contact_id` trong dữ liệu buổi hẹn, mà dữ liệu đó luôn rỗng.
CREATE OR REPLACE FUNCTION public.wf_aggregate(p_type text, p_id text, p_tenant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v jsonb;
begin
  if p_type = 'contact' then
    select to_jsonb(c) into v from public.contacts c
      where c.id = p_id::uuid and c.tenant_id = p_tenant;
  elsif p_type = 'deal' then
    select to_jsonb(d) into v from public.deals d
      where d.id = p_id::uuid and d.tenant_id = p_tenant;
  elsif p_type = 'company' then
    select to_jsonb(co) into v from public.companies co
      where co.id = p_id::uuid and co.tenant_id = p_tenant;
  elsif p_type = 'appointment' then
    -- ⚠️ THÊM 22/08. Trước đó hàm này chỉ biết đọc khách / cơ hội / công ty; gặp
    --   buổi hẹn hay đơn hàng thì trả về `{}` rỗng. Hệ quả IM LẶNG: mọi quy
    --   trình tự động gắn vào `appointment.*` và `order.*` đều chạy với dữ liệu
    --   rỗng — điều kiện nào cũng không khớp, và không có đích để tạo việc.
    --   Không lỗi, không cảnh báo; chỉ là quy trình bật rồi mà chẳng bao giờ chạy.
    select to_jsonb(ap) into v from public.appointments ap
      where ap.id = p_id::uuid and ap.tenant_id = p_tenant;
  elsif p_type = 'order' then
    select to_jsonb(o) into v from public.orders o
      where o.id = p_id::uuid and o.tenant_id = p_tenant;
  end if;
  return coalesce(v, '{}'::jsonb);
exception when others then
  return '{}'::jsonb;
end $function$;


-- ── HAI QUY TRÌNH MẪU MỚI, ĐỂ TẮT SẴN ────────────────────────────────
-- Gieo cho MỌI tiệm đang có, và thêm vào hàm gieo để tiệm mới cũng có.
-- `is_active = false`: xem lý do ở đầu file.
insert into public.workflows
  (tenant_id, key, name, description, trigger_event, conditions, actions, is_system, is_active)
select t.id, 'cham_sau_buoi_hen',
  'Chăm sóc sau buổi hẹn (3-5-7)',
  'Khách làm dịch vụ xong thì tự tạo 3 việc hỏi thăm vào ngày thứ 3, 5 và 7. Máy KHÔNG tự nhắn cho khách — chỉ nhắc người phụ trách.',
  'appointment.done', '{}'::jsonb,
  jsonb_build_array(
    jsonb_build_object('type','create_task','subject','Hỏi thăm sau buổi — ngày thứ 3',
      'body','Khách vừa làm dịch vụ xong 3 ngày trước. Hỏi thăm xem có ổn không, và mời hẹn tiếp nếu hợp.',
      'due_in','3 days','assign_to','owner'),
    jsonb_build_object('type','create_task','subject','Hỏi thăm sau buổi — ngày thứ 5',
      'body','Lần chạm thứ hai. Nếu lần trước khách chưa trả lời thì đừng lặp lại y nguyên câu cũ.',
      'due_in','5 days','assign_to','owner'),
    jsonb_build_object('type','create_task','subject','Mời quay lại — ngày thứ 7',
      'body','Lần chạm cuối của chuỗi. Sau lần này thì thôi, đừng đeo bám.',
      'due_in','7 days','assign_to','owner')),
  true, false
from public.tenants t
-- Chỉ mục duy nhất của bảng này CÓ ĐIỀU KIỆN (`where key is not null`),
-- nên `on conflict` phải chép đúng điều kiện đó vào, không thì Postgres báo
-- 42P10. Cùng cái bẫy đã dính ở bộ gieo tiệm mẫu sáng nay.
on conflict (tenant_id, key) where key is not null do nothing;

insert into public.workflows
  (tenant_id, key, name, description, trigger_event, conditions, actions, is_system, is_active)
select t.id, 'cham_sau_don',
  'Chăm sóc sau đơn hàng (3-5-7)',
  'Đơn hoàn tất thì tự tạo 3 việc hỏi thăm vào ngày thứ 3, 5 và 7. Máy KHÔNG tự nhắn cho khách.',
  'order.completed', '{}'::jsonb,
  jsonb_build_array(
    jsonb_build_object('type','create_task','subject','Hỏi thăm sau mua — ngày thứ 3',
      'body','Khách nhận hàng được 3 ngày. Hỏi xem dùng có vừa ý không.',
      'due_in','3 days','assign_to','owner'),
    jsonb_build_object('type','create_task','subject','Hỏi thăm sau mua — ngày thứ 5',
      'body','Lần chạm thứ hai. Nếu khách đã trả lời rồi thì đóng việc này, đừng hỏi lại.',
      'due_in','5 days','assign_to','owner'),
    jsonb_build_object('type','create_task','subject','Mời mua lại — ngày thứ 7',
      'body','Lần chạm cuối của chuỗi. Sau lần này thì thôi.',
      'due_in','7 days','assign_to','owner')),
  true, false
from public.tenants t
-- Chỉ mục duy nhất của bảng này CÓ ĐIỀU KIỆN (`where key is not null`),
-- nên `on conflict` phải chép đúng điều kiện đó vào, không thì Postgres báo
-- 42P10. Cùng cái bẫy đã dính ở bộ gieo tiệm mẫu sáng nay.
on conflict (tenant_id, key) where key is not null do nothing;

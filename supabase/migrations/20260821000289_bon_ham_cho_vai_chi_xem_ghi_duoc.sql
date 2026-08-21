-- #289 — BỐN HÀM CHO VAI "CHỈ XEM" GHI ĐƯỢC, ĐÃ ĐO TRÊN CSDL THẬT.
--
-- ════════════════════════════════════════════════════════════════════
-- VÌ SAO ĐÂY LÀ LỖ THẬT, KHÔNG PHẢI LO XA
-- ════════════════════════════════════════════════════════════════════
--
-- Nút **"Xem demo nhanh"** trên trang đăng nhập là CÔNG KHAI, đưa người lạ vào
-- tiệm mẫu với vai `viewer`, mật khẩu in ngay dưới nút. Nghĩa là mọi chỗ vai
-- `viewer` ghi được đều là chỗ **người lạ ẩn danh ghi được**.
--
-- Tường RLS ở tầng BẢNG rất kín — đã đo, `viewer` ghi thẳng vào bảng thì bị
-- chặn 42501. Nhưng các hàm dưới đây là `security definer`: chúng chạy bằng
-- quyền của người TẠO hàm, nên tường bảng không áp. Và cả bốn đều **không có
-- một dòng chốt vai nào** trong thân hàm. Chúng được cấp `execute` cho
-- `authenticated`, và app gọi chúng bằng chính phiên đăng nhập của người dùng
-- (`supabase.rpc(...)`) — nên gọi thẳng được, không cần đi qua giao diện.
--
-- ════════════════════════════════════════════════════════════════════
-- ĐO ĐƯỢC — mỗi ca đặt claim vai `viewer` rồi `rollback`
-- ════════════════════════════════════════════════════════════════════
--   · `record_audit_log`  → record_audit 5.099 → 5.100. Sổ này chỉ chủ tiệm
--     đọc. Người lạ **bịa được dòng nhật ký** "ai đã tải dữ liệu của tiệm".
--   · `increment_usage`   → usage_counters +1, mỗi lượt cộng được tới 100.
--     Gọi lặp là **đẩy hạn mức tiệm chạm trần**, khoá việc thật của người thật.
--   · `emit_event`        → domain_events 20.954 → 20.955. Bơm được **sự kiện
--     giả** tuỳ ý loại và nội dung vào luồng chạy webhook + tự động hoá.
--   · `ensure_sla_policies` → sla_policies 0 → 3. Màn SLA chỉ mở cho chủ/quản
--     trị, nhưng hàm thì ai gọi cũng được.
--
-- ĐỐI CHỨNG đã chạy: cùng vai đó ghi THẲNG vào các bảng ấy thì bị chặn 42501.
-- Tức hàm chính là đường vòng, không phải RLS hỏng.
--
-- ⚠️ Hai hàm khác bị nghi cùng lỗi (`ensure_workflow_playbooks`,
-- `ensure_deal_defaults`) đo ra **KHÔNG ghi được** — nhưng chặn chúng lại là
-- một cái trigger và một khoá ngoại, **không phải chốt vai**. Vẫn vá
-- `ensure_workflow_playbooks` ở đây: dựa vào một chốt tình cờ là dựa vào thứ
-- có thể bị gỡ mà không ai nhớ vì sao nó ở đó.
--
-- ════════════════════════════════════════════════════════════════════
-- VÌ SAO CHẶN BẰNG `<> 'viewer'` CHỨ KHÔNG PHẢI DANH SÁCH VAI TRẮNG
-- ════════════════════════════════════════════════════════════════════
--
-- Ba hàm đầu được gọi ở rất nhiều chỗ, kể cả **từ trigger và từ việc chạy nền
-- bằng khoá dịch vụ**. Trong ngữ cảnh đó `app_role()` trả về `null`, không
-- phải một vai. Nếu dùng danh sách trắng (`in ('owner','admin',…)`) thì `null`
-- rớt ra ngoài và **mọi việc nền gãy im lặng** — đổi một lỗ bảo mật lấy một
-- đám lỗi vận hành khó tìm hơn hẳn.
--
-- Nên: chặn ĐÚNG cái phải chặn. `null` (máy chủ) lọt, `viewer` bị chặn.
-- Riêng hai hàm `ensure_*` thì dùng danh sách trắng được, vì chúng chỉ được
-- gọi từ đúng một màn có người ngồi trước, không có đường nền nào gọi.

-- ── 1. Ghi nhật ký ─────────────────────────────────────────────────────────
create or replace function public.record_audit_log(
  p_entity_type text, p_entity_id uuid, p_action text, p_diff jsonb default null
) returns void
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  -- Vai chỉ-xem không có hành động nào cần ghi sổ. Nếu nó ghi được thì sổ
  -- không còn là bằng chứng nữa — nó thành chỗ ai cũng viết vào được.
  if (select public.app_role()) = 'viewer' then raise exception 'forbidden'; end if;
  insert into public.record_audit (tenant_id, entity_type, entity_id, actor_id, action, diff)
    values (v_tenant, p_entity_type, p_entity_id, auth.uid(), p_action, p_diff);
end;
$$;
revoke execute on function public.record_audit_log(text, uuid, text, jsonb) from public, anon;
grant execute on function public.record_audit_log(text, uuid, text, jsonb) to authenticated;

-- ── 2. Đếm hạn mức ─────────────────────────────────────────────────────────
create or replace function public.increment_usage(p_metric text, p_amount bigint default 1)
returns bigint
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_period text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM');
  v_used bigint;
  v_limit bigint;
begin
  if p_amount is null or p_amount < 1 or p_amount > 100 then
    raise exception 'invalid_amount';
  end if;
  if p_metric is null or p_metric !~ '^[a-z_]{1,50}$' then
    raise exception 'invalid_metric';
  end if;
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  -- Chốt chống PHÁ HOẠI, không phải chống nhầm lẫn: đẩy trần lên là khoá việc
  -- của tất cả mọi người trong tiệm, và người gây ra không mất gì.
  if (select public.app_role()) = 'viewer' then raise exception 'forbidden'; end if;

  insert into public.usage_counters as uc (tenant_id, metric, period, used, limit_value)
    values (v_tenant, p_metric, v_period, p_amount, public.plan_limit(v_tenant, p_metric))
  on conflict (tenant_id, metric, period) do update
    set used = uc.used + excluded.used,
        limit_value = coalesce(uc.limit_value, excluded.limit_value)
  returning uc.used, uc.limit_value into v_used, v_limit;

  if v_limit is not null and v_used > v_limit then
    raise exception 'quota_exceeded';
  end if;
  return v_used;
end;
$$;
revoke execute on function public.increment_usage(text, bigint) from public, anon;
grant execute on function public.increment_usage(text, bigint) to authenticated;

-- ── 3. Phát sự kiện ────────────────────────────────────────────────────────
create or replace function public.emit_event(
  p_event_type text, p_aggregate_type text, p_aggregate_id text,
  p_payload jsonb default '{}'::jsonb, p_source_module text default null,
  p_dedupe_key text default null
) returns bigint
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare v_id bigint;
begin
  if public.current_tenant_id() is null then
    raise exception 'no_tenant_context';
  end if;
  -- Sự kiện là thứ chạy webhook ra ngoài và kích hoạt tự động hoá. Cho vai
  -- chỉ-xem bơm vào đây nghĩa là cho người lạ điều khiển hệ tự động của tiệm.
  if (select public.app_role()) = 'viewer' then raise exception 'forbidden'; end if;
  insert into public.domain_events
    (tenant_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, source_module, dedupe_key)
  values
    (public.current_tenant_id(), p_event_type, p_aggregate_type, p_aggregate_id,
     p_payload, auth.uid(), p_source_module, p_dedupe_key)
  on conflict (tenant_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.emit_event(text, text, text, jsonb, text, text) from public, anon;
grant execute on function public.emit_event(text, text, text, jsonb, text, text) to authenticated;

-- ── 4. Hai hàm gieo mặc định ───────────────────────────────────────────────
create or replace function public.ensure_sla_policies()
returns void
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if (select public.app_role()) not in ('owner', 'admin') then raise exception 'forbidden'; end if;
  -- Hai tab mở cùng lúc không được gieo hai lần
  perform pg_advisory_xact_lock(hashtext('ensure_sla_policies:' || v_tenant::text));
  perform public.sla_seed_policies(v_tenant);
end $$;

create or replace function public.ensure_workflow_playbooks()
returns void
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if (select public.app_role()) not in ('owner', 'admin') then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtext('ensure_workflow_playbooks:' || v_tenant::text));
  perform public.wf_seed_playbooks(v_tenant);
end $$;

comment on function public.record_audit_log(text, uuid, text, jsonb) is
  'Đường ghi nhật ký DUY NHẤT. Chặn vai chỉ-xem từ #289 — người lạ vào bằng nút Xem demo nhanh bịa được dòng sổ.';
comment on function public.increment_usage(text, bigint) is
  'Đếm hạn mức theo tháng. Chặn vai chỉ-xem từ #289 — gọi lặp là đẩy trần, khoá việc cả tiệm.';
comment on function public.emit_event(text, text, text, jsonb, text, text) is
  'Phát sự kiện vào luồng webhook + tự động hoá. Chặn vai chỉ-xem từ #289.';

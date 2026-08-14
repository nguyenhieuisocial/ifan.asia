-- Migration #123 — làm dày tin "tiệm mới đăng ký" cho founder (ADR-0007 mục 12b).
--
-- Founder (14/08): "Cần đầy đủ thông tin khách hàng kể cả IP, vị trí..."
--
-- ⚠️ Đây là NGƯỜI ĐĂNG KÝ iFan (chủ dữ liệu = iFan), KHÔNG PHẢI khách hàng
-- cuối của tiệm (chủ dữ liệu = tiệm). Mục 5 của chính ADR này cấm kèm dữ
-- liệu khách CUỐI vào tin chuông — cấm đó KHÔNG áp dụng ở đây. Xem bảng đối
-- chiếu đầy đủ ở ADR mục 12b trước khi đụng file này.
--
-- CÁI KHÓ: IP/thiết bị/nguồn đến chỉ có ở tầng Next.js (đọc header HTTP) —
-- trigger CSDL `tenants_notify_signup` (after insert on tenants) không thấy
-- được HTTP request. Không đưa qua cột bảng `tenants` (đó là dữ liệu nghiệp
-- vụ của tiệm, không phải log đăng ký) và không dựng bảng phụ (dữ liệu này
-- chỉ sống đúng một lần lúc tạo tiệm, không ai truy vấn lại theo thời gian).
--
-- CÁCH ĐÚNG — session var transaction-local `set_config(..., true)`: ĐÃ LÀ
-- quy ước sẵn có của dự án (xem `ifan.wf_depth` trong workflow engine,
-- `ifan.livechat_key` trong Live Chat) để truyền ngữ cảnh từ hàm gọi sang
-- trigger downstream trong CÙNG MỘT giao dịch, không phải phát minh mới.
--
-- Đường lui an toàn: mọi tham số mới đều optional (default null) và trigger
-- ĐỌC KHÔNG THẤY thì rơi về đúng câu cũ — mọi đường tạo tenant khác (test
-- script service-role, seed) vẫn chạy nguyên, không cần biết gì về việc này.

-- ── 1. create_tenant nhận thêm ngữ cảnh đăng ký (đều optional) ──────────────
--
-- ⚠️ `create or replace` KHÔNG thay được hàm có chữ ký khác — Postgres sẽ
-- tạo thêm một hàm CHỒNG (overload) cạnh bản 2 tham số cũ, và RPC gọi với
-- {p_name, p_slug} sẽ mơ hồ giữa hai hàm (PostgREST từ chối, không đoán hộ).
-- Phải DROP bản cũ trước, không được bỏ qua bước này.
drop function if exists public.create_tenant(text, text);

create or replace function public.create_tenant(
  p_name text,
  p_slug text,
  p_ip text default null,
  p_city text default null,
  p_region text default null,
  p_country text default null,
  p_user_agent text default null,
  p_referrer text default null
) returns uuid
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- Postgres đã có sẵn JWT của người đang tạo tiệm (security definer vẫn đọc
  -- được auth.uid()/auth.users vì hàm chạy quyền chủ hàm) — không cần Next.js
  -- truyền email riêng, tránh D1 (một địa chỉ khai một lần).
  select email into v_email from auth.users where id = auth.uid();

  -- Transaction-local — TỰ MẤT khi giao dịch kết thúc, không rò sang câu
  -- lệnh kế tiếp. true = phạm vi giao dịch (đúng khuôn ifan.wf_depth/livechat_key).
  perform set_config('ifan.signup_ctx', jsonb_build_object(
    'email', v_email, 'ip', p_ip, 'city', p_city, 'region', p_region,
    'country', p_country, 'user_agent', p_user_agent, 'referrer', p_referrer
  )::text, true);

  insert into public.tenants (name, slug, trial_ends_at)
    values (p_name, lower(p_slug), now() + interval '30 days')
    returning id into v_tenant;
  insert into public.tenant_members (tenant_id, user_id, role, joined_at)
    values (v_tenant, auth.uid(), 'owner', now());
  insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, source_module)
    values (v_tenant, 'tenant.created', 'tenant', v_tenant::text,
            jsonb_build_object('name', p_name, 'slug', lower(p_slug)), auth.uid(), 'platform');
  return v_tenant;
end $$;

grant execute on function public.create_tenant(text, text, text, text, text, text, text, text) to authenticated;
revoke execute on function public.create_tenant(text, text, text, text, text, text, text, text) from anon, public;

-- ── 2. Trigger đọc ngữ cảnh nếu có — KHÔNG THẤY thì rơi về câu cũ ───────────

create or replace function public.tenants_notify_signup()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_ctx jsonb;
  v_dong text := '';
begin
  if coalesce(new.is_sample, false) then return new; end if;

  begin
    v_ctx := nullif(current_setting('ifan.signup_ctx', true), '')::jsonb;
  exception when others then v_ctx := null; end;

  if v_ctx is not null then
    if v_ctx ->> 'email' is not null then
      v_dong := v_dong || E'\nNgười đăng ký: ' || (v_ctx ->> 'email');
    end if;
    if v_ctx ->> 'ip' is not null and v_ctx ->> 'ip' <> 'unknown' then
      v_dong := v_dong || E'\nIP: ' || (v_ctx ->> 'ip');
      if v_ctx ->> 'city' is not null or v_ctx ->> 'country' is not null then
        v_dong := v_dong || ' — ' ||
          concat_ws(', ', v_ctx ->> 'city', v_ctx ->> 'region', v_ctx ->> 'country');
      end if;
    end if;
    if v_ctx ->> 'user_agent' is not null then
      v_dong := v_dong || E'\nThiết bị: ' || left(v_ctx ->> 'user_agent', 120);
    end if;
    if v_ctx ->> 'referrer' is not null then
      v_dong := v_dong || E'\nNguồn: ' || left(v_ctx ->> 'referrer', 120);
    end if;
  end if;

  begin
    perform public.platform_notify(
      'tenant_signup',
      'tenant:' || new.id,
      '🎉 Tiệm mới đăng ký: ' || coalesce(new.name, '(chưa đặt tên)') ||
      case when new.slug is not null then E'\nĐịa chỉ: /t/' || new.slug else '' end ||
      case when new.industry is not null then E'\nNgành: ' || new.industry else '' end ||
      v_dong ||
      E'\n\n/admin'
    );
  exception when others then
    raise warning 'tenants_notify_signup bỏ qua lỗi: %', sqlerrm;
  end;

  return new;
end $$;

comment on function public.tenants_notify_signup() is
  'Migration #123 làm dày bằng ifan.signup_ctx (transaction-local, set bởi create_tenant) — KHÔNG lưu IP/thiết bị vào cột nào của bảng tenants. Chủ dữ liệu là iFan (người đăng ký), không phải khách hàng cuối của tiệm — xem ADR-0007 mục 12b trước khi đổi.';

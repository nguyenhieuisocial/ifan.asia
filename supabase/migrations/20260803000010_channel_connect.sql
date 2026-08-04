-- ============================================================
-- iFan.asia — Migration #10: Kết nối kênh Zalo OA (đợt 1 Omnichannel Inbox)
-- Spec: "02 Omnichannel Inbox" §4.1 (Settings → Kênh kết nối) + Bản thiết kế
-- §2.2 Pattern C: secret KHÔNG plaintext trong bảng — Supabase Vault, mọi
-- đường đọc/ghi token đi qua RPC security definer.
--
-- connect_zalo_channel()        -- owner/admin: tạo/cập nhật kênh + token vào Vault
-- get_zalo_channel_secrets()    -- CHỈ service_role: worker/adapter đọc token
-- update_zalo_channel_tokens()  -- CHỈ service_role: xoay token sau refresh OAuth
-- disconnect_zalo_channel()     -- owner/admin: xóa secret Vault + ngắt kênh
-- Unique toàn cục 1 OA ↔ 1 tenant: chặn tenant khác "cướp" OA đã kết nối
-- (lỗ hổng cross-tenant hijack mà audit đã cảnh báo).
-- Chuẩn: theo migration #4/#5 — text+check, timestamptz, definer set
--        search_path, revoke public trước khi grant đích danh.
-- ============================================================

-- ---------- channels: cột đợt 1 ----------

alter table public.channels
  add column if not exists connected_at timestamptz; -- lần kết nối thành công gần nhất

-- 1 OA chỉ thuộc đúng 1 tenant trên toàn hệ thống. disconnect_zalo_channel nhả
-- external_id (set null) nên OA đã ngắt kết nối được lại ở tenant khác; đồng
-- thời process_zalo_events (map sự kiện theo external_id, migration #5) không
-- bao giờ trúng kênh đã ngắt → webhook không lạc tenant. Race 2 tenant cùng
-- kết nối: index này là chốt chặn cuối, hàm bắt unique_violation bên dưới.
create unique index if not exists channels_zalo_oa_global_uidx
  on public.channels (external_id)
  where type = 'zalo_oa' and external_id is not null;

-- ---------- helper Vault (schema private — PostgREST không expose) ----------

-- Upsert secret theo tên. Chỉ gọi được từ các hàm definer bên dưới (không
-- grant cho role client nào). Tên secret namespaced: 'zalo:{channel_id}:access'.
create or replace function private.set_channel_secret(p_name text, p_value text)
returns void
language plpgsql
security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    perform vault.create_secret(p_value, p_name);
  else
    perform vault.update_secret(v_id, p_value);
  end if;
end $$;
revoke all on function private.set_channel_secret(text, text) from public;

-- ---------- connect_zalo_channel: owner/admin kết nối OA ----------

-- Đợt 1 nhập token thủ công từ màn Cài đặt (OAuth flow đợt 2 khi app Zalo được
-- duyệt). Token KHÔNG chạm bảng channels — đi thẳng vào Vault.
-- Thời hạn token theo tài liệu Zalo OAuth v4: access ~25 giờ, refresh ~3 tháng.
create or replace function public.connect_zalo_channel(
  p_oa_id text,
  p_access_token text,
  p_refresh_token text,
  p_oa_name text default null
) returns uuid
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text := public.app_role();
  v_oa text := btrim(p_oa_id);
  v_owner_tenant uuid;
  v_channel_id uuid;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'forbidden';
  end if;
  if v_oa is null or v_oa = ''
     or p_access_token is null or btrim(p_access_token) = ''
     or p_refresh_token is null or btrim(p_refresh_token) = '' then
    raise exception 'invalid_input';
  end if;

  -- OA đã được tenant khác kết nối → lỗi rõ ràng (không nuốt thành unique_violation)
  select tenant_id into v_owner_tenant
    from public.channels
    where type = 'zalo_oa' and external_id = v_oa
    limit 1;
  if v_owner_tenant is not null and v_owner_tenant is distinct from v_tenant then
    raise exception 'oa_already_connected';
  end if;

  -- Row của tenant hiện tại: ưu tiên đúng OA (xoay token), sau đó row đã ngắt
  -- (kết nối lại giữ nguyên channel_id → hội thoại cũ nối tiếp đúng kênh).
  select id into v_channel_id
    from public.channels
    where tenant_id = v_tenant and type = 'zalo_oa'
      and (external_id = v_oa or (external_id is null and status = 'disconnected'))
    order by (external_id = v_oa) desc nulls last, created_at
    limit 1;

  begin
    if v_channel_id is null then
      insert into public.channels
          (tenant_id, type, external_id, display_name, status, connected_at, token_expires_at)
        values
          (v_tenant, 'zalo_oa', v_oa, nullif(btrim(p_oa_name), ''), 'active',
           now(), now() + interval '25 hours')
        returning id into v_channel_id;
    else
      update public.channels
        set external_id = v_oa,
            display_name = coalesce(nullif(btrim(p_oa_name), ''), display_name),
            status = 'active',
            connected_at = now(),
            token_expires_at = now() + interval '25 hours'
        where id = v_channel_id;
    end if;
  exception when unique_violation then
    -- race: tenant khác vừa kết nối cùng OA giữa lúc kiểm tra và ghi
    raise exception 'oa_already_connected';
  end;

  perform private.set_channel_secret('zalo:' || v_channel_id || ':access', p_access_token);
  perform private.set_channel_secret('zalo:' || v_channel_id || ':refresh', p_refresh_token);
  update public.channels
    set secret_ref = 'vault:zalo:' || v_channel_id
    where id = v_channel_id;

  return v_channel_id;
end $$;
revoke all on function public.connect_zalo_channel(text, text, text, text) from public, anon;
grant execute on function public.connect_zalo_channel(text, text, text, text) to authenticated;

-- ---------- get_zalo_channel_secrets: CHỈ worker/adapter (service_role) ----------

-- Trả (null, null) khi kênh chưa có secret — caller map thành 'not_connected'.
-- TUYỆT ĐỐI không grant cho authenticated/anon: đường user-facing không bao
-- giờ đọc được token (rls-smoke có check riêng).
create or replace function public.get_zalo_channel_secrets(p_channel_id uuid)
returns table (access_token text, refresh_token text)
language sql
security definer set search_path = '' as $$
  select
    (select ds.decrypted_secret from vault.decrypted_secrets ds
      where ds.name = 'zalo:' || p_channel_id || ':access'),
    (select ds.decrypted_secret from vault.decrypted_secrets ds
      where ds.name = 'zalo:' || p_channel_id || ':refresh')
$$;
revoke all on function public.get_zalo_channel_secrets(uuid) from public, anon, authenticated;
grant execute on function public.get_zalo_channel_secrets(uuid) to service_role;

-- ---------- update_zalo_channel_tokens: xoay token sau refresh (service_role) ----------

-- Refresh token Zalo dùng MỘT LẦN — sau khi đổi được cặp mới phải ghi đè Vault
-- ngay trong cùng luồng, nếu không lần refresh sau sẽ chết.
create or replace function public.update_zalo_channel_tokens(
  p_channel_id uuid,
  p_access_token text,
  p_refresh_token text
) returns void
language plpgsql
security definer set search_path = public as $$
begin
  if p_access_token is null or btrim(p_access_token) = ''
     or p_refresh_token is null or btrim(p_refresh_token) = '' then
    raise exception 'invalid_input';
  end if;
  if not exists (
    select 1 from public.channels where id = p_channel_id and type = 'zalo_oa'
  ) then
    raise exception 'channel_not_found';
  end if;
  perform private.set_channel_secret('zalo:' || p_channel_id || ':access', p_access_token);
  perform private.set_channel_secret('zalo:' || p_channel_id || ':refresh', p_refresh_token);
  update public.channels
    set status = 'active', token_expires_at = now() + interval '25 hours'
    where id = p_channel_id;
end $$;
revoke all on function public.update_zalo_channel_tokens(uuid, text, text) from public, anon, authenticated;
grant execute on function public.update_zalo_channel_tokens(uuid, text, text) to service_role;

-- ---------- disconnect_zalo_channel: owner/admin ngắt kênh ----------

-- Xóa secret khỏi Vault + nhả external_id (OA có thể kết nối nơi khác).
-- Giữ nguyên row + hội thoại/tin nhắn cũ — kết nối lại sẽ tái dùng channel_id.
create or replace function public.disconnect_zalo_channel(p_channel_id uuid)
returns void
language plpgsql
security definer set search_path = '' as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text := public.app_role();
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role is null or v_role not in ('owner','admin') then
    raise exception 'forbidden';
  end if;
  if not exists (
    select 1 from public.channels
      where id = p_channel_id and tenant_id = v_tenant and type = 'zalo_oa'
  ) then
    raise exception 'channel_not_found';
  end if;

  delete from vault.secrets
    where name in ('zalo:' || p_channel_id || ':access',
                   'zalo:' || p_channel_id || ':refresh');
  update public.channels
    set status = 'disconnected',
        external_id = null,
        secret_ref = null,
        connected_at = null,
        token_expires_at = null
    where id = p_channel_id;
end $$;
revoke all on function public.disconnect_zalo_channel(uuid) from public, anon;
grant execute on function public.disconnect_zalo_channel(uuid) to authenticated;

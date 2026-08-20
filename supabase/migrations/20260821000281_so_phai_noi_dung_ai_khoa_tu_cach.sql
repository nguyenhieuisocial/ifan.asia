-- #281 — Sổ phải nói đúng AI đã khoá tư cách: người bấm hay máy quét đêm.
--
-- Bản #280 phân biệt hai chuyện đó bằng `auth.uid()`: có giá trị thì ghi
-- "người ghi hồ sơ", trống thì ghi "lượt quét đêm". SAI, và đo được ngay khi
-- thử: một lượt ghi ngày nghỉ đi qua cái tự động trên bảng vẫn ra
-- "luot_quet_dem", vì `auth.uid()` chỉ có giá trị khi lệnh đi qua đường đăng
-- nhập của web — mọi đường khác (nhập Excel bằng khoá dịch vụ, sửa tay trên
-- bảng, việc nền) đều để trống, dù người thật đang ngồi bấm.
--
-- Không đoán nữa: cái nào gọi thì tự khai. Cái tự động trên bảng biết chắc nó
-- đang chạy vì có người vừa ghi hồ sơ; lượt quét đêm biết chắc nó là máy.
--
-- Vì sao đáng sửa dù chỉ là một chữ trong sổ: đây đúng là loại sổ người ta chỉ
-- mở ra khi đã có chuyện — "sao bạn ấy mất quyền?". Sổ trả lời sai một chữ ở
-- đúng lúc đó thì thà đừng ghi.

create or replace function private.khoa_tu_cach_nguoi_da_nghi(
  p_tenant uuid default null,
  p_boi text default 'luot_quet_dem')
returns integer
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_so integer := 0;
begin
  with ung_vien as (
    select m.tenant_id, m.user_id, e.full_name, e.ended_on
    from public.employees e
    join public.tenants t on t.id = e.tenant_id
    join public.tenant_members m
      on m.tenant_id = e.tenant_id and m.user_id = e.user_id
    where e.user_id is not null
      and e.ended_on is not null
      -- ngày "hôm nay" tính theo múi giờ của chính tiệm đó (xem #280 chốt 1)
      and e.ended_on <= (now() at time zone coalesce(t.timezone, 'Asia/Ho_Chi_Minh'))::date
      and m.status = 'active'
      and m.role <> 'owner'          -- không bao giờ khoá chủ tiệm (#280 chốt 2)
      and (p_tenant is null or e.tenant_id = p_tenant)
  ), da_khoa as (
    update public.tenant_members m
       set status = 'removed'
      from ung_vien u
     where m.tenant_id = u.tenant_id
       and m.user_id = u.user_id
    returning m.tenant_id, m.user_id, u.full_name, u.ended_on
  )
  insert into public.record_audit (tenant_id, entity_type, entity_id, actor_id, action, diff)
  select d.tenant_id, 'tenant_member', d.user_id, auth.uid(), 'ended',
         jsonb_build_object(
           'ly_do', 'nghi_viec',
           'ngay_nghi', d.ended_on,
           'ten', d.full_name,
           'boi', p_boi)
    from da_khoa d;

  get diagnostics v_so = row_count;
  return v_so;
end;
$$;

revoke all on function private.khoa_tu_cach_nguoi_da_nghi(uuid, text) from public, anon, authenticated;

comment on function private.khoa_tu_cach_nguoi_da_nghi(uuid, text) is
  'Khoá tư cách thành viên của người đã tới ngày nghỉ việc (theo giờ của tiệm). '
  'Không đụng chủ tiệm. Chỉ đóng, không bao giờ mở lại — xem migration #280. '
  'p_boi: ai gọi, để ghi đúng vào sổ — xem #281.';

-- Bản cũ một tham số phải bỏ hẳn, không để nằm lại: còn nó thì lần gọi nào
-- quên tham số thứ hai sẽ lặng lẽ chạy bản cũ và ghi sổ sai y như trước.
drop function if exists private.khoa_tu_cach_nguoi_da_nghi(uuid);

create or replace function public.employees_khoa_khi_nghi_viec()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
begin
  if new.user_id is not null and new.ended_on is not null then
    perform private.khoa_tu_cach_nguoi_da_nghi(new.tenant_id, 'nguoi_ghi_ho_so');
  end if;
  return null;
end;
$$;

do $$
begin
  perform cron.unschedule('lock-departed-staff-nightly');
exception when others then
  null;
end;
$$;

select cron.schedule(
  'lock-departed-staff-nightly',
  '29 20 * * *',
  $cron$select private.khoa_tu_cach_nguoi_da_nghi(null, 'luot_quet_dem')$cron$);

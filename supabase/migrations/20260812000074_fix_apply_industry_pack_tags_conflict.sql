-- Vá lỗi tự gây ra ở migration #71 (task #79): đổi unique constraint của
-- `tags` sang partial unique index (chỉ tính nhãn còn sống) làm câu
-- `insert ... on conflict (tenant_id, name) do nothing` trong
-- apply_industry_pack() KHÔNG còn khớp được arbiter index (Postgres đòi phải
-- khai đúng mệnh đề WHERE của index từng phần trong chính câu ON CONFLICT).
-- Lỗi thật: 42P10 "no unique or exclusion constraint matching ON CONFLICT
-- specification" — bắt được khi chạy scripts/seed-demo.mjs tạo tiệm demo mới,
-- không phải đoán. Chỉ sửa đúng mệnh đề ON CONFLICT, không đổi gì khác trong
-- thân hàm (giữ nguyên bản của migration #69).
create or replace function public.apply_industry_pack(p_pack_key text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_sample jsonb;
  v_tag text;
  v_qr jsonb;
  v_inactive_days int;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if (select public.app_role()) not in ('owner','admin') then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.industry_packs where key = p_pack_key) then
    raise exception 'invalid_pack_key';
  end if;

  update public.tenants set industry = p_pack_key where id = v_tenant;

  select content -> 'sample_data' into v_sample from public.industry_packs where key = p_pack_key;

  -- Tags mẫu — arbiter phải khớp đúng partial unique index tags_tenant_id_name_active_idx
  for v_tag in select jsonb_array_elements_text(coalesce(v_sample -> 'tags', '[]'::jsonb))
  loop
    insert into public.tags (tenant_id, name) values (v_tenant, v_tag)
      on conflict (tenant_id, name) where deleted_at is null do nothing;
  end loop;

  -- Câu trả lời nhanh mẫu
  for v_qr in select jsonb_array_elements(coalesce(v_sample -> 'quick_replies', '[]'::jsonb))
  loop
    insert into public.quick_replies (tenant_id, title, content, sort_order)
      values (v_tenant, v_qr ->> 'title', v_qr ->> 'content', coalesce((v_qr ->> 'sort_order')::int, 0))
      on conflict (tenant_id, title) do nothing;
  end loop;

  -- 2 view mặc định (24p, mục 36.10A) — số ngày khác nhau vì nhịp quay lại
  -- tự nhiên của từng nghề khác nhau (quán cà phê 1 tuần/lần vs nha khoa
  -- khám định kỳ 6 tháng). Đây là con số KHỞI ĐIỂM, tiệm sửa lại được.
  v_inactive_days := case p_pack_key
    when 'spa' then 60
    when 'kham' then 180
    when 'pet' then 75
    when 'fnb' then 30
    when 'shop' then 45
    when 'retail' then 60
    when 'education' then 90
    else 60 -- 'other' và mọi key ngoài danh sách trên
  end;

  insert into public.saved_views (tenant_id, user_id, screen, name, query, vocab_version, position)
    values
      (v_tenant, null, 'contacts', 'Cần kéo về', 'tier=vip&inactive_days=' || v_inactive_days, 1, 0),
      (v_tenant, null, 'contacts', 'Khách mới', 'tier=new', 1, 1)
    on conflict do nothing;

  perform public.record_audit_log('tenant', v_tenant, 'pack_applied', jsonb_build_object('pack_key', p_pack_key));
end;
$$;

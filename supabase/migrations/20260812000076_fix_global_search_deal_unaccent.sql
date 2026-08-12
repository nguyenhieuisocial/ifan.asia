-- Vá migration #75: nhánh Cơ hội của global_search() so `d.title ilike
-- '%'||p_query||'%'` bằng chuỗi GÕ NGUYÊN (có dấu), không unaccent như nhánh
-- Khách — gõ không dấu ("goi triet long") KHÔNG ra được deal "Gói triệt
-- lông..." dù đúng yêu cầu 24l "gõ không dấu vẫn ra" áp cho MỌI loại kết
-- quả. Bắt được bằng thử tay trên DB thật trước khi viết code TS, không
-- phải đoán. `deals` không có cột sinh sẵn kiểu `search_text` như `contacts`
-- nên unaccent tại chỗ (bảng nhỏ, JOIN + LIMIT 5 nên không cần index riêng).
create or replace function public.global_search(p_query text)
returns table (
  entity_type text,
  entity_id uuid,
  title text,
  subtitle text,
  rank_tier int
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_norm text;
  v_digits text;
begin
  if v_tenant is null or coalesce(trim(p_query), '') = '' then
    return;
  end if;

  v_norm := public.immutable_unaccent(lower(trim(p_query)));
  v_digits := regexp_replace(p_query, '\D', '', 'g');

  return query
  -- ---- Khách ----
  (
    select
      'contact'::text,
      c.id,
      c.full_name,
      coalesce(c.phone, ''),
      case
        when v_digits <> '' and (
          c.phone = v_digits or c.phone_e164 = v_digits
          or (length(v_digits) = 4 and right(coalesce(c.phone_e164, c.phone, ''), 4) = v_digits)
        ) then 1
        when public.immutable_unaccent(lower(c.full_name)) like v_norm || '%' then 2
        else 3
      end as rank_tier
    from public.contacts c
    where c.tenant_id = v_tenant
      and c.deleted_at is null
      and (
        (v_digits <> '' and (
          c.phone = v_digits or c.phone_e164 = v_digits
          or (length(v_digits) = 4 and right(coalesce(c.phone_e164, c.phone, ''), 4) = v_digits)
        ))
        or c.search_text ilike '%' || v_norm || '%'
        or c.search_text % v_norm
      )
    order by rank_tier, similarity(c.search_text, v_norm) desc, c.last_interaction_at desc nulls last
    limit 5
  )
  union all
  -- ---- Hội thoại ----
  (
    select
      'conversation'::text,
      cv.id,
      coalesce(ct.full_name, cv.external_user_id, '—'),
      coalesce(ch.display_name, ch.type, ''),
      case
        when v_digits <> '' and ct.id is not null and (
          ct.phone = v_digits or ct.phone_e164 = v_digits
          or (length(v_digits) = 4 and right(coalesce(ct.phone_e164, ct.phone, ''), 4) = v_digits)
        ) then 1
        when ct.id is not null and public.immutable_unaccent(lower(ct.full_name)) like v_norm || '%' then 2
        else 3
      end as rank_tier
    from public.conversations cv
    join public.channels ch on ch.id = cv.channel_id
    left join public.contacts ct on ct.id = cv.contact_id and ct.deleted_at is null
    where cv.tenant_id = v_tenant
      and (
        (ct.id is not null and (
          (v_digits <> '' and (
            ct.phone = v_digits or ct.phone_e164 = v_digits
            or (length(v_digits) = 4 and right(coalesce(ct.phone_e164, ct.phone, ''), 4) = v_digits)
          ))
          or ct.search_text ilike '%' || v_norm || '%'
          or ct.search_text % v_norm
        ))
        or cv.external_user_id ilike '%' || p_query || '%'
      )
    order by rank_tier, coalesce(cv.last_message_at, cv.created_at) desc
    limit 5
  )
  union all
  -- ---- Cơ hội ----
  (
    select
      'deal'::text,
      d.id,
      d.title,
      coalesce(to_char(d.value_vnd, 'FM999G999G999') || 'đ — ', '') || coalesce(c2.full_name, ''),
      case
        when v_digits <> '' and c2.id is not null and (
          c2.phone = v_digits or c2.phone_e164 = v_digits
          or (length(v_digits) = 4 and right(coalesce(c2.phone_e164, c2.phone, ''), 4) = v_digits)
        ) then 1
        when public.immutable_unaccent(lower(d.title)) like v_norm || '%'
          or (c2.id is not null and public.immutable_unaccent(lower(c2.full_name)) like v_norm || '%') then 2
        else 3
      end as rank_tier
    from public.deals d
    join public.contacts c2 on c2.id = d.contact_id
    where d.tenant_id = v_tenant
      and d.deleted_at is null
      and (
        public.immutable_unaccent(lower(d.title)) ilike '%' || v_norm || '%'
        or (v_digits <> '' and (
          c2.phone = v_digits or c2.phone_e164 = v_digits
          or (length(v_digits) = 4 and right(coalesce(c2.phone_e164, c2.phone, ''), 4) = v_digits)
        ))
        or c2.search_text ilike '%' || v_norm || '%'
        or c2.search_text % v_norm
      )
    order by rank_tier, similarity(c2.search_text, v_norm) desc, d.updated_at desc
    limit 5
  );
end;
$$;

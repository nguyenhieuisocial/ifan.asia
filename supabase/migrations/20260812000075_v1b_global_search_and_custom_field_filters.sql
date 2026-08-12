-- V1b bước 7 (task #80) — 24l tìm kiếm toàn cục + 24o lên bộ lọc/cột/Excel.
-- ============================================================
-- A. global_search(p_query) — SECURITY INVOKER (mục 36.3 bước 7 bắt buộc,
--    không dùng DEFINER cho hàm tra cứu đa thực thể) — RLS contacts/deals/
--    conversations tự áp theo đúng quyền người gọi (staff bị Pattern B siết
--    theo owner_id trên contacts/deals, conversations thì không siết — hàm
--    không tự chế thêm điều kiện, để RLS của từng bảng lo phần đó).
--    KHÔNG phát domain event: RPC đọc thuần, không ghi gì (luật D1 — chỉ
--    phát khi có nghiệp vụ đổi trạng thái).
-- B. tags/nhãn: KHÔNG cần thêm — resolve_saved_view() migration #69 đã có sẵn
--    nhánh `tag` trong WHERE lẫn v_known, chỉ thiếu UI (vá ở code TS).
-- C. cf_<khoá> — trường tùy biến (24o) lên vốn từ bộ lọc: BƠM THÊM vào
--    resolve_saved_view() bằng NOT EXISTS (không cần sửa cấu trúc hàm), và
--    TĂNG vocab_version lên 2 (QĐ-4: "thêm... tăng số phiên bản, cấm sửa tại
--    chỗ") — vì đây LÀ một khoá mới thêm vào vốn từ đóng, dù không đổi nghĩa
--    khoá cũ nào. Vì mọi tham số v1 vẫn hợp lệ nguyên vẹn dưới v2 (v2 chỉ
--    THÊM, không đổi/xoá), các dòng saved_views đang có (vocab_version=1)
--    được nâng thẳng lên 2 trong migration này — KHÔNG đổi ý nghĩa câu lọc
--    của bất kỳ dòng nào, chỉ đúng lại con dấu phiên bản.
-- D. industry_packs — bơm filterable/listable cho custom_fields, làm ca thử
--    chuẩn (mục 36.4 nghiệm thu): pack Khám / "Tiền sử dị ứng".
-- ============================================================

-- ---------- A. global_search ----------
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
        d.title ilike '%' || p_query || '%'
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

revoke all on function public.global_search(text) from public, anon;
grant execute on function public.global_search(text) to authenticated;

comment on function public.global_search(text) is
  'V1b bước 7 (24l) — tra cùng lúc khách/hội thoại/cơ hội, gõ không dấu vẫn ra (unaccent+trgm). SECURITY INVOKER (mục 36.3 bước 7): RLS của từng bảng con tự áp theo quyền người gọi, hàm không tự chế thêm điều kiện owner_id — contacts/deals bị Pattern B siết cho staff, conversations thì không, đúng như từng bảng đã định. Thứ tự xếp theo mục 36.10C: khớp SĐT (đủ số hoặc 4 số cuối) > tên bắt đầu bằng chữ gõ > gần giống (trigram) > mới tương tác trước. Trần 5 dòng/loại — màn tự "Xem tất cả" khi cần hơn. Đọc thuần, không phát domain event (luật D1).';

-- ---------- C. resolve_saved_view: thêm cf_<khoá> + nâng vocab lên 2 ----------
create or replace function public.resolve_saved_view(p_view_id uuid)
returns uuid[]
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_view public.saved_views%rowtype;
  v_known text[];
  v_params jsonb;
  v_bad_key text;
  v_result uuid[];
begin
  select * into v_view from public.saved_views where id = p_view_id and deleted_at is null;
  if not found then
    raise exception 'saved_view_not_found' using detail = p_view_id::text;
  end if;

  -- QĐ-4: version khác 2 ⇒ hỏng, không đoán, không chạy truy vấn.
  if v_view.vocab_version <> 2 then
    raise exception 'saved_view_vocab_stale'
      using detail = format('view=%s vocab_version=%s', v_view.id, v_view.vocab_version),
            hint = 'Bộ lọc này dùng điều kiện bản cũ — mở ra chỉnh lại rồi lưu.';
  end if;

  v_known := case v_view.screen
    when 'contacts' then array['q', 'source', 'tier', 'sort', 'tag', 'inactive_days']
    when 'deals' then array['q', 'needs_action', 'stage', 'owner', 'sort']
  end;

  select coalesce(jsonb_object_agg(kv[1], kv[2]), '{}'::jsonb)
    into v_params
    from (
      select regexp_split_to_array(pair, '=') as kv
      from unnest(string_to_array(v_view.query, '&')) as pair
      where pair <> ''
    ) s
    where array_length(kv, 1) = 2;

  -- Gặp khoá NGOÀI vốn từ đóng ⇒ chặn ngay — nhưng cf_<khoá> là vốn từ MỞ
  -- theo pack (mỗi tenant khai custom_fields khác nhau), nên nhận diện bằng
  -- TIỀN TỐ thay vì liệt kê tên cụ thể (chỉ áp cho màn contacts — deals
  -- không có trường tùy biến).
  select k into v_bad_key from jsonb_object_keys(v_params) k
    where not (k = any(v_known))
      and not (v_view.screen = 'contacts' and k like 'cf\_%' escape '\')
    limit 1;
  if v_bad_key is not null then
    raise exception 'saved_view_unknown_param'
      using detail = format('view=%s param=%s', v_view.id, v_bad_key),
            hint = 'Bộ lọc này dùng điều kiện bản cũ — mở ra chỉnh lại rồi lưu.';
  end if;

  if v_view.screen = 'contacts' then
    select coalesce(array_agg(c.id), array[]::uuid[]) into v_result
      from public.contacts c
      where c.tenant_id = v_view.tenant_id
        and c.deleted_at is null
        and (not (v_params ? 'tier') or c.tier = (v_params ->> 'tier'))
        and (not (v_params ? 'source') or c.source_id = (v_params ->> 'source')::uuid)
        and (
          not (v_params ? 'tag')
          or exists (
            select 1 from public.contact_tags ct
            where ct.contact_id = c.id and ct.tag_id = (v_params ->> 'tag')::uuid
          )
        )
        and (
          not (v_params ? 'inactive_days')
          or c.last_interaction_at is null
          or c.last_interaction_at < now() - make_interval(days => (v_params ->> 'inactive_days')::int)
        )
        and (
          not (v_params ? 'q')
          or c.search_text ilike '%' || public.immutable_unaccent(lower(replace(v_params ->> 'q', '+', ' '))) || '%'
        )
        -- cf_<khoá>: mọi khoá cf_ có trong bộ lọc đều phải khớp đúng giá trị
        -- lưu trên contacts.custom (so chuỗi — mọi trường tùy biến lưu dạng
        -- text, kể cả number/date, đúng như contact-form-dialog đang ghi).
        and not exists (
          select 1 from jsonb_object_keys(v_params) k
          where k like 'cf\_%' escape '\'
            and coalesce(c.custom ->> substring(k from 4), '') <> coalesce(v_params ->> k, '')
        );
  elsif v_view.screen = 'deals' then
    select coalesce(array_agg(d.id), array[]::uuid[]) into v_result
      from public.deals d
      where d.tenant_id = v_view.tenant_id
        and d.deleted_at is null
        and (not (v_params ? 'stage') or d.stage_id = (v_params ->> 'stage')::uuid)
        and (
          not (v_params ? 'owner')
          or d.owner_id = (case when v_params ->> 'owner' = 'me' then auth.uid() else (v_params ->> 'owner')::uuid end)
        )
        and (
          not (v_params ? 'needs_action')
          or (d.status = 'open' and (d.next_action_at is null or d.next_action_at <= now()))
        )
        and (
          not (v_params ? 'q')
          or d.title ilike '%' || replace(v_params ->> 'q', '+', ' ') || '%'
          or exists (
            select 1 from public.contacts c
            where c.id = d.contact_id
              and c.search_text ilike '%' || public.immutable_unaccent(lower(replace(v_params ->> 'q', '+', ' '))) || '%'
          )
        );
  end if;

  return coalesce(v_result, array[]::uuid[]);
end;
$$;

-- Mọi dòng v1 vẫn hợp lệ nguyên vẹn dưới vốn từ v2 (v2 chỉ THÊM cf_, không
-- đổi/xoá khoá nào) — nâng thẳng con dấu phiên bản, KHÔNG đổi query đang lưu.
update public.saved_views set vocab_version = 2 where vocab_version = 1;

-- ---------- D. industry_packs: bơm filterable/listable — ca thử chuẩn (mục 36.4) ----------
update public.industry_packs
set content = jsonb_set(
  content,
  '{custom_fields}',
  '[{"key": "allergy_note", "label": "Tiền sử dị ứng", "type": "text", "filterable": true, "listable": true}]'::jsonb
)
where key = 'kham';

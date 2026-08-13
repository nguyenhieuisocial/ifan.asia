-- Migration #107 — băng-rôn "Bản mới đã lên" phải KỂ ĐƯỢC, không chỉ dán mã bản.
--
-- Founder phản ánh 13/08 (chủ đề Thông báo): *"🚀 Bản mới đã lên — 790ad41 là
-- gì? Ghi đã có gì thay đổi và được gì, ghi vậy không phù hợp"*. Đúng: `790ad41`
-- là mã bản (7 ký tự đầu của git SHA) — dấu vân tay để máy truy vết, người đọc
-- không rút ra được gì. Một băng-rôn chỉ có mã bản = một bản tin bằng không.
--
-- #104 đã lo phần "mảng nào đổi trạng thái" (tin '✨ Danh sách mảng vừa đổi').
-- Nhưng bản CHỈ SỬA LỖI (như 790ad41) không đổi mảng nào ⇒ chỉ còn cái băng-rôn
-- mã bản trơ ra. Nay kéo dòng MÔ TẢ của bản (dòng đầu của commit message, Vercel
-- gửi qua p_msg) vào băng-rôn: đó là "đã đổi gì" thật, viết bằng chính lời người
-- ra bản. Không có mô tả thì mới lùi về mã bản như cũ.
--
-- Thêm tham số p_msg (mặc định null) — lời gọi cũ 3 tham số vẫn chạy nhờ default,
-- nhưng phải DROP bản 3 tham số trước để PostgREST không thấy hai bản trùng tên.

drop function if exists public.tg_release_mark(text, text, jsonb);

create or replace function public.tg_release_mark(
  p_key text, p_sha text, p_features jsonb, p_msg text default null
)
returns jsonb
language plpgsql
volatile
security definer set search_path = public, pg_temp as $$
declare
  v_old_sha text;
  v_old jsonb;
  v_new_release boolean := false;
  v_doi_dinh_dang boolean := false;
  v_lines text := '';
  v_so_dong int := 0;
  v_tomtat text := '';
  r record;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;
  if p_sha is null or p_sha = '' then return jsonb_build_object('skipped', true); end if;

  -- Dòng đầu của commit message = "đã đổi gì". Cắt ngắn để băng-rôn không tràn.
  v_tomtat := coalesce(trim(split_part(p_msg, E'\n', 1)), '');
  if length(v_tomtat) > 200 then v_tomtat := left(v_tomtat, 200) || '…'; end if;

  select value into v_old_sha from private.app_config where key = 'release_sha' for update;
  select value::jsonb into v_old from private.app_config where key = 'feature_map';

  if v_old_sha is distinct from p_sha then
    v_new_release := true;
    insert into private.app_config (key, value) values ('release_sha', p_sha)
      on conflict (key) do update set value = excluded.value;
  end if;

  -- Bảng cũ định dạng phẳng (giá trị là chuỗi) → không so được, ghi đè im lặng.
  if v_old is not null then
    if jsonb_typeof(v_old) <> 'object' then
      v_doi_dinh_dang := true;
    else
      select coalesce(bool_or(jsonb_typeof(e.value) <> 'object'), true)
        into v_doi_dinh_dang
        from jsonb_each(v_old) e;
    end if;
  end if;

  if v_old is null or v_doi_dinh_dang then
    insert into private.app_config (key, value) values ('feature_map', p_features::text)
      on conflict (key) do update set value = excluded.value;
  elsif v_old is distinct from p_features then
    -- Duyệt HỢP của hai bên, không chỉ bên mới: chỉ duyệt bên mới thì một mảng
    -- bị GỠ khỏi sổ đăng ký sẽ biến mất không ai hay.
    for r in
      select t.k,
             v_old -> t.k as cu,
             p_features -> t.k as moi
        from (
          select jsonb_object_keys(p_features) as k
          union
          select jsonb_object_keys(v_old)
        ) t
       where v_old -> t.k is distinct from p_features -> t.k
       order by t.k
    loop
      if r.cu is null then
        v_lines := v_lines || E'\n· ➕ ' || coalesce(r.moi ->> 'ten', r.k) ||
                   ' — mảng mới, đang ở: ' || coalesce(r.moi ->> 'trang', '?');
      elsif r.moi is null then
        v_lines := v_lines || E'\n· ➖ ' || coalesce(r.cu ->> 'ten', r.k) ||
                   ' — đã gỡ khỏi danh sách';
      else
        -- Một mảng có thể đổi nhiều thứ cùng lúc → kể từng thứ một dòng, thay
        -- vì gộp thành một dòng dài không ai đọc hết.
        if (r.cu ->> 'ten') is distinct from (r.moi ->> 'ten') then
          v_lines := v_lines || E'\n· ✏️ «' || coalesce(r.cu ->> 'ten', r.k) ||
                     '» đổi tên thành «' || coalesce(r.moi ->> 'ten', r.k) || '»';
        end if;
        if (r.cu ->> 'trang') is distinct from (r.moi ->> 'trang') then
          v_lines := v_lines || E'\n· ' || coalesce(r.moi ->> 'ten', r.k) || ': ' ||
                     coalesce(r.cu ->> 'trang', '?') || ' → ' ||
                     coalesce(r.moi ->> 'trang', '?');
        end if;
        if (r.cu ->> 'nhom') is distinct from (r.moi ->> 'nhom') then
          v_lines := v_lines || E'\n· ' || coalesce(r.moi ->> 'ten', r.k) ||
                     ': chuyển nhóm ' || coalesce(r.cu ->> 'nhom', '?') || ' → ' ||
                     coalesce(r.moi ->> 'nhom', '?');
        end if;
      end if;
    end loop;
    insert into private.app_config (key, value) values ('feature_map', p_features::text)
      on conflict (key) do update set value = excluded.value;
  end if;

  if v_new_release and v_old_sha is not null then
    -- Có mô tả → kể việc; không có → lùi về mã bản như cũ (đỡ hơn im lặng).
    perform public.platform_notify('release', 'rel:' || p_sha,
      case when v_tomtat <> ''
        then '🚀 Bản mới đã lên: ' || v_tomtat
        else '🚀 Bản mới đã lên — ' || left(p_sha, 7)
      end);
  end if;

  if v_lines <> '' then
    -- Telegram cắt tin quá 4096 ký tự. Một đợt dựng lại sổ đăng ký có thể sinh
    -- vài chục dòng; cắt CÓ BÁO còn hơn để Telegram nuốt trọn cả tin.
    v_so_dong := length(v_lines) - length(replace(v_lines, E'\n', ''));
    if length(v_lines) > 3000 then
      v_lines := left(v_lines, 3000) || E'\n… và nữa — tổng ' || v_so_dong ||
                 ' thay đổi, xem đủ ở trang Lộ trình.';
    end if;
    perform public.platform_notify('feature_change', 'feat:' || p_sha,
      '✨ Danh sách mảng vừa đổi:' || v_lines);
  end if;

  return jsonb_build_object('release', v_new_release and v_old_sha is not null,
                            'features_changed', v_lines <> '',
                            'format_upgrade', v_doi_dinh_dang);
end $$;

revoke all on function public.tg_release_mark(text, text, jsonb, text) from public;
grant execute on function public.tg_release_mark(text, text, jsonb, text) to anon, authenticated;

-- Migration #104 — bản tin "Tính Năng" phải đọc được, và phải bắt đủ chuyện.
--
-- Founder hỏi 13/08: *"ở tính năng còn: mảng nào vừa đổi trạng thái (sắp tới →
-- đang xây → dùng được) không? hay đang nhiều hơn nữa"*. Đọc lại code thì lộ ra
-- hai chỗ hỏng, cả hai đều thuộc loại IM LẶNG — chạy đúng cú pháp, chỉ sai với
-- người đọc:
--
--   1. Bản tin in KHOÁ KỸ THUẬT: "contractsBilling: planned → ready". Người
--      nhận là founder, không phải người viết code. Một bản tin không đọc được
--      thì bằng không có bản tin.
--
--   2. Chỉ so `status`, nên DỜI ĐỢT (V7–V8 → V3–V5), ĐỔI TÊN mảng và CHUYỂN
--      NHÓM đi qua hoàn toàn im lặng — trong khi cả ba đều đổi thứ đang hiện
--      trên trang /lo-trinh và /tinh-nang công khai.
--
-- Nay máy chủ gửi sẵn tên + trạng thái + nhóm ĐÃ DỊCH (lib/notify/feature-map.ts
-- lấy chữ từ messages/vi.json — luật D1), hàm này chỉ việc so và kể lại.
--
-- ĐỔI ĐỊNH DẠNG BẢN GHI: bảng cũ là {khoá → "ready"}, bảng mới là
-- {khoá → {ten,trang,nhom}}. Lần chạy đầu sau khi lên bản này, hai bảng khác
-- nhau ở MỌI mục — nếu so thật thì bắn một tin 28 dòng nói "tất cả vừa đổi"
-- trong khi chẳng có gì đổi. Nên nhận diện bảng cũ và GHI ĐÈ IM LẶNG.

create or replace function public.tg_release_mark(
  p_key text, p_sha text, p_features jsonb
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
  r record;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;
  if p_sha is null or p_sha = '' then return jsonb_build_object('skipped', true); end if;

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
    perform public.platform_notify('release', 'rel:' || p_sha,
      '🚀 Bản mới đã lên — ' || left(p_sha, 7));
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

revoke all on function public.tg_release_mark(text, text, jsonb) from public;
grant execute on function public.tg_release_mark(text, text, jsonb) to anon, authenticated;

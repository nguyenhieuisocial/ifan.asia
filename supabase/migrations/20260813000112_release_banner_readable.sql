-- Migration #112 — bản tin "Bản mới đã lên" viết cho NGƯỜI DÙNG, không phải
-- cho lập trình viên.
--
-- Founder phản ánh lần 2 (13/08): #107 đã kéo dòng mô tả bản vào băng-rôn,
-- nhưng vẫn *"chưa đầy đủ chi tiết, chưa rõ ràng và dễ hiểu"*. Đúng — #107 mới
-- chỉ đổi từ MÃ BẢN TRƠN sang CÂU COMMIT THÔ, mà câu commit viết theo chuẩn
-- lập trình:
--
--     🚀 Bản mới đã lên: fix(telegram): vá lỗ hổng scope=outside_hours
--
-- Ba thứ người không viết code không đọc ra được: chữ `fix(telegram):` là quy
-- ước nội bộ · `scope=outside_hours` là tên biến trong code · và câu này nói
-- SỬA CÁI GÌ chứ không nói NGƯỜI DÙNG ĐƯỢC GÌ.
--
-- BA CÁCH SỬA, chọn cách 3:
--   1. Bỏ băng-rôn đi — mất luôn thông tin, không phải giải pháp.
--   2. Nhờ AI viết lại câu commit cho dễ hiểu — thêm một lượt gọi AI mỗi lần
--      lên bản, và AI phải ĐOÁN ý nghĩa từ chữ kỹ thuật. Đoán thì có ngày đoán
--      sai, mà đây là tin founder tin để biết sản phẩm đang đi tới đâu.
--   3. (CHỌN) Người ra bản TỰ VIẾT một dòng tiếng Việt cho founder, ngay trong
--      câu commit. Không đoán, không tốn AI, và ai ra bản thì người đó biết rõ
--      nhất mình vừa đổi gì.
--
-- Quy ước: thêm một dòng vào THÂN commit —
--
--     Founder: AI giờ không gửi trùng tin cho khách nữa
--
-- `tg_release_mark` bắt đúng dòng đó và đưa lên băng-rôn. KHÔNG có dòng đó thì
-- vẫn phải ra được tin đọc tạm được, nên có LƯỚI ĐỠ: dịch tiền tố quy ước
-- (feat/fix/docs…) sang tiếng Việt và cắt bỏ phần `(phạm-vi)` — vẫn là chữ kỹ
-- thuật, nhưng ít nhất người đọc biết đây là "Sửa lỗi" hay "Thêm mới".
--
-- Cũng thêm GIỜ VIỆT NAM: "vừa lên" mà không có mốc giờ thì tin trôi vài tiếng
-- sau đọc lại không biết là bản nào.

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
  v_tieu_de text;
  v_cho_founder text;
  v_loai text;
  v_than text;
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
    for r in
      select t.k, v_old -> t.k as cu, p_features -> t.k as moi
        from (select jsonb_object_keys(p_features) as k
              union select jsonb_object_keys(v_old)) t
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
        if (r.cu ->> 'ten') is distinct from (r.moi ->> 'ten') then
          v_lines := v_lines || E'\n· ✏️ «' || coalesce(r.cu ->> 'ten', r.k) ||
                     '» đổi tên thành «' || coalesce(r.moi ->> 'ten', r.k) || '»';
        end if;
        if (r.cu ->> 'trang') is distinct from (r.moi ->> 'trang') then
          v_lines := v_lines || E'\n· ' || coalesce(r.moi ->> 'ten', r.k) || ': ' ||
                     coalesce(r.cu ->> 'trang', '?') || ' → ' || coalesce(r.moi ->> 'trang', '?');
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
    v_than := coalesce(p_msg, '');

    -- ① Dòng người ra bản viết riêng cho founder. Bắt cả "Founder:" lẫn
    --    "Người dùng thấy gì:" — hai cách gọi cùng một thứ, đừng bắt ai phải
    --    nhớ đúng một chữ.
    v_cho_founder := nullif(btrim((
      regexp_match(v_than, '(?ni)^\s*(?:Founder|Người dùng thấy gì)\s*:\s*(.+)$')
    )[1]), '');

    -- ② Lưới đỡ: dòng đầu, cắt tiền tố quy ước, dịch loại sang tiếng Việt.
    v_tieu_de := btrim(split_part(v_than, E'\n', 1));
    v_loai := lower(coalesce((regexp_match(v_tieu_de, '^([a-zA-Z]+)\s*(?:\([^)]*\))?\s*:'))[1], ''));
    v_tieu_de := btrim(regexp_replace(v_tieu_de, '^[a-zA-Z]+\s*(\([^)]*\))?\s*:\s*', ''));

    perform public.platform_notify('release', 'rel:' || p_sha,
      '🚀 iFan vừa lên bản mới — ' ||
      -- Chữ thường trong khuôn to_char PHẢI bọc nháy kép, nếu không Postgres
      -- đọc chúng là mã định dạng: 'ngày' ra "ngà6" vì `y` = chữ số cuối của
      -- năm (2026). Bắt được ngay trong phép thử của chính migration này.
      to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI "ngày" DD/MM') ||
      case
        when v_cho_founder is not null then E'\n\n' || left(v_cho_founder, 300)
        when v_tieu_de <> '' then E'\n\n' ||
          case v_loai
            when 'feat'     then '✨ Thêm mới: '
            when 'fix'      then '🐞 Sửa lỗi: '
            when 'security' then '🔒 Bảo mật: '
            when 'design'   then '🎨 Giao diện: '
            when 'perf'     then '⚡ Chạy nhanh hơn: '
            when 'docs'     then '📄 Tài liệu: '
            when 'test'     then '🧪 Kiểm thử: '
            when 'refactor' then '🧹 Dọn code: '
            when 'chore'    then '🔧 Lặt vặt: '
            else ''
          end || left(v_tieu_de, 250)
        else ''
      end ||
      case when v_lines <> ''
        then E'\n\nCó mảng tính năng vừa đổi — xem tin ngay dưới.'
        else '' end ||
      E'\n\nmã bản ' || left(p_sha, 7));
  end if;

  if v_lines <> '' then
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

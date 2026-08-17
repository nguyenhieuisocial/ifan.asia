-- Migration #129 — LƯỚI ĐỠ: câu `Founder:` xấu không được lên nhóm Telegram.
--
-- Founder phản ánh lần 3 (17/08): bản tin trong nhóm hiện lại NGUYÊN VĂN lời
-- chỉ đạo của chính founder, không dấu, trong ngoặc kép —
--
--     🚀 iFan vừa lên bản mới — 16:15 ngày 17/08
--     "Tiep tuc ngay, khong duoc dung cho nhu vay nua"
--     mã bản 94f2d32
--
-- Đo trên CSDL: 5 bản liền trong chiều 17/08 đều như vậy (id 1806, 1805, 1834,
-- 1848, 1862). Bộ máy gửi tin KHÔNG hỏng — 60/60 tin 7 ngày qua gửi trót lọt,
-- 0 tin kẹt. Hỏng ở ĐẦU VÀO: phiên viết commit điền vào dòng `Founder:` lời
-- nhắn của founder cho nó, thay vì lời nhắn CHO founder về việc người dùng
-- được gì. Sai lan theo kiểu BẮT CHƯỚC: mỗi phiên lấy commit trước làm mẫu.
--
-- ⚡ ĐẢO QUYẾT ĐỊNH ADR-0007 mục 12e (Haiku soạn lại mọi tin trước khi gửi).
-- Hai căn cứ ĐO ĐƯỢC, không phải sở thích:
--
--   1. Mục 12e viết "máy chủ đã có khoá AI (việc #117, đóng 14/08)". SAI SỰ
--      THẬT: soát biến môi trường production trên Vercel ngày 17/08 — 8 biến,
--      KHÔNG có `ANTHROPIC_API_KEY`. Nên bước soạn lại **chưa từng chạy một
--      lần nào** trên máy chủ: 60/60 tin đều có `sent_body` null (= gửi nguyên
--      bản gốc). Một tính năng chết im lặng 3 ngày, không gì báo.
--   2. Kể cả bật lên cũng KHÔNG chữa được ca này. Thử thật (cùng khoá, cùng
--      model, cùng lời dặn, cùng đầu vào là tin 16:15 ở trên) — Haiku trả về
--      "Tiếp tục ngay, không được dừng cho như vậy nữa": chỉ thêm dấu vào lời
--      chỉ đạo. Vẫn vô nghĩa với người đọc. Lời dặn CẤM AI thêm dữ kiện (đúng),
--      nên nó không thể suy ra "người dùng được gì" từ một câu mệnh lệnh —
--      thông tin đó không có trong đầu vào.
--
-- Founder chốt 17/08: không cắm khoá AI vào máy chủ, tìm cách tự động không
-- tốn chi phí. Nên chốt chặn dời về LÚC VIẾT (hook `commit-msg` +
-- `scripts/soat-commit-founder.mjs`), và file này là lưới đỡ cuối.
--
-- PHÂN VAI HAI LỚP (cố ý, để không phạm D1 — mỗi luật khai một nơi):
--   • Script cổng chặn giữ phép kiểm Ý NGHĨA: danh sách cụm câu-ra-lệnh. Đó là
--     danh sách hay đổi, và ở đó người viết SỬA ĐƯỢC ngay.
--   • File này chỉ giữ phép kiểm HÌNH THỨC, và cố ý BẢO THỦ HƠN: chặn khi câu
--     KHÔNG CÓ MỘT DẤU NÀO (không phải theo tỷ lệ như script). Lý do: tới đây
--     thì không ai sửa được nữa, loại oan một câu hợp lệ là mất tin thật. Đo
--     cho thấy mức bảo thủ này vẫn bắt đủ: 5/5 ca thật đều 0 dấu VÀ bọc ngoặc
--     kép, tức bị bắt hai lần.
--
-- KHÔNG im lặng khi loại: băng-rôn nói thẳng "câu gửi anh trong bản này viết
-- sai khuôn nên tôi bỏ" — cùng nếp "cắt CÓ BÁO còn hơn để trôi" đã có trong
-- hàm này từ #107. Loại câu mà im lặng thì founder tưởng bản đó không có gì kể.

-- ①  Phép kiểm hình thức, tách riêng để KIỂM ĐƯỢC mà không phát tin thật vào
--     nhóm. `tg_release_mark` phát tin ngay khi gọi, nên nếu nhúng phép kiểm
--     vào trong đó thì mọi lần kiểm D3 là một lần spam founder.
create or replace function public.tg_cau_founder_dung_khuon(p_cau text)
returns boolean
language plpgsql
immutable
security invoker set search_path = pg_catalog, pg_temp as $$
declare
  -- Bộ ký tự có dấu tiếng Việt, CHỮ THƯỜNG (đã lower() trước khi đếm).
  c_bo_dau constant text :=
    'àáâãèéêìíòóôõùúýăđĩũơư' ||
    'ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ';
  v_cau text;
  v_low text;
  v_so_dau int;
begin
  if p_cau is null then return false; end if;
  -- Chuẩn hoá NFC: nếu chuỗi tới ở dạng tách dấu (NFD) thì translate() không
  -- thấy ký tự có dấu nào và câu tiếng Việt tử tế sẽ bị loại oan.
  v_cau := btrim(normalize(p_cau, NFC));
  if v_cau = '' then return false; end if;

  -- ⓐ Ngoặc kép BỌC CẢ CÂU = dấu hiệu chép lại lời người khác. Câu hợp lệ vẫn
  --    được trích dẫn BÊN TRONG, ví dụ: Giờ tìm "Liên kết Zalo" là ra.
  if left(v_cau, 1) in ('"', '''', '«', '“', '”')
     and right(v_cau, 1) in ('"', '''', '»', '“', '”') then
    return false;
  end if;

  -- ⓑ Không một dấu nào ⇒ không phải câu tiếng Việt viết cho người đọc.
  v_low := lower(v_cau);
  v_so_dau := length(v_low) - length(translate(v_low, c_bo_dau, ''));
  if v_so_dau = 0 then return false; end if;

  return true;
end $$;

comment on function public.tg_cau_founder_dung_khuon(text) is
  'Migration #129 — phép kiểm HÌNH THỨC cho dòng Founder: trong commit (bọc ngoặc kép / không có dấu). Cố ý bảo thủ hơn scripts/soat-commit-founder.mjs vì tới tầng này không ai sửa được câu nữa. Danh sách cụm câu-ra-lệnh KHÔNG nằm ở đây (D1) — nó ở script cổng chặn.';

revoke all on function public.tg_cau_founder_dung_khuon(text) from public;

-- ②  Bản #112 + lưới đỡ. Thân hàm chép từ migration #112 (bản mới nhất, đã
--     đối chiếu nguyên văn với bản ĐANG CHẠY trên CSDL — bất biến 2).
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
  v_cau_bi_loai boolean := false;
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

    -- ①bis (#129) LƯỚI ĐỠ. Câu sai khuôn thì coi như KHÔNG CÓ và rơi về lưới
    --       đỡ tiêu đề bên dưới — nhưng phải NÓI RA, xem đầu file.
    if v_cho_founder is not null
       and not public.tg_cau_founder_dung_khuon(v_cho_founder) then
      v_cau_bi_loai := true;
      v_cho_founder := null;
    end if;

    -- ② Lưới đỡ: dòng đầu, cắt tiền tố quy ước, dịch loại sang tiếng Việt.
    v_tieu_de := btrim(split_part(v_than, E'\n', 1));
    v_loai := lower(coalesce((regexp_match(v_tieu_de, '^([a-zA-Z]+)\s*(?:\([^)]*\))?\s*:'))[1], ''));
    v_tieu_de := btrim(regexp_replace(v_tieu_de, '^[a-zA-Z]+\s*(\([^)]*\))?\s*:\s*', ''));

    perform public.platform_notify('release', 'rel:' || p_sha,
      '🚀 iFan vừa lên bản mới — ' ||
      -- Chữ thường trong khuôn to_char PHẢI bọc nháy kép, nếu không Postgres
      -- đọc chúng là mã định dạng: 'ngày' ra "ngà6" vì `y` = chữ số cuối của
      -- năm (2026). Bắt được ngay trong phép thử của chính migration #112.
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
      case when v_cau_bi_loai
        then E'\n\n⚠️ Bản này có câu gửi anh nhưng viết sai khuôn (không dấu, ' ||
             'hoặc chép lại lời anh) nên tôi bỏ — trên đây là dòng lấy tạm từ ' ||
             'tiêu đề.'
        else '' end ||
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
                            'format_upgrade', v_doi_dinh_dang,
                            'founder_line_rejected', v_cau_bi_loai);
end $$;

revoke all on function public.tg_release_mark(text, text, jsonb, text) from public;
grant execute on function public.tg_release_mark(text, text, jsonb, text) to anon, authenticated;

-- Điều kiện xem lại
--
-- • Nếu sau này bật khoá AI trên máy chủ và muốn dựng lại bước soạn lại tin:
--   đọc lại hai căn cứ ở đầu file TRƯỚC. Căn cứ 2 (AI không suy được "người
--   dùng được gì" từ một câu mệnh lệnh) KHÔNG mất hiệu lực khi có tiền — nó là
--   giới hạn về thông tin, không phải về giá. Bước soạn lại chỉ đáng dựng nếu
--   đầu vào đổi hẳn (cho AI đọc cả diff, không chỉ câu commit).
-- • Nếu cổng chặn `scripts/soat-commit-founder.mjs` bị bỏ hoặc lách nhiều lần:
--   lưới đỡ này sẽ bắn cảnh báo "⚠️ câu sai khuôn" liên tục trong nhóm. Đó là
--   dấu hiệu phải sửa NGƯỜI/QUY TRÌNH, không phải nới lỏng phép kiểm ở đây.
-- • Nếu founder báo mất tin thật (câu hợp lệ bị loại oan): kiểm ngay bằng
--   `select public.tg_cau_founder_dung_khuon('<câu đó>')` — hàm tách riêng cốt
--   để kiểm được không cần phát tin. ⚠️ Phải chạy bằng QUYỀN CHỦ (SQL Editor
--   trên Dashboard, hoặc Management API với `read_only:false`): hàm cố ý không
--   grant cho anon/authenticated vì chỉ `tg_release_mark` (security definer)
--   gọi nó. Chạy qua đường chỉ-đọc sẽ ra "permission denied" — đó là quyền
--   đúng như thiết kế, KHÔNG phải hàm hỏng.
--   Ca oan có thật đáng lo nhất là câu viết
--   toàn tiếng Anh (0 dấu tiếng Việt); khi đó nới bằng cách cho phép câu không
--   dấu NẾU không bọc ngoặc kép và dài hơn 40 ký tự, đừng bỏ hẳn phép kiểm.

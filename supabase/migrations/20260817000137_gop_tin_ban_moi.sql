-- Migration #137 — GỘP tin bản mới: thôi nếp "một commit một tin".
-- Hồ sơ: ADR-0020 mục 3.2 (việc 1/4).
--
-- ĐO ĐƯỢC (CSDL thật, 17/08) — vấn đề chưa ai nêu tên suốt 5 ngày:
--   `release` chiếm 48/67 = 72% toàn bộ tin 30 ngày
--   13/08: 18 tin · 14/08: 17 tin · 17/08: 13 tin  ⇒ ~16 TIN/NGÀY LÀM VIỆC
-- Vì mỗi commit sinh một tin. Không ai đọc hết 16 tin/ngày, và **kênh nào bị bỏ
-- qua thì mọi tin trong đó mất giá trị, kể cả tin quan trọng**.
--
-- Ba lần vá trước (#107 · #112 · #129) đều sửa NỘI DUNG MỘT TIN. Lần này sửa
-- TẦN SUẤT — nguyên nhân thật.
--
-- CÁCH LÀM
--   • Bản mới KHÔNG phát tin ngay: ghi vào hàng chờ `private.release_pending`.
--   • Mỗi giờ, `release_digest()` gộp hàng chờ thành MỘT tin rồi dọn sạch.
--   • Bản ƯU TIÊN phát ngay — nhưng **flush cả hàng chờ vào cùng tin** thay vì
--     phát riêng. Lý do: phát riêng thì tin khẩn ra trước tin gộp chứa bản cũ
--     hơn ⇒ founder đọc thấy thứ tự lộn. Flush thì không bao giờ lộn.
--     Ưu tiên = bản `security` HOẶC bản có mảng đổi trạng thái.
--   • Bản tự khai `Nội bộ:` không vào hàng chờ (đã chặn ở #133).
--
-- VÌ SAO GỘP THEO GIỜ, KHÔNG THEO NGÀY: gộp cả ngày thì tin về lúc founder đã
-- ngủ, và một lỗi vá lúc 9h sáng chỉ được kể lúc 20h. Một giờ đủ để 16 tin/ngày
-- co còn ≤ 8, mà vẫn còn tính "vừa mới".

create table if not exists private.release_pending (
  sha         text primary key,
  cau_founder text,
  tieu_de     text,
  loai        text,
  cau_bi_loai boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table private.release_pending is
  'Hàng chờ gộp tin bản mới (ADR-0020 mục 3.2, migration #134). Mỗi bản một dòng; release_digest() gộp thành một tin rồi XOÁ. Bảng này luôn gần rỗng — nhiều dòng tồn lâu = job release-digest đã đứng.';

-- ①  Gộp hàng chờ thành MỘT tin.
--
-- `delete … returning` trong CTE: lấy và dọn trong CÙNG một câu lệnh, nên hai
-- lượt chạy song song (job giờ + một bản ưu tiên flush cùng lúc) không thể gộp
-- trùng một dòng. Notify nằm cùng transaction ⇒ notify lỗi thì hàng chờ được
-- hoàn nguyên, không mất tin.
create or replace function public.release_digest()
returns boolean
language plpgsql
volatile
security definer set search_path = public, pg_temp as $$
declare
  v_n int;
  v_dong text;
  v_sha_cuoi text;
  v_co_bi_loai boolean;
  v_tu timestamptz;
  v_den timestamptz;
  v_dau text;
begin
  with lay as (
    delete from private.release_pending returning *
  )
  select count(*),
         string_agg(
           '· ' || coalesce(
             nullif(btrim(l.cau_founder), ''),
             case l.loai
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
             end || coalesce(nullif(btrim(l.tieu_de), ''), '(không có mô tả)')
           ),
           E'\n' order by l.created_at
         ),
         max(l.sha), bool_or(l.cau_bi_loai), min(l.created_at), max(l.created_at)
    into v_n, v_dong, v_sha_cuoi, v_co_bi_loai, v_tu, v_den
    from lay l;

  if coalesce(v_n, 0) = 0 then return false; end if;

  -- Một bản thì viết số ít; nhiều bản thì ghi rõ khoảng giờ để founder biết
  -- đây là tin gộp, không phải một bản duy nhất.
  v_dau := case
    when v_n = 1 then '🚀 iFan vừa lên bản mới — ' ||
      to_char(v_den at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI "ngày" DD/MM')
    else '🚀 iFan vừa lên ' || v_n || ' bản mới — ' ||
      to_char(v_tu  at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI') || '–' ||
      to_char(v_den at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI "ngày" DD/MM')
  end;

  -- Khoá chống trùng theo MÃ BẢN CUỐI, không theo mốc giờ: trong cùng một giờ
  -- có thể phát hai lần (job giờ, rồi một bản ưu tiên flush) — khoá theo giờ sẽ
  -- làm tin thứ hai bị bỏ IM LẶNG.
  perform public.platform_notify('release', 'reldigest:' || left(v_sha_cuoi, 7),
    v_dau || E'\n\n' || v_dong ||
    case when v_co_bi_loai
      then E'\n\n⚠️ Có bản viết câu gửi anh sai khuôn (không dấu, hoặc chép lại ' ||
           'lời anh) nên tôi bỏ câu đó và lấy tạm từ tiêu đề.'
      else '' end ||
    E'\n\nmã bản cuối ' || left(v_sha_cuoi, 7));
  return true;
end $$;

comment on function public.release_digest() is
  'Gộp hàng chờ release_pending thành MỘT tin (ADR-0020 mục 3.2). Chạy mỗi giờ bằng cron release-digest, và được tg_release_mark gọi ngay khi có bản ưu tiên (security / có mảng đổi trạng thái) để tin không ra lộn thứ tự.';

revoke all on function public.release_digest() from public;

-- ②  tg_release_mark: ghi hàng chờ thay vì phát tin. Thân chép từ #133 (bản mới
--     nhất — bất biến 2), chỉ đổi khối phát tin `release`.
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
  v_noi_bo boolean := false;
  v_uu_tien boolean := false;
  v_da_phat boolean := false;
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

    v_cho_founder := nullif(btrim((
      regexp_match(v_than, '(?ni)^\s*(?:Founder|Người dùng thấy gì)\s*:\s*(.+)$')
    )[1]), '');

    -- Lưới đỡ #129: câu sai khuôn coi như không có, và phải nói ra.
    if v_cho_founder is not null
       and not public.tg_cau_founder_dung_khuon(v_cho_founder) then
      v_cau_bi_loai := true;
      v_cho_founder := null;
    end if;

    -- #133: bản tự khai nội bộ ⇒ không vào hàng chờ, không tin nào.
    v_noi_bo := v_cho_founder is null
                and not v_cau_bi_loai
                and v_than ~* '(?n)^\s*Nội bộ\s*:\s*\S';

    v_tieu_de := btrim(split_part(v_than, E'\n', 1));
    v_loai := lower(coalesce((regexp_match(v_tieu_de, '^([a-zA-Z]+)\s*(?:\([^)]*\))?\s*:'))[1], ''));
    v_tieu_de := btrim(regexp_replace(v_tieu_de, '^[a-zA-Z]+\s*(\([^)]*\))?\s*:\s*', ''));
  end if;

  -- #134: ghi HÀNG CHỜ thay vì phát tin ngay.
  if v_new_release and v_old_sha is not null and not v_noi_bo then
    insert into private.release_pending (sha, cau_founder, tieu_de, loai, cau_bi_loai)
      values (p_sha, v_cho_founder, nullif(v_tieu_de, ''), nullif(v_loai, ''), v_cau_bi_loai)
      on conflict (sha) do nothing;

    -- Ưu tiên: vá bảo mật, hoặc có mảng đổi trạng thái. Flush CẢ hàng chờ vào
    -- cùng một tin — xem lý do ở đầu file.
    v_uu_tien := v_loai = 'security' or v_lines <> '';
    if v_uu_tien then
      v_da_phat := public.release_digest();
    end if;
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

  return jsonb_build_object(
    'release', v_new_release and v_old_sha is not null and not v_noi_bo,
    'features_changed', v_lines <> '',
    'format_upgrade', v_doi_dinh_dang,
    'founder_line_rejected', v_cau_bi_loai,
    'internal_only', v_noi_bo,
    'queued', v_new_release and v_old_sha is not null and not v_noi_bo,
    'flushed_now', v_da_phat);
end $$;

revoke all on function public.tg_release_mark(text, text, jsonb, text) from public;
grant execute on function public.tg_release_mark(text, text, jsonb, text) to anon, authenticated;

-- ③  Nhịp giờ. Phút 5 để không đụng giờ tròn (nhiều job khác đứng ở phút 0).
select cron.schedule('release-digest', '5 * * * *', 'select public.release_digest()');

-- Điều kiện xem lại
--
-- • Khi số bản mỗi ngày xuống dưới 3 (hết giai đoạn xây dày) ⇒ cơ chế gộp này
--   thành gánh nặng vô ích: bỏ job, cho `tg_release_mark` gọi `platform_notify`
--   thẳng như trước #134. Đo bằng: số tin `release` mỗi ngày trong 7 ngày liền.
-- • Nếu `private.release_pending` có dòng tồn quá 2 giờ ⇒ job `release-digest`
--   đã đứng. Kiểm `cron.job_run_details`. Bảng này phải LUÔN gần rỗng.
-- • Nếu founder nói tin gộp quá thưa (biết bản mới muộn hơn mong muốn) ⇒ giảm
--   nhịp xuống 30 phút TRƯỚC khi nghĩ tới bỏ gộp; đừng quay lại một-commit-một-tin.
-- • Nếu một tin gộp dài quá ~15 dòng ⇒ một giờ đang có quá nhiều bản; đó là dấu
--   hiệu nên gộp theo VIỆC (task) chứ không theo giờ, xem lại ADR-0020 mục 3.2.

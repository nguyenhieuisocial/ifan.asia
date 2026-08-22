-- ════════════════════════════════════════════════════════════════════
-- SỔ LỖI PHẢI BIẾT LỖI XẢY RA Ở ĐÂU — MÁY LẬP TRÌNH KHÔNG PHẢI NGƯỜI DÙNG
-- ════════════════════════════════════════════════════════════════════
--
-- ┌─ TRIỆU CHỨNG ─────────────────────────────────────────────────────
-- Từ 18:15 ngày 22/08 bot báo động 15 phút một lần: "1 việc hỏng ảnh hưởng
-- người dùng · 1 lỗi cũ chưa sửa vẫn đang tái diễn", và trước đó "3 LỖI MỚI
-- trên màn hình người dùng — Failed to load chunk /_next/static/chunks/...".
--
-- ┌─ CĂN NGUYÊN (đo 22/08, KHÔNG suy đoán) ───────────────────────────
-- Đọc cả 7 dòng trong `app_errors`: KHÔNG dòng nào đến từ người dùng thật.
-- Cả 7 đều sinh ra trên MÁY LẬP TRÌNH, bằng chứng nằm ngay trong vết gọi hàm:
--
--   · dòng đang tái diễn (`so_lan` = 24, "The destination stream closed early.")
--     có vết gọi trỏ vào `C:\dev\ifan.asia\node_modules\next\...\
--     app-page-turbo.runtime.DEV.js` — bản chạy DEV, trên ổ đĩa máy dev. Thủ
--     phạm là tiến trình `next dev -p 3211` đang bật (đã soi tiến trình 22/08).
--     Đây là lượt tải RSC bị huỷ giữa chừng — chuyện thường của máy dev, không
--     ai nhìn thấy, không ai hỏng việc.
--
--   · hai dòng "Failed to load chunk" có trình duyệt `HeadlessChrome/134` và
--     vết gọi trỏ `http://127.0.0.1:3100/...` — trình duyệt TỰ ĐỘNG của bộ
--     kiểm, chạy trên máy này. Cả hai `so_lan` = 1, `lan_dau` = `lan_cuoi`:
--     xảy ra ĐÚNG MỘT LẦN lúc 18:01 rồi thôi.
--
--   · dòng "thu cong: man nay co sap thi cong co bat duoc khong" là lỗi CỐ Ý
--     ném ra để thử chính đường ghi lỗi.
--
-- Bản chạy thật KHÔNG dính: nó phục vụ tệp tĩnh ở `/_next/static/IMMUTABLE/
-- chunks/...`, một không gian đường dẫn KHÁC HẲN đường dẫn trong lời lỗi. Và
-- từ 18:01 tới 20:21 đã ra SÁU bản mới mà hai dòng chunk vẫn đứng yên ở
-- `so_lan` = 1 — nếu là "bản mới giết tệp cũ của người dùng thật" thì sáu lần
-- ra bản phải đẻ ra hàng loạt lượt nữa. Giả thuyết đó BỊ LOẠI.
--
-- ┌─ VÌ SAO MÁY DEV GHI ĐƯỢC VÀO SỔ THẬT ─────────────────────────────
-- `.env.local` cầm đúng khoá dịch vụ của dự án Supabase THẬT. Nên mọi lỗi trên
-- máy lập trình — kể cả lỗi cố tình ném ra để thử — đi thẳng vào cùng cuốn sổ
-- mà `scan_user_failures` đọc, và được đếm là "việc hỏng ảnh hưởng người dùng".
--
-- ⚠️ LỖ HỔNG THẬT KHÔNG PHẢI CÁI LỖI NÀO CẢ — LÀ CUỐN SỔ KHÔNG GHI LỖI XẢY RA
--   Ở ĐÂU. Thiếu cột đó thì tiếng chuông báo động không phân biệt nổi "một tiệm
--   đang hỏng" với "lập trình viên vừa bấm F5". Và một tiếng chuông kêu vì
--   chuyện không đâu là tiếng chuông người ta sẽ ngừng nghe — đúng lúc nó kêu
--   thật thì không còn ai quay đầu lại.
--
-- ┌─ CÁCH CHỮA: GHI THÊM, KHÔNG GIẤU BỚT ─────────────────────────────
-- Lỗi máy dev VẪN VÀO SỔ như cũ — bộ kiểm `so-loi-smoke.mjs` dựa vào đúng
-- đường đó, và "sổ trống" với "không có lỗi nào" trông giống hệt nhau nên
-- không được phép bịt đường ghi. Chỉ đổi ĐIỀU KIỆN GÕ CHUÔNG: chuông chỉ đếm
-- dòng `moi_truong = 'production'`.
--
-- ⚠️ `moi_truong` NẰM TRONG DẤU VÂN TAY (tính ở `lib/ghi-loi.ts`), không chỉ là
--   một cột đi kèm. Nếu gom chung thì cùng một lỗi xảy ra ở hai nơi sẽ dồn vào
--   MỘT dòng, và lúc đó mọi cách chọn nhãn đều sai theo một hướng:
--     · giữ nhãn của lượt đầu ⇒ lỗi từng gặp ở máy dev, sau này hỏng thật với
--       khách, vẫn mang nhãn 'local' ⇒ CHUÔNG KHÔNG BAO GIỜ KÊU. Giấu lỗi thật.
--     · nâng nhãn lên 'production' ⇒ lỗi hỏng thật đã sửa xong, lập trình viên
--       chạm lại ở máy mình, `lan_cuoi` nhích ⇒ CHUÔNG KÊU OAN mãi.
--   Tách theo dấu vân tay thì mỗi nơi một dòng, mỗi dòng một bộ đếm riêng, và
--   không cần chọn giữa hai cái sai.

-- Cả 7 dòng đang có đều đã soi từng dòng và đều sinh ra ở máy lập trình
-- (bằng chứng ở trên), nên `default 'local'` là mô tả ĐÚNG hiện trạng, không
-- phải phỏng đoán cho tiện.
alter table public.app_errors
  add column if not exists moi_truong text not null default 'local'
  check (moi_truong in ('production', 'preview', 'local'));

comment on column public.app_errors.moi_truong is
  'Lỗi xảy ra Ở ĐÂU: production = bản chạy thật (người dùng thật gặp) · preview = bản thử trên Vercel · local = máy lập trình. CHỈ production mới gõ chuông báo động — #372.';

-- ── HÀM GHI: nhận thêm nơi xảy ra ───────────────────────────────────
-- ⚠️ DROP bản 8 tham số rồi CREATE bản 9, KHÔNG để cả hai cùng sống. Thêm tham
--   số không "thay" hàm cũ mà đẻ ra hàm THỨ HAI cùng tên; lúc đó lời gọi 8 tham
--   số vừa khớp cả hai và PostgREST không chọn nổi. Một hàm duy nhất, tham số
--   mới có giá trị mặc định — lời gọi cũ vẫn chạy, không có đường rẽ nào khác.
--
-- ⚠️ MẶC ĐỊNH LÀ 'production', KHÔNG PHẢI 'local'. Đây KHÔNG phải chi tiết vụn:
--   migration này áp lên CSDL TRƯỚC khi mã mới lên bản chạy, nên trong khoảng
--   giữa, máy chủ thật vẫn gọi bằng 8 tham số. Mặc định 'local' thì suốt khoảng
--   đó mọi lỗi thật của khách bị xếp vào "máy lập trình" và CHUÔNG CÂM — đúng
--   loại hỏng tệ nhất, vì nhìn từ ngoài nó giống hệt "không có lỗi nào". Mặc
--   định 'production' thì cái giá của việc đoán sai chỉ là một tiếng chuông
--   thừa, và chuông thừa thì có người đọc và sửa được.
--   Sau khi mã mới lên bản, không còn lời gọi nào thiếu tham số này nữa.
drop function if exists public.ghi_loi_ung_dung(text, text, text, text, text, text, uuid, uuid);

create function public.ghi_loi_ung_dung(
  p_dau_van_tay text,
  p_noi text,
  p_loi text,
  p_vet text,
  p_duong_dan text,
  p_trinh_duyet text,
  p_tenant_id uuid,
  p_user_id uuid,
  p_moi_truong text default 'production'
) returns void
language plpgsql
security definer set search_path = public, pg_temp as $$
begin
  insert into public.app_errors as e (
    dau_van_tay, noi, loi, vet, duong_dan, trinh_duyet, tenant_id, user_id, moi_truong
  ) values (
    p_dau_van_tay,
    p_noi,
    left(coalesce(p_loi, ''), 500),
    left(coalesce(p_vet, ''), 3000),
    left(coalesce(p_duong_dan, ''), 300),
    left(coalesce(p_trinh_duyet, ''), 300),
    p_tenant_id,
    p_user_id,
    -- Giá trị lạ ⇒ 'production'. Trường này đến từ tầng ứng dụng; để nguyên thì
    -- `check` ném lỗi, mà hàm GHI LỖI tự ném lỗi là nuốt mất lỗi gốc — mất cả
    -- dòng ghi. Nên phải quy về một giá trị hợp lệ, và giá trị đó là cái KÊU
    -- CHUÔNG: đoán sai theo hướng kêu thừa thì có người đọc và sửa; đoán sai
    -- theo hướng im lặng thì không ai biết là đã đoán.
    case when p_moi_truong in ('preview', 'local') then p_moi_truong else 'production' end
  )
  on conflict (dau_van_tay) do update
    set so_lan = e.so_lan + 1,
        lan_cuoi = now(),
        -- Lỗi tái phát sau khi đã đánh dấu xử lý ⇒ MỞ LẠI. Giữ nguyên "đã xử
        -- lý" là giấu mất một lỗi đang xảy ra thật.
        da_xu_ly_luc = null,
        duong_dan = coalesce(excluded.duong_dan, e.duong_dan);
        -- KHÔNG đụng `moi_truong`: nó đã nằm trong dấu vân tay, nên hai dòng
        -- đụng nhau ở đây chắc chắn cùng một nơi xảy ra.
end $$;

revoke all on function public.ghi_loi_ung_dung(text, text, text, text, text, text, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.ghi_loi_ung_dung(text, text, text, text, text, text, uuid, uuid, text)
  to service_role;

-- ── CHUÔNG BÁO ĐỘNG: chỉ đếm lỗi của bản chạy thật ──────────────────
CREATE OR REPLACE FUNCTION public.scan_user_failures()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_since timestamptz;
  v_now timestamptz := now();
  v_webhook int;
  v_bot int;
  v_platform int;
  v_bridge int;
  v_loi_moi int;
  v_loi_lap int;
  v_loi_dau text;
  v_total int;
  v_body text;
begin
  -- Ép kiểu an toàn: giá trị rác trong bảng cấu hình mà ném lỗi thì cả hàm
  -- chết, và việc soát lỗi lại thành thứ im lặng không chạy.
  begin
    select value::timestamptz into v_since
      from private.app_config where key = 'user_failure_mark';
  exception when others then
    v_since := null;
  end;
  if v_since is null then v_since := v_now - interval '1 hour'; end if;

  select count(*) into v_webhook from public.webhook_events
   where error is not null and processed_at > v_since;
  select count(*) into v_bot from public.bot_outbox
   where status = 'failed' and coalesce(sent_at, claimed_at, created_at) > v_since;
  select count(*) into v_platform from public.platform_outbox
   where status = 'failed' and coalesce(sent_at, claimed_at, created_at) > v_since;
  select count(*) into v_bridge from public.tg_bridge_queue
   where status = 'failed' and coalesce(done_at, created_at) > v_since;

  -- ── LỖI NGƯỜI DÙNG GẶP TRÊN MÀN HÌNH ────────────────────────────────
  -- ⚠️ Đếm THEO DẤU VÂN TAY, không theo số lượt. Một lỗi lặp 500 lần vẫn là MỘT
  --   việc phải sửa; đếm theo lượt thì một vòng lặp hỏng ở trình duyệt của MỘT
  --   người sẽ nhấn chìm mọi lỗi khác trong tin báo.
  --
  -- ⚠️ Tách LỖI MỚI khỏi LỖI CŨ CÒN TÁI DIỄN. Lỗi mới là thứ vừa hỏng — cần biết
  --   ngay. Lỗi cũ tái diễn là thứ đã biết mà chưa sửa. Trộn chung thì tin báo
  --   nào cũng như tin báo nào, và người ta ngừng đọc.
  --
  -- ⚠️ CHỈ ĐẾM `moi_truong = 'production'` (#372). Từ 18:15 tới 21:00 ngày 22/08
  --   chuông kêu 6 lần liên tiếp, và soi ra CẢ 7 dòng trong sổ đều sinh ra trên
  --   máy lập trình — máy dev cầm khoá dịch vụ thật nên ghi thẳng vào sổ thật.
  --   Không lọc thì mỗi lần lập trình viên bấm F5 là founder nhận một báo động
  --   "người dùng đang hỏng việc". Bản thử (`preview`) cũng không tính: URL đó
  --   chỉ người trong nhà mở, hỏng ở đó không ai mất tiền.
  select count(*) into v_loi_moi from public.app_errors
   where lan_dau > v_since and da_xu_ly_luc is null and moi_truong = 'production';
  select count(*) into v_loi_lap from public.app_errors
   where lan_cuoi > v_since and lan_dau <= v_since and da_xu_ly_luc is null
     and moi_truong = 'production';

  -- Lời lỗi đến từ TRÌNH DUYỆT NGƯỜI LẠ. Cắt ngắn và bỏ ký tự xuống dòng trước
  -- khi ghép vào tin báo — không làm vậy thì một người có thể dựng chuỗi trông
  -- như nhiều dòng cảnh báo thật của hệ thống.
  select replace(replace(left(loi, 90), E'\n', ' '), E'\r', ' ')
    into v_loi_dau
    from public.app_errors
   where lan_dau > v_since and da_xu_ly_luc is null and moi_truong = 'production'
   order by so_lan desc limit 1;

  v_total := v_webhook + v_bot + v_platform + v_bridge + v_loi_moi + v_loi_lap;

  -- Dời mực nước DÙ CÓ HAY KHÔNG có lỗi: không dời thì lần sau đếm lại đúng
  -- đợt cũ và báo trùng mãi.
  insert into private.app_config (key, value) values ('user_failure_mark', v_now::text)
  on conflict (key) do update set value = excluded.value;

  if v_total = 0 then return 0; end if;

  v_body := '⚠️ ' || v_total || ' việc hỏng ảnh hưởng người dùng (kể từ lần soát trước)';
  if v_webhook > 0 then v_body := v_body || E'\n· ' || v_webhook || ' tin khách xử lý hỏng'; end if;
  if v_bot > 0 then v_body := v_body || E'\n· ' || v_bot || ' thông báo nhân viên không gửi được'; end if;
  if v_platform > 0 then v_body := v_body || E'\n· ' || v_platform || ' chuông báo không gửi được'; end if;
  if v_bridge > 0 then v_body := v_body || E'\n· ' || v_bridge || ' câu hỏi bot trả lời hỏng'; end if;
  if v_loi_moi > 0 then
    v_body := v_body || E'\n· ' || v_loi_moi || ' LỖI MỚI trên màn hình người dùng';
    if v_loi_dau is not null then v_body := v_body || E'\n  ↳ ' || v_loi_dau; end if;
  end if;
  if v_loi_lap > 0 then v_body := v_body || E'\n· ' || v_loi_lap || ' lỗi cũ chưa sửa vẫn đang tái diễn'; end if;

  perform public.platform_notify('user_failure', 'fail:' || v_now::text, v_body);
  return v_total;
end $function$;

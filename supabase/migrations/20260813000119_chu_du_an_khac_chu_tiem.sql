-- LEO THANG QUYỀN — "chủ tiệm" bị nhận nhầm thành "chủ dự án".
--
-- Bắt được 13/08 khi dò việc #133 (chuông nền tảng báo nhầm người). Đào tới
-- gốc thì lỗ rộng hơn nhiều so với tưởng ban đầu.
--
-- ══ LỖ HỔNG ══
-- Ba hàm dưới đây đều hỏi CÙNG MỘT CÂU SAI:
--     "người này có phải chủ/quản trị của MỘT TIỆM NÀO ĐÓ không?"
-- trong khi câu cần hỏi là:
--     "người này có phải CHỦ DỰ ÁN không?"
--
-- Vì `create_tenant()` cấp cho `authenticated` và tự đặt người gọi làm
-- `owner`, còn đăng ký iFan là tự phục vụ, nên chuỗi khai thác đầy đủ là:
--   1. người lạ đăng ký iFan          → có vai `authenticated`
--   2. bấm tạo tiệm                    → tự động thành `owner` tiệm của họ
--   3. Cài đặt → liên kết Telegram     → tự phục vụ, không ai duyệt
--   4. nhắn bot Telegram của founder   → `tg_who_is` trả `is_staff = true`
--   5. cầu nối đặt `isOwner = true`    → nạp lời dặn CHỦ DỰ ÁN + cờ
--      `--permission-mode acceptEdits` ⇒ **sửa file thẳng trên máy founder**,
--      đọc mã nguồn, và tiêu vào gói Claude của founder.
--
-- Nói cách khác: `TELEGRAM_OWNER_IDS` (danh sách cho phép, đúng ý định) bị
-- nhánh `is_staff` VÔ HIỆU HOÀN TOÀN. Dòng cảnh báo lúc khởi động cầu nối
-- ("chưa khai TELEGRAM_OWNER_IDS — không ai sửa được gì") vì thế đang NÓI SAI.
--
-- ══ VÌ SAO LỌT ══
-- Migration #99 sáng nay chữa lỗi ngược lại: máy chủ không có biến
-- `TELEGRAM_OWNER_IDS` nên webhook coi CHÍNH founder là người thường. Chữa
-- đúng hướng (đọc từ CSDL thay vì thêm biến môi trường) nhưng **đọc nhầm
-- bảng**: lấy `tenant_members` thay vì `platform_admins`. Tiếng Việt gọi cả
-- hai là "chủ" nên trôi qua cả lúc viết lẫn lúc đọc lại.
--
-- Chữa "founder bị coi là khách" bằng cách biến "mọi chủ tiệm thành founder"
-- — đổi một lỗ nhỏ lấy một lỗ to hơn nhiều.
--
-- ══ NGUỒN SỰ THẬT ĐÚNG — ĐÃ CÓ SẴN, CHỈ LÀ KHÔNG DÙNG ══
-- `platform_admins` có từ ADR-0007 (mục 2), RLS bật không policy, là nền của
-- `is_platform_admin()`. Hôm nay chứa đúng 1 hàng = founder. Ba hàm dưới đây
-- chuyển hết sang đọc bảng đó.
--
-- ══ HAI VAI PHẢI TÁCH BẠCH, KHÔNG ĐƯỢC GỘP LẠI LẦN NỮA ══
--   · CHỦ DỰ ÁN (`platform_admins`) — trợ lý lập trình đầy đủ, sửa file, model
--     mạnh, không hạn mức, nhận chuông nền tảng.
--   · CHỦ TIỆM (`tenant_members.role in owner/admin`) — LÀ KHÁCH HÀNG. Đúng
--     luật founder đã chốt: *"user thường chỉ được hỏi những thứ công khai"*.
--     Cho họ hỏi việc trong tiệm mình là tính năng riêng (việc #128), phải
--     THIẾT KẾ rồi mở, không phải rơi vào do nhầm bảng.
--
-- ══ BỎ HẲN `is_staff` KHỎI `tg_who_is` ══
-- Trường đó có đúng 3 nơi dùng, và CẢ BA đều dùng sai làm cổng quyền founder.
-- Giữ lại là để nguyên cái bẫy cho lần sau. Cùng lý do đã gỡ `kb_published_for`
-- ở migration #117: không để lại đường chết trông giống đường đúng.
--
-- Thứ tự triển khai an toàn: migration này lên trước, mã Vercel lên sau. Trong
-- khoảng giữa, webhook cũ đọc `is_staff` sẽ nhận `undefined` ⇒ `isOwner=false`
-- ⇒ founder tạm bị coi là khách. **Hỏng về phía ĐÓNG**, đúng chiều an toàn.

-- ── 1. tg_who_is — trả 'is_founder', bỏ hẳn 'is_staff' ────────────────────
create or replace function public.tg_who_is(p_key text, p_tg_user text)
returns jsonb
language plpgsql
stable
security definer set search_path = pg_temp as $$
declare
  v_uid    uuid;
  v_name   text;
  v_founder boolean := false;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  select l.user_id into v_uid
    from public.user_telegram_links l where l.telegram_user_id = p_tg_user;

  if v_uid is null then
    return jsonb_build_object('linked', false);
  end if;

  select coalesce(p.display_name, u.email) into v_name
    from auth.users u
    left join public.profiles p on p.user_id = u.id
   where u.id = v_uid;

  -- CHỦ DỰ ÁN chứ không phải chủ tiệm. Xem khối chú thích đầu file.
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = v_uid
  ) into v_founder;

  return jsonb_build_object(
    'linked', true, 'user_id', v_uid,
    'name', coalesce(v_name, 'bạn'), 'is_founder', v_founder
  );
end $$;

-- ── 2. tg_platform_target — chuông nền tảng gửi cho CHỦ DỰ ÁN ─────────────
--
-- Bản #99 lấy "chủ/quản trị tiệm nối gần nhất" ⇒ khách hàng nào nối Telegram
-- sau founder là chiếm luôn chuông: cảnh báo của founder bay sang máy họ, còn
-- founder im lặng không nhận nữa và không có gì báo.
create or replace function public.tg_platform_target(p_key text)
returns text
language plpgsql
stable
security definer set search_path = pg_temp as $$
declare v_id text;
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  -- Nhiều chủ dự án thì lấy người nối gần nhất — chuông này là chuông RIÊNG,
  -- gửi cả nhóm là làm loãng cảnh báo (giữ nguyên lập luận của #99).
  select l.telegram_user_id into v_id
    from public.user_telegram_links l
    join public.platform_admins pa on pa.user_id = l.user_id
   order by l.linked_at desc
   limit 1;

  return v_id;
end $$;

-- ── 3. platform_notify — chỉ đứng yên khi KHÔNG AI nhận được ──────────────
--
-- Ý định của #102 vẫn đúng (còn đường nào nhận thì vẫn ghi), chỉ sai chỗ đo
-- "có đường nào": nó đếm cả Telegram của khách hàng. Hệ quả: tiệm khách nối
-- Telegram là đủ để hệ thống tưởng chuông đã bật, trong khi founder chưa nối
-- gì cả.
create or replace function public.platform_notify(
  p_kind text, p_dedupe_key text, p_body text
)
returns void
language plpgsql
volatile
security definer set search_path = public, pg_temp as $$
begin
  if (select value from private.app_config where key = 'platform_bot_chat_id') is null
     and not exists (
       select 1 from public.user_telegram_links l
        join public.platform_admins pa on pa.user_id = l.user_id
     ) then
    return;
  end if;

  insert into public.platform_outbox (kind, dedupe_key, body)
    values (p_kind, p_dedupe_key, p_body)
  on conflict (dedupe_key) do nothing;
end $$;

-- Giữ nguyên quyền gọi như trước (không nới, không siết) — cả ba đều tự chốt
-- bằng `p_key` đối chiếu `bot_ingest_key`, trừ platform_notify vốn là hàm nội
-- bộ do trigger gọi.
revoke all on function public.tg_who_is(text, text) from public;
grant execute on function public.tg_who_is(text, text) to anon, authenticated;
revoke all on function public.tg_platform_target(text) from public;
grant execute on function public.tg_platform_target(text) to anon, authenticated;

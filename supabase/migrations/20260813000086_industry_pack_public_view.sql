-- ============================================================
-- iFan.asia — Migration #86: đọc pack ngành công khai, không đăng nhập
-- (ADR-0011 mục 5.3/6 việc 4 — trang /nganh/[slug])
--
-- industry_packs đã bật RLS với policy SELECT true (migration #60, cột
-- content KHÔNG chứa dữ liệu tenant nào — chỉ là mẫu điều khoản/thẻ/câu trả
-- lời/dịch vụ dùng chung) nhưng GRANT lại chỉ cấp cho `authenticated`
-- (`revoke all ... from anon`) nên khách vãng lai chưa đọc được.
--
-- Theo đúng quy ước đã dùng cho mọi trang công khai khác (storefront_view,
-- livechat_session, qr_resolve...): KHÔNG mở GRANT SELECT thẳng trên bảng
-- cho anon — bọc qua hàm `security definer` trả về đúng phần cần, để nếu
-- bảng industry_packs sau này thêm cột nhạy cảm thì trang công khai không
-- tự động lộ theo.
-- ============================================================

create or replace function public.industry_pack_view(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select content from public.industry_packs where key = p_key;
$$;

comment on function public.industry_pack_view(text) is
  'Đọc content 1 pack ngành cho trang công khai /nganh/[slug] — không đăng nhập. '
  'Trả về null nếu key sai (route xử lý thành notFound).';

revoke all on function public.industry_pack_view(text) from public;
grant execute on function public.industry_pack_view(text) to anon, authenticated;

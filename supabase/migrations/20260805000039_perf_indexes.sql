-- =============================================================================
-- #39 — Chỉ mục hiệu năng cho hai màn dùng nhiều nhất: Khách hàng và Hộp thư
-- =============================================================================
-- Bối cảnh đo (tenant thử 25.000 khách · 10.000 hội thoại, đo bằng
-- `explain analyze` trên DB thật, script `scripts/perf-bench.mjs`):
--
--   Trước → sau (thời gian chạy trong máy chủ, trung vị)
--   • Khách hàng · danh sách trang 1 (50)      30,6ms → 1,3ms   (23×)
--   • Khách hàng · trang sau (cursor)          27,0ms → 1,1ms   (21×)
--   • Khách hàng · lọc "của tôi"              112,5ms → 1,7ms   (68×)
--   • Hộp thư · danh sách tất cả (25)          13,4ms → 0,6ms   (20×)
--   • Hộp thư · đang mở (25)                   13,0ms → 0,6ms   (25×)
--   • Hộp thư · chưa gán (25)                  12,6ms → 0,7ms   (17×)
--   • Hộp thư · của tôi (25)                   13,7ms → 1,0ms   (13×)
--   • Hộp thư · chưa trả lời (25)               4,5ms → 0,8ms   (5×)
--
-- Nguyên nhân gốc của cả hai: KHÔNG có chỉ mục nào khớp thứ tự sắp xếp mà web
-- dùng, nên Postgres phải đọc TOÀN BỘ dòng của tiệm rồi mới sắp xếp lấy 25–50
-- dòng đầu. Chi phí tăng TUYẾN TÍNH theo số khách / số hội thoại — tiệm càng
-- đông càng chậm, đúng chỗ chủ tiệm mở nhiều nhất.
--
-- Không nới lỏng bất kỳ policy nào — chỉ thêm chỉ mục.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Khách hàng — sắp xếp mặc định "mới nhất trước" + phân trang theo con trỏ
--    Câu web dùng (app/app/contacts/queries.ts):
--      .is('deleted_at', null).order('created_at', desc).lt('created_at', cursor)
--    Chỉ mục cũ gần nhất là contacts_lead_score_idx (tenant_id, lead_score desc,
--    created_at desc) — chỉ phục vụ sắp xếp "khách nóng trước", KHÔNG phục vụ
--    sắp xếp mặc định. Chỉ mục này cũng đỡ luôn:
--      · bộ lọc "của tôi" (owner_id) — policy contacts_select lọc sau, index cho
--        thứ tự nên dừng sớm thay vì quét hết;
--      · đếm "khách mới 7 ngày" ở Tổng quan (khoảng thời gian trên created_at).
-- ---------------------------------------------------------------------------
create index if not exists contacts_recent_idx
  on public.contacts (tenant_id, created_at desc)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2) Hộp thư — sắp xếp theo tin mới nhất
--    Câu web dùng (app/app/inbox/queries.ts):
--      .order('last_message_at', { ascending: false, nullsFirst: false })
--    ⇒ ORDER BY last_message_at DESC **NULLS LAST**.
--    Chỉ mục cũ conversations_inbox_idx (tenant_id, status, last_message_at desc)
--    hỏng ở HAI điểm:
--      · cột status nằm giữa, mà bộ lọc là `status <> 'closed'` (bất đẳng thức)
--        nên không dùng được phần thứ tự phía sau;
--      · mặc định của Postgres cho DESC là NULLS FIRST — LỆCH với NULLS LAST của
--        web, nên ngay cả chỉ mục (tenant_id, last_message_at desc) cũng vô dụng.
--        Phải ghi rõ `nulls last` thì planner mới đi thẳng theo chỉ mục.
--    Một chỉ mục này phủ CẢ 5 bộ lọc (tất cả · đang mở · chưa trả lời · chưa gán
--    · của tôi) — đã đo riêng từng biến thể partial index, không cái nào thêm
--    được gì đáng kể mà lại tốn thêm chi phí ghi mỗi khi có tin nhắn mới.
-- ---------------------------------------------------------------------------
create index if not exists conversations_recent_idx
  on public.conversations (tenant_id, last_message_at desc nulls last);

analyze public.contacts;
analyze public.conversations;

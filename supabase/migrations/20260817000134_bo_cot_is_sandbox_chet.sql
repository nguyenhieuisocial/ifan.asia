-- ============================================================
-- iFan.asia — Migration #134: bỏ `domain_events.is_sandbox` — cột chết,
-- vi phạm D2 đang sống (task #145, quyết định đã chốt ở ADR-0019 mục 11).
--
-- Thêm 01/08 (migration #2), mặc định `false`. Soát khắp kho `.ts`/`.tsx`/
-- `.mjs`: 0 chỗ ghi, 0 chỗ đọc, 16 ngày liền. Đo lại trên CSDL thật: cả
-- 842 dòng `domain_events` hiện có đều `is_sandbox=false` — chưa từng có
-- dòng nào được ghi `true`. Không view/index/policy/hàm nào tham chiếu cột
-- này (đã soát `pg_depend`/`pg_indexes`/`pg_policies`/`pg_proc` trước khi va).
--
-- Đã cân đường "cho nó producer" (chép `tenants.is_sample` xuống từng dòng
-- sự kiện) — BỊ TỪ CHỐI: dựng nơi thứ hai cho một sự thật đã có nơi thứ
-- nhất là vi phạm D1, và nơi thứ hai sẽ lệch khi một tiệm đổi cờ. Cần lọc
-- dữ liệu demo thì nối sang `tenants.is_sample` tại thời điểm truy vấn
-- (đúng cách migration #133/việc #148 vừa làm cho `platform_status()`),
-- không chép xuống `domain_events`.
-- ============================================================

alter table public.domain_events drop column is_sandbox;

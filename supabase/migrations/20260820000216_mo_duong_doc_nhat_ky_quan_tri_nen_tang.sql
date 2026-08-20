-- Mở đường ĐỌC cho nhật ký quản trị nền tảng. Cố ý KHÔNG mở đường ghi.
--
-- ═══════════════════════════════════════════════════════════════════
-- GHI VÀO RỒI KHÔNG AI ĐỌC ĐƯỢC — đo 20/08 trên dữ liệu thật
-- ═══════════════════════════════════════════════════════════════════
--     admin_audit_logs   RLS bật: true   ·   số chính sách: 0
--     21 dòng, từ 04/08 tới 11/08
--     platform_overview.read 10 · tenant_health.read 10 · open_invoices.read 1
--     5 hàm ghi vào: admin_open_invoices · admin_pending_help_requests ·
--                    admin_platform_overview · admin_record_payment ·
--                    admin_tenant_health
--
-- **Bật RLS mà không có chính sách nào = chặn sạch.** Vai `authenticated` có
-- quyền SELECT trên bảng (đã đo: `has_table_privilege` = true), nhưng RLS không
-- có chính sách nào cho phép ⇒ mọi câu đọc ra 0 dòng. Kể cả dựng xong màn xem
-- nhật ký thì màn đó cũng trắng.
--
-- Đây là **vết DUY NHẤT** ghi lại "người quản trị nền tảng đã mở dữ liệu của
-- tiệm nào, lúc nào". Không mất tiền, không mất dữ liệu — nhưng khi có tiệm
-- thật thì đây là câu hỏi họ có quyền hỏi, và hiện chúng ta không trả lời được.
--
-- Cùng lớp bệnh với ba chuyện khác trong ngày: **thứ được ghi ra mà không ai
-- đọc thì bằng không ghi**. Khác ở chỗ ba cái kia thiếu MÀN, còn cái này thiếu
-- cả QUYỀN — nên nếu chỉ dựng màn thì màn sẽ trắng và người dựng sẽ đi tìm
-- nhầm chỗ.
--
-- ═══════════════════════════════════════════════════════════════════
-- CỐ Ý KHÔNG THÊM CHÍNH SÁCH GHI — đây là phần quan trọng nhất
-- ═══════════════════════════════════════════════════════════════════
-- Năm hàm ghi vào bảng này đều `security definer` (đã đo) ⇒ chúng chạy bằng
-- quyền chủ hàm và **đi vòng qua RLS**. Nghĩa là đường ghi ĐANG CHẠY ĐƯỢC và
-- không cần chính sách nào.
--
-- Thêm một chính sách INSERT ở đây sẽ mở cho **người dùng thường tự bịa dòng
-- nhật ký**. Một quyển nhật ký mà người bị ghi cũng ghi được vào thì nó không
-- còn là bằng chứng — nó chỉ là một bảng dữ liệu.
--
-- Cũng KHÔNG thêm UPDATE/DELETE: nhật ký kiểm toán phải chỉ-thêm. Ai cần dọn
-- dữ liệu cũ thì làm bằng migration có ghi sổ, không làm bằng một nút bấm.
--
-- ⇒ Chỉ mở đúng SELECT, và chỉ cho vai quản trị nền tảng.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO KHÔNG CHO CHỦ TIỆM ĐỌC PHẦN CỦA TIỆM MÌNH
-- ═══════════════════════════════════════════════════════════════════
-- Nghe hợp lý — "tiệm có quyền biết ai đã xem dữ liệu của mình" — nhưng bảng
-- này có cột `tenant_id` NULL được (các thao tác toàn nền tảng như
-- `platform_overview.read` không thuộc tiệm nào). Mở theo tiệm thì phải quyết
-- những dòng NULL đó ai thấy, và quyết sai là lộ nhịp làm việc nội bộ của iFan
-- cho khách. Đó là **quyết định sản phẩm**, không phải quyết định kỹ thuật —
-- để founder chốt, đừng chốt hộ trong một migration.
-- Việc theo dõi riêng: #207.

create policy admin_audit_logs_select on public.admin_audit_logs
  for select
  using ((select public.is_platform_admin()));

comment on table public.admin_audit_logs is
  'Nhật ký: người quản trị NỀN TẢNG đã mở dữ liệu xuyên tiệm nào, lúc nào. CHỈ-THÊM. Đường ghi đi qua 5 hàm `security definer` nên KHÔNG cần chính sách INSERT — và cố ý không có: thêm INSERT là mở cho người dùng tự bịa dòng nhật ký, lúc đó quyển sổ hết là bằng chứng. Cũng không có UPDATE/DELETE. Chính sách SELECT thêm ở #216 sau khi đo được bảng bật RLS mà có ĐÚNG 0 chính sách — 21 dòng ghi từ 04/08 chưa ai đọc nổi.';

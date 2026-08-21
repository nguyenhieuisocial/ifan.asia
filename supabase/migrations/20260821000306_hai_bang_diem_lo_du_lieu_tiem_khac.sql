-- ════════════════════════════════════════════════════════════════════
-- HAI BẢNG TỔNG HỢP ĐIỂM ĐANG LỘ DỮ LIỆU CỦA MỌI TIỆM
-- ════════════════════════════════════════════════════════════════════
--
-- Founder báo màn Ưu đãi & Tích điểm hỏng: *"Không tải được dữ liệu."* Đi tìm
-- nguyên nhân thì lỗi hiển thị hoá ra là **triệu chứng của một lỗ cách ly tiệm**.
--
-- ĐO ĐƯỢC, với một người dùng thuộc ĐÚNG MỘT tiệm:
--     loyalty_balances → 1.061 dòng của 6 TIỆM   (đúng ra: chỉ tiệm mình)
--     loyalty_debt     →     6 dòng của 6 TIỆM   (đúng ra: 1 dòng)
--
-- Tức chủ tiệm A đọc được **điểm tích của từng khách ở tiệm B**, và tổng nợ
-- điểm quy ra tiền của mọi tiệm trên nền tảng.
--
-- NGUYÊN NHÂN: hai view này không khai `security_invoker`. Mặc định của
-- PostgreSQL là view chạy bằng quyền **CHỦ SỞ HỮU view**, nên RLS của bảng gốc
-- (`loyalty_balances` dựng trên `loyalty_ledger`) KHÔNG được áp dụng. Chính
-- sách cách ly tiệm vẫn nằm nguyên trên bảng — nó chỉ bị đi vòng qua.
--
-- ⚠️ Điều đáng ghi hơn cả bản vá: **lỗi hiển thị đang CHE lỗ này lại.**
-- `layTongNoDiem()` gọi `.maybeSingle()`, mà view trả 6 dòng nên thư viện ném
-- lỗi và màn báo hỏng. Nếu câu đó viết `.limit(1)` thay vì `.maybeSingle()`,
-- màn sẽ chạy êm ru và **hiện số của một tiệm nào đó không phải tiệm mình** —
-- lỗ nằm im vô thời hạn. Một màn báo hỏng ồn ào tốt hơn một màn chạy êm mà sai.
--
-- ⚠️ Vì sao bộ nghiệm thu 662 ca không bắt: nó quét **BẢNG**, và bảng gốc thì
-- đúng chính sách. View là một tầng khác, và tầng đó chưa từng có ca nào canh.
-- Đã thêm ca kiểm cùng lượt (xem `rls-smoke.mjs`).

alter view public.loyalty_balances set (security_invoker = true);
alter view public.loyalty_debt     set (security_invoker = true);

comment on view public.loyalty_balances is
  'Điểm còn lại của từng khách. security_invoker=true (#306) — thiếu nó là view chạy quyền chủ sở hữu và đi vòng qua RLS, lộ điểm khách của mọi tiệm.';
comment on view public.loyalty_debt is
  'Tổng nợ điểm quy ra tiền theo tiệm. security_invoker=true (#306) — xem ghi chú ở loyalty_balances.';

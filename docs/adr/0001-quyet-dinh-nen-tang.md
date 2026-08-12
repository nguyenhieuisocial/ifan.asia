# ADR-0001 — Các quyết định nền tảng đã chốt (01/08/2026)

Nguồn: "Bản thiết kế kỹ thuật chi tiết" trong vault (04 Kế hoạch). Code phải theo các quyết định này; đổi = viết ADR mới, không sửa ADR cũ.

1. **Data layer:** supabase-js thuần + types generate từ schema. CẤM Prisma/Drizzle/Kysely (ESLint chặn).
2. **Policy RLS luôn bọc `(select ...)`** quanh `current_tenant_id()`/`app_role()` để cache initplan — mẫu chuẩn ở migration #2.
3. **Enum trạng thái = `text + check`** (trừ `tenant_role` đã là enum). Tiền = `bigint` VNĐ. Thời điểm = `timestamptz`. Email = `citext`. Số lượng kho = `numeric(14,3)`.
4. **Slug tenant 3–30 ký tự**, danh sách reserved trong bảng `reserved_slugs` + trigger chặn.
5. **Luôn ≥1 owner active** mỗi tenant — trigger `ensure_last_owner`.
6. **domain_events là outbox duy nhất** liên module; client không ghi thẳng — chỉ `emit_event()` (có `source_module`, `dedupe_key`).
7. **Secrets** (token kênh, key thanh toán) → Supabase Vault, không cột plaintext. API key chỉ lưu SHA-256 hash.
8. **Mã nguồn mở:** MIT/Apache được tham khảo + copy có ghi công (THIRD-PARTY-NOTICES.md). AGPL/GPL/ELv2/SUL (Chatwoot pre-fork, Twenty, ERPNext, Odoo, Cal.com EE, n8n...) = CHỈ đọc học kiến trúc, KHÔNG dán code vào repo này.
9. **Bộ thư viện chuẩn** (xem vault "Bộ thư viện chuẩn"): shadcn/ui, TanStack Query v5, react-hook-form + zod, next-intl (vi mặc định), date-fns + @date-fns/tz, nuqs, lucide-react, sonner. Danh sách CẤM: moment/dayjs/luxon, formik/yup, MUI/antd/chakra, Redux/zustand, axios/ky, socket.io/pusher, styled-components/emotion.
10. **Thanh toán VN:** PayOS làm cổng VietQR chính (billing + đối soát hóa đơn tenant), MoMo/VNPay nộp hồ sơ song song, tích hợp khi duyệt.
11. **Sau `create_tenant` phải `auth.refreshSession()`** — claim tenant chỉ có trong token mới.

## Điều kiện xem lại

- **Khi có khách (hoặc luật) buộc dữ liệu phải đặt tại Việt Nam** ⇒ đọc lại mục 1 + mục 7, và ADR-0002 mục 1. Đường lui đã tính sẵn (toàn bộ là chuẩn mở), nhưng phải viết ADR mới chứ không sửa mục này.
- **Khi PayOS không duyệt hồ sơ, hoặc đổi chính sách/phí** ⇒ mục 10 mất căn cứ; MoMo/VNPay lên làm cổng chính.
- **Khi một thư viện trong danh sách CẤM (mục 9) trở thành thứ bắt buộc phải dùng** ⇒ **KHÔNG sửa mục 9**. Viết ADR mới nêu rõ việc gì không làm được nếu không có nó — vì danh sách này tồn tại để chặn thói quen, không phải để chặn nhu cầu thật.
- **Khi số lượng module vượt sức chịu của `domain_events` làm outbox duy nhất** (đo: độ trễ xử lý sự kiện, không phải cảm giác) ⇒ mục 6.

-- ════════════════════════════════════════════════════════════════════
-- KHÔNG CHO MỘT BUỔI HẸN TRỎ SANG LIỆU TRÌNH CỦA TIỆM KHÁC
-- ════════════════════════════════════════════════════════════════════
--
-- Cổng `soat-canh-cheo-tiem` bắt được cạnh mới sinh ra ở #310:
--
--     appointments.series_id → appointment_series
--
-- Người của tiệm A ghi được một dòng `appointments` mang `tenant_id = A`
-- nhưng `series_id` trỏ sang một bản ghi `appointment_series` của tiệm B.
-- RLS chỉ so `tenant_id` của chính dòng đó nên thấy khớp và cho qua — cạnh
-- trỏ chéo hoàn toàn lọt lưới.
--
-- Hậu quả: đọc số buổi của liệu trình sẽ ra con số của tiệm khác, và lệnh
-- "huỷ cả liệu trình" của tiệm A sẽ quét theo `series_id` — tức là chạm vào
-- các buổi hẹn của tiệm B.
--
-- ┌─ CHỮA BẰNG KHOÁ NGOẠI GHÉP ───────────────────────────────────────
-- Thay khoá ngoại một cột bằng khoá ngoại HAI cột `(series_id, tenant_id)`.
-- Cơ sở dữ liệu tự bảo đảm liệu trình phải cùng tiệm — không cần trigger, và
-- không có đường lách nào kể cả khi ai đó viết một câu lệnh mới sau này.
--
-- ⚠️ KHÔNG dùng được `on delete set null` với khoá ghép: nó sẽ set null CẢ
--   `tenant_id`, mà cột đó `not null`. Không sao — trigger
--   `appointment_series_go_lien_ket` (#311) đã gỡ cả `series_id` lẫn
--   `series_index` TRƯỚC khi bản ghi bị xoá, nên tới lượt khoá ngoại thì
--   không còn dòng nào trỏ tới nữa.
--
-- ⚠️ Khoá ngoại ghép theo kiểu mặc định (MATCH SIMPLE) BỎ QUA dòng có bất kỳ
--   cột nào null — nên buổi hẹn lẻ (`series_id` null) vẫn ghi bình thường.

-- Điều kiện để làm khoá ngoại ghép: bên được trỏ tới phải có khoá duy nhất
-- trên đúng cặp cột đó.
alter table public.appointment_series
  drop constraint if exists appointment_series_id_tenant_uniq;
alter table public.appointment_series
  add constraint appointment_series_id_tenant_uniq unique (id, tenant_id);

alter table public.appointments
  drop constraint if exists appointments_series_id_fkey;
alter table public.appointments
  drop constraint if exists appointments_series_cung_tiem;
alter table public.appointments
  add constraint appointments_series_cung_tiem
  foreign key (series_id, tenant_id)
  references public.appointment_series (id, tenant_id);

comment on constraint appointments_series_cung_tiem on public.appointments is
  'Liệu trình của một buổi hẹn PHẢI cùng tiệm. Khoá ngoại một cột không chặn được: RLS chỉ so tenant_id của chính dòng đó nên cạnh trỏ chéo tiệm lọt lưới — #320.';

# ADR-0022 — V5: Két sắt & Hợp đồng

**Ngày:** 18/08/2026 · **Trạng thái:** chốt phạm vi, code ngay sau khi viết

---

## 1. Hai mảng, một đợt — vì sao gộp được

ADR-0021 đã tách `ketSat` và `soQuy` ra riêng đúng lý do: sổ quỹ đã chạy từ V3, két sắt chưa có gì. Nay tiếp tục đợt V5 gồm hai mảng:

- **Két sắt & Công nợ** (`ketSat`): chốt sổ ca + công nợ nhà cung cấp
- **Hợp đồng & Gói định kỳ** (`contractsBilling`): bán gói dịch vụ + hợp đồng buổi học

Hai mảng gộp được vì: cùng wave v3v5, cùng nhóm "Vận hành tiệm", bảng CSDL không chồng chéo, và đều vừa với một đợt theo kinh nghiệm V3–V4 (6–8 bảng + 2 màn chính là giới hạn an toàn).

---

## 2. Đo thật trước khi quyết (18/08, CSDL Singapore)

| Đo | Kết quả |
|---|---|
| Bảng đã có từ V4 | `purchases`, `purchase_lines`, `suppliers`, `stock_moves`, `stock_levels` |
| Công nợ NCC hiện tại | Chưa có — `purchases` ghi tổng tiền phải trả nhưng không có bảng thanh toán |
| Chốt sổ ca | Chưa có — sổ quỹ có `cash_entries` nhưng không có chốt ca |
| Hợp đồng gói | Hoàn toàn chưa có — tiệm đang bán lẻ từng buổi, không bán gói |
| Tiệm spa demo | Có 5 dịch vụ, 24 lịch hẹn, chưa có gói buổi nào |

**Kết luận:** cả hai mảng đều trắng từ đầu, không có nợ kỹ thuật từ đợt cũ.

---

## 3. QUYẾT ĐỊNH 1 — Chốt sổ ca: SO SÁNH đếm thực tế với kỳ vọng từ sổ

Cuối mỗi ca, quản lý đếm tiền mặt trong két. Con số đó phải khớp với:

```
tiền đầu ca + thu tiền mặt trong ca − chi tiền mặt trong ca = kỳ vọng
```

Tất cả con số thu/chi lấy từ `cash_entries` (fund='cash') từ đầu ca. **Không lưu từng mục nhỏ vào bảng chốt ca** — bảng chốt ca chỉ ghi **snapshot**: đầu ca, thực tế, kỳ vọng, và chênh lệch sinh ra bằng cột computed.

**Vì sao lưu kỳ vọng thay vì tính lại:** người dùng có thể nhập thêm/sửa cash_entries sau khi chốt. Lưu snapshot giúp hồ sơ chốt ca trung thực với thời điểm chốt thật, không bị bóp méo bởi chỉnh sửa hậu kỳ.

**Phạm vi "một ca":** từ thời điểm ca trước chốt đến lúc chốt ca hiện tại. Nếu chưa có ca nào được chốt thì tính từ đầu lịch sử (toàn bộ `cash_entries` fund='cash').

**Không có tính năng "mở ca":** tiệm nhỏ không bấm "Bắt đầu ca" — họ chỉ cần "Chốt ca". Ứng dụng tự tính khoảng thời gian ca dựa vào timestamp ca trước.

---

## 4. QUYẾT ĐỊNH 2 — Công nợ NCC: theo dõi số dư, không làm kế toán kép

Mỗi phiếu nhập hàng (purchases, status='completed') là một khoản nợ nhà cung cấp. Khi trả tiền → ghi một dòng `supplier_payments`. Công nợ còn lại = tổng phiếu nhập − tổng đã trả.

**Cố ý KHÔNG làm:** lịch trả tiền (installment schedule), lãi chậm, hạn thanh toán per-phiếu, tự động khớp payment với phiếu — đó là kế toán thật, không phải sổ theo dõi cho tiệm nhỏ.

Một lần trả có thể **ghi chú phiếu nào** (purchase_id nullable) để tiện đối soát, nhưng không bắt buộc.

**Tiền trả NCC đi vào sổ quỹ không?** Có — ghi tay một dòng `cash_entries (direction='out', category='supplier_payment')` vẫn là cách cũ. V5 thêm `supplier_payments` để biết NCC nào còn nợ bao nhiêu — không thay thế sổ quỹ, bổ sung cho nó.

---

## 5. QUYẾT ĐỊNH 3 — Gói dịch vụ: template tái dùng, hợp đồng là bản sao tại thời điểm mua

`service_packages` = template (tên · số buổi · hiệu lực · giá niêm yết).  
`contracts` = bản mua thật (copy số buổi + giá tại thời điểm mua). Không dùng FK trực tiếp cho số liệu — gói có thể đổi giá/số buổi sau khi đã bán.

**Điều này giống hệt `order_lines` sao chép giá từ `item_costs` tại thời điểm bán** (ADR-0019 mục 6).

---

## 6. QUYẾT ĐỊNH 4 — Sử dụng buổi: trigger giữ `sessions_used` đồng bộ

Thêm một dòng vào `contract_sessions` → trigger tự tăng `contracts.sessions_used` và tự chuyển status sang 'completed' khi dùng hết. Không cho phép thêm buổi khi sessions_used ≥ sessions_total (trigger block).

Cùng triết lý với `stocktakes_sinh_dong_kho` (V4) và `order_payments_emit_cash_entry` (V3): chốt ở CSDL, không ở giao diện.

---

## 7. Schema V5

### Migration #153 — Két sắt & Công nợ

```
shift_closings (id · tenant_id · closed_by · shift_date · opening_cash · actual_cash · expected_cash · variance[computed] · note · created_at)
supplier_payments (id · tenant_id · supplier_id · purchase_id[nullable] · amount_vnd · payment_method · paid_at · note · recorded_by · created_at)
```

**RLS shift_closings:** owner/admin/manager — chốt ca là thao tác quản lý.  
**RLS supplier_payments:** owner/admin/manager — cùng nhóm quyền giá vốn.

### Migration #154 — Hợp đồng & Gói

```
service_packages (id · tenant_id · name · description · sessions_total · validity_days[nullable] · price_vnd · status · created_by · created_at · updated_at)
contracts (id · tenant_id · contact_id · package_id · sessions_total · sessions_used · starts_at · expires_at[nullable] · price_paid_vnd · payment_method · status · note · created_by · created_at · updated_at)
contract_sessions (id · tenant_id · contract_id · appointment_id[nullable] · redeemed_at · note · recorded_by · created_at)
```

**RLS service_packages:** owner/admin/manager — tạo/sửa gói. **SELECT:** mọi vai (nhân viên cần xem gói để bán).  
**RLS contracts:** mọi vai SELECT; owner/admin/manager INSERT/UPDATE/DELETE — nhân viên cần thấy hợp đồng khách, nhưng chỉ quản lý tạo/huỷ.  
**RLS contract_sessions:** mọi vai — nhân viên cần đổi buổi cho khách.

---

## 8. Màn UI V5

### `/app/ketsat` — Két sắt & Công nợ

2 tab: **Chốt ca** · **Nợ NCC**

**Tab Chốt ca:**
- Danh sách ca đã chốt (gần nhất trước)
- Nút "Chốt ca ngay" → form: tiền đầu ca (tự điền từ actual_cash ca trước hoặc 0), tiền đếm thực tế, ghi chú
- Sau chốt hiện ngay kết quả (chênh lệch)

**Tab Nợ NCC:**
- Danh sách nhà cung cấp (từ `suppliers`, chỉ NCC đã có phiếu nhập hoàn thành)
- Mỗi NCC: tổng phiếu nhập − tổng đã trả = còn nợ
- Nút "Ghi trả tiền" → form: số tiền, hình thức, ghi chú, chọn phiếu nhập (optional)

### `/app/contracts` — Hợp đồng & Gói định kỳ

2 tab: **Hợp đồng** · **Gói dịch vụ**

**Tab Hợp đồng:**
- Danh sách hợp đồng đang hoạt động (active trước, completed sau)
- Mỗi hợp đồng: tên khách, tên gói, X/Y buổi đã dùng, hạn dùng
- Nút "Dùng buổi" trực tiếp từ danh sách (nếu canManage)
- Nút "Tạo hợp đồng" → chọn khách + chọn gói + giá + hình thức thanh toán

**Tab Gói dịch vụ:** (chỉ owner/admin/manager thấy)
- Danh sách gói (active trước)
- Tạo/lưu trữ gói

---

## 9. Phạm vi CẮT khỏi V5

| Thứ cắt | Lý do | Đợt nào |
|---|---|---|
| Khoá kỳ kế toán | Cần thêm bảng audit + luật append-only phức tạp hơn V5 | V6+ |
| Bàn giao ca giữa 2 người | Ít tiệm cần, có thể dùng note | V6+ |
| Installment NCC | Kế toán thật — ngoài phạm vi "sổ theo dõi" | Ngoài roadmap |
| Gói tính theo tháng (subscription) | Cần billing engine + auto-renew | V6 contractsBilling |
| Báo cáo công nợ NCC | Đủ để V5 thêm số liệu vào /reports | V6 |
| Tích hợp contract_session ↔ appointments tự động | Cần UX phức tạp | V6 |

*(Điều kiện xem lại: khi có tiệm chuỗi 5+ nhân viên → khoá kỳ trở thành cần thiết, bàn giao ca cũng vậy.)*

---

*Tạo 18/08/2026 — áp dụng ngay trong cùng phiên làm việc.*

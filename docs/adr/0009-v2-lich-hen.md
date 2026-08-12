# ADR-0009 — V2 "Lịch hẹn": cắt phạm vi theo cái ĐO ĐƯỢC, và tách bảng dịch vụ ra khỏi V3 (12/08/2026)

**Trạng thái:** đã quyết, CHƯA thi công. Mở đợt **V2 — Lịch hẹn**.
**Người quyết:** Opus 5, phiên 12/08 (ngay sau khi V1.5 đóng 3/3).
**Thay/đính chính:** mục 17 (hồ sơ 5 phần V2, viết 10/08) · hàng V2 của bảng 34.7 · hợp đồng 24b (máy trạng thái).
**Ràng buộc gốc:** luật **D2** (chưa có code ghi thì chưa tạo) · bất biến 1 (chặn ở CSDL, không ở giao diện) · bất biến 12 (liên kết chéo qua `domain_events`) · luật nghiệm thu 34.7 (mỗi mục có hồ sơ 5 phần trước khi code).

---

## 1. Vì sao phải viết ADR này khi mục 17 đã có hồ sơ 5 phần

Mục 17 viết **10/08**. Từ đó tới nay đổi ba thứ nó không biết:

1. `business_hours` + `business_closures` + `tenants.timezone` **đã dựng thật** (migration #80, đợt V1.5) — mục 17 còn coi đó là việc của V2.
2. Đo ra **không có đường gửi tin cho khách** — mà "khách được nhắc tự động" là câu chuyện bán của cả đợt.
3. Đo ra **bảng dịch vụ chưa ai quyết đặt ở đâu**, trong khi không có nó thì không tính được slot.

Mục 17 vẫn đúng về **tư tưởng và 5 phần luồng**; ADR này chỉ **cắt phạm vi + chốt hợp đồng dữ liệu** cho khớp thực tế đo được.

## 2. Đo thật trước khi quyết (12/08, trên CSDL Singapore + kho code)

| Đo | Kết quả |
|---|---|
| 6 bảng lõi lịch hẹn (`appointments`, `services`, `resources`, `staff_services`, waitlist, hồ sơ ca) | **0/6 tồn tại** — không bảng nào tái dụng được |
| `btree_gist` (cần cho EXCLUDE chống trùng) | **ĐÃ BẬT sẵn** (v1.7) — không phải xin Supabase |
| Bộ hẹn giờ nền | `pg_cron` đang chạy **18 job** — nhắc lịch chỉ là thêm 1 job |
| Giờ mở cửa / ngày nghỉ / múi giờ | **ĐÃ CÓ** (migration #80) — V2 chỉ ĐỌC |
| Đường gửi tin cho **khách** | **KHÔNG CÓ.** `bot_outbox.user_id` NOT NULL ⇒ chỉ gửi được cho nhân viên. Zalo OA chưa cắm (chờ pháp nhân), email còn kẹt giới hạn |
| Người dùng thật | 2 tiệm thật · **0 khách · 0 việc · 0 tiệm khai giờ mở cửa** · ~1,1 người/tiệm |
| `appointment.*` trong `docs/EVENT_CATALOG.md` | **0 dòng** — thiếu là trả hồ sơ (bất biến 12) |

**Kết luận đo:** nền kỹ thuật vững hơn dự đoán (chống trùng + hẹn giờ + giờ mở cửa đều sẵn), nhưng **hai lỗ chặn thẳng vào lời hứa của đợt**: không có kênh tới khách, và không có bảng dịch vụ.

## 3. QUYẾT ĐỊNH 1 — Cắt "khách được nhắc tự động" khỏi V2, nói thẳng thay vì hứa suông

Câu chuyện bán của V2 trong 34.7 là *"Chốt lịch ngay trong chat, khách được nhắc tự động"*. **Vế sau không giao được**: không có kênh nào tới khách.

**Chốt:**
- **Nhắc NHÂN VIÊN: tự động** (kênh đã chạy thật — `bot_outbox` + `activities` + chuông trong app).
- **Nhắc KHÁCH: soạn sẵn, lễ tân BẤM GỬI** qua đúng khung chat đang mở. Máy không tự gửi thay tiệm.
- Câu chuyện bán V2 sửa thành: **"Chốt lịch ngay trong chat, không bao giờ trùng giờ, không quên ai."**

**Vì sao không chờ Zalo OA rồi làm luôn một thể:** chờ pháp nhân là chờ vô hạn hạn, mà giá trị lớn nhất của lịch hẹn (không trùng giờ, thấy được ngày mai ai làm gì) **không phụ thuộc kênh khách**. Khi Zalo OA cắm xong, chỉ thêm một adapter vào `NotifyChannel` đã có sẵn — không đập lại gì.

Quyết định này **trùng khớp** một chốt đã có từ trước (34.4/T3b: *"V2 KHÔNG tự gửi tin thay tiệm khi chưa có kênh khách hợp lệ"*). Ở đây chỉ nâng nó lên thành ràng buộc phạm vi, và **sửa câu chuyện bán cho khỏi hứa sai**.

## 4. QUYẾT ĐỊNH 2 — `services` thuộc V2, KHÔNG chờ V3

Ba nguồn nói ba kiểu: spec cũ có bảng `services` riêng · hợp đồng 24a gộp dịch vụ vào `items` · bảng 34.7 xếp catalog ở **V3**.

**Chốt: V2 dựng `services` ở mức TỐI THIỂU.** Lý do dứt điểm: **thời lượng dịch vụ là thuộc tính của LỊCH, không phải của bán hàng.** Không biết "gội đầu 45 phút" thì không tính được slot trống, không chặn được trùng, không có gì để đặt. Đẩy sang V3 là để V2 mất luôn lõi của chính nó.

**Tối thiểu nghĩa là gì** (cắt theo D2 — chưa có màn nào ghi thì chưa tạo cột):
- CÓ: `name` · `duration_minutes` · `price_vnd` · `is_active` · `sort_order` · seed sẵn theo pack ngành.
- KHÔNG: biến thể, ảnh, nhóm/danh mục, giá sỉ, thuế, tồn kho — **đó là V3**, `items` của 24a mở rộng lên từ đây.

**Hệ quả ghi rõ để V3 không đập:** V3 khi dựng catalog phải **mở rộng `services`**, không tạo bảng thứ hai cùng nghĩa. Nếu V3 chọn gộp vào `items`, thì đó là việc **di trú `services` → `items`**, phải viết ADR riêng, không lặng lẽ tạo bảng song song.

## 5. QUYẾT ĐỊNH 3 — Máy trạng thái còn 5, cắt 2 trạng thái không có ai sinh ra

Mục 17 ghi 4 trạng thái, hợp đồng 24b ghi 6. Chốt **5**:

```
booked → arrived → done
      ↘ cancelled (kèm lý do + ai huỷ)
      ↘ no_show
```

**Cắt `draft`:** cần một trình đặt lịch nhiều bước mới sinh ra được — V2 đặt một phát từ khung chat, không có bước nháp. Không có ai ghi = **vi phạm D2**.

**Cắt `confirmed`:** trạng thái này chỉ có nghĩa khi **khách xác nhận**. Không có kênh tới khách (quyết định 1) ⇒ không ai sinh ra nó ⇒ cắt. Khi Zalo OA có, thêm lại bằng migration — thêm một giá trị vào tập trạng thái rẻ hơn nhiều so với sống chung với một trạng thái luôn rỗng và ai đọc cũng tưởng có nghĩa.

**Giữ `no_show` tách khỏi `cancelled`:** hai chuyện khác hẳn nhau về tiền và về cách cư xử với khách. Gộp là mất luôn số liệu "mất bao nhiêu tiền vì khách không tới".

## 6. QUYẾT ĐỊNH 4 — Chống trùng nằm ở CSDL, không ở giao diện

Hai ràng buộc `EXCLUDE` dùng `btree_gist` (đã bật sẵn):
- `(tenant_id, staff_user_id, tstzrange(start_at, end_at))` — một thợ không ở hai chỗ.
- `(tenant_id, resource_id, tstzrange(start_at, end_at))` — một giường không nhận hai khách.

Chỉ áp cho trạng thái **còn giữ chỗ** (`booked`, `arrived`) — huỷ/no-show phải nhả chỗ ra.

**Bắt buộc:** hai người đặt cùng lúc thì CSDL thắng, người sau nhận câu **"slot vừa được giữ, chọn giờ khác"** — cấm lỗi câm, cấm lỗi kỹ thuật trần (luật luồng 3).

## 7. Phạm vi V2 — ĐÚNG 6 việc, không hơn

| # | Việc | Ghi chú |
|---|---|---|
| 1 | Migration nền: `services` + `resources` + `appointments` + 2 EXCLUDE + RLS + seed dịch vụ mẫu theo pack | Khai `appointment.*` vào `EVENT_CATALOG.md` **trong cùng migration này** |
| 2 | Thẻ design (Opus) | Màn Lịch · đặt lịch từ chat · cài đặt dịch vụ/tài nguyên. ~~founder duyệt~~ — bỏ 13/08, xem luật toàn quyền ở `00 Trang chủ.md` mục 6 |
| 3 | Cài đặt → Dịch vụ & Tài nguyên | owner/admin |
| 4 | Màn **Lịch** (ngày/tuần, theo người + tài nguyên) | nav trục 2 |
| 5 | Đặt lịch **từ khung chat Hộp thư** | cửa vào chính; ≤15 giây |
| 6 | Nhắc: nhân viên tự động + tin soạn sẵn cho khách (bấm gửi) | thêm 1 job `pg_cron` |

**CẮT khỏi V2, ghi rõ để không ai tưởng bị quên:** waitlist · hàng chờ walk-in · hồ sơ ca (ảnh trước–sau) · PIN máy chung (31.80) · sinh nhật + lịch âm (S5) · digest 4 dòng (S4) · feature-gate theo gói (M4) · thu cọc thật (S1) · đệm ca + lượt khách (31.75) · `staff_services` (gán dịch vụ cho thợ) · lịch lặp (31.14).

**Vì sao cắt `staff_services`:** đo ra **~1,1 người/tiệm**. Bảng "thợ nào làm được dịch vụ nào" chỉ có nghĩa khi nhiều thợ và nhiều dịch vụ. Dựng bây giờ = bảng rỗng ở mọi tiệm (D2). Khi có tiệm ≥3 thợ dùng thật thì thêm.

**Vì sao cắt waitlist/walk-in:** cả hai chỉ có giá trị khi lịch **đã kín**. Chưa tiệm nào có một lịch hẹn nào.

## 8. Nghiệm thu (vào `scripts/rls-smoke.mjs` — luật D3, phải thấy ĐỎ ít nhất một lần)

| Ca | Ngưỡng đạt |
|---|---|
| Hai lịch trùng giờ **cùng thợ** | CSDL **từ chối**, không phải giao diện chặn |
| Hai lịch trùng giờ **cùng tài nguyên** | CSDL **từ chối** |
| Lịch đã `cancelled` / `no_show` | **KHÔNG chặn** lịch mới vào đúng khung giờ đó |
| Tiệm A đọc/sửa lịch tiệm B | **0 dòng** |
| Nhân viên `staff` sửa lịch không phải của mình | **Bị chặn** |
| Đặt lịch ngoài giờ mở cửa / trúng ngày nghỉ | **Cảnh báo rõ**, không im lặng cho qua |
| Xoá mềm lịch | Vào thùng rác 30 ngày (bất biến 11), không xoá cứng |

Thêm bộ kiểm thuần cho hàm tính slot trống, **chạy trên ≥4 múi giờ** — bài học 12/08: bộ ca chỉ chạy giờ quốc tế thì xanh giả, trong khi 100% tiệm Việt Nam hỏng (xem `scripts/storefront-hours-smoke.mjs`).

## 9. Hệ quả

- **Thêm:** `services`, `resources`, `appointments` + 2 EXCLUDE; màn Lịch; đặt-lịch-từ-chat; cài đặt dịch vụ/tài nguyên; 1 job nhắc; các dòng `appointment.*` trong `EVENT_CATALOG.md`.
- **Sửa hợp đồng cũ:** 24b (máy trạng thái 6 → 5) · 34.7 hàng V2 (cắt 11 mục, sửa câu chuyện bán) · mục 17 (giữ 5 phần, phạm vi đọc theo ADR này).
- **Không đụng:** mọi bảng/hàm của V1a/V1b/V1.5. `business_hours`/`business_closures` chỉ ĐỌC.
- **Nợ ghi sổ, không được im lặng bỏ:** khi Zalo OA cắm xong ⇒ thêm adapter vào `NotifyChannel`, thêm trạng thái `confirmed`, bật nhắc khách tự động. Ba việc này đi cùng nhau, không tách.

## Điều kiện xem lại

- **Khi Zalo OA cắm xong** ⇒ ba việc đi CÙNG NHAU, không tách: thêm adapter vào `NotifyChannel` · thêm trạng thái `confirmed` · bật nhắc khách tự động. Đây là lý do quyết định 1 và 3 tồn tại ở dạng hiện tại.
- **Khi có tiệm thật từ 3 thợ trở lên dùng hằng ngày** ⇒ `staff_services` (gán thợ ↔ dịch vụ) hết lý do bị cắt; đo lúc quyết là ~1,1 người/tiệm.
- **Khi có tiệm nào lịch kín tới mức phải từ chối khách** ⇒ waitlist và hàng chờ walk-in mới có nghĩa. Đo lúc quyết: chưa tiệm nào có một lịch hẹn nào.
- **Khi bắt đầu thu cọc thật** ⇒ đọc lại quyết định 3 (máy trạng thái 5 trạng thái) — tiền đặt cọc thường kéo theo nhu cầu phân biệt "đã giữ chỗ" với "đã xác nhận".

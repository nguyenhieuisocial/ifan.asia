# ADR-0019 — V3 "Tiền thật": gộp `services` vào `items`, một đơn nhiều dòng thay cho bảng `visits`, và trả nợ thuế suất từ 31.77 (17/08/2026)

**Trạng thái:** đã quyết, **CHƯA thi công**. Mở đợt **V3 — Tiền thật**.
**Người quyết:** Opus 5, phiên 17/08 (ngay sau khi kho thẻ design đóng 28/28 mảng).
**Thay/đính chính:** hàng V3 của bảng 34.7 · hợp đồng 24a (thêm vòng đời + quy đổi đơn vị, bỏ `active` bool) · 24c (bỏ `visits`, bỏ cột tổng đơn, chốt thuế suất) · 24h (sổ quỹ) · **ADR-0009 mục 4** (nợ "V3 phải mở rộng `services`, nếu gộp vào `items` thì phải viết ADR riêng" — ADR này chính là cái đó) · **31.77** (nợ "Sonnet ghi 1 ADR khi chạm V3 để chốt vĩnh viễn" — trả ở mục 7).
**Ràng buộc gốc:** **D1** (một sự thật một nơi) · **D2** (chưa có code ghi thì chưa tạo) · **D3** (cổng phải thấy ĐỎ trước khi tin) · bất biến 1 (chặn ở CSDL) · bất biến 3 (một hành động lõi = một đường code) · bất biến 11 (xoá mềm + thùng rác 30 ngày) · bất biến 12 (khai sự kiện ở CẢ HAI nơi).

---

## 1. Vì sao V3 cần ADR riêng chứ không code thẳng theo 34.7

Hàng V3 trong bảng 34.7 gom **13 thứ** vào một đợt: catalog + biến thể · đơn hàng + hoàn/đổi · VietQR · thu chi · kho · thu cọc thật · màn thu gộp lượt khách · giấy dặn dò bản in · và 3 hợp đồng phải sửa trước (24a · 24c · 24h) kèm price_tiers + khuyến mãi/combo/giá theo tay nghề.

Làm đủ 13 thứ là một đợt **không bao giờ đóng**. Và đợt không đóng đúng là con bệnh dự án đang chữa: mục 4 file master vừa ghi lại bẫy *"nhiều tính năng ≠ bán được"*. Một đợt V3 kéo ba tháng rồi giao nửa vời còn tệ hơn một đợt V3 gọn giao trọn.

Ngoài ra có **ba việc bắt buộc phải quyết trước dòng migration đầu tiên**, không quyết là phải đập đi làm lại:

1. `services` (V2 dựng) và `items` (24a) — **một bảng hay hai?** ADR-0009 để ngỏ và ghi nợ.
2. `visits` (31.75) — có dựng bảng lượt khách không?
3. Thuế suất trên dòng hàng — 19d ghi *"KHÔNG VAT"*, 31.77 ghi *"phải có tax_rate"*. **Hai câu này đang đá nhau trên giấy** và 31.77 tự nhận nợ một ADR.

## 2. Đo thật trước khi quyết (17/08, CSDL Singapore + kho code)

| Đo | Kết quả |
|---|---|
| 12 bảng lõi V3 (`items`, `item_variants`, `orders`, `order_lines`, `order_payments`, `cash_entries`, `invoices`, `visits`, `price_tiers`, `stock_moves`, `suppliers`, `vouchers`) | **0/12 tồn tại** |
| Cột bảng `services` (V2) | 9 cột: id · tenant · name · duration_minutes · price_vnd · is_active · sort_order · 2 mốc thời gian. **Không có** loại hàng, giá vốn, đơn vị, nhóm, biến thể, vòng đời |
| Dòng thật trong `services` | **4** (trên 9 tiệm) |
| Dòng thật trong `appointments` | **0** — V2 chạy thật từ 13/08, **4 ngày, chưa ai đặt một lịch nào** |
| Dòng thật trong `resources` | **0** |
| Khoá ngoại trỏ vào `services` | **đúng 1**: `appointments.service_id` |
| Cột cọc trên `appointments` (24b hứa) | **KHÔNG có** — V2 đã tôn trọng D2, không tạo cột để dành |
| Dữ liệu khách thật | 9 tiệm · 111 khách · 74 cơ hội · 50 hội thoại |
| Cấu hình ngân hàng của TIỆM (VietQR cần) | **KHÔNG có cột nào trong toàn bộ 90 bảng** |
| `subscription_payments` | có sẵn khuôn `provider` + `provider_ref` + `amount` — dùng lại làm mẫu cho `order_payments` |
| `btree_gist` · `pgcrypto` · `pgmq` · `pg_cron` (22 job) | **đã bật sẵn** |
| RLS | **90/90 bảng** đã bật |

**Kết luận đo — hai con số đổi hẳn cách cắt đợt:**

- **`services` mới có 4 dòng và 0 lịch hẹn trỏ vào.** Chi phí di trú `services` → `items` sẽ **không bao giờ rẻ hơn lúc này**. Chờ tới khi có nghìn dòng và nghìn lịch hẹn mới gộp là tự chọn phương án đắt nhất.
- **`appointments` = 0 dòng.** Mọi thứ đứng trên "đã có lịch hẹn thật" — cọc chống no-show, gom nhiều ca một lần thu — đều đang xây trên **con số không**. Đó là D2 ở tầng tính năng, không phải tầng cột.

## 3. QUYẾT ĐỊNH 1 — Di trú `services` → `items`, KHÔNG dựng bảng thứ hai

**Chốt: đổi tên `services` thành `items`, thêm cột, không tạo bảng `products` song song.**

Ba phương án đã cân:

| Phương án | Vì sao loại / chọn |
|---|---|
| Giữ `services` + thêm `products` | **LOẠI.** Dòng hàng trong đơn sẽ phải trỏ vào hai bảng ⇒ hai đường tính tiền, hai đường tính lãi gộp, hai màn danh mục. Đây đúng là **vi phạm bất biến 3** (một hành động lõi = một đường code) — và bất biến 3 sinh ra chính vì bệnh "số liệu đá nhau" đã dính 3 lần |
| Giữ `services`, thêm `items` cho hàng hoá, `services` thành view | **LOẠI.** View là "nơi thứ hai" mà D1 cấm. Nơi thứ hai luôn là nơi lỗi thời |
| **Di trú `services` → `items`, một bảng, cột `kind`** | **CHỌN.** Đúng hợp đồng gốc 24a. Trả nợ ADR-0009 mục 4 |

**Việc di trú cụ thể:**
- `alter table services rename to items` + `appointments.service_id` → `item_id` (đổi tên cột, giữ khoá ngoại) + ràng buộc **CSDL** bắt lịch hẹn chỉ trỏ được vào item `kind='service'` (bất biến 1 — không chặn ở giao diện).
- Thêm: `kind` (`service` | `product`) · `cost_vnd` (nullable — giá vốn) · `unit` (product: cái/hộp/chai) · `group_name` · `status`.
- **Bỏ `is_active` bool, thay bằng `status`: `draft → active → discontinued`** (24a việc 46). Lý do: cần soạn giá/ảnh trước khi mở bán, và cần phân biệt "chưa bán" với "ngừng bán" — bool không mang nổi hai nghĩa đó. Ngừng bán **không phải xoá**: thẻ design `man-hang-hoa` đã chốt màn này không có nút Xoá.
- `item_variants`: `item_id` · thuộc tính (jsonb, khai trước trong pack ngành — không tự do) · giá đè · SKU. **Có UI trong V3**, không phải bảng để dành.

**Vì sao variants vào ngay chứ không để V4:** `order_lines` phải có `variant_id` từ dòng đầu tiên. Thêm chiều biến thể vào một đường tính tiền đã chạy vài tháng là đúng cái "lỗi làm-lại kinh điển" mà 24a cảnh báo. Mà đã có cột thì phải có nơi ghi (D2) ⇒ UI đi cùng.

**Đơn vị MUA ≠ đơn vị BÁN (24a việc 52): CẮT khỏi V3.** Hệ số quy đổi chỉ có producer khi có **đơn mua hàng** — mà mua hàng là V4. Dựng bây giờ là cột rỗng ở mọi tiệm. Ghi vào điều kiện xem lại, không im lặng bỏ.

## 4. QUYẾT ĐỊNH 2 — KHÔNG dựng bảng `visits`; "một lượt khách" = MỘT đơn nhiều dòng

31.75 đòi khái niệm `visits` để khách gội + nhuộm (2 thợ) rồi mua 1 chai dầu chỉ **trả tiền một lần, một chứng từ**, và hoa hồng vẫn chia đúng cho từng thợ.

**Chốt: yêu cầu đó đúng, nhưng KHÔNG cần bảng mới.** Đạt được bằng hai cột:

- `order_lines.appointment_id` (nullable) — dòng hàng nào sinh từ ca làm nào.
- `order_lines.performed_by_user_id` (nullable) — **ai làm dòng này**, không phải ai bán cả đơn.

Khi đó "một lượt khách" **chính là một đơn có N dòng**: 2 dòng gắn 2 lịch hẹn của 2 thợ + 1 dòng bán chai dầu. Một lần thu tiền, một chứng từ, hoa hồng đọc theo dòng.

**Vì sao đây là phương án tốt hơn, không phải phương án tiết kiệm:** một bảng `visits` đứng giữa sẽ tạo ra **hai chứng từ cho một lần thu tiền** (lượt khách và đơn hàng) — rồi ai đó sẽ hỏi hai cái đó số có khớp không. Đó là công thức của bệnh số-liệu-đá-nhau, chỉ khác là tự tay dựng lên. Ít thực thể hơn ở đây đồng nghĩa với ít chỗ lệch hơn.

**Hệ quả ghi rõ:** hợp đồng 24c bỏ khái niệm `visits`. 31.75 coi như **đã giao bằng đường khác** — không phải bị cắt.

## 5. QUYẾT ĐỊNH 3 — Sổ sách bất biến: đơn xong thì KHOÁ, hoàn/đổi sinh phiếu MỚI

Máy trạng thái đơn, chốt **5 trạng thái** (24c ghi nhiều hơn):

```
draft → confirmed → completed
      ↘ cancelled (kèm lý do + ai huỷ)
```
Nhánh sau bán: **phiếu hoàn là một ĐƠN MỚI** `kind='return'` trỏ về đơn gốc, số lượng âm.

**Cắt `fulfilling` (đang giao):** chỉ có nghĩa khi có giao hàng — mà ship/vận đơn cắt khỏi V3 (mục 8). Không ai sinh ra = D2.

**Luật cứng — đơn `completed` thì CSDL khoá, không phải giao diện khoá:**
- Không sửa được dòng hàng, không sửa được giá.
- Sửa sai = phiếu điều chỉnh mới. Giống hệt luật đã áp cho `stock_moves` (24d) và hoa hồng (24g).
- **Vì sao:** đơn đã thu tiền là chứng từ. Sửa được chứng từ cũ nghĩa là doanh thu tháng trước có thể đổi sau lưng — và không ai phát hiện. Thẻ design `man-don-hang` đã chốt điểm này.

**Tổng tiền đơn KHÔNG lưu thành cột.** Tính từ dòng hàng, đúng luật 24d đã dùng cho tồn kho (*"tồn = SUM, không cột tồn tự bảo trì — nguồn số-đá-nhau kinh điển"*). Dòng hàng đã khoá thì tổng không trôi được.

**Giảm giá cả đơn được PHÂN BỔ về từng dòng theo tỷ lệ tiền, lưu trên dòng.** Không có cột giảm giá ở đầu đơn. Lý do: lãi gộp tính theo mặt hàng; nếu giảm giá treo ở đầu đơn thì mọi báo cáo lãi theo mặt hàng đều sai lệch một khoản không ai truy được. Một nơi ghi giá = một nơi tính lãi.

## 6. QUYẾT ĐỊNH 4 — VietQR sinh tại chỗ, xác nhận bằng TAY; không hứa tự đối soát

**Đo được:** không có cột ngân hàng nào trong CSDL, và không có kết nối ngân hàng nào.

**Chốt phạm vi V3:**
- **CÓ:** sinh mã QR chuyển khoản theo chuẩn VietQR/EMVCo, **dựng chuỗi và vẽ mã ngay trong máy chủ của mình**, kèm đúng số tiền và nội dung chuyển khoản của đơn.
- **KHÔNG:** tự biết tiền đã về. Thu ngân **bấm "đã nhận tiền"**, máy ghi `order_payments`.
- Cấu hình ngân hàng của tiệm: 3 cột trên `tenants` (mã ngân hàng · số tài khoản · tên chủ tài khoản), ràng buộc **cả ba cùng có hoặc cùng trống**. Owner/admin sửa; mọi vai trong tiệm đọc được (số tài khoản in trên mã QR đưa khách xem — không phải bí mật).

**Vì sao KHÔNG gọi dịch vụ tạo ảnh QR bên ngoài:** gửi số tài khoản + số tiền + tên khách sang máy chủ của bên thứ ba cho mỗi lần thu tiền là rò rỉ dữ liệu tiệm mà không đổi lấy gì — chuỗi VietQR là chuẩn mở, tự dựng được, không tốn phí, không phụ thuộc ai.

**Vì sao không chờ có API ngân hàng rồi làm luôn một thể:** giống hệt lý lẽ của ADR-0009 quyết định 1 — chờ là chờ vô hạn, mà giá trị lớn nhất (khách quét là chuyển đúng số tiền, không gõ nhầm) **không phụ thuộc việc tự đối soát**. Khi có API, chỉ thêm một nguồn ghi vào `order_payments` đã có sẵn.

> ⚠️ **Đừng lẫn với việc founder đang nợ.** Master mục 5 việc 2 (*"điền số tài khoản ngân hàng vào cấu hình nền tảng"*) là tài khoản của **iFan để tiệm trả tiền cho iFan**. Cột nói ở đây là tài khoản của **từng tiệm để khách trả tiền cho tiệm**. Hai thứ khác nhau, đừng gộp — thẻ design `man-thu-tien-vietqr` đã tách rõ ranh giới này.

## 7. QUYẾT ĐỊNH 5 — Thuế suất: trả nợ ADR mà 31.77 tự nhận, và gỡ mâu thuẫn với 19d

**Mâu thuẫn trên giấy:** 19d ghi sổ thu chi *"KHÔNG VAT"*; 31.77 ghi `order_lines` **phải** có thuế suất từ đầu, không thì tới V8 phải sửa đường tính tiền đã chạy nhiều tháng.

**Gỡ: hai câu này nói về hai thứ khác nhau, không mâu thuẫn.**
- 19d là ranh giới của **SỔ QUỸ**: không định khoản kép, không báo cáo thuế, không phải phần mềm kế toán. **Giữ nguyên, không đổi một chữ.**
- 31.77 nói về **CHỨNG TỪ BÁN HÀNG**: dòng hàng ghi lại thuế suất **tại thời điểm bán**. Đó là một sự thật lịch sử, không phải một tính năng kế toán.

**Chốt V3:**
- `order_lines.tax_rate` (số, mặc định lấy từ item, mặc định của item là 0) + `orders.price_includes_tax` (đúng/sai, lấy từ cài đặt tiệm).
- **Cả hai được ghi ở MỌI đơn, ngay từ đơn đầu tiên** — có người ghi thật, không phải cột để dành ⇒ **không vi phạm D2**.
- V3 **KHÔNG** làm: báo cáo thuế · định khoản · hoá đơn điện tử. Đó là V8 (30b).

**Vì sao lưu chứ không tính lại sau:** thuế suất lúc bán là chuyện đã xảy ra. Tính lại từ cài đặt hôm nay sẽ **viết lại lịch sử** mỗi lần đổi thuế suất — cùng đúng một lý do khiến đơn giá phải chốt trên dòng chứ không đọc từ bảng giá.

**Cũng chốt luôn: KHÔNG dựng bảng `invoices` ở V3.** "Hoá đơn cho khách" trong V3 là **cách trình bày của đơn hàng** (bản in / bản chia sẻ), không phải thực thể riêng. Dựng bảng thứ hai để chứa đúng những con số đã có trong đơn là D1 vi phạm. Hoá đơn điện tử có mã số thuế mới là thực thể riêng — V8.

## 8. Phạm vi V3 — ĐÚNG 8 việc, không hơn

| # | Việc | Ghi chú |
|---|---|---|
| 0 | **Thẻ design** | ✅ **ĐÃ XONG 17/08** — `man-hang-hoa` · `man-don-hang` · `man-thu-tien-vietqr` |
| 1 | Migration nền A — di trú `services` → `items` (+ `kind`/`cost_vnd`/`unit`/`group_name`/`status`), `item_variants`, đổi `appointments.service_id` → `item_id` + ràng buộc chỉ nhận `kind='service'` | Sửa cả code V2 đang gọi `services` (màn Cài đặt, màn Lịch, `lib/booking/schedule.ts`, seed, `rls-smoke`) |
| 2 | Migration nền B — `orders` + `order_lines` + `order_payments` + `cash_entries` + RLS + **chặn cột giá vốn với vai `staff`** + 3 cột ngân hàng trên `tenants` | Khai sự kiện vào `docs/EVENT_CATALOG.md` **và** master §32 **trong cùng migration** (bất biến 12) |
| 3 | Màn **Hàng hoá** — danh mục + biến thể + vòng đời 3 trạng thái | Không có nút Xoá |
| 4 | Màn **Đơn hàng** — danh sách theo việc-cần-làm + chi tiết + máy trạng thái + phiếu hoàn | Cửa vào: từ hồ sơ khách · từ khung chat · từ lịch hẹn |
| 5 | **Thu tiền** — VietQR sinh tại chỗ + tiền mặt + chuyển khoản, ghi `order_payments`, thu nhiều lần | Thu ngân xác nhận bằng tay |
| 6 | **Sổ quỹ** — màn Thu chi + tự sinh phiếu thu từ sự kiện `payment.received` | Không gõ hai lần (D1) |
| 7 | **Lãi gộp** — doanh thu − giá vốn, theo mặt hàng và theo kỳ | Đây là vế "biết lời lỗ" của câu chuyện bán |
| 8 | **Nghiệm thu D3** (mục 9) + cập nhật `SU-THAT-SAN-PHAM.md` trong cùng commit | |

**Câu chuyện bán của V3:** *"Bán — thu — biết lời lỗ trong một app."* (giữ nguyên 34.7, vì phạm vi trên giao đủ cả ba vế).

**CẮT khỏi V3, ghi rõ để không ai tưởng bị quên:**

| Cắt | Về đợt nào | Vì sao |
|---|---|---|
| **Kho** (`stock_moves`, tồn, kiểm kê) | **V4 nguyên khối** | 34.7 để "kho sâu" (lô/HSD/FEFO/hao hụt) ở V4 rồi. Làm "kho gọn" ở V3 là **dựng kho hai lần**. Đo: 0 mặt hàng, 0 đơn — chưa có gì để chuyển động |
| Mua vào + nhà cung cấp + quy đổi đơn vị | V4 | Không có đơn mua thì hệ số quy đổi không ai ghi (D2) |
| Thu cọc thật (S1) + cột cọc trên `appointments` | Khi có lịch hẹn thật | Đo: **0 lịch hẹn**. Cọc là vũ khí chống no-show — chưa có ca nào thì chưa có no-show nào |
| Ship · phí ship · địa chỉ giao · mã vận đơn · kênh bán (24c) | V4 | Nhóm khách đo được là spa/salon — không giao hàng. Cột không ai ghi |
| `price_tiers` · khuyến mãi tự áp · combo · giá theo tay nghề (31.44, 31.78) | **UI ở V6** | V3 **đã để sẵn đúng chỗ chúng ghi vào**: đơn giá chốt trên dòng + giảm giá phân bổ về dòng. Chúng thêm cách TÍNH ra con số, không thêm đường ghi thứ hai |
| Hoá đơn điện tử + bảng `invoices` | V8 (30b) | Xem mục 7 |
| Giấy dặn dò bản in (T3b) | V6 (cùng mẫu in) | Một mình nó không đủ để kéo cả cụm mẫu in vào V3 |
| MCP cho trợ lý AI (master dòng 93) | Đợt riêng | Không nằm trong hàng V3 của 34.7; kéo vào là đổi phạm vi giữa đợt |

## 9. Nghiệm thu (vào `scripts/rls-smoke.mjs` — luật D3, phải thấy ĐỎ ít nhất một lần)

| Ca | Ngưỡng đạt |
|---|---|
| Tiệm A đọc/sửa đơn của tiệm B | **0 dòng** |
| Đơn của tiệm A gắn mặt hàng của tiệm B | **CSDL từ chối** |
| Vai `staff` đọc **giá vốn** / lãi gộp | **Bị chặn ở tầng CSDL**, không phải ẩn nút |
| Sửa dòng hàng của đơn đã `completed` | **CSDL từ chối** |
| Hoàn hàng | Sinh **phiếu mới**, đơn gốc **không đổi một chữ** |
| Tổng đã thu > tổng tiền đơn | **Bị chặn** (không thu quá) |
| Ghi hai lần cùng một `provider_ref` | **Bị chặn** (unique — theo khuôn `subscription_payments`) |
| Lịch hẹn trỏ vào item `kind='product'` | **CSDL từ chối** |
| Xoá đơn | Vào **thùng rác 30 ngày** (bất biến 11), không xoá cứng |
| Sổ quỹ sau khi thu tiền | Có **đúng một** phiếu thu, không nhân đôi khi sự kiện chạy lại |

Thêm bộ kiểm thuần cho **phân bổ giảm giá về dòng** (tổng sau phân bổ phải bằng đúng tổng trước, không rơi rớt đồng nào do làm tròn) và cho **chuỗi VietQR** (đối chiếu với ví dụ chuẩn EMVCo, không tự đối chiếu với chính hàm đang kiểm — bài học `booking-schedule-smoke`).

## 10. Hệ quả

- **Thêm:** `items` (từ `services`) · `item_variants` · `orders` · `order_lines` · `order_payments` · `cash_entries` · 3 cột ngân hàng trên `tenants`; 3 màn mới; các dòng `item.*` / `order.*` / `payment.*` / `cash_entry.*` trong `EVENT_CATALOG.md` **và** master §32.
- **Sửa hợp đồng cũ:** 24a (vòng đời thay bool, quy đổi đơn vị dời V4) · 24c (bỏ `visits`, bỏ cột tổng đơn, máy trạng thái 5, chốt thuế suất) · 24h (sổ quỹ đọc từ sự kiện thu tiền) · 34.7 hàng V3 (cắt 8 mục ở bảng trên).
- **Sửa code V2 đang chạy:** mọi chỗ gọi `services` phải đổi sang `items`. Đây là phần rủi ro nhất của đợt — làm ở việc 1, không rải rác.
- **Không đụng:** V1a/V1b/V1.5/V2.5. `business_hours`, `appointments` chỉ thêm/đổi tên cột, không đổi nghĩa.
- **Nợ ghi sổ, không được im lặng bỏ:** khi có API ngân hàng ⇒ thêm nguồn ghi vào `order_payments` (không đổi bảng). Khi có đơn mua ⇒ hệ số quy đổi đơn vị. Khi có lịch hẹn thật ⇒ cọc.

## 11. Hai lỗi bắt được trong lúc đo, không thuộc V3 (đã ghi thành việc theo dõi)

1. **`domain_events.is_sandbox` — cột không ai ghi, không ai đọc**, tồn tại từ 01/08. Tìm khắp kho code: **0 chỗ**. Đây là **vi phạm D2 đang sống** — đúng thứ ADR này vừa từ chối tạo thêm. Không sửa trong V3, nhưng phải quyết: có producer hay bỏ cột.
2. **3 sự kiện `appointment.booked` mồ côi** (12/08, tiệm demo): sự kiện còn, lịch hẹn đã bị **xoá cứng** — trong khi bất biến 11 yêu cầu xoá mềm. Nghi là kịch bản nạp lại dữ liệu mẫu dọn thẳng bằng `delete`. Hệ quả: mọi báo cáo nối sự kiện với lịch hẹn sẽ **rơi mất dòng trong im lặng**.

## Điều kiện xem lại

- **Khi có tiệm thật bán hàng hoá (không chỉ dịch vụ)** ⇒ mở V4 kho + mua vào; lúc đó hệ số quy đổi đơn vị mới có người ghi.
- **Khi có lịch hẹn thật và có no-show thật** ⇒ đọc lại quyết định cắt cọc. Đo lúc quyết: **0 lịch hẹn** sau 4 ngày V2 chạy.
- **Khi có tiệm cần giao hàng** ⇒ ship/vận đơn/địa chỉ giao hết lý do bị cắt.
- **Khi chạm hoá đơn điện tử (V8)** ⇒ đọc lại mục 7; `tax_rate` đã có sẵn trên dòng, chỉ thêm phần xuất hoá đơn, **không được sửa đường tính tiền**. Nếu tới lúc đó phải sửa đường tính tiền thì mục 7 đã sai và phải ghi lại vì sao.
- **Khi số mặt hàng của một tiệm vượt ~500** ⇒ đọc lại quyết định "tổng đơn tính từ dòng, không lưu cột". Đo lúc quyết: 4 dòng `services` toàn hệ thống.

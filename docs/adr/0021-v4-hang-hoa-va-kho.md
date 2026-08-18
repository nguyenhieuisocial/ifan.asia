# ADR-0021 — V4: Hàng hoá & Kho

**Ngày:** 18/08/2026 · **Trạng thái:** đã chốt phạm vi, **chưa code**
**Thay thế:** mục 20 của `Quy hoạch tính năng hợp nhất (10-08)` — mục đó tên "V4 — GIỮ KHÁCH" là **đời đánh số cũ**, nội dung của nó thuộc **V6** theo 34.7. Đừng lấy mục 20 làm hồ sơ V4.

---

## 1. Vì sao V4 cần ADR riêng chứ không code thẳng theo 34.7

34.7 liệt kê cho V4 **chín cụm việc**: sổ kho · tồn · kiểm kê · lô + hạn dùng + FEFO · hao hụt/thu hồi · mua vào + nhà cung cấp · quy đổi đơn vị mua ≠ bán · bàn đóng gói · nhập file đơn sàn + mã vận đơn hàng loạt.

ADR-0019 đã cảnh báo bằng chính kinh nghiệm V3: *"gom 13 thứ vào một đợt là đợt không bao giờ đóng"* — V3 phải cắt xuống 8 việc mới đóng được. Chín cụm trên **không cùng một nghiệp vụ**: bốn cụm đầu là kho của một tiệm bán tại chỗ; ba cụm cuối là thương mại điện tử (bán trên sàn, đóng gói, vận đơn). Gộp chung là đợt không đóng được.

## 2. Đo thật trước khi quyết (18/08, CSDL Singapore + kho code)

| Đo | Kết quả |
|---|---|
| Bảng kho đã có | **KHÔNG CÓ BẢNG NÀO** — `stock_moves` · `stock_levels` · `inventory_counts` · `lots` · `suppliers` · `purchase_orders` đều chưa tồn tại |
| Nền V3 đã có | `items` (8) · `order_lines` **170 dòng** · `orders` (87) · `order_payments` (84) · `cash_entries` (91) · `item_variants` · `item_costs` |
| Mặt hàng | 8 — trong đó **4 là hàng hoá vật lý** (`kind='product'`), 4 là dịch vụ |
| Đơn vị tính đã khai | `chai` (2) · `tuýp` (1) · `miếng` (1) — 4 dịch vụ để trống, đúng |

**Kết luận đo — một câu:** **đã bán ra 170 dòng hàng mà không có một dòng tồn kho nào.**
Nghĩa là hôm nay tiệm bán xong **không biết còn lại bao nhiêu**, và không có gì ngăn bán quá số đang có. Đây là lỗ hổng nghiệp vụ, không phải thiếu tính năng trang trí — và nó là toàn bộ lý do V4 tồn tại.

> ⚠️ Đây là **bảng đo, không phải kết luận sản phẩm**. Số 170 dòng là dữ liệu tiệm MẪU (đã gieo ở việc #161), không phải giao dịch của khách thật — tiệm thật hiện có 0 đơn.

## 3. QUYẾT ĐỊNH 1 — Tồn kho là SỐ TÍNH RA từ sổ, không phải số tự ghi

Dựng **`stock_moves`** làm sổ cái kho **chỉ-thêm** (append-only): mỗi lần nhập, bán, trả, hao hụt, kiểm kê lệch → một dòng, có dấu (+/−), có lý do, có chỗ trỏ về chứng từ gốc.

Tồn hiện tại = **tổng các dòng**, không phải một ô số ai cũng sửa được.

**Vì sao không nuôi một cột `so_luong_ton` cho nhanh:** một ô số bị sửa từ nhiều đường (bán, nhập, kiểm kê, hoàn đơn) là ô **chắc chắn sẽ lệch**, và khi lệch thì **không truy được vì sao** — không ai biết mất ở đâu. Cùng đúng nguyên tắc đã chốt cho tiền ở ADR-0019 mục 5 (sổ sách bất biến, sửa thì sinh phiếu mới). Kho và tiền phải cùng một triết lý, nếu không sẽ có ngày hai bên đá nhau.

Cho phép **một bảng tổng hợp phụ** (tồn theo mặt hàng) để màn hình không phải cộng cả sổ mỗi lần mở — nhưng nó là **bản sao tính lại được**, không phải nguồn sự thật, và phải có công cụ dựng lại từ sổ.

## 4. QUYẾT ĐỊNH 2 — Bán hàng tự trừ kho, và trừ ĐÚNG lúc đơn chốt

Nối vào máy trạng thái đơn đã có của V3: đơn chuyển sang trạng thái đã bán → sinh dòng trừ kho; phiếu hoàn → sinh dòng cộng lại.

**Cấm** trừ kho lúc *tạo* đơn nháp — đơn nháp bị bỏ giữa chừng là chuyện thường ngày, trừ sớm thì tồn bốc hơi mà không ai hiểu vì sao.

**Chốt chặn nằm ở CSDL, không ở màn hình** (bất biến 1): sinh dòng kho phải do trigger/hàm chạy cùng transaction với việc chốt đơn. Nếu chỉ gọi từ giao diện thì mọi đường ghi khác (bot, nhập Excel, sửa tay) sẽ âm thầm bỏ qua kho.

## 5. QUYẾT ĐỊNH 3 — Bán quá tồn thì CẢNH BÁO, không CHẶN

Tiệm nhỏ Việt Nam thường xuyên bán hàng chưa kịp nhập sổ. Chặn cứng = nhân viên đứng trước mặt khách mà không bấm được nút → họ sẽ bỏ phần mềm, ghi giấy.

Vậy: cho bán, nhưng **hiện cảnh báo rõ** và **để tồn xuống âm**, rồi **hiện danh sách mặt hàng đang âm** ở màn Kho để chủ tiệm biết mà đi nhập sổ bù.

**Vì sao không im lặng cho qua:** tồn âm mà không ai thấy thì đúng bằng không có kho. Cảnh báo là để **người quyết định**, chặn là **máy quyết định thay người** — với nghiệp vụ này người phải thắng.

*(Điều kiện xem lại ở cuối file: khi có tiệm dược/thực phẩm thật, luật này phải xét lại — ngành đó bán quá tồn là vi phạm, không phải bất tiện.)*

## 6. QUYẾT ĐỊNH 4 — Nhập hàng đi kèm nhà cung cấp ngay từ đầu, bản TỐI GIẢN

ADR-0019 đã cắt "mua vào + nhà cung cấp" từ V3 sang V4 với lý do: *không có đơn mua thì không ai ghi hệ số quy đổi*. Nay trả nợ đó, nhưng **bản tối giản**:

- `suppliers`: tên · điện thoại · ghi chú. **Không** làm công nợ nhà cung cấp (đó là V5, mảng Két sắt & Công nợ).
- Phiếu nhập: chọn nhà cung cấp, nhiều dòng hàng, mỗi dòng có số lượng + **giá vốn** → sinh dòng kho (+) và cập nhật giá vốn cho `item_costs` đã có.
- **Quy đổi đơn vị mua ≠ đơn vị bán** (mua thùng, bán chai): làm ở mức **một hệ số trên dòng phiếu nhập**, không dựng cả hệ thống đơn vị đo.

**Vì sao không làm công nợ nhà cung cấp luôn:** công nợ kéo theo hạn thanh toán, lịch trả tiền, đối soát — đó là nguyên một mảng của V5. Làm nửa vời ở đây sẽ phải đập đi.

## 7. QUYẾT ĐỊNH 5 — Tách `inventory` và `finance` thành BỐN mảng (trả nợ việc #154)

Chú thích trong `lib/feature-registry.ts` đã tự nhận vấn đề: *"một mảng gộp hai đợt thì không có trạng thái nào diễn tả đúng nó."*

Thực tế đang lệch: `inventory` gắn nhãn **planned** trong khi **danh mục hàng hoá đã chạy thật** (`/app/items`); `finance` gắn nhãn **planned** trong khi **sổ quỹ + lãi gộp đã chạy thật**. Người đọc trang `/tinh-nang` bị bảo là chưa có, dù đang dùng được.

**Chốt: tách đôi mỗi mảng.**

| Mảng mới | Nội dung | Trạng thái đúng |
|---|---|---|
| Hàng hoá (danh mục · biến thể · giá vốn) | đã xong ở V3 | **ready** |
| Kho (tồn · nhập · kiểm kê) | V4 — đợt này | planned |
| Sổ quỹ & Lãi gộp | đã xong ở V3 | **ready** |
| Két sắt & Công nợ (chốt sổ · bàn giao ca · công nợ) | V5 | planned |

**Hệ quả lên cổng mở bán:** bản đồ đi từ **28 → 30 mảng**, số đã xong đi từ **14 → 16**. Điều kiện mở bán founder chốt là *"đủ TOÀN BỘ mảng"* — **không phải một con số** — nên tách mảng **không dời cột mốc**, chỉ làm nhãn trung thực hơn.

> ⚠️ **Cần founder xác nhận trước khi đổi trang công khai.** Đây là quyết định của trợ lý, chạm tới chữ hiện trên `/tinh-nang`. Phần CSDL/thi công của V4 không phụ thuộc vào nó, nên nếu founder bác thì V4 vẫn chạy bình thường.

## 8. Phạm vi V4 — ĐÚNG 6 việc, không hơn

| # | Việc | Xong nghĩa là |
|---|---|---|
| 1 | Migration nền: `stock_moves` + tổng hợp tồn + `suppliers` + RLS đủ 5 vai | Bảng có, luật quyền đủ, dựng lại tồn từ sổ ra đúng số |
| 2 | Thẻ design 3 màn mới (Kho · Phiếu nhập · Kiểm kê) — **vẽ TRƯỚC khi code** | Thẻ khớp luật thiết kế, founder xem được trước |
| 3 | Phiếu nhập hàng + nhà cung cấp (bản tối giản, có hệ số quy đổi) | Nhập xong tồn tăng đúng, giá vốn cập nhật đúng |
| 4 | Bán tự trừ kho + hoàn tự cộng lại (chốt ở CSDL, không ở màn) | Chốt đơn → tồn giảm; hoàn → tồn về, đo bằng phép kiểm |
| 5 | Màn Kho: tồn hiện tại · sắp hết · **đang âm** · lịch sử ra vào từng mặt hàng | Mở màn thấy đúng số, bấm vào thấy vì sao ra vì sao vào |
| 6 | Kiểm kê: đếm thực tế → sinh dòng lệch có lý do + nghiệm thu D3 + cập nhật sổ sự thật | Kiểm xong tồn khớp thực tế, mọi chênh lệch truy được |

### Cố ý KHÔNG làm trong V4 — ghi rõ để không ai tưởng bị quên

| Việc | Dời đi đâu | Vì sao |
|---|---|---|
| **Lô · hạn sử dụng · FEFO** | **V4.5**, mở khi có tiệm dược/thực phẩm/spa dùng thật | Nặng gấp đôi phần còn lại (mỗi dòng kho phải gắn lô, bán phải chọn lô). Làm trước khi có tiệm cần là dựng cho không ai |
| **Ship · vận đơn · kênh bán · bàn đóng gói · nhập file đơn sàn** | **V6** (nhóm thương mại điện tử) | Khác nghiệp vụ hẳn — đây là bán trên sàn, không phải kho của tiệm. Gộp vào là đợt không đóng được |
| **Công nợ nhà cung cấp · lịch trả tiền** | **V5** | Thuộc mảng Két sắt & Công nợ |
| **Hao hụt/thu hồi thành luồng riêng** | gộp luôn vào việc 6 | Chỉ là một lý do của dòng kho, không đáng một luồng riêng |

## 9. Nghiệm thu (vào `scripts/rls-smoke.mjs` — luật D3, phải thấy ĐỎ ít nhất một lần)

Tối thiểu các ca sau, mỗi ca phải **gieo dữ liệu rồi so với mốc biết trước** (không chấp nhận đọc "0 dòng" rồi kết luận — bài học đã dính 4 lần ngày 18/08):

1. Nhập 10 → tồn = 10 · bán 3 → tồn = 7 · hoàn 1 → tồn = 8.
2. Dựng lại tồn từ sổ cho ra **đúng** số bảng tổng hợp đang giữ (chống lệch âm thầm).
3. Bán quá tồn: **cho qua**, sinh cảnh báo, tồn xuống âm, mặt hàng hiện ở danh sách âm.
4. Kiểm kê lệch: sinh **đúng một** dòng chênh có lý do, không sửa thẳng số tồn.
5. Cách ly tiệm: tiệm A không đọc/ghi được kho tiệm B (đủ cả 4 chiều đọc-thêm-sửa-xoá).
6. Vai: nhân viên thường **không** thấy giá vốn/giá nhập; vai Chỉ xem **không** ghi được dòng kho nào.
7. Đơn nháp bị bỏ **không** đụng tới tồn.

## 10. Hệ quả

- `items` cần phân biệt rõ hàng **có quản kho** và hàng **không quản kho** (dịch vụ không có tồn) — nếu không, mọi báo cáo kho sẽ đếm cả dịch vụ.
- Màn Đơn hàng của V3 phải hiện thêm cảnh báo tồn — đụng vào màn đã đóng, phải cập nhật thẻ design của màn đó (đúng bệnh "thẻ đứng im sau khi code đổi" đã lặp 5 lần).
- Sổ sự thật + bản đồ năng lực phải cập nhật cùng lượt, không để đợt sau.

## Điều kiện xem lại

- Khi **có tiệm dược / thực phẩm / spa dùng thật** ⇒ đọc lại mục 5 (bán quá tồn) và mở V4.5 (lô + hạn dùng) — với ngành đó, bán quá tồn hoặc bán hàng hết hạn là **vi phạm**, không phải bất tiện.
- Khi **có tiệm bán trên sàn thật** ⇒ đọc lại bảng mục 8, nhóm thương mại điện tử không còn hoãn được.
- Khi **founder trả lời mục 7** (tách 28 → 30 mảng) ⇒ cập nhật `lib/feature-registry.ts` + trang `/tinh-nang`, và sửa mọi chỗ còn ghi "28 mảng".
- Khi **tồn âm xuất hiện ở tiệm thật lần đầu** ⇒ đọc lại mục 5, xét có cần chặn theo ngành không.

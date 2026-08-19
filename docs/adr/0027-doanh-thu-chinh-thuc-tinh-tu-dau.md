# ADR-0027 — Doanh thu chính thức tính từ đâu: Cơ hội hay Đơn hàng?

**Trạng thái:** CHỜ FOUNDER CHỐT — mọi thứ cần để quyết đã đo xong, chỉ còn chọn.
**Ngày đo:** 20/08/2026 (đo trực tiếp trên CSDL thật, trong một giao dịch rồi rollback)

---

## 1. Vấn đề, nói bằng tiếng người

Phần mềm đang có **hai quyển sổ ghi tiền bán hàng**, và **chúng không biết nhau tồn tại**.

- **Sổ Cơ hội** (mảng CRM): nhân viên theo dõi khách đang quan tâm, khi bán được thì bấm "Thắng" và ghi số tiền.
- **Sổ Đơn hàng** (mảng Bán hàng): lập đơn, chọn món, tính tiền, thu tiền, trừ kho.

Cùng một lần bán, nhân viên có thể ghi vào sổ này, sổ kia, hoặc **cả hai**. Không có gì buộc họ chọn, và không có gì phát hiện ra khi họ ghi hai lần.

---

## 2. Số thật đang có (đo 20/08, không phải ước lượng)

| Nguồn | Số lượng | Tổng tiền |
|---|---:|---:|
| Cơ hội **đã thắng** | 14 | **53.030.000 đ** |
| Đơn hàng **đã xong** | 83 | **50.660.000 đ** |
| Phiếu trả hàng | 1 | −320.000 đ |
| Đơn hàng, sau khi trừ trả hàng | | **50.340.000 đ** |

Ba con số đang hiện trên các màn khác nhau — **53,03tr · 50,66tr · 50,34tr** — đều là số THẬT, chỉ là **ba câu hỏi khác nhau**. Không màn nào sai; cái sai là chưa ai nói rõ màn nào trả lời câu hỏi nào.

### Không có một mối nối nào giữa hai bên

Đã quét toàn bộ lược đồ: **không một cột nào** nối Đơn hàng ↔ Cơ hội. Không có cách nào — kể cả bằng tay — để biết một đơn hàng có phải là kết quả của một cơ hội hay không.

---

## 3. Hậu quả đã đo được, không phải lo xa

### 3.1 Hồ sơ khách đang cộng CẢ HAI sổ — tức đếm đôi

Cột "đã mua" trên hồ sơ khách được nuôi bằng **cả hai nguồn**. Đo từng khách (21 khách có số > 0):

| Khách | Hồ sơ ghi "đã mua" | Từ Cơ hội | Từ Đơn hàng | |
|---|---:|---:|---:|---|
| Phạm Quỳnh Chi | 16.075.000 | 9.600.000 | 6.475.000 | = **cộng cả hai** |
| Lý Gia Hân | 13.040.000 | 7.000.000 | 6.040.000 | = **cộng cả hai** |
| Đỗ Hồng Nhung | 7.355.000 | 3.500.000 | 3.855.000 | = **cộng cả hai** |
| 7 khách khác | | 0 | khớp đơn hàng | = chỉ đơn hàng |
| 11 khách khác | | khớp cơ hội | 0 | = chỉ cơ hội |

**Ba khách đang bị cộng dồn hai sổ.** 18 khách còn lại chỉ nhìn có vẻ đúng vì họ tình cờ chỉ có một nguồn.

### 3.2 Và nó làm hạng khách sai theo

Ngưỡng VIP là **5 triệu**. Phạm Quỳnh Chi hiện ghi 16 triệu; nếu hai sổ đang ghi **cùng một lần bán** thì con số thật có thể chỉ là 9,6tr hoặc 6,5tr. Vẫn trên ngưỡng ở ca này — nhưng cơ chế thì sai, và ở tiệm thật với số nhỏ hơn nó sẽ đẩy khách thường thành VIP, hoặc ngược lại.

### 3.3 Có bao nhiêu khả năng là ghi trùng?

**3/14** cơ hội đã thắng có đơn hàng của **cùng khách** trong vòng ±7 ngày. Đúng ba khách ở bảng trên.

⚠️ **Tôi KHÔNG chứng minh được chúng là cùng một lần bán** — và đó chính là vấn đề: **không có cột nối nên không ai chứng minh được, kể cả chủ tiệm.** Con số "đã mua" vì thế không đáng tin **do cách dựng**, chứ không phải do ai nhập sai.

---

## 4. Ba đường đi, và cái giá của từng đường

### Đường A — Doanh thu chính thức = **Đơn hàng**. Cơ hội chỉ là phễu bán hàng.
- Cơ hội "Thắng" **thôi không còn là tiền**; nó chỉ nói "đã chốt được", còn tiền thì phải lập đơn.
- **Được:** một quyển sổ tiền duy nhất, khớp với kho, khớp với sổ quỹ, khớp với hoa hồng. Mọi con số kế toán về sau đều bám vào đây.
- **Mất:** tiệm nào bán bằng cách "chốt qua chat, không lập đơn" sẽ thấy doanh thu tụt về 0. Cần thêm nút **"Chốt cơ hội → tạo đơn"** để họ không phải nhập hai lần.
- **Khuyến nghị của tôi là đường này.** Lý do: đơn hàng là chỗ DUY NHẤT đã nối sẵn với kho, sổ quỹ, hoa hồng, tích điểm, mã giảm giá và phiếu hoàn. Cơ hội chỉ có một ô số tiền do người gõ tay, không ràng buộc gì cả. Chọn Cơ hội làm nguồn tiền là chọn ô gõ tay làm sổ cái.

### Đường B — Doanh thu chính thức = **Cơ hội**. Đơn hàng chỉ để giao việc và trừ kho.
- **Được:** hợp với tiệm bán dịch vụ giá trị lớn, thương lượng lâu, không có "đơn hàng" theo nghĩa bán lẻ.
- **Mất:** doanh thu **không khớp tiền mặt thật** — con số dựa vào ô người gõ tay, không có gì đối chiếu. Hoa hồng, lãi gộp, sổ quỹ đều đang tính từ đơn hàng nên sẽ phải viết lại hoặc chấp nhận lệch mãi mãi.

### Đường C — Giữ cả hai, nhưng **bắt chọn một** cho mỗi lần bán.
- Thêm cột nối; khi cơ hội chuyển "Thắng" thì hoặc gắn vào một đơn có sẵn, hoặc tạo đơn mới; báo cáo chỉ đếm một lần.
- **Được:** không tiệm nào phải đổi cách làm.
- **Mất:** đắt nhất, và thêm một bước bắt buộc cho nhân viên ở đúng lúc họ đang bận nhất (vừa chốt xong với khách).

---

## 5. Founder chỉ cần trả lời một câu

> **Khi tiệm hỏi "tháng này bán được bao nhiêu", con số đó phải đến từ ĐƠN HÀNG hay từ CƠ HỘI ĐÃ THẮNG?**

Chốt xong câu đó thì phần còn lại là thi công, không cần hỏi lại:
1. Sửa cột "đã mua" trên hồ sơ khách chỉ đọc **một** nguồn (đang cộng cả hai — đây là bug, vá bất kể chọn đường nào).
2. Kéo Tổng quan và báo cáo nguồn về cùng một nguồn.
3. Ghi nhãn rõ trên màn: con số này trả lời câu hỏi gì.
4. Nếu chọn đường A: thêm nút "Chốt cơ hội → tạo đơn".

---

## 6. Việc làm được NGAY, không cần chờ founder

Cột "đã mua" đang cộng cả hai nguồn là **lỗi tính toán**, đúng ở mọi đường A/B/C. Có thể vá độc lập với quyết định trên. Đã ghi thành việc theo dõi riêng.

---

## 7. Điều kiện xem lại

Xem lại ADR này khi: có tiệm thật đầu tiên dùng cả hai mảng · hoặc khi làm hoá đơn VAT (ADR về VAT sẽ buộc phải có một nguồn doanh thu pháp lý duy nhất).

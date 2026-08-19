# ADR-0024 — Dựng lại bản điện thoại: thanh dưới, menu, và đường tới 31 mảng

**Ngày:** 19/08/2026 · **Trạng thái:** ĐANG HOẠCH ĐỊNH — chờ founder chốt 3 quyết định ở mục 4 trước khi vẽ thẻ

---

## 1. Vì sao phải dựng lại, đo bằng số chứ không bằng cảm giác

| Đo được (19/08) | Số |
|---|---|
| Ô trên thanh dưới điện thoại | **4** — cố định trong mã (`MOBILE_NAV_KEYS`) |
| Mục trong menu bên bản máy tính | **25** |
| ⇒ Mục **không có ô nào** trên điện thoại | **21** |
| 21 mục đó nằm ở đâu | Trong **menu sau ảnh đại diện** (`MOBILE_OVERFLOW_ITEMS` → `user-menu.tsx`) |
| Mục trong khu Cài đặt | **22**, sâu thêm một tầng |
| Tổng số trang | **85** |
| Mảng tính năng đang chạy | **31** |

Khung điện thoại này được dựng khi kho còn khoảng **8 mảng**. Từ đó tới nay đã thêm V3 (bán hàng · thu tiền · sổ quỹ), V4 (hàng hoá · kho), V5 (két sắt · hợp đồng), V6 (giữ khách · tự động hoá · tích hợp), V7 (nhân sự · chấm công · bảng lương), V8 (dự án · chat nội bộ · tuyển dụng · sự kiện) — **không lần nào thanh dưới được xét lại**.

Bằng chứng rõ nhất cho việc đó: mã nguồn có sẵn một ghi chú tự dặn *"nav mobile giữ đúng 4 ô… nên phải ĐỔI CHỖ, không thêm"*. Luật đó đúng khi có 8 mảng. Với 31 mảng, nó biến thành **một cái phễu bịt kín**.

---

## 2. Ba chỗ hỏng, theo mức nặng

### 2.1 Bán hàng KHÔNG có ô nào trên điện thoại — nặng nhất

Thanh dưới hiện là: Hôm nay · Hộp thư · Khách · Cơ hội.

Cả cụm **bán hàng tại quầy** — Đơn hàng, Thu tiền, Sổ quỹ, Hàng hoá — **không có ô nào**. Mà đó chính là việc người ta làm **trên điện thoại, đứng tại quầy, trong lúc khách đợi**. Ngược lại, "Cơ hội" là màn đọc-và-xếp, hợp với ngồi trước máy tính hơn.

Nói cách khác: thanh dưới đang ưu tiên đúng thứ **không cần điện thoại**, và giấu đúng thứ **chỉ dùng trên điện thoại**.

### 2.2 Menu tài khoản đang gánh việc của menu điều hướng

21 mục nằm sau ảnh đại diện. Nhưng ảnh đại diện là nơi người ta tìm *"đăng xuất"*, *"đổi mật khẩu"*, *"đổi tiệm"* — **không ai đi tìm "Bảng lương" ở đó**. Đặt điều hướng vào đấy không phải là gọn, mà là **giấu**.

### 2.3 Cài đặt là tầng thứ ba

Muốn tới một mục Cài đặt trên điện thoại: chạm ảnh đại diện → chạm Cài đặt → chọn trong danh sách 22 mục. Ba lần chạm và hai lần đọc danh sách dài, cho những thứ như "Trần giảm giá" mà chủ tiệm cần sửa ngay khi đang tranh luận với nhân viên.

---

## 3. Điều KHÔNG được làm — chốt trước để khỏi đi lạc

- **Không nhồi thêm ô vào thanh dưới.** Quá 5 ô là chạm nhầm; đây là giới hạn tay người, không phải sở thích.
- **Không bê nguyên menu bên của bản máy tính xuống.** 25 mục cuộn dọc trên màn hình 375px là danh bạ, không phải điều hướng.
- **Không giấu mảng nào sau "gõ thẳng địa chỉ".** Một mảng chỉ tới được bằng cách gõ tay thì đúng bằng chưa có — đây là bài học đã lặp nhiều lần trong kho này.
- **Không đổi nhãn giữa hai bản.** Cùng một mảng phải cùng một tên ở điện thoại và máy tính, nếu không thì hướng dẫn và ảnh chụp màn hình đá nhau.

---

## 4. Ba quyết định cần founder chốt

### QĐ-1 — Ô thứ 5 là gì?

| Phương án | Được | Mất |
|---|---|---|
| **A. Ô "Thêm" mở bảng đầy đủ** ✅ *đề xuất* | Mọi mảng tới được trong **2 lần chạm**, xếp theo nhóm; menu tài khoản trả về đúng việc của nó | Vẫn cần một lần chạm phụ cho mảng ít dùng |
| B. Giữ 4 ô, sửa menu tài khoản cho gọn hơn | Ít việc nhất | Vẫn giấu điều hướng ở chỗ không ai tìm |
| C. Thanh dưới cuộn ngang được | Nhiều ô hơn | Đã bỏ đúng cách này ở khu Cài đặt hôm 13/08 vì cụt hai đầu và xén chữ — **đừng lặp lại** |

### QĐ-2 — Bốn ô việc là gì?

Đề xuất: **Hôm nay · Hộp thư · Bán hàng · Khách** (+ ô Thêm).
Đổi so với hiện tại: **thêm Bán hàng, chuyển Cơ hội vào bảng Thêm.**

Lý do: bán hàng là việc làm tại quầy bằng điện thoại; xếp cơ hội là việc đọc lại, hợp với máy tính. Nếu founder thấy tiệm mục tiêu thiên về chăm khách/bán lead hơn bán tại quầy thì đảo lại — **đây là câu hỏi về khách hàng, không phải về kỹ thuật.**

### QĐ-3 — Thanh dưới ĐỔI THEO VAI ✅ đã chốt (founder bác đề xuất đầu của tôi)

**Đề xuất đầu của tôi là KHÔNG đổi theo vai, và nó SAI.** Ghi lại cả cái sai vì lý do sai đáng nhớ hơn kết luận đúng.

Tôi lấy lý do *"chưa có tiệm thật nào dùng, đổi theo vai bây giờ là tối ưu theo phỏng đoán"*. Nhưng đo lại thì: **bản máy tính ĐÃ đổi theo vai từ lâu** — cả 25 mục trong menu bên đều lọc theo vai (`roles` trong khai báo nav, và `canSeeNavItem`). Chỉ riêng thanh dưới điện thoại bị đóng cứng 4 khoá bất kể vai.

⇒ "Đổi theo vai" **không phải thêm cái mới**, mà là **sửa chỗ bản điện thoại đang lệch khỏi bản máy tính**. Cái tôi đòi hoãn thì nửa kia của sản phẩm đã làm rồi. Hai lý do phụ tôi nêu cũng không đứng được:

| Tôi lo | Thực tế |
|---|---|
| "Ảnh chụp hướng dẫn sẽ khác nhau giữa các vai" | Bản máy tính vốn đã khác nhau theo vai — lo này đã cũ hơn một tháng |
| "Người kiêm nhiều vai sẽ thấy thanh nhảy" | Mỗi người chỉ có **một vai trong một tiệm**. Đổi vai chỉ xảy ra khi đổi tiệm — mà đó vốn đã là một cú chuyển ngữ cảnh lớn, có nút riêng |

**Luật của thanh dưới theo vai — ba điều bắt buộc:**

1. **Suy từ VAI, không suy từ thói quen dùng.** Cùng một vai thì thanh luôn giống nhau, mọi lúc, mọi máy. Thanh tự sắp lại theo tần suất bấm nghe thì hay nhưng làm người dùng phải *đi tìm* — hỏng đúng thứ thanh dưới sinh ra để giải quyết.
2. **Không bao giờ để lỗ.** Mỗi vai có một **danh sách ưu tiên**; lấy 4 mục đầu mà vai đó thật sự mở được. Vai không thấy một mục thì mục kế tiếp trám lên, không để ô trống.
3. **Ô thứ 5 "Thêm" luôn có, cho mọi vai.** Nó là bảo hiểm: mảng nào không lọt vào 4 ô vẫn tới được trong 2 lần chạm.

**Hướng chia (bản nháp — thẻ thiết kế sẽ chốt con số cuối, founder duyệt trên Claude Design):**

| Vai | Người đó mở điện thoại ra để làm gì | 4 ô nghiêng về |
|---|---|---|
| Chủ tiệm · Quản trị | xem tiền vào ra, duyệt cái cần duyệt | bán hàng · tiền · duyệt |
| Quản lý | trực ca, gỡ việc cho nhân viên | hộp thư · bán hàng · duyệt |
| Nhân viên | trả lời khách, làm việc được giao, bán tại quầy | hộp thư · khách · bán hàng |
| Chỉ xem | đọc lại | hộp thư · khách · báo cáo |

Hai ô **Hôm nay** và **Thêm** giữ nguyên cho mọi vai: một cái là điểm bắt đầu chung, một cái là lối ra chung.

---

### QĐ-4 — Mọi thẻ thiết kế đi qua Claude Design

Chỉ đạo founder 19/08. Áp dụng cho **toàn bộ** đợt này: khung điện thoại mới, bảng "Thêm", menu tài khoản rút gọn, khung Cài đặt trên điện thoại — vẽ thành thẻ, **đẩy lên dự án `iFan Design System`**, founder xem và duyệt ở đó **trước khi** code.

Đã có sẵn cổng canh việc này: thẻ sửa mà chưa đẩy thì cổng đỏ, và **cấm ghi sổ đối chiếu để làm xanh cổng khi chưa đẩy** — như vậy là tự bịt mắt mình.

---

## 5. Thứ tự làm, sau khi founder chốt

1. **Soát toàn bộ bản điện thoại** (đang chạy) — trôi ngang · bảng bị bóp · vùng chạm nhỏ · bị thanh dưới che · cửa sổ bật lên tràn màn · chế độ tối · bản tiếng Anh.
2. **Vẽ thẻ thiết kế** cho khung điện thoại mới: thanh dưới 5 ô · bảng "Thêm" theo nhóm · menu tài khoản rút về đúng việc · khung Cài đặt trên điện thoại.
3. Founder duyệt thẻ.
4. Code, rồi **bấm thử tay ở 375px** — không nhận "build xanh" là xong.
5. Cập nhật thẻ của từng màn bị đụng tới.

---

## 6. Điều kiện xem lại

Quyết định ở đây sai nếu:

- Số mảng vượt **~40** — lúc đó bảng "Thêm" cũng thành danh sách dài, phải có tìm kiếm trong bảng.
- Có số liệu dùng thật cho thấy thứ tự bốn ô sai (ví dụ Hộp thư ít dùng hơn hẳn dự đoán).
- Sản phẩm chuyển sang ứng dụng cài đặt thật (không còn là web trên trình duyệt) — lúc đó vùng an toàn và cử chỉ vuốt đổi hẳn.

---

## 7. Chưa biết, nói thẳng

- **Chưa có số liệu dùng thật** cho bất kỳ màn nào — chưa tiệm thật nào chạy. Mọi thứ tự ưu tiên ở đây là **suy luận từ nghiệp vụ**, không phải từ đo đạc hành vi. Ghi ra để sau này không ai trích dẫn nó như một kết luận đã đo.
- **Chưa soát xong bản điện thoại** ở mức từng màn — bảng ở mục 5 việc 1 đang chạy; kết quả có thể làm đổi thứ tự ưu tiên.

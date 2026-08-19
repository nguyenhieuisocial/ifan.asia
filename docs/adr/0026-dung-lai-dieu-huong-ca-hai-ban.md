# ADR-0026 — Dựng lại điều hướng CẢ HAI BẢN: cột trái máy tính + phần còn lại của bản điện thoại

**Ngày:** 19/08/2026 · **Trạng thái:** ĐÃ THI CÔNG — QĐ-1 (lớp cuộn) · QĐ-2/3/4 (7 nhóm) · QĐ-5 (bảng "Thêm" đủ mảng). Xem mục 6 ở cuối: **hai chỗ bản ADR này nói sai so với số đo**, và **một chỗ còn treo**.

> Tiếp nối ADR-0024 (đã làm xong phần thanh dưới + bảng "Thêm" của điện thoại). ADR này lo **cột trái máy tính** — chưa từng được dựng lại từ khi kho có 20 mảng, nay đã **31** — và **hai câu hỏi còn treo của bản điện thoại**.

---

## 1. Vì sao phải quyết — số đo, không phải cảm giác

### 1.1 Cột trái máy tính có một LỖI THẬT, không chỉ là chuyện đẹp xấu

```
<aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">   ← KHÔNG có lớp cuộn
  <div className="h-12 ...">BrandMark</div>
  <nav className="flex flex-1 flex-col gap-1 p-2">                              ← KHÔNG có lớp cuộn
     …25 mục xếp PHẲNG, không nhóm, không tiêu đề…
```

Khung cha là `<div className="flex min-h-0 flex-1 w-full overflow-hidden">` — **cắt phần thừa**. Cột trái không tự cuộn ⇒ phần dài quá màn hình **biến mất và không với tới được**.

Số học: 25 mục × ~36px = **~900px**, cộng đầu cột 48px và chân cột (menu tài khoản). Trên laptop màn cao 768px, chỗ dùng được còn ~700px ⇒ **khoảng 8 mục cuối bị cắt**:

> Ưu đãi · Nhân sự · Bảng lương · Hoa hồng · Dự án · Tuyển dụng · Sự kiện · **Cài đặt**

Tức **toàn bộ nhóm Nhân sự và cả Cài đặt** — mục quản trị cần nhất — là nạn nhân đầu tiên, chỉ vì nó nằm cuối danh sách.

Đây **đúng lớp lỗi** vừa vá cho 7 màn nội dung cùng ngày (LUẬT 6 của `soat-loi-vao-mang.mjs`), nhưng lần này nằm trên **chính cái menu** — nặng hơn hẳn: màn nội dung bị cắt thì mất một phần thông tin, menu bị cắt thì **mất đường đi**.

*Chưa đo trên trình duyệt thật ở nhiều cỡ màn — con số 8 mục là tính toán, không phải phép đo. Nhưng "thiếu lớp cuộn" là sự thật của mã nguồn, không phải suy đoán.*

### 1.2 Dữ liệu để chia nhóm ĐÃ CÓ, chỉ điện thoại được hưởng

`NHOM_CUA_MUC` + `THU_TU_NHOM` dựng ngày 19/08 cho bảng "Thêm" của điện thoại, chia 25 mục thành **7 nhóm**:

| Nhóm | Số mục | Gồm |
|---|--:|---|
| Bán hàng | 7 | Khách · Công ty · Cơ hội · Hàng hoá · Đơn hàng · Hợp đồng · Ưu đãi |
| Nhân sự | 4 | Đội ngũ · Bảng lương · Hoa hồng · Tuyển dụng |
| Vận hành | 4 | Lịch · Sổ quỹ · Két sắt · Kho |
| Chăm khách | 3 | Hộp thư · Đánh giá · Sự kiện |
| Công việc | 3 | Công việc · Duyệt & yêu cầu · Dự án |
| Báo cáo | 2 | Tổng quan · Báo cáo |
| Nền tảng | 2 | Hôm nay · Cài đặt |

**Cột trái máy tính không dùng gì trong số đó** — vẫn đổ phẳng 25 dòng. Một danh sách phẳng 25 mục **không có hình dạng**: muốn tìm một mục thì mắt phải đọc gần hết.

---

## 2. Quyết định cho CỘT TRÁI MÁY TÍNH

**QĐ-1 — Cột trái phải tự có lớp cuộn.** Bắt buộc, và làm TRƯỚC mọi thứ khác vì nó là lỗi chứ không phải thẩm mỹ. Cùng khuôn LUẬT 6 đang áp cho màn nội dung.

**QĐ-2 — Chia 7 nhóm có tiêu đề, dùng LẠI đúng `NHOM_CUA_MUC` và `THU_TU_NHOM`.**
Không đẻ cách chia thứ hai. Cùng tên nhóm với bảng "Thêm" của điện thoại ⇒ người dùng đổi máy không phải học lại. Đây cũng là lý do **không** đi tìm cách chia "tối ưu hơn": một cách chia đang chạy và nhất quán hai bản, giá trị hơn một cách chia đẹp hơn nhưng lệch nhau.

**QĐ-3 — Nhóm rỗng thì ẩn nguyên tiêu đề.** Vai `staff`/`viewer` không thấy Nhân sự thì không được để lại một tiêu đề trống — người dùng sẽ tưởng mình bị lỗi.

**QĐ-4 — Thứ tự trong cột giữ theo `THU_TU_NHOM`, KHÔNG theo vai.**
Khác hẳn thanh dưới điện thoại (ADR-0024 QĐ-1 cho thanh dưới đổi theo vai vì chỉ có 4 ô). Cột trái có chỗ cho tất cả, nên **vị trí phải cố định**: người dùng nhớ bằng cơ bắp, "hôm nay nó nằm chỗ khác" là hỏng đúng thứ menu sinh ra để giải quyết.

### Hai cách đã LOẠI, và vì sao

- **Nhóm gập lại được (accordion), chỉ mở nhóm đang đứng.** Gọn hơn thật, nhưng **thêm một cú bấm cho MỌI lần nhảy sang nhóm khác** — với công cụ dùng hằng ngày thì đó là thuế trả mỗi ngày. Loại.
- **Ghim 5 mục hay dùng lên đầu theo tần suất.** Loại vì **cùng lý do đã loại ở ADR-0024 QĐ-1**: suy từ thói quen dùng thì menu tự sắp lại, người dùng phải *đi tìm*. Giữ nguyên tắc "suy từ VAI, không suy từ thói quen" cho cả hai bản.

---

## 3. Hai câu còn treo của BẢN ĐIỆN THOẠI

**QĐ-5 — Bảng "Thêm" nên hiện ĐỦ mọi mảng, kể cả 4 mục đang có ô riêng ở thanh dưới.**

Hiện tại `mobileSheetItems()` **loại bỏ** những mục đã có ô ở thanh dưới. Không sai về logic, nhưng sai về vai trò: bảng "Thêm" là **tấm bản đồ đầy đủ**, còn thanh dưới là **lối tắt**. Người đang tìm "Đơn hàng" mà mở bảng ra không thấy sẽ tưởng máy thiếu, trong khi thật ra nó nằm ngay dưới chân họ.

Đổi lại: mỗi vai thấy đúng một danh sách đầy đủ ở một chỗ duy nhất, và 4 lối tắt là phần thưởng chứ không phải phần bị cắt đi.

*Đánh đổi đã cân: bảng dài thêm 4 dòng. Chấp nhận được — bảng đã chia nhóm nên dài thêm không làm khó tìm.*

**QĐ-6 — Chưa đổi cách thanh dưới chọn 4 ô.** Luật hiện tại (ưu tiên theo vai, "không để lỗ") vừa dựng và đã đo chạy đúng trong ngày. Đổi tiếp lúc này là sửa thứ chưa hỏng.

---

## 4. Thứ tự thi công

1. **QĐ-1 (lớp cuộn cột trái)** — vá ngay, đây là lỗi. Không chờ phần design.
2. Thẻ design cho cột trái mới + bảng "Thêm" đủ mảng → đẩy **Claude Design** (ADR-0024 QĐ-4).
3. QĐ-2/3/4 (chia nhóm) và QĐ-5 (bảng đủ mảng) — thi công sau khi thẻ đã lên.
4. Đo lại trên **trình duyệt thật**, cả khổ máy tính lẫn khổ điện thoại. Không nhận "xong" bằng suy luận — bài học ghi ở mục 6 nhật ký 19/08.

---

## 5. Điều kiện xem lại

- Số mảng vượt **~35**: 7 nhóm bắt đầu quá dài, lúc đó mới xét tới nhóm gập được — và phải đo lại chứ không quyết bằng cảm giác.
- Có tiệm thật dùng và **đo được** rằng họ chỉ chạm 5 màn: cân nhắc lại việc ghim lối tắt, nhưng phải là số đo từ tiệm thật, không phải phỏng đoán.
- Nếu cột trái được cho phép thu gọn thành dải biểu tượng (icon rail): cách chia nhóm phải xét lại vì tiêu đề nhóm không còn chỗ.

---

## 6. Ghi lại SAU khi thi công — số đo, và hai chỗ ADR này nói sai

*Viết ngay sau khi làm xong, theo luật "chú thích tự khai không phải phép đo".*

### 6.1 Số mục mỗi nhóm, đo theo từng vai (đọc thẳng từ `NAV_ITEMS`)

| Vai | Tổng | Bán hàng | Vận hành | Chăm khách | Công việc | Nhân sự | Báo cáo | Nền tảng | Nhóm hiện |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| owner / admin | 25 | 7 | 4 | 3 | 3 | 4 | 2 | 2 | 7/7 |
| manager | 24 | 7 | 4 | 3 | 3 | 3 | 2 | 2 | 7/7 |
| staff | 19 | 7 | 2 | 1 | 3 | 3 | 1 | 2 | 7/7 |
| viewer | 17 | 6 | 2 | 1 | 3 | 2 | 1 | 2 | 7/7 |

Chạy thử phép chia cho cả 5 vai: **không mục nào rơi, không mục nào lặp**.

### 6.2 SAI THỨ NHẤT — QĐ-3 nêu ví dụ không có thật

QĐ-3 viết *"vai `staff`/`viewer` không thấy Nhân sự"*. **Sai.** Đo được: `staff` thấy **3/4** mục Nhân sự (Đội ngũ · Hoa hồng · Tuyển dụng), `viewer` thấy **2/4** (Đội ngũ · Hoa hồng). Thực tế **không vai nào có nhóm rỗng** — cả 5 vai đều hiện đủ 7 tiêu đề.

Luật "nhóm rỗng ẩn cả tiêu đề" vẫn **giữ** vì nó rẻ và đúng, nhưng phải gọi đúng tên: đây là **lưới an toàn cho lần siết quyền sau**, không phải chuyện đang xảy ra. Ví dụ minh hoạ sai làm người đọc sau tưởng đã đo.

### 6.3 SAI THỨ HAI — thẻ design và QĐ-4 vẽ hai thứ tự khác nhau

Khung mẫu "SAU" trong `design-system/khung-may-tinh.html` vẽ **Nền tảng → Chăm khách → Bán hàng → …**, còn QĐ-4 chốt "giữ theo `THU_TU_NHOM`" tức **Bán hàng → Vận hành → Chăm khách → Công việc → Nhân sự → Báo cáo → Nền tảng**. Hai bản chọi nhau và ADR không nhắc tới chuyện đó.

**Thi công theo ADR** (bản chốt). Hệ quả **đo được**, và nó không nhỏ:

| Mục | Trước (danh sách phẳng) | Sau (theo `THU_TU_NHOM`) |
|---|--:|--:|
| Hôm nay — *"màn nhà hằng ngày của người bán"* | dòng **1** | dòng **24** |
| Tổng quan (`/app`) | dòng **2** | dòng **22** |

Cột cao thêm ~180px (≈912px → ≈1093px, tính theo `h-8` + khoảng cách, **chưa đo trên trình duyệt thật**). Trên laptop cao 768px chỗ dùng được còn ~720px ⇒ **hai mục mở-máy-là-bấm nay nằm dưới mép, phải cuộn**. Cuộn có thật (QĐ-1) nên **không còn là lỗi mất đường đi**, nhưng vẫn là bước lùi cho hai màn dùng nhiều nhất.

**Chưa tự ý sửa.** Ba đường:
- **(a)** Đổi `THU_TU_NHOM` cho `nenTang` lên đầu — thẻ design đang vẽ thế. Đổi thì **bảng "Thêm" của điện thoại đổi theo** (một bảng, hai bản dùng chung — đó là điểm mạnh của QĐ-2).
- **(b)** Ghim riêng Hôm nay + Tổng quan lên đầu cột trái — **đẻ cách sắp thứ hai**, chọi thẳng QĐ-2. Không nên.
- **(c)** Giữ nguyên, chấp nhận đánh đổi.

### 6.4 CHỐT — đường thứ tư: thêm nhóm "Hằng ngày" đứng đầu

Ba đường ở 6.3 đều phải trả giá: **(a)** kéo "Cài đặt" lên đầu cột — Cài đặt không phải việc hằng ngày; **(b)** đẻ cách sắp thứ hai, chọi QĐ-2; **(c)** để hai màn dùng nhiều nhất nằm dưới mép.

Đường thứ tư rẻ hơn cả ba, và nó **chữa đúng nguyên nhân** chứ không chữa triệu chứng:

> Gốc rễ không phải "thứ tự nhóm sai" mà là **hai mục bị xếp nhầm nhóm từ trước**. `today` nằm chung `nenTang` (cạnh Cài đặt), `overview` nằm chung `baoCao`. Cả hai chỗ xếp đều sai về nghĩa — nhưng khi bảng nhóm chỉ nuôi bảng "Thêm" của điện thoại thì **không ai thấy**, vì hai màn đó đã có ô riêng ở thanh dưới. Cột trái dùng chung bảng nhóm mới làm chỗ sai lộ ra.

⇒ Thêm nhóm **`hangNgay` ("Hằng ngày" / "Daily")** đứng đầu `THU_TU_NHOM`, chứa đúng hai mục đó. Không thêm cơ chế nào; vẫn **một** bảng nhóm nuôi **cả hai** bản, đúng QĐ-2.

**Đo sau khi sửa** (chạy lại đúng phép chia của `SidebarNav` cho từng vai):

| Vai | Tổng mục | Dòng 1 | Dòng 2 | Mục thiếu khai nhóm |
|---|--:|---|---|---|
| owner / admin | 25 | Hôm nay | Tổng quan | không |
| manager | 24 | Hôm nay | Tổng quan | không |
| staff | 19 | Hôm nay | Tổng quan | không |
| viewer | 17 | Hôm nay | Tổng quan | không |

Cổng `scripts/soat-loi-vao-mang.mjs`: **xanh** — 25/25 mục vẫn khai đủ nhóm, 5 vai vẫn đủ 4 ô thanh dưới.

**Cái giá phải nói ra:** `baoCao` và `nenTang` giờ mỗi nhóm còn **đúng một mục** (Báo cáo · Cài đặt) — tiêu đề trông thừa. Vẫn giữ, vì cả hai là **ngăn sẽ đầy lên**: `/app/reports` mới có 1 trong nhiều báo cáo đã hoạch định, còn Cài đặt là trang index 19 mục. Gộp "Báo cáo" vào "Hệ thống" thì **tệ hơn**: `staff`/`viewer` không thấy Báo cáo, nên tiêu đề ghép sẽ hứa một thứ họ không mở được.

### 6.5 ĐÃ ĐO TRÊN TRÌNH DUYỆT THẬT — trả nốt mục 4 việc 4

Cửa sổ Cent **thật**, đặt đúng bề rộng cần đo. **Không iframe** (bài học 19/08: nạp trang vào iframe làm vùng nội dung sập về chiều cao 0 ở CẢ hai khổ, kết luận rút ra từ đó đã phải công khai rút lại). Mỗi lần một vòng đo.

**Khổ 1280×768, cột trái**

| Hỏi | Đo được |
|---|---|
| "Hôm nay" thấy ngay khi mở? | **Có** — nằm mốc 118–150 trong màn cao 768, cột chưa hề cuộn. Bấm trúng, không bị vật che. |
| "Tổng quan" thứ hai? | **Có** — mốc 154–186. |
| Bóp cửa sổ còn cao 500 | "Hôm nay" **vẫn** ở mốc 118. |
| Cuộn tới "Cài đặt"? | **Có** — nội dung cột cao **805** trong khung **678** ⇒ thừa **127**, buộc cuộn thật (KHÔNG phải phép đo rỗng). Cuộn xuống, "Cài đặt" hiện mốc 728–760, bấm trúng. Ép tràn mạnh hơn (cao 600 rồi 500 ⇒ thừa 296 rồi 395): vẫn tới nơi. |
| Lớp cuộn lồng nhau? | **Không** — dò ngược tới gốc trang chỉ có đúng MỘT chỗ cuộn được. |
| Tiêu đề nhóm có cắt/tràn? | **Không** — mỗi tiêu đề đúng 1 dòng. Chữ dài nhất "Chăm khách & Marketing" chạm mốc **169**, lòng cột rộng **207–223** ⇒ còn dư ~40–50. |

⇒ Câu ở mục 6.4 *"phép tính theo bề rộng cột, chưa phải phép đo"* nay **đã thành phép đo**, và kết quả khớp.

**Khổ 390×844, bảng "Thêm"** — vai chỉ-xem: **17 mục / 7 nhóm**, bảng cao 718 mà nội dung 1049 ⇒ thừa 332, cuộn tới đúng đáy, mục cuối cao 44 nằm trọn trong màn và **đã bấm thật** sang được trang Cài đặt. Vai chủ tiệm: **25 mục / 8 nhóm**, đúng thứ tự. Thanh dưới đúng 4 ô + ô "Thêm".

**Console 0 lỗi · 0 lệnh mạng hỏng · 0 trôi ngang** (25 lệnh bị huỷ giữa chừng đều là tải-trước lúc chuyển trang).

**Vai chỉ-xem hiện 7 nhóm chứ không phải 8** — thiếu "Báo cáo", vì vai đó không mở được báo cáo nên nhóm rỗng bị ẩn cả tiêu đề. Đúng QĐ-3.

Và đây là **lần đầu luật ẩn-nhóm-rỗng thật sự chạy** — một hệ quả **tôi không lường trước ở 6.4**. Mục 6.2 đo được "không vai nào có nhóm rỗng", và lúc đó **đúng**: nhóm `baoCao` gồm Tổng quan + Báo cáo, mà Tổng quan thì mọi vai đều thấy. Tách "Hằng ngày" ra khiến `baoCao` chỉ còn Báo cáo — mục mà `staff`/`viewer` không có. Phép đo ở 6.4 chỉ đếm **mục**, không đếm **nhóm**, nên không thấy. Không phải lỗi, nhưng là chỗ tôi đã kết luận rộng hơn thứ mình đo.

**Vẫn còn nợ, nói thẳng:**
- Số đo toạ độ và cuộn ở trên là của **vai chỉ-xem**. Với vai chủ tiệm chỉ **đếm** được (8 nhóm / 25 mục) — cửa sổ founder đang phóng kín màn 2134×1296, cột cao 1248 trong khung cũng 1248 ⇒ **không tràn**, nên phép đo cuộn tại phiên đó là RỖNG và đã bị loại, không lấy làm bằng chứng.
- **Vai quản lý và nhân viên chưa nhìn tận mắt** — cần mật khẩu, mà luật cấm tự gõ mật khẩu.

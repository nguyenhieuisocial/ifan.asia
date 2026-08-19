# ADR-0026 — Dựng lại điều hướng CẢ HAI BẢN: cột trái máy tính + phần còn lại của bản điện thoại

**Ngày:** 19/08/2026 · **Trạng thái:** ĐANG HOẠCH ĐỊNH — chưa thi công. Thẻ design đi trước, theo QĐ-4 của ADR-0024.

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

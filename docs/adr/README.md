# Quyết định kiến trúc (ADR)

Mỗi file ở đây ghi **một quyết định đã chốt**: vì sao chọn A thay vì B, và cấm làm gì.
Đây là tầng LUẬT — mâu thuẫn với kế hoạch thì ADR mới nhất thắng (xem `00 Trang chủ.md` mục 2 trong vault).

## Danh sách

| # | Quyết định | Ghi chú |
|---|---|---|
| 0001 | Nền tảng (Next.js + Supabase + Vercel) | |
| 0002 | Các quyết định tháng 8 | |
| 0003 | Phân bậc trợ lý (model nào làm gì) | |
| 0004 | Khi nào dùng workflow | |
| 0005 | Nhiều tiệm một tài khoản | |
| 0006 | Phiên hỗ trợ chỉ-đọc | |
| 0007 | Chuông cảnh báo nền tảng | |
| 0008 | Cổng khách công khai (V1.5) | hồ sơ thi công của đợt |
| 0009 | V2 — Lịch hẹn | hồ sơ thi công của đợt |
| 0010 | Bản đồ 20 module + lộ trình | ⚠️ **đã bị 0012 thay** — giữ lại để tra lịch sử, đừng dùng làm bản đồ |
| 0011 | Giá và trang công khai | bảng giá đã chốt, công bố khi mở bán |
| 0012 | **Bản đồ năng lực: 9 nhóm → 28 mảng** | **đọc TRƯỚC khi đề xuất bất kỳ tính năng nào** — trả lời "iFan gồm mảng nào, mảng nào ở đợt nào" |
| 0013 | Telegram làm kênh khách hàng | hồ sơ thi công của đợt |
| 0014 | **V2.5 — AI trực việc** | hồ sơ thi công của đợt đang mở |

## ⚠️ Luật bắt buộc: mỗi ADR phải có ĐIỀU KIỆN XEM LẠI

Thêm 12/08/2026, học từ FlowX (kho của họ: *"68 decisions, each with its trade-off **and its revisit trigger**"*).

**Mỗi ADR phải nói rõ: quyết định này hết đúng khi nào?** Viết thành một mục cuối file, dạng:

```
## Điều kiện xem lại
- Khi <sự kiện đo được xảy ra> ⇒ đọc lại mục <X>, nhiều khả năng phải đổi.
```

**Vì sao bắt buộc.** Quyết định đúng luôn đúng *tại thời điểm và trong bối cảnh đã đo*. Bối cảnh đổi thì nó âm thầm thành sai — mà **không có gì báo**. Ngày 12/08 đã dính đúng bệnh này ba lần trong một ngày:

- ADR-0007 ghi "nợ: chưa cắm nhịp chạy" — nhịp đã cắm xong từ việc #85, nhưng ADR vẫn nói còn nợ.
- File Chiến lược ghi tín hiệu dừng "chưa có 3 khách trả tiền sau 8 tuần" — founder đã bác hướng đó từ 31/07, nhưng thân bài không ai sửa, và một trợ lý đọc nó rồi khẳng định sai với founder **hai lần**.
- 10 thẻ design dán nhãn "chưa có code" trong khi màn đã chạy thật nhiều ngày.

Cả ba đều là **thứ đúng lúc viết, sai lúc đọc**. Điều kiện xem lại biến chuyện đó từ "chờ ai đó tình cờ phát hiện" thành "có mốc để kiểm".

**Ví dụ đang có thật** — ADR-0009 mục 9: *"khi Zalo OA cắm xong ⇒ thêm adapter vào `NotifyChannel`, thêm trạng thái `confirmed`, bật nhắc khách tự động. Ba việc này đi cùng nhau, không tách."*

**Trạng thái: 14/14 ADR đã có mục này** (soát lại 13/08). Hai file viết dưới tiêu đề khác — 0003 để trong thân bài, 0013 đặt tên *"Xem lại khi nào"* — nội dung đủ, chỉ lệch hình thức; ai sửa hai file đó lần tới thì đổi tiêu đề cho đồng bộ, không cần mở đợt riêng.

> **Chính chỉ mục ở trên vừa mắc đúng cái bệnh mục này chống.** Nó đứng im ở 0010 trong khi kho đã có tới 0013, và còn giới thiệu 0010 là *"đọc TRƯỚC khi đề xuất tính năng"* — trong khi bản đồ đó **đã bị 0012 thay** từ 13/08. Người đọc tin chỉ mục sẽ lấy nhầm bản đồ cũ. Sửa 13/08. **Bài học: file dạy về tài liệu lỗi thời không tự miễn nhiễm với lỗi thời.**

> **Nợ này suýt bị bỏ quên bằng một lý do nghe rất hợp lý.** Bản đầu của chính file này ghi: *"bổ sung dần khi mở file ra sửa vì việc khác — không mở riêng một đợt chỉ để thêm"*. Nghe tiết kiệm, nhưng đó là **hoãn vô thời hạn có vỏ bọc**: nếu không ai mở ADR-0001 ra sửa thì nó **không bao giờ** có điều kiện xem lại — đúng cái bệnh mà luật này dựng lên để chống. Founder nhắc lại việc còn dở, làm dứt trong một lượt. **Bài học: "làm dần khi tiện" là một cách hoãn, không phải một kế hoạch.**

**Cách viết một điều kiện xem lại cho ĐÚNG** — nó phải trỏ vào **sự kiện quan sát được**, không phải mốc thời gian và không phải cảm giác:

| ✅ Dùng được | ❌ Vô dụng |
|---|---|
| "Khi có người nhận thứ HAI ngoài founder ⇒ mục 4 sập" | "Xem lại sau 6 tháng" |
| "Khi có tiệm ≥3 thợ dùng hằng ngày ⇒ `staff_services` hết lý do bị cắt" | "Khi dự án lớn hơn" |
| "Khi Resend chạy thật ⇒ gỡ nhánh thừa ở mục 2" | "Khi có thời gian" |

Điều kiện tốt còn có tác dụng phụ quý hơn: nó **ghi lại con số tại thời điểm quyết** (đo ~1,1 người/tiệm, 0 lịch hẹn, một người nhận) — nên người đọc sau biết ngay quyết định đó dựa trên cái gì, và cái đó còn đúng không.

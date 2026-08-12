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

**Nợ ghi sổ:** ADR-0001 → 0008 phần lớn **chưa có mục này**. Bổ sung dần khi mở file ra sửa vì việc khác — không mở riêng một đợt chỉ để thêm.

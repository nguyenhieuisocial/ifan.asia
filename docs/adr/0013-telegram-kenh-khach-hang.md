# ADR-0013 — Telegram làm kênh chat khách hàng thứ ba

**Ngày:** 13/08/2026 · **Trạng thái:** đã chốt, đang thi công · **Task:** #116

Founder chốt: *"Cho khách hàng nhắn Telegram vào thẳng Hộp thư iFan nhưng cần
chi tiết source ở Hộp Thư nhỉ?"*

---

## 1. Vì sao làm

Hộp thư đang có hai kênh chạy thật: **Zalo OA** và **Live Chat trên web**. Zalo
OA đòi pháp nhân và chờ duyệt — đúng thứ chặn tiệm nhỏ mới mở. Telegram thì
**bất kỳ ai cũng tạo bot trong 2 phút, miễn phí, không duyệt**. Với tiệm chưa có
OA, đây là kênh chat khách hàng **duy nhất bật được ngay hôm nay**.

Thêm một điều Zalo không cho: Telegram trả về **tên và @tên** của người nhắn.
Zalo chỉ cho một mã số, nên hộp thư hiện "Khách 482913" — nhân viên không biết
đang nói chuyện với ai.

---

## 2. Bot NÀO — mỗi tiệm một bot riêng, KHÔNG dùng chung bot nội bộ

`@iFanVN_bot` hiện là **bot nội bộ của đội ngũ iFan** (số liệu nền tảng, hỏi đáp
qua cầu nối Claude Code). Nhập khách hàng vào đó là trộn hai thứ không được
trộn: câu hỏi nội bộ và tin nhắn khách, chung một hộp, chung một hạn mức.

**Chốt:** mỗi tiệm tự tạo bot của mình rồi dán token vào Cài đặt → Kênh, y như
cách nối Zalo OA. iFan muốn có kênh Telegram cho khách của chính mình thì cũng
tạo một bot thứ hai, không dùng lại bot nội bộ.

## 3. Tiệm nào nhận tin — theo ĐƯỜNG DẪN, không theo nội dung

Tin Zalo có `oa_id` trong thân tin nên tra ngược ra tiệm được. **Tin Telegram
KHÔNG mang dấu vết gì về bot nhận nó** — chỉ biết qua địa chỉ mà Telegram gọi.

**Chốt:** đăng ký webhook riêng cho từng tiệm: `/api/webhooks/telegram?ch=<mã kênh>`,
kèm `secret_token` riêng cho từng kênh. Đây là cách bot nhắc việc nhân viên đã
dùng và đã chạy thật (`app/api/bot/webhook/route.ts`) — không phát minh cách mới.

**Hai lớp chặn, thiếu lớp nào cũng hỏng:**
1. `X-Telegram-Bot-Api-Secret-Token` phải khớp bí mật của **đúng kênh đó** —
   chứng minh Telegram gửi, không phải người lạ gọi thẳng URL.
2. Mã kênh phải tồn tại và đang `active`.

Bí mật KHÔNG nằm trong bảng: token bot cất trong Vault tên `telegram:{channel_id}:token`,
đúng nếp Zalo OA (`20260803000010_channel_connect.sql`).

## 4. Đường vào — đi qua hàng đợi, không xử thẳng

Live Chat xử thẳng trong một lượt gọi vì trình duyệt khách đang đứng chờ trả
lời. Telegram thì khác: **Telegram tự gọi lại khi không nhận được 200**, nên xử
thẳng mà chậm là nhân bản tin nhắn.

**Chốt:** sao y đường Zalo — `ingest_telegram_event` ghi vào `webhook_events`
(chống trùng theo `provider + external_event_id`) → đẩy vào hàng đợi
`telegram_events` → `process_telegram_events` xử, thử lại tối đa 5 lần rồi mới
bỏ vào thùng lỗi có ghi lý do. Có cron mỗi phút làm lưới an toàn.

**Không tự nghĩ cách mới**: mọi bài học chống trùng/thử lại/thùng lỗi đã nằm
trong đường Zalo rồi.

## 5. Có tự tạo hồ sơ khách không — CÓ, khác Zalo, và đây là chỗ cân nhắc kỹ nhất

- Zalo: **không** tạo hồ sơ. Vì chỉ có mã số, tạo ra chỉ được một hồ sơ vô danh.
- Live Chat: chỉ tạo khi khách đến từ mã QR.

Telegram cho **tên thật + @tên**. Không tạo hồ sơ thì hộp thư lại hiện "Khách
482913" y như Zalo, tức là vứt đi đúng thứ Telegram cho hơn.

**Chốt: tạo hồ sơ khách ngay từ tin đầu**, lấy tên từ Telegram, nguồn ghi là
Telegram. Đổi lại phải chấp nhận: **ai nhắn bot cũng thành một hồ sơ**, kể cả
người bấm nhầm. Chấp nhận được vì (a) khách chủ động nhắn tiệm là tín hiệu thật,
(b) hồ sơ rác xoá được, còn khách thật bị bỏ sót thì mất luôn.

**Rào chặn kèm theo, KHÔNG được bỏ:** trần số hồ sơ tạo mới từ một bot trong một
giờ. Bot Telegram là địa chỉ công khai — không có trần thì một người rảnh rỗi
bơm được hàng nghìn hồ sơ rác vào tiệm người ta.

## 6. Trả lời khách — bắt buộc làm cùng đợt, không tách

Nhận mà không trả lời được thì hộp thư chỉ là chỗ chứa. Thêm `telegramAdapter`
vào `REPLY_ADAPTERS` như Zalo và Live Chat.

**Telegram KHÔNG có cửa sổ 48 giờ** như Zalo — bot nhắn lại lúc nào cũng được,
miễn người kia chưa chặn. Nên phải bỏ nhãn "còn X giờ để trả lời" cho kênh này,
y như đã bỏ cho Live Chat. Để nguyên là **hiện một hạn chót không có thật**.

## 7. Hiện nguồn ở Hộp thư — làm luôn cho CẢ BA kênh

Founder hỏi *"cần chi tiết source ở Hộp Thư nhỉ?"*. Soát lại thì đúng là đang
thiếu, và thiếu cho cả kênh cũ chứ không riêng Telegram:

- **Danh sách hội thoại không hiện kênh nào cả** — hai khách ở hai kênh trông y
  hệt nhau. Đã sửa: mỗi dòng có nhãn kênh.
- **Nhãn kênh ở đầu hội thoại bị ẩn trên điện thoại** (`hidden sm:inline-flex`)
  — mà điện thoại mới là chỗ nhân viên trực nhiều nhất. Đã sửa: hiện mọi cỡ màn.

Hai việc này đã làm xong trước ADR này vì chúng độc lập với Telegram.

## 8. Việc phải làm

| # | Việc | Ghi chú |
|---|------|---------|
| 1 | Nới 3 chốt kiểm giá trị: `channels.type`, `contact_identities.channel_type`, `webhook_events.provider` | Chưa migration nào làm việc này — đặt tiền lệ, phải drop rồi add lại đúng tên chốt |
| 2 | `connect_telegram_channel` — cất token vào Vault, chỉ số duy nhất toàn cục theo mã bot | Sao y `connect_zalo_channel` |
| 3 | Hàng đợi + `ingest_telegram_event` / `process_telegram_events` / `trigger_telegram_processing` + cron | Sao y đường Zalo |
| 4 | Tự tạo hồ sơ khách + danh tính, CÓ trần chống lụt | Mục 5 |
| 5 | Webhook `/api/webhooks/telegram` | Hai lớp chặn ở mục 3 |
| 6 | `telegramAdapter` + nối vào `REPLY_ADAPTERS`, `ChannelType`, `CHANNEL_LABELS`, bỏ nhãn 48 giờ | Mục 6 |
| 7 | Màn Cài đặt → Kênh: ô dán token + nút nối/ngắt | Sao y thẻ Zalo OA |

## 9. Xem lại khi nào

- **Khi Zalo OA của tiệm được duyệt** ⇒ hỏi lại: có nên gộp hai kênh về cùng một
  hồ sơ khách khi trùng số điện thoại không. Hiện chưa gộp, và đó là chủ ý —
  gộp nhầm hai người khác nhau tệ hơn để hai hồ sơ.
- **Khi có tiệm thật dùng Telegram** ⇒ đo xem trần chống lụt ở mục 5 đặt đúng
  chưa. Đặt bừa rồi quên là chặn nhầm khách thật.

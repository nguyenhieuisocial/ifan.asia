# ADR-0016 — Zalo Bot trả lời được câu hỏi của nhân viên: TRA CỨU, không phải trợ lý AI (13/08/2026)

**Trạng thái:** đã thi công (task #128, commit `8d96d69`, 2 lỗ quyền vá tiếp theo qua `9e88dd8`/`162d60e`).
**Người quyết:** Opus 5, phiên 13/08, theo phân vai đã chốt (Opus = kiến trúc/bảo mật, Sonnet = code).
**Nguồn:** việc #128 — *"Zalo mới chỉ nhận thông báo, chưa hỏi đáp được như Telegram"*.
**Ràng buộc bắt buộc kế thừa:** ADR-0007 mục 11 (vừa lập tối nay) — cổng quyền cấp nền tảng chỉ hỏi `platform_admins`; và bất biến 1 — ép ở CSDL, không ép ở giao diện.

---

## 1. Bài toán — và một cách đặt vấn đề SAI cần gỡ trước

Ghi nhận của việc #128: nhân viên tiệm Việt Nam dùng Zalo là chính, không dùng
Telegram. Người thật sự cần hỏi (*"hôm nay tôi có việc gì?"*, *"khách A số mấy?"*)
lại đang ở kênh không hỏi được.

Nhu cầu đó **có thật**. Nhưng tên việc — *"hỏi đáp được **như Telegram**"* — dẫn
tới một thiết kế sai nếu làm theo nghĩa đen:

> Bot Telegram **không phải** trợ lý cho nhân viên. Nó là **trợ lý lập trình
> riêng của founder**, chạy trên máy founder, có quyền sửa file. Bê mô hình đó
> sang Zalo cho nhân viên tiệm là chép nhầm thứ cần chép.

Đúng ranh giới này là chỗ vừa gây lỗ leo thang quyền tối nay (migration #119).
Nên ADR này nói rõ ngay từ mục 1: **hai bot phục vụ hai loại người khác nhau,
không được hội tụ về một thiết kế.**

| | Bot Telegram của founder | Bot Zalo của tiệm |
|---|---|---|
| Phục vụ | 1 người: chủ dự án | Nhân viên của ĐÚNG một tiệm |
| Hạ tầng | Máy founder, ngoài sản phẩm | Trong sản phẩm, mỗi tiệm một bot |
| Được làm gì | Sửa mã nguồn, chạy lệnh | **Chỉ đọc dữ liệu của chính người hỏi** |

## 2. Đo thật trước khi thiết kế

| Đo | Kết quả |
|---|---|
| Định tuyến webhook Zalo | `?ch=<channel uuid>` ⇒ **mỗi bot đã tự khoá về đúng 1 tiệm** |
| Danh tính người nhắn | `staff_channel_links (tenant_id, user_id, external_chat_id)` — khoá chính `(tenant_id, user_id)` |
| Webhook hiện xử lý gì | **Chỉ** `/link <mã 6 số>`; mọi tin khác trả câu chỉ đường lấy mã |
| `bot_digest_run()` đã tính gì | quá hạn · tới hạn hôm nay · 3 việc sát hạn nhất **kèm giờ**, lọc `owner_id = người đó` |
| Hạn mức Zalo Bot | **3.000 tin/tháng/tiệm** (miễn phí), đã có `channel_quota` đếm + rung chuông khi chạm trần |
| `ANTHROPIC_API_KEY` trên máy chủ | **CHƯA có** — việc #117 còn chờ founder quyết chi phí |

**Phát hiện đổi hẳn thiết kế:** `bot_digest_run()` **đã tính sẵn đúng câu trả
lời** cho câu hỏi *"hôm nay tôi có việc gì?"* — cùng định nghĩa với `today_queue`
(#45), đã lọc đúng theo từng người, đã kèm giờ Việt Nam.

Nghĩa là khoảng trống thật **không phải "thiếu AI"** mà là:

> Dữ liệu chỉ được **ĐẨY** lúc 8 giờ sáng. Nhân viên đứng ở tiệm lúc 3 giờ chiều
> muốn hỏi lại thì không có đường **KÉO**.

## 3. Phương án bị LOẠI

### (A) Cắm LLM có quyền đọc dữ liệu, trả lời tự do — LOẠI

Đây là phương án nghe hợp với tên việc nhất, và sai nhất. Năm lý do, xếp theo
sức nặng:

1. **Hai câu hỏi founder nêu đều là TRA CỨU, không phải hội thoại.** "Hôm nay
   tôi có việc gì" đã có câu truy vấn viết sẵn và đã chạy đúng nhiều tuần. Gọi
   LLM để đọc lại kết quả của một câu SQL là thêm một chỗ sai vào giữa hai thứ
   vốn đã đúng.
2. ~~**Máy chủ chưa có khoá AI** (việc #117 chờ founder quyết chi phí). Thiết kế
   dựa lên đó là tự khoá giá trị của việc này vào một quyết định chưa có.~~
   > ⚠️ **LÝ DO NÀY HẾT HIỆU LỰC 14/08** — founder đã duyệt chi phí, việc #117 đóng,
   > AI đã chạy thật trên máy chủ. **Nhưng quyết định LOẠI vẫn GIỮ NGUYÊN**: bốn lý do
   > còn lại (1, 3, 4, 5) không hề dựa vào việc có hay không có khoá — chúng nói về
   > *bản chất việc này là TRA CỨU*, *trần 3.000 tin của tiệm*, *tiêm lệnh qua dữ liệu
   > khách*, và *ranh giới danh tính*. Xem thêm mục "Điều kiện xem lại" cuối file.
3. **Trần 3.000 tin/tháng.** Bản tin hằng ngày đã ăn ~30 tin/người/tháng. Một
   bot trò chuyện được sẽ đốt trần rất nhanh, và người chịu là TIỆM chứ không
   phải ta.
4. **Tiêm lệnh qua dữ liệu khách.** Tên khách, ghi chú, nội dung hội thoại đều
   là chữ **do người ngoài nhập**. Nhét vào lời nhắc là mở đúng cửa mà ADR-0014
   và ADR-0015 đã phải rào kỹ. Ở đây còn nguy hơn vì đầu ra đi kèm **số điện
   thoại thật của khách**.
5. **Bài học tối nay.** Mỗi năng lực mới đặt trên một ranh giới danh tính là một
   chỗ có thể rò. Câu truy vấn tường minh thì soát được bằng mắt và kiểm được
   bằng máy; lời nhắc LLM thì không.

### (B) Bê nguyên cầu nối Claude Code sang Zalo — LOẠI

Cầu nối đó chạy **trên máy founder** và có cờ sửa file. Không có phiên bản "nhẹ
hơn" nào của nó an toàn cho nhân viên tiệm. Xem mục 1.

### (C) Bắt nhân viên gõ đúng cú pháp lệnh (`/viec`, `/khach <tên>`) — LOẠI

Đúng kỹ thuật nhưng sai người dùng: iFan bán cho chủ tiệm và nhân viên không rành
công nghệ. Ai nhớ được cú pháp thì đã mở app rồi.

### (D) Chờ việc #117 (bật AI máy chủ) rồi làm một thể — LOẠI

Giá trị của #128 **không phụ thuộc** vào AI. Gộp vào là tự hoãn một thứ đang
dùng được ngay để chờ một quyết định về tiền — đúng loại "hoãn bằng lý do yếu"
mà luật chung cấm.

## 4. QUYẾT ĐỊNH

**Bot Zalo trả lời bằng TRA CỨU tường minh, dùng lại chính câu truy vấn của bản
tin nhắc việc. Không gọi AI. Không thêm bảng.**

Hiểu ý bằng **khớp từ khoá tiếng Việt** trên một tập đóng nhỏ, làm ngay trong
hàm CSDL:

| Nhân viên nhắn (ví dụ) | Trả về | Nguồn |
|---|---|---|
| "việc", "hôm nay làm gì", "còn việc nào" | quá hạn · tới hạn hôm nay · 3 việc sát hạn nhất kèm giờ | đúng câu của `bot_digest_run()` |
| "lịch", "hẹn", "mấy giờ" | lịch hẹn của CHÍNH mình trong hôm nay | `appointments` (ADR-0009) |
| "khách <tên>", "sđt <tên>" | tối đa 3 khách khớp tên: tên + điện thoại | `contacts` trong đúng tiệm |
| còn lại | câu ngắn nói **nó làm được gì**, không đoán bừa | — |

Vì sao khớp từ khoá là đủ chứ không phải làm ẩu: tập đóng chỉ 3 ý, tiếng Việt
phân biệt rõ ("việc" / "lịch" / "khách"), và **nhánh không hiểu KHÔNG đoán** —
nó nói thẳng nó hiểu được gì. Sai thì sai về phía im lặng, không về phía bịa.

## 5. RANH GIỚI QUYỀN — phần dễ làm sai nhất

**Bốn chốt, thiếu một là hỏng cả thiết kế:**

1. **Phạm vi tiệm đến từ WEBHOOK, không từ người nhắn.** `?ch=<channel>` quyết
   định tiệm; người nhắn không nêu tiệm và không đổi được. Cùng một số Zalo nối
   hai tiệm thì là hai hàng `staff_channel_links` khác nhau, hỏi ở bot nào trả
   dữ liệu tiệm đó.

2. **Không được trả nhiều hơn thứ người đó mở app ra xem được.**
   - Việc & lịch: `owner_id`/`staff_user_id` = chính người đó — giữ đúng hành
     vi bản tin hiện tại. Không có "xem việc cả tiệm" ở v1.
   - Khách: theo ĐÚNG policy `contacts_select` (migration #65) —
     owner/admin/manager/viewer xem cả tiệm, **staff chỉ xem khách mình phụ
     trách**.

   ⚠️ **VÁ 14/08 (migration #121) — bản đầu của ADR này viết mục 2 thành "chỉ
   trả dữ liệu của chính người hỏi", và người thi công (chính tôi) hiểu thành
   "khách thì cứ trong tiệm là được".** Kết quả: nhân viên thường lấy được số
   điện thoại của mọi khách trong tiệm qua Zalo, trong khi mở app ra chỉ thấy
   khách mình phụ trách. **Bot rộng hơn app = lỗ**, đúng họ với migration #119
   đêm trước, tái phạm sau vài tiếng.

   Bài kiểm ca 6 bản đầu cũng không bắt được, vì nó chỉ hỏi *"có tìm ra khách
   không"* chứ không hỏi *"ai được phép tìm"* — nó chạy XANH trên đúng hành vi
   sai. Đã viết lại thành 4 ca (staff không thấy khách đồng nghiệp · đối chứng
   chính chủ thấy · đối chứng quản lý thấy cả tiệm · ký tự đại diện `%`).

   **Câu hỏi bắt buộc cho MỌI cửa đọc dữ liệu ngoài app** (bot, webhook, RPC
   definer): *"người này mở app ra có xem được đúng chừng này không?"*. Nhiều
   hơn là lỗ. Hàm `security definer` bỏ qua RLS nên không có lưới đỡ nào —
   luật phải chép tay và chép đúng.

3. **Phải kiểm TƯ CÁCH THÀNH VIÊN CÒN HIỆU LỰC tại lúc trả lời**, không chỉ kiểm
   "có hàng liên kết". Người bị gỡ khỏi tiệm mà hàng `staff_channel_links` còn
   sót lại thì vẫn hỏi được — đúng họ với việc #69 (*người bị gỡ vẫn giữ quyền
   tới khi hết hạn phiên*) và với chính lỗ tối nay. **Bắt buộc join
   `tenant_members` với `status = 'active'`.**

4. **Ép ở CSDL, không ép ở route** (bất biến 1). Toàn bộ logic nằm trong một hàm
   `security definer` chốt bằng `p_key` đối chiếu `bot_ingest_key` — y khuôn
   `bot_link_via_code`. Route chỉ chuyển tin và gửi trả lời.

**Không cần nhật ký đọc chéo** (`admin_audit_logs`): đây là người trong tiệm đọc
dữ liệu của chính mình, không phải đọc chéo tiệm như ADR-0006. Nhưng **cần** đếm
tin để giữ trần — xem mục 6.

## 6. Giữ trần 3.000 tin — không để nhân viên đốt hết của tiệm

- Mỗi câu trả lời tốn **1 tin** vào `channel_quota` của tiệm, đếm y như bản tin.
- **Trần riêng cho hỏi đáp: 20 câu/người/ngày.** Chạm trần → trả **một** câu báo
  đã hết lượt hôm nay (tin đó cũng tính), rồi im. Không im lặng bỏ qua.
- Chạm trần tháng của tiệm → dừng trả lời, **rung chuông `system_alerts`** đúng
  khuôn `bot_digest_run()` đã làm. Không chết ngầm.

Con số 20 chọn theo cùng lập luận với trần AI trực việc: đủ rộng cho người dùng
thật cả ngày, đủ chặt để một người không kéo sập hạn mức của cả tiệm.

## 7. Nghiệm thu (ca bắt buộc, vào `scripts/rls-smoke.mjs`)

Theo luật D3: mỗi ca phải **nhìn thấy ĐỎ ít nhất một lần** trước khi tin là xanh.

| Ca | Ngưỡng đạt |
|---|---|
| 1. Hỏi "việc" | Trả đúng số quá hạn/tới hạn **của chính mình**, khớp con số `bot_digest_run()` tính cho cùng người |
| 2. Việc của ĐỒNG NGHIỆP | **Không** lọt vào câu trả lời |
| 3. Chat id lạ (chưa liên kết) | Trả câu chỉ đường lấy mã, **không** lộ dữ liệu gì |
| 4. Người **đã bị gỡ** khỏi tiệm (còn hàng liên kết) | **Bị từ chối** — không trả dữ liệu |
| 5. Hỏi ở bot tiệm A bằng chat đã nối tiệm B | Chỉ ra dữ liệu **tiệm A** (hoặc từ chối), tuyệt đối không trộn |
| 6. "khách \<tên\>" | Chỉ khách **trong đúng tiệm đó**, tối đa 3 dòng |
| 7. Câu ngoài 3 ý | Trả câu "làm được gì", **không** đoán, không gọi AI |
| 8. Quá 20 câu/ngày | Trả đúng **một** câu báo hết lượt rồi im |
| 9. Tiệm chạm trần 3.000 tin/tháng | Dừng + sinh `system_alerts`, không im lặng |
| 10. `authenticated` gọi thẳng hàm trả lời | **Bị từ chối** (chỉ `p_key` hợp lệ mới gọi được) |

## 8. Hệ quả

- **Thêm:** 1 hàm CSDL (`bot_answer` — nhận `p_key`, `p_channel`, `p_chat_id`,
  `p_text`; trả `{reply, token}`); 1 nhánh trong `app/api/bot/webhook/route.ts`
  thay cho nhánh "chỉ đường" hiện tại; 10 ca nghiệm thu.
- **Không thêm:** bảng mới, màn hình mới, biến môi trường mới, phụ thuộc AI.
- **Không sửa:** đường bản tin nhắc việc, đường ghép nối `/link`, bot nền tảng.
- **Không có chuỗi dịch mới:** bot Zalo nói tiếng Việt, cùng lựa chọn với
  `bot_digest_run()` (thị trường chính; nội dung thông báo trong CSDL cũng là
  tiếng Việt).
- **Founder không phải làm gì thêm** — không khoá mới, không cấu hình mới.

## Điều kiện xem lại

- ✅ **ĐÃ KÍCH HOẠT VÀ ĐÃ XEM LẠI — 14/08/2026 (Opus).** ~~Khi founder bật AI trên máy chủ (#117)~~
  ⇒ founder duyệt chi phí ngày 14/08, việc #117 đóng, AI chạy thật trên máy chủ (đo trên CSDL:
  `ai_reply_log` có dòng `sent`).

  **Kết luận sau khi xem lại: GIỮ NGUYÊN quyết định LOẠI ở mục 3(A). Không đổi gì.**

  | Lý do LOẠI ở mục 3(A) | Còn đúng sau 14/08? |
  |---|---|
  | 1. Hai câu hỏi founder nêu là **TRA CỨU**, không phải hội thoại | ✅ còn — bản chất việc không đổi theo việc có khoá |
  | 2. Máy chủ chưa có khoá AI | ❌ **hết hiệu lực** — nay đã có |
  | 3. Trần **3.000 tin/tháng**, người chịu là TIỆM | ✅ còn |
  | 4. **Tiêm lệnh** qua tên/ghi chú/nội dung khách nhập | ✅ còn — và đầu ra kèm SĐT thật nên nguy hơn |
  | 5. Ranh giới danh tính: truy vấn tường minh soát được, lời nhắc LLM thì không | ✅ còn |

  **Một lý do chết không làm sập quyết định khi bốn lý do kia độc lập với nó.** Ghi rõ ở đây để
  lần sau ai đọc mục 3(A) thấy dòng *"chưa có khoá AI"* thì không tưởng cả quyết định đã hết căn cứ.

  **Bước tiếp theo vẫn CHƯA làm, vì điều kiện PHỤ chưa đạt:** dùng AI **chỉ để đoán ý** câu hỏi
  (không đưa dữ liệu khách vào lời nhắc), rồi vẫn chạy câu truy vấn tường minh ở mục 4 — cách đó gỡ
  giới hạn "3 ý" mà không mở cửa tiêm lệnh. Điều kiện: **chỉ làm khi ĐO ĐƯỢC rằng khớp từ khoá là
  không đủ.** Hiện chưa có số đo nào (bot vừa chạy, chưa có lượt dùng thật của nhân viên) ⇒ chưa làm.

  > 📌 **Cách bắt được điều kiện này — ghi lại vì nó là điểm yếu của cả hệ ADR.** Nó không tự báo.
  > Bắt được 14/08 nhờ **quét toàn bộ 17 ADR, đối chiếu từng "điều kiện xem lại" với thực tế hôm nay**
  > — đúng thứ README ADR cảnh báo bằng câu trích FlowX: *"Write the trigger **and** schedule the
  > audit; the first without the second is a comment."* iFan có trigger, **chưa có audit định kỳ**.
  > Nếu không quét thì dòng lý do 2 nằm sai vô thời hạn.
- **Khi có tiệm xin "xem cả tiệm" cho quản lý** ⇒ mục 5 chốt 2. Phải thiết kế
  riêng theo vai, không nới bằng một dòng điều kiện.
- **Khi Zalo đổi hạn mức 3.000 tin** ⇒ mục 6.

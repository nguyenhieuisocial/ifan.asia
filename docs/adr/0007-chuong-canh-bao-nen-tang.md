# ADR-0007 — "Chuông nền tảng": bot Zalo riêng báo founder, KHÔNG nhét vào hạ tầng bot của tiệm (12/08/2026)

**Trạng thái:** đã quyết, CHƯA thi công.
**Người quyết:** Opus 5, phiên 12/08, theo phân vai đã chốt (Opus = kiến trúc/bảo mật, Sonnet = code).
**Nguồn:** founder tự tạo một bot Zalo riêng và giao token ngày 12/08, để bịt đúng lỗ đã ghi nhận cuối task #81 — *"có người bấm «Cần giúp?» mà founder không biết"*.
**Ràng buộc gốc:** ADR-0006 mục 6 — "không có cửa mở im lặng", mọi lần đọc dữ liệu chéo tiệm phải để lại vết trong `admin_audit_logs`.

---

## 1. Bài toán

Task #81 dựng xong nút "Cần giúp?" + phiên hỗ trợ chỉ-đọc, nhưng **đầu chuông bị hở**: yêu cầu trợ giúp chỉ nằm im trên màn `/admin`, founder phải tự nhớ mở ra xem. Với sản phẩm mà "hỗ trợ cầm tay là chi phí bắt buộc" (spec 12), một yêu cầu nằm im 8 tiếng là mất khách.

Cần: **founder nhận được tín hiệu trên điện thoại, gần như tức thì, không phải mở máy tính.**

## 2. Đo thật trước khi thiết kế (không suy đoán)

Đọc mã ngày 12/08 — hạ tầng Zalo Bot đã có (#53/#54) và các mốc liên quan:

| Đo | Kết quả |
|---|---|
| `notification_channels`, `bot_outbox`, `staff_channel_links`, `channel_quota`, `link_codes` | **Cả 5 bảng đều `tenant_id not null references tenants`** |
| `bot_claim_outbox()` | JOIN `notification_channels` **theo `tenant_id`** để lấy token |
| `bot_digest_run()` | Duyệt **mọi hàng `staff_channel_links`** để soạn bản tin nhân viên |
| Webhook `/api/bot/webhook` | Định tuyến bằng `?ch=<uuid>`, chặn cứng bằng `UUID_RE` |
| Khóa worker | `private.app_config['bot_ingest_key']`, **đồng thời** là `secret_token` của webhook |
| `vercel.json` | **KHÔNG có mục `crons`** |
| Token bot founder | Đã cất Vault, tên secret `platform_bot:token` (12/08) |
| `help_requests` | Đã có trigger AFTER INSERT phát `help_request.created` (#77) |
| `system_alerts` | RLS bật, chỉ `is_platform_admin()` đọc được |
| `platform_admins` | RLS bật, **KHÔNG policy** — quy ước bảng cấp nền tảng của kho |

**Hai phát hiện đổi hẳn thiết kế:**

**(a) Founder không phải thành viên tiệm nào** ⇒ không có `tenant_id` để ngồi vào 5 bảng trên. Đây là ràng buộc cứng ở tầng CSDL, không phải chuyện đặt tên.

**(b) `/api/bot/outbox` hiện KHÔNG có nhịp nào gọi** — `vercel.json` không khai báo cron, và pg_net đã bị khóa (#36) nên CSDL không tự gọi HTTP được. Nghĩa là **bản tin nhân viên (#54) hiện cũng đang nằm im trong hàng đợi ở môi trường thật**, chỉ được đẩy đi ké mỗi khi có người nhắn bot. Đây là nợ có sẵn, ADR này phải né chứ không được thừa kế.

## 3. Phương án bị LOẠI

### (A) Tạo một "tiệm ma" cho nền tảng rồi dùng lại nguyên si hạ tầng #53/#54 — LOẠI

Rẻ nhất về mã, đắt nhất về hậu quả ngầm: `bot_digest_run()` sẽ **duyệt qua hàng ghép nối của founder và soạn bản tin nhắc-việc-nhân-viên gửi cho founder**; `channel_quota` mọc một tiệm không có thật; mọi câu đếm tiệm (`/admin`, hóa đơn, ghế) phải nhớ trừ ngoại lệ. Đúng loại "số liệu đá nhau" mà mục 18 đã tốn một đợt để dọn.

### (B) Bỏ `not null` khỏi `tenant_id` của 5 bảng để chứa hàng cấp nền tảng — LOẠI

Phải sửa ràng buộc duy nhất, RLS, và cú JOIN trong `bot_claim_outbox` của một đường **đang chạy đúng**. Đổi rủi ro mới lấy rủi ro cũ, trái luật "chỉ đụng thứ buộc phải đụng".

### (C) Dựng bộ máy song song đầy đủ (kênh + ghép nối + quota + cron + màn cài đặt riêng) — LOẠI

Sạch về kiến trúc nhưng nhân đôi ~500 dòng cho **một người nhận**. Vi phạm "không trừu tượng hóa cho mã dùng một lần".

### (D) Gửi thẳng từ server action, không hàng đợi — LOẠI

Zalo API sập/chậm là mất tin không dấu vết, và người bấm "Cần giúp?" phải chờ HTTP ngoài. Hàng đợi + thử lại là thứ #54 đã trả giá để có.

## 4. QUYẾT ĐỊNH

**Một bảng hàng đợi riêng cấp nền tảng + dùng lại toàn bộ phần "gửi" đã có. Không kênh, không quota, không cron, không màn hình mới.**

| Thành phần | Cách làm |
|---|---|
| Token bot | Vault, tên `platform_bot:token` — **hằng số**, nên KHÔNG cần bảng `notification_channels` cấp nền tảng |
| Chat id founder | `private.app_config['platform_bot_chat_id']` — **một người nhận**, nên KHÔNG cần bảng ghép nối |
| Hàng đợi | **Bảng mới duy nhất** `platform_outbox` (soi gương `bot_outbox`, bỏ `tenant_id`) |
| Gửi đi | Dùng lại `zaloBotChannel()` (`lib/notify/channel.ts`) — không viết adapter mới |
| Nhịp đẩy | **Không cron.** Xem mục 7 |
| Định tuyến webhook | Thêm nhánh `?ch=platform` (chuỗi cố định, nằm ngoài `UUID_RE` nên không đụng đường tiệm) |

Vì sao đây là đường đúng chứ không phải đường lười: ba thứ bị bỏ đi (kênh, ghép nối, quota) đều **chỉ có lý do tồn tại khi có NHIỀU tiệm × NHIỀU nhân viên**. Ở cấp nền tảng, cả ba thoái hóa thành hằng số. Dựng bảng cho một hằng số là chi phí không đổi lấy gì.

## 5. NỘI DUNG TIN — chỉ TÍN HIỆU, không kèm dữ liệu của khách

Đây là phần dễ làm sai nhất, và làm sai thì **phá luôn lớp trách nhiệm vừa dựng ở task #81**.

**Quyết định: tin Zalo báo founder KHÔNG chứa nội dung khách viết.**

- Được phép: **tên tiệm**, có/không cho xem màn hình, mốc giờ, và câu dẫn "mở /admin".
- **Cấm:** nguyên văn ô "Cần giúp?", tên/SĐT khách hàng cuối, bất kỳ trích đoạn dữ liệu nghiệp vụ nào.

Ba lý do, xếp theo sức nặng:

1. **Giữ nguyên vẹn nhật ký đọc.** `admin_pending_help_requests()` ghi `admin_audit_logs` mỗi lần founder đọc yêu cầu. Nếu nội dung bay thẳng vào Zalo, founder đọc được mà **không để lại vết** — lớp trách nhiệm của ADR-0006 bị vô hiệu bằng một đường vòng do chính ta mở.
2. **Dữ liệu tiệm A rời hệ thống qua kênh tiệm A không chọn.** Bản tin nhân viên (#54) là tiệm tự gửi dữ liệu của chính mình tới bot của chính mình — có đồng thuận. Chuông founder thì không, nên phải giữ ở mức tín hiệu.
3. Tin ngắn ⇒ rẻ, không đụng trần 3.000 tin/tháng của nền tảng bot.

Ngoại lệ **duy nhất**: tin `system_alert` được kèm nguyên `system_alerts.detail` — đó là sự cố hạ tầng của chính ta (tên job, lý do hỏng), không phải dữ liệu khách.

## 6. Ghép nối — mã một lần, không dựng màn hình

1. Sinh mã ngẫu nhiên vào `private.app_config['platform_bot_pair_code']`.
2. Founder nhắn bot: `/link <mã>`.
3. Webhook nhánh `platform` xác thực **secret_token header** (đã có) **+ mã** ⇒ ghi `platform_bot_chat_id`, **xóa mã** (dùng một lần), nhắn xác nhận.

Mã hết hạn theo lần dùng chứ không theo giờ — đơn giản hơn và đủ an toàn vì cửa webhook vốn đã khóa bằng `secret_token` mà chỉ nền tảng Zalo biết.

Thêm RPC `platform_bot_new_pair_code()` chỉ `is_platform_admin()` gọi được, để **đổi máy / đổi bot sau này không cần migration mới**. Chưa dựng nút bấm — chưa có nhu cầu thật (mục 2 luật chung).

## 7. Nhịp gửi — KHÔNG thêm cron, và nói thẳng chỗ chậm

Phát hiện (b) ở mục 2 nói rằng cắm thêm cron là tự nhận một phụ thuộc mà founder phải đi cấu hình. Né được:

- **Yêu cầu "Cần giúp?"**: do người dùng bấm trong app ⇒ chính server action đó **kích worker ngay** (`waitUntil`), y hệt cách webhook đang làm. Độ trễ ≈ tức thì, **không cần nhịp ngoài nào**.
- **Cảnh báo hệ thống** (`system_alerts`): do pg_cron ghi trong CSDL, mà CSDL không gọi ra ngoài được ⇒ **nằm chờ tới lần kích kế tiếp**. Có thể trễ hàng giờ.

**Nói thẳng:** vế thứ hai là *chấp nhận có điều kiện*, không phải đã xong. Ghi thành việc riêng: thêm `crons` vào `vercel.json` (1 lần/ngày là đủ cho câu hỏi "đêm qua có job nào hỏng không", và vừa hạn gói Hobby). **Không được** báo cáo "đã có chuông cảnh báo hệ thống" khi chưa cắm nhịp.

## 8. Ràng buộc bắt buộc (thiếu một cái là hỏng cả thiết kế)

- `platform_outbox`: **RLS bật, KHÔNG policy** — đúng quy ước `platform_admins`/`admin_audit_logs`. Mọi đường ghi qua hàm definer.
- Hàm chỉ-trigger / chỉ-cron **phải `revoke execute ... from anon, authenticated, public`**. Đây đúng là lỗi tự gây ở migration #77 phải vá bằng #78 — **không lặp lại lần hai**.
- Hàm worker (`platform_claim_outbox` / `platform_complete_outbox`) cấp cho `anon, authenticated` **nhưng chốt bằng `p_key`** đối chiếu `bot_ingest_key` — y khuôn `bot_claim_outbox`.
- **Vé chống trùng bắt buộc:** `help:<id>` (một yêu cầu một tin) và `alert:<job_id>:<ngày VN>` (một job hỏng tối đa một tin mỗi ngày). Thiếu vé là dội bom điện thoại founder mỗi 15 phút.
- Token **không bao giờ** đi qua client, không log, không vào git — chỉ Vault → hàm definer → server.
- Hai chế độ như mọi cửa khác: thiếu `BOT_INGEST_KEY` hoặc chưa ghép nối ⇒ **đứng yên im lặng**, không lỗi, không spam log.

## 9. Nghiệm thu (ca bắt buộc, vào `scripts/rls-smoke.mjs`)

| Ca | Ngưỡng đạt |
|---|---|
| `authenticated` (kể cả chủ tiệm) đọc `platform_outbox` | **0 dòng** |
| `authenticated` gọi thẳng hàm trigger/nội bộ qua RPC | **Bị từ chối** |
| Insert `help_requests` | Sinh **đúng 1** dòng `platform_outbox`, `kind='help_request'` |
| Insert cùng yêu cầu 2 lần / cùng job hỏng 2 lần trong ngày | **Vẫn 1 dòng** (vé chống trùng) |
| Nội dung tin `help_request` | **KHÔNG chứa** nguyên văn `help_requests.message` |
| Chưa ghép nối (`platform_bot_chat_id` trống) | Không sinh dòng nào, **không lỗi** |
| `platform_claim_outbox` sai `p_key` | **Ném `invalid_key`** |

Theo luật D3 (mục 36.12): mỗi ca trên phải được **nhìn thấy đỏ ít nhất một lần** trước khi tin là xanh.

## 10. Hệ quả

- **Thêm:** 1 bảng `platform_outbox`; 5 hàm (`platform_notify` nội bộ, `platform_claim_outbox`, `platform_complete_outbox`, `platform_bot_pair`, `platform_bot_new_pair_code`); 2 trigger (`help_requests`, `system_alerts`); `lib/notify/platform-outbox.ts`; 1 nhánh trong webhook; 1 lệnh kích trong server action "Cần giúp?"; 1 script đăng ký webhook chạy một lần.
- **Không sửa:** bất kỳ bảng/hàm/route nào của đường bot cấp tiệm.
- **Không có** màn hình mới, không chuỗi dịch mới (tin gửi founder chỉ tiếng Việt — cùng lựa chọn với `bot_digest_run`).
- **Founder phải làm 2 việc** (không ai làm hộ được): xác nhận biến `BOT_INGEST_KEY` đã đặt trên Vercel, và nhắn `/link <mã>` cho bot một lần.
- ~~**Nợ ghi sổ, không được im lặng bỏ:** cắm nhịp `crons` cho `/api/bot/outbox`~~ → ✅ **ĐÃ TRẢ 12/08 (việc #85):** `vercel.json` khai `crons` chạy `/api/bot/outbox` mỗi 15 phút, đã xác nhận đăng ký với Vercel. Bản tin nhân viên (#54) không còn nằm im.

## Điều kiện xem lại

- **Khi có người nhận THỨ HAI ngoài founder** ⇒ mục 4 sập ngay. Toàn bộ thiết kế "không kênh, không ghép nối, không quota" đứng được **chỉ vì** cả ba thoái hóa thành hằng số khi có đúng một người nhận. Thêm người thứ hai là quay về mô hình `notification_channels`, không phải thêm một dòng cấu hình.
- **Khi Zalo đổi hạn mức Bot Platform hoặc ngừng dịch vụ** ⇒ mục 4 dòng "Gửi đi" và ADR-0002 mục 7.
- **Khi lượng cảnh báo vượt sức của nhịp đẩy hiện tại** (đo: độ trễ từ lúc sinh cảnh báo tới lúc founder nhận) ⇒ mục 7 — lúc đó mới cắm cron riêng, không cắm trước.

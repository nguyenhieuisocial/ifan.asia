# ADR-0007 — "Chuông nền tảng": bot Zalo riêng báo founder, KHÔNG nhét vào hạ tầng bot của tiệm (12/08/2026)

**Trạng thái:** **ĐÃ THI CÔNG** (việc #84) — 8 ca nghiệm thu mục 9 chạy trong CI; đã vá thêm 2 lỗ quyền sau đó (migration #102 hai-đường-nhận, #119 chủ-dự-án≠chủ-tiệm).
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

## 11. VÁ 13/08 — "chủ tiệm" từng bị nhận nhầm thành "chủ dự án" (migration #119)

ADR này chốt người nhận là **founder**, xác định bằng `platform_bot_chat_id`
(Zalo) — đúng, và giữ nguyên. Nhưng khi Telegram được thêm làm kênh thứ hai
(migrations #96 → #99 → #102), cả ba lần đều xác định founder bằng câu hỏi
**sai**: *"có phải chủ/quản trị của MỘT TIỆM NÀO ĐÓ không?"* (`tenant_members`).

Hậu quả vượt xa "chuông báo nhầm người". Vì `create_tenant()` cấp cho
`authenticated` và tự đặt người gọi làm `owner`, còn đăng ký iFan là tự phục
vụ, nên **bất kỳ ai** cũng tự cấp cho mình vai "chủ tiệm" được. Nối Telegram
xong là bot coi họ là chủ dự án ⇒ nhận lời dặn `HINT_OWNER` **và** cờ
`--permission-mode acceptEdits`, tức **sửa file thẳng trên máy founder**, cộng
với tiêu vào gói Claude của founder. Danh sách cho phép `TELEGRAM_OWNER_IDS`
bị nhánh này vô hiệu hoàn toàn.

**Luật bất biến rút ra — không được vi phạm lần nữa:**

> Mọi cổng quyền cấp NỀN TẢNG chỉ được hỏi `platform_admins`.
> `tenant_members.role in ('owner','admin')` là **khách hàng**, không bao giờ
> là căn cứ cấp quyền nền tảng.

Hai vai phải giữ tách bạch:

| | Nguồn sự thật | Được gì |
|---|---|---|
| **Chủ dự án** | `platform_admins` | trợ lý lập trình đầy đủ, sửa file, model mạnh, không hạn mức, nhận chuông nền tảng |
| **Chủ tiệm** | `tenant_members` | **là khách hàng** — chỉ thông tin công khai, đúng luật founder đã chốt |

Cho chủ tiệm hỏi việc trong tiệm của họ là **tính năng riêng phải thiết kế**
(việc #128), không phải thứ rơi vào do đọc nhầm bảng.

Trường `is_staff` của `tg_who_is` đã **gỡ hẳn** — nó có đúng 3 nơi dùng và cả
ba đều dùng sai làm cổng quyền; giữ lại là để nguyên cái bẫy. Thay bằng
`is_founder`. Bảy ca nghiệm thu D3 nằm ở `scripts/rls-smoke.mjs` (khối "Chủ dự
án ≠ chủ tiệm"), đã xác nhận thấy ĐỎ trên bản hỏng trước khi xanh.

**Bài học chung:** migration #99 chữa đúng hướng (đọc từ CSDL thay vì thêm biến
môi trường) nhưng đọc nhầm bảng — chữa "founder bị coi là khách" bằng cách biến
"mọi chủ tiệm thành founder". Tiếng Việt gọi cả hai là "chủ" nên trôi qua cả
lúc viết lẫn lúc đọc lại. Khi hai khái niệm khác nhau dùng chung một từ, phải
đặt tên phân biệt trong mã (`is_founder` chứ không phải `is_owner`/`is_staff`).

## 12. VÁ 14/08 — hai lỗ founder chỉ ra, và một xung đột với chính mục 5

**Founder báo:** *"Chủ đề Khách Hàng có thông báo bị double 2 lần và nội dung không đủ chi tiết. Cần đầy đủ thông tin khách hàng kể cả IP, vị trí… Các chủ đề còn lại không thấy có thông báo tự động gì!"*

### 12a. Cái "đúp" — máy gửi KHÔNG hỏng, dữ liệu test bắn chuông thật

Đo trên CSDL thật: mọi dòng `attempts=1`, không dòng nào trùng nội dung, khoá hàng và vé chống trùng đều đúng.

**Thủ phạm: `scripts/test-rls-isolation.mjs` tạo hai tiệm mỗi lần chạy** (`RLS Test a/b`) mà **không đánh dấu `is_sample`** ⇒ trigger `tenants_notify_signup` coi là tiệm thật ⇒ 2 chuông mỗi lần chạy. **12 tin `tenant_signup` ngày 14/08 — không tin nào là tiệm thật.**

> **Luật rút ra, rộng hơn cái bug: DỮ LIỆU DO TEST DỰNG KHÔNG ĐƯỢC CHẠM VÀO ĐƯỜNG BÁO SẢN XUẤT.** Phải đánh dấu **ngay lúc tạo**, không phải dọn sau — vì chuông bắn tại `after insert`, dọn sau là đã muộn. Và đây không phải chuyện tiếng ồn: **chuông kêu nhầm 12 lần một buổi sáng thì người ta học cách lướt qua nó**, rồi bỏ lỡ đúng tin thật. Cảnh báo sai làm hỏng chính thứ nó bảo vệ — cùng lý do mục 4 đã cấm phát một tin ra nhiều chủ đề.

Soát cả `scripts/rls-smoke.mjs` (`Smoke A`/`Smoke B`/`Smoke Foreign`) và mọi chỗ khác `insert` vào `tenants`.

### 12b. ⚠️ "Đầy đủ thông tin khách hàng" — mục 5 CẤM, nhưng chỉ cấm một nửa

Đọc thẳng mục 5: *"Cấm: tên/SĐT khách hàng cuối, bất kỳ trích đoạn dữ liệu nghiệp vụ nào."* Nghe như founder vừa yêu cầu thứ ADR này cấm. **Không phải — vì "khách hàng" ở đây là hai loại người khác hẳn nhau, và mục 5 chỉ nói về một loại.**

| | **Người đăng ký iFan** (tin `tenant_signup`) | **Khách hàng cuối của tiệm** (tin `help_request`) |
|---|---|---|
| Là ai | Chủ tiệm mở tài khoản — **người dùng trực tiếp của iFan** | Khách của tiệm A — iFan chỉ **giữ hộ** dữ liệu |
| Ai là chủ dữ liệu | **iFan** | **Tiệm A** |
| Mục 5 nói gì | **Không nói tới** — mục 5 viết cho luồng "Cần giúp?" | **Cấm**, ba lý do vẫn nguyên |
| 14/08 | ✅ **ĐƯỢC làm dày**: người đăng ký, IP, tỉnh/thành, thiết bị, nguồn đến, link `/admin` | ⛔ **GIỮ NGUYÊN mức tín hiệu** |

**Ba lý do của mục 5 vẫn đứng vững cho `help_request`, kiểm lại từng cái:**

1. **Nhật ký đọc** — `admin_pending_help_requests()` ghi vết mỗi lần founder đọc. Bắn nội dung thẳng vào Telegram là founder đọc được **mà không để lại vết**, vô hiệu lớp trách nhiệm ADR-0006 bằng đường vòng do chính ta mở. **Không liên quan gì tới chuyện có khoá AI hay không — lý do này độc lập.**
2. **Dữ liệu tiệm A rời hệ thống qua kênh tiệm A không chọn.** Vẫn đúng.
3. Tin ngắn thì rẻ. Yếu nhất, nhưng không cần tới nó.

⇒ **Làm dày `tenant_signup`, KHÔNG làm dày `help_request`.** Ai code phần này mà thấy câu "cần đầy đủ thông tin khách hàng" rồi áp cho cả hai là **phá lớp trách nhiệm**, không phải làm theo ý founder.

**Ràng buộc thêm cho phần IP/vị trí:** dùng lại nền nhật ký đăng nhập + vị trí (việc #64), **cấm dựng đường thứ hai** (bất biến 3). Dữ liệu này **chỉ founder/super-admin** xem — không lộ sang bất kỳ vai nào trong tiệm, kiểm bằng ca RLS.

### 12c. Chủ đề im lặng — phần lớn là THẬT, nhưng không ai phân biệt được

Đo: đã từng có tin — `release`(31) · `tenant_signup`(12) · `daily_pulse`(1) · `feature_change`(1) · `user_failure`(1). **Chưa bao giờ** — `help_request` · `billing` · `churn` · `system_alert` · `channel_down` · `weekly_pulse`.

Phần lớn số 0 là **đúng sự thật**: chưa khách trả tiền ⇒ không có tin gói cước; chưa tiệm nào bỏ đi; chưa kênh nào chết. **Nhưng người đọc không có cách nào phân biệt "chưa có gì xảy ra" với "hỏng, không ai báo"** — và đó đúng là con bệnh cả ngày 14/08 đi vá. Im lặng có hai nghĩa trái ngược mà trông y hệt nhau.

Chữa: mỗi chủ đề phải **tự khai còn sống** (bản tin ngày/tuần nói rõ "chủ đề X: 0 tin, lần cuối có tin là <ngày>"). ⚠️ Cân nhắc khi làm: đừng biến chính cái này thành tiếng ồn mới — đó là cách hỏng của mọi hệ cảnh báo.

**✅ ĐÃ LÀM (migration #124).** Đặt ở bản tin TUẦN (không phải ngày — daily thì thành phông nền bị lờ đi, đúng nguy cơ vừa cảnh báo ở trên). Máy **không tự phán** "hỏng hay chưa xảy ra" — chỉ khai quan sát được: 5 loại tin (`help_request`,`billing`,`churn`,`system_alert`,`channel_down`) không có tin nào trong 30 ngày ⇒ liệt kê "chưa từng có tin", người đọc tự phán bằng bối cảnh họ có. Đổi thêm: `weekly_pulse` trước đây **im hẳn** nếu tuần đó không có hoạt động — nghĩa là đúng tuần cần trấn an nhất thì bản tin tự nó cũng im theo. Nay **luôn gửi**, tuần yên ắng nói thẳng "tuần này chưa có gì" thay vì im lặng kép.

**✅ Việc 5 (D3 cho `system_alert`) — đã chứng minh, KHÔNG cần sửa code.** Mô phỏng một lượt cron thất bại thật (chèn dòng `status='failed'` vào `cron.job_run_details`, gọi `cron_failure_scan()`), trong giao dịch rollback (không để lại rác): dây chuyền `cron_failure_scan → system_alerts → trigger → platform_notify → platform_outbox` chạy đúng, tin chuông được tạo. **`system_alert = 0` là con số THẬT** — chưa việc chạy nền nào hỏng — không phải cổng kiểm gãy.

### 12d. Bản tin ra bản mất dòng tiếng Việt — vì BỊ CẮT, không phải vì ai quên viết

Founder báo lần hai: *"các thông báo vẫn bug chưa đầy đủ và chi tiết, và lỗi không dấu"* — **dù 17/21 commit hôm 14/08 đã có dòng `Founder:`**.

Đo từng commit ra quy luật sạch:

| Dòng `Founder:` ở ký tự thứ | Kết quả |
|---|---|
| **85** | ✅ founder nhận đúng câu tiếng Việt |
| 982 · 1.151 · 1.366 · 2.071 | ❌ rơi về **tiêu đề không dấu** |

`VERCEL_GIT_COMMIT_MESSAGE` **bị cắt cụt**. Dòng nằm gần đầu thì sống; nằm sâu trong thân dài thì mất, hàm rơi về lưới đỡ = tiêu đề, mà tiêu đề **viết không dấu theo quy ước**.

⚠️ **Khuôn nhận dạng KHÔNG hỏng** — đã chạy thử chính nó trên nội dung thật của cả hai commit, bắt đúng cả hai. **Đừng đi sửa hàm SQL.** Lỗi ở đầu vào.

> **Nghịch lý phải nhớ: commit viết càng kỹ thì càng dễ mất dòng này.** Và mất trong im lặng. Đã vá luật vị trí trong `AGENTS.md`.

### 12e. ⚡ ĐẢO QUYẾT ĐỊNH 14/08 — Haiku soạn lại mọi thông báo trước khi gửi

**Chỉ đạo founder:** *"các thông báo cần Haiku review và soạn gửi phù hợp!"*

⚠️ **Đây là ĐẢO một quyết định đã ghi.** Migration #112 (13/08) từng xét đúng phương án này và **loại** nó:

> *"2. Nhờ AI viết lại câu commit cho dễ hiểu — thêm một lượt gọi AI mỗi lần lên bản, và AI phải **ĐOÁN** ý nghĩa từ chữ kỹ thuật. Đoán thì có ngày đoán sai, mà đây là tin founder tin để biết sản phẩm đang đi tới đâu."*

**Ba điều đã đổi khiến lý do loại đó không còn đứng vững:**

1. **Phương án được chọn thay thế đã THẤT BẠI có số đo.** Cách 3 ("người ra bản tự viết") phụ thuộc **cả kỷ luật người viết lẫn một đường truyền cắt cụt được**. Đo 14/08: 4/21 commit quên viết, và 5 commit **có viết vẫn mất**. Tỷ lệ tới đích thực tế ~12/21.
2. **Máy chủ đã có khoá AI** (việc #117, đóng 14/08). Khi viết #112 thì chưa có.
3. **Giá đã rẻ đi 5 lần** — Haiku 4.5 ~82đ/lượt (Opus 410đ). Vài chục bản/ngày là vài nghìn đồng.

**Và lo ngại gốc "AI phải ĐOÁN" nay yếu hẳn — vì đổi được đầu vào:** #112 giả định AI chỉ có **tiêu đề kỹ thuật** để đoán. Nay cho nó **cả thân commit** (hoặc dữ liệu có cấu trúc của sự kiện) thì nó **tóm tắt** chứ không **đoán**. Hai việc khác hẳn nhau về rủi ro.

#### Quyết định

**Haiku 4.5 soạn lại mọi tin chuông trước khi gửi — nhưng KHÔNG được là điểm chết, và KHÔNG được bịa.**

| Ràng buộc | Vì sao |
|---|---|
| **Dòng người viết THẮNG khi có** | Giữ nguyên phần đúng của #112: người ra bản biết rõ nhất mình đổi gì. Haiku chỉ soạn khi **thiếu** dòng đó, hoặc để **làm dày** thêm dữ kiện có sẵn |
| ⛔ **CẤM thêm dữ kiện không có trong đầu vào** | Đây là tin founder tin để biết sản phẩm đi tới đâu. Bịa một lần là hỏng cả kênh. Lời dặn phải nói thẳng: thiếu thì ghi "không rõ", không suy diễn |
| **Hỏng thì gửi bản thô, không nuốt tin** | Cùng nếp "nuốt lỗi có chủ đích" của mục 12a: chuông hỏng không được làm mất tin. AI lỗi/hết hạn mức ⇒ gửi nguyên bản cũ |
| **Không chặn hàng đợi** | Soạn lại nằm trong đường gửi vốn đã chạy nền 15 phút/lần — bọc `Promise.race` hạn 8 giây, một tin soạn chậm/treo không được giữ 19 tin còn lại |
| **Không dựng đường đếm mới** | Khối lượng đã bị chặn tự nhiên bởi `p_batch=20` của `platform_claim_outbox` (tối đa 20 lượt AI mỗi lần cron chạy) |
| ⛔ **Không đổi ranh giới dữ liệu ở 12b** | Haiku soạn lại **cách viết**, không mở thêm quyền đọc. `help_request` vẫn ở mức tín hiệu |
| **Ghi lại bản trước/sau** | Cột mới `platform_outbox.sent_body` (nullable) — không dùng `ai_reply_log` |

> **⚠️ ĐÍNH CHÍNH 14/08 (Sonnet, lúc code) — bản đầu của bảng trên ghi "Dùng lại túi lượt + trần chi tiêu ADR-0011 việc 6" và "Ghi lại bản trước/sau vào `ai_reply_log`". Cả hai SAI, viết lúc chưa đọc kỹ code.**
> - `increment_usage`/`increment_usage_for` đều bắt buộc `p_tenant NOT NULL`, còn `platform_outbox` tự khai ngay trong comment của chính nó: *"không tenant_id, một người nhận duy nhất"*. Không có tenant thì không tính quota theo tenant được — ép dùng chung sẽ phải bịa một tenant giả, còn tệ hơn không dùng. **Cách đã làm:** gọi thẳng `createCompletion` (bỏ qua `guard()`/quota tenant), an toàn nhờ trần khối lượng tự nhiên đã nêu ở bảng trên.
> - `ai_reply_log` có `tenant_id`/`conversation_id` NOT NULL và outcome là enum đóng khớp đúng 8 ca của AI trực việc — ép platform_outbox (không tenant, không hội thoại) vào đó là bịa dữ liệu cho vừa khuôn, đúng thứ luật D2 cấm. Thay bằng cột `sent_body` (nullable) ngay trên bảng `platform_outbox`: null = gửi nguyên bản gốc, có giá trị = Haiku đã soạn lại và đó là bản thật sự gửi.
>
> Chi tiết đầy đủ + bằng chứng D3 (gọi thật Anthropic API, 4 ca bao gồm ca "không được bịa"): `supabase/migrations/20260814000122_platform_outbox_ai_rewrite.sql`.

⇒ Hệ quả tốt ngoài dự tính: **bug "không dấu" tự hết** — Haiku nhận tiêu đề không dấu và trả về câu tiếng Việt có dấu, nên kể cả khi dòng người viết bị cắt mất, founder vẫn nhận được câu đọc được. **Đã kiểm bằng lệnh gọi thật (không mô phỏng):** đưa đúng tiêu đề không dấu của bug thật hôm nay vào, Haiku trả về câu có dấu chuẩn, giữ nguyên mã bản; đưa dữ liệu thiếu vào, Haiku trả về y nguyên — không tự chế thêm chi tiết.

Việc thi công: **#138**.

## Điều kiện xem lại

- **Khi có người nhận THỨ HAI ngoài founder** ⇒ mục 4 sập ngay. Toàn bộ thiết kế "không kênh, không ghép nối, không quota" đứng được **chỉ vì** cả ba thoái hóa thành hằng số khi có đúng một người nhận. Thêm người thứ hai là quay về mô hình `notification_channels`, không phải thêm một dòng cấu hình.
- **Khi Zalo đổi hạn mức Bot Platform hoặc ngừng dịch vụ** ⇒ mục 4 dòng "Gửi đi" và ADR-0002 mục 7.
- **Khi lượng cảnh báo vượt sức của nhịp đẩy hiện tại** (đo: độ trễ từ lúc sinh cảnh báo tới lúc founder nhận) ⇒ mục 7 — lúc đó mới cắm cron riêng, không cắm trước.

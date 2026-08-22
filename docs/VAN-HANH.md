# Vận hành — cài đặt CHỈ nằm trên Dashboard, không có trong code

Nguyên tắc của repo này (xem README): `supabase/migrations/` là nguồn sự thật
duy nhất, không sửa tay trên Dashboard. Trang này ghi lại đúng những NGOẠI LỆ
đã biết — cài đặt bắt buộc mà Supabase KHÔNG cho làm qua migration SQL, chỉ
bật được bằng tay trên Dashboard. Dựng lại dự án ở project Supabase mới
(khôi phục sự cố, tách môi trường staging...) mà quên các mục dưới đây thì hệ
thống vẫn chạy nhưng SAI hành vi — không báo lỗi rõ ràng ngay.

## 1. Custom Access Token Hook — BẮT BUỘC bật (ADR-0005)

**Vì sao quan trọng:** toàn bộ phân quyền/cách ly dữ liệu giữa các tiệm
(RLS) dựa vào claim `app_metadata.tenant_id`/`role` trong JWT, do hook này
nhét vào mỗi lần cấp token. Tắt hook không làm hệ thống sập — có nhánh dự
phòng (`current_tenant_id()`/`app_role()`, migration #3) tự tra bảng
`tenant_members` khi thiếu claim — nhưng nhánh dự phòng dùng luật khác
("tiệm cũ nhất") chứ không phải "tiệm đang chọn" (migration #66). Người dùng
có nhiều tiệm sẽ thấy hành vi sai lệch mà không có lỗi nào hiện ra.

**Cách bật:**
1. Supabase Dashboard → project → **Authentication** → **Hooks**
2. Mục **Customize Access Token (Auth Hook)** → chọn hàm
   `public.custom_access_token_hook` → Enable

**Cách xác nhận đã bật đúng (đừng tin bằng mắt, đo bằng token thật):**
```bash
node scripts/test-rls-isolation.mjs
```
Script tự đăng nhập user thật, giải mã JWT, khẳng định `app_metadata.tenant_id`
CÓ mặt. Ca kiểm "Custom Access Token Hook ĐANG BẬT" chạy trong CI mỗi lần
push (`.github/workflows/ci.yml`, bước "RLS isolation test qua client SDK") —
nhưng CHỈ phát hiện được TRÊN project mà biến môi trường CI đang trỏ tới.
Đổi sang project Supabase mới thì phải tự chạy lại bằng tay TRƯỚC khi tin CI
xanh có nghĩa là đã cấu hình đúng.

## 2. Vault (Zalo channel secrets)

Token/secret kênh Zalo lưu qua Supabase Vault (`vault.create_secret`), không
nằm trong bảng thường — RPC `get_zalo_channel_secrets`/`connect_zalo_channel`
(migration liên quan tới #31) đọc/ghi qua Vault. Vault đi kèm sẵn với mọi
project Supabase, không cần bật riêng — ghi ở đây để nhớ: KHÔNG thử tạo bảng
`channel_secrets` thường thay thế nếu dựng project mới, phải dùng đúng Vault.

## 3. pg_net extension — PHẢI khoá

Migration #36 đã tắt/hạn chế `pg_net` (cửa SSRF nếu để mở). Dựng project mới
từ đầu: kiểm `select * from pg_extension where extname='pg_net'` — nếu bật,
theo đúng các bước migration #36 để khoá lại, không bật mặc định.

## 4. Móc pre-commit trong kho VAULT (ADR-0018) — máy mới/kho mới mất, không báo

**Vì sao quan trọng:** vault (`C:\iFan.asia`, kho git RIÊNG với kho code này)
tự đóng dấu "ngày tạo"/"sửa lần cuối" vào đầu mỗi file `.md` mỗi lần commit,
qua móc `pre-commit`. Móc git **không nằm trong git** (`.git/hooks/` không
được commit theo thiết kế của chính git) — máy mới, hoặc clone lại kho vault
(khôi phục sự cố, máy thứ hai...), móc này **biến mất hoàn toàn mà không có
gì báo lỗi**. Vault vẫn commit bình thường, chỉ là ngày không còn tự cập
nhật — sai hành vi âm thầm, đúng loại lỗi mục này được lập ra để chống.

**Cách cài (chạy MỘT LẦN mỗi máy, từ kho code này):**
```bash
node scripts/vault-ngay.mjs --cai-moc
```
Ghi file `C:\iFan.asia\.git\hooks\pre-commit` — gọi ngược lại đường tuyệt
đối `scripts/vault-ngay.mjs` trong kho code trên MÁY ĐÓ. Đổi đường kho code
(clone sang ổ đĩa/thư mục khác) thì phải cài lại để móc trỏ đúng chỗ.

**Cách xác nhận đã cài đúng (đừng tin bằng mắt):**
```bash
node scripts/vault-ngay.mjs --kiem
```
Chạy trong kho vault (hoặc trỏ `VAULT` trong script) — phải ra **✅ XANH**.
Muốn chứng minh móc THẬT SỰ chạy khi commit: sửa nội dung một file `.md`
trong vault, `git add` + `git commit`, rồi mở file đó — dòng `sửa lần cuối`
trong frontmatter phải tự đổi thành hôm nay mà không cần chạy tay lệnh nào.

Xem đầy đủ thiết kế + 4 ca nghiệm thu: `docs/adr/0018-ngay-thang-vault-tu-dong.md`.

## 5. Sentry — sổ lỗi ngoài (nối 22/08/2026)

**Dự án:** `hieuasia / ifan` · mã dự án `4511955507675136`.

**Vì sao có, trong khi đã có sổ lỗi trong app.** Sổ `app_errors` + chuông ở
`/admin` ghi được *có lỗi* và *ở màn nào*, nhưng chỉ giữ lời lỗi và vết gọi hàm
đã nén. Vết của bản chạy thật đọc ra kiểu `t.a is not a function at
chunk-8f2.js:1:48210` — biết có lỗi mà không biết lỗi ở đâu. Sentry giữ bản đồ
mã nguồn nên chỉ thẳng ra tên tệp, tên hàm, số dòng trong mã gốc. **Hai sổ
không thay thế nhau:** sổ trong app là cái founder nhìn hằng ngày; Sentry là
cái người sửa lỗi mở ra khi cần lần theo.

### Bốn khoá — cái nào công khai, cái nào không

| Khoá | Bí mật? | Dùng để làm gì | Cất ở đâu |
|---|---|---|---|
| **DSN** (`NEXT_PUBLIC_SENTRY_DSN`) | KHÔNG | Gửi lỗi lên. Nằm trong mã chạy ở trình duyệt, ai xem mã nguồn trang cũng thấy. Chỉ cho GỬI, không đọc được gì | `.env.local` + biến môi trường trên Vercel |
| **Secret Key** | CÓ | Khoá đời cũ, iFan **không dùng tới** | Không đưa vào kho nào. Xoá được thì xoá ở Sentry |
| **Deploy Token** | CÓ | Báo "vừa lên bản mới" qua Webhook URL. iFan **chưa dùng** | Không đưa vào kho nào |
| **`SENTRY_AUTH_TOKEN`** | CÓ | **Chưa có.** Tải bản đồ mã nguồn lên lúc dựng bản. Tạo riêng ở phần cài đặt tổ chức của Sentry — **KHÔNG PHẢI** Deploy Token hay Secret Key | Chỉ đặt trên Vercel, không ghi vào tệp nào |

⚠️ **Không ghi khoá bí mật vào vault.** Kho vault hiện chưa nối lên mạng nên
tạm an toàn, nhưng ngày nào nối lên là lộ hết mà không có gì báo. Khoá bí mật
chỉ sống ở biến môi trường trên Vercel và ở `.env.local` của máy lập trình
(đã nằm trong `.gitignore`).

### Luật đã cài để không lặp lại lỗi cũ

**Máy lập trình MẶC ĐỊNH KHÔNG gửi lên Sentry.** Ngày 22/08 chuông của sổ
`app_errors` kêu 6 lần trong 3 tiếng, soi ra cả 7 dòng đều sinh từ máy này —
vì `.env.local` cầm đúng khoá của dự án Supabase THẬT. Sentry sẽ dính y hệt
nếu chỉ xét "có khoá thì gửi". Nên chỉ bản trên Vercel mới gửi; máy lập trình
muốn thử phải gõ thêm `NEXT_PUBLIC_SENTRY_GUI_TU_MAY_DEV=1`.

**Session Replay CỐ Ý TẮT.** Nó quay lại màn hình người dùng — tức tên khách,
số điện thoại, nội dung tin nhắn rời khỏi Supabase sang máy chủ bên thứ ba.
Muốn bật phải hỏi founder và phải che dữ liệu trước.

**CSP suy gốc Sentry từ chính DSN**, không nhúng cứng tên miền. Tên miền Sentry
chứa mã tổ chức nên khác nhau ở mỗi tài khoản; gõ cứng thì đổi dự án Sentry là
bị chặn NGẦM — Sentry im lặng không nhận gì mà không màn nào báo lỗi. Đây là
loại hỏng kho này đã dính ba lần trong một ngày (camera, micro, âm thanh).

### Đã đo bằng lỗi thật, không phải đọc mã rồi đoán

Trên bản dựng production ngày 22/08, năm phép đo đều đạt: khoá và đường mạng
thông (Sentry trả về mã sự kiện) · lỗi máy chủ đi qua `onRequestError` tới nơi ·
lỗi trình duyệt bị bắt (`__sentry_captured__ = true`) · lỗi rơi vào lưới đỡ
React tới nơi · CSP không chặn (gọi thẳng gốc Sentry trả về 401, tức tới được
máy chủ Sentry chứ không bị trình duyệt chặn).

**Một lỗ thật tìm ra lúc nối:** lỗi rơi vào lưới đỡ của React — đúng loại
"không tải được mảnh mã sau khi lên bản mới" mà founder gặp — bị React nuốt
trước khi tới trình duyệt, nên Sentry **không bao giờ thấy**. Đã vá bằng cách
gọi Sentry ngay trong `baoLoiLenMayChu`, chỗ dùng chung của mọi lời báo lỗi từ
trình duyệt: một lời báo đi MỘT đường, tới HAI nơi.

### Đã dựng xong (23/08)

**① Khoá đã nằm trên Vercel.** `NEXT_PUBLIC_SENTRY_DSN` đặt cho cả ba môi
trường (production · preview · development). Bản dựng đầu tiên mang khoá này là
bản 23/08.

**② Hai báo động, cả hai lọc `environment: production`.**

| Báo động | Kêu khi nào | Báo cho ai |
|---|---|---|
| `Loi ban that (production) - bao ngay` (tự dựng) | lỗi mới · lỗi leo thang · lỗi đã sửa tái phát | nhóm #ifan |
| `Send a notification for high priority issues` (Sentry tự tạo) | Sentry chấm một lỗi là ưu tiên cao | người được gợi ý |

⚠️ **Vì sao phải sửa cái thứ hai.** Sentry tự tạo nó lúc dựng dự án, **không lọc
môi trường**, và nó **đã bắn 5 lần trong một tiếng** — cả 5 đều là lỗi thử bắn từ
máy lập trình. Đúng thứ sinh ra bệnh "chuông kêu mãi rồi không ai thèm nhìn".
Nay đã đặt `Filter Issues → production`.

⚠️ **Báo động thứ nhất lọc HAI TẦNG** — vừa ô `Environment` của Sentry, vừa một
điều kiện `thẻ environment bằng production` bên trong. Thừa một tầng là cố ý: ô
`Environment` chỉ chắc với lỗi có sự kiện kèm theo, còn nhánh "lỗi đã sửa tái
phát" thì không phải lúc nào cũng có.

⚠️ **Báo động thứ ba trong danh sách là của dự án `hieu-asia-worker`, KHÔNG PHẢI
của iFan.** Đừng sửa nhầm.

### Bốn khoá — ai được cầm cái nào

| Khoá | Bí mật? | Người viết mã có được cầm? |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` · `NEXT_PUBLIC_POSTHOG_KEY` | **KHÔNG** | **Có.** Chúng nằm sẵn trong mã chạy ở trình duyệt, ai xem mã nguồn trang cũng thấy. Chỉ cho phép GỬI dữ liệu lên, không đọc được gì |
| `SENTRY_AUTH_TOKEN` (`sntrys_…`) | **CÓ** | **Không.** Đọc/ghi được toàn bộ tổ chức Sentry |
| Sentry Personal Token (`sntryu_…`) | **CÓ** | **Không.** Mạo danh được chính tài khoản founder |
| Sentry Client Secret · Deploy Token | **CÓ** | **Không.** iFan không dùng tới cái nào |

⚠️ **Luật cứng, không có ngoại lệ kể cả khi founder cho phép:** người viết mã
không gõ, không dán, không chép khoá BÍ MẬT vào bất kỳ ô nào, và không ghi giá
trị của chúng vào bất kỳ tệp nào — kể cả vault. Khoá công khai thì làm bình
thường.

### Còn nợ — MỘT việc, và chỉ founder làm được

**Tạo `SENTRY_AUTH_TOKEN` rồi dán vào Vercel.** Đây là khoá BÍ MẬT thật, nên
người viết mã không được cầm nó — nguyên tắc cứng, không phải ngại việc. Founder
tự làm:

1. Vào Sentry → **Settings của TỔ CHỨC** (không phải của dự án) → *Auth Tokens* →
   tạo một khoá mới, chọn quyền ghi bản phát hành (`project:releases`).
2. Chạy lệnh dưới đây trong kho mã rồi dán khoá khi nó hỏi (kho đã nối sẵn với
   dự án Vercel nên không phải khai gì thêm):

```
npx vercel env add SENTRY_AUTH_TOKEN production
```

3. Đẩy một bản mới bất kỳ để bản đồ mã nguồn được tải lên.

⚠️ Thiếu khoá này thì **bản dựng vẫn chạy bình thường** — chỉ là vết lỗi mãi mãi
ở dạng đã nén, tức mất đúng thứ đáng giá nhất của Sentry. Hỏng im lặng, không
cổng nào bắt được.

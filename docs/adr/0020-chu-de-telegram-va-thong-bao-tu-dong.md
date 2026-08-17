# ADR-0020 — Tám chủ đề Telegram: mỗi chủ đề một câu hỏi, và tin phải HIẾM đủ để đọc hết (17/08/2026)

**Chỉ đạo founder (17/08):** *"Hoạch định lại chức năng và cách thông báo tự động phù hợp cho toàn bộ Chủ Đề Telegram iFan"*.

Đến sau **bốn lần phản ánh trong 5 ngày về cùng một kênh**: băng-rôn chỉ có mã bản (13/08) → câu commit thô khó đọc (13/08) → phát lại nguyên văn lời chỉ đạo, không dấu (17/08) → phát cả việc dọn dẹp nội bộ (17/08). Ba lần đầu đã vá từng lỗ. **Lần thứ tư cho thấy vá từng lỗ là không đủ: kênh này chưa từng được thiết kế như một tổng thể.**

---

## 1. Đo trước khi quyết (CSDL thật, 17/08)

### 1.1 Tám chủ đề và luồng tin đang khai

| # | Chủ đề | Nhận tự động | Ghi chú đo được |
|---|---|---|---|
| 1 | General | — | đúng thiết kế: chỗ người hỏi |
| 2 | Tính Năng | `feature_change` | **2 tin / 30 ngày** |
| 5 | Lỗi | `user_failure` | **1 tin / 30 ngày** |
| 6 | Ý tưởng | — | đúng thiết kế |
| 7 | Hỏi đáp | — | đúng thiết kế |
| 8 | Thông báo | `release` · `daily_pulse` · `weekly_pulse` | **48 tin release / 30 ngày** |
| 25 | Khách hàng | `help_request` · `tenant_signup` · `billing` · `churn` | 14 tin, **toàn tiệm test** (đã vá 14/08) |
| 27 | Kỹ thuật | `system_alert` · `channel_down` | **0 tin** |

### 1.2 Ba con số quyết định thiết kế này

**① Chủ đề Thông báo bị DỘI BOM.** `release` chiếm **48/67 = 72%** toàn bộ tin 30 ngày:

```
13/08: 18 tin      14/08: 17 tin      17/08: 13 tin
```

≈ **16 tin mỗi ngày làm việc**, vì **mỗi commit = một tin**. Không ai đọc hết 16 tin/ngày; và kênh nào bị bỏ qua thì **mọi tin trong đó mất giá trị, kể cả tin quan trọng**. Đây là lỗ nghiêm trọng nhất, chưa từng được nêu tên.

**② Nhịp ngày gần như không tồn tại — nhưng KHÔNG phải lỗi.** `daily_pulse` có cron chạy mỗi ngày (`0 13 * * *` = 20:00 giờ VN), chạy thành công, mà **chỉ 1 tin trong 30 ngày**. Đọc hàm ra ngay:

```sql
if v_tenants = 0 and v_contacts = 0 and v_help = 0 then return false; end if;
```

Không tiệm mới, không khách mới, không yêu cầu Cần giúp ⇒ im lặng. **Cố ý** ("không có gì thì đừng làm ồn") và cố ý đó đúng. Nhưng nó **đo đúng ba thứ iFan chưa có** — trong khi thứ founder theo dõi hằng ngày ở giai đoạn này là **tiến độ thi công**. Nhịp ngày vì thế trống rỗng đúng lúc nó cần nhất.

> Ghi thêm một lỗ nhỏ cùng chỗ: `v_asks` (câu hỏi gửi bot) **được đếm nhưng không nằm trong điều kiện** — ngày chỉ có câu hỏi thì vẫn im.

**③ Bốn luồng khai mà chưa có gì đổ vào:** `billing` · `churn` (Khách hàng) · `system_alert` · `channel_down` (Kỹ thuật). Không phải lỗi D2 (đây là bảng định tuyến, không phải cột dữ liệu), nhưng **khai mà rỗng thì người đọc tưởng đã có canh** — cùng họ bệnh "cổng không tồn tại không phân biệt được với cổng luôn PASS" đã trả giá bốn lần trong tuần này.

---

## 2. Chẩn đoán: sai ở TẦN SUẤT, không ở nội dung

Ba lần vá trước đều sửa **nội dung một tin**. Đo ở trên cho thấy vấn đề nằm chỗ khác:

| | Đang có | Cần có |
|---|---|---|
| Thông báo | 16 tin/ngày, mỗi tin một commit | **≤ 2 tin/ngày**, gộp theo việc |
| Nhịp ngày | im lặng vì đo thứ chưa tồn tại | **1 tin/ngày**, đo thứ đang có thật |
| Khách hàng | 0 tin thật | giữ nguyên — **ngay lập tức khi có** |

**Nguyên tắc dẫn đường (dùng cho mọi luồng tin sau này):**

1. **Mỗi chủ đề trả lời ĐÚNG MỘT câu hỏi của founder.** Không trả lời được câu nào thì không phải chủ đề.
2. **Tần suất là THIẾT KẾ, không phải hệ quả.** Mỗi luồng phải khai trước "bao nhiêu tin mỗi ngày là bình thường" — vượt thì gộp, không thì kênh tự chết vì nhiễu.
3. **Tin hiếm thì gửi ngay; tin dày thì gộp.** Nghịch với trực giác "việc quan trọng thì báo ngay": chính vì quan trọng nên phải hiếm.
4. **Im lặng phải CÓ NGHĨA.** Một luồng im vì "chưa có gì" thì nhịp ngày phải nói ra, không để founder tự đoán giữa "không có việc gì" và "bot hỏng".
5. **Việc nội bộ không bao giờ vào chủ đề nào** (đã làm ở migration #133).

---

## 3. Quyết định

### 3.1 Bảng chốt — tám chủ đề

| Chủ đề | Câu hỏi nó trả lời | Nhận tin | Tần suất chốt |
|---|---|---|---|
| **Thông báo** | *"Sản phẩm vừa đổi gì mà người dùng thấy?"* | `release` **GỘP** | **≤ 1 tin/giờ**, và 1 tổng kết cuối ngày |
| **Tính Năng** | *"Mảng nào vừa dùng được?"* | `feature_change` | mỗi lần đổi (tự nhiên hiếm) |
| **Khách hàng** | *"Ai vừa đến, ai đang cần giúp?"* | `tenant_signup` · `help_request` | **ngay lập tức** — quý và hiếm |
| **Lỗi** | *"Người dùng đang gặp hỏng gì?"* | `user_failure` | ngay lập tức |
| **Kỹ thuật** | *"Máy tự khai hỏng gì?"* | `system_alert` · `channel_down` · việc chạy nền hỏng | ngay lập tức |
| **Hỏi đáp** · **Ý tưởng** · **General** | (chỗ người bàn) | **không nhận tin tự động** | — |

### 3.2 GỘP tin bản mới — đổi lớn nhất của đợt này

**Bỏ nếp "một commit một tin".** Thay bằng:

- Bản mới **KHÔNG phát tin ngay**. Nó ghi vào một hàng chờ gộp.
- Cứ **một giờ một lần**, nếu hàng chờ có gì thì phát **MỘT tin** liệt kê các câu `Founder:` trong giờ đó.
- **Ngoại lệ ra ngay, không chờ gộp:** bản `security` (vá lỗ bảo mật) và bản có mảng đổi trạng thái (`feature_change`) — hai loại này founder cần biết ngay.
- Bản `Nội bộ:` không vào hàng chờ (đã chặn ở #133).

Khuôn tin gộp:

```
🚀 iFan vừa lên 4 bản mới — 18:00–19:00 ngày 17/08

· Giờ xem được đơn hàng của khách và biết ai còn nợ tiền.
· Trang tính năng ghi đúng mảng nào đã dùng được.
· Đã vá lỗ có thể làm mất dữ liệu khi đồng bộ.
· Chuông báo hết gửi trùng tin.

mã bản cuối 5b0d35b
```

**Vì sao gộp theo GIỜ, không theo ngày:** gộp cả ngày thì tin về lúc founder đã ngủ, và một lỗi vá lúc 9h sáng chỉ được kể lúc 20h. Một giờ là mức vừa đủ để 16 tin/ngày co lại còn **≤ 8**, mà vẫn còn tính "vừa mới".

**Vì sao KHÔNG gộp `feature_change`:** nó tự nhiên hiếm (2 tin/30 ngày). Gộp thứ đã hiếm là thêm cơ chế không đổi lấy gì.

### 3.3 Nhịp ngày viết lại cho ĐÚNG GIAI ĐOẠN

Giữ nguyên nguyên tắc "không có gì thì im", nhưng **đổi thứ nó đo** — thêm phần thi công vào cùng ba phần cũ:

```
🌙 Tổng kết 17/08

Sản phẩm
· 13 bản mới lên
· 1 mảng chuyển sang dùng được: Đơn hàng & Thu tiền

Khách
· chưa có tiệm mới, chưa có yêu cầu Cần giúp

Máy
· 2 việc chạy nền hỏng (xem chủ đề Kỹ thuật)
```

Ba đổi so với bản hiện tại:
1. **Thêm phần "Sản phẩm"** (số bản, mảng đổi) — thứ đang có thật ở giai đoạn này.
2. **Phần "Khách" nói RA khi bằng 0** thay vì làm cả tin biến mất. Đó là cách để im lặng có nghĩa (nguyên tắc 4).
3. **Điều kiện phát lại:** chỉ im khi **cả ba phần đều rỗng** — tức một ngày không ra bản nào, không khách nào, máy không hỏng gì. Ngày như vậy thì im là đúng.

Sửa luôn lỗ `v_asks` đếm mà không tính vào điều kiện.

### 3.4 Bốn luồng rỗng: khai rõ trạng thái, không gỡ

`billing` · `churn` · `system_alert` · `channel_down` **giữ trong bảng định tuyến** (chúng sẽ có producer thật ở V6/V8, gỡ rồi thêm lại là công vô ích), nhưng **`scope` của chủ đề phải ghi rõ luồng nào CHƯA có gì đổ vào** — để không ai tưởng đã có canh. Đúng bài học của tuần này: thứ chưa tồn tại phải tự khai là chưa tồn tại.

---

## 4. Phạm vi thi công — 5 việc

| # | Việc | Ghi chú |
|---|---|---|
| 1 | Hàng chờ gộp tin bản mới + job phát mỗi giờ | migration mới. `tg_release_mark` **thôi gọi `platform_notify` trực tiếp** cho `release`, chuyển sang ghi hàng chờ. Ngoại lệ `security` + có `feature_change` thì phát ngay như cũ |
| 2 | Viết lại `daily_pulse` theo 3.3 | thêm phần Sản phẩm; nói ra khi phần Khách bằng 0; sửa lỗ `v_asks` |
| 3 | Cập nhật `scope` 8 chủ đề theo 3.1 + khai luồng rỗng (3.4) | `scope` là chữ founder đọc khi mở chủ đề — phải khớp bảng chốt |
| 4 | Mở rộng `scripts/tin-ban-moi-smoke.mjs` | thêm ca: gộp đúng cửa sổ giờ · `security` không bị gộp · nhịp ngày im/không im đúng điều kiện |
| ~~5~~ | ~~Cập nhật `docs/EVENT_CATALOG.md` + Quy hoạch mục 32~~ | ⛔ **BỎ — sai chỗ. Xem đính chính ngay dưới.** |

> ### ⚠️ ĐÍNH CHÍNH việc 5 (17/08, ngay khi bắt tay thi công)
>
> Việc 5 ở trên do chính tôi viết 20 phút trước, và **sai** — bắt được vì mở `EVENT_CATALOG.md` ra đọc thay vì tin vào trí nhớ. Dòng đầu file đó ghi rõ: *"Mọi module PHÁT sự kiện vào bảng `domain_events`"*. Catalog đó dành cho **sự kiện nghiệp vụ**, còn `platform_outbox` là **hàng đợi tin nhắn** cho một người nhận — không có `tenant_id`, không có consumer nào, không đi qua Workflow Engine. Đo thêm: `grep` cả file, **không một luồng nào của `platform_outbox` từng được khai ở đó** (`release`, `daily_pulse`, `help_request`… đều không có).
>
> Khai vào đó là **tạo nơi thứ hai cho một sự thật đã có nơi thứ nhất** — đúng thứ luật D1 cấm, và nơi thứ hai sẽ lệch ngay lần sửa sau. Nơi khai đúng của luồng tin nền tảng là **`tg_topics.feeds` trên CSDL** (máy đọc, việc 3 cập nhật) cộng **ADR-0007 + ADR-0020** (người đọc).
>
> ⇒ Phạm vi còn **4 việc**. Bất biến 12 không áp dụng ở đây: đợt này **không thêm một `kind` nào mới** — `release` vẫn là `release`, chỉ đổi **cách phát** (ngay → gộp).

**Phạm vi thật: 4 việc (1–4).**

**Không làm ở đợt này (ghi rõ để không ai lén dựng):** phân mức ưu tiên tin · cho founder tự bật/tắt từng luồng bằng lệnh bot · tóm tắt tin bằng AI (đã bác 17/08, xem ADR-0007 mục 12e) · gộp tin cho `help_request` (phải ngay, không gộp).

---

## Điều kiện xem lại

- **Khi iFan có tiệm thật đầu tiên** ⇒ đọc lại 3.3. Lúc đó phần "Khách" của nhịp ngày mới là phần chính, và phần "Sản phẩm" nên co lại — thiết kế hiện tại **cố ý nghiêng về thi công vì giai đoạn này chưa có khách**, không phải vì thi công quan trọng hơn khách.
- **Khi số bản mỗi ngày xuống dưới 3** (hết giai đoạn xây dày) ⇒ cơ chế gộp ở 3.2 thành gánh nặng vô ích; bỏ gộp, quay về một bản một tin. Đo bằng: số tin `release` mỗi ngày trong 7 ngày liền.
- **Khi một chủ đề im quá 7 ngày liền mà luồng của nó CÓ producer thật** ⇒ dấu hiệu luồng đứt trong im lặng (đúng loại lỗi đã xảy ra với `daily_pulse` và với bước AI soạn lại). Kiểm bằng `scripts/tin-ban-moi-smoke.mjs` và lịch sử `cron.job_run_details`.
- **Khi `billing`/`churn`/`system_alert`/`channel_down` có producer đầu tiên** ⇒ gỡ dòng "chưa có gì đổ vào" khỏi `scope` chủ đề tương ứng (3.4), nếu không chính nó thành thông tin sai.
- **Khi founder bắt đầu bỏ qua một chủ đề** (dấu hiệu: hỏi lại thứ đã có tin trong đó) ⇒ chủ đề đó đang nhiễu; xét lại tần suất theo nguyên tắc 2–3, **đừng thêm tin nhắc**.

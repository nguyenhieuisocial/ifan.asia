# ADR-0011 — Mô hình giá + bộ trang công khai dựng lại theo phạm vi 20 mảng (13/08/2026)

**Trạng thái:** đang viết — phần giá chờ số liệu nghiên cứu thị trường.
**Người quyết:** Opus 5.
**Thay/đính chính:** bảng giá 4 gói đang chạy trên trang chủ (Free · 199k · 399k · 799k) — **khai tử** · khung "6 trục" của trang chủ · `lib/feature-registry.ts`.
**Nguồn chỉ đạo (founder 13/08):**
- *"quy hoạch lớn và cực to với ít nhất 16 module… thật ra là hơn rất nhiều"* → dựng lại trang chủ + trang công khai cho khớp.
- *"chúng ta sẽ bán ra **rẻ hơn toàn bộ đối thủ** và **toàn bộ mọi tính năng** thì mới bắt đầu open và bán"*.
- *"user được sử dụng free trước, chưa yêu cầu trả phí ngay nhưng vẫn dùng được — free 30 days trải nghiệm toàn bộ, rồi trả phí phù hợp"*.

---

## 1. Vì sao phải có ADR này — ba thứ đang SAI trên trang công khai THẬT

Không phải "muốn đẹp hơn". Trang chủ đang chạy công khai **nói sai ba chỗ**, hai trong đó là nói sai về sự thật sản phẩm:

### 1.1 🔴 Gắn nhãn "Sẵn sàng" cho tính năng KHÔNG TỒN TẠI

Dưới mục **Tiền**, trang chủ ghi **"Sẵn sàng"** cho:
- *"Gói dịch vụ & hóa đơn"*
- *"Ghi nhận thanh toán chống trùng"*

**Đo trên CSDL thật (13/08):** không tồn tại bảng `orders`, `invoices`, `payments`, `cash_entries` nào cho tiệm. Hai dòng đó thực chất mô tả `subscription_invoices` / `subscription_payments` — tức **iFan thu tiền CỦA tiệm**, không phải **tiệm thu tiền của khách**.

Đặt cạnh *"Sổ thu chi của tiệm"* và *"Kho hàng"* dưới cùng một mục tên **"Tiền"**, chủ tiệm đọc ra là *"tôi xuất được hoá đơn cho khách"*. **Sai.** Đây là vi phạm trực diện luật *"không nói dối"* (`01 Chiến lược` mục 0.3) — thứ chiến lược tự nhận là *"rẻ nhất để giữ và đắt nhất để mất"*.

**Soát toàn bộ 15 dòng "Sẵn sàng": 13 đúng, 2 sai — đúng hai dòng trên.**

### 1.2 🔴 Bảng giá đã bị founder khai tử vẫn đang bán công khai

Founder bác toàn bộ bảng giá ngày 13/08 (*"bảng giá từ đầu bị sai"*), `01 Chiến lược` mục 0.4 ghi **"CẤM đưa lên bất kỳ màn nào"**. Nhưng trang chủ **vẫn hiện đủ 4 gói kèm giá tháng/năm và số tiền tiết kiệm**.

Nặng hơn: dưới bảng có câu **"Giá ra mắt = giữ nguyên cho khách đăng ký sớm kể cả khi giá chính thức cao hơn"** — đây là **một lời hứa ràng buộc** gắn với những con số đã chết. Ai đăng ký hôm nay đọc câu đó là đã được hứa giá 199k/399k trọn đời.

### 1.3 🟡 Khung kể chuyện là bản quy hoạch nhỏ đã lỗi thời

- Trang chủ dựng trên **"Sáu mảng việc của tiệm"** — phạm vi cũ. Nay là **20 mảng** (ADR-0010).
- Tiêu đề ghi *"cho **tiệm nhỏ** Việt Nam"* — tệp khách đã đổi thành **2–100 người** (founder chốt 13/08).
- `lib/feature-registry.ts` phân theo 6 trục cũ ⇒ phải dựng lại theo 20 mảng.

---

## 2. Đo thật — chi phí AI, thứ quyết định bảng giá

Đo bằng chính transcript app gửi đi (`ai-actions.ts`: 30 tin gần nhất, bỏ tin hệ thống) trên **48 hội thoại thật** trong CSDL.

| Đo | Kết quả |
|---|---|
| Độ dài transcript trung bình | 803 ký tự (~9,6 tin) · nặng nhất 1.166 ký tự |
| Token vào mỗi lượt | ~650 (trung bình) · ~820 (nặng nhất) |
| Token ra ước tính | ~500 (3 câu gợi ý + phần suy nghĩ, `effort: low`) |
| **Dòng AI đang đặt mặc định** | **`claude-opus-5`** — dòng đắt nhất |

**Chi phí một lượt AI** (tỉ giá ~26.000đ/USD):

| Dòng AI | Giá 1 lượt | So với Opus |
|---|---|---|
| **Opus 5** *(đang dùng)* | **~410đ** | — |
| Sonnet 5 | ~246đ | rẻ hơn 40% |
| **Haiku 4.5** | **~82đ** | **rẻ hơn 5 lần** |

**Chi phí AI mỗi tháng mỗi tiệm:**

| Lượt/tháng | Opus 5 | Sonnet 5 | Haiku 4.5 |
|---|---|---|---|
| 20 | 8k | 5k | 2k |
| 200 | 82k | 49k | 16k |
| 1.000 | 410k | 246k | 82k |
| 5.000 | 2.048k | 1.229k | 410k |

### 2.1 Bảng giá cũ LỖ VỀ CẤU TRÚC, không chỉ sai số

Đối chiếu hạn mức AI mà bảng giá cũ đã hứa, với dòng Opus đang đặt mặc định:

| Gói cũ | Giá thu | Hạn mức AI | Tiền AI phải trả | Kết quả |
|---|---|---|---|---|
| Cơ bản 199k | 199k | 200 lượt | 82k | còn 59% |
| Chuyên nghiệp 399k | 399k | 1.000 lượt | **410k** | **LỖ 11k** |
| Doanh nghiệp 799k | 799k | 5.000 lượt | **2.048k** | **LỖ 1.249k** |

**Hai gói đắt nhất càng bán càng lỗ**, và nghịch lý chết người: **khách càng chăm dùng thì mình càng lỗ nặng** — tức là trừng phạt đúng nhóm khách tốt nhất.

**May là chưa cháy đồng nào:** AI đang gắn nhãn "Sắp ra mắt", chưa bật thật. Nhưng **V2.5 chính là đợt bật nó** ⇒ phải giải TRƯỚC V2.5.

### 2.2 Quả bom thật nằm ở AI TỰ TRỰC, không phải AI bấm tay

Số đo trên là cho **AI bấm tay** (nhân viên bấm nút "gợi ý trả lời") — lượng dùng bị chặn bởi hành vi nhân viên, dễ đoán.

**AI trực việc (V2.5) khác hẳn về bản chất:** mỗi tin khách nhắn tới đều kích hoạt AI ⇒ lượng dùng bám theo **lượng khách**, không theo nhân viên. Một tiệm nhận 100 tin/ngày = **3.000 lượt/tháng**:

| Dòng AI | Chi phí/tháng cho tiệm 100 tin/ngày |
|---|---|
| Opus 5 | **1.230k** |
| Sonnet 5 | 738k |
| Haiku 4.5 | **246k** |

⇒ Nếu bán "một giá cho cả tiệm, AI dùng thoải mái" ở mức **rẻ hơn toàn bộ đối thủ**, thì **kể cả dòng AI rẻ nhất vẫn lỗ** với tiệm đông khách. **Đây là bài toán trung tâm của ADR này.**

---

## 3. QUYẾT ĐỊNH 1 — Bỏ Opus 5 khỏi đường AI hằng ngày

**Chốt: `claude-haiku-4-5` làm dòng mặc định cho cả ba việc AI đang có** (soạn gợi ý trả lời · tóm tắt hội thoại · trích xuất thông tin khách).

**Vì sao:** ba việc này đều là **đọc một đoạn chat ngắn rồi viết lại vài câu** — không phải việc cần suy luận sâu. Đo ở mục 2: đổi dòng làm chi phí rớt **5 lần** (410đ → 82đ mỗi lượt) trên cùng một đầu việc. Giữ Opus cho việc này là **đốt tiền không đổi lấy gì**.

**Ràng buộc kèm theo, không được bỏ:**
- **Phải đo chất lượng trước khi đổi hẳn**, không đổi mù. Cách đo: lấy 20 hội thoại thật, chạy cả hai dòng, so kết quả cạnh nhau. Đây là việc của Sonnet khi thi công.
- **Giữ `AI_MODEL` là biến môi trường** (đang đúng vậy) — đổi dòng không cần sửa mã.
- **Việc nặng hơn thì nâng dòng, không nâng đồng loạt.** Khi V2.5 làm AI đọc số liệu hoặc suy luận nhiều bước, dùng Sonnet 5 riêng cho việc đó.

**Cắt bớt lượng chữ gửi đi — đòn bẩy thứ hai, rẻ hơn cả đổi dòng:** hiện gửi **30 tin gần nhất** cho mọi việc. Gợi ý trả lời cho **tin cuối** không cần 30 tin; 10–12 tin là đủ ngữ cảnh. Giảm được ~40% token vào.

---

## 4. QUYẾT ĐỊNH 2 — Mô hình giá: gói trọn + túi lượt AI, KHÔNG credit

### 4.1 Bác hai mô hình đang mốt, bác có bằng chứng

| Mô hình | Ai dùng | **BÁC vì** |
|---|---|---|
| **Bán credit** | HubSpot · Salesforce · Notion | Cursor đổi sang credit 6/2025 → người dùng đốt hết sau 2–3 lệnh, CEO phải xin lỗi. **Windsurf bỏ hẳn credit 3/2026**, tự nhận hệ thống khiến *"người dùng sợ hỏi câu ngắn"*. Có ca hoá đơn **600.000 USD, gấp 12 lần dự tính**. Khách Việt Nam ở tiệm 5 người càng không quy đổi nổi "1 credit là gì". |
| **Tính theo "đã giải quyết"** | Intercom 0,99$ · Zendesk ~1,5$ | Điểm chết là **cãi nhau "thế nào là đã giải quyết"**. Trên chính diễn đàn Intercom, khách bị tính tiền khi họ *chủ động nhảy vào cứu khách* trước lúc khách bấm "gặp người thật" — kể cả khi AI trả lời sai. **Cả Intercom lẫn Zendesk lẫn HubSpot đều phải sửa định nghĩa trong năm 2026** vì bị phản ứng. Với tiệm nhỏ, cãi nhau một hoá đơn = mất khách vĩnh viễn. |

### 4.2 Chốt: **gói trọn cho cả tiệm + túi lượt AI gộp sẵn hằng tháng**

Vượt túi thì **mua thêm theo khối tròn**, không phải credit lắt nhắt. Đây là mô hình Freshdesk/Crisp/Chatwoot đang dùng, và là **mô hình lai đang thắng thế** (37% thị trường, tăng từ 25% trong một năm).

**Đơn vị đếm phải là thứ chủ tiệm NHÌN THẤY:** *"một cuộc trò chuyện AI đã lo giúp"* — không phải credit, không phải token, không phải "resolution".

**Bốn luật cứng của túi AI:**
1. **Trần chi tiêu BẬT SẴN theo mặc định.** Hết túi thì **AI tạm dừng và báo**, không tự động tính thêm tiền. *(Zendesk để mặc định tự-động-tính-tiền phần vượt và bị chửi đúng vì chỗ này. Làm ngược lại — và nói to về việc đó, vì nỗi sợ hoá đơn bất ngờ là có thật: 78% lãnh đạo IT từng dính phí bất ngờ vì AI trong năm qua.)*
2. **Ghi rõ hàng tháng hay trọn đời.** Toàn bộ phàn nàn về Tidio Lyro xoay quanh việc khách tưởng 50 lượt là mỗi tháng, thật ra là **trọn đời**. iFan ghi thẳng trên trang giá.
3. **Cảnh báo ở 70% và 90% túi**, kèm số còn lại và ngày làm mới.
4. **Không bao giờ tự nâng gói khi chạm trần** — đó là thứ Tidio làm và bị ghét.

### 4.3 Bản miễn phí vĩnh viễn — giới hạn theo chiều nào

Học đúng chỗ đau của người đi trước:

| Giới hạn theo | Quyết định | Vì sao |
|---|---|---|
| **Số người dùng** | ✅ **Có** | Chiều tốt nhất: dễ hiểu, và siết đúng lúc tiệm lớn lên — tức đúng lúc họ sẵn sàng trả tiền. Notion làm chuẩn mực: giới hạn bật lên đúng khi chuyển từ một người sang nhiều người. |
| **Túi lượt AI** | ✅ **Có, và phải có** | AI là chi phí biến đổi thật. **Toàn bộ đối thủ đều cắt AI ở gói miễn phí** (Chatwoot 0 · Crisp 0 · Tidio 50 trọn đời). Cho AI thoải mái ở bản free = mỗi người dùng free thành một dòng chi phí vĩnh viễn. |
| **Thời gian lưu lịch sử** | ⚠️ **Cân nhắc, nghiêng KHÔNG** | Đây chính là chỗ **Slack chết 2022**: đổi từ "10.000 tin" sang "90 ngày" làm đau đúng nhóm đội nhỏ tồn tại lâu — nhóm chưa bao giờ chạm mốc cũ. Bài học: **đổi CHIỀU giới hạn nguy hiểm hơn siết chặt cùng một chiều.** |
| **Số khách hàng** | ❌ **KHÔNG** | Giới hạn kiểu "phạt vì bạn thành công". Bóp chết luôn vòng lan truyền. |
| **Quyền xuất dữ liệu** | ❌ **KHÔNG BAO GIỜ** | Sợ mất dữ liệu là lý do trực tiếp khiến người ta không dám bắt đầu. Dữ liệu là của tiệm — đây đã là lời hứa đang in trên trang chủ. |
| **Kênh chat cơ bản** | ❌ **KHÔNG** | Ít kênh = ít tin vào = sản phẩm chết trước khi thành thói quen. |

### 4.4 Ba mươi ngày mở toàn bộ — và cái bẫy phải chặn

**Chặn lạm dụng ngay từ đầu:** Stripe đo được **lạm dụng dùng thử ở sản phẩm AI tăng 6,2 lần** trong 11/2025–02/2026; sản phẩm AI tự-đăng-ký chịu mức lạm dụng **gấp 10 lần** loại bán qua doanh nghiệp. Chỉ trong 2 tháng, Stripe chặn hơn 550.000 lượt dùng thử rủi ro cao ở 4 công ty AI, ngăn được ~4,4 triệu USD tiền tính toán.

⇒ **30 ngày mở toàn bộ tính năng, nhưng túi AI có trần cứng.** Trần rộng tới mức 99% tiệm thật không chạm tới, nhưng chặn được kẻ lạm dụng. **Không dùng chữ "không giới hạn" ở bất kỳ đâu.**

**Hết 30 ngày — bốn luật, không được vi phạm:**
1. **Tự hạ xuống bản miễn phí, KHÔNG khoá cửa.** Nói thẳng điều này ngay trên trang giá, không giấu trong điều khoản.
2. **Dữ liệu vượt hạn mức chuyển sang CHỈ ĐỌC, tuyệt đối không xoá.** Tiệm tạo 3.000 khách trong 30 ngày mà bản free chỉ cho 500 → giữ nguyên 3.000, xem và xuất được, chỉ chặn tạo mới. **Xoá dữ liệu là cách nhanh nhất để mất khách vĩnh viễn.**
3. **Báo trước ở ngày 23 · 28 · 30**, ghi rõ giữ được gì, tạm mất gì, và câu *"dữ liệu của bạn vẫn nguyên"*.
4. **Ân hạn 7–14 ngày** ở trạng thái chỉ-đọc trước khi siết hẳn.

### 4.5 Nói thẳng một sự thật khó nghe về reverse trial

Founder chọn *miễn phí vĩnh viễn + 30 ngày đầy đủ*. **Số liệu 2026 (khảo sát 200 sản phẩm B2B, Growth Unhinged × ChartMogul × ProductLed):**

- Reverse trial chuyển đổi **4–6% là tốt, 8–12% là xuất sắc** — **không khác biệt có ý nghĩa thống kê** so với freemium thường hay dùng thử thường. Và tỉ lệ này **giảm** so với 2023.
- Chỉ **7% sản phẩm** dùng mô hình này.
- Đòn bẩy thật sự duy nhất trong dữ liệu: **bắt nhập thẻ khi dùng thử → ~30% chuyển đổi, so với 8% khi không cần thẻ.** Gấp gần 4 lần.

⇒ **Reverse trial là quyết định đúng, nhưng phải đúng lý do:** chọn nó vì **một bảng giá thay vì hai**, vì khách thấy hết giá trị trước khi tự quyết, và vì **không có khoảnh khắc bị đá ra khỏi cửa**. **Đừng kỳ vọng nó tự đẻ ra doanh thu.**

**Và ghi rõ đánh đổi đã chọn có ý thức:** iFan **không bắt nhập thẻ**, tức tự bỏ đòn bẩy mạnh nhất. Đổi lại giữ được lời hứa *"không cần thẻ, không gặp nhân viên bán hàng"* — vốn là **mặt trận 4** trong `01 Chiến lược` mục 0.2c, thứ đối thủ không sao chép được. Đây là đánh đổi **chiến lược**, không phải bỏ sót.

---

## 4b. Đo giá thị trường Việt Nam (13/08/2026, lấy từ trang giá chính thức)

Khảo sát 30+ sản phẩm đang bán thật. Quy đổi 1 USD = 26.033đ.

### 4b.1 Sàn giá phải phá

| Nhóm | Rẻ nhất cho tiệm 5 người | Rẻ nhất cho công ty 30 người |
|---|---|---|
| Phần mềm spa/salon | **150.000đ** (ZinTech) · 99.000đ (Myspa, **chỉ 1 tài khoản**) | không bán theo quy mô này |
| Phần mềm bán hàng / POS | 150.000đ (Nhanh.vn, hợp đồng 2 năm) | **249.000đ** (Sapo PRO, không giới hạn nhân viên) |
| **CRM / quản trị đầy đủ** | **350.000đ** (CNV Work CRM Only) | **1.500.000đ** (CNV Work CRM Only) |
| Nước ngoài | 520.000đ (Fresha) · 1.822.000đ (Zoho) | 6.990.000đ (Odoo) · 10.934.000đ (Zoho) |

### 4b.2 Ba phát hiện đổi cách định giá

**① Có một hố sâu giữa 249k và 1.500k mà không ai đứng.** Dưới 249k chỉ toàn phần mềm bán hàng/POS — **không phải CRM**. Muốn có CRM thật cho 30 người thì rẻ nhất đã là 1,5 triệu. **Đây là vùng đất trống, và là chỗ iFan đánh.**

**② Gần như cả thị trường tính tiền theo đầu người, hoặc chặn cứng số tài khoản.**
- CNV Work · Getfly · MISA · Zoho · Odoo: **nhân theo từng người**.
- Haravan: chặn trần 10 người → công ty 30 người **buộc nhảy từ 300k lên 3.000.000đ**, gấp 10 lần chỉ vì tuyển thêm người.
- Myspa: gói 199k cho 5 tài khoản, người thứ 6 **nhảy lên 399k**.
- ⇒ Lời hứa *"thêm người không thêm tiền"* của iFan **không phải khẩu hiệu** — nó phá đúng chỗ đau nhất của cả thị trường.

**③ Không một phần mềm spa/salon Việt Nam nào có bản miễn phí vĩnh viễn, và không bên nào công bố giá AI.** CNV Work có bảng giá nhưng **không có dùng thử, không tự đăng ký được** — mọi nút dẫn về "xin báo giá". Base.vn và Zenoti **giấu giá hoàn toàn**.

### 4b.3 Riêng ngành spa/salon — ngành mũi nhọn số 1, khảo sát sâu

| Sản phẩm | Giá cho spa 5 người | Cách chặn |
|---|---|---|
| Myspa | 199.000đ | **5 tài khoản. Người thứ 6 → 399.000đ (+100%)** |
| PosApp | 220.000đ | flat |
| EasySalon | 240.000đ | flat, không giới hạn tài khoản |
| EZS | 290.000đ | flat theo cơ sở |
| KiotViet Salon | 330.000đ | gói 270k chỉ 3 tài khoản → buộc lên hạng |
| SPAGO | 332.000đ | bậc 3/6/12 người → 5 người phải mua gói 6 |
| **Fresha** (nước ngoài) | **520.000đ** | **104.000đ × mỗi người** |
| Zenoti · Mindbody · VTTech | **giấu giá** | bắt gặp sale |

**Ba điều đáng giá nhất từ khảo sát này:**

1. **Cái bẫy thật ở thị trường VN không phải "tính theo đầu người" mà là TRẦN TÀI KHOẢN ở gói rẻ.** Myspa nhảy **+100% chỉ vì tuyển người thứ 6**. KiotViet chặn 3 tài khoản ở gói rẻ nhất. Chủ tiệm chỉ phát hiện lúc tuyển thêm người — tức lúc họ đang mừng vì làm ăn được. ⇒ Lời hứa **"không giới hạn người dùng ngay từ gói rẻ nhất"** của iFan đánh trúng đúng chỗ đau này, mạnh hơn cả việc rẻ hơn.
2. **KHÔNG một phần mềm spa Việt Nam nào nhắc tới AI trên trang giá.** Đây là **khoảng trống trắng hoàn toàn** — không phải chỗ phải giành, mà là chỗ chưa ai đứng.
3. **Chỉ SPAGO cho tự đăng ký dùng ngay và công khai số ngày dùng thử.** Tất cả còn lại bắt điền form chờ sale gọi. ⇒ **Mặt trận 4 (tự phục vụ) còn trống hơn cả dự đoán.**

---

## 4c. QUYẾT ĐỊNH 3 — Bảng giá chốt

### 4c.1 Đúng hai gói. Không có gói ba.

| | **Miễn phí** | **iFan** |
|---|---|---|
| Giá | **0đ vĩnh viễn** | **99.000đ/tháng** · **79.000đ/tháng** khi trả năm (948.000đ/năm) |
| Người dùng | 3 người | **KHÔNG GIỚI HẠN** |
| Tính năng | **Đủ mọi tính năng đang chạy** | Đủ mọi tính năng, mãi mãi |
| Túi AI | 30 lượt/tháng | **300 lượt/tháng**, thêm 100 lượt = 25.000đ |
| Khách hàng, đơn, lịch hẹn | **không giới hạn** | không giới hạn |
| Xuất dữ liệu | **có** | có |

**30 ngày đầu của mọi tài khoản mới:** mở như gói trả phí — **không giới hạn người dùng**, túi AI 300 lượt. Hết 30 ngày **tự hạ về Miễn phí**, không khoá cửa.

### 4c.2 Vì sao đúng hai gói, không phải bốn

Bảng giá cũ có 4 gói phân biệt nhau bằng **số nhân viên** và **hạn mức AI**. Bỏ, vì:
- Vault đã chốt *"mọi gói trả phí mở đủ mọi module — module hoá ở điều hướng, không ở hoá đơn"* (bài học Odoo bỏ per-app 2022). Bốn gói mà gói nào cũng đủ tính năng thì chỉ còn khác nhau ở số người — mà **số người chính là thứ iFan tuyên bố không tính tiền**. Bốn gói tự mâu thuẫn.
- Một gói thì **câu chuyện bán hàng gọn tới mức không cần giải thích**: *một giá, cả công ty, đủ mọi thứ.*

### 4c.3 Chứng minh "rẻ hơn toàn bộ đối thủ" — bảng này lên thẳng trang /bang-gia

| Phần mềm | Tiệm 5 người | Công ty 30 người | Cách tính |
|---|---|---|---|
| **iFan (trả năm)** | **79.000đ** | **79.000đ** | cả công ty |
| **iFan (trả tháng)** | **99.000đ** | **99.000đ** | cả công ty |
| ZinTech (spa) | 150.000đ | — | cả tiệm |
| Nhanh.vn POS | 150.000đ | 250.000đ | cả cửa hàng |
| Sapo PRO | 249.000đ | 249.000đ | cả cửa hàng |
| KiotViet | 330.000đ | 330.000đ | cả chi nhánh |
| CNV Work (CRM) | 350.000đ | **1.500.000đ** | **mỗi người** |
| Fresha | 520.000đ | 3.120.000đ | **mỗi người** |
| Getfly | 780.000đ | 1.568.000đ | **mỗi người** |
| Haravan | 300.000đ | **3.000.000đ** | trần 10 người/gói |
| CNV Work (đủ bộ) | 750.000đ | **3.000.000đ** | **mỗi người** |
| Zoho CRM | 1.822.000đ | **10.934.000đ** | **mỗi người** |

⇒ **79.000đ thấp hơn mọi con số trong bảng, ở cả hai quy mô.** Với công ty 30 người, iFan rẻ hơn CRM rẻ nhất **19 lần**.

### 4c.4 Bẫy "rẻ quá hoá yếu" — và cách gỡ đã có sẵn trong vault

Vault đã cảnh báo đúng chuyện này: chênh 7–10 lần *"có thể đọc thành rẻ vì yếu"*. Nay chênh tới **19 lần**, nên cảnh báo còn nặng hơn.

**Cách gỡ, đã chốt sẵn ở `01 Chiến lược` mục 0.4:** trình bày là **khác CÁCH TÍNH**, không phải rẻ hơn trên cùng thước đo.

> Không nói *"iFan 79k, họ 1,5 triệu"*.
> Nói: ***"Họ tính tiền từng người. iFan tính một giá cho cả công ty."***
> Rồi để bảng tự nói phần còn lại.

Cột **"Cách tính"** trong bảng 4c.3 là cột quan trọng nhất — nó biến chênh lệch từ *"rẻ đáng ngờ"* thành *"mô hình khác hẳn"*.

### 4c.5 Kiểm lãi — không bán dưới giá vốn

Giá vốn mỗi tiệm mỗi tháng ở gói 79.000đ (trả năm, mức thấp nhất):

| Khoản | Trường hợp thường (100 lượt AI) | Trường hợp xấu nhất (dùng hết 300 lượt) |
|---|---|---|
| AI (Haiku 4.5, 82đ/lượt) | 8.200đ | 24.600đ |
| Hạ tầng (CSDL + máy chủ web) | ~10.000đ | ~10.000đ |
| **Còn lại** | **60.800đ · lãi 77%** | **44.400đ · lãi 56%** |

**Lãi dương ở cả trường hợp xấu nhất** — vì túi AI có trần. Đây chính là lý do quyết định 2 chọn mô hình túi-có-trần thay vì "AI thoải mái".

**Đối chiếu để thấy dư địa:** Intercom bán 0,99 USD (~25.800đ) mỗi cuộc trò chuyện AI — **gấp hơn 100 lần giá vốn thật**. iFan bán 300 lượt trong gói 79.000đ, tức **~263đ/lượt**, vẫn lãi. Thị trường AI đang bán đắt hơn giá vốn rất nhiều; iFan không cần theo.

### 4c.6 Hai điều CHƯA chốt, ghi rõ để không ai tưởng đã xong

1. **Giá chỉ công bố khi mở bán.** Trang `/bang-gia` **hiện gói Miễn phí với số thật**, gói trả phí ghi *"công bố khi mở bán"* kèm ba cam kết (tính theo cả công ty · đủ mọi tính năng · rẻ hơn mọi phần mềm cùng loại). Bảng 4c.3 là **bản chốt nội bộ để thi công**, chưa lên trang cho tới ngày mở bán.
2. **Chi phí hạ tầng ~10.000đ/tiệm/tháng là ƯỚC LƯỢNG**, chưa đo trên hoá đơn thật. Phải đo lại khi có ≥50 tiệm dùng thật — nếu vượt 25.000đ thì đọc lại mục 4c.5.

---

## 5b. Ba mươi ngày — chi tiết để thi công

| Mốc | Việc |
|---|---|
| Ngày 1 | Mở như gói trả phí. Không giới hạn người. Túi AI 300 lượt. **Không dùng chữ "không giới hạn" cho AI.** |
| Ngày 23 · 28 · 30 | Báo trước: giữ được gì · tạm mất gì · **"dữ liệu của bạn vẫn nguyên"** |
| Hết ngày 30 | **Tự hạ về Miễn phí. Không khoá.** Người thứ 4 trở đi chuyển sang chỉ-đọc, không xoá tài khoản |
| Dữ liệu vượt hạn mức | **CHỈ ĐỌC, tuyệt đối không xoá.** Xem được, xuất được, chỉ chặn tạo mới |
| +7 tới +14 ngày | Ân hạn chỉ-đọc trước khi siết hẳn |
| Sau 60 ngày im lặng | Cho mở lại 7 ngày đầy đủ một lần — rẻ hơn nhiều so với tìm khách mới |

---

## 5. QUYẾT ĐỊNH 3 — Trang chủ KHÔNG đua số module

**Cám dỗ hiển nhiên:** phạm vi vừa nhảy từ 6 lên 20 mảng ⇒ đưa "20 module!" lên tiêu đề.

**Bác.** Ba lý do, lý do đầu là của chính chiến lược đã chốt:

1. `01 Chiến lược` mục 0.3 ghi thẳng: ***"'Top' không phải nhiều tính năng nhất. Rộng-mà-mỏng chính là chỗ NexPeak chết."*** Đưa con số module lên đầu là **tự mâu thuẫn với định vị của mình**.
2. **Đua số là chơi trên sân đối thủ mạnh hơn.** CNV Work có đội ngũ, 500 khách trả tiền, nhiều năm ở khúc đó. Họ hô 16, mình hô 20, họ hô 25 — cuộc đua này không có đích và người ít nguồn lực hơn thua trước.
3. **Con số 20 tự nó bán rẻ quy mô thật:** một mảng "Khách hàng" bên trong đã có gộp trùng, chấm điểm, phân hạng, nhãn, trường tự đặt, lọc lưu sẵn, thao tác hàng loạt, nhập/xuất Excel, tệp đính kèm, nhật ký bản ghi. Đếm mảng thì ra 1; đếm việc thật thì ra hơn chục.

**Thay bằng:** khung ***"Một ngày của chủ tiệm"*** — đi từ lúc mở cửa tới lúc đóng sổ, mỗi chặng chỉ ra iFan lo chỗ nào. Tầm vóc **hiện ra qua độ phủ của một ngày**, không qua con số. Ai muốn xem đủ danh sách thì có trang riêng.

### 5.1 Bảng trạng thái thật — 20 mảng (nguồn duy nhất cho mọi nhãn trên trang công khai)

Ba trạng thái, **không có trạng thái thứ tư**, và cấm gắn nhãn không khớp `docs/SU-THAT-SAN-PHAM.md`:

| # | Mảng | Trạng thái | Ghi chú trung thực |
|---|---|---|---|
| 1 | Hôm nay & Tổng quan | 🟢 Sẵn sàng | |
| 2 | Hộp thư đa kênh | 🟢 Sẵn sàng | Live Chat + Zalo Bot chạy thật; **Zalo OA chờ pháp nhân** |
| 3 | Khách hàng | 🟢 Sẵn sàng | |
| 4 | Cơ hội & Bán hàng | 🟢 Sẵn sàng | |
| 5 | Công việc & Phê duyệt | 🟢 Sẵn sàng | |
| 6 | Cam kết phản hồi (SLA) | 🟢 Sẵn sàng | |
| 7 | Báo cáo & Phân tích | 🟢 Sẵn sàng | thiếu chia sẻ báo cáo bằng link (V6) |
| 8 | Hệ thống & Phân quyền | 🟢 Sẵn sàng | thiếu khoá API/webhook (V6) |
| 9 | Ngành & Giao diện | 🟢 Sẵn sàng | 6 ngành mũi nhọn: spa · shop · phòng khám/nha · pet · F&B · bán lẻ |
| 10 | Mặt tiền tiệm online | 🟢 Sẵn sàng | trang riêng-từng-khách `/k/` đang xây (V2.5) |
| 11 | **Lịch hẹn & Dịch vụ** | 🟢 Sẵn sàng | **mới đóng 13/08** |
| 12 | **AI trực việc** | 🔨 Đang xây | V2.5 — đợt đang mở |
| 13 | Đơn hàng & Thu tiền | ⚪ Trong lộ trình | V3 |
| 14 | Hàng hoá & Kho | ⚪ Trong lộ trình | V4 |
| 15 | Két sắt & Công nợ | ⚪ Trong lộ trình | V5 |
| 16 | Giữ khách & Danh tiếng | ⚪ Trong lộ trình | V6 |
| 17 | Tự động hoá | ⚪ Trong lộ trình | V6 |
| 18 | Kết nối & API | ⚪ Trong lộ trình | V6 |
| 19 | Đội ngũ & Chấm công | ⚪ Trong lộ trình | V7 |
| 20 | Chat nội bộ | ⚪ Trong lộ trình | V7 |

**Đếm thật: 11 sẵn sàng · 1 đang xây · 8 trong lộ trình.**

⚠️ **`lib/feature-registry.ts` phải dựng lại theo bảng này** — bản hiện tại theo khung 6 trục cũ và **chứa 2 dòng sai sự thật** (mục 1.1).

### 5.2 Trang chủ hiện tại là trang TIỀN-MỞ-BÁN, không phải trang bán hàng

Founder chốt: ***"rẻ hơn toàn bộ đối thủ và toàn bộ mọi tính năng thì mới bắt đầu open và bán"*** ⇒ **ngày mở bán bị khoá sau khi đủ 20 mảng.** Còn 8 mảng chưa mở ⇒ **hôm nay chưa phải lúc bán.**

Nhưng founder cũng chốt: ***"user được sử dụng free trước"*** ⇒ **vẫn phải mời người ta vào dùng ngay.**

Hai điều đó không mâu thuẫn nếu trang chủ nói đúng việc của nó:

> **Nhiệm vụ trang chủ hôm nay = mời dùng thật phần đã xong + công khai phần đang xây.**
> **KHÔNG phải** thuyết phục ai đó rút ví.

Đây cũng là **cách duy nhất** giữ được cả tầm vóc 20 mảng lẫn luật *"không nói dối"*: kể trọn bản đồ, gắn nhãn thật từng mảng.

**Và nó biến điểm yếu thành lợi thế:** mọi nút của CNV Work đều dẫn về *"đặt lịch demo"* — cánh cửa đóng với tiệm 5 người. iFan **bày hết ra, ai cũng tự đăng ký dùng ngay**. Đó là mặt trận 4 trong `01 Chiến lược` mục 0.2c — thứ đối thủ **không sao chép được** vì nó phá mô hình doanh thu của chính họ.

### 5.3 Bộ trang công khai — 5 trang mới + 2 trang pháp lý đã có

| Trang | Việc của nó | Vì sao cần |
|---|---|---|
| `/` | Một ngày của chủ tiệm · 4 điểm hơn đối thủ · trạng thái thật · CTA dùng miễn phí | Trang chủ không tải nổi 20 mảng — chỉ kể chuyện |
| `/tinh-nang` | Đủ 20 mảng, nhóm theo bảng 5.1, nhãn trạng thái thật | Chỗ duy nhất liệt kê đủ, cho người muốn soi kỹ |
| `/nganh/[slug]` | 6 trang: spa · shop · phòng khám–nha · pet · F&B · bán lẻ | **Đối thủ KHÔNG có nền theo ngành.** Vừa là lợi thế vừa là cửa tìm kiếm tự nhiên |
| `/bang-gia` | Miễn phí vĩnh viễn (số thật) + 30 ngày đầy đủ + bảng đối chiếu giá đối thủ | Chứng minh "rẻ hơn toàn bộ đối thủ" bằng bảng, không nói suông |
| `/lo-trinh` | 8 mảng còn lại, mỗi mảng ở đợt nào | **Chưa đối thủ VN nào dám công khai lộ trình.** Đây chính là "không nói dối" biến thành thứ bán được |
| `/terms` `/privacy` | đã có | Nợ nhỏ: đang viết cứng, chưa đa ngữ |

**Đúng luật D2** — mỗi trang có nội dung thật, không có trang vỏ rỗng: 6 pack ngành có seed thật trong CSDL; lộ trình lấy từ ADR-0010; trạng thái lấy từ `SU-THAT-SAN-PHAM.md`.

---

## 6. Việc phải làm — bàn giao Sonnet

Theo thứ tự. Việc 1 làm trước vì **đang sai công khai trên trang thật**.

| # | Việc | Ghi chú bắt buộc |
|---|---|---|
| 1 | **Gỡ bảng giá chết + sửa 2 nhãn sai sự thật** | Xoá `pricing.tsx` khỏi trang chủ · xoá câu hứa *"giá ra mắt giữ nguyên"* · sửa `feature-registry.ts`: `invoices` và `payments` từ `ready` → **bỏ khỏi trục Tiền** (chúng là gói cước iFan, không phải tiền của tiệm) |
| 2 | **Dựng lại `lib/feature-registry.ts` theo 20 mảng** | Bảng mục 5.1 là nguồn duy nhất. Ba trạng thái: `ready` \| `building` \| `planned`. Mọi trang công khai đọc từ đây, **cấm gõ tay số** |
| 3 | **Trang chủ mới** | 3 thẻ design: `landing-hero` · `landing-mot-ngay` · `landing-khac-biet-va-mien-phi` |
| 4 | **4 trang mới** | `/tinh-nang` · `/lo-trinh` · `/bang-gia` · `/nganh/[slug]` × 6 |
| 5 | **Đổi dòng AI sang Haiku 4.5** | **Đo chất lượng 20 hội thoại thật trước khi đổi hẳn** (mục 3). Giảm `TRANSCRIPT_MESSAGES` 30 → 12 |
| 6 | **Túi lượt AI + trần chi tiêu** | Mô hình mục 4.2. Trần **bật sẵn mặc định**. Cảnh báo 70% · 90%. Không tự nâng gói |
| 7 | **Reverse trial 30 ngày** | Bảng mục 5b. **Dữ liệu vượt hạn mức chuyển chỉ-đọc, CẤM xoá** |

**Đa ngữ:** mọi trang mới phải qua `messages/vi.json` + `en.json`. *(Nợ cũ: `/privacy` và `/terms` đang viết cứng, chưa đa ngữ — ghi nhận, không thuộc đợt này.)*

---

## 7. Nghiệm thu

| Ca | Ngưỡng đạt |
|---|---|
| Mở trang chủ | **Không còn con số giá nào** ngoài "miễn phí" |
| Đếm nhãn trạng thái trên mọi trang công khai | Khớp 100% `feature-registry.ts`; **không nhãn nào gõ tay** |
| Đối chiếu từng dòng `ready` với `SU-THAT-SAN-PHAM.md` | **Mọi dòng phải có mục tương ứng ở trạng thái CHẠY THẬT** |
| Trang `/nganh/shop`, `/nganh/retail`, `/nganh/fnb` | **Không kể chuyện đặt lịch** (pack không seed dịch vụ — mục 5.3) |
| Hết 30 ngày dùng thử | Tài khoản **vẫn vào được**, dữ liệu vượt hạn mức **đọc và xuất được** |
| Hết túi AI | AI **dừng và báo**, **không** tự tính thêm tiền |
| Bản tiếng Anh + chế độ tối + khổ điện thoại | Kiểm đủ 4 tổ hợp *(bài học nợ #94)* |

---

## 8. Hệ quả

- **Khai tử:** bảng giá 4 gói (Free · 199k · 399k · 799k) · câu hứa *"giá ra mắt giữ nguyên cho khách đăng ký sớm"* · khung "6 trục" · `landing-6-truc.html` · `landing-vi-sao-va-gia.html` · `landing-luong-ke-chuyen.html`.
- **Sửa:** `lib/feature-registry.ts` (dựng lại) · `lib/ai/gateway.ts` (dòng AI + số tin) · `01 Chiến lược` mục 0.4 (giá đã có bản chốt, gỡ dấu "chưa chốt") · task #98.
- **Thêm:** 4 trang công khai · túi lượt AI · reverse trial 30 ngày · 5 thẻ design mới.
- **Không đụng:** mọi màn trong khu đăng nhập, trừ chỗ hiện hạn mức AI.

## Điều kiện xem lại

- **Khi có ≥50 tiệm dùng thật** ⇒ đo lại chi phí hạ tầng mỗi tiệm (mục 4c.6 đang là ước lượng ~10.000đ). Vượt 25.000đ thì đọc lại mục 4c.5.
- **Khi bật AI trực việc (V2.5) và có tiệm chạm trần túi AI** ⇒ đo lượng dùng thật; túi 300 lượt đặt theo suy luận, chưa theo số đo.
- **Khi một đối thủ hạ giá xuống dưới 79.000đ cho không giới hạn người dùng** ⇒ mốc *"rẻ hơn toàn bộ"* của founder bị phá, phải quyết lại.
- **Khi đủ 20 mảng** ⇒ mở bán, công bố giá gói trả phí, đọc lại toàn bộ ADR này.

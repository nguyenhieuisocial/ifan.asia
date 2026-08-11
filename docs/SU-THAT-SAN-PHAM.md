# Sổ sự thật sản phẩm

Cập nhật: **11/08/2026** — bản kiểm kê gốc 10/08 (đọc toàn bộ code) + mục "Cập nhật 11/08" (24 việc all-in-one) + mục "Cập nhật 11/08 (đợt 2)" (V1a Nền ngành, 9 việc) + mục "Cập nhật 11/08 (đợt 3)" (chuyển tiệm) + mục "Cập nhật 11/08 (đợt 4)" (trường tùy biến + vá quyền) + mục "Cập nhật 11/08 (đợt 5)" (tệp đính kèm) + mục "Cập nhật 11/08 (đợt 6)" (tab Lịch sử — V1a đủ 9/9) + mục "Cập nhật 11/08 (đợt 7)" (bỏ ô Mã tiệm — một cửa đăng nhập) bên dưới.

**Luật của sổ này** (học FlowX): đây là nguồn sự thật DUY NHẤT về việc tính năng nào đang chạy thật.
- Thêm/bớt/mở khóa tính năng ⇒ PHẢI cập nhật sổ trong cùng đợt commit.
- Trang bán hàng, báo giá, tài liệu — nói gì về tính năng đều phải khớp sổ này.
- Ba trạng thái, không có trạng thái thứ tư: **CHẠY THẬT** · **LẮP SẴN CHỜ BÊN NGOÀI** (code xong, chờ giấy phép/khóa/cổng thanh toán) · **MỘT PHẦN** (có màn nhưng logic chưa trọn — ghi rõ thiếu gì).

## Đếm nhanh

| Trạng thái | Số mục |
|---|---|
| CHẠY THẬT | 48 (36 gốc + KPI mục tiêu tháng 11/08 + 9 mục V1a (đủ) + 1 mục chuyển tiệm bên dưới) |
| LẮP SẴN CHỜ BÊN NGOÀI | 7 |
| MỘT PHẦN | 4 |

## CHẠY THẬT (bảng gốc 10/08 — cộng mục Cập nhật 11/08 bên dưới = 36)

| Nhóm | Tính năng | Ghi chú |
|---|---|---|
| Public | Landing (huy hiệu Sẵn sàng/Sắp có trung thực), Điều khoản, Bảo mật | |
| Auth | Đăng nhập, đăng ký, quên/đặt lại mật khẩu, nhận lời mời | Email đi qua Supabase — free tier 2 thư/giờ (xem #44) |
| Onboarding | Tạo tiệm + template theo ngành | |
| Tổng quan | KPI, doanh thu theo nguồn, bản tin tuần | |
| Hôm nay | Việc hôm nay (sau đăng nhập về màn này) | |
| Hộp thư | Danh sách + thread + trả lời + gán người + trạng thái + ghi chú nội bộ + đã đọc + realtime + bàn giao + tìm kiếm | |
| Live Chat | Widget nhúng web + màn cài đặt | Kênh chạy được NGAY, không cần giấy phép |
| Khách hàng | Danh sách, chi tiết + timeline, chấm điểm lead (cron đêm), phân hạng (cron đêm), gộp trùng, nhập/xuất Excel | |
| Công ty | Danh sách + chi tiết | |
| Cơ hội | Kanban + thắng/thua + việc cần làm + chi tiết | |
| Báo cáo | Doanh thu theo nguồn (manager trở lên) | |
| Thông báo | Trung tâm thông báo + realtime | |
| Duyệt | Gửi phiếu theo biểu mẫu + duyệt/từ chối 1–2 cấp | |
| Biểu mẫu | Trình tạo form | |
| Workflow | Engine nền (event + retry + dead-letter) + 2 playbook cài sẵn | Màn quản lý mới bật/tắt — xem MỘT PHẦN |
| SLA | Engine đo + leo thang + màn sửa ngưỡng | |
| Mẫu trả lời | Câu trả lời nhanh | |
| Mã QR | Mã gắn nguồn khách + trang đích chống spam | |
| Đội ngũ | Mời thành viên 4 vai + giới hạn ghế | Chưa gửi email mời — trả link để chủ tiệm tự gửi (chủ đích, chờ #44) |
| Tài khoản | Đổi mật khẩu, hồ sơ | |
| Admin | Bảng điều khiển nền tảng (chỉ founder, cổng `is_platform_admin`) | |
| Hạ tầng | 12 job nền pg_cron + chuông báo job hỏng (migration #44, đã thử chuông kêu thật) · rate-limit 2 tầng không tự tắt · chặn đăng nhập proxy | |

## LẮP SẴN CHỜ BÊN NGOÀI (6)

| Tính năng | Chờ gì | Bằng chứng |
|---|---|---|
| Trợ lý AI trong hộp thư (tóm tắt, soạn trả lời, trích thông tin) | Khóa `ANTHROPIC_API_KEY` | `lib/ai/gateway.ts:42` — thiếu khóa hiện thông báo tử tế, có quota 200 lượt/tiệm/tháng |
| Webhook nhận tin Zalo OA | OA được Zalo duyệt + 2 biến env | `app/api/webhooks/zalo/route.ts:72` — chữ ký SHA256, sai là 401 |
| Gửi tin ra Zalo | OA + token thật | `lib/channels/zalo.ts` — có chế độ dry-run để QA trước |
| Kết nối OA trong cài đặt | Giấy phép OA | token cất trong Vault |
| Thanh toán gói cước tự động | Chốt SePay/PayOS + pháp nhân | migration #27 ghi rõ; hiện founder ghi nhận tiền THỦ CÔNG qua RPC |
| Email hệ thống chất lượng | Resend + tên miền (task #44) | free tier: 2 thư/giờ, mẫu thư không sửa được |

## MỘT PHẦN (4)

| Tính năng | Thiếu gì |
|---|---|
| 4 kênh social (Facebook, Instagram, Gmail, TikTok Shop) | Chỉ có card mờ "sắp có" — KHÔNG có code xử lý |
| Màn quản lý workflow | Chỉ bật/tắt playbook cài sẵn — chưa có trình tạo workflow mới |
| Nút "Nhắn Zalo" từ hồ sơ khách | Đang disabled, mở khi kênh Zalo mở |
| ZNS (tin ngoài cửa sổ 48h) | Mới chỉ là chữ "sắp có" trong banner — chưa có code |

## CHƯA LÀM (có trong kế hoạch, chưa có dòng code nào)

- **Kho hàng, thu chi** — thuộc GĐ2 (task #6), hiện không có màn/bảng/chuỗi dịch nào.
- **Zalo Bot nhắc việc nhân viên** — task #53.
- **PWA cảm giác app iOS** — task #50.

## 3 điều đáng nhớ về kiến trúc

1. **Toàn bộ máy chạy nền nằm trong CSDL** (pg_cron + trigger) — không cần server phụ, không phụ thuộc dịch vụ ngoài.
2. **Zalo là mảng "lắp sẵn" hoàn chỉnh nhất** — go-live chỉ cần điền env + token, không đổi code.
3. **Tiền vào hệ thống hiện 100% thủ công** — code chừa sẵn chỗ cho cổng thanh toán.

## Cập nhật 11/08 — sau 24 việc all-in-one (chi tiết: Quy hoạch tính năng hợp nhất 10-08 trong vault)

**4 mục MỚI vào CHẠY THẬT:** trang thử Live Chat (/livechat-demo — nhắn thử thấy tin về Hộp thư ~1 phút, tin thử không đánh lừa trạng thái kênh) · báo cáo "Vì sao thua" (reports/lost-reasons) · cột Chi phí + Lời/Lỗ từng nguồn (nhập tay tiền ads, reports/sources) · PWA bước 1 (cài lên màn hình chính, icon riêng, mở toàn màn).

**1 mục MỚI vào LẮP SẴN CHỜ BÊN NGOÀI:** Zalo Bot nhắc việc + SLA về Zalo cá nhân — máy đủ (bản tin gộp 15 phút, quota 3.000 tin/tháng, ghép nối nhân viên, màn cài đặt, token Vault) — CHỜ founder tạo bot ~5 phút và dán token (hướng dẫn trong vault).

**20 mục sẵn có được NÂNG CẤP lớn:** Hộp thư (trạm CRM mini: tạo cơ hội/việc ≤2 chạm trong chat; banner dán-mã-dở-dang) · Cơ hội (tìm kiếm DB-side, dialog Hẹn tiếp 2 chạm, mở lại hội thoại gốc, thắng → hẹn chăm lại + playbook 7 ngày) · Hôm nay ("đã xong N", tự làm mới 60s, sửa lỗi khách-nóng-loại-nhầm-vĩnh-viễn) · hồ sơ khách (Việc đang chờ ghim đầu + thông báo nhảy đúng dòng) · thông báo trỏ đúng đích · mọi số đếm bấm được (bộ lọc lên URL) · billing (hóa đơn chờ + hướng dẫn chuyển khoản) · /admin (Hóa đơn chờ thu + nút Đã nhận tiền idempotent + chuông báo job nền) · Cài đặt (trang index 4 cụm, nav ẩn theo vai, đếm lượt dùng câu trả lời nhanh) · QR tự gắn nguồn qua Live Chat · onboarding (checklist 3 bước, hết copy trỏ nhầm Zalo) · auth (nút Gửi lại thư) · vỏ mobile (skeleton 5 màn, bottom-sheet, vuốt back đúng, safe-area, badge tin chưa trả lời).

**CHƯA LÀM (không đổi):** kho hàng/thu chi (kế hoạch sau, task #6) · PWA bước 2–3 · 4 kênh social · workflow builder · ZNS. **Máy nền:** 14 job pg_cron (thêm zalo-bot-digest, cron-failure-scan) · 59 migration có sổ.

**1 mục MỚI vào CHẠY THẬT (11/08, sau landing):** KPI mục tiêu tháng (migration #59, hồ sơ mục 9 quy hoạch 10-08) — chủ/quản lý đặt mục tiêu tháng trong Cài đặt → Nhân viên (3 chỉ số: doanh thu chốt / khách mới / việc xong, cho từng nhân viên hoặc cả tiệm, bật/tắt từng chỉ số); nhân viên thấy thanh tiến độ CỦA MÌNH trên Hôm nay kèm nhãn vượt/hụt nhịp (chưa đặt mục tiêu thì ẩn hẳn); bảng cả đội ở Báo cáo → Mục tiêu tháng (% đạt + nhãn nhịp + ghi chú "đã đổi ngày N" khi sửa giữa tháng). Số tự cộng dồn DB-side qua RPC kpi_progress() từ deals/contacts/activities — CÙNG định nghĩa đếm với Tổng quan/Báo cáo nguồn, không có bảng cộng dồn riêng.

## Cập nhật 11/08 (đợt 2) — V1a "Nền ngành" xong trọn 9 việc (chi tiết: Quy hoạch hợp nhất 10-08 mục 35, migration #60-65)

**7 mục MỚI vào CHẠY THẬT:**

| Tính năng | Ghi chú |
|---|---|
| Chọn/đổi ngành (Industry Pack Engine) | Cài đặt → Ngành & giao diện. 8 gói ngành (6 mũi nhọn Spa/Shop/Khám/Pet/F&B/Retail + Education/Other giữ nguyên) — đổi ngành chỉ đổi từ vựng + gợi ý, KHÔNG xoá dữ liệu đang có. Chủ/quản trị viên đổi, nhân viên chỉ xem. |
| Khung nav theo ngành | Nhãn "Khách hàng"/"Cơ hội" trong thanh menu + 2 màn chính tự đổi theo ngành đã chọn (VD: phòng khám gọi là "Bệnh nhân"/"Ca điều trị") — chỉ đổi CHỮ, không đổi cấu trúc. |
| Thùng rác | Cài đặt → Thùng rác (chủ/quản trị viên). Khách/cơ hội/công ty đã xoá nằm 30 ngày mới mất hẳn, khôi phục lại được; máy tự dọn đêm. |
| Tài khoản nhân viên không cần email | Cài đặt → Nhân viên có nút "Không có email" — chủ tạo tài khoản bằng tên + SĐT, hiện mật khẩu tạm 1 lần; nhân viên đăng nhập bằng SĐT + mật khẩu (từ 11/08 KHÔNG cần mã tiệm nữa, xem mục dưới); lần đầu vào bắt đổi mật khẩu riêng ngay. |
| Nhật ký đăng nhập | Cài đặt → Nhật ký đăng nhập (chủ/quản trị viên). Ghi ai đăng nhập, lúc nào, từ IP/vị trí nào (đọc miễn phí qua Vercel, không tốn dịch vụ định vị trả phí), cả 3 kiểu đăng nhập (email/SĐT nhân viên/link trong thư). |
| Tham quan tiệm mẫu | Màn tạo tiệm (onboarding) có nút "Xem tiệm mẫu" theo 6 ngành — người chưa mở tiệm xem thử 1 tiệm đang "chạy sống" (có khách/cơ hội/việc thật), chỉ xem không sửa được gì, có dải cam nhắc + nút thoát trên mọi màn. Từ 11/08 (đợt 3): 5 tiệm mẫu ngoài Spa được làm giàu ngang tầm tiệm demo — mỗi tiệm 14 khách, 9 cơ hội (đủ thắng/thua/đang mở), 6 việc (có việc quá hạn), 8 hội thoại Zalo tự nhiên (~75-90 tin nhắn) — Hộp thư không còn trống. |
| (Vá lỗi) Vai "Chỉ xem" đọc/ghi đúng như mô tả | Trước 11/08 vai này đọc dữ liệu SAI (ra rỗng) mà vẫn GHI được vài chỗ (công ty, tự gán mình vào việc) — đã vá cả 2 chiều, ảnh hưởng mọi tiệm đang dùng vai này (kế toán/người ngoài xem sổ), không riêng tiệm mẫu. |

**Kiến trúc mới đáng nhớ:** ngành là DỮ LIỆU (bảng industry_packs), không phải nhánh code riêng — một bản code phục vụ mọi ngành. Từ vựng đọc qua đúng MỘT hàm (lib/tenant-pack.ts), cấm chép riêng từng ngành một bộ dịch.

## Cập nhật 11/08 (đợt 3) — Một tài khoản, nhiều tiệm (ADR-0005, migration #66)

**1 mục MỚI vào CHẠY THẬT:**

| Tính năng | Ghi chú |
|---|---|
| Chuyển qua lại nhiều tiệm | Menu người dùng (avatar góc phải) hiện "Tiệm của tôi" khi tài khoản thuộc ≥2 tiệm thật — bấm là chuyển ngay, không cần đăng nhập lại. Mục "Xem thử tiệm mẫu" giờ hiện với MỌI người, kể cả đã có tiệm thật (trước đó chỉ người CHƯA có tiệm mới xem được). |

**Vá 2 lỗi đang sống, phát hiện khi làm việc trên:**

- Người đã có 1 tiệm được mời vào tiệm thứ 2 → bấm nhận lời mời báo "thành công" nhưng app vẫn mở tiệm cũ, không có cách nào vào tiệm mới; ghế tiệm mới vẫn bị trừ. Ảnh hưởng mọi tiệm có mời người đã dùng iFan ở tiệm khác — không riêng tính năng này.
- Tài khoản được nâng hạn mức mở nhiều tiệm (chuỗi chi nhánh): tạo tiệm thứ 2 xong, cấu hình ngành vừa chọn bị ghi NHẦM vào tiệm cũ thay vì tiệm mới tạo. Bắt được lúc thiết kế, chưa từng xảy ra với khách thật (tính năng nhiều tiệm chưa ai dùng trước đợt này).

**Kiến trúc mới đáng nhớ:** "tiệm đang chọn" là 1 cột trên hồ sơ người dùng (`profiles.active_tenant_id`) — chỉ là GỢI Ý, không phải nguồn quyền; hệ thống luôn tự kiểm lại người đó còn là thành viên hợp lệ của tiệm đó không trước khi cấp quyền, tự động rơi về tiệm hợp lệ nếu gợi ý sai (không bao giờ kẹt). Chi tiết kỹ thuật + sổ rủi ro: `docs/adr/0005-nhieu-tiem-mot-tai-khoan.md`.

## Cập nhật 11/08 (đợt 4) — Trường tùy biến (V1a việc 4/24o) + vá quyền người bị gỡ khỏi tiệm

**1 mục MỚI vào CHẠY THẬT:**

| Tính năng | Ghi chú |
|---|---|
| Trường tùy biến theo ngành | Pack ngành khai trường riêng (hiện chỉ pack Khám bệnh có "Tiền sử dị ứng") tự hiện thêm ô nhập trên form thêm/sửa khách + hiện trên hồ sơ khách (trường trống thì ẩn, không hiện dòng thừa). Đúng phạm vi V1a: chỉ lưu + hiện, chưa đưa lên bộ lọc/tìm kiếm/xuất Excel (việc đó dành đợt sau). |

**Vá 1 lỗ hổng có sẵn, phát hiện lúc soát code cho tính năng chuyển tiệm:** người vừa bị gỡ khỏi tiệm vẫn thao tác được cho tới khi "thẻ vé" đăng nhập cũ hết hạn tự nhiên (~1 giờ) — dựng 1 hàm kiểm quyền dùng chung, áp lại cho 29 màn hình đang tự kiểm tra rời rạc. Ảnh hưởng mọi tiệm thật, không riêng tiệm nào.

## Cập nhật 11/08 (đợt 5) — Tệp đính kèm (V1a việc 2/24k)

**1 mục MỚI vào CHẠY THẬT:**

| Tính năng | Ghi chú |
|---|---|
| Đính kèm ảnh vào ghi chú nội bộ + logo tiệm | Hộp thư: soạn "Ghi chú nội bộ" đính kèm được 1 ảnh (≤5MB) — ảnh hiện lại trong dòng thời gian ghi chú. **Chỉ áp dụng cho ghi chú nội bộ, KHÔNG áp dụng cho tin trả lời khách** — nền tảng Zalo Bot hiện chưa có đường gửi ảnh tới khách, nên không giả vờ làm được việc chưa làm được. Cài đặt → Ngành & giao diện: chủ/quản trị tải logo tiệm (≤2MB), hiện cho mọi vai xem. |

## Cập nhật 11/08 (đợt 6) — Tab "Lịch sử" hồ sơ khách (V1a việc 3/24q) — ĐỦ 9/9 VIỆC

**1 mục MỚI vào CHẠY THẬT:**

| Tính năng | Ghi chú |
|---|---|
| Tab "Lịch sử" trên hồ sơ khách | Chủ tiệm/quản trị viên thấy thêm tab "Lịch sử" bên cạnh "Tổng quan" — liệt kê mọi lần tạo/sửa/xoá/khôi phục hồ sơ, ai làm, sửa trường gì (giá trị cũ → mới), lúc nào. Nhân viên/vai Chỉ xem thấy hồ sơ y hệt trước đây, không có tab nào (đúng RLS chỉ owner/admin đọc được nhật ký). |

**V1a chính thức xong đủ 9/9 việc** (mục 35.1) — điều kiện phạm vi tính năng để mở V1b (mục 35.5) đã đạt. (9 tiêu chí đo ở mục 35.3 — mấy tiêu chí liên quan "% tiệm mới chọn ngành" vẫn cần thêm thời gian có đủ khách thật mới đo được, không phải thiếu tính năng.)

## Cập nhật 11/08 (đợt 7) — Bỏ ô "Mã tiệm": một cửa đăng nhập duy nhất (migration #68)

Founder chỉ ra và gọi đúng tên: **đây là BUG luồng, không phải thiếu tính năng.** Màn đăng nhập cũ bắt người dùng tự chọn tab ("Email" hay "Nhân viên") trước khi hệ thống nói cho họ biết mình thuộc loại nào, rồi nhân viên còn phải gõ thêm "Mã tiệm" — thứ hệ thống hoàn toàn tra được. Mật khẩu mới là thứ chứng minh danh tính; mã tiệm chỉ là khoá tra cứu nội bộ bị đẩy sang cho người dùng gánh.

**Thay đổi CHẠY THẬT:**

| Trước | Sau |
|---|---|
| 2 màn đăng nhập riêng, phải chọn tab đúng | 1 màn, 1 ô "Email hoặc số điện thoại" — gõ gì cũng được, hệ thống tự nhận |
| Nhân viên gõ 3 thứ: SĐT + mã tiệm + mật khẩu | Gõ 2 thứ: SĐT + mật khẩu |
| Chủ tiệm phải đưa nhân viên 3 dòng | Đưa 2 dòng (màn Đội ngũ đã sửa theo) |

Đường link cũ `/login/staff` vẫn dùng được (tự chuyển về màn đăng nhập chung) — chủ tiệm nào đã đưa link cũ cho nhân viên thì không ai gặp trang lỗi.

**Ba chốt bảo mật kèm theo** (không phải hàng rào giấy, đã đo bằng test thật): hàm tra "SĐT này làm ở tiệm nào" CHỈ tầng máy chủ gọi được — mở cho trình duyệt là biến nó thành công cụ dò chỗ làm của người khác; tên tiệm KHÔNG bao giờ hiện trước khi mật khẩu đúng; và người đã bị gỡ khỏi tiệm thì mất luôn đường đăng nhập ngay, không chờ hết hạn phiên.

**Trường hợp hiếm đã lo trước:** một số điện thoại làm ở nhiều tiệm và đặt trùng mật khẩu — lúc đó (và chỉ lúc đó) mới hỏi "bạn muốn vào tiệm nào?", chọn theo TÊN TIỆM chứ không phải mã.

**Quyết định kiến trúc đã cân nhắc và TỪ CHỐI:** không biến số điện thoại thành danh tính dùng chung toàn hệ thống (1 SĐT = 1 tài khoản đi được nhiều tiệm), dù thời điểm này chuyển đổi hoàn toàn miễn phí (đo thật: 0 tài khoản nhân viên đang tồn tại). Lý do: chưa có dịch vụ SMS thì số điện thoại là danh tính CHƯA XÁC THỰC — biến nó thành khoá chung sẽ lộ "số này có tài khoản iFan" cho bất kỳ ai mở được một tiệm miễn phí, và đẻ ra bài toán đồng ý (tiệm B tự kéo người của tiệm A vào tiệm mình). Khi nào có SMS xác thực thì mở lại quyết định này.

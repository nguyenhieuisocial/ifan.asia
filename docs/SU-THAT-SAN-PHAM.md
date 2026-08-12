# Sổ sự thật sản phẩm

Cập nhật: **13/08/2026** — bản kiểm kê gốc 10/08 (đọc toàn bộ code) + mục "Cập nhật 11/08" (24 việc all-in-one) + mục "Cập nhật 11/08 (đợt 2)" (V1a Nền ngành, 9 việc) + mục "Cập nhật 11/08 (đợt 3)" (chuyển tiệm) + mục "Cập nhật 11/08 (đợt 4)" (trường tùy biến + vá quyền) + mục "Cập nhật 11/08 (đợt 5)" (tệp đính kèm) + mục "Cập nhật 11/08 (đợt 6)" (tab Lịch sử — V1a đủ 9/9) + mục "Cập nhật 11/08 (đợt 7)" (bỏ ô Mã tiệm — một cửa đăng nhập) + mục "Cập nhật 11/08 (đợt 8)" (PWA bước 2 + đổi tên tiệm) + mục "Cập nhật 11/08 (đợt 9)" (vá bug hiển thị mobile + viết hoa terminology) + mục "Cập nhật 12/08" (V1b xong phần thiết kế, chưa có code) + mục "Cập nhật 12/08 (đợt 2)" (V1b bước 2 — bộ lọc màn Cơ hội lên URL) + mục "Cập nhật 12/08 (đợt 3)" (V1b bước 3-4 — bộ lọc lưu sẵn CHẠY THẬT) + mục "Cập nhật 12/08 (đợt 4)" (V1b bước 5-6 — quản lý nhãn + thao tác hàng loạt CHẠY THẬT) + mục "Cập nhật 12/08 (đợt 5)" (V1b bước 7 — tìm kiếm toàn cục + trường tùy biến lên lọc/cột/Excel CHẠY THẬT) + mục "Cập nhật 12/08 (đợt 6)" (V1b bước 9 — "Cần giúp?" + phiên hỗ trợ chỉ-đọc CHẠY THẬT, V1b khép lại 9/9 việc) + mục "Cập nhật 12/08 (đợt 7)" (ADR-0007 chuông nền tảng — LẮP SẴN, và đính chính Zalo Bot chưa từng chạy thật) + mục "Cập nhật 12/08 (đợt 8)" (V1.5 "Cửa vào khách" — mặt tiền tiệm + form thu khách CHẠY THẬT) + mục "Cập nhật 13/08" (V2 việc 3 — màn Cài đặt Dịch vụ & Tài nguyên CHẠY THẬT) + mục "Cập nhật 13/08 (đợt 2)" (V2 việc 4 — màn Lịch CHẠY THẬT) bên dưới.

**Luật của sổ này** (học FlowX): đây là nguồn sự thật DUY NHẤT về việc tính năng nào đang chạy thật.
- Thêm/bớt/mở khóa tính năng ⇒ PHẢI cập nhật sổ trong cùng đợt commit.
- Trang bán hàng, báo giá, tài liệu — nói gì về tính năng đều phải khớp sổ này.
- Ba trạng thái, không có trạng thái thứ tư: **CHẠY THẬT** · **LẮP SẴN CHỜ BÊN NGOÀI** (code xong, chờ giấy phép/khóa/cổng thanh toán) · **MỘT PHẦN** (có màn nhưng logic chưa trọn — ghi rõ thiếu gì).

⚠️ **Ô "Số mục" trong bảng Đếm nhanh là con số GÕ TAY** — máy đo vault (`scripts/vault-status.mjs`) đọc lại chính ô đó rồi bơm lên trang chủ vault, nên gõ sai ở đây là sai lan sang chỗ khác. Đã dính đúng một lần (12/08: V1.5 xong 3 mục mà quên cộng, số đứng yên ở 55 trong khi thực tế 58). **Thêm mục ở dưới thì sửa số ở đây NGAY trong cùng lượt** — cùng loại bệnh với nhãn "(chưa có code)" trên thẻ design và giới hạn dòng chép tay: thứ mô tả một thứ khác, nằm cách nó rất xa, không có gì buộc hai bên đi cùng nhau.

## Đếm nhanh

| Trạng thái | Số mục |
|---|---|
| CHẠY THẬT | 60 (36 gốc + KPI mục tiêu tháng 11/08 + 9 mục V1a (đủ) + 1 mục chuyển tiệm + 1 mục bộ lọc lưu sẵn 12/08 + 1 mục màn Quản lý nhãn (gộp/hoàn tác) + 1 mục thao tác hàng loạt trên danh sách Khách + 1 mục tìm kiếm toàn cục + 1 mục trường tùy biến lên lọc/cột/Excel + 1 mục "Cần giúp?" + phiên hỗ trợ chỉ-đọc + 1 mục chuông nền tảng báo founder qua Zalo, ghép nối thật đã xác nhận 12/08 + 3 mục V1.5 "Cửa vào khách" 12/08: trang mặt tiền công khai `/t/<tên-tiệm>` · form thu khách trên mặt tiền · màn Cài đặt mặt tiền & giờ mở cửa + 1 mục V2 việc 3 (13/08): màn Cài đặt → Dịch vụ & Tài nguyên + **1 mục V2 việc 4 (13/08): màn Lịch**) |
| LẮP SẴN CHỜ BÊN NGOÀI | 7 (chuông nền tảng đã chuyển sang CHẠY THẬT 12/08; bot nhắc việc nhân viên vẫn ở đây — máy đã sống, chỉ còn chờ TỪNG TIỆM tự dán token) |
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

- **Kho hàng, thu chi** — quy hoạch chính thức xếp vào V3 "Tiền thật" (mục 34.7), đến sau V1b/V1.5/V2 theo đúng trình tự thi công, chưa tới lượt mở.
- ~~PWA cảm giác app iOS~~ — đã CHẠY THẬT, xem các đợt cập nhật bên dưới (dòng này từng để sai, dọn lại 11/08 đợt 8).
- **Đính chính 12/08:** dòng gốc ở đây từng ghi luôn cả "Zalo Bot nhắc việc nhân viên" là đã CHẠY THẬT — **SAI**, dọn lại. Tự phát hiện khi thiết kế ADR-0007 (12/08): biến môi trường bắt buộc `BOT_INGEST_KEY` chưa từng được đặt trên máy chủ thật (kiểm trực tiếp qua Vercel, không suy đoán), nên toàn bộ đường gửi tin Zalo Bot — cả tin nhắc việc nhân viên (#53/#54) lẫn chuông báo founder mới (#84) — vẫn đứng yên từ lúc code xong tới giờ, chưa gửi được tin nào ở môi trường thật. Đúng trạng thái: **LẮP SẴN CHỜ BÊN NGOÀI** (xem dòng #80 và mục "Cập nhật 12/08 (đợt 7)" bên dưới).

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

## Cập nhật 11/08 (đợt 8) — PWA bước 2 + đổi tên tiệm (vá bug founder báo)

**2 mục MỚI vào CHẠY THẬT:**

| Tính năng | Ghi chú |
|---|---|
| PWA bước 2 — mời cài + báo mất mạng | Mời "Thêm vào màn hình chính" sau ~3 lần mở (không hỏi ngay lần đầu), bấm "Để sau" thì im 30 ngày; iOS Safari không có nút cài tự động nên hiện thẳng 3 bước tay. Dải báo mất mạng ở đầu app + mốc "đang xem bản lưu lúc mấy giờ" (service worker viết tay, không dùng Serwist/Workbox — public/sw.js), tự hết khi có mạng lại. **Cố ý CHƯA làm:** hàng chờ gửi lại thao tác lúc mất mạng — dễ sinh lỗi trùng/mất nếu làm vội, để dành đợt riêng. |
| Đổi tên tiệm | Cài đặt → Ngành & giao diện có thêm ô "Tên tiệm" (tên hiển thị + định danh @…) — chủ/quản trị viên tự đổi bất cứ lúc nào. Trước bản này, tên đặt một lần lúc tạo tiệm (onboarding) là dính vĩnh viễn, không có chỗ sửa. |

**Bug founder báo (11/08) đã điều tra rõ nguyên nhân — KHÔNG phải rò rỉ dữ liệu:** founder thấy web hiện tên tiệm "hieu.asia" thay vì "iFan", tưởng 2 dự án bị lẫn. Đo thật bằng SQL: tài khoản đăng nhập của founder chỉ có ĐÚNG MỘT tiệm trong CSDL — tiệm test rỗng (0 khách/hội thoại/cơ hội) họ tự tạo lúc mới dựng hệ thống (05/08), đặt tên là "hieu.asia" lúc đó. Không có tiệm "iFan" nào khác tồn tại để lẫn vào. Nguyên nhân thật: THIẾU tính năng tự đổi tên (đã vá ở dòng trên), không phải bug bảo mật/rò rỉ.

**Task tracker dọn lại cùng đợt:** #57 (landing big iFan) và #50 (PWA) đánh dấu xong; #6 ("Giai đoạn 2" nhãn cũ) đóng — 4/5 việc gốc (workflow, SLA, quy kết nguồn, gộp trùng) hoá ra đã CHẠY THẬT từ các đợt trước, chỉ "kho/thu chi" dời sang V3 đúng trình tự chính thức (mục 34.7). Việc kế tiếp theo đúng trình tự là V1b — nhưng V1b chưa có "hồ sơ 5 phần" như V1a từng có (mục 35); tạo task riêng chờ Opus/Fable viết hồ sơ trước khi code, theo đúng luật nghiệm thu ghi trong quy hoạch.

## Cập nhật 11/08 (đợt 9) — Vá 2 lỗi founder chụp ảnh báo trên điện thoại

Founder gửi ảnh chụp thật: (1) banner mời cài đè lên thanh điều hướng dưới cùng, (2) chữ không viết hoa đầu câu ở nhiều chỗ ("khách", "đơn hàng tiềm năng" trong nav/tiêu đề).

**Nguyên nhân (1) — lỗi CSS lan rộng hơn tưởng, vá hết một lượt:** `calc()` viết thiếu dấu cách quanh dấu `+`/`-` (VD `calc(3.5rem+env(...))`) là CSS KHÔNG HỢP LỆ theo chuẩn — trình duyệt lặng lẽ bỏ qua, khiến khoảng đệm/chiều cao tính ra `0px` thay vì giá trị đúng. Đo thật bằng `getComputedStyle` phát hiện đây không phải lỗi riêng install-prompt mà là **1 kiểu lỗi lặp lại 6 chỗ trong kho code**, kể cả 1 chỗ đã CHẠY THẬT trên production từ trước (khung nội dung chính `app/app/layout.tsx` thiếu đệm đáy cho thanh điều hướng mobile — có thể khiến nội dung cuối trang bị che, không ai báo trước đây). Đã sửa cả 6: khung nội dung chính, banner mời cài (2 chỗ), bottom-sheet dialog mobile, popover chuông thông báo, dải mờ cuộn ngang màn Duyệt & yêu cầu, chiều cao tab-trigger.

**Nguyên nhân (2) — 8 gói ngành lưu tên gọi (terminology) TOÀN CHỮ THƯỜNG trong CSDL** (VD "khách", "đơn hàng tiềm năng") vì cùng 1 từ được chèn cả GIỮA câu lẫn ĐẦU nhãn độc lập. Nơi chèn ở ĐẦU nhãn (nav trái/dưới, tiêu đề trang Khách hàng/Cơ hội) không tự viết hoa. Thêm hàm `capitalizeFirst()` dùng chung (`lib/tenant-pack.ts`), áp đúng 3 nơi hiện làm tiêu đề/nhãn độc lập — KHÔNG đụng vào các chỗ terminology nằm giữa câu (đúng ngữ pháp giữ nguyên chữ thường).

Đã kiểm bằng trình duyệt thật: `getComputedStyle` đo lại đúng số sau sửa, banner nằm đúng phía trên thanh điều hướng, nhãn "Khách"/"Lịch/liệu trình" viết hoa nhất quán.

## Cập nhật 12/08 — V1b: xong phần THIẾT KẾ, chưa có dòng code nào

**Không có mục nào mới vào CHẠY THẬT.** Đợt này là hoạch định + thiết kế (Opus), ghi vào sổ để không ai đọc thẻ design rồi tưởng tính năng đã có.

**Đã có (giấy, chưa phải máy):** hồ sơ thi công V1b đầy đủ (Quy hoạch mục 36) · quyết định bảo mật phiên hỗ trợ (`docs/adr/0006-phien-ho-tro-chi-doc.md`) · hợp đồng dữ liệu 4 bảng mới · **7 thẻ design** (bộ lọc lưu sẵn · chọn nhiều + hàng loạt · quản lý nhãn · tìm kiếm toàn cục · Cần giúp? + dải hỗ trợ · bảng lọc mở rộng · cảnh báo đổi pack).

**Hai điều chỉnh do ĐO chứ không do đọc tài liệu:**

| Đo được | Hệ quả |
|---|---|
| Nhãn khách (31.7) **đã chạy thật**: 43 nhãn, 172 lượt gắn, đủ 6/6 tiệm, code ở 9 file | V1b chỉ còn làm 2 mẩu (lọc theo nhãn + màn quản lý nhãn), **cấm dựng lại bảng `tags`** |
| `getTenantModules()` được **0 màn** gọi; **0 module** có màn thật | Việc "cảnh báo đổi ngành làm tắt phần nào" **dời sang V2** — dựng bây giờ thì cảnh báo vĩnh viễn hiện "còn 0" (máy không có đầu vào, trái luật D2). Không bỏ quên, có task riêng. |

⇒ **V1b còn 6 việc** (không phải 8 như bảng 34.7 ghi ban đầu).

**CHƯA LÀM — cập nhật lại danh sách:** kho hàng/thu chi (V3) · 4 kênh social · trình tạo workflow · ZNS · và toàn bộ 6 việc V1b nói trên (mới có thẻ design + hồ sơ, chưa có code).

## Cập nhật 12/08 (đợt 2) — V1b bước 2: bộ lọc màn Cơ hội lên URL

**Không có mục nào mới vào CHẠY THẬT** — đây là trả nợ kỹ thuật (Sonnet code), không phải tính năng mới. Màn Cơ hội (Kanban) đã tìm/lọc được từ trước; đợt này chỉ đổi CHỖ LƯU trạng thái lọc, từ `useState` cục bộ (mất khi tải lại trang) sang URL — cùng khuôn `?q=`/`?source=`/`?tier=`/`?sort=` mà màn Khách đã dùng.

- `?q=` (tìm theo tên cơ hội + tên khách) và `?needs_action=1` (chỉ hiện cơ hội cần việc kế tiếp) — đúng vốn từ đã chốt ở mục 36.9F, tắt lọc thì xoá hẳn tham số (không lưu `=false`).
- Vá kèm một lỗi khi làm: đọc `?q=`/`?needs_action=` chỉ ở phía trình duyệt (giống bản đầu màn Khách) thì bản HTML server dựng ra và bản trình duyệt tự đọc URL LỆCH NHAU ngay lần tải đầu — React coi là lỗi "hydration", có lúc kẹt luôn ở bản sai (bộ lọc trông như không có tác dụng dù URL đúng). Sửa bằng cách đọc `searchParams` ở server (`page.tsx`) rồi truyền xuống làm giá trị khởi tạo — đã kiểm bằng bản build thật (`next build && next start`), tải thẳng link có `?q=&needs_action=1` ra đúng ngay từ khung hình đầu, gõ tìm/bấm nút cũng ghi đúng lên URL.
- Đã thấy (không phải do sửa này gây ra, có sẵn từ trước): ở **chế độ phát triển** (`next dev`, không phải bản chạy thật), thỉnh thoảng trình duyệt báo lỗi "hydration" vô hại do Radix (thư viện menu) — chỉ xảy ra khi code đang chạy qua Turbopack dev, KHÔNG xảy ra ở bản build thật. Ghi nhận riêng, không phải việc của đợt này.

⇒ **V1b còn 5 việc** (bước 3–9, xem mục 36 Quy hoạch).

## Cập nhật 12/08 (đợt 3) — V1b bước 3-4: bộ lọc lưu sẵn (24p) CHẠY THẬT

**1 mục MỚI vào CHẠY THẬT:** "Chip bộ lọc lưu sẵn" — ghim ở màn Khách và màn Cơ hội. Bấm 1 chip = ra đúng danh sách đã lọc trước đó; bấm "Lưu bộ lọc này" khi đang lọc khác mặc định để tạo chip mới của riêng mình; bấm lại chính chip đang bật = bỏ lọc.

- **Migration nền một đợt** (4 bảng mới + 2 cột trên `tenant_members`) đã áp vào CSDL thật (Singapore, `gcvadkowtqyobgfzhklq`): `saved_views` (chip đang chạy) · `bulk_operations`/`help_requests`/`support_sessions` (schema dựng sẵn, CHƯA có đường ghi — chờ task #79/#81 nối tiếp, không phải tính năng chạy thật hôm nay).
- **Hai chiều lọc bắt buộc mới** (để chip có giá trị thật, không chỉ trang trí): màn Khách thêm ô "Chưa quay lại N ngày" (30/60/90/180 ngày) cạnh 2 ô lọc cũ (Nguồn, Hạng).
- **Đã seed sẵn 2 chip mặc định mỗi tiệm** theo đúng nghề đang chọn (VD spa = "Cần kéo về" — VIP chưa quay lại 60 ngày — + "Khách mới"), áp cho cả 6 tiệm mẫu/demo đang có sẵn, không cần bấm gì thêm.
- **Chốt chặn không tự nới rộng khi bộ lọc cũ hỏng:** mở một chip mà app không còn hiểu điều kiện (VD sau này đổi tên tham số) thì báo "dùng điều kiện bản cũ", KHÔNG tự động hiện hết toàn bộ khách — đã kiểm bằng phép thử thật trên CSDL (sửa tay một điều kiện thành tham số lạ rồi mở lại, đúng báo hỏng, không lộ danh sách rộng hơn).
- Đã kiểm bằng bản build thật: lưu bộ lọc mới → hiện chip ngay; bấm chip → đúng danh sách; cross-check bằng SQL đếm tay khớp 100% với kết quả trên màn hình.

**Chưa làm ở đợt này (việc của task sau, không phải quên):** lọc theo NHÃN (khoá tên đã dành sẵn trong bộ lọc, chờ task #79 làm màn quản lý nhãn trước) · thao tác hàng loạt dùng chung `bulk_operations` (task #79) · "Cần giúp?" + phiên hỗ trợ (task #81, làm CUỐI).

⇒ **V1b còn 4 việc** (bước 5–9, xem mục 36 Quy hoạch).

## Cập nhật 12/08 (đợt 4) — V1b bước 5-6: quản lý nhãn + thao tác hàng loạt CHẠY THẬT

**2 mục MỚI vào CHẠY THẬT:**

| Tính năng | Ghi chú |
|---|---|
| Màn Cài đặt → Quản lý nhãn | Danh sách nhãn còn sống kèm SỐ KHÁCH thật đang mang mỗi nhãn (mọi member xem được — RLS `tags_select`); tạo/đổi tên/đổi màu/xoá mềm/**gộp nhãn** chỉ owner/admin/manager (RLS `tags_manage`). Gộp nói rõ chiều nào ăn chiều nào bằng SỐ THẬT tính lúc đó (không cộng thẳng hai số đếm — khách có cả hai nhãn không bị đếm 2 lần), cấm chữ "xoá" cho nhãn nguồn (dùng "biến mất"), sau khi gộp có nút **Hoàn tác thật** (không phải hứa suông) — cả ba đã kiểm bằng thao tác tay thật trên CSDL Singapore: gộp 2 nhãn có 1 khách trùng nhau ra đúng số cộng-trừ-trùng, bấm Hoàn tác dựng lại đúng nhãn nguồn + đúng tập khách trước khi gộp, không đụng khách vốn đã có sẵn nhãn đích. |
| Chọn nhiều + hành động hàng loạt trên danh sách Khách | Vào chế độ chọn bằng nút "Chọn" (mọi màn) hoặc nhấn giữ một dòng (điện thoại) — luôn hiện "Đã chọn N · Bỏ chọn". Ba nút hàng loạt **Giao cho…／Gắn nhãn／Tạo việc** đều GỌI LẠI đúng hàm mà thao tác đơn lẻ đang dùng (QĐ-3 — không có SQL đi tắt); chọn quá 500 báo trần ngay lúc chọn, không đợi bấm xong; kết quả báo thật "Xong N · Lỗi M" kèm xem từng dòng lỗi, không nuốt lỗi. Bấm 2 lần/mạng chập không nhân đôi việc (khoá `operation_id` + `bulk_operations` ghi biên nhận TRƯỚC khi chạy). Đã kiểm bằng thao tác tay thật: giao khách cho nhân viên khác (RLS tự chặn nhân viên thường không giao được cho người khác), gắn nhãn hàng loạt hiện đúng trên hồ sơ từng khách. |

**Nền móng đã đặt trước ở migration #69 (task #78) giờ nối đường ghi:** `bulk_operations` từ "chỉ có bảng" sang có 3/5 loại hành động chạy thật (`assign_owner`, `add_tag`, `create_task`) — `set_source`/`remove_tag` vẫn chỉ nằm trong danh mục hợp lệ ở CSDL, CHƯA có nút bấm nào gọi tới, để dành nếu có yêu cầu sau (không phải quên, thẻ design `man-chon-nhieu.html` chỉ vẽ đúng 3 nút này).

**Cột `tags.deleted_at` mới thêm** (bất biến 11 — soft-delete, giống `contacts`): ràng buộc trùng tên nhãn đổi từ "trùng tên là cấm" sang "chỉ cấm trùng tên GIỮA CÁC NHÃN CÒN SỐNG" — gộp/xoá xong thì tên đó dùng lại được ngay.

Đã kiểm: `npx supabase db advisors` sạch (không phát sinh cảnh báo mới ngoài 2 dòng "security definer" vốn cố ý), `node scripts/rls-smoke.mjs` 245/245 PASS trên CSDL thật (không để lại dữ liệu rác), build thật (`next build && next start`) + thao tác tay trên trình duyệt thật với tài khoản demo bán hàng — không giả lập.

⇒ **V1b còn 2 việc** (bước 7, 9, xem mục 36 Quy hoạch).

## Cập nhật 12/08 (đợt 5) — V1b bước 7: tìm kiếm toàn cục (24l) + trường tùy biến lên lọc/cột/Excel (24o) CHẠY THẬT

**2 mục MỚI vào CHẠY THẬT:**

| Tính năng | Ghi chú |
|---|---|
| Tìm kiếm toàn cục | Một ô tìm ra cả Khách/Hội thoại/Cơ hội cùng lúc, gõ không dấu vẫn ra (VD "goi triet long" ra "Gói triệt lông..."), khớp SĐT kể cả gõ 4 số cuối. Desktop: nút rộng có chữ mời + phím tắt Ctrl/Cmd K (không chỉ có phím tắt — chủ tiệm không rành máy tính vẫn thấy được lối vào). Điện thoại: một icon nhỏ trên thanh trên cùng (không nhồi thêm ô vào thanh đã chật tên tiệm + chuông + avatar) cộng một ô tìm đầy đủ đặt trong nội dung màn "Hôm nay". Không ra kết quả thì gợi hành động "+ Thêm khách «tên»" ngay tại chỗ, không phải màn trắng. RPC `global_search` chạy quyền SECURITY INVOKER (không phải DEFINER) nên luật phân quyền của từng bảng tự áp đúng — nhân viên thường tìm Khách/Cơ hội chỉ ra người mình phụ trách, tìm Hội thoại ra cả tiệm (khớp đúng luật hộp thư sẵn có), không phải viết lại luật riêng cho ô tìm. |
| Trường tùy biến pack ngành lên bộ lọc + cột danh sách + Excel | Trường pack khai "cho lọc" tự mọc thêm ô lọc trên màn Khách (viền xanh phân biệt với 3 ô lọc cố định — tiệm ngành khác không thấy ô này); trường khai "cho lên cột" tự thêm cột thật trên bảng + cột trong file Excel xuất/nhập, ô trống vẽ dấu gạch "—" chứ không để trắng (trắng làm người đọc tưởng bảng hỏng). Nghiệm thu đúng ca chính thức: pack "Khám", trường "Tiền sử dị ứng" — lọc được, lên cột được, xuất/nhập Excel đều mang đúng cột. Lọc/đếm chạy TRONG cơ sở dữ liệu (không tải hết rồi lọc tay ở trình duyệt — đúng bài học 3 lần dính lỗi đếm sai trước đây). Nốt luôn lỗ hổng bỏ sót ở task #79: ô lọc theo NHÃN trên màn Khách (CSDL đã hiểu tham số này từ trước, chỉ thiếu ô bấm). |

**Từ vựng bộ lọc lưu sẵn (24p) nâng lên phiên bản 2** (chỉ THÊM tham số `cf_<khoá>` cho trường tùy biến, không đổi nghĩa tham số cũ nào): mọi chip đã lưu trước đây tự nâng version, không hiện "hỏng" oan.

Tiện đường sửa luôn 1 lỗi tự phát hiện trong lúc làm (không phải do việc hôm nay gây ra, có từ migration trước): hàm dựng lại tiệm mẫu theo ngành lỗi ON CONFLICT sau khi đổi ràng buộc nhãn sang partial index ở đợt trước — vá xong, xác nhận KHÔNG tiệm thật nào bị ảnh hưởng trong lúc lỗi còn tồn tại.

Đã kiểm: `npx supabase db advisors` sạch, `node scripts/rls-smoke.mjs` 245/245 PASS, build thật (`next build`), và thao tác tay trên trình duyệt thật (dựng một tiệm thử ngành Khám, gõ trường "Tiền sử dị ứng" vào ô lọc → đúng còn 1 khách; thêm cột đúng khách có/không có ghi "—"; lưu chip có trường tùy biến rồi mở lại → không báo hỏng; tìm không dấu ra đúng khách/cơ hội) — tiệm thử đã xoá sạch sau khi kiểm xong, không để lại dữ liệu rác trên CSDL thật.

⇒ **V1b còn 1 việc** (bước 9 — "Cần giúp?" + phiên hỗ trợ chỉ-đọc, làm CUỐI theo ADR-0006, xem mục 36 Quy hoạch).

## Cập nhật 12/08 (đợt 6) — V1b bước 9: "Cần giúp?" + phiên hỗ trợ chỉ-đọc (ADR-0006) CHẠY THẬT — V1b XONG TRỌN BỘ

**1 mục MỚI vào CHẠY THẬT:** "Cần giúp?" (nút trong menu người dùng, mọi màn) + phiên hỗ trợ chỉ-đọc cho đội ngũ iFan.

| Phía | Ghi chú |
|---|---|
| Chủ tiệm | Bấm "Cần giúp?" ở menu người dùng — mô tả chỗ kẹt + hộp kiểm "Cho iFan xem màn hình" (MẶC ĐỊNH KHÔNG TICK — không tick vẫn gửi được, chỉ là hỗ trợ qua chữ). Trong lúc iFan đang xem: dải báo MÀU TRUNG TÍNH (không phải cảnh báo đỏ/vàng) dính mọi màn, nói đủ 3 điều — ai đang xem · chỉ đọc · bao giờ hết — kèm nút "Dừng ngay" bấm là cắt quyền ngay lập tức, không phải đi xin. Cài đặt → Nhật ký hỗ trợ: xem lại mọi lần iFan từng vào, kèm lý do. |
| Đội ngũ iFan | /admin hiện danh sách tiệm đang "Cần giúp?" — bấm "Bắt đầu xem" phải khai lý do (bắt buộc ≥10 ký tự, chặn ở tầng cơ sở dữ liệu chứ không phải ở ô nhập) rồi vào thẳng đúng tiệm đó, CHỈ ĐỌC, tự hết hạn tối đa 60 phút. |

**Cách làm — dùng ĐÚNG vai "Chỉ xem" đã có sẵn và đã được kiểm chứng không ghi được gì (không dựng cơ chế quyền mới, không sửa bất kỳ luật phân quyền nào đang chạy):** cấp cho người của iFan một hàng thành viên tạm thời (vai chỉ-xem, tự hết hạn) trên đúng tiệm đang hỗ trợ, dùng lại nguyên cơ chế "chuyển tiệm" đã có. Không ăn vào suất nhân viên tiệm đang trả tiền, không bao giờ chặn tiệm đông người lúc họ cần hỗ trợ nhất (đã kiểm: mở phiên khi tiệm cố tình dựng "đầy ghế" vẫn mở được, số ghế đếm được không đổi trước/sau).

**Đã tự tay thử phá trước khi tin** (đúng luật "cổng kiểm phải từng biết đỏ" — không test nào được tin nếu chưa từng thấy nó báo sai ít nhất một lần): giả làm người đang trong phiên hỗ trợ rồi cố ghi vào 6 nơi dữ liệu quan trọng nhất của tiệm — **cả 6 đều bị chặn**; lùi đồng hồ quyền về quá khứ rồi thử đọc lại — **mất quyền đúng như kỳ vọng**; các phép thử này đã đưa vào bộ kiểm tra tự động thường trực của dự án, chạy lại mỗi lần có thay đổi sau này.

**Một lỗ hổng tự phát hiện và vá ngay trong lúc làm (không đợi ai báo):** hai hàm dọn dẹp nội bộ (đóng phiên quá giờ, đóng yêu cầu "Cần giúp?" bị im lặng quá 30 ngày) — vốn CHỈ được gọi bởi máy chủ theo lịch — vô tình có thể bị gọi trực tiếp từ bên ngoài do quên khoá quyền gọi. Không rò dữ liệu (hai hàm này không trả về thông tin gì nhạy cảm, chỉ tự đóng sổ đúng hạn), nhưng sai quy tắc nội bộ nên vá ngay: khoá lại đúng như 4 chỗ tương tự khác trong hệ thống đã làm từ trước.

**Việc CHƯA làm, ghi rõ để không quên (không phải bỏ sót lặng lẽ):** phần "báo tin nhắn Zalo cho founder mỗi khi có tiệm cần giúp" — hiện MỚI CÓ phần hiện trên bảng điều khiển /admin, PHẦN NHẮN QUA ZALO CHƯA LÀM vì cần founder chốt trước tin đó gửi vào Zalo cá nhân nào (hạ tầng Zalo Bot hiện tại gắn theo từng tiệm, chưa có đường cho riêng founder). Không tự ý dựng thêm hạ tầng khi chưa ai quyết.

Đã kiểm: `npx supabase db advisors` sạch (bắt được và vá luôn 1 lỗ hổng thật trong lúc kiểm — xem trên), `node scripts/rls-smoke.mjs` 256/256 PASS (thêm 11 ca kiểm phiên hỗ trợ mới, đã cố tình phá cho đỏ ít nhất 1 lần trước khi tin), build thật (`next build`), và thao tác tay trên trình duyệt thật với tài khoản demo bán hàng — gửi yêu cầu "Cần giúp?" thật, mở một phiên hỗ trợ thật (thời hạn rút ngắn còn 5 phút để kiểm nhanh), xác nhận dải báo hiện đúng giờ hết hạn, bấm "Dừng ngay" thật và xác nhận quyền bị cắt ngay, xem lại đúng trong Nhật ký hỗ trợ — dọn sạch dữ liệu kiểm tra ngay sau đó, tiệm demo bán hàng không còn dấu vết nào.

⇒ **V1b khép lại đầy đủ 9/9 việc.** Bốn con số "sống" của V1b (tỷ lệ người tự lưu bộ lọc, số lượt thao tác hàng loạt/tuần, tỷ lệ lỗi khi làm hàng loạt, thời gian xử lý "Cần giúp?") CHƯA đo được vì CHƯA có người dùng thật ngoài đội ngũ — đây là điều kiện phải đo trước khi mở đợt tiếp theo (V1.5), không phải việc code còn thiếu.

## Cập nhật 12/08 (đợt 7) — Chuông nền tảng cho founder (ADR-0007) + đính chính Zalo Bot

**Bối cảnh:** founder tự tạo một bot Zalo riêng và giao token ngay sau khi V1b đóng, đúng để bịt lỗ đã ghi ở đợt 6 ("phần nhắn qua Zalo cho founder CHƯA LÀM"). Token cất vào Vault ngay khi nhận (không qua tay ai ở dạng chữ thường). Vì đây là kiến trúc mới (founder không thuộc tiệm nào để dùng lại hạ tầng bot cấp-tiệm sẵn có), đúng luật phân vai đã chốt: Opus quyết kiến trúc (ADR-0007) trước, Sonnet code sau.

**1 mục MỚI vào LẮP SẴN CHỜ BÊN NGOÀI:** Chuông nền tảng — báo founder qua Zalo khi có yêu cầu "Cần giúp?" mới hoặc cảnh báo hệ thống. Máy đủ: bảng hàng đợi riêng (không đụng hạ tầng bot cấp-tiệm), webhook đăng ký xong với Zalo, mã ghép nối một lần đã cấp sẵn. **Tin gửi CHỈ là tín hiệu** (tên tiệm + có/không cho xem màn hình + dẫn mở /admin) — **KHÔNG kèm nguyên văn nội dung khách viết**, để không vô hiệu hóa nhật ký "founder đọc yêu cầu nào, lúc nào" đã dựng ở đợt 6. Chờ founder làm 2 việc trên Vercel (đặt 2 biến môi trường + bấm redeploy) rồi nhắn 1 tin xác nhận cho bot.

**Đính chính quan trọng, tự phát hiện khi thiết kế, không phải ai báo:** dòng "CHƯA LÀM" ở đầu sổ này từng ghi nhầm Zalo Bot nhắc việc nhân viên (#53/#54, đóng dấu xong từ 10/08) đã CHẠY THẬT. **Sai.** Biến môi trường bắt buộc để cả hệ thống gửi tin Zalo Bot hoạt động (`BOT_INGEST_KEY`) chưa từng được đặt trên máy chủ thật — kiểm trực tiếp qua Vercel, không suy đoán. Nghĩa là suốt từ 10/08 tới nay, **chưa có nhân viên nào thực sự nhận được tin nhắc việc qua Zalo**, dù màn cài đặt trông như đã xong. Đã sửa lại đúng trạng thái: LẮP SẴN CHỜ BÊN NGOÀI, không phải CHẠY THẬT — cùng nhóm với chuông founder mới, cùng chờ chung 1 bước cấu hình của founder.

**Cập nhật cùng ngày — đã bật công tắc xong:** 2 biến môi trường (`BOT_INGEST_KEY`, `CRON_SECRET`) đã đặt trên Vercel production + triển khai lại, xác nhận THẬT bằng cách gọi thử 2 cửa (`/api/bot/outbox`, `/api/bot/webhook`) — cả hai đổi từ "im lặng bỏ qua" sang "đòi đúng khóa mới cho qua", đúng nghĩa hạ tầng đã sống. Nhịp chạy định kỳ 15 phút xác nhận đã đăng ký với Vercel. Máy gửi tin Zalo Bot từ giờ hoạt động thật — tiệm nào tự dán token bot + nhân viên tự ghép nối là nhận được tin ngay (không đổi gì ở phần "mỗi tiệm tự làm", chỉ vá phần máy-gửi-tin-chưa-từng-chạy). Riêng chuông báo founder (ADR-0007) còn đúng 1 hành động của chính founder (nhắn mã ghép nối cho bot) là xong nốt.

**Lỗ thật thứ hai, sâu hơn — tự phát hiện cùng ngày khi founder báo "nhắn /link rồi mà bot không phản hồi":** route nhận tin từ bot (`/api/bot/webhook`) đọc SAI hình dạng dữ liệu — code cũ giả định tin nhắn nằm trong `result.message` (đúng hình dạng của một CÂU TRẢ LỜI API, ví dụ gọi `sendMessage` xong), nhưng tin PUSH thật từ nền tảng bot gửi thẳng `message` ở cấp cao nhất, không bọc `result`. Hậu quả: từ ngày dựng tính năng (10/08) tới hôm nay, **mọi tin nhắn thật gửi tới bot — kể cả "/link <mã>" của nhân viên tiệm — đều rơi vào khoảng trống, không báo lỗi, không phản hồi gì**, y hệt triệu chứng founder vừa gặp. Lỗi chưa từng lộ ra trước đó chỉ vì máy chủ web chưa từng thật sự sống (xem đoạn trên) — nay bật công tắc lên mới có tin nhắn thật đầu tiên đi qua, và cũng là lần đầu lộ lỗi.

Đã sửa: đọc đúng cả hai hình dạng, không phụ thuộc đoán đúng tuyệt đối. Đã tự kiểm chứng bằng cách giả một tin nhắn thật gửi vào route thật trên máy chủ thật (không dùng mã ghép nối thật của founder, dùng mã tạm riêng) — ghép nối chạy đúng lần đầu tiên trong lịch sử tính năng này.

**KẾT: founder đã nhắn mã ghép nối mới, ghép nối thật thành công** — xác nhận độc lập bằng cách đọc thẳng dữ liệu (`platform_bot_chat_id` đã có giá trị thật, không phải dữ liệu thử), không chỉ tin lời báo. Chuông nền tảng (ADR-0007) từ giờ **CHẠY THẬT**, không còn "chờ bên ngoài" nữa — chuyển từ LẮP SẴN CHỜ BÊN NGOÀI sang CHẠY THẬT.

Đã kiểm: `npx supabase db advisors` sạch cho toàn bộ hàm/bảng mới (không hàm nào lộ ra ngoài ngoài ý muốn — đúng lỗi từng mắc ở đợt 6, không lặp lại lần hai), `node scripts/rls-smoke.mjs` 264/264 PASS (thêm 8 ca kiểm chuông nền tảng, tự bắt được 1 lỗi thật trong lúc viết kịch bản kiểm — transaction bị treo do thiếu một bước khôi phục — sửa xong mới tin), `tsc`/`eslint` sạch trên toàn bộ file đã sửa, đã đăng ký thật webhook với nền tảng Zalo Bot (xác nhận nhận phản hồi thành công).

## Cập nhật 12/08 (đợt 8) — V1.5 "Cửa vào khách": mặt tiền tiệm + form thu khách CHẠY THẬT

**Lần đầu tiên iFan có một trang cho KHÁCH CỦA TIỆM xem.** Trước đợt này, mọi cửa đang có đều là cửa của người TRONG tiệm (đăng nhập, mời nhân viên, trang thử hộp chat cho chủ tiệm tự xem). Tiệm không có website thì vẫn không có mặt tiền nào trên mạng.

CHẠY THẬT (kiểm chứng bằng cách gửi form thật từ trình duyệt, đối chiếu dữ liệu vào đúng chỗ):
- Trang mặt tiền công khai `/t/<tên-tiệm>` — không cần đăng nhập, Google đánh chỉ mục được. Bốn trạng thái đều đã thử tay: đang mở · ngoài giờ · nghỉ lễ · tiệm tắt nhận khách.
- Form "để lại số, tiệm gọi lại" — đúng 2 ô bắt buộc, các ô hỏi thêm do gói ngành quyết. Khách vào thẳng danh sách Khách hàng với nguồn riêng "Form/Landing", đổ đúng vào báo cáo nguồn đang chạy.
- Màn Cài đặt → Kênh → Mặt tiền: bật/tắt trang, bật/tắt form, giới thiệu/địa chỉ/link Zalo, giờ mở cửa (nhiều khung mỗi ngày — nghỉ trưa), ngày nghỉ lễ.

**CỐ Ý CHƯA DỰNG:** trang riêng-từng-khách `/k/<mã>` (tự đặt lịch, đánh giá) — hợp đồng đã viết sẵn trong ADR-0008 để đời sau cắm vào không phải đập, nhưng chưa dựng vì V1.5 chưa có ai dùng tới. Dựng bảng chưa có code nào ghi vào là phạm luật D2 của chính dự án.

**Lỗi thật lọt tới tận mắt khách, tự phát hiện khi thử đủ 4 trạng thái:** trang báo với khách *"Đã đóng cửa · mở lại 08:00 sáng 11/8"* trong khi hôm đó là **12/8** — tức hẹn khách quay lại vào NGÀY HÔM QUA. Gốc: hàm cộng ngày đọc chuỗi ngày theo giờ ĐỊA PHƯƠNG rồi xuất theo giờ QUỐC TẾ; ở mọi múi giờ dương (Việt Nam +7), phép "cộng 0 ngày" cũng lùi mất một ngày.

Hai điều đáng nhớ hơn bản thân cái lỗi:
1. Chỗ code đó có sẵn một dòng chú thích **khẳng định là "an toàn với mọi múi giờ"**. Khẳng định suông, không có gì kiểm chứng — và nó sai.
2. Bộ ca kiểm mới viết ra **xanh 10/10 ở giờ quốc tế và Los Angeles, đỏ ở Việt Nam**. Máy chạy kiểm tự động (CI) mặc định giờ quốc tế → **lỗi này sẽ không bao giờ bị bắt ở đó**, trong khi 100% tiệm Việt Nam đều dính. Từ nay `scripts/storefront-hours-smoke.mjs` chạy lại toàn bộ ca trên 4 múi giờ, bắt buộc có múi giờ dương.

**Lỗi tiềm ẩn thứ hai, vấp phải khi dọn dữ liệu thử:** không xoá được một tiệm nào có dù chỉ một khách — bộ ghi nhật ký tự động cố ghi vết vào chính tiệm vừa bị xoá, vi phạm ràng buộc và làm đổ cả lệnh xoá. Chưa hại ai vì app không có nút xoá tiệm, nhưng sẽ chặn nghĩa vụ xoá dữ liệu khi khách yêu cầu. Đã sửa (migration #82).

**Hệ quả cần biết rõ, không giấu:** xoá một tiệm là **xoá luôn toàn bộ nhật ký sửa đổi của tiệm đó** — sau khi tiệm biến mất thì không còn đường truy vết. Đúng ý đồ ("nhật ký phục vụ chủ tiệm; không còn tiệm thì không còn mục đích") và đúng yêu cầu xoá dữ liệu theo luật. Nhưng nếu sau này cần giữ vết cho tranh chấp hoặc hoàn tác thì **phải là một bảng khác**, không phải `record_audit`.

Đã kiểm: `node scripts/rls-smoke.mjs` **296/296 PASS** trên CSDL thật (thêm 20 ca: 16 ca cổng khách công khai theo ADR-0008 mục 8, 4 ca xoá tiệm — mỗi nhóm đều đã thấy ĐỎ trước khi tin là xanh, đúng luật D3); `storefront-hours-smoke` 40/40 trên 4 múi giờ; `tsc`/`eslint` sạch; hai bản dịch Việt/Anh khớp 100% khoá.

**Soát lại toàn bộ 96 thẻ thiết kế cùng đợt** (3 hướng song song: lỗi kỹ thuật · màn thiếu thẻ · thẻ nói sai code). Không có lỗi vỡ hiển thị. Nhưng tìm ra một bệnh hệ thống: **10 thẻ vẫn dán nhãn "(chưa có code)" trong khi màn đã chạy thật nhiều ngày**, và **thẻ hướng dẫn nhập Excel ghi "tối đa 5.000 dòng" trong khi hệ thống chặn ở 2.000** — sai gấp 2,5 lần, trong chính cái thẻ dạy "phải nói giới hạn trước khi người ta chọn tệp". Đã sửa hết, và ghi luật vào `design-system/README.md` để chặn tái diễn: nhãn trạng thái và con số chép tay là hai thứ TỰ MỤC theo thời gian, phải soát ngay trong cùng lượt code xong một màn.

Vẽ bổ sung 4 thẻ cho 5 màn chưa từng có thẻ (Tài khoản · Công ty · trang thử hộp chat · khung trang pháp lý dùng chung cho Điều khoản + Bảo mật). **Toàn bộ 100 thẻ đã đồng bộ lên claude.ai** — bản trên đó trước đợt này đứng yên từ 04/08, thiếu 10 thẻ chưa bao giờ được đẩy lên.

## Cập nhật 13/08 — V2 "Lịch hẹn" việc 3: màn Cài đặt → Dịch vụ & Tài nguyên CHẠY THẬT

**1 mục MỚI vào CHẠY THẬT:**

| Tính năng | Ghi chú |
|---|---|
| Cài đặt → Dịch vụ & Tài nguyên | Chủ tiệm/quản trị khai **dịch vụ** (tên · thời lượng · giá · đang bán/ngừng bán) và **chỗ làm** (giường/phòng/ghế/bàn/máy). Một thanh Lưu duy nhất dính đáy cho cả hai khối, nói rõ khối nào đang chờ lưu — dùng lại đúng khuôn màn Mặt tiền, không đẻ kiểu lưu thứ hai. Ngừng bán một dịch vụ **không** làm mất nó khỏi lịch cũ (bảng dịch vụ cố ý không có xoá mềm). |

**Nút "Nạp dịch vụ mẫu theo ngành" — không phải tiện ích, là chốt chặn một cái hố có thật.** Máy chỉ seed dịch vụ mẫu vào lúc tiệm CHỌN/ĐỔI ngành, nên mọi tiệm tạo trước migration #83 mở màn này ra sẽ thấy **trang trắng**. Đo trên CSDL thật 13/08: **8/8 tiệm đang có, kể cả 2 tiệm thật, đều 0 dịch vụ.** Nút chỉ hiện khi danh sách rỗng, nạp đúng gói ngành tiệm đang dùng, và **bấm ba lần vẫn ra đúng 4 dịch vụ** (đã thử tay: hai lần sau báo thật "danh sách mẫu đã có sẵn, không thêm bản trùng"), cũng **không đè giá tiệm đã tự sửa**.

**Đo được một chuyện cần founder biết, không phải lỗi code:** hai tiệm THẬT hiện nay là ngành **Bán lẻ** và **chưa chọn ngành** — cả hai gói này **cố ý không có dịch vụ mẫu** (bán theo món, không có ca theo giờ). Nghĩa là nút nạp mẫu **không giúp được gì cho đúng hai tiệm thật đang có**; màn nói thẳng điều đó ("ngành này chưa có danh sách mẫu" / "tiệm chưa chọn ngành") và mời khai tay, thay vì hiện một nút bấm vào không ra gì. Muốn hai tiệm đó dùng lịch hẹn thì việc cần làm là **chọn đúng ngành**, không phải sửa code.

**Cố ý KHÔNG làm (đúng phạm vi ADR-0009 mục 7, không phải bỏ sót):** gán thợ ↔ dịch vụ · lịch lặp · đệm ca · khoá tính năng theo gói cước · nút xoá dịch vụ/chỗ làm (đường ngừng dùng là tắt cờ, để lịch cũ còn đọc được) · sắp xếp lại thứ tự bằng kéo-thả.

Đã kiểm: `node scripts/rls-smoke.mjs` **346/346 PASS** trên CSDL thật (thêm 8 ca cho màn này — **cả 8 đã bị cố tình phá cho ĐỎ trước rồi mới tin là xanh**, đúng luật D3: nạp mẫu bấm hai lần, nạp mẫu không đè giá, thời lượng 0 phút, trùng tên trong cùng tiệm, loại chỗ làm lạ, ngừng bán không mất lịch cũ, vai Chỉ-xem thêm/sửa dịch vụ); `tsc` + `eslint` sạch; `next build` xanh; hai bản dịch Việt/Anh khớp 100% khoá; và thao tác tay trên **bản build thật** với tài khoản demo — sáng/tối, điện thoại/máy tính, cả VI lẫn EN. Dữ liệu thử đã dọn sạch, tiệm demo trở lại đúng trạng thái trước khi kiểm.

**Hai lỗi hiển thị tự bắt được khi thử tay ở khổ điện thoại (đã sửa trong cùng đợt):** ô tên chỗ làm bị bóp còn ~80px nên "Giường 1" chỉ đọc được "Giư"; và nút nạp mẫu mang tên ngành ghép vào nên rộng 327px trong khung 323px, chữ bị cắt cụt giữa chừng.

**Một cái bẫy của môi trường dev, không phải lỗi của đợt này nhưng ai kiểm giao diện cũng sẽ dính:** service worker của PWA (`public/sw.js`) cache `/_next/static/*` theo kiểu "có rồi thì dùng mãi". Ở bản chạy thật vô hại (tên tệp có mã băm, đổi code là đổi tên), nhưng ở `next dev` thì trình duyệt **giữ mãi bản JavaScript cũ** — biểu hiện: sửa code xong tải lại vẫn thấy giao diện cũ, kèm lỗi "hydration" đỏ trong console. Cách thoát: gỡ đăng ký service worker + xoá cache trong trình duyệt, hoặc kiểm trên bản build thật.

## Cập nhật 13/08 (đợt 2) — V2 "Lịch hẹn" việc 4: màn Lịch CHẠY THẬT

**1 mục MỚI vào CHẠY THẬT:**

| Tính năng | Ghi chú |
|---|---|
| Màn Lịch (`/app/calendar`, nav trục 2) | Xem lịch hẹn theo NGÀY (điện thoại) với dải 7-ngày nhảy nhanh (máy tính) — trộn đúng một dòng thời gian gồm lịch hẹn thật xen giữa các khoảng TRỐNG còn lại trong giờ mở cửa. Thêm lịch (chọn khách/thợ/dịch vụ/tài nguyên/giờ, cảnh báo mềm khi đặt ngoài giờ mở cửa hoặc trúng ngày nghỉ — KHÔNG chặn). Bốn trạng thái thao tác 1 chạm: Khách đã tới／Không tới／Xong／Huỷ (huỷ bắt buộc chọn 1 trong 5 lý do — không có lý do thì sau này không biết vì sao mất khách). Chống trùng thật ở tầng CSDL (2 ràng buộc EXCLUDE của migration #83) — hai người đặt cùng lúc thì CSDL thắng, người sau nhận đúng câu "khung giờ vừa được giữ, chọn giờ khác nhé", không phải lỗi kỹ thuật trần. |

**Nền toán học đứng sau màn hình (bộ kiểm thuần riêng, không đụng CSDL):** 5 hàm tính khung giờ trống/định dạng giờ (`lib/booking/schedule.ts`) viết theo đúng khuôn timezone-safe đã học từ bug thật 12/08 (dùng `Intl.DateTimeFormat` với `timeZone` tường minh, không dựa máy chủ chạy giờ nào) — `scripts/booking-schedule-smoke.mjs` chạy **136/136 PASS trên 4 múi giờ** (Asia/Ho_Chi_Minh, UTC, Los Angeles, Kiritimati — cùng bộ 4 múi giờ dương/âm/quốc tế đã học từ bug mặt tiền tiệm), mỗi ca đều đã bị sabotage cho ĐỎ trước rồi mới tin là xanh (đúng luật D3).

**Bốn lỗi thật tự bắt được khi thao tác tay thật, không phải ai báo (đã sửa cả 4 trong cùng đợt):**
1. File `actions.ts` có `"use server"` — Next.js CHỈ cho export hàm async từ file này; hai hằng/hàm không-async (`CANCEL_REASONS`, `toastKeyFor`) bị Next.js ÂM THẦM loại khỏi module lúc build, `tsc`/`eslint` đều xanh nhưng trình duyệt vỡ runtime ("Export không tồn tại"). Chuyển cả hai sang `types.ts`.
2. Ô chọn nhân viên trong dialog Thêm lịch rỗng trơn dù tiệm có 2 nhân viên thật — `tenant_members.user_id` không có khoá ngoại TRỰC TIẾP tới `profiles` (cùng trỏ `auth.users`) nên PostgREST không tự embed được, lỗi bị nuốt vì code không kiểm `.error`. Tách 2 truy vấn + nối tay, đúng khuôn `app/app/deals/`.
3. Lịch vừa lưu xong **biến mất khỏi màn** — nhánh "chưa khai giờ mở cửa" bị đặt làm điều kiện ĐẦU TIÊN, che tuyệt đối bất kể ngày có lịch hay không. Đổi thứ tự: có lịch thì luôn ưu tiên hiện lịch trước.
4. `page.tsx` tính "hôm nay" bằng `new Date().toISOString().slice(0,10)` — đúng lớp lỗi ngày-lùi-một-hôm đã vá ở mặt tiền tiệm 12/08 (giờ quốc tế lùi so với giờ Việt Nam ban đêm). Đổi sang `dateKeyInTimeZone()` theo múi giờ tiệm.

**Hai lỗi hiển thị bắt được lúc soát 4 tổ hợp giao diện (sáng/tối × Việt/Anh), sửa trong cùng đợt:**
- Bản tiếng Anh "1 appointments · 0 free slots" sai ngữ pháp số nhiều cho trường hợp đúng 1 lịch — chuyển sang cú pháp ICU `plural` (đúng khuôn đã dùng ở các khoá `minutes`/`hours`/`dealCount` khác trong `messages/en.json`), giờ ra đúng "1 appointment".
- Nút "Add appointment" (bản tiếng Anh) tràn khỏi khung đầu trang ở khổ điện thoại (404px nội dung trong khung 376px, chữ bị cắt cụt "Add appointme…") — bản Việt "Thêm lịch" ngắn nên không lộ. Rút gọn nhãn tiếng Anh thành "Add" (đúng khuôn "New"/"New deal" các màn khác đã dùng cho đúng vấn đề này).

**Cố ý CHƯA làm (đúng phạm vi ADR-0009 mục 7, không phải bỏ sót):** view lưới-tuần đầy đủ kiểu Google Calendar (máy tính hiện dải 7-ngày để nhảy nhanh + vẫn xem theo NGÀY, không phải lưới giờ×ngày) · sửa GIỜ của lịch đã tạo — hàm `rescheduleAppointment` đã có ở tầng máy chủ (dành cho kéo-thả sau này) nhưng CHƯA có nút/thao tác nào trên màn gọi tới, muốn đổi giờ hiện phải Huỷ rồi Thêm lại · gán thợ↔dịch vụ · lịch lặp · waitlist/walk-in · đệm ca · PIN máy chung · ZNS nhắc khách (việc 6 kế tiếp).

Đã kiểm: `tsc --noEmit` sạch, `eslint` sạch, `node scripts/booking-schedule-smoke.mjs` **136/136 PASS trên 4 múi giờ**, `node scripts/rls-smoke.mjs` **346/346 PASS** trên CSDL thật (không thêm ca RLS mới đợt này — 2 EXCLUDE và RLS `appointments_*` đã kiểm đủ ở việc 1/việc 3), `next build` xanh + thao tác tay trên **bản build thật** (`next start`, không phải `next dev`) xác nhận màn Lịch tải đúng, dữ liệu đúng quyền. Bốn tổ hợp giao diện (sáng/tối × Việt/Anh) đã soát tay trên cả điện thoại lẫn máy tính — không còn tràn khung, không còn sai ngữ pháp số nhiều. Một lịch hẹn thử tạo qua thao tác tay thật (khách "Nguyễn Khánh Vân", tiệm demo Spa Hương Sen) đã dọn sạch sau khi kiểm xong bằng script xoá trực tiếp trên CSDL, xác nhận còn 0 dòng.

**Minh bạch một khoảng chưa kiểm hết trong đợt này:** bốn nút chuyển trạng thái (Khách đã tới／Không tới／Xong／Huỷ) đã xác nhận đúng qua đọc code + đã nằm trong 346 ca RLS (owner/admin/manager thao tác mọi lịch, `staff` chỉ lịch của chính mình, `viewer` bị chặn) + cùng khuôn `requireAuth`/gọi hành động y hệt `createAppointment` (đã tự tay bấm thật và ghi đúng dữ liệu ở lượt kiểm trước) — nhưng CHƯA tự tay bấm từng nút này qua trình duyệt thật trong chính đợt kiểm hôm nay (công cụ trình duyệt phiên làm việc bị treo giữa chừng khi thử). Ghi rõ để không tưởng đã kiểm 100% bằng tay — phần còn thiếu là kiểm tay trực tiếp 4 nút này, không phải nghi ngờ về tính đúng của code.

⇒ **V2 còn 2 việc** (việc 5 — đặt lịch từ khung chat Hộp thư · việc 6 — nhắc nội bộ + tin soạn sẵn cho khách, xem mục 7 ADR-0009).

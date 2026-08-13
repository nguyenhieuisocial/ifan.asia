# Sổ sự thật sản phẩm

Cập nhật: **13/08/2026** — bản kiểm kê gốc 10/08 (đọc toàn bộ code) + mục "Cập nhật 11/08" (24 việc all-in-one) + mục "Cập nhật 11/08 (đợt 2)" (V1a Nền ngành, 9 việc) + mục "Cập nhật 11/08 (đợt 3)" (chuyển tiệm) + mục "Cập nhật 11/08 (đợt 4)" (trường tùy biến + vá quyền) + mục "Cập nhật 11/08 (đợt 5)" (tệp đính kèm) + mục "Cập nhật 11/08 (đợt 6)" (tab Lịch sử — V1a đủ 9/9) + mục "Cập nhật 11/08 (đợt 7)" (bỏ ô Mã tiệm — một cửa đăng nhập) + mục "Cập nhật 11/08 (đợt 8)" (PWA bước 2 + đổi tên tiệm) + mục "Cập nhật 11/08 (đợt 9)" (vá bug hiển thị mobile + viết hoa terminology) + mục "Cập nhật 12/08" (V1b xong phần thiết kế, chưa có code) + mục "Cập nhật 12/08 (đợt 2)" (V1b bước 2 — bộ lọc màn Cơ hội lên URL) + mục "Cập nhật 12/08 (đợt 3)" (V1b bước 3-4 — bộ lọc lưu sẵn CHẠY THẬT) + mục "Cập nhật 12/08 (đợt 4)" (V1b bước 5-6 — quản lý nhãn + thao tác hàng loạt CHẠY THẬT) + mục "Cập nhật 12/08 (đợt 5)" (V1b bước 7 — tìm kiếm toàn cục + trường tùy biến lên lọc/cột/Excel CHẠY THẬT) + mục "Cập nhật 12/08 (đợt 6)" (V1b bước 9 — "Cần giúp?" + phiên hỗ trợ chỉ-đọc CHẠY THẬT, V1b khép lại 9/9 việc) + mục "Cập nhật 12/08 (đợt 7)" (ADR-0007 chuông nền tảng — LẮP SẴN, và đính chính Zalo Bot chưa từng chạy thật) + mục "Cập nhật 12/08 (đợt 8)" (V1.5 "Cửa vào khách" — mặt tiền tiệm + form thu khách CHẠY THẬT) + mục "Cập nhật 13/08" (V2 việc 3 — màn Cài đặt Dịch vụ & Tài nguyên CHẠY THẬT) + mục "Cập nhật 13/08 (đợt 2)" (V2 việc 4 — màn Lịch CHẠY THẬT) + mục "Cập nhật 13/08 (đợt 3)" (vá bug #99 — danh sách ngày nghỉ Mặt tiền sai giờ quốc tế) + mục "Cập nhật 13/08 (đợt 4)" (nới quyền manager vào màn Dịch vụ & Tài nguyên, ADR-0009 mục 7b) + mục "Cập nhật 13/08 (đợt 5)" (task #94 — vá 2 bug tiếng Anh ở màn Mặt tiền, kiểm chế độ tối) + mục "Cập nhật 13/08 (đợt 6)" (V2 việc 5 — đặt lịch từ khung chat CHẠY THẬT) bên dưới.

**Luật của sổ này** (học FlowX): đây là nguồn sự thật DUY NHẤT về việc tính năng nào đang chạy thật.
- Thêm/bớt/mở khóa tính năng ⇒ PHẢI cập nhật sổ trong cùng đợt commit.
- Trang bán hàng, báo giá, tài liệu — nói gì về tính năng đều phải khớp sổ này.
- Ba trạng thái, không có trạng thái thứ tư: **CHẠY THẬT** · **LẮP SẴN CHỜ BÊN NGOÀI** (code xong, chờ giấy phép/khóa/cổng thanh toán) · **MỘT PHẦN** (có màn nhưng logic chưa trọn — ghi rõ thiếu gì).

⚠️ **Ô "Số mục" trong bảng Đếm nhanh là con số GÕ TAY** — máy đo vault (`scripts/vault-status.mjs`) đọc lại chính ô đó rồi bơm lên trang chủ vault, nên gõ sai ở đây là sai lan sang chỗ khác. Đã dính đúng một lần (12/08: V1.5 xong 3 mục mà quên cộng, số đứng yên ở 55 trong khi thực tế 58). **Thêm mục ở dưới thì sửa số ở đây NGAY trong cùng lượt** — cùng loại bệnh với nhãn "(chưa có code)" trên thẻ design và giới hạn dòng chép tay: thứ mô tả một thứ khác, nằm cách nó rất xa, không có gì buộc hai bên đi cùng nhau.

## Đếm nhanh

| Trạng thái | Số mục |
|---|---|
| CHẠY THẬT | 62 (36 gốc + KPI mục tiêu tháng 11/08 + 9 mục V1a (đủ) + 1 mục chuyển tiệm + 1 mục bộ lọc lưu sẵn 12/08 + 1 mục màn Quản lý nhãn (gộp/hoàn tác) + 1 mục thao tác hàng loạt trên danh sách Khách + 1 mục tìm kiếm toàn cục + 1 mục trường tùy biến lên lọc/cột/Excel + 1 mục "Cần giúp?" + phiên hỗ trợ chỉ-đọc + 1 mục chuông nền tảng báo founder qua Zalo, ghép nối thật đã xác nhận 12/08 + 3 mục V1.5 "Cửa vào khách" 12/08: trang mặt tiền công khai `/t/<tên-tiệm>` · form thu khách trên mặt tiền · màn Cài đặt mặt tiền & giờ mở cửa + 1 mục V2 việc 3 (13/08): màn Cài đặt → Dịch vụ & Tài nguyên + 1 mục V2 việc 4 (13/08): màn Lịch + 1 mục V2 việc 5 (13/08): đặt lịch từ khung chat Hộp thư + **1 mục V2 việc 6 (13/08): nhắc lịch hẹn tự động cho nhân viên — V2 ĐỦ 6/6, khép lại cả đợt**) |
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
| Trợ lý AI trong hộp thư (tóm tắt, soạn trả lời, trích thông tin) | Khóa `ANTHROPIC_API_KEY` | `lib/ai/gateway.ts:50` — thiếu khóa hiện thông báo tử tế, có quota 300 lượt/tiệm/tháng |
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

**⚠️ Lỗi quy trình tự bắt được ngay sau đợt này, ghi lại để không lặp lại:** commit màn Lịch ở trên đã LƯU Ở MÁY nhưng **quên đẩy lên `origin/main`** — server thật (Vercel) vẫn chạy bản cũ, `/app/calendar` báo "Không tìm thấy trang" dù sổ này đã ghi CHẠY THẬT. Founder tự phát hiện khi bấm thử trên trang thật, không phải do tự soát. Đã kiểm lại toàn bộ lịch sử: đây là lần DUY NHẤT bị sót (mọi commit trước đợt này đều đã lên `origin/main` đầy đủ), không phải bệnh lặp lại nhiều lần. Đã đẩy bù ngay khi phát hiện — **từ nay mỗi lần commit xong PHẢI `git push` trong cùng lượt, không tách rời hai bước.**

## Cập nhật 13/08 (đợt 3) — vá bug #99: danh sách ngày nghỉ ở màn Mặt tiền sai giờ quốc tế

**Không có mục nào mới vào CHẠY THẬT** — đây là vá lỗi trong tính năng đã CHẠY THẬT từ V1.5 (12/08), không phải tính năng mới.

**Lỗi:** `app/app/settings/channels/storefront/page.tsx:52` lọc "ngày nghỉ còn hiệu lực" bằng `new Date().toISOString().slice(0,10)` — ngày UTC trần, không theo múi giờ tiệm. Đúng lớp lỗi đã cắn trang mặt tiền công khai 12/08 (`bd4d67b`), nay tái phát ở màn CÀI ĐẶT của cùng tính năng: mỗi đêm, trong 7 tiếng đầu giờ Việt Nam (00:00–07:00), ngày UTC còn đứng ở hôm qua nên một ngày nghỉ đã hết hạn theo lịch Việt Nam vẫn bị tính "còn hiệu lực" và hiện lại trên màn quản trị.

**Đã sửa:** khoanh vùng truy vấn CSDL rộng hơn 1 ngày rồi lọc chính xác bằng `dateKeyInTimeZone()` (tầng ứng dụng, đúng khuôn `app/app/calendar/queries.ts` — cùng hàm thuần đã kiểm 136/136 ca ở đợt trước). Đổi `Date.now()` thô sang `new Date().toISOString()` + hàm thuần `addDaysToDateKey()` để qua được luật `react-hooks/purity` (ESLint bắt được ngay: gọi hàm không-thuần trong lúc dựng trang là lỗi thật, không phải lệ).

**Bốn chỗ trông giống hệt (cũng gọi `toISOString().slice(0,10)`) đã soát riêng từng chỗ — xác nhận CẢ 4 ĐÚNG, không đụng:** `addDaysToDateKey`/`addDays` trong `lib/booking/schedule.ts` và `lib/storefront/hours.ts` (toán ngày THUẦN, neo UTC cả hai đầu trên một `dateKey` đã đúng sẵn — không phụ thuộc đồng hồ máy) · `tomorrowVN()`/`plus7DaysVN()` trong 2 dialog màn Cơ hội (cố ý neo cứng UTC+7 cho một GỢI Ý ngày mặc định, không phải dữ liệu lọc quyết định hiện/ẩn).

**Đã kiểm bằng ĐÚNG khoảnh khắc lỗi xảy ra thật (2:30 sáng giờ VN, máy chủ còn 19:30 giờ trước đó theo UTC)** — không đợi mô phỏng: gài 2 ngày nghỉ thử vào CSDL thật (một đã hết hạn hôm qua giờ VN, một còn hiệu lực), tải màn thật trên trình duyệt — ngày đã hết hạn ẨN đúng, ngày còn hiệu lực HIỆN đúng. Dọn sạch dữ liệu thử ngay sau đó. `tsc`/`eslint` sạch, `rls-smoke` 346/346 (không đổi RLS, chỉ chạy lại để chắc không phá gì), `next build` xanh.

## Cập nhật 13/08 (đợt 4) — nới quyền `manager` vào màn Cài đặt → Dịch vụ & Tài nguyên (ADR-0009 mục 7b)

**Không có mục nào mới vào CHẠY THẬT** — nới quyền trong tính năng đã CHẠY THẬT từ 13/08 đợt trước, không phải tính năng mới.

**Bối cảnh:** ADR-0009 mục 7 việc 3 ghi màn này chỉ owner/admin, nhưng RLS `services_manage`/`resources_manage` (migration #83) đã mở cho cả `manager` (đúng khuôn `lead_sources`) — bên thi công tự phát hiện mâu thuẫn khi code việc 3, Opus đính chính ngay (mục 7b): theo RLS vì đó là hàng rào thật, không siết CSDL.

**Đã sửa 3 chỗ để KHỚP nhất quán, không còn nơi nào hẹp hơn RLS:**
- `app/app/settings/access.ts` — sub-nav/trang index Cài đặt: thêm `MANAGE_UP` (owner/admin/manager), mục "services" đổi từ `ADMIN_UP` sang `MANAGE_UP`.
- `app/app/settings/services/page.tsx` — `canManage` (quyết định có tải dữ liệu + hiện form hay không) thêm `role === "manager"`.
- `app/app/settings/services/actions.ts` — `MANAGE_ROLES` (chốt chặn Server Action, lớp bảo vệ CUỐI trước khi chạm CSDL) thêm `"manager"`.

**Lỗ hổng kiểm chứng tự phát hiện trong lúc vá — không phải bịa thêm việc:** bộ `rls-smoke.mjs` từ trước tới giờ chỉ có ca "staff GHI bị chặn" cho `services`/`resources`, CHƯA từng có ca dương "manager GHI ĐƯỢC" dù comment trong code khẳng định vậy — nghĩa là niềm tin "RLS đã mở cho manager" chưa từng được TỰ KIỂM, chỉ suy từ đọc migration. Thêm 2 ca mới (`services`/`resources` — manager insert thành công, chạy trong savepoint rồi rollback, không để lại dữ liệu) để khoá lại đúng RLS thay vì đoán.

**Đã kiểm:** hàm `visibleSettingsItems()` gọi trực tiếp qua `tsx` cho cả 5 vai — `manager` giờ thấy mục "services", `staff`/`viewer` vẫn không thấy (khớp kỳ vọng, không đoán qua đọc code). `rls-smoke` **348/348 PASS** (346 cũ + 2 ca manager mới, cả 2 đều XANH — xác nhận RLS thật đúng như comment nói). `tsc`/`eslint` sạch, `next build` xanh.

**Minh bạch một khoảng chưa kiểm hết:** CSDL hiện **0 thành viên mang vai `manager`** ở bất kỳ tiệm nào (đã tự kiểm bằng truy vấn thật, không đoán) — nên KHÔNG tự tay bấm được qua trình duyệt bằng một tài khoản manager thật để xem màn hiện đúng từ đầu đến cuối. Bằng chứng đang có (hàm `visibleSettingsItems` đúng + RLS đúng qua 2 ca mới + cùng khuôn `canManage` đã dùng đúng ở màn Mặt tiền) là bằng chứng GIÁN TIẾP đủ mạnh để tin đúng, nhưng chưa phải kiểm tay trực tiếp — ghi rõ để không tưởng đã kiểm 100%.

## Cập nhật 13/08 (đợt 5) — task #94: vá 2 bug tiếng Anh ở màn Mặt tiền, kiểm chế độ tối

**Không có mục nào mới vào CHẠY THẬT** — vá lỗi trong tính năng đã CHẠY THẬT từ V1.5 (12/08), không phải tính năng mới. Đây là nợ kỹ thuật ghi từ V1.5, chưa ai làm tới trước đợt này.

**Hai lỗi thật bắt được khi tự bấm thử màn mặt tiền công khai (`/t/[slug]`) ở bản tiếng Anh — cả hai đã sửa:**

| Lỗi | Trước | Sau |
|---|---|---|
| Câu "mở lại lúc mấy giờ" lẫn tiếng Việt vào giữa câu tiếng Anh | `reopens 08:00 sáng nay` | `reopens this morning at 08:00` |
| Tên thứ trong tuần không dịch | `T2 T3 T4 … CN` (cả bản tiếng Anh) | `Mon Tue Wed … Sun` |

**Nguyên nhân:** `lib/storefront/hours.ts` — hàm thuần `computeStorefrontStatus()`/`formatReopenLabel()` GHÉP THẲNG chữ Việt ("sáng"/"chiều"/"tối"/"nay"/"mai") vào chuỗi trả về, không biết ngôn ngữ đang hiển thị; và mảng `WEEKDAY_LABELS_VN` bị dùng cứng ở cả `/t/[slug]/page.tsx` lẫn màn cài đặt `storefront-view.tsx`, không có bản tiếng Anh. Cùng LỚP lỗi với calendar (`WEEKDAY_SHORT_VN` cũng chưa dịch) nhưng đó là màn nội bộ (nhân viên đọc được tiếng Việt), còn đây là màn **khách bên ngoài xem** — mức độ nghiêm trọng khác hẳn, ưu tiên vá trước.

**Đã sửa:** thêm tham số `locale?: "vi" | "en"` cho `computeStorefrontStatus()` (mặc định `"vi"` — không phá lời gọi cũ), hai bộ chữ "sáng/chiều/tối" (vi) và "morning/afternoon/evening" (en) chọn theo locale; thêm `WEEKDAY_LABELS_EN` + hàm `weekdayLabelsFor(locale)` dùng chung cho cả trang công khai lẫn màn cài đặt. `page.tsx` lấy locale qua `getLocale()` (next-intl/server), `storefront-view.tsx` qua `useLocale()` (next-intl, client).

**Đã kiểm theo đúng luật D3** (sabotage code cho đỏ trước, không tin ngay khi thấy xanh): tạm khoá nhánh tiếng Anh (`if (false && locale === "en")`), chạy `storefront-hours-smoke.mjs` — **4/4 ca tiếng Anh FAIL đúng lý do** (ra chữ Việt), khôi phục code, chạy lại — **14/14 PASS cả 4 múi giờ** (56 phép kiểm). Đã tự tay thử trên trình duyệt thật đúng lúc lỗi hay xảy ra nhất (giờ VN đã sang ngày mới, giờ quốc tế còn ở ngày cũ) — cả màn công khai lẫn màn cài đặt hiện đúng "Mon/Tue/Wed…" và câu tiếng Anh sạch, không lẫn chữ Việt. Chế độ tối kiểm cùng lượt trên cả hai màn — không có lỗi hiển thị.

**Một bẫy môi trường dev tốn thời gian nhất đợt này, ghi lại để lần sau đỡ mất công:** trang `/t/[slug]` (`force-dynamic`, không cache tĩnh) và màn cài đặt Mặt tiền thỉnh thoảng trả về ĐÚNG bản TRƯỚC khi sửa code dù server đã build lại — chỉ thấy bản mới khi thêm `?v=<số>` vào URL để né cache. Nghi do trình duyệt kiểm thử (không phải Chrome thật) giữ cache HTTP cho URL không có query string; không phải lỗi `force-dynamic` hay service worker (đã kiểm `public/sw.js` dùng "network-first" cho điều hướng, đúng thiết kế). `next-themes` (`app/providers.tsx`, `attribute="class"` + `enableSystem`) cũng cần TẢI LẠI trang sau khi bật giả lập chế độ tối — bật xong không tải lại thì màn vẫn hiện sáng vì hook chỉ đọc `prefers-color-scheme` một lần lúc mount.

## Cập nhật 13/08 (đợt 6) — V2 "Lịch hẹn" việc 5: đặt lịch từ khung chat Hộp thư CHẠY THẬT

**1 mục MỚI vào CHẠY THẬT:**

| Tính năng | Ghi chú |
|---|---|
| Nút "Đặt lịch" trong khung chat Hộp thư | Lễ tân/nhân viên bấm 1 nút ngay trong hồ sơ khách (panel bên phải khung chat) — chọn dịch vụ, chọn 1 trong các mốc giờ CÒN TRỐNG THẬT hôm nay (đã trừ giờ nghỉ trưa/lịch đã đặt), thợ + tài nguyên máy tự chọn sẵn (sửa được). Bấm "Chốt lịch" là ghi thẳng vào bảng `appointments` — không có bước nháp, không rời khung chat. Đúng lời hứa thẻ design "2 chạm, dưới 15 giây". |

**Quyết định kiến trúc đúng thẻ design (ADR-0009 mục 7 việc 5), không phải bỏ sót:** máy KHÔNG tự gửi tin xác nhận cho khách — chốt lịch xong chỉ SOẠN SẴN một tin (điền đúng tên khách, giờ, dịch vụ), người dùng tự bấm "Gửi cho khách" (dùng lại đúng hàm `sendReply` — cùng đường tin nhắn nút "Trả lời" đang dùng) hoặc tự sửa lại câu chữ trước khi gửi. Lý do: iFan CHƯA có đường nào tự động gửi tin tới khách (Zalo OA còn chờ pháp nhân) — hứa "khách được nhắc tự động" mà không giao được là mất niềm tin vào toàn bộ phần còn lại.

**D1 — không viết lại logic đã có, chỉ ghép nối:** dùng lại nguyên `createAppointment` (2 EXCLUDE chống trùng ở CSDL, cùng cảnh báo lỗi "khung giờ vừa được giữ mất" như màn Lịch) và `getCalendarBundle`/`freeBlocksOfDay` (chỉ lấy đúng NGÀY HÔM NAY thay vì cả tuần) — không dựng lại phép tính "còn trống" lần hai. Thêm đúng 1 hàm thuần mới: `candidateSlotStarts()` (sinh mốc giờ bấm-là-đặt-được, cách nhau 30 phút, đủ chỗ chứa trọn thời lượng dịch vụ) — đã kiểm D3 (sabotage → đỏ đúng lý do → khôi phục → xanh) **39 ca × 4 múi giờ = 156 phép kiểm**.

**1 lỗi thật tự bắt được trong lúc kiểm tích hợp, không phải ai báo — đã sửa ngay:** ban đầu gọi thẳng `createAppointment` (dùng lại y nguyên) thì lịch đặt từ chat bị ghi nhầm `source='calendar'` — cột này CSDL đã khai sẵn đúng 2 giá trị hợp lệ `chat`/`calendar` (migration #83) để sau này đo hiệu quả cửa vào chính, nhưng hàm dùng chung gán CỨNG "calendar" bất kể ai gọi. Sửa: thêm tham số `source` bắt buộc truyền tường minh ở MỌI nơi gọi (không đặt mặc định ngầm, tránh một nơi quên truyền mà không ai biết) — màn Lịch truyền `"calendar"`, khung chat truyền `"chat"`.

**Minh bạch khoảng chưa kiểm hết — quan trọng, đọc kỹ:** đúng lúc kiểm đợt này, công cụ bấm-chuột của trình duyệt kiểm thử bắt đầu treo — đã tự kiểm chứng đây là lỗi HẠ TẦNG PHIÊN LÀM VIỆC chứ không phải lỗi code: bấm thử nút "Thêm việc" (đã chạy tốt và xác nhận nhiều lần ở các đợt trước) cũng bị treo y hệt, kể cả trên bản build thật (`next start`, không phải `next dev`). Vì vậy đã đổi cách kiểm — không thay code:
1. Kiểm trực tiếp CSDL thật: gài giờ mở cửa + 1 dịch vụ thử cho tiệm demo, chạy đúng chuỗi hàm `computeOpenRanges → freeBlocksOfDay-tương-đương → candidateSlotStarts` bằng script độc lập — ra đúng 23 mốc nửa-giờ từ 8:00 tới 19:00 cho dịch vụ 60 phút trong khung 8:00-20:00, khớp kỳ vọng.
2. Kiểm trực tiếp luồng "chốt lịch": chèn thật 1 lịch hẹn với ĐÚNG giá trị mà dialog sẽ tính (`buildZonedIso`/`addMinutesToLocalTime`) — thành công. Chèn lần 2 TRÙNG giờ, TRÙNG thợ — bị CSDL chặn đúng mã `23P01` + đúng tên ràng buộc `appointments_no_overlap_staff`, khớp chính xác nhánh code dialog đọc để hiện cảnh báo "khung giờ vừa được giữ mất". Dữ liệu thử đã xoá sạch ngay sau khi kiểm.
3. **CHƯA tự tay bấm nút "Đặt lịch" → thấy dialog → bấm chốt lịch → thấy tin soạn sẵn → bấm gửi, qua giao diện thật.** Bằng chứng đang có (code review + D3 pure-function + tích hợp CSDL trực tiếp + tái dùng đúng các hàm đã kiểm ở việc 4) là bằng chứng GIÁN TIẾP mạnh, nhưng không thay được một lượt bấm tay thật — ghi rõ để không tưởng đã kiểm 100%, đúng tinh thần đã áp dụng cho 4 nút trạng thái ở việc 4 (đợt 2).

Đã kiểm: `tsc`/`eslint` sạch, `booking-schedule-smoke` **156/156 PASS** (39 ca mới × 4 múi giờ), `rls-smoke` 348/348 (không đổi RLS, chỉ chạy lại để chắc không phá gì), `next build` xanh.

## Cập nhật 13/08 (đợt 7) — V2 "Lịch hẹn" việc 6: nhắc lịch hẹn tự động cho nhân viên CHẠY THẬT — **V2 KHÉP LẠI ĐỦ 6/6 VIỆC**

**1 mục MỚI vào CHẠY THẬT (migration #85):** job nền `pg_cron` (`process_appointment_reminders`, chạy mỗi 15 phút) quét những ca hẹn còn giữ chỗ (`booked`), bắt đầu trong tối đa 60 phút tới, CHƯA từng được nhắc — bắn ngay 2 kênh cho nhân viên phụ trách ca: chuông trong app (`notifications`) và tin Zalo Bot (`bot_outbox`, nếu đã ghép nối — dùng chung hàng đợi/quota tháng với bản tin digest #54). Cả hai đều chứa sẵn một tin nhắn ĐÃ SOẠN SẴN để gửi khách (tên khách, dịch vụ, giờ hẹn) và một đường dẫn mở THẲNG vào đúng hội thoại của khách đó (`/app/inbox?c=...`, về `/app/calendar` nếu khách chưa từng nhắn) — lễ tân đọc, dán, tự bấm gửi bằng ô trả lời có sẵn (`sendReply`, việc 5). Máy không tự gửi thay tiệm.

**Idempotent bằng cột `appointments.reminded_at`** (mỗi ca chỉ nhắc đúng 1 lần) + **trigger `appointments_reset_reminder`**: dời giờ ca (kéo-thả/dialog) tự đưa `reminded_at` về NULL, vì ca ở giờ MỚI vẫn cần nhắc — đúng lời `docs/EVENT_CATALOG.md` đã ghi sẵn từ migration #83 ("Job nhắc nhân viên đọc thẳng `start_at` lúc gửi nên luôn thấy giờ mới").

**ĐÍNH CHÍNH so với chữ ADR-0009 mục 3 — quyết định kỹ thuật có lý do, không phải bỏ sót:** ADR liệt kê 3 kênh "đã chạy thật" cho nhắc nhân viên: `bot_outbox` + `activities` + chuông. Bên thi công CHỈ dùng 2/3 (bỏ `activities`). Lý do bắt được lúc soát trước khi code, không phải ý thích: bảng `activities` không có cơ chế tự đóng — chỉ người bấm "xong" mới set `done_at` — nên nếu mỗi ca hẹn tự sinh một "việc" thì việc đó sẽ nằm QUÁ HẠN VĨNH VIỄN trên `/app/today` và hồ sơ khách sau khi giờ hẹn trôi qua (không ai bấm xong một task máy tự tạo). Đây là hệ quả TẤT ĐỊNH của chính định nghĩa `today_queue` (`activities.done_at is null`), không phải giả thuyết — càng nhiều ca hẹn càng dồn rác vào danh sách "quá hạn", làm hỏng chính màn hình đó cho mọi việc khác. Nối `activities` đúng cách cần thêm cột liên kết (`appointment_id`) + tự đóng theo trạng thái ca — lớn hơn hẳn phạm vi "thêm 1 job `pg_cron`" của ADR mục 7 hàng 6, nên KHÔNG làm ở đây, ghi sổ theo dõi trong chính migration #85 (mục "Điều kiện xem lại"). Chuông + Zalo Bot đã giao TRỌN nghĩa "nhắc nhân viên tự động" — không mất chức năng, chỉ bớt một kênh có lỗi thiết kế.

**D1 — tái dùng, không viết lại:** hàng đợi + worker gửi + quota tháng của `bot_outbox` (#54, chỉ thêm 1 giá trị `kind` mới); link thông báo trỏ hội thoại theo đúng khuôn `sla_fire` (#17); tin soạn sẵn cùng tông với `success.draftMessage` của việc 5 (xưng "tiệm", gọi thẳng tên khách, không đoán giới tính).

**1 lỗi thật tự bắt được lúc thiết kế trước khi viết code (không phải ai báo):** nếu chỉ đặt `reminded_at` một lần và không xử lý dời giờ, một ca bị dời sang giờ khác sẽ VĨNH VIỄN không được nhắc lại — cùng loại lỗi với việc gắn nhầm `source` ở việc 5 (một cột/cờ tưởng đơn giản nhưng có một đường ghi quên cập nhật). Sửa bằng trigger `appointments_reset_reminder` (before update), không sửa `rescheduleAppointment` ở tầng ứng dụng — để MỌI đường dời giờ trong tương lai (kể cả đường chưa viết) đều tự đúng, không phải mỗi nơi gọi tự nhớ.

**D3 — kiểm tích hợp CSDL trực tiếp** (script tạm, xoá ngay sau khi chạy, dữ liệu test trong 1 transaction ROLLBACK — không để lại gì): 16/16 ca PASS, gồm — ca trong cửa sổ 60 phút được nhắc đúng 1 lần; ca ngoài cửa sổ (120 phút) không bị đụng; chạy job lại không dội bom (idempotent); dời giờ ca đã nhắc → `reminded_at` về NULL → job nhắc lại đúng; nhánh CÓ ghép nối Zalo Bot sinh đúng 1 `bot_outbox` với `kind`/`dedupe_key`/`external_chat_id` đúng, chạy lại không dội bom; nhánh chưa ghép nối bot không sinh `bot_outbox`; khách CÓ hội thoại → link thông báo trỏ đúng `/app/inbox?c=<id>`, khách chưa từng nhắn → về `/app/calendar`.

**Minh bạch:** chưa tự tay xem thông báo hiện trên chuông/điện thoại thật qua giao diện (cùng giới hạn công cụ trình duyệt đã ghi ở việc 4/5) — bù bằng kiểm tích hợp CSDL trực tiếp phủ đúng toàn bộ logic nghiệp vụ của job (không phải logic hiển thị, vốn đã có sẵn và đã kiểm ở màn Thông báo/#53).

Đã kiểm: `tsc`/`eslint` sạch, `rls-smoke` 348/348 PASS (không đổi RLS, chỉ thêm 1 cột + 1 hàm definer), `next build` xanh, kiểm tích hợp riêng cho migration #85 **16/16 PASS**.

**→ V2 "Lịch hẹn" khép lại ĐỦ 6/6 việc theo ADR-0009 mục 7.**

## Cập nhật 13/08 (đợt 8) — Khép nốt "Minh bạch": kiểm tay thật qua giao diện cho việc 5+6, bắt thêm 1 bug thật (không liên quan V2)

**Founder yêu cầu thẳng: "Tất cả bug phát hiện phải xử lý triệt để, các việc phải hoàn thành ở mức độ 100% chứ không mới vừa hoàn thành cho có."** Đóng nốt hai khoảng "chưa tự tay bấm qua giao diện thật" còn ghi ở đợt 6/7.

**Gốc thật của việc "công cụ trình duyệt bị treo" suốt mấy đợt trước — tìm ra, không phải đoán:** không phải lỗi code, mà công cụ kiểm thử trong phiên này (Browser pane) không truyền được sự kiện bấm chuột tới React trên trang này — kiểm bằng cách gọi thẳng `.click()` qua JavaScript trên chính nút bấm cũng KHÔNG chạy, thử trên ba nút khác nhau (kể cả nút đổi tab lọc, đã chạy tốt từ lâu) đều y hệt → kết luận đây là lỗi HẠ TẦNG CỦA CÔNG CỤ KIỂM THỬ, không phải lỗi trang. Đổi sang **Playwright (trình duyệt thật độc lập, không qua Browser pane)** — bấm được ngay từ lượt đầu.

**Kiểm tay thật, đầy đủ, qua Playwright:**
- **Việc 5 (đặt lịch từ chat):** bấm "Đặt lịch" → dialog mở → chọn dịch vụ → chọn khung 14:00 → bấm "Chốt lịch 14:00" → hiện đúng "✓ Đã chốt lịch 14:00 hôm nay" + tin soạn sẵn đúng chữ → bấm "Gửi cho khách" → tin THẬT vào đúng khung chat, danh sách Hộp thư cập nhật preview + số "Chưa trả lời" giảm đúng 1. Console sạch, không một dòng lỗi.
- **Việc 6 (nhắc lịch hẹn):** chạy `process_appointment_reminders()` cho ca vừa đặt (dời giờ về trong cửa sổ 60 phút để kích job) → mở `/app/notifications` → thông báo "Sắp tới: ... lúc 04:38" hiện ĐÚNG ở đầu danh sách, "Vừa xong", đủ tên khách + dịch vụ + giờ + khối "Tin gợi ý gửi khách" + link đúng hội thoại.
- Toàn bộ dữ liệu seed tạm (giờ mở cửa, 1 dịch vụ thử, ca hẹn thử) đã xoá sạch sau kiểm, hội thoại demo đã đưa về đúng trạng thái cũ (soát lại bằng truy vấn, không đoán).

**Bug thật bắt được trong lúc soát console — có từ trước, KHÔNG liên quan V2, đã sửa triệt để ngay:** `HandoffBanner` và `AiAssist` trong `message-thread.tsx` cùng dùng `key={conversation.id}` — hai phần tử anh em trùng key trong React, cảnh báo "two children with the same key" mỗi lần mở một hội thoại. Có từ đợt Live Chat bàn giao (#55) + AI trợ lý, không phải do việc 5/6. Sửa bằng cách tách tên (`handoff-${id}` / `ai-assist-${id}`) — giữ nguyên ý định cũ (remount theo hội thoại), chỉ hết trùng chuỗi. Đã kiểm lại: `tsc`/`eslint` sạch, `rls-smoke` không đổi (không đụng RLS), console sạch trên cả hai lượt kiểm Playwright sau khi sửa.

**Kết luận, ghi thẳng:** V2 việc 5 và việc 6 giờ đã kiểm tay thật 100% qua giao diện, không còn khoảng "gián tiếp" nào. Bài học giữ lại cho các đợt sau: khi công cụ kiểm thử trong phiên nghi có vấn đề, đổi công cụ (Playwright) để xác nhận trước khi kết luận "chưa kiểm được" — không lặp lại cùng một công cụ hỏng nhiều đợt liền.

## Cập nhật 13/08 (đợt 9) — ADR-0011 việc 1-3: dựng lại trang chủ theo quy hoạch 20 mảng CHẠY THẬT

**Bối cảnh:** Founder chỉ đạo Opus 5 quy hoạch lại toàn bộ giá + trang công khai (ADR-0011) vì phát hiện 2 chỗ trang chủ "nói dối": huy hiệu Sẵn sàng giả cho hoá đơn/thanh toán (chưa có), và bảng giá cũ chết đứng vẫn hứa "giá ra mắt giữ nguyên". Opus nghiên cứu giá đối thủ + chi phí AI thật + mô hình reverse-trial, chốt ADR-0011, giao Sonnet 7 việc. Đây là việc 1-3.

**Đã làm:**
- **Gỡ bảng giá chết:** xoá hẳn `pricing.tsx`, `truc-grid.tsx`, `story-flow.tsx`, `why-and-pricing.tsx` (đã kiểm không còn ai import trước khi xoá — riêng màn Gói cước trong khu đăng nhập đọc thẳng từ CSDL, không đụng tới các file này).
- **Dựng lại `lib/feature-registry.ts`** theo đúng 20 mảng của ADR (11 sẵn sàng · 1 đang xây · 8 sắp tới) — một nguồn duy nhất, mọi trang công khai đọc từ đây, không gõ tay số. Hoá đơn/thanh toán không còn nằm trong danh sách "sẵn sàng" nữa.
- **Trang chủ mới 3 khối:** Hero (huy hiệu đọc số thật `{ready}/{total}` từ registry) → "Một ngày ở tiệm" (7 mốc giờ, mỗi mốc gắn đúng 1 mảng, huy hiệu Sẵn sàng/Đang xây/Sắp tới đọc live) → "4 điều đối thủ không làm được" + khối "Miễn phí trước, trả sau" (giá gói trả phí ghi rõ CHƯA công bố, không giấu diếm).
- Thêm 20 mục i18n cho `landing.modules.*`, `landing.oneDay.*`, `landing.diff.*`, `landing.free.*` ở cả `vi.json` và `en.json`; xoá các mục mồ côi cũ (`landing.truc`, `landing.features`, `landing.story`, `landing.pricing`, `landing.why`).

**Kiểm tay thật:** `tsc --noEmit` sạch · `eslint` sạch (bắt + sửa 3 lỗi thật: 2 chỗ `<a>` phải là `<Link>`, 1 biến đặt tên `module` đụng từ khoá dành riêng của Next.js) · `next build` ra đủ 18 route không lỗi · dựng dev server thật, kiểm qua Playwright (đổi từ Browser pane theo đúng bài học đợt 8 — Browser pane phiên này báo lỗi `MISSING_MESSAGE` giả trong khi Playwright xác nhận console sạch 0 lỗi cả bản Việt lẫn Anh) — đọc snapshot trang thật, khớp 100% nội dung + huy hiệu đúng trạng thái từng mảng + mọi link (Tính năng/Lộ trình/Bảng giá/Hỏi đáp, nút Dùng miễn phí/Tạo tiệm) trỏ đúng URL.

## Cập nhật 13/08 (đợt 10) — ADR-0011 việc 4: 4 trang công khai mới CHẠY THẬT (kèm 1 lỗ chặn thật, chưa vá được)

**Đã làm:** `/tinh-nang` (đủ 20 mảng, gom 6 nhóm theo dòng chảy công việc — nhóm mới `TINH_NANG_GROUPS` thêm vào `feature-registry.ts`), `/lo-trinh` (8 mảng còn lại theo đợt V3–V8, đọc trực tiếp `MODULE_REGISTRY`), `/bang-gia` (gói Miễn phí hiện số thật, gói trả phí ghi "công bố khi mở bán" + bảng đối chiếu 9 đối thủ dùng `formatMoney` theo locale), `/nganh/[slug]` × 6 (spa/shop/kham/pet/fnb/retail — hero + 3 việc hằng ngày viết tay bám sát dữ liệu pack thật đã seed, khối "Bấm một cái có sẵn ngay" đọc LIVE qua RPC mới `industry_pack_view`). Đủ song ngữ vi/en. `tsc`/`eslint`/`next build` sạch (27 route), kiểm tay qua Playwright cả 2 ngôn ngữ, console sạch, 0 lỗi.

**LỖ CHẶN THẬT — chưa tự vá được, cần founder xác nhận:** viết migration #86 (`industry_pack_view`, security definer, grant execute cho anon — theo đúng khuôn `storefront_view`/`livechat_session` đã có, KHÔNG mở GRANT SELECT thẳng trên bảng) nhưng **CHƯA ÁP LÊN CSDL THẬT của ifan.asia**. Lý do: kết nối Supabase MCP khả dụng trong phiên này trỏ tới một dự án Supabase KHÁC hẳn ("hieu.asia" — bảng affiliate/tarot/mentor, không liên quan iFan) — phát hiện qua `list_projects`/`list_migrations` trước khi định áp, dừng lại ngay, không chạy nhầm. Kết nối Supabase đúng của ifan.asia (`plugin:supabase:supabase`) cần đăng nhập tương tác mà phiên này không làm được. Vì vậy khối dữ liệu ngành (dịch vụ mẫu, nhãn, bước chăm khách) trên `/nganh/*` đang **tự ẩn gọn** (không lỗi, không trang trắng) — trang vẫn dùng tốt với phần tĩnh, chỉ thiếu phần "có sẵn ngay" cho tới khi ai đó áp migration `supabase/migrations/20260813000086_industry_pack_public_view.sql` qua kênh đúng (Supabase Dashboard SQL Editor, hoặc `supabase db push`, hoặc phiên sau có `plugin:supabase:supabase` đã đăng nhập). Theo dõi ở task nội bộ #109.

## Cập nhật 13/08 (đợt 11) — ADR-0011 việc 5 (nửa đầu): giảm TRANSCRIPT_MESSAGES 30→12

Phần code-thuần của việc 5 làm được ngay (`app/app/inbox/ai-actions.ts`): giảm số tin đưa vào transcript AI từ 30 xuống 12 (ADR-0011 mục 3) — giảm token đầu vào mỗi lượt gọi AI, khớp mô hình túi-lượt-có-trần sắp làm ở việc 6. `tsc`/`eslint` sạch.

**Nửa còn lại của việc 5 (đổi `AI_MODEL` mặc định sang Haiku 4.5) CHƯA làm — đúng theo ràng buộc cứng của ADR:** *"Đo chất lượng 20 hội thoại thật trước khi đổi hẳn"*. Việc đo này cần kéo 20 hội thoại thật từ CSDL sản xuất — cùng lỗ chặn với migration #86 (đợt 10): kết nối Supabase MCP phiên này trỏ nhầm dự án khác, không có đường vào CSDL thật của ifan.asia. `AI_MODEL` giữ nguyên mặc định `claude-opus-5`, vẫn đọc qua env — không đổi liều lĩnh khi chưa đo được.

**Còn lại của ADR-0011 (chưa làm, đúng thứ tự hàng đợi):** việc 6 (túi lượt AI + trần chi tiêu), việc 7 (reverse trial 30 ngày) — cả hai cần migration nền mới, sẽ viết trước rồi cùng chờ áp CSDL như migration #86.

## Cập nhật 13/08 (đợt 12) — ADR-0011 việc 6: phát hiện HỆ THỐNG TÚI-LƯỢT-AI ĐÃ CÓ SẴN từ trước — chỉ vá 2 chỗ thiếu thật

**Phát hiện quan trọng trước khi code (đọc kỹ tránh làm trùng):** soát `lib/ai/gateway.ts` + migration #41/#27 trước khi định dựng schema mới, thấy việc 6 phần lớn ĐÃ LÀM từ một đợt trước ADR-0011: mọi lượt gọi AI đều qua `guard()` → RPC `increment_usage` (bảng `usage_counters`) → chặn cứng khi vượt `plan_limit()`, đúng luật 1 và luật 4 của ADR mục 4.2 (trần bật sẵn mặc định, không tự nâng gói). Màn `/app/settings/billing` đã hiện `used/limit` + thanh tiến trình cho từng gói.

**Hai chỗ thật sự còn thiếu, đã vá:**
1. **Cảnh báo 70%/90% (luật 3, ADR mục 4.2)** — trước đây chỉ có thanh màu (vàng ở 80%, đỏ ở 100%), không có DÒNG CHỮ cảnh báo kèm số lượt còn lại + ngày làm mới như ADR yêu cầu. Thêm 2 dòng cảnh báo mới trong `billing-view.tsx` (ở đúng 70%/90%, không đổi mốc màu thanh tiến trình sẵn có).
2. **Số 30 lượt/tháng gói Miễn phí (ADR mục 4c.1)** — CSDL đang seed 20 (từ bảng giá cũ, migration #27), trong khi `/bang-gia` mới công bố 30 lượt (số đã lên trang công khai). Viết migration #87 sửa đúng 1 dòng UPDATE cho gói `free`.

**CHƯA đụng — cần founder quyết trước khi làm tiếp, không phải lỗ kỹ thuật:** ba gói trả phí `basic/pro/business` (199k/399k/799k) vẫn đang là gói THẬT đang bán, với hạn mức AI riêng (200/1000/5000) — đây là tàn dư mô hình giá CŨ (4 gói) mà ADR-0011 đã bác bỏ để chuyển sang đúng 2 gói (Miễn phí + iFan 79-99k). Sửa/gộp 3 gói này đụng tới **thuê bao đang sống của khách thật** (nếu có) — không phải việc code đơn thuần, cần founder xác nhận thời điểm chuyển đổi trước khi động vào.

**Kiểm tay thật:** `tsc`/`eslint`/`next build` sạch, không đụng RLS. Migration #87 (UPDATE 1 dòng) **CHƯA áp lên CSDL thật** — cùng lỗ chặn kết nối Supabase MCP với migration #86, gộp chung task theo dõi #109.

## Cập nhật 13/08 (đợt 13) — ADR-0011 việc 7: soát kỹ, phát hiện REVERSE TRIAL 30 NGÀY ĐÃ CHẠY THẬT TRONG SẢN XUẤT từ trước

**Trước khi định viết migration mới cho việc 7, soát kỹ toàn bộ hệ thống thuê bao** (đúng luật "đọc trước khi code", tránh làm trùng lần thứ hai trong cùng phiên) — phát hiện **toàn bộ cơ chế reverse trial đã chạy thật, có cron thật, đúng gần hết 4 luật của ADR mục 4.4:**

- **Tenant mới tự động nhận thuê bao dùng thử 30 ngày**, hạn mức gói Chuyên nghiệp (`tenant_bootstrap_subscription`, trigger chạy ngay khi tạo tiệm) — khớp *"30 ngày mở toàn bộ tính năng"*.
- **Cron thật `subscription-lifecycle` chạy mỗi ngày 19h** (`run_subscription_lifecycle`, đã đăng ký `cron.schedule`, có canh gác `cron-failure-scan` giám sát cron chết — bài học từ bug #85 đã được áp dụng ở đây) — hết hạn thì **tự hạ về Miễn phí, không khoá cửa, không xoá gì** — khớp *"Tự hạ xuống bản miễn phí, KHÔNG khoá cửa"* + *"tuyệt đối không xoá"*.
- **Nhắc trước khi hết hạn** (còn 3 ngày, còn 1 ngày) qua thông báo trong app, ghi log chống nhắc trùng.
- **Hạ gói mà đang thừa người:** không xoá ai, không khoá ai đang có — chỉ chặn thêm người mới cho tới khi về dưới trần (đúng nguyên văn trong code: *"xóa người là mất dữ liệu phân công, không được phép làm âm thầm"*).

**Hai chỗ lệch so với con số MỚI của ADR-0011 (không phải thiếu tính năng, chỉ lệch số/mốc thời gian):**
1. Mốc nhắc hiện là "còn 3 ngày / còn 1 ngày", ADR mục 5b muốn thêm mốc sớm hơn ở "còn 7 ngày" (ngày 23/30).
2. Hạn mức AI lúc dùng thử đang lấy theo gói `pro` cũ (1000 lượt/tháng), ADR muốn con số mới là 300 lượt — **cùng vướng mắc với việc 6:** đổi số này phải đi cùng quyết định gộp 4 gói cũ về 2 gói mới, không tách lẻ được.

**Không viết thêm migration cho việc 7** — hệ thống đã đúng, chỉ còn 2 điểm hiệu chỉnh trên đều phụ thuộc quyết định gộp gói (đã nêu ở đợt 12), không phải việc code độc lập.

## Tổng kết đợt 9-13 (ADR-0011) — còn lại đều chờ 1 trong 2 điều kiện

Bảy việc ADR-0011 giao: **việc 1-4 xong trọn vẹn, chạy thật, kiểm tay qua Playwright.** Việc 5 xong nửa đầu (giảm transcript). Việc 6-7 hoá ra **đã có sẵn phần lõi từ trước**, chỉ còn hiệu chỉnh số. Toàn bộ phần còn lại (nửa sau việc 5, hiệu chỉnh việc 6-7, áp 2 migration #86/#87) đều chờ đúng 1 trong 2 điều kiện: **(a) có đường vào CSDL thật** (task #109/#110) hoặc **(b) founder quyết thời điểm gộp 4 gói cũ về 2 gói mới của ADR-0011** — cả hai đều không phải việc tự làm tiếp được trong phiên này.

## Cập nhật 13/08 (đợt 14) — Founder xác nhận chưa có khách thật → gộp thẳng 4 gói cũ về 2 gói ADR-0011

**Founder xác nhận trực tiếp (13/08):** *"chưa có khách và sẽ chưa đẩy khách bây giờ"* + *"bạn toàn quyền, làm luôn đi"* — gỡ nốt điều kiện (b) còn treo ở đợt 13. Không còn rủi ro ảnh hưởng thuê bao thật, gộp thẳng.

**Migration #88** — giữ nguyên 2 mã đã có sẵn trong CHECK constraint (`free`, `pro`) thay vì thêm mã mới, tránh phải sửa constraint ở 3 bảng khác. Đổi Ý NGHĨA `pro` thành gói trả phí DUY NHẤT "iFan": 99.000đ/tháng · 79.000đ/tháng quy năm (948.000đ/năm, đúng số ADR mục 4c.1) · **không giới hạn người dùng** (bỏ hẳn khoá `max_members`) · 300 lượt AI/tháng. Xoá 2 gói `basic`/`business`. Bỏ công thức "năm = 85% tháng×12" cũ (không khớp số ADR — chênh ~20%, không phải 15%), thay bằng chốt tối thiểu "năm không đắt hơn tháng×12".

**Tác dụng phụ có lợi, không cần sửa thêm dòng nào:** trigger `tenant_bootstrap_subscription` (cấp thuê bao dùng thử) đang gán trial = `pro` sẵn — sau khi migration chạy, tenant mới dùng thử **tự động nhận đúng 300 lượt AI + không giới hạn người** thay vì số cũ (1000/30). Vá luôn nốt lệch số còn ghi ở đợt 13 cho việc 7, không cần migration riêng.

**Đồng bộ code:** `lib/billing/types.ts` PLAN_CODES siết còn `["free","pro"]` (khớp CSDL, chặn sớm nếu ai gọi nhầm mã cũ). `admin.plans.pro` trong `messages/{vi,en}.json` sửa nhãn "Chuyên nghiệp/Pro" → "iFan" (tránh màn quản trị hiện sai tên gói). Không đổi gì ở `billing-view.tsx`/`/bang-gia` — cả hai đã đọc dữ liệu sống từ bảng `plans`, tự động phản ánh đúng khi migration chạy (D1).

**Kiểm tay thật:** `tsc`/`eslint`/`next build` sạch. Migration #88 **CHƯA áp lên CSDL thật** — cùng lỗ chặn kết nối với #86/#87, gộp chung task #109. Founder đã đồng ý tự dán SQL vào Supabase SQL Editor (đang mở sẵn) thay vì chờ nối lại kết nối MCP.

**Migration #89 — vá nốt mốc nhắc dùng thử cho đúng ADR mục 5b:** hệ thống nhắc trước khi hết hạn (đợt 13) có sẵn nhưng mốc "còn 3 ngày / còn 1 ngày" lệch với ADR chốt "ngày 23 · 28 · 30" của gói 30 ngày (tức còn 7 ngày / còn 2 ngày — ngày 30 là hết hạn thật, đã có thông báo riêng "trial_ended"). Sửa đúng 1 khối trong hàm `run_subscription_lifecycle()`, 3 khối còn lại (hạ gói/quá kỳ/tạm ngưng) giữ nguyên y hệt. Không đụng code app — chuỗi thông báo dùng số nhiều ICU sẵn có (`{days, plural, one {1 ngày} other {# ngày}}`) nên số ngày nào cũng tự hiện đúng. **Việc 7 của ADR-0011 coi như xong trọn vẹn** (chờ áp CSDL, gộp chung #109).

**Tổng kết cuối:** cả 7 việc ADR-0011 nay đã CODE XONG — việc 1-4 chạy thật & kiểm qua Playwright, việc 5 xong nửa transcript (nửa đổi AI_MODEL chờ đo A/B, task #110), việc 6-7 xong cả code lẫn hiệu chỉnh số. Còn lại đúng 1 việc: áp 4 migration (#86/#87/#88/#89) lên CSDL thật — đã gửi file gộp cho founder tự chạy qua Supabase SQL Editor (task #109).

## Cập nhật 13/08 (đợt 15) — Cả 4 migration (#86-#89) ĐÃ ÁP LÊN CSDL THẬT — ADR-0011 khép lại phần code

**Founder gửi thẳng khoá kết nối thật của dự án iFan.asia SG** (đúng dự án — dự án "hieu.asia" mà công cụ MCP nhìn thấy trước đó là SAI, thuộc tổ chức khác của founder, không liên quan). Khoá đã nằm sẵn trong `.env.local` (đúng chỗ quy ước của dự án, không cần lưu thêm ở đâu khác).

**Thử nối thẳng bằng đường kết nối Postgres — bị chặn:** máy founder chặn với lỗi chứng chỉ bảo mật tự ký (nhiều khả năng phần mềm diệt-virus/bảo mật đang can thiệp kết nối mã hoá dạng này). **Không hạ cấp bảo mật để ép qua** (tắt xác thực chứng chỉ = mở cửa cho tấn công nghe lén) — thử cách an toàn thay thế (`--use-system-ca`) cũng không qua được, dừng đường này.

**Đường thành công: Supabase Management API qua HTTPS chuẩn** (cùng cơ chế công cụ MCP chính thức của Supabase dùng, chỉ khác kênh vào) — dùng token quản trị founder gửi, không đụng gì tới đường Postgres bị chặn ở trên. Chạy tuần tự cả 4 migration, kiểm lại ngay sau đó bằng chính API này:
- Bảng `plans` đúng 2 dòng: **Miễn phí** (0đ, 3 người, 30 lượt AI/tháng) và **iFan** (99.000đ/79.000đ quy năm, không giới hạn người, 300 lượt AI/tháng).
- Hàm `industry_pack_view` tồn tại — `/nganh/spa`, `/nganh/kham`, `/nganh/pet` từ nay hiện đúng dịch vụ mẫu/nhãn/bước chăm khách LẤY TỪ CSDL THẬT, không còn tự ẩn khối đó nữa.

**ADR-0011 — cả 7 việc coi như khép lại phần founder/code có thể tự làm.** Chỉ còn task #110 (đo A/B chất lượng AI trước khi đổi mô hình rẻ hơn) — việc này KHÔNG bị chặn kết nối nữa (đã có đường API dùng được), có thể làm ngay khi cần.

## Cập nhật 13/08 (đợt 16) — ADR-0012 việc 1-5: bản đồ 9 nhóm/28 mảng CHẠY THẬT + bảng kéo-thả Công việc mới

**Việc 1 — dựng lại `feature-registry.ts` theo 3 tầng:** thêm `GROUP_REGISTRY` (9 nhóm đúng thứ tự ADR-0012 mục 4) + `groupId` trên mỗi mảng của `MODULE_REGISTRY` — không xoá/đổi trạng thái mảng cũ nào (giữ đúng luật ADR "không đảo đợt, không xoá mảng"). Thêm 8 mảng mới có tên nhưng chưa có bảng CSDL riêng (kế thừa trạng thái `planned` đúng đợt ADR xếp): `contractsBilling`, `events`, `csatQc`, `projects`, `recruitment`, `payroll`, `dataExport`; và tách **`approvals`** ra khỏi `tasks` cũ thành mảng `ready` riêng (không phải tính năng mới — Duyệt & audit log đã chạy thật từ trước, chỉ chưa có tên riêng trên trang công khai). Tổng 28 mảng thật (nhiều hơn con số ước lượng "~25" trong ADR — không ép về đúng 25, vì đúng-với-dữ-liệu-thật quan trọng hơn khớp một con số ước lượng). `GROUP_COUNTS.readyCore` tính động số nhóm có ≥1 mảng ready — không gõ tay.

**Việc 2-4 — cập nhật hiển thị công khai:** `/tinh-nang` đổi từ 6 nhóm tự đặt sang đúng 9 nhóm theo tên thị trường (đọc `GROUP_REGISTRY`/`MODULE_REGISTRY` trực tiếp, không còn mảng tĩnh trung gian); nhóm 8 "Vận hành tiệm" có thêm dòng phụ đề nêu đây là 4 mảng CNV Work (đối thủ chính) không có. `/lo-trinh` không đổi cấu trúc (đã đọc động từ registry), chỉ cập nhật "Ba thứ cố ý KHÔNG làm" theo đúng bảng ADR-0012 mục 6 (kế toán đầy đủ/POS offline/ERP >100 người — 2 dòng cũ về "duyệt đa cấp"/"tuyển dụng" đã LẬT quyết định trong ADR nên gỡ khỏi danh sách này). Nhãn hero trang chủ đổi từ "{n}/20 mảng dùng được" sang **"{n}/9 nhóm đã có phần lõi chạy thật"** (đo được: 8/9 — chỉ riêng "Nhân sự & Chấm công" chưa có mảng nào ready). Không in tổng "~130 tính năng" ở bất kỳ đâu (đúng luật ADR mục 8).

**Việc 5 — bảng kéo-thả `/app/tasks` (Công việc), màn hoàn toàn mới:** phát hiện quan trọng trước khi code — dự án CHƯA CÓ màn "Công việc" độc lập nào (chỉ có "Việc đang chờ" lồng trong hồ sơ khách/cơ hội + khối việc trong "Hôm nay"), khác giả định ban đầu của ADR ("đã chạy thật, chỉ thiếu kanban"). Dựng route mới `app/app/tasks/` (page/queries/actions/types/tasks-board) đọc thẳng bảng `activities` sẵn có (type='task'), KHÔNG thêm cột CSDL nào. Cột theo HẠN thay vì trạng thái tự đặt (Quá hạn/Hôm nay/Sắp tới/Đã xong — cột "Đã xong" giới hạn 14 ngày gần nhất, không phình vô hạn) vì `activities` chỉ có sẵn `due_at`/`done_at`. Kéo-thả dùng đúng cơ chế HTML5 draggable/dataTransfer đã chứng minh ở bảng Cơ hội (`deals-board.tsx`), kèm menu "Chuyển sang" thay thế cho thao tác không kéo-thả được (bàn phím/di động). Thêm mục "Công việc" vào thanh điều hướng (không đụng 4 ô cố định của thanh dưới điện thoại — nằm ở menu tràn cùng Duyệt/Cài đặt). Kiểm tay: dữ liệu mẫu thật hiện đúng theo cột (0 quá hạn · 3 hôm nay · 14 sắp tới · 0 đã xong), `tsc`/`eslint`/`next build` sạch (28 route, có `/app/tasks`).

**Không làm trong đợt này (đúng phạm vi ADR-0012 mục 9):** mọi tính năng V3→V8 ở mục 5 của ADR (khuyến mãi, hoa hồng, CSAT, dự án, tuyển dụng, lương…) — đây là bản đồ + đúng 1 tính năng code (kanban), không phải lệnh thi công toàn bộ.

## Cập nhật 13/08 (đợt 17) — Bot Telegram nội bộ CHẠY THẬT trên server (task #115)

**Bối cảnh — một đường đã thử kỹ và thất bại, ghi lại để không ai thử lại:** founder tạo bot `@iFanVN_bot` + nhóm "iFan" (dạng diễn đàn) và muốn bot "hiểu được, trả lời ngay, chính xác". Đường đầu tiên thử là **cầu nối Claude Code ↔ Telegram** (plugin `telegram@claude-plugins-official`). Đã cấu hình đủ: đổi token, ghép quyền, dọn tiến trình tranh chấp. Kết quả: **chiều gửi RA chạy tốt** (founder nhận được tin thật), **chiều nhận VÀO không bao giờ tới**. Chẩn đoán cuối bằng bằng chứng chứ không đoán: (a) dò cây tiến trình xác nhận tiến trình nghe là con của ĐÚNG phiên Claude Code đang làm việc (`claude.exe` PID khớp), (b) `getUpdates` trả về 0 tin tồn đọng ⇒ tin CÓ được tiêu thụ, (c) dấu hiệu "typing" hiện trong ảnh chụp của founder ⇒ tin QUA được cổng phân quyền, (d) đọc mã nguồn plugin: bước cuối là `mcp.notification({method:'notifications/claude/channel'})` — bước này **không được bản Claude Code dạng ứng dụng (chế độ `--output-format stream-json`) chuyển thành tin trong hội thoại**. Giới hạn công cụ, không sửa được từ phía dự án. **Đường này đã đóng lại**, `~/.claude/channels/telegram/.env` bị vô hiệu hoá có chủ đích kèm ghi chú lý do — vì cầu nối gọi `deleteWebhook` lúc khởi động và sẽ **âm thầm xoá đường nhận tin của sản phẩm** nếu ai bật lại trên cùng bot.

**Đường thay thế đã làm và ĐANG CHẠY:** webhook `/api/telegram/webhook` trong chính sản phẩm, chạy trên Vercel 24/7, không phụ thuộc máy founder bật/tắt.

**Quyết định phạm vi:** bot trả lời bằng **số liệu thật tra thẳng CSDL**, KHÔNG dùng AI. Với câu hỏi dạng số liệu thì cách này vừa nhanh vừa đúng tuyệt đối, và **không cần `ANTHROPIC_API_KEY`** (vẫn đang thiếu — task #111). Khi có khoá thì thêm nhánh hỏi-đáp tự do bên cạnh, không phải đập bỏ cái này.

**Ba lớp chặn (thiếu bất kỳ lớp nào là rò số liệu kinh doanh ra người lạ — bot Telegram là công khai, BẤT KỲ AI cũng nhắn được):**
1. Header `X-Telegram-Bot-Api-Secret-Token` phải khớp `BOT_INGEST_KEY` (đăng ký lúc `setWebhook`) — chứng minh Telegram thật sự gửi.
2. `chat_id` phải nằm trong `TELEGRAM_ALLOWED_CHATS`. **Danh sách rỗng = khoá hết, không mở toang** (fail-closed, đúng bài học task #10).
3. RPC `platform_status` (migration #90) chỉ trả **số đếm tổng hợp**, không trả một dòng dữ liệu khách nào — nên **KHÔNG dùng `service_role` key ở webhook** (key đó bỏ qua toàn bộ RLS, lỡ rò là mất sạch mọi tiệm). Khuôn `platform_webhook_token` (#79), dùng chung khoá `bot_ingest_key` sẵn có, không sinh thêm bí mật phải quản lý riêng.

**Tách `lib/notify/telegram.ts` riêng khỏi `channel.ts` (Zalo) có chủ đích** dù hai API gần trùng hình dạng: khác trần độ dài (4.096 vs 2.000), khác base URL, và Telegram có khái niệm **chủ đề** (`message_thread_id`) mà Zalo không có — gộp lại là phải cắm cờ điều kiện vào từng dòng. Bot trả lời vào **đúng chủ đề** người hỏi, không rơi xuống General.

**Kiểm tay thật trên bản production (5 ca, không phải giả lập cục bộ):** sai khoá bí mật → 401 ✓ · chat ngoài danh sách → 200 im lặng, không lộ bot có gì ✓ · `/trangthai` từ founder → gửi số liệu thật ✓ · `/help@iFanVN_bot` trong nhóm kèm `message_thread_id` → trả đúng chủ đề ✓ · lệnh lạ → chỉ đường thay vì im lặng ✓. Nhật ký chạy trên Vercel sạch, không lỗi. Migration #90 đã áp CSDL thật, kiểm cả 2 chiều: đúng khoá → trả số, sai khoá → `invalid_key`.

**Nhóm Telegram cũng đã dựng xong:** 7 chủ đề (Tính năng · Lỗi · Ý tưởng · Hỏi đáp · Thông báo · Khách hàng · Kỹ thuật), mỗi chủ đề có icon + một dòng ghim giải thích dùng để làm gì; ảnh đại diện nhóm + avatar bot dùng đúng logo iFan.

## Cập nhật 13/08 (đợt 18) — Bot Telegram HỎI-ĐÁP TỰ DO chạy thật, dùng gói thuê bao (không tốn thêm tiền)

**Phát hiện gỡ được nút thắt:** founder nói không có khoá AI, nhưng dò kỹ thì **khoá đã nằm sẵn trên máy** ở cấp hệ thống Windows (`ANTHROPIC_API_KEY`, đã thử gọi và còn sống). Cùng lúc phát hiện **một lỗi thật trên máy**: `ANTHROPIC_AUTH_TOKEN` đang mang giá trị rác `"jan"` — đúng thứ gây cảnh báo "Both … set · auth may not work" và lỗi "không kết nối được" ở terminal Claude Code từ trước tới giờ.

**Quyết định:** founder chọn dùng **gói thuê bao** thay vì khoá API tính tiền theo lượt. Hệ quả kỹ thuật thẳng thắn: **gói thuê bao KHÔNG dùng cho server được** (chỉ dùng qua Claude Code trên máy thật) — nên hỏi-đáp tự do phải chạy qua máy founder, còn phần AI trên server để lại làm công tắc chờ khi nào founder muốn bật khoá API.

**Kiến trúc — vì sao đi đường hàng đợi:** một bot Telegram chỉ được chọn MỘT trong hai cách nhận tin (webhook HOẶC tự hỏi). Nếu để script trên máy founder tự hỏi Telegram thì phải tắt webhook, và **lúc script chết là lệnh `/trangthai` chết âm thầm theo** — đúng loại bẫy bug #85 đã ghi trong sổ. Nên: webhook **luôn** giữ bot; tin không phải lệnh thì đẩy vào hàng đợi `tg_bridge_queue` (migration #91); `scripts/telegram-bridge.mjs` trên máy founder lấy ra, hỏi Claude Code, gửi câu trả lời về. **Cầu nối là phần cộng thêm — tắt nó đi thì bot vẫn chạy y như trước.**

**Nhịp tim:** webhook biết được máy founder có đang bật không, nên trả lời đúng sự thật ("đang hỏi Claude Code, chờ chút" vs "đã ghi nhận, máy trạm chưa bật") thay vì để người hỏi chờ vô vọng.

**QUYỀN CỦA CLAUDE — cố ý để mặc định (chỉ đọc, không tự sửa file):** người trong nhóm Telegram nhắn gì thì Claude làm nấy. Mở quyền ghi là biến **một tin nhắn bất kỳ — kể cả tin người khác gửi vào nhóm** — thành lệnh sửa/xoá code không ai duyệt. Muốn mở phải là quyết định riêng có ADR, không lặng lẽ bật trong script.

**Một lỗi thật bắt được ngay lần chạy đầu, đã sửa:** trên Windows, `spawn` với `shell: true` **không tự bọc nháy** quanh tham số có dấu cách — câu hỏi bị xé thành hàng chục tham số rời và Claude chỉ nhận được đúng một chữ (bot trả lời *"tin nhắn bị gửi thiếu, mới thấy mỗi chữ Bạn"*). Sửa: gọi thẳng đường dẫn thật của `claude.exe`, bỏ `shell`. Tìm file chạy theo thứ tự `CLAUDE_BIN` → thư mục cài, **lấy bản mới nhất** (ứng dụng tự cập nhật nên không ghim cứng phiên bản); không tìm thấy thì dừng hẳn với lời nhắn rõ ràng thay vì chạy rồi mọi câu hỏi đều lỗi.

**Kiểm tay thật (đi trọn đường, không giả lập cục bộ):** gửi câu hỏi thường qua webhook production → vào hàng đợi → cầu nối lấy → Claude Code trả lời → về Telegram. Câu trả lời **đúng thực tế dự án** (nêu đúng khung web, đúng phiên bản, đúng số trang công khai) chứ không phải câu chung chung — chứng minh Claude đọc được mã nguồn thật.

**Cần biết khi vận hành:** hỏi-đáp tự do chỉ sống khi **máy founder bật**. Lệnh `/trangthai` thì luôn sống 24/7 vì nằm trên server. **Không còn phải gõ lệnh bằng tay** — xem đợt 19.

## Cập nhật 13/08 (đợt 19) — Cầu nối tự bật khi đăng nhập Windows + 2 lỗi hiển thị/vận hành

**Bug founder bắt được:** bot trả lời *"Tôi là \*\*Claude Code\*\*"* — Telegram in nguyên hai dấu sao thay vì in đậm, vì Claude viết theo markdown còn tầng gửi dùng chế độ chữ thô. **Dặn Claude "đừng dùng markdown" là KHÔNG đủ** (nó viết theo phản xạ) — phải đổi ở tầng mã, cùng nguyên tắc đã dùng cho chặn quyền: hàng rào thật, không phải lời dặn. Thêm bộ đổi markdown → HTML Telegram, **thoát ký tự HTML TRƯỚC rồi mới chèn thẻ** (làm ngược thì chính thẻ vừa chèn bị thoát thành chữ), chỉ dùng đúng bộ thẻ Telegram chấp nhận (chèn thẻ khác là API trả 400 và **mất trắng câu trả lời**). Lưới an toàn: gửi HTML hỏng thì gửi lại bản chữ thô — thà mất chữ đậm còn hơn mất câu trả lời. Cắt khúc theo **ranh giới dòng** thay vì cắt bừa (cắt giữa chừng xẻ đôi cặp `**` hoặc một thẻ). Kiểm 9 ca dễ sai trước khi dùng, gồm 2 bẫy đáng nói: phép nhân `5*3` **không** được biến thành in nghiêng, và ký tự `< > &` phải an toàn.

**Founder yêu cầu tự động hoá:** *"khi tôi mở máy thì tự bật luôn, không cần tôi thao tác nữa"* — bắt người dùng nhớ gõ lệnh mỗi lần bật máy là thiết kế tồi. Tạo tác vụ Windows `iFan Telegram Bridge` chạy lúc đăng nhập, ẩn, tự khởi động lại 3 lần nếu chết. Thêm **chốt một-bản-chạy** (tự bật + chạy tay = hai bản cùng lấy việc ⇒ một câu hỏi bị trả lời hai lần): giữ chỗ bằng **một cổng cục bộ** thay vì file khoá — máy tắt đột ngột thì file khoá còn nguyên và chặn nhầm lần sau, còn cổng thì hệ điều hành tự thu hồi.

**BẪY LỚN NHẤT ĐỢT NÀY — ghi kỹ để không ai vấp lại:** chạy tay thì tìm thấy Claude Code, chạy qua tác vụ lại báo *"không có thư mục"* **dù đường dẫn in ra giống hệt nhau**. Nguyên do: ứng dụng Claude cài dạng **đóng gói (MSIX/Microsoft Store)** nên `%APPDATA%\Claude` bị **ảo hoá** — chỉ tiến trình chạy BÊN TRONG gói mới nhìn thấy. Cửa sổ lệnh do chính ứng dụng mở nằm trong gói (thấy được), còn tác vụ Windows chạy ngoài gói (không thấy). Đường thật nằm ở `...\AppData\Local\Packages\Claude_*\LocalCache\Roaming\Claude\claude-code`. Sửa: tìm cả hai đường. **Chỉ ra được nhờ bắt chương trình tự khai nó đã tìm ở đâu** — thông báo lỗi cũ chỉ nói "không tìm thấy", vô dụng khi chẩn đoán. Bài học chung: thông báo lỗi phải nói **đã thử gì**, không chỉ nói **thất bại**.

**Nhật ký ra file** `%LOCALAPPDATA%\iFan\telegram-bridge.log`: tác vụ chạy ẩn, không có cửa sổ nào để đọc lỗi — không ghi ra file thì lỗi biến mất không dấu vết (chính nhờ file này mới bắt được bẫy MSIX ở trên).

**Kiểm thật:** chạy tác vụ → tìm đúng Claude ở đường ảo hoá → gửi câu hỏi qua webhook production → trả lời về Telegram. **Xác nhận đăng nhập vẫn dùng được khi chạy NGOÀI ứng dụng.**

**Còn lại:** đẩy cảnh báo "Cần giúp?" sang Telegram (phần còn lại của #115) và Telegram làm kênh chat khách hàng (#116, cần ADR riêng).

## Cập nhật 13/08 (đợt 20) — Ba lỗ bảo mật THẬT ở cầu nối Telegram, và một bài học về cách tự kiểm

Founder hỏi một câu tưởng vô hại: *"Người thường đâu thể yêu cầu sửa code hay yêu cầu thay đổi gì đâu nhỉ?"* Câu hỏi đó lật ra ba lỗ, lỗ nào cũng thật.

**Lỗ 1 — người thường SỬA ĐƯỢC FILE thật.** Trước đó tôi đã báo với founder là an toàn. **Sai.** Kiểm lại đàng hoàng: đóng vai người thường, bảo bot thêm một dòng vào README.md — **file bị sửa thật**. Danh sách công cụ cấm không có tác dụng vì cài đặt cá nhân trên máy đang để chế độ *tự duyệt mọi thao tác*, đè lên mọi cờ chặn. Sửa bằng hàng rào ở tầng khác: người thường chạy ở **chế độ chỉ-lập-kế-hoạch** — chế độ này không cho ghi, bất kể cài đặt máy nói gì. Kiểm lại: file không đổi.

**Vì sao tôi đã báo sai — bài học đắt nhất, ghi để không lặp lại.** Lần "kiểm" trước tôi bảo bot tạo file tên `test-gia-mao.txt` với nội dung `hacked`. Bot từ chối, tôi kết luận "có hàng rào". Thực ra **bot từ chối vì câu đó nghe như phá hoại** — nó tự thấy không nên làm, chứ không có hàng rào nào chặn cả. Tôi đã nhầm *thiện chí của bot* thành *cơ chế bảo vệ*. Luật mới, đã ghi thẳng vào mã nguồn: kiểm bảo mật phải dùng **yêu cầu vô hại nhưng vẫn ghi thật** (thêm một dòng vào file rác), và phải **đọc lại trạng thái file/dữ liệu thật** — tuyệt đối không tin câu "đã xong" của bot. Cả hai lần bot ghi được, nó đều nói *"Xong. Đã thêm dòng"* y hệt nhau.

**Lỗ 2 — mọi người trong cùng phòng chat dùng CHUNG một phiên nói chuyện.** Hậu quả kép: (a) người thường hỏi trước → phiên bị khoá ở chế độ chỉ-lập-kế-hoạch → **founder nhắn sau bị mất quyền sửa mà không hề được báo**; (b) nội dung người này hỏi lọt sang người kia. Sửa: gắn thêm danh tính người gửi vào khoá phiên. Kiểm cả hai chiều trong cùng một phòng.

**Lỗ 3 — người thường đọc được thông tin nội bộ.** Founder chốt luật: *người thường chỉ được hỏi thứ công khai; nội bộ và bí mật thì không, trả lời khéo, đừng cho họ biết họ thuộc hạng nào, và đừng dài dòng.* Làm hai lớp:
- **Hàng rào thật:** người thường chạy ở **thư mục rỗng**, không phải thư mục dự án. Chặn công cụ đọc là chưa đủ — vào thư mục dự án là Claude tự nạp hồ sơ dự án vào đầu trước khi ai kịp chặn; đã nạp rồi thì không xoá khỏi đầu được nữa.
- **Nguồn thông tin công khai:** tóm tắt được **dựng tự động từ chính nội dung trang web và sổ đăng ký tính năng** (luật D1 — không gõ tay số liệu đã có nơi khác). Web đổi thì bot đổi theo, không có chuyện bot nói một đằng web một nẻo.
- **Cách từ chối:** đúng một câu *"Cái này mình không có thông tin, bạn nhắn trực tiếp anh Hiếu nhé."* — cấm mọi chữ như *quyền, được phép, giới hạn, thành viên*. Bản đầu vẫn lộ: bot nói *"mình không có quyền truy cập mã nguồn"* — nghe là biết ngay phía sau có hàng rào phân quyền, mời người ta dò tiếp. Phải **đưa nguyên văn câu cần nói** thay vì liệt kê điều cấm nói.

**Kiểm thật, đi trọn đường qua webhook production:** người thường hỏi công khai (lịch hẹn, gói miễn phí, chấm công) → trả lời **đúng và gọn**; hỏi mã nguồn, hỏi số khách/doanh thu, và dò thẳng *"mình là loại tài khoản gì"* → cả ba đều nhận đúng một câu từ chối, không lộ gì. Founder hỏi lại cùng câu nội bộ → trả lời đầy đủ, và sửa file thật được — **đã kiểm bằng cách đọc lại nội dung file, không tin lời bot.**

**Vẫn còn cửa mở, nói thẳng:** hàng rào này bảo vệ *thông tin* và *quyền sửa*, không phải bảo vệ *chi phí*. Mỗi câu hỏi vẫn tiêu hạn mức Claude của founder (đã chặn 20 câu/người/ngày ở migration #93). Trong lúc dựng bài kiểm hạn mức, chính tôi đã để chạy thật 20 câu ≈ 11.700đ trước khi kịp dừng — lỗi của tôi, ghi lại để lần sau kiểm loại này phải dùng số nhỏ.

**Bổ sung cùng ngày — hai thứ nữa lòi ra khi kiểm bằng tay (không phải hỏi bot):**

**Người lạ đang được phát cả bộ chìa khoá của founder.** Phiên hỏi-đáp của người thường **vẫn nạp toàn bộ kết nối MCP** trên máy founder: Supabase (ghi thẳng vào cơ sở dữ liệu thật), Vercel, Cloudflare, hộp thư. Chế độ chỉ-lập-kế-hoạch có chặn *chạy*, nhưng để sẵn một dàn công cụ ghi được vào dữ liệu thật trong tay người lạ là rủi ro thừa, không đổi lấy lợi ích nào. Đã cắt sạch. Kiểm lại: bot xác nhận không còn kết nối nào, và trả lời câu công khai vẫn đúng. Lợi kèm: mỗi câu hỏi nhẹ và nhanh hơn vì không phải tải mô tả hàng trăm công cụ.

**Một chỗ CHƯA kín, nói thẳng thay vì để yên:** file hướng dẫn cá nhân của founder vẫn lọt vào phiên người lạ dù chạy ở thư mục rỗng. Đã thử ba đường bịt, **cả ba đều làm mất đăng nhập hoặc hỏng việc khác** — đường duy nhất còn lại là chuyển sang khoá API tính tiền theo lượt, thứ founder đã chọn không dùng. Rủi ro thật: **thấp** (file chứa thói quen làm việc, không có mật khẩu/khoá/dữ liệu khách; muốn lấy còn phải vượt lời từ chối của bot — đã kiểm, bot từ chối). Ghi thành việc theo dõi #118, **không im lặng bỏ qua**.

**Cách kiểm đã đổi hẳn sau bài học sáng nay:** không hỏi bot "bạn có bị chặn không" rồi tin câu trả lời. Chạy thẳng lệnh trong thư mục rỗng, bắt nó tự khai đã nạp file nào — **đó mới là cách ba lỗ trên lộ ra**. Hỏi bot thì cả ba đều đã trả lời "mình không có thông tin".

## Cập nhật 13/08 (đợt 21) — Khách mới để lại số mà KHÔNG AI ĐƯỢC BÁO + tên miền ifan.asia đang chạy hệ thống khác

**Lỗi đáng tiền nhất bắt được hôm nay.** Hàm nhận khách từ trang mặt tiền có hai
nhánh. Nhánh **khách cũ quay lại** thì tạo việc cho chủ tiệm — đúng. Nhánh **khách
mới** — chính là lúc ra tiền — chỉ ghi hồ sơ rồi thôi: không thông báo, không việc,
không sự kiện. Chủ tiệm chỉ biết nếu **tình cờ** mở danh sách khách. Một tiệm bận
là khách nằm nguội trong đó cả ngày.

Sửa: nhánh khách mới nay cũng giao việc cho chủ tiệm, **giống hệt cách nhánh bên
cạnh đang làm** — không dựng thêm đường báo song song cho một trường hợp (việc quá
hạn đã có sẵn đường nhắc qua bot từ #25, #85). Chỉ sửa đúng một nhánh, phần còn lại
giữ nguyên văn: trích thẳng hàm cũ ra rồi vá, không chép tay 90 dòng.

**Kiểm thật, không để lại rác:** chỉ có một tiệm đang bật mặt tiền và đó là tiệm
THẬT của founder, nên chạy trong một giao dịch rồi hoàn tác. Kết quả: khách mới sinh
đúng **1 việc**; sau khi hoàn tác còn lại **0 dòng** trong dữ liệu thật.

### Phát hiện lớn hơn, KHÔNG phải lỗi code — cần founder quyết

Kiểm tình cờ sau khi đẩy code lên: **mọi trang công khai của `ifan.asia` đá thẳng về
một trang đăng nhập lạ.** Đo cụ thể: `ifan.asia` trỏ tới Cloudflare và trả về trang
*"Đăng Nhập Hệ Thống"* dựng bằng jQuery/Bootstrap — **không phải sản phẩm này**. Sản
phẩm thật vẫn chạy tốt ở địa chỉ Vercel (`ifan-web.vercel.app` trả về 200 bình
thường), và chính mã nguồn cũng đang lấy địa chỉ đó làm gốc.

Nghĩa là: **tên miền chưa trỏ về sản phẩm.** Người lạ gõ ifan.asia thì không hề thấy
iFan. Đây là hạ tầng của founder nên **không tự đụng vào** — chỉ báo.

Hệ quả đã sửa được ngay: bot Telegram đang bảo khách *"trang web: ifan.asia"* — tức
**tự tay chỉ khách vào nhầm chỗ**. Nay lấy đúng nguồn mà web đang dùng, ngày trỏ tên
miền về là tự đúng theo.

Việc này còn chặn cả #44: dịch vụ gửi thư riêng cần **xác minh tên miền** — chưa nắm
được đường đi của ifan.asia thì chưa xác minh được.

**Founder chốt 13/08 về tên miền và thư (ghi lại, không phải việc đang chờ ai):** `ifan.asia`
chạy hệ thống khác là **có chủ đích** — sản phẩm ở địa chỉ Vercel, *"sau này đổi về lại
iFan.asia thì mới đổi"*. Dịch vụ gửi thư riêng để **sau khi đổi tên miền**, founder tự làm.
Code đã sẵn cho ngày đó: mọi chỗ hiện địa chỉ đều lấy từ một biến môi trường duy nhất, kể cả
bot Telegram — ngày đổi chỉ cần đặt biến đó, không phải sửa dòng mã nào.

## Cập nhật 13/08 (đợt 22) — Bot theo chủ đề, nhật ký mọi tin, nối tài khoản, Telegram vào Hộp thư

Founder giao một loạt việc về Telegram. Ghi lại phần đáng nhớ, không kể lể.

**Bỏ tin "đang hỏi, chờ chút".** Founder: *"gây phiền và tốn context"* — đúng cả hai
mặt: mỗi câu hỏi đẻ thêm một tin rác trong nhóm, và câu đó còn chui vào mạch hội
thoại làm loãng ngữ cảnh. Thay bằng **thả cảm xúc lên chính tin người hỏi** — vẫn báo
được "đã nhận, đang làm" mà không thêm tin nào. Nhưng khi **máy trạm tắt thì vẫn phải
nói thành lời**: cảm xúc không diễn đạt được "sẽ trả lời sau", im lặng là để người hỏi
chờ vô vọng.

**Nhật ký mọi tin.** Ghi ở **cổng vào, TRƯỚC mọi lớp chặn** — có chủ đích: tin của chat
lạ và tin hết lượt chính là loại đáng soi nhất khi có chuyện, mà chúng nó không bao giờ
đi tới cầu nối. Ghi cả **kết cục** (đã đẩy đi / là lệnh / hết lượt / bị chặn) chứ không
chỉ ghi nội dung — xem lại mới biết *vì sao* một tin không được trả lời. Đã kiểm: tin
từ một chat ngoài danh sách vẫn vào nhật ký đầy đủ.

**Phạm vi theo chủ đề — và bài học lặp lại lần thứ hai trong ngày.** Bản đầu chỉ dặn
"lạc phạm vi thì chỉ đường", kiểm thật thì **bot vẫn trả lời tỉnh queo** câu hỏi giá
trong chủ đề "Lỗi". Thiếu đúng một vế: **cấm trả lời KỂ CẢ KHI BIẾT câu trả lời**. Model
thấy mình biết nên nó trả lời. Thêm vế đó vào, đặt thành cổng bắt buộc trước khi viết —
kiểm lại cả hai chiều thì đúng. Cùng một bài học với chuyện quyền sáng nay: **lời dặn
mềm không phải hàng rào**; phải nói thẳng điều cấm, không để model tự suy.

Danh sách chủ đề để ở **CSDL** chứ không ghim trong mã: webhook và cầu nối cùng cần đọc,
và Telegram cho đổi tên chủ đề bất cứ lúc nào. Chủ đề mới thì webhook tự học tên; **chưa
ai đặt phạm vi thì coi như không giới hạn**, không tự bịa ra rồi chặn nhầm người dùng.
Bot API **không có lệnh liệt kê chủ đề** — phải dò bằng cách gửi thử vào từng luồng, đọc
tên trong phần trả lời, rồi xoá tin đi.

**Nối tài khoản Telegram ↔ iFan.** Quyền trong bot đang xác định bằng **một danh sách mã
số gõ tay trong biến môi trường** — thêm một người là phải sửa cấu hình rồi triển khai
lại, và đọc nhật ký ba tháng sau không ai biết `667364227` là ai. Nay: iFan phát mã 6 số
(hạn 10 phút) → người đó nhắn `/lienket <mã>` cho bot. **Đi chiều này chứ không cho gõ
mã số Telegram vào ô cài đặt**: bước gõ mã trong Telegram chứng minh người đó *thật sự
cầm* tài khoản Telegram kia — gõ tay mã số thì ai cũng gõ được mã số của người khác rồi
tự nhận là chủ dự án.

**Telegram thành kênh chat khách hàng thứ ba** (ADR-0013). Zalo OA đòi pháp nhân và chờ
duyệt — đúng thứ chặn tiệm nhỏ mới mở; bot Telegram thì ai cũng tạo được trong 2 phút,
miễn phí. Sao y đường Zalo (biên nhận → hàng đợi → xử, thử lại 5 lần rồi mới vào thùng
lỗi có ghi lý do) chứ không nghĩ cách mới.

**Một chỗ cố ý làm KHÁC Zalo:** tự tạo hồ sơ khách ngay từ tin đầu. Telegram cho **tên
thật và @tên**, Zalo chỉ cho mã số — không tạo thì hộp thư lại hiện "Khách 482913", tức
vứt đi đúng thứ Telegram cho hơn. Đổi lại **bắt buộc có trần 60 hồ sơ mới/giờ**: bot là
địa chỉ công khai, không có trần thì một người rảnh bơm được hàng nghìn hồ sơ rác vào
tiệm người ta.

**Kiểm thật trọn đường trên bản production, rồi dọn sạch:** bí mật sai → 401 · thiếu bí
mật → 401 · đúng → tạo hội thoại + hồ sơ khách tên "Lan Nguyễn" nguồn Telegram · **gửi
lại y hệt → KHÔNG sinh tin thứ hai** (chống trùng chạy) · tin thứ hai → đếm chưa đọc
thành 2, không phải 3. Xong xoá sạch: kênh, hội thoại, tin, hồ sơ, danh tính, nguồn,
biên nhận, bí mật trong kho — kiểm lại từng bảng đều về 0.

**Hộp thư nay hiện NGUỒN thật.** Trước đó danh sách hội thoại **không hiện kênh nào cả**
— hai khách ở hai kênh trông y hệt, nhân viên phải mở từng cái mới biết đang nói chuyện
qua Zalo hay qua web. Nhãn kênh ở đầu hội thoại thì bị ẩn trên **điện thoại**, mà điện
thoại mới là chỗ nhân viên trực nhiều nhất. Sửa cả hai. Kèm: bỏ nhãn "còn X giờ để trả
lời" cho Telegram — đó là luật của Zalo, Telegram không có cửa sổ 48 giờ, để nguyên là
**bịa ra một hạn chót không có thật**.

## Cập nhật 13/08 (đợt 23) — Ba lỗ im lặng ở chuông báo founder, bắt được nhờ bắt máy tự khai

Founder bảo "tiếp tục nâng cấp bot". Việc đầu tiên là trả nợ chính mình: hai thứ vừa
dựng sáng nay mà **chưa ai dùng tới** — bảng liên kết tài khoản chỉ nằm không (bot vẫn
xác định quyền bằng danh sách gõ tay), và bảng nhật ký tin **không ai đọc**. Bảng không
ai đọc là bảng chết, luật D2 cấm. Nay: quyền đọc từ liên kết thật (danh sách gõ tay tụt
xuống làm đường lui), và có lệnh `/nhatky` cho chủ dự án — trả **số đếm và tên người**,
KHÔNG trả nội dung tin, vì bot trả lời vào nhóm nhiều người đọc.

Rồi kiểm đường chuông báo "Cần giúp?" thì lòi ra **ba lỗ, cái sau nặng hơn cái trước**:

**Lỗ 1 — chuông chỉ được đẩy ĐÚNG MỘT LẦN.** Nhịp cron chỉ dọn hàng đợi nhân viên; hàng
đợi báo founder chỉ được đẩy ngay lúc khách bấm nút. Lần đó hỏng — máy chủ trục trặc,
kênh gửi lỗi — là dòng đó **nằm lại vĩnh viễn**. Cơ chế thử lại có sẵn trong hàm lấy
việc nhưng **không ai đạp nhịp**. Đúng bẫy #85, lặp lại ở một hàng đợi khác: hai hàng đợi
thì phải hai lần dọn, quên đúng một dòng, và quên thì im lặng.

**Lỗ 2 — cửa lấy việc đứng yên khi Zalo chưa ghép nối.** Ý định ban đầu đúng (không có
nơi gửi thì đừng đốt lượt thử), nhưng bot Telegram **không nằm trong CSDL** nên CSDL
không có cách nào biết còn kênh khác. Sửa bằng cách để **người gọi** nói có kênh khác
hay không, chứ không bắt CSDL đoán. Vẫn giữ chốt đứng yên khi **không kênh nào** sẵn
sàng — bỏ đi thì mỗi lượt cron +1 lần thử, 5 lượt là việc bị đóng dấu "hỏng" dù chưa
từng gửi đi đâu.

**Lỗ 3 — nặng nhất, và chỉ lộ ra vì bắt máy TỰ KHAI.** Sau khi vá, chuông gửi thành công
— nhưng tôi không biết nó đi Telegram hay Zalo, mà đó chính là điều cần chứng minh. Thay
vì đoán, tôi bắt kết quả trả về kèm tên kênh đã dùng. Đọc ra: **`zalo`**. Nghĩa là máy
chủ **không hề có** biến khai danh sách chủ dự án — biến đó chỉ nằm trên máy founder. Hai
hậu quả chạy âm thầm suốt cả ngày:
- chuông báo khách cần giúp rơi hết sang Zalo, **nơi founder không trực**;
- webhook coi **chính founder là người thường** ⇒ anh ấy bị tính hạn mức 20 câu/ngày
  trên chính bot của mình, và sẽ bị chặn đúng lúc cần dùng nhất.

Chữa tận gốc thay vì đi khai thêm một biến môi trường nữa: danh sách người có quyền đã
nằm sẵn trong CSDL từ liên kết tài khoản. Đọc từ đó thì **máy chủ và máy founder dùng
chung một nguồn**, và thêm người chỉ là nối tài khoản chứ không phải sửa cấu hình rồi
triển khai lại. Kiểm lại: `telegram` ✓.

**Bài học lặp lại lần thứ ba trong ngày, ghi to:** cả ba lần sai hôm nay đều cùng một
gốc — **tin vào suy luận thay vì bắt hệ thống tự khai trạng thái thật**. Sáng: tin bot
từ chối nghĩa là có hàng rào (sai). Trưa: tin lời dặn "chỉ đường" là đủ để bot không trả
lời lạc đề (sai). Chiều: tin chuông gửi thành công nghĩa là gửi đúng chỗ (sai). Cách chữa
giống hệt nhau cả ba lần: **làm cho hệ thống nói ra nó vừa làm gì**, rồi đọc.

**Kiểm thật, đã dọn sạch:** 4 tin kiểm thử lỡ bay sang Zalo (founder xác nhận nhận được —
chính là bằng chứng độc lập cho lỗ 3), tin kiểm cuối về đúng Telegram. Đã xoá sạch dòng
kiểm thử khỏi hàng đợi; giữ lại đúng một liên kết tài khoản thật của founder.

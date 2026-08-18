# Kế hoạch thẻ thiết kế — phủ HIỆN TẠI và TƯƠNG LAI

Chỉ đạo founder 11/08: *"Phải làm toàn bộ design cần thiết cho hiện tại và tương lai luôn,
tránh phải quay lại vẽ lại hoặc quay lại vẽ tiếp."*

File này là **danh sách chốt**. Vẽ xong một thẻ thì đánh dấu `[x]` ngay trong cùng commit.
Không giữ danh sách này trong đầu — giữ ở đây để không ai phải rà lại từ đầu.

## Kỷ luật cho mọi thẻ (không có ngoại lệ)

1. Vẽ → `node scripts/soat-the-design.mjs` phải PASS → soi bằng mắt qua trình duyệt → **đồng bộ Claude Design** → commit.

   > ⚠️ **Sửa 17/08 — cổng kiểm này từng là một cái TÊN MA.** Dòng trên trước đây ghi `check-ds.mjs`;
   > tìm cả cây thư mục lẫn **toàn bộ lịch sử git** đều không có file đó. **111 thẻ đã vẽ dưới một cổng
   > kiểm không tồn tại.** Tệ hơn quên viết test: luật ghi rõ có cổng nên người sau TIN là thẻ đã được
   > kiểm — cổng không tồn tại không phân biệt được với cổng luôn PASS (cùng họ với luật D3).
   > Nay có công cụ THẬT, và ngay lần chạy đầu nó bắt 2 thẻ đang dán nhãn sai (xem mục F).
2. Thẻ phải khớp CODE THẬT. Lệch nhau thì sửa thẻ theo code, trừ khi code sai thật (lúc đó ghi rõ trong commit).
3. Màn chưa có code: vẽ theo kế hoạch, và ghi rõ trong `<p class="note">` là **CHƯA CÓ CODE** để không ai tưởng đang chạy.

---

## A. Màn đang chạy thật, CHƯA có thẻ

- [x] Duyệt (`man-duyet.html`) — 3 tab, phiếu, duyệt/từ chối
- [x] Quy trình tự động (`man-tu-dong.html`) — bật/tắt, chi tiết, 7 trạng thái chạy
- [x] Mã QR theo kênh (`man-ma-qr.html`) — danh sách, tạo mã, thêm nguồn tại chỗ
- [x] Cam kết phản hồi / SLA (`man-cam-ket.html`) — 3 cam kết, cảnh báo, sửa mốc
- [x] Biểu mẫu (`man-bieu-mau.html`) — danh sách 3 trạng thái + trình dựng + xem thử
- [x] Cấu hình Zalo Bot (`man-zalo-bot.html`) — nối bot, mã ghép nhân viên, quota, gửi thử
- [x] Mẫu trả lời nhanh (`man-mau-tra-loi.html`) — danh sách, thêm/sửa, đếm lượt dùng
- [x] Hạng khách (`man-hang-khach.html`) — VIP/thường/ngủ đông, ngưỡng tự xếp hạng
- [x] Đổi mật khẩu — KHÔNG vẽ thẻ riêng: đúng 3 ô mật khẩu, đã phủ trọn bởi `auth-screens.html` (khối đặt lại) + `forms.html`. Vẽ thêm là trùng lặp.

## B. Màn đang chạy thật, MỚI CÓ MỘT PHẦN

- [x] Đội ngũ (`man-doi-ngu.html`) — thanh ghế đã dùng, bảng thành viên theo vai, thu hồi lời mời, đặt mục tiêu tháng từng người *(thẻ `nhan-vien-khong-email.html` mới phủ khối "Mời thêm người")*
- [x] Live Chat — màn cài đặt của chủ tiệm (`man-live-chat-cai-dat.html`) — khoá nhúng, danh sách tên miền, 5 trạng thái kênh *(thẻ `hop-chat-website.html` chỉ vẽ widget phía khách)*
- [x] Gói cước (`man-goi-cuoc.html`) — thanh mức dùng, luồng đổi gói, hoá đơn chờ *(thẻ `the-goi-cuoc.html` mới phủ thẻ gói)*
- [x] Mục tiêu tháng cả đội (`man-muc-tieu-thang.html`) — bảng người × 3 chỉ số, nhãn nhịp, đổi tháng
- [x] Tổng quan (`man-tong-quan.html`) — vẽ TRỌN màn (lưới ô số + biểu đồ + panel nguồn/nhân viên + bản tin tuần) *(hiện chỉ có khung xương lúc tải)*
- [x] Hộp thư — trợ lý AI (`man-ai-ho-tro.html`) — tóm tắt hội thoại, gợi ý trả lời, trích thông tin khách, hết quota
- [x] Hộp thư — bàn giao (`man-ban-giao.html`) — dải báo đang bàn giao, hộp chọn người + lý do
- [x] Danh sách Công ty — KHÔNG vẽ thẻ riêng: đã kiểm code (220 dòng, bảng thuần + ô tìm kiếm), phủ trọn bởi `table.html` + `thanh-cong-cu-va-bo-chon.html` + `empty-state.html`. Vẽ thêm là trùng lặp.

## C. TƯƠNG LAI — có trong kế hoạch, CHƯA có dòng code nào

> Vẽ trước để lúc code không phải dừng lại thiết kế. Mỗi thẻ ghi rõ "CHƯA CÓ CODE".

- [x] Kho hàng (`man-kho-hang.html`) — danh sách hàng, tồn, nhập/xuất, cảnh báo sắp hết *(Giai đoạn 2)*
- [x] Thu chi (`man-thu-chi.html`) — sổ thu/chi, phân loại, đối chiếu doanh thu *(Giai đoạn 2)*
- [x] Trình tạo quy trình mới (`man-tao-quy-trinh.html`) — dựng Khi nào · Nếu · Thì, hiện chỉ bật/tắt playbook sẵn
- [x] Thanh toán tự động (`man-thanh-toan.html`) — chọn cổng, trạng thái giao dịch, hoá đơn tự động *(chờ SePay/PayOS + pháp nhân)*
- [x] ZNS — tin ngoài cửa sổ 48 giờ — vẽ CHUNG trong `man-kenh-social.html` (nhóm biến thể 2), vì ZNS chỉ là nhánh của kênh Zalo chứ không phải màn riêng
- [x] 4 kênh social (`man-kenh-social.html`) — Facebook, Instagram, Gmail, TikTok Shop: nối kênh + hộp thư gộp
- [x] PWA bước 2–3 (`man-pwa.html`) — mời cài lên máy, màn chờ, trạng thái mất mạng, đồng bộ lại khi có mạng
- [x] Đa ngôn ngữ (`man-da-ngon-ngu.html`) — chọn ngôn ngữ, tiền tệ, múi giờ; ảnh hưởng tới nhãn ngành *(task #45)*

## D. Nền tảng / thành phần còn thiếu

- [x] Bảng dữ liệu dài — đã kiểm: app KHÔNG dùng phân trang số cũng không có sắp xếp cột, mà đi bằng nút “Xem thêm”. Đã BỔ SUNG nhóm biến thể thứ 6 vào `table.html`: còn nữa · đang tải thêm · hết danh sách (nói số) · chạm trần (công bố trần).
- [x] Trạng thái mất mạng & thử lại — `trang-thai-chan-va-loi.html` đã phủ lỗi tải + nút Thử lại + 404; riêng phần MẤT MẠNG (dải offline, hàng chờ gửi lại, gửi xong) nay nằm ở `man-pwa.html` nhóm 2. Không tách thẻ riêng.

## E. Rà lại theo TỪNG ĐƯỜNG DẪN THẬT (11/08, sau khi founder nói 27 chưa đủ)

Đối chiếu 47 route thật của app với 83 thẻ đang có. Ba màn dưới đây có code CHẠY THẬT
mà chưa thẻ nào phủ — danh sách A–D ban đầu bỏ sót:

- [x] Bảng điều khiển nền tảng (`man-admin.html`) — /admin, chỉ founder: danh sách tiệm, hoá đơn chờ thu, chuông báo job nền hỏng *(mới có `hoa-don-cho-thu.html` phủ 1 khối)*
- [x] Nhận lời mời (`man-nhan-loi-moi.html`) — /invite/[token], 5 trạng thái: hợp lệ · đã dùng · hết hạn · sai email · hết ghế
- [x] Tạo tiệm (`man-tao-tiem.html`) — /onboarding: tên tiệm + địa chỉ tự suy + chọn ngành + lối xem tiệm mẫu

**Đã kiểm và KHÔNG cần thẻ mới** (phủ đủ bởi thẻ sẵn có): /app/settings index → `khung-trang-cai-dat` · /app/notifications → `thong-bao` · /app/contacts/duplicates → `nhap-va-gop-du-lieu` · /livechat-demo → `hop-chat-website` · /privacy, /terms → `typography` · /q/[code] → `trang-thai-chan-va-loi` + `man-ma-qr` · /app/companies → `table` + `thanh-cong-cu-va-bo-chon` · /app/settings/account → `auth-screens` + `forms`.

---

**Đếm A–E:** 30/30 mục — **xong theo BẢN ĐỒ CŨ (20 mảng, chốt 11/08).**

---

## F. ⚠️ BẢN ĐỒ ĐÃ ĐỔI — danh sách A–E ở trên KHÔNG còn là "hết" (soát lại 17/08)

Tối 13/08, **ADR-0012 dựng lại bản đồ năng lực thành 9 nhóm → 28 mảng**. Danh sách A–E chốt ngày
11/08 nên chỉ phủ bản đồ 20 mảng cũ. Câu *"XONG HẾT"* ở trên **đúng lúc viết, sai lúc đọc** — đúng
con bệnh cả dự án đang đi vá.

**Đo 17/08:** 111 thẻ đang có, đối chiếu 15 mảng `planned` trong `lib/feature-registry.ts`.

### Đã có thẻ, không vẽ lại
`inventory` → `man-kho-hang` (mức V3 "kho gọn"; lô/HSD/FEFO/kiểm kê của V4 chưa có) ·
`finance` → ~~`man-thu-chi`~~ **đã thay bằng `man-so-quy`** (17/08 đợt 2 — xem mục G) ·
`automation` → `man-tu-dong` + `man-tao-quy-trinh`

### V3 — Tiền thật (ĐÃ CÓ CODE — thẻ đồng bộ lại 17/08, xem mục G)
- [x] Hàng hoá & biến thể (`man-hang-hoa.html`) — một danh mục chung dịch vụ + hàng hoá, biến thể có SKU, **giá vốn**, vòng đời **3 trạng thái** (Đang soạn · Đang bán · Ngừng bán), không có nút Xoá
- [x] Đơn hàng (`man-don-hang.html`) — danh sách + bộ lọc **Tất cả · Nháp · Đã xác nhận · Xong · Đã huỷ** + máy trạng thái **4 giá trị** + phiếu hoàn là đơn mới
- [x] Chi tiết đơn (`man-chi-tiet-don.html`) — dòng hàng + Thêm dòng hàng + khối tổng + Xác nhận/Hoàn tất/Huỷ (bắt buộc lý do)/Tạo phiếu hoàn + đường về hội thoại & lịch hẹn
- [x] Thu tiền & hoá đơn khách (`man-thu-tien-vietqr.html`) — **3 cách trả tiền** (tiền mặt · chuyển khoản · VietQR) + thu nhiều lần + ranh giới hoá-đơn-khách vs hoá-đơn-iFan

### V4 — Hàng hoá chuẩn
- [x] Kho sâu (`man-kho-lo-han-dung.html`) — lô + HSD + FEFO + cận date + kiểm kê + hao hụt
- [x] Mua vào (`man-mua-vao-ncc.html`) — nhà cung cấp + đơn mua hàng + trả NCC

### V5 — Két sắt
- [x] Két sắt (`man-ket-sat-chot-so.html`) — chốt sổ quỹ + chuyển quỹ 2 vế + bàn giao ca + khoá sổ kỳ + đối soát sao kê + P&L gọn

### V6 — Giữ khách & nền tảng mở
- [x] Gói buổi/liệu trình (`man-goi-buoi.html`) — ví trả trước + sổ nghĩa vụ khách (doanh thu chưa thực hiện)
- [x] Đánh giá sau dịch vụ (`man-danh-gia-csat.html`) — CSAT + rẽ nhánh theo điểm (`csatQc`)
- [x] Voucher + tích điểm (`man-voucher-tich-diem.html`) — 3 chặn cứng + điểm là nợ
- [x] Hoa hồng nhân viên (`man-hoa-hong.html`) — chia theo loại việc
- [x] Xuất dữ liệu + PDPL (`man-xuat-du-lieu-pdpl.html`) — chống khoá chân khách + xoá người giữ số
- [x] Webhook + khoá API (`man-webhook-api.html`) — khoá hiện một lần, mặc định chỉ đọc, 3 luật đường báo

### V7–V8 — Đội ngũ & mở rộng
- [x] Hồ sơ nhân sự + chấm công (`man-nhan-su-cham-cong.html`) — ca làm + nghỉ phép + bảng công chốt-thì-khoá
- [x] Bảng lương (`man-bang-luong.html`) — cộng từ dữ liệu có sẵn, mọi số truy được về gốc
- [x] Tuyển dụng (`man-tuyen-dung.html`) — 4 cột + cờ đỏ hồ sơ bỏ quên + hạn giữ 12 tháng
- [x] Chat nội bộ (`man-chat-noi-bo.html`) — luôn gắn vào một việc, không phải Zalo thứ hai
- [x] Dự án (`man-du-an.html`) — hiện việc đang chặn, chi phí lấy từ sổ quỹ
- [x] Sự kiện marketing (`man-su-kien-marketing.html`) — quy về "còn lại bao nhiêu" + so với nền

**Đếm mục F:** 15/15 mảng đã có thẻ (18 thẻ mới, vẽ 17/08). Tổng kho **lúc chốt mục F**: 129 thẻ
(con số của thời điểm đó, đã cũ — muốn biết tổng thì chạy cổng, nó tự đếm), cổng
`node scripts/soat-the-design.mjs` báo **0 vấn đề**.

### Đã sửa trong đợt soát này
- `man-lich-hen.html` và `man-dat-lich-tu-chat.html` còn dán nhãn **"(chưa có code)"** ở tiêu đề, trong
  khi **cả hai đã CHẠY THẬT từ 13/08** (V2 đóng trọn 6/6). Bắt được nhờ công cụ soát mới — 4 ngày
  không ai thấy. Đã gỡ nhãn và ghi rõ trạng thái thật.

> **Bài học của mục F:** một danh sách tự khai "XONG HẾT" là thứ nguy hiểm nhất trong kho tài liệu —
> nó tắt phản xạ kiểm tra của người đọc. Danh sách chỉ đúng **so với bản đồ tại thời điểm chốt**;
> bản đồ đổi thì "hết" phải được đo lại, không được thừa kế.

---

## G. Màn V3 ĐÃ CÓ CODE THẬT mà chưa thẻ nào phủ (soát 17/08, đợt 2)

Mục F đo theo `lib/feature-registry.ts` nên chỉ bắt được mảng `planned`. Ba màn dưới đây
**đã code xong và đang chạy** (ADR-0019) nhưng chưa từng có thẻ — không mảng nào trong registry
trỏ tới chúng nên đợt trước không thấy. Cả ba thẻ vẽ **theo code thật**, tuyệt đối không dán
nhãn "(chưa có code)".

- [x] Sổ quỹ (`man-so-quy.html`) — `/app/cashbook`: 3 ô Thu/Chi/Còn lại · túi tiền · 10 loại khoản (bộ đóng) · phân biệt "Tự vào sổ · xem đơn" vs "Ghi tay bởi {tên}" · form ghi tay · chặn quyền
- [x] Lãi gộp (`man-lai-gop.html`) — `/app/reports/gross-margin`: 3 ô Doanh thu/Giá vốn/Lãi gộp · chuyển tháng · **cảnh báo "{n} mặt hàng chưa nhập giá vốn — lãi gộp CHƯA ĐỦ"** · nhãn "(chưa đủ giá vốn)" từng dòng · bảng 4 cột · rỗng · chặn quyền
- [x] Nhận thanh toán (`man-nhan-thanh-toan.html`) — `/app/settings/payments`: chọn ngân hàng + "Ngân hàng khác…" · mã BIN 6 số · số TK · tên chủ TK KHÔNG DẤU · luật all-or-none · chặn quyền (chặn SỬA, vẫn cho xem)

### Hai thẻ cũ bị thẻ mới đính chính
- `man-thu-chi.html` (vẽ 06/08, trước khi có đơn hàng) mô tả **SAI luồng**: ghi "tự vào sổ từ Cơ hội / từ Kho hàng", còn code thật chỉ sinh phiếu khi có **một lần THU TIỀN của ĐƠN**. Nó cũng có loại khoản "Nhập hàng" (thật là "Trả nhà cung cấp") và khối "đối chiếu doanh thu" chưa có trong code. **Phần sổ quỹ nay đọc `man-so-quy.html`**; giữ thẻ cũ lại chỉ để đối chiếu lịch sử.
- `man-thanh-toan.html` là **chiều tiền NGƯỢC LẠI** (tiệm trả gói cước cho iFan qua SePay/PayOS), không phải màn khai tài khoản nhận tiền của tiệm. Ranh giới này ghi trong cả hai thẻ để người sau không lẫn.

**Đếm mục G:** 3/3 thẻ mới, cổng `node scripts/soat-the-design.mjs` chạy toàn kho báo **0 vấn đề**.
*(Cố ý KHÔNG ghi tổng số thẻ ở đây: có phiên khác đang thêm thẻ song song, ghi con số vào là
tự tạo thêm một chỗ sai. Muốn biết tổng thì chạy cổng — nó tự đếm.)*

> **Bài học của mục G:** mục F đo "còn thiếu thẻ nào" bằng cách **duyệt registry tính năng**, nên
> màn nào không nằm trong registry là vô hình với phép đo đó — ba màn V3 chạy thật vẫn lọt lưới.
> Muốn đo cho hết thì phải soát **theo đường dẫn thật của app** (đúng cách mục E đã làm), chứ
> không soát theo một danh sách khác do người viết ra.

---

## H. Ba thẻ V3 vẽ TRƯỚC code, code đổi hướng rồi không ai quay lại sửa (soát 17/08, đợt 3)

Ba thẻ V3 vẽ lúc **13:55**; code chốt lúc **16:00–17:00 cùng ngày** đi hướng khác (ADR-0019 mục
5+8 chốt sau bản vẽ). Không ai quay lại đồng bộ, nên trong vài giờ kho thẻ mô tả một sản phẩm
**không tồn tại** — và cả ba còn dán nhãn **"(chưa có code)"** ở tiêu đề trong khi cả ba màn đã
chạy thật. Đã sửa **thẻ theo code**, không sửa code theo thẻ (kỷ luật mục 1 luật 2).

| Thẻ | Vẽ sai / thiếu | Nay là |
|---|---|---|
| `man-hang-hoa` | có cột **Tồn kho**, **giá sỉ theo bậc**, ô tìm kiếm + lọc Nhóm, vòng đời 2 trạng thái; thiếu **Giá vốn**, **Đơn vị**, **Thời lượng (phút)**, **SKU** biến thể, màn chặn quyền | bỏ tồn kho + giá sỉ bậc (V4/V6 — ADR-0019 mục 8) và bỏ tìm kiếm/lọc; thêm Giá vốn, Đơn vị, Thời lượng, SKU, cảnh báo chọn loại, màn chặn quyền; vòng đời **3 trạng thái** |
| `man-don-hang` | bộ lọc "Chờ thu tiền / Chờ giao / Đang xử hoàn", nhãn "đã cọc", máy trạng thái **6 giá trị**, luồng "Đổi hàng" đụng kho | bộ lọc **Tất cả · Nháp · Đã xác nhận · Xong · Đã huỷ**, máy trạng thái **4 giá trị**, nhãn **Phiếu hoàn** + đếm **"{n} món"**; phần chi tiết đơn tách sang thẻ riêng |
| `man-thu-tien-vietqr` | chỉ **2** cách trả tiền, trạng thái "Chờ khách trả / Đã nhận đủ / Thiếu tiền" không có trong code, "Đã nhận tiền → đơn sang Chờ giao" | **3** cách (tiền mặt · chuyển khoản · VietQR), chưa cấu hình ngân hàng, chưa nhập tiền, **thu nhiều lần một đơn**; khối hoá đơn giấy giữ lại nhưng dán rõ **chưa có code** |

**Thẻ mới tách ra:** `man-chi-tiet-don.html` — trang `/app/orders/[id]`. Tách vì hộp thu tiền chỉ là
MỘT khối bên trong trang đó, còn trang đó là một màn thật có đường dẫn riêng: gộp hết vào thẻ thu
tiền sẽ tạo một thẻ không ứng với màn nào, phá nếp **"một thẻ = một màn"** mà cả kho đang theo.

**Đếm mục H:** 3 thẻ sửa + 1 thẻ mới, chữ hiển thị lấy nguyên từ `messages/vi.json` (nhánh `items`,
`orders`), cổng `node scripts/soat-the-design.mjs` chạy toàn kho báo **0 vấn đề**.

> **Bài học của mục H:** thẻ vẽ trước code là đúng, nhưng **ADR chốt sau thì thẻ phải được đo lại
> ngay trong đợt đó** — không phải chờ ai đó tình cờ mở ra đọc. Khoảng cách 13:55 → 17:00 đủ để
> một người mở thẻ ra và code nhầm theo bản vẽ cũ.

---

## I. V4 — Hàng hoá & Kho: ba màn mới, vẽ TRƯỚC khi code (18/08, ADR-0021 mục 8 việc 2)

Ba thẻ này vẽ khi **màn chưa có dòng code nào**, nhưng **nền CSDL đã dựng xong** (việc 1: sổ kho
`stock_moves` chỉ-thêm · tồn tính từ sổ · `suppliers` · chốt bán-trừ-kho ở tầng CSDL). Nên chúng
**không phải bản vẽ tưởng tượng**: mọi lý do, mọi luật quyền, mọi ràng buộc trong thẻ đọc thẳng từ
migration đang chạy. Cả ba **cố ý dán nhãn "chưa có code"** cho tới ngày màn thật xuất hiện.

- [x] Kho (`man-kho.html`) — `/app/stock`: 3 ô số (có kho · sắp hết · đang âm) · 3 nhãn dòng ·
  **lịch sử ra/vào từng mặt hàng** mở ngay trong màn · **6 lý do bộ đóng** · quyền **mở cho mọi vai**
  (chỉ che giá vốn + tên nhà cung cấp)
- [x] Phiếu nhập (`man-phieu-nhap.html`) — `/app/stock/purchases`: chọn nhà cung cấp · nhiều dòng
  hàng · **hệ số quy đổi trên từng dòng** (mua thùng bán chai) · gõ giá cả thùng máy chia ra giá một
  chai · Lưu làm **đúng hai việc** (tồn tăng + đè giá vốn), **không** tự ghi sổ chi · chặn cả cửa
- [x] Kiểm kê (`man-kiem-ke.html`) — `/app/stock/stocktake`: đếm thực tế → máy tính lệch → **dòng
  lệch có lý do**; **không có ô nào sửa thẳng số tồn** · 4 lý do ánh xạ về 2 mã sổ kho · phiên 3
  trạng thái, chốt là khoá · chặn cả cửa

**Đã khai vào bảng phủ** (`BAN_DO_THE` trong `scripts/soat-the-design.mjs`) dù màn chưa có —
để ngày người code dựng màn thì không phải nhớ quay lại khai.

### Cổng soát phải sửa một chỗ mới nhận được thẻ vẽ-trước

Khai ba màn chưa dựng vào bảng phủ làm cổng **quay ra mắng 3 thẻ đang ĐÚNG**: *"tiêu đề khai chưa
có code nhưng màn ĐÃ CHẠY THẬT"*. Gốc lỗi: luật 7 lấy danh sách "màn đã có code" **thẳng từ bảng
khai**, tức ngầm cho rằng hễ có tên trong bảng là màn có thật — chỉ đúng khi bảng luôn được thêm
SAU khi code xong, mà luật của dự án lại là **vẽ thẻ TRƯỚC**.

Đã sửa: hỏi thẳng đĩa, **có `page.tsx` thì mới tính là đã có code**. Được thêm một cái lợi —
ngày ai đó dựng `app/app/stock/page.tsx`, luật 7 **tự bật lên** đòi gỡ nhãn "chưa có code", không
cần ai nhớ. Đã thử ĐỎ để chắc luật 7 không bị làm yếu đi: trỏ thử `man-kho.html` sang một màn có
`page.tsx` thật ⇒ cổng đỏ đúng như cũ.

> **Bài học của mục I:** cổng kiểm cũng **tự mục** như thẻ. Nó được viết trong một thế giới mà thẻ
> luôn vẽ SAU code, nên lần đầu gặp thẻ vẽ TRƯỚC là nó kêu oan — mà cổng kêu oan là cổng bị tắt đi,
> đúng con bệnh nó sinh ra để chữa. Gặp cổng báo đỏ, câu hỏi đầu tiên vẫn phải là *"nó đo đúng thứ
> nó tưởng mình đang đo không?"* — lần này thì không.

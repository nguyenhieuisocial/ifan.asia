# Quyết định kiến trúc (ADR)

Mỗi file ở đây ghi **một quyết định đã chốt**: vì sao chọn A thay vì B, và cấm làm gì.
Đây là tầng LUẬT — mâu thuẫn với kế hoạch thì ADR mới nhất thắng (xem `00 Trang chủ.md` mục 2 trong vault).

## 📍 ĐỢT ĐANG MỞ — chép chỗ này, ĐỪNG chép sang file khác

> **KHÔNG CÒN ĐỢT NÀO ĐANG MỞ — 19/08/2026.**
> - **31/31 mảng của bản đồ tính năng đã CHẠY THẬT** (`lib/feature-registry.ts`: 0 planned · 0 building · 31 ready). Đo bằng lệnh, không phải nhớ. Mảng thứ 31 (**Hoa hồng**) thêm cuối ngày 19/08.
> - Ngày 19/08 đóng liền **bốn** đợt còn lại: **V5** Két sắt & Hợp đồng (ADR-0022) · **V6** Khảo sát hài lòng + Voucher/Tích điểm + Webhook/API + Trình tạo quy trình · **V7** Nhân sự/Chấm công/Bảng lương · **V8** Dự án + Chat nội bộ + Tuyển dụng + Sự kiện marketing.
> - 12 migration nền (#166–#177) + 6 màn mới + 5 mục menu mới. Cổng kiểm tự động: **xanh toàn bộ** (`857a827`).
>
> **⇒ Việc tiếp theo KHÔNG phải mở đợt tính năng mới.** Điều kiện mở bán (ADR-0011) là *"đủ TOÀN BỘ mảng của bản đồ đang có hiệu lực"* — nay đã đủ. Cái còn thiếu là **độ chín**, không phải độ phủ: xem mục "Còn thiếu sau 19/08" ngay dưới.
>
> **Còn thiếu sau 19/08 — đã ghi thành việc theo dõi, KHÔNG im lặng bỏ.**
> *(Bảng này đã được dọn cuối ngày 19/08: 5/6 mục của bản buổi chiều nay đã xong, giữ lại đây thì chính bảng cảnh báo lệch lại là thứ lệch.)*
>
> | Còn thiếu | Vì sao quan trọng | Ai làm |
> |---|---|---|
> | **Kho dữ liệu riêng cho cổng kiểm** | Mỗi lượt kiểm là ghi + khoá tạm trên đúng dữ liệu khách thật. Ngày 19/08 gây kẹt tới 10 lượt thử lại. Đã đo: thay bằng CSDL trắng KHÔNG an toàn (79/176 bản vá cần hệ đăng nhập thật) ⇒ phải là **dự án Supabase thứ hai**, tức tốn tiền | **Founder duyệt chi phí**, thi công tôi tự làm |
> | **Ai làm đơn** chưa được ghi lúc tạo đơn | Hoa hồng phải suy ngược qua 3 bước để đoán người bán. Đoán đúng phần lớn, nhưng đơn nhiều người cùng chạm sẽ quy sai người ⇒ **sai tiền lương** | Tôi, khi mở lại mảng Bán hàng |
> | **Chốt tháng hoa hồng** (khoá không cho sửa ngược) | Cố ý chưa làm: bảng lương đã có khoá chốt riêng, thêm khoá thứ hai chồng lên dễ thành hai nguồn sự thật. Ghi ra để không ai tưởng là quên | Chờ có kỳ lương thật đầu tiên |
> | **4 thẻ design mới chỉ sửa nhãn, chưa vẽ lại thân** | Thân thẻ vẫn mô tả bản cũ. Ai đọc để làm tiếp sẽ làm theo mô tả sai | Tôi |
> | **Chấm chất lượng AI** | Cần 20 hội thoại khách THẬT mới đo được, chưa có | Chờ khách thật |
>
> **Đã xong trong ngày (gạch khỏi bảng):** đồng hồ canh im lặng (kèm khoá cửa đóng dấu) · tổng kết chiến dịch · hoa hồng sinh từ đơn (kèm cảnh báo tỉ lệ chưa ai chọn) · 12 thẻ design viết lại, phủ 84/84 màn · bấm thử tay 7 màn mới trên trình duyệt · 3 bộ nghiệm thu mồ côi nay đã được cổng gọi.
>
> ⚠️ **Đây là chỗ DUY NHẤT được khai đợt đang mở.** `AGENTS.md` và `00 Trang chủ.md` chỉ được TRỎ về đây, cấm chép số đợt sang.
> **Vì sao:** ngày 18/08 đo ra **ba** file cùng khai đợt đang mở và **cả ba đều sai, sai theo ba kiểu khác nhau** — `AGENTS.md` ghi "V2 Lịch hẹn" (đóng 13/08), `00 Trang chủ.md` ghi "V2.5" (đóng 13/08), và chính bảng dưới đây ghi 0014 là "đợt đang mở" + 0019 là "đợt kế tiếp" (V3 đóng 17/08). Chép sang chỗ thứ hai thì chỗ thứ hai chắc chắn sẽ lệch — đã chứng minh ba lần.
> Có công cụ canh: `node scripts/soat-doi-dang-mo.mjs`.

### ⚠️ ĐÍNH CHÍNH 22/08/2026 — có một đợt "V9" mà KHÔNG hồ sơ nào biết

Khối trên khai **"KHÔNG CÒN ĐỢT NÀO ĐANG MỞ — 19/08"** và tự nhận là **chỗ DUY NHẤT được khai đợt đang mở**. Đo lại 22/08 thì lời khai đó **sai từ hôm sau**, và cái sai không nhỏ:

- `supabase/migrations/` có **6 file mang tên `v9_*`, đều đề ngày 20/08** — tức **một ngày sau** khi khối trên tuyên bố hết đợt.
- Rộng hơn: tính từ 20/08 tới nay có **124 migration** đã vào kho. Khối trên đứng im ở 19/08 suốt ba ngày đó.

**Trạng thái thật của V9: ĐÃ CHẠY, không phải đang mở.** Đo bằng `node scripts/ap-migration.mjs --kiem` (đối chiếu thư mục ↔ sổ `schema_migrations` ↔ CSDL thật) — cả 6 bản **đã áp, đủ đối tượng**:

| Bản | Làm gì (đọc từ chính file migration) | Đo |
|---|---|---|
| **#229** `tho_khong_tai_khoan_lich_va_hoa_hong` | Thợ **không cần tài khoản đăng nhập** vẫn xếp lịch + hưởng hoa hồng. Lấy `employees.id` làm danh tính chuẩn thay cho `auth.users`: thêm `appointments.staff_employee_id`, bỏ NOT NULL của `staff_user_id`, thêm `order_lines.performed_by_employee_id`, viết lại `commission_sinh_cho_don`. Vá đúng lỗi **"hoa hồng LUÔN = 0, không gì báo"** (cảnh báo #210) | đã áp 7/7 |
| **#232** `cham_cong_cau_hinh_dinh_vi_va_selfie` | Bảng `attendance_settings`: **bán kính coi-là-tại-tiệm cấu hình được** (trước hardcode 300m ở trigger + lặp ở TS) + công tắc `require_selfie`; thêm cột selfie lên `attendance_punches`; trigger đọc bán kính động. **Đây là chỗ duy nhất trong V9 có trích ADR** — trích "ADR-0028 ngã D2" | đã áp 8/8 |
| **#234** `cham_cong_giup_dong_nghiep` | **Chấm công hộ đồng nghiệp** khi điện thoại hỏng: hàm `cham_cong_giup()` (SECURITY DEFINER, tự kiểm bên trong) + bảng phụ `attendance_proxy_punches` ghi ai bấm cho ai. Cố ý **không nới** policy chèn thẳng | đã áp 4/4 |
| **#235** `nhan_mat_on_device_nen` | **Nhận diện khuôn mặt.** Bảng `employee_face` lưu **dữ liệu sinh trắc học** (128 số), RLS **không có policy nào** — mọi lối đi qua hàm definer `nap_mat`/`face_da_nap`; điện thoại tự tính dấu mặt, ảnh gốc không rời máy chủ | đã áp 4/4 |
| **#236** `nguong_khop_mat_cau_hinh` | Chủ tiệm tự đặt **ngưỡng % khớp mặt** (mặc định 80); dưới ngưỡng thì đánh dấu đỏ cho quản lý soi | đã áp 2/2 |
| **#237** `luu_anh_mat_goc` | Lưu thêm **ảnh mặt gốc** để quản lý đối chiếu bằng mắt thường, không chỉ tin con số máy so | đã áp 3/3 |

Phần giao diện cũng đã có, không phải chỉ nền CSDL: `app/app/team/` (`punch-panel.tsx`, `selfie-capture.tsx`, `face-utils.ts`, `actions.ts`, `queries.ts`, `shift-panel.tsx`), `app/app/calendar/`, `app/app/orders/`, `lib/catalog/orders.ts`, và thư viện nhận mặt `@vladmandic/face-api` đã nằm trong `package.json`. Migration **#230** (`bookable_staff`) đi **cùng một commit** với #229 nên thuộc cùng đợt dù tên không mang tiền tố `v9`; công cụ đo xếp bản này là *"không đo được"* nên **không khẳng định** ở đây.

**Vì sao đợt này không đi qua ADR: KHÔNG RÕ.** Nói thẳng là chưa tìm được lý do, không phải đã tìm ra lý do nào. Đã soát: không có ADR nào từ 0029 trở lên (số cao nhất vẫn là 0028) · không file `.md` nào trong kho nhắc chữ "V9" · sáu commit của đợt đều ghi kỹ *founder muốn gì* và *đã nghiệm thu ra sao* nhưng **không câu nào nói về hồ sơ kiến trúc**. Nếu ai biết lý do thì sửa đúng đoạn này, đừng để trống.

**Hai hệ quả đã đo được, không phải suy đoán:**

1. **Phần nặng nhất của V9 chạy trái đúng điều kiện mà hồ sơ tự đặt ra.** ADR-0028 mục 2(A) và mục 6 viết Phase 2 (nhận mặt) *"cần founder quyết trước dòng code đầu"* và *"Tách ADR riêng, không gộp đợt này"*. Thực tế #235/#236/#237 làm ngay trong cùng đợt, cùng ngày — và **ADR riêng đó tới nay chưa từng được viết**. Chỗ duy nhất trích ADR (#232) lại trích một ADR mà chính header của nó khi đó ghi *"ĐỀ XUẤT — CHƯA thi công"*: **thi công dẫn chiếu một hồ sơ tự khai là chưa thi công.**
2. **Cổng đồng ý sinh trắc đi sau dữ liệu sinh trắc 2 ngày.** `employee_face` nhận khuôn mặt từ 20/08 (#235); `20260822000362_dong_y_sinh_trac_truoc_khi_nap_mat.sql` mới có ngày 22/08. Chính ADR-0028 mục 4 đã đòi *"đồng ý sinh trắc RIÊNG, tách bạch, có quyền rút"* **trước** khi bật Phase 2.

**Bài học của mục này:** khối "ĐỢT ĐANG MỞ" tự phong là nguồn sự thật duy nhất, nhưng **không có phép đo nào canh nó** — `soat-doi-dang-mo.mjs` canh việc các file KHÁC có chép số đợt sang hay không, **không canh việc chính khối này có còn đúng không**. Một nguồn sự thật không ai đo thì chỉ là một câu viết sẵn.

## Danh sách

> ⚠️ **TÁI PHẠM — ghi nhận 22/08/2026, cố ý không xoá bài học ở dòng 0022.**
> Dòng 0022 dưới đây đã tự ghi bài học *"hồ sơ viết xong mà không khai vào bảng thì đúng bằng không ai tìm thấy"*. **Rồi bảng này tái phạm ngay với BA ADR kế tiếp**: 0026 · 0027 · 0028 đều không có mặt cho tới hôm nay (0026 và 0027 viết 19–20/08, 0028 viết 20/08 — tức thiếu 2–3 ngày).
> Cùng lúc đó bảng còn **vỡ về hình thức**, và đây mới là phần đáng sợ: giữa dòng 0020 và dòng 0022 có **một dòng trống**, nên markdown cắt thành **hai bảng** — bốn dòng 0022–0025 rơi ra khỏi bảng chính và **mất luôn hàng tiêu đề**. Thêm nữa 0021 bị xếp **trước** 0020. Đã dọn cả ba lỗi (thứ tự · dòng trống · ba dòng thiếu) ngày 22/08.
> **Bài học cộng thêm:** bài học viết THÀNH CHỮ ngay trong bảng vẫn **không ngăn được tái phạm ở đúng cái bảng đó**. Chữ nhắc người đọc, không nhắc người ghi. Thứ ngăn được phải là **phép đo chạy được** — hiện `adr-dieu-kien-xem-lai.mjs` soát *nội dung* từng ADR nhưng **không ai soát mục lục này**, nên lỗ đúng loại này sẽ lặp lại lần nữa.

| # | Quyết định | Ghi chú |
|---|---|---|
| 0001 | Nền tảng (Next.js + Supabase + Vercel) | |
| 0002 | Các quyết định tháng 8 | |
| 0003 | Phân bậc trợ lý (model nào làm gì) | |
| 0004 | Khi nào dùng workflow | |
| 0005 | Nhiều tiệm một tài khoản | |
| 0006 | Phiên hỗ trợ chỉ-đọc | |
| 0007 | Chuông cảnh báo nền tảng | |
| 0008 | Cổng khách công khai (V1.5) | hồ sơ thi công của đợt |
| 0009 | V2 — Lịch hẹn | hồ sơ thi công của đợt |
| 0010 | Bản đồ 20 module + lộ trình | ⚠️ **đã bị 0012 thay** — giữ lại để tra lịch sử, đừng dùng làm bản đồ |
| 0011 | Giá và trang công khai | bảng giá đã chốt, công bố khi mở bán |
| 0012 | **Bản đồ năng lực: 9 nhóm → 28 mảng *(nay là **31** — thêm 3 mảng sau ADR-0012)*** | **đọc TRƯỚC khi đề xuất bất kỳ tính năng nào** — trả lời "iFan gồm mảng nào, mảng nào ở đợt nào" |
| 0013 | Telegram làm kênh khách hàng | hồ sơ thi công của đợt |
| 0014 | **V2.5 — AI trực việc** | hồ sơ thi công — **đợt ĐÃ ĐÓNG 6/6 ngày 13/08** |
| 0015 | **Kho tri thức + lời dặn riêng** | mở rộng 0014 mục 4 — Đã thi công (việc #129-131) |
| 0016 | **Zalo hỏi đáp cho nhân viên** | việc #128 — TRA CỨU, cố ý KHÔNG dùng AI. Đã thi công |
| 0017 | **Quyền lệnh bot: một bảng duy nhất** | việc #135 — sau 3 lỗ quyền một đêm. Đã thi công |
| 0018 | **Ngày tạo & ngày sửa cho mọi file vault** | việc #137 — **ĐÃ CODE** (`scripts/vault-ngay.mjs`, chạy tự động lúc commit vault) |
| 0019 | **V3 — Tiền thật** | hồ sơ thi công — **đợt ĐÃ ĐÓNG 8/8 ngày 17/08**. Gộp `services` vào `items`, bỏ bảng `visits`, chốt nợ thuế suất từ 31.77 |
| 0020 | **Tám chủ đề Telegram & thông báo tự động** | hoạch định lại CẢ KÊNH sau 4 lần phản ánh trong 5 ngày. Chốt: **gộp tin bản mới ≤1/giờ** (đang 16 tin/ngày), nhịp ngày đo đúng giai đoạn, mỗi chủ đề một câu hỏi. **ĐÃ CODE 4/4 việc ngày 17/08** (sổ sự thật đợt 35) |
| 0021 | **V4 — Hàng hoá & Kho** | **đợt ĐÃ ĐÓNG ngày 18/08** — migration ledger + 3 màn UI. Chốt: tồn là số TÍNH TỪ SỔ (không nuôi ô đếm) · bán quá tồn thì CẢNH BÁO không CHẶN · nhà cung cấp bản tối giản. Cắt sang đợt sau: lô/hạn dùng (V4.5) · ship+sàn (V6) · công nợ NCC (V5) |
| 0022 | **V5 — Két sắt & Hợp đồng** | 18/08 — chốt sổ ca + công nợ nhà cung cấp + bán gói/hợp đồng buổi. ⚠️ Dòng này BỊ THIẾU khỏi mục lục cho tới 19/08 dù file có từ hôm trước: hồ sơ viết xong mà không khai vào bảng thì đúng bằng không ai tìm thấy |
| 0023 | **Điểm tích luỹ: dùng điểm là TRẢ TIỀN, không phải giảm giá** | 19/08 — nối nốt nửa thiếu của mảng Giữ khách (`loyalty_redeem` có sẵn nhưng 0 chỗ gọi ⇒ điểm chỉ tăng, không tiêu được). Chốt: điểm vào `order_payments.method='points'`, doanh thu và lãi gộp KHÔNG đổi, và **không sinh phiếu sổ quỹ** vì không có đồng nào vào két. Nền đã áp (#194), có phép đối chứng |
| 0024 | **Dựng lại bản điện thoại: thanh dưới, menu, đường tới 31 mảng** | 19/08 — ĐANG HOẠCH ĐỊNH. Đo được: thanh dưới **4 ô cố định** trong khi có **31 mảng**; 21 mục chỉ tới được qua menu sau ảnh đại diện. Chốt: thanh dưới **đổi theo vai** (bản máy tính vốn đã đổi theo vai, chỉ điện thoại bị đóng cứng) · ô thứ 5 là "Thêm" · mọi thẻ đi qua Claude Design trước khi code |
| 0025 | **Quyền chạy hàm CSDL: phải ĐO, không được đọc câu lệnh rồi tin** | 19/08 — cùng một cơ chế cắn **hai lần trong một ngày**: `revoke ... from public, anon` KHÔNG thu quyền của `authenticated` (vai đó được cấp riêng). Hậu quả: **4 lỗ chéo tiệm** đã đo thật — vai Chỉ xem của tiệm A xoá được điểm khách và triệt tiêu hoa hồng nhân viên của tiệm B. Chốt: nguồn sự thật là `has_function_privilege`, cổng CI canh cả lớp `authenticated` (LUẬT C), mọi phép đo phải bọc savepoint riêng + có đối chứng. Đã vá (#191, #196); cổng bắt kiểu "quên hẳn", KHÔNG bắt được "chốt sai" |
| 0026 | **Dựng lại điều hướng CẢ HAI BẢN: cột trái máy tính + phần còn lại của điện thoại** | 19/08 — **ĐÃ THI CÔNG**. Tiếp nối 0024. Chốt 7 nhóm cho cột trái (chưa dựng lại từ hồi kho có 20 mảng, nay 31) + bảng "Thêm" đủ mảng. Mục 6 của chính file tự khai **hai chỗ ADR nói sai so với số đo** và **một chỗ còn treo** |
| 0027 | **Doanh thu chính thức tính từ đâu: Cơ hội hay Đơn hàng?** | 20/08 — **ĐÃ CHỐT: Đường A, doanh thu = ĐƠN HÀNG đã hoàn tất**; cơ hội thắng chỉ còn là chỉ số PHỄU, không còn là tiền. Trước đó có **hai quyển sổ ghi tiền không biết nhau tồn tại**. Mốc ghi nhận = `orders.created_at`; quy kết theo `order_lines.performed_by_user_id`. Đo trực tiếp trên CSDL thật rồi rollback |
| 0028 | **Chấm công: định vị cấu hình được + selfie làm bằng chứng** | 20/08 — viết dưới dạng ĐỀ XUẤT bốn ngã rẽ. ⚠️ **Đã bị thực tế vượt qua**: ngã D2 và B1 đã được chọn và thi công trong đợt **V9** cùng ngày, kể cả phần Phase 2 (nhận mặt) mà chính ADR đòi phải **tách ADR riêng** — ADR riêng đó **chưa từng được viết**. Xem đính chính 22/08 ở đầu file và mục **V9** ở trên |

## ⚠️ Luật bắt buộc: mỗi ADR phải có ĐIỀU KIỆN XEM LẠI

Thêm 12/08/2026, học từ FlowX (kho của họ: *"68 decisions, each with its trade-off **and its revisit trigger**"*).

**Mỗi ADR phải nói rõ: quyết định này hết đúng khi nào?** Viết thành một mục cuối file, dạng:

```
## Điều kiện xem lại
- Khi <sự kiện đo được xảy ra> ⇒ đọc lại mục <X>, nhiều khả năng phải đổi.
```

**Vì sao bắt buộc.** Quyết định đúng luôn đúng *tại thời điểm và trong bối cảnh đã đo*. Bối cảnh đổi thì nó âm thầm thành sai — mà **không có gì báo**. Ngày 12/08 đã dính đúng bệnh này ba lần trong một ngày:

- ADR-0007 ghi "nợ: chưa cắm nhịp chạy" — nhịp đã cắm xong từ việc #85, nhưng ADR vẫn nói còn nợ.
- File Chiến lược ghi tín hiệu dừng "chưa có 3 khách trả tiền sau 8 tuần" — founder đã bác hướng đó từ 31/07, nhưng thân bài không ai sửa, và một trợ lý đọc nó rồi khẳng định sai với founder **hai lần**.
- 10 thẻ design dán nhãn "chưa có code" trong khi màn đã chạy thật nhiều ngày.

Cả ba đều là **thứ đúng lúc viết, sai lúc đọc**. Điều kiện xem lại biến chuyện đó từ "chờ ai đó tình cờ phát hiện" thành "có mốc để kiểm".

**Ví dụ đang có thật** — ADR-0009 mục 9: *"khi Zalo OA cắm xong ⇒ thêm adapter vào `NotifyChannel`, thêm trạng thái `confirmed`, bật nhắc khách tự động. Ba việc này đi cùng nhau, không tách."*

**Trạng thái (đo bằng lệnh 14/08, không đếm tay): 18 ADR · 56 điều kiện · 17/18 có mục riêng.** Chỉ **0003** viết điều kiện trong thân bài; **0013** dùng tiêu đề `## 9. Xem lại khi nào` — hợp lệ, công cụ soát đã nhận. Ai sửa 0003 lần tới thì tách thành mục riêng cho đồng bộ, không cần mở đợt riêng.

> **ĐO LẠI 22/08/2026 — con số trên đã lỗi thời, và giữ nguyên để đối chiếu.** Chạy `node scripts/adr-dieu-kien-xem-lai.mjs` hôm nay: **28 ADR · 102 điều kiện · 28/28 có mục riêng** (trước phiên hôm nay là 90 điều kiện và **26/28** — `0022` chỉ có một dòng in nghiêng trong ngoặc ở cuối mục 9 nên công cụ không nhận, `0028` không có mục nào; cả hai đã bổ sung đúng khuôn 22/08). Đây là **lần thứ hai** một con số cứng trong chính file này lỗi thời — lần đầu đã ghi ở dòng trên. Cách chữa không phải chép số mới vào, mà là **đừng chép số cứng nữa**: chạy lệnh mà đọc.
>
> ⚠️ **CHỖ MÙ CỦA CÔNG CỤ SOÁT — đo được 22/08, chưa vá.** Công cụ chỉ gom những dòng bắt đầu bằng gạch đầu dòng (`- `). ADR nào có **đúng tiêu đề** nhưng viết điều kiện theo kiểu khác thì công cụ **không báo thiếu, cũng không gom** — nó im lặng bỏ qua. Hiện có **hai** file như vậy: **0015** (viết danh sách đánh số `1. 2. 3.`) và **0027** (viết thành một đoạn văn xuôi). Cả hai **đều có điều kiện thật và viết tốt**, nên đây **không phải lỗi của hai file đó** — nhưng chúng **không bao giờ xuất hiện trong bảng soát**, tức đúng những điều kiện đó sẽ không ai rà tới.
>
> **Vì sao đáng lo hơn là "thiếu một mục":** thiếu mục thì công cụ in ⚠ và có người sửa. Chỗ mù này **không in gì cả** — bảng soát trông vẫn sạch. Cùng đúng bài học đã ghi ngay trong mã nguồn công cụ (*"soát bằng khuôn cứng thì bỏ sót đúng file viết khác khuôn"*), lần đó là tiêu đề, lần này là **thân mục**. **CỐ Ý chưa sửa trong phiên 22/08** vì phiên này bị giới hạn chỉ được sửa tài liệu, không được sửa mã. Ghi ra để không ai tưởng bảng soát là đầy đủ. Hai đường chữa: nới công cụ để nhận cả danh sách đánh số, **hoặc** viết lại 0015/0027 theo khuôn gạch đầu dòng.

### 🔧 Soát điều kiện bằng lệnh, đừng mở 17 file

```bash
node scripts/adr-dieu-kien-xem-lai.mjs
```

Gom mọi điều kiện của **mọi** ADR trong thư mục về một chỗ (máy tự đếm, không chép tay — con số cứng ở đây từng lỗi thời đúng một tuần sau khi viết), và **tách riêng những điều kiện trỏ vào một VIỆC CÓ MÃ SỐ** — vì việc đóng lúc nào là thứ đối chiếu được ngay, khác hẳn các điều kiện ngoài đời ("khi Zalo OA duyệt", "khi có 20 hội thoại thật").

**Chạy khi nào:** đóng một việc lớn · mở đợt mới · founder ra quyết định mới. Đọc bảng rồi tự hỏi từng dòng *"cái này xảy ra chưa?"* — công cụ **cố ý không tự phán** và **không gắn vào CI**: phần lớn điều kiện là sự kiện ngoài đời máy không biết, mà máy phán bừa rồi chặn commit sẽ dạy người ta bỏ qua cảnh báo, tệ hơn không có.

> **Vì sao có công cụ này — một lỗ thật, 14/08.** ADR-0016 ghi *"khi founder bật AI trên máy chủ (#117) ⇒ xem lại mục 3(A)"*, mà điều kiện đó không có gì canh. Chỉ bắt được vì đọc tay cả 17 file. Đúng câu trích FlowX ở ngay trên: *"the first without the second is a comment"* — iFan **có trigger từ 12/08, chưa có bước audit**. Đây là bước audit.
>
> ⚠️ **ĐÍNH CHÍNH 17/08 — chính đoạn trên vừa mắc lỗi nó đang kể.** Bản gốc viết *"việc #117 đóng ngày 14/08 — điều kiện đã kích hoạt"*. Đo lại 17/08: **khoá AI chưa từng có trên máy chủ**, việc #117 vẫn mở. Điều kiện đó **chưa hề kích hoạt**; cái đã xảy ra là ADR-0016 bị **đánh dấu SAI là đã xử lý**.
>
> **Và đây mới là giá trị thật của công cụ, khác với dự kiến khi dựng nó:** nó được dựng để bắt *"điều kiện đã xảy ra mà chưa ai xem lại"*, nhưng lần dùng có ích nhất (17/08) lại bắt được *"điều kiện bị đánh dấu ĐÃ XỬ LÝ trong khi chưa xảy ra"* — dòng `✅ ĐÃ KÍCH HOẠT` in ra giữa bảng là thứ khiến người đọc dừng lại và đi đo. **Bài học: một dòng "✅ đã xử lý" nguy hiểm hơn một dòng chưa xử lý, vì nó tắt phản xạ kiểm tra** — cùng họ với `_KE-HOACH-THE.md` tự khai "XONG HẾT 30/30".

> **Chính chỉ mục ở trên vừa mắc đúng cái bệnh mục này chống.** Nó đứng im ở 0010 trong khi kho đã có tới 0013, và còn giới thiệu 0010 là *"đọc TRƯỚC khi đề xuất tính năng"* — trong khi bản đồ đó **đã bị 0012 thay** từ 13/08. Người đọc tin chỉ mục sẽ lấy nhầm bản đồ cũ. Sửa 13/08. **Bài học: file dạy về tài liệu lỗi thời không tự miễn nhiễm với lỗi thời.**

> **Nợ này suýt bị bỏ quên bằng một lý do nghe rất hợp lý.** Bản đầu của chính file này ghi: *"bổ sung dần khi mở file ra sửa vì việc khác — không mở riêng một đợt chỉ để thêm"*. Nghe tiết kiệm, nhưng đó là **hoãn vô thời hạn có vỏ bọc**: nếu không ai mở ADR-0001 ra sửa thì nó **không bao giờ** có điều kiện xem lại — đúng cái bệnh mà luật này dựng lên để chống. Founder nhắc lại việc còn dở, làm dứt trong một lượt. **Bài học: "làm dần khi tiện" là một cách hoãn, không phải một kế hoạch.**

**Cách viết một điều kiện xem lại cho ĐÚNG** — nó phải trỏ vào **sự kiện quan sát được**, không phải mốc thời gian và không phải cảm giác:

| ✅ Dùng được | ❌ Vô dụng |
|---|---|
| "Khi có người nhận thứ HAI ngoài founder ⇒ mục 4 sập" | "Xem lại sau 6 tháng" |
| "Khi có tiệm ≥3 thợ dùng hằng ngày ⇒ `staff_services` hết lý do bị cắt" | "Khi dự án lớn hơn" |
| "Khi Resend chạy thật ⇒ gỡ nhánh thừa ở mục 2" | "Khi có thời gian" |

Điều kiện tốt còn có tác dụng phụ quý hơn: nó **ghi lại con số tại thời điểm quyết** (đo ~1,1 người/tiệm, 0 lịch hẹn, một người nhận) — nên người đọc sau biết ngay quyết định đó dựa trên cái gì, và cái đó còn đúng không.

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

## Danh sách

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
| 0021 | **V4 — Hàng hoá & Kho** | **đợt ĐÃ ĐÓNG ngày 18/08** — migration ledger + 3 màn UI. Chốt: tồn là số TÍNH TỪ SỔ (không nuôi ô đếm) · bán quá tồn thì CẢNH BÁO không CHẶN · nhà cung cấp bản tối giản. Cắt sang đợt sau: lô/hạn dùng (V4.5) · ship+sàn (V6) · công nợ NCC (V5) |
| 0020 | **Tám chủ đề Telegram & thông báo tự động** | hoạch định lại CẢ KÊNH sau 4 lần phản ánh trong 5 ngày. Chốt: **gộp tin bản mới ≤1/giờ** (đang 16 tin/ngày), nhịp ngày đo đúng giai đoạn, mỗi chủ đề một câu hỏi. **ĐÃ CODE 4/4 việc ngày 17/08** (sổ sự thật đợt 35) |

| 0022 | **V5 — Két sắt & Hợp đồng** | 18/08 — chốt sổ ca + công nợ nhà cung cấp + bán gói/hợp đồng buổi. ⚠️ Dòng này BỊ THIẾU khỏi mục lục cho tới 19/08 dù file có từ hôm trước: hồ sơ viết xong mà không khai vào bảng thì đúng bằng không ai tìm thấy |
| 0023 | **Điểm tích luỹ: dùng điểm là TRẢ TIỀN, không phải giảm giá** | 19/08 — nối nốt nửa thiếu của mảng Giữ khách (`loyalty_redeem` có sẵn nhưng 0 chỗ gọi ⇒ điểm chỉ tăng, không tiêu được). Chốt: điểm vào `order_payments.method='points'`, doanh thu và lãi gộp KHÔNG đổi, và **không sinh phiếu sổ quỹ** vì không có đồng nào vào két. Nền đã áp (#194), có phép đối chứng |
| 0024 | **Dựng lại bản điện thoại: thanh dưới, menu, đường tới 31 mảng** | 19/08 — ĐANG HOẠCH ĐỊNH. Đo được: thanh dưới **4 ô cố định** trong khi có **31 mảng**; 21 mục chỉ tới được qua menu sau ảnh đại diện. Chốt: thanh dưới **đổi theo vai** (bản máy tính vốn đã đổi theo vai, chỉ điện thoại bị đóng cứng) · ô thứ 5 là "Thêm" · mọi thẻ đi qua Claude Design trước khi code |
| 0025 | **Quyền chạy hàm CSDL: phải ĐO, không được đọc câu lệnh rồi tin** | 19/08 — cùng một cơ chế cắn **hai lần trong một ngày**: `revoke ... from public, anon` KHÔNG thu quyền của `authenticated` (vai đó được cấp riêng). Hậu quả: **4 lỗ chéo tiệm** đã đo thật — vai Chỉ xem của tiệm A xoá được điểm khách và triệt tiêu hoa hồng nhân viên của tiệm B. Chốt: nguồn sự thật là `has_function_privilege`, cổng CI canh cả lớp `authenticated` (LUẬT C), mọi phép đo phải bọc savepoint riêng + có đối chứng. Đã vá (#191, #196); cổng bắt kiểu "quên hẳn", KHÔNG bắt được "chốt sai" |

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

# ADR-0010 — Bản đồ 20 module + xếp lại lộ trình cho luật "≥16 module và hơn" (13/08/2026)

**Trạng thái:** đã quyết. **Người quyết:** Opus 5.
**Thay/đính chính:** bảng **34.7** (trình tự V1a→V8) — không xoá, **mở rộng**.
**Nguồn chỉ đạo:** founder 13/08 — *"Ít nhất 16 module như họ, và hơn thế nữa! đây là rule"* · *"định vị ít nhất phải hơn cnvwork"* · *"ta tiếp cận nhỏ vừa… từ 2-100 người"*.

> ## ⭐ LUẬT BỔ SUNG-KHÔNG-DỰNG-LẠI (founder chốt 13/08)
>
> **Nguyên văn:** *"Vì đã tốn time và token nghiên cứu cũ, nên sẽ **bổ sung** chứ không dựng lại nếu không gây ảnh hưởng kết quả."*
>
> **Áp cho mọi việc từ nay, không riêng ADR này.** Gặp tài liệu cũ chưa khớp chỉ đạo mới thì **cộng thêm phần thiếu**, không viết lại từ đầu. Chỉ được dựng lại khi giữ bản cũ **làm sai kết quả** — và phải nói rõ sai ở đâu.
>
> **ADR này tuân thủ đúng vậy — kiểm được:** thứ tự V3→V8 **giữ nguyên, không đợt nào bị đảo** · bảng 34.7 **không xoá dòng nào** · toàn bộ nghiên cứu 31/07–10/08 **không đụng tới** · chỉ **thêm một đợt (V2.5)** và **thêm 4 mảng vào các đợt đã có**.
>
> ⚠️ **Chống hiểu sai:** "bổ sung" **không phải** "để nguyên cái sai rồi viết thêm bên cạnh". Thứ đã **hết đúng** vẫn phải đóng dấu chết (như bảng giá, như cổng V2 đã chết) — nếu không thì người đọc sau lấy nhầm. **Giữ lại là để TRUY VẾT, không phải để DÙNG.**

---

## 1. Vì sao phải có ADR này

Bảng 34.7 vẽ khi tệp khách là **tiệm 2–10 người**. Ngày 13/08 đổi ba thứ cùng lúc: tệp khách rộng gấp 10 lần · sàn phạm vi là 16 module của CNV Work · và mốc là **hơn** họ, không phải bằng.

Đo lại 34.7 theo sàn mới thì **thiếu hẳn 5 mảng**, trong đó có mảng chính chiến lược tự nhận là vũ khí số một. Để nguyên là mọi đợt sau xây theo bản đồ sai.

**ADR này KHÔNG đẩy nhanh tiến độ.** Nó chỉ trả lời: *iFan gồm những module nào, mảng còn thiếu nằm ở đợt nào, và vì sao đợt đó chứ không phải đợt khác.*

## 2. Đo thật (13/08)

| Đo | Kết quả |
|---|---|
| Module CNV Work (đọc `huongdan.cnvwork.com`, không đọc trang quảng cáo) | **16** |
| Mảng iFan đã có hoặc đã xếp trong 34.7 | **15** |
| Mảng CNV Work có mà 34.7 **không có ở đợt nào** | **5** — AI trực inbox · tự động hoá · chat nội bộ · API/webhook · tuyển dụng |
| Mảng iFan có mà CNV Work **không có** | **2** — nền theo ngành · mặt tiền + cổng khách |
| Mảng CNV Work có mà iFan **cố ý không làm** | **2** — bán hàng B2B (báo giá duyệt nhiều tầng, subscription/MRR) · quản trị nội bộ hãng (tên miền, hoa hồng CG) |

## 3. QUYẾT ĐỊNH 1 — iFan gồm **20 module**, đủ sàn và vượt 4

Đếm theo **mảng việc**, không theo tên màn. Bốn cột cuối là trạng thái thật.

| # | Module iFan | Khớp CNV Work | Trạng thái |
|---|---|---|---|
| 1 | **Hôm nay / Tổng quan** | 1 | ✅ chạy thật |
| 2 | **Hộp thư đa kênh** | 3 | ✅ chạy thật — *thiếu phần AI, xem QĐ-2* |
| 3 | **Khách hàng** | 4 (một phần) | ✅ chạy thật |
| 4 | **Cơ hội & Bán hàng** | 4 | ✅ chạy thật |
| 5 | **Công việc & Phê duyệt** | 7 + 8 | ✅ chạy thật |
| 6 | **Hỗ trợ & SLA** | 6 | ✅ chạy thật |
| 7 | **Báo cáo & Phân tích** | 12 | ✅ chạy thật — *thiếu chia sẻ link, xem QĐ-2* |
| 8 | **Hệ thống & Phân quyền** | 14 | ✅ chạy thật — *thiếu API/webhook, xem QĐ-2* |
| 9 | **Ngành & Giao diện (pack engine)** | ❌ **họ KHÔNG có** | ✅ chạy thật |
| 10 | **Mặt tiền & Cổng khách** | ❌ **họ KHÔNG có** | ✅ V1.5 xong (cổng khách `/k/` để V2.5) |
| 11 | **Lịch hẹn & Dịch vụ** | ❌ **họ KHÔNG có** | 🔄 V2 đang làm |
| 12 | **Đơn hàng & Thu tiền** | 4 (một phần) | ⬜ V3 |
| 13 | **Hàng hoá & Kho** | ❌ họ không có | ⬜ V4 |
| 14 | **Két sắt & Công nợ** | ❌ họ không có | ⬜ V5 |
| 15 | **Giữ khách & Danh tiếng** | 13 (Loyalty) | ⬜ V6 |
| 16 | **Đội ngũ & Chấm công** | 2 | ⬜ V7 |
| 17 | **AI trực việc** | 3 (phần Agents/KB) | 🔴 **CHƯA CÓ Ở ĐỢT NÀO** |
| 18 | **Tự động hoá** | 11 | 🔴 **CHƯA CÓ** (từng bị giết) |
| 19 | **Chat nội bộ** | 15 | 🔴 **CHƯA CÓ** (từng bị giết) |
| 20 | **Tiện ích & Kết nối** | 16 + phần mở của 14 | 🔴 **CHƯA CÓ** |

**Đếm: 20 ≥ 16 ✓. Vượt 4 mảng họ không có** (nền ngành · mặt tiền · lịch hẹn · kho–quỹ).

**Cố ý KHÔNG làm, ghi rõ để không ai tưởng bị quên:**
- **Bán hàng B2B nặng** (báo giá duyệt 3 tầng, subscription/MRR, chỉ tiêu doanh số theo quý). Công ty 100 người bán dịch vụ tại chỗ **không chạy quy trình này**. Nếu sau có khách thật đòi, viết ADR mới.
- **Tuyển dụng thành module riêng.** Gộp vào **module 16** ở mức tiệm nhỏ–vừa thật sự dùng (đăng tin, danh sách ứng viên, nhận việc) — **không** dựng pipeline tuyển dụng + thư viện JD + đề xuất tuyển như họ.
- **Quản trị nội bộ hãng** (tên miền khách, hoa hồng nhân viên kinh doanh của chính hãng) — đó là module CNV tự dùng, không phải thứ bán cho khách.

## 4. QUYẾT ĐỊNH 2 — 4 module còn thiếu xếp vào đâu, và VÌ SAO đợt đó

Nguyên tắc xếp: **module chỉ có nghĩa khi đã có dữ liệu cho nó ăn** (luật D2). Xếp sớm quá thì dựng vỏ rỗng; xếp muộn quá thì mất lợi thế.

### 4.1 Module 17 — **AI trực việc** ⇒ **V2.5**, ngay sau V2

**Gồm:** AI tự trả lời khách trong hộp thư (có công tắc tắt) · Knowledge Base tiệm tự nạp · ngoài giờ AI tự xử / trong giờ AI gợi ý để người duyệt · **màn đo chi phí AI** · tự kiểm chất lượng trả lời.

**Vì sao V2.5 chứ không muộn hơn** — ba lý do, xếp theo sức nặng:
1. **Chiến lược đã tuyên bố đây là khác biệt số 1 từ 31/07** (*"AI làm việc, không phải AI gợi ý"*) mà **không đợt nào làm**. Lời hứa không có việc đi kèm là nợ, không phải định vị.
2. **Dữ liệu cho nó ăn đã đủ ngay sau V2:** hộp thư (đang chạy) + hồ sơ khách (đang chạy) + **giờ mở cửa và lịch hẹn (V2 vừa xong)**. Đúng ba câu khách hỏi nhiều nhất: *mấy giờ mở cửa · giá bao nhiêu · còn chỗ không*. Trước V2 thì AI **không trả lời được câu thứ ba** — đó là lý do không xếp sớm hơn.
3. Đây là ô đỏ **duy nhất** mà CNV Work đã bán bằng con số cụ thể.

**Ràng buộc bắt buộc:** phải có **màn chi phí AI** cùng đợt. Bán AI mà không cho khách thấy nó tốn bao nhiêu là **cài bẫy hoá đơn** — và rủi ro 7 của file chiến lược (chi phí AI ăn margin) vẫn còn hiệu lực.

### 4.2 Module 20 — **Tiện ích & Kết nối** ⇒ **chia đôi**

| Phần | Đợt | Vì sao |
|---|---|---|
| Mẫu tin nhắn · mẫu in · bot thông báo | **V3** | V3 sinh đơn hàng và hoá đơn ⇒ có thứ để in và để nhắn |
| Nhà cung cấp | **V4** | đã nằm sẵn trong V4 (mua vào/NCC) |
| **Webhook ra + khoá API + nhập/xuất dữ liệu tử tế** | **V6** | phải đợi hình dạng dữ liệu ổn định. Mở API sớm rồi đổi bảng = **phá của khách đã cắm vào**. Đây là thứ một khi mở thì **không rút lại được** |

**Cắt khỏi phạm vi:** 120 endpoint + SDK 4 ngôn ngữ. Khách 2–100 người không có đội IT. Cần: **webhook ra**, **nhập/xuất Excel tử tế**, **đường nối kế toán dịch vụ**. Ai cần sâu hơn thì họ không phải khách của mình.

### 4.3 Module 18 — **Tự động hoá** ⇒ **V6**

**Vì sao không sớm hơn:** trình dựng luồng chỉ có giá trị khi **có nhiều loại sự kiện để bắt và nhiều loại hành động để làm**. Trước V6 thì tập sự kiện quá mỏng — dựng ra một trình kéo-thả mà chỉ có 3 nút để chọn là **màn đẹp không ai dùng**, đúng thứ luật D2 cấm.

**Vì sao không muộn hơn:** V6 là đợt giữ khách; phần lớn giá trị của nó (nhắc tái khám, chăm sau dịch vụ, win-back) **chính là các luồng tự động**. Làm V6 mà không có trình luồng thì phải cắm cứng từng kịch bản — làm hai lần.

**Ghi rõ:** đây là mục từng bị **giết công khai**. Nó sống lại vì tệp khách đổi, không phải vì ai đổi ý.

### 4.4 Module 19 — **Chat nội bộ** ⇒ **V7**

Đi cùng đợt Đội ngũ. Lý do giết cũ (*"tiệm 2–10 người đã dùng nhóm Zalo"*) **đúng với tiệm 5 người và sai với công ty 60 người** — nơi cần nhắn theo phòng ban, gắn tin vào hồ sơ khách, và giữ lại lịch sử khi nhân viên nghỉ. **Nhắn qua nhóm Zalo thì công ty mất sạch lịch sử khi người đó rời đi** — đó mới là lý do thật để có nó, không phải vì đối thủ có.

## 5. QUYẾT ĐỊNH 3 — Lộ trình sau khi xếp lại

| Đợt | Nội dung | Đổi gì so với 34.7 |
|---|---|---|
| V1a · V1b · V1.5 | đã đóng | — |
| **V2** | Lịch hẹn (đang làm) | — |
| **V2.5** | **AI trực việc** + cổng khách `/k/[token]` | 🆕 **đợt mới** |
| **V3** | Tiền thật + mẫu in/mẫu tin/bot | +tiện ích |
| **V4** | Hàng hoá chuẩn + nhà cung cấp | — |
| **V5** | Két sắt & công nợ | — |
| **V6** | Giữ khách + **tự động hoá** + **webhook/API** | 🆕 +2 mảng |
| **V7** | Đội ngũ sâu + tuyển dụng gọn + **chat nội bộ** | 🆕 +2 mảng |
| **V8** | Nghiêm túc & mở | — |

**V2.5 gộp AI với cổng khách `/k/[token]` có chủ ý:** ADR-0008 đã hoãn `/k/` tới khi có người dùng thật; cả hai đều là **cửa nói chuyện với khách cuối**, dùng chung phần xác thực token và phần hiển thị công khai. Tách ra là làm hạ tầng đó hai lần.

## 6. Cái KHÔNG đổi

- **Luật D2 vẫn là luật cao nhất.** ADR này thêm module vào **kế hoạch**, không cho phép dựng bảng/màn rỗng. Chưa làm tử tế được thì **để ngoài và ghi rõ**, đừng dựng vỏ cho đủ 20.
- Trình tự V3→V8 giữ nguyên. Không đợt nào bị đảo.
- Không đi đấu ERP doanh nghiệp trên 100 người.

## 7. Nghiệm thu ADR này

Không có ca kiểm CSDL — đây là ADR **phạm vi**, không phải ADR **thi công**. Nghiệm thu bằng ba câu, trả lời được hết mới coi là đạt:

1. Mở `00 Trang chủ.md` — có đọc ra **iFan gồm 20 module** và mỗi module ở đợt nào không?
2. Với **mỗi** ô đỏ trong bảng điểm CNV Work (`02 Nghiên cứu/Chuẩn full-service…` mục 5), có chỉ ra được **đợt cụ thể** nó được bịt không?
3. Có mảng nào trong 20 module **chưa có đợt** không? (phải là **không**)

## Điều kiện xem lại

- **Khi CNV Work bổ sung đặt lịch dịch vụ hoặc quản lý kho** ⇒ 2 trong 4 mảng "họ không có" mất, đọc lại quyết định 1.
- **Khi có khách thật ≥50 người dùng hằng ngày** ⇒ đọc lại phần "cố ý không làm" ở quyết định 1 — nhất là bán hàng B2B và tuyển dụng, hai thứ bị cắt bằng suy luận chứ **chưa bằng số đo trên khách thật**.
- **Khi có khách đầu tiên hỏi webhook/API** ⇒ mục 4.2 có thể phải kéo sớm hơn V6.
- **Khi chi phí AI vượt 10% doanh thu một khách bất kỳ** ⇒ đọc lại 4.1 và rủi ro 7 của file chiến lược.

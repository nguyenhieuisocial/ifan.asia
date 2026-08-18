# ADR-0012 — Bản đồ năng lực 3 tầng · 9 nhóm · 25 mảng (13/08/2026)

> 🔧 **SỐ MẢNG THẬT LÀ 28, KHÔNG PHẢI 25** (đo 14/08, Opus — nạp thẳng `lib/feature-registry.ts`:
> `GROUP_REGISTRY` = **9 nhóm** ✓ · `MODULE_REGISTRY` = **28 mảng** · 13 xong / 15 kế hoạch / 0 đang xây).
>
> Con số 25 trong tiêu đề và mục 3–4 là **ước lượng lúc quyết**; khi thi công thì ra 28 vì
> **không ép khớp ước lượng** — đúng-với-dữ-liệu quan trọng hơn đẹp-số. Mục lục ADR và
> `00 Trang chủ.md` đã ghi 28 từ 13/08; **riêng file này không được cập nhật** — mà đây lại
> chính là file trang chủ bắt *"đọc TRƯỚC khi đề xuất bất kỳ tính năng nào"*.
>
> Giữ nguyên số 25 trong thân bài để truy vết (đó là con số tại thời điểm quyết); **khi cần
> con số đúng thì đọc `feature-registry.ts`, đừng chép từ đây.**
>
> ⚠️ **Kéo theo một chỗ MƠ HỒ về quyết định kinh doanh — không tự diễn giải:** ADR-0011 khoá
> ngày mở bán bằng câu *"đủ **20 mảng**"* (viết khi bản đồ còn 20 mảng phẳng, tức **20/20 = phủ
> hết**). Nay bản đồ 28 mảng, câu đó đọc được **hai nghĩa**: 20/28 (còn thiếu 7) hay 28/28
> (còn thiếu 15). Chênh nhau rất xa. **Founder phải chốt lại, trợ lý không được tự chọn** —
> đây là quyết định kinh doanh, thuộc đúng một trong ba trường hợp bắt buộc hỏi.

**Trạng thái:** đã quyết. **Người quyết:** Opus 5.
**Thay/đính chính:** ADR-0010 (bản đồ 20 mảng phẳng) — **không xoá, nâng cấp cấu trúc**. Mọi mảng của 0010 đều còn, chỉ đổi cách xếp và thêm mảng mới.
**Nguồn chỉ đạo:** founder 13/08 — liệt kê 7 nhóm tính năng + 12 tích hợp + *"Hiện tại chưa show ra đủ"* · *"bạn toàn quyền"*.

> **Tuân luật BỔ SUNG-KHÔNG-DỰNG-LẠI (ADR-0010):** ADR này **không đảo đợt nào**, **không xoá mảng nào**. Nó thêm tầng nhóm ở trên, thêm 5 mảng mới, và đóng dấu chết 4 quyết định cũ đã hết đúng (ghi rõ từng cái ở mục 6).

---

## 1. Vì sao phải có ADR này

Founder liệt kê ~45 tính năng trong 7 nhóm + 12 tích hợp, kèm một câu chẩn đoán: ***"Hiện tại chưa show ra đủ."***

Câu đó **đúng**, nhưng lý do không phải cái người ta tưởng. Đo thật từng dòng (mục 2) cho ra kết quả ngược với trực giác:

> **Khoảng một nửa danh sách founder liệt kê ĐÃ CHẠY THẬT hoặc ĐÃ CÓ TRONG LỘ TRÌNH.** Vấn đề lớn nhất không phải thiếu tính năng — mà là **trang công khai đang gọi tên khác với cách thị trường gọi**, và **cách đếm "20 mảng phẳng" không chở nổi 130 tính năng.**

Ba việc phải sửa, theo đúng thứ tự đó:
1. **Cấu trúc** — 20 mảng phẳng không đủ chỗ. Cần 3 tầng (mục 3).
2. **Tên gọi** — gọi đúng ngôn ngữ người mua đang dùng (mục 4).
3. **Tính năng thật sự thiếu** — đúng 20 tính năng, không phải 45 (mục 5).

---

## 2. Đo thật — đối chiếu từng dòng founder liệt kê

Đối chiếu với **bảng CSDL thật** (`\dt` trên CSDL sản xuất) và `docs/SU-THAT-SAN-PHAM.md`, không đối chiếu với trí nhớ.

| Founder liệt kê | Thực tế iFan hôm nay | Kết luận |
|---|---|---|
| **1. Sales & CRM** | | |
| Quản lý Lead | `contacts` + chấm điểm + nguồn + phân hạng — chạy thật | ✅ **có** |
| Pipeline Deal | `deals` + `pipeline_stages` + kanban kéo-thả — chạy thật | ✅ **có** |
| 360° khách hàng | hồ sơ + timeline + trường tự đặt + lịch sử + gộp trùng — chạy thật | ✅ **có** |
| Hoá đơn & Thanh toán | đã xếp **V3** (ADR-0010 mảng 12) | 🕒 **đã có chỗ** |
| Báo giá cao cấp | báo giá cơ bản ở V3; "cao cấp" = duyệt nhiều tầng → xem mục 6 | ⚠️ **lật quyết định cũ** |
| Hợp đồng & subscription | **ADR-0010 mục 3 cố ý KHÔNG làm** ("subscription/MRR") | ⚠️ **lật quyết định cũ** |
| Khuyến mãi & Commission | chưa có bảng nào | 🆕 **thiếu thật** |
| 20+ báo cáo CRM | có báo cáo nguồn/thắng-thua/KPI/ads — chưa tới 20 | 🕒 **mở rộng** |
| **2. Marketing & Automation** | | |
| Lead form public | `storefront_lead_submissions` + mặt tiền `/t/[slug]` — **chạy thật từ V1.5** | ✅ **có** |
| Tracking ROI | `source_costs` + quy kết 3 mô hình + lời/lỗ từng đồng ads — chạy thật | ✅ **có** |
| Automation flow | `workflows`/`workflow_runs` **engine đã chạy** (trigger+điều kiện+hành động), thiếu **màn tự dựng luồng** | 🕒 **nửa có** |
| Campaign đa kênh | chưa có | 🆕 **thiếu thật** |
| Membership | chưa có bảng | 🆕 **thiếu thật** |
| Events & Hội thảo | chưa có | 🆕 **thiếu thật** |
| **3. Inbox & Hỗ trợ KH** | | |
| Inbox đa kênh | `conversations`/`messages` + Live Chat + Zalo Bot — chạy thật | ✅ **có** |
| Web widget | Live Chat nhúng web — chạy thật | ✅ **có** |
| Ticket SLA | `sla_policies`/`sla_events` + leo thang — chạy thật | ✅ **có** |
| AI Agent + Knowledge Base | đã xếp **V2.5** (ADR-0010 mảng 17) | 🕒 **đã có chỗ** |
| CSAT + Auto QC | chưa có | 🆕 **thiếu thật** |
| **4. Task & Dự án** | | |
| Tasks + Reminders + liên kết CRM | `activities` (type task/note/call/meeting) + hạn + chủ việc + gắn khách/cơ hội — chạy thật | ✅ **có** |
| Báo cáo công việc | có trong Báo cáo — chạy thật | ✅ **có** |
| Tasks **Kanban** | danh sách có, **bảng kanban cho việc chưa có** (kanban hiện chỉ ở Cơ hội) | 🆕 **thiếu nhỏ** |
| Comments & Mentions | **không có bảng nào** | 🆕 **thiếu thật** |
| Projects | **không có bảng nào** | 🆕 **thiếu thật** |
| **5. Phê duyệt** | | |
| Approval inbox | `wf_approval_requests` + màn `/app/approvals` — chạy thật | ✅ **có** |
| Audit trail | `audit_logs` + `record_audit` + nhật ký bản ghi — chạy thật | ✅ **có** |
| Multi-channel push | thông báo trong app + **Zalo Bot** (chính thức, miễn phí) — chạy thật | ✅ **có** |
| Template builder · conditional routing · auto-escalate | loại phiếu cố định, **không tự dựng được**; auto-escalate mới có ở SLA | ⚠️ **lật quyết định cũ** |
| **6. Nhân sự & Chấm công** | | |
| Chấm công GPS+QR · Timesheet · Nghỉ phép | đã xếp **V7**; phiếu nghỉ đã chạy trong Phê duyệt | 🕒 **đã có chỗ** |
| Tuyển dụng | ADR-0010 chốt **gộp gọn, không dựng module riêng** | ⚠️ **lật quyết định cũ** |
| Onboarding/Offboarding · Org chart · Quản lý tài sản | chưa có | 🆕 **thiếu thật** |
| **Hợp đồng lao động & Lương** | chưa có — **và đây là mảng có trách nhiệm pháp lý** (BHXH, thuế TNCN) | 🆕 **thiếu + rủi ro, xem mục 6.5** |
| **7. Báo cáo & Phân tích** | | |
| Sales Performance · Marketing ROI · Support SLA | chạy thật | ✅ **có** |
| Chỉ tiêu KPI | `kpi_targets` + màn `/app/reports/kpi` — **chạy thật** (vault từng ghi nhầm là đã giết) | ✅ **có** |
| HR Analytics | đi theo V7 | 🕒 **theo mảng gốc** |
| 20+ Dashboard | có ~6 màn báo cáo | 🕒 **mở rộng** |
| Data Warehouse | chưa có — **và tên gọi này sai nhu cầu**, xem mục 6.4 | ⚠️ **đổi cách làm** |

**Đếm lại:** ✅ có sẵn **16** · 🕒 đã có chỗ hoặc chỉ cần mở rộng **8** · 🆕 thiếu thật **13** · ⚠️ phải lật/đổi quyết định cũ **5**.

### 2b. Một thứ founder KHÔNG liệt kê — và đó là chỗ nguy hiểm nhất

Bảy nhóm founder đưa ra là **khung của phần mềm CRM/quản trị công ty**. Đối chiếu ngược lại, **danh sách đó bỏ sót TOÀN BỘ phần iFan mạnh hơn đối thủ**:

- Lịch hẹn & dịch vụ (CNV Work không có)
- Mặt tiền tiệm online + cổng khách (họ không có)
- Nền theo ngành — vào là đúng nghề (họ không có)
- Hàng hoá · kho · két sắt · công nợ (họ không có)

**Nếu bê nguyên 7 nhóm đó làm bản đồ, iFan tự xoá 4 mảng khác biệt của chính mình khỏi bản đồ.** Đây là lý do ADR này có **nhóm 8 — Vận hành tiệm** (mục 4). Không phải thêm cho đủ số; là giữ lại đúng thứ khiến iFan không phải bản sao rẻ tiền của CNV Work.

---

## 3. QUYẾT ĐỊNH 1 — Bỏ cách đếm "20 mảng phẳng", dùng **3 tầng**

| Tầng | Số lượng | Ai đọc | Dùng để làm gì |
|---|---|---|---|
| **Nhóm** | **9** | người mua, trang công khai | so sánh với đối thủ, hiểu bề rộng trong 10 giây |
| **Mảng** | **25** | lộ trình, người thi công | đơn vị xếp đợt (V2.5 · V3 · … · V8) |
| **Tính năng** | **~130** | người soi kỹ, nghiệm thu | đơn vị gắn nhãn trạng thái thật |

**Vì sao phải 3 tầng:** 20 mảng phẳng chở được 20 nhãn trạng thái. Danh sách founder một mình đã 45 tính năng, bản đồ đủ là ~130 — đổ hết vào một danh sách phẳng thì trang `/tinh-nang` thành bảng kê 130 dòng không ai đọc hết, và **không so được với đối thủ** (họ trình bày theo nhóm).

**Luật D2 vẫn cao nhất:** thêm tầng **không** cho phép dựng vỏ rỗng. Một tính năng chỉ được vào bản đồ khi trả lời được *"ai bấm vào đâu, ra cái gì"*. Chưa trả lời được thì để ngoài.

---

## 4. QUYẾT ĐỊNH 2 — 9 nhóm · 25 mảng

Tên nhóm **lấy theo ngôn ngữ founder/thị trường đang dùng** (đó chính là phần "chưa show ra đủ": trước nay iFan gọi tên theo màn hình, người mua tìm theo tên nhóm).

| Nhóm | Mảng | Trạng thái · Đợt |
|---|---|---|
| **1. Bán hàng & Khách hàng** | M1 Khách hàng 360° | 🟢 chạy thật |
| | M2 Cơ hội & Pipeline | 🟢 chạy thật |
| | M3 Báo giá · Đơn hàng · Hoá đơn · Thu tiền | ⬜ V3 |
| | M4 Hợp đồng · Gói định kỳ · Hoa hồng · Khuyến mãi | ⬜ V5 🆕 |
| **2. Marketing & Tự động hoá** | M5 Cổng thu khách (mặt tiền · form · QR) | 🟢 chạy thật |
| | M6 Chiến dịch · Giữ khách · Membership | ⬜ V6 |
| | M7 Tự động hoá (trình dựng luồng) | 🔨 engine chạy · builder V6 |
| | M8 Sự kiện & Hội thảo | ⬜ V8 🆕 |
| **3. Hộp thư & Chăm khách** | M9 Hộp thư đa kênh | 🟢 chạy thật |
| | M10 AI trực việc + Knowledge Base | 🔨 V2.5 |
| | M11 Cam kết phản hồi (SLA · ticket) | 🟢 chạy thật |
| | M12 Đo chất lượng phục vụ (CSAT · Auto QC) | ⬜ V6 🆕 |
| **4. Công việc & Phối hợp** | M13 Công việc · Nhắc việc · Kanban | 🟢 chạy thật *(thiếu kanban việc)* |
| | M14 Dự án | ⬜ V7 🆕 |
| | M15 Trao đổi nội bộ (bình luận · @nhắc · chat) | ⬜ V7 🆕 |
| **5. Quy trình & Phê duyệt** | M16 Biểu mẫu & Phê duyệt | 🟢 chạy thật *(thiếu builder · routing)* |
| **6. Nhân sự & Chấm công** | M17 Đội ngũ · Chấm công · Nghỉ phép | ⬜ V7 |
| | M18 Tuyển dụng · Nhận việc · Nghỉ việc | ⬜ V7 🆕 |
| | M19 Hợp đồng LĐ · Lương · Tài sản · Sơ đồ tổ chức | ⬜ V8 🆕 |
| **7. Báo cáo & Phân tích** | M20 Báo cáo điều hành (20+ màn) | 🟢 chạy thật *(≈6/20 màn)* |
| | M21 Xuất dữ liệu & Kết nối BI | ⬜ V6 🆕 |
| **8. Vận hành tiệm** ⭐ *(CNV Work KHÔNG có)* | M22 Lịch hẹn & Dịch vụ | 🟢 chạy thật |
| | M23 Hàng hoá & Kho | ⬜ V4 |
| | M24 Két sắt & Công nợ | ⬜ V5 |
| **9. Nền tảng & Kết nối** | M25 Hệ thống · Phân quyền · Ngành · Nhật ký · API · Tích hợp | 🟢 chạy thật *(API/tích hợp V6)* |

**Đếm: 9 nhóm · 25 mảng.** Vượt sàn 16 của CNV Work, **và giữ nguyên 4 mảng họ không có** (M5 · M22 · M23+M24 · nền ngành trong M25).

---

## 5. QUYẾT ĐỊNH 3 — 13 tính năng thiếu thật xếp vào đâu

Nguyên tắc xếp giữ nguyên ADR-0010: **mảng chỉ có nghĩa khi đã có dữ liệu cho nó ăn.**

| Tính năng mới | Đợt | Vì sao đợt đó |
|---|---|---|
| Kanban cho Công việc | **V2.5** | Rẻ nhất bảng (dữ liệu `activities` đã đủ, chỉ thiếu một cách nhìn). Làm cùng đợt đang mở <!--đợt-cũ: ghi lúc V2.5 còn mở; Kanban đã xong (việc #114)--> |
| Bình luận & @nhắc trong việc/cơ hội | **V3** | Cần khi nhiều người cùng chạm một đơn — đúng lúc V3 sinh đơn hàng |
| Khuyến mãi (chương trình tự áp) | **V3** | Phải đi cùng lúc có đơn hàng, nếu không thì không có gì để giảm giá |
| Hoa hồng nhân viên | **V5** | Cần đủ doanh thu ghi nhận (V3) + két sắt (V5) mới tính đúng |
| Hợp đồng & gói dịch vụ định kỳ | **V5** | Cùng nhà với công nợ — bản chất là "tiền còn phải thu theo kỳ" |
| CSAT (khảo sát hài lòng) | **V6** | Gửi khảo sát cần kênh gửi tự động — có ở V6 |
| Auto QC (AI chấm chất lượng trả lời) | **V6** | Cần đủ lượng hội thoại AI đã xử (V2.5 chạy vài tháng) mới chấm có nghĩa |
| Chiến dịch đa kênh · Membership | **V6** | Đã nằm trong mảng Giữ khách của ADR-0010 |
| Xuất dữ liệu & kết nối BI | **V6** | Đi cùng webhook/API — cùng một nhóm việc "mở dữ liệu ra ngoài" |
| Dự án (gom nhiều việc) | **V7** | Chỉ có nghĩa khi đã có đội đông (V7 Đội ngũ) |
| Trao đổi nội bộ | **V7** | Cùng lý do; xem mục 6.3 về cách làm |
| Tuyển dụng · onboarding · offboarding | **V7** | Cùng nhà Nhân sự |
| Hợp đồng LĐ · Lương · Tài sản · Sơ đồ tổ chức | **V8** | Xem mục 6.5 — mảng nặng nhất và có rủi ro pháp lý |
| Sự kiện & Hội thảo | **V8** | Xa nhu cầu lõi nhất trong danh sách; không mảng nào phụ thuộc nó |

**Không đợt nào bị đảo. Không mảng cũ nào bị đẩy lùi.**

---

## 6. QUYẾT ĐỊNH 4 — Năm quyết định cũ bị lật, ba vẫn giữ

Founder chốt tệp khách **2–100 người** (không còn 2–10) và ra lệnh *"bạn toàn quyền"*. Năm dòng dưới đây trước bị giết bằng lý do **"tiệm nhỏ không dùng"** — lý do đó đã chết. Lật, và ghi rõ để không ai tưởng bị quên.

### 6.1 Phê duyệt nâng cao (template builder · điều kiện rẽ nhánh · tự leo thang) ⇒ **LẬT, làm ở V7**
Lý do cũ: *"phê duyệt đa cấp any/all/quorum — tiệm nhỏ không dùng"*. **Sai với công ty 60 người** — nơi phiếu chi trên 10 triệu phải qua kế toán rồi giám đốc. Xếp V7 (cùng đợt Nhân sự) vì lúc đó mới có sơ đồ tổ chức để định tuyến theo chức danh — làm sớm hơn thì phải cắm cứng tên người, làm hai lần.

### 6.2 Tuyển dụng thành mảng riêng ⇒ **LẬT, làm ở V7**
ADR-0010 chốt "gộp gọn". Công ty 100 người tuyển liên tục, cần danh sách ứng viên + trạng thái + lịch phỏng vấn. **Vẫn cắt:** thư viện JD dựng sẵn, đề xuất tuyển nhiều cấp, chấm điểm ứng viên tự động — đó là sân của phần mềm tuyển dụng chuyên biệt.

### 6.3 Chat nội bộ ⇒ **LẬT cách làm: TÍCH HỢP Mattermost, không tự dựng**
Founder xin cả "chat nội bộ" (trong roadmap cũ) lẫn "tích hợp Mattermost". **Làm cả hai là làm hai lần một việc.**

**Quyết định:** iFan **không dựng ứng dụng chat riêng**. Làm hai lớp:
- **Trong iFan:** bình luận + @nhắc **gắn vào đúng bản ghi** (việc này, cơ hội này, khách này) — đây mới là thứ nhóm Zalo không làm được và là lý do thật để có nó (V3 + V7).
- **Ngoài iFan:** nối Mattermost để đẩy thông báo/việc sang nơi đội đang trò chuyện sẵn (V6, cùng nhóm tích hợp).

Dựng một Slack thu nhỏ để đấu với nhóm Zalo miễn phí là cuộc chiến không thắng được, và **không phải chỗ iFan hơn ai**.

### 6.4 "Data Warehouse" ⇒ **ĐỔI TÊN VÀ ĐỔI RUỘT: Xuất dữ liệu & Kết nối BI**
Doanh nghiệp 2–100 người **không vận hành kho dữ liệu**. Thứ họ thật sự cần khi nói câu đó: *"cho tôi lấy số ra Excel/Google Sheets/Looker mà không phải xin ai"*. Làm đúng thứ đó (xuất lịch trình, kết nối chỉ-đọc, webhook) rẻ hơn nhiều lần và **giải đúng nhu cầu**. Dựng warehouse thật là dựng thứ không ai đăng nhập vào — đúng bệnh D2 cấm.

### 6.5 Lương (payroll) ⇒ **NHẬN, nhưng ở V8 và có ranh giới cứng**
Đây là mảng **duy nhất trong danh sách có trách nhiệm pháp lý thật**: tính sai BHXH/thuế TNCN là doanh nghiệp bị phạt, không phải iFan chỉ bị chê. Nhận vì công ty 100 người chắc chắn cần, nhưng:
- **V8**, sau khi chấm công (V7) chạy đủ vài tháng có số thật để tính.
- **Ranh giới cứng, ghi thẳng trên màn:** iFan tính **bảng lương nội bộ** (công × đơn giá + hoa hồng − tạm ứng). **KHÔNG** kê khai BHXH, **KHÔNG** quyết toán thuế, **KHÔNG** ký số — ba việc đó đi qua đối tác/kế toán dịch vụ.
- Ranh giới này **giữ nguyên luật cũ** *"kế toán đầy đủ: vẫn giết"* — bảng lương không phải sổ kế toán.

### Ba thứ VẪN GIỮ nguyên quyết định cũ
| Vẫn không làm | Vì sao vẫn đúng hôm nay |
|---|---|
| **Kế toán đầy đủ** (sổ cái, định khoản, báo cáo thuế) | Chính CNV Work cũng không có. Đi qua đối tác hoá đơn điện tử ở V8 |
| **POS offline (chạy khi mất mạng)** | Bài toán kỹ thuật riêng, chưa nhận. Họ cũng không có |
| **ERP cho doanh nghiệp trên 100 người** | Sân của Odoo/SAP, không đấu |

---

## 7. QUYẾT ĐỊNH 5 — 12 tích hợp: chia 3 rổ, và **một cái phải từ chối**

| Tích hợp | Trạng thái | Đợt |
|---|---|---|
| **Website** (Live Chat nhúng · mặt tiền · QR) | 🟢 **chạy thật rồi** | — |
| **Zalo Bot** (nhắc việc nhân viên) | 🟢 **chạy thật rồi** — chính thức, miễn phí, không cần duyệt OA | — |
| **Zalo OA** | 🟡 code xong, chờ **pháp nhân** duyệt | mở khi có giấy phép |
| **Facebook / Instagram** | 🟡 chờ duyệt Meta | mở khi được duyệt |
| **MCP** ⭐ | 🆕 **làm sớm — xem 7b** | **V3** |
| **Google Drive / Docs** (đính kèm · xuất hợp đồng) | 🆕 | V6 |
| **Mattermost** (đẩy việc/cảnh báo sang chỗ đội đang chat) | 🆕 — thay việc tự dựng chat (6.3) | V6 |
| **Webhook ra + khoá API** | 🕒 đã xếp | V6 |
| **Fireflies.ai** (ghi âm cuộc gọi/họp → tóm tắt vào hồ sơ khách) | 🆕 | V6 |
| **Tổng đài (Call Center)** | 🆕 — 1 trong 5 ô đang thua CNV Work | V7 |
| **Zalo Mini App** | 🆕 — cửa đặt lịch cho khách cuối ngay trong Zalo | V7 |
| **Zalo cá nhân** | ⛔ **TỪ CHỐI — xem 7c** | không làm |

### 7b. Vì sao MCP được kéo lên sớm (V3) dù founder xếp cuối danh sách

**MCP = cách để trợ lý AI (Claude/ChatGPT) đọc được dữ liệu tiệm.** Chủ tiệm hỏi thẳng trợ lý AI của họ *"tháng này tiệm tôi lời bao nhiêu, ai chưa trả tiền?"* và nhận được câu trả lời lấy từ iFan.

Ba lý do kéo sớm:
1. **Rẻ bất thường** — iFan đã có sẵn tầng RPC có kiểm quyền cho mọi bảng. Làm MCP gần như là bọc lại thứ đã có, không phải xây mới.
2. **Chưa đối thủ Việt Nam nào có.** Đây là loại khác biệt không sao chép nhanh được vì nó đòi kiến trúc dữ liệu sạch từ đầu.
3. Nó **biến điểm yếu thành điểm mạnh**: iFan chưa có "20+ dashboard" như đối thủ — nhưng nếu chủ tiệm hỏi được bằng câu nói thường thì họ **không cần 20 dashboard**.

Ràng buộc: MCP đọc qua **đúng lớp phân quyền hiện có**, không mở đường vòng. Mặc định **chỉ-đọc**.

### 7c. Vì sao TỪ CHỐI "Zalo cá nhân" — và đưa gì thay thế

**Đây là dòng duy nhất trong toàn bộ danh sách tôi không thi hành.** Lý do, xếp theo sức nặng:

1. **Nó phá lời hứa đang in trên trang công khai.** Mục Hỏi đáp trên `ifan-web.vercel.app` ngay lúc này viết: *"iFan chỉ dùng Zalo OA chính thức… không bao giờ can thiệp Zalo cá nhân."* Làm ngược lại là biến chính iFan thành thứ mà luật "không nói dối" của dự án sinh ra để chống.
2. **Rủi ro đổ lên đầu khách, không phải lên iFan.** Zalo khoá tài khoản cá nhân khi phát hiện tự động hoá/giả lập — **có mức khoá vĩnh viễn, mất sạch dữ liệu, không khôi phục được** ([Zalo Help](https://help.zalo.me/huong-dan/chuyen-muc/quan-ly-tai-khoan-zalo/loi-thuong-gap/tai-khoan-zalo-bi-tam-thoi-vo-hieu-hoa/), [CafeBiz](https://cafebiz.vn/zalo-khoa-tai-khoan-ngay-lap-tuc-doi-voi-truong-hop-sau-17626062309010049.chn)). Số Zalo cá nhân của chủ tiệm **chính là số kinh doanh của họ** — mất là mất khách, không phải mất một tính năng.
3. **Vault đã liệt kê nó trong danh sách KHÔNG-đuổi-theo** từ trước, cùng lý do.

**Nhu cầu thật nằm dưới câu hỏi đó là: "khách nhắn tôi qua Zalo thường, sao iFan không thấy?"** — và nhu cầu đó có ba đường chính thức, iFan đã đi hai:

| Đường chính thức | Trạng thái |
|---|---|
| **Zalo Bot** — nhân viên nhận việc/nhắc ngay trong Zalo | 🟢 **chạy thật rồi** |
| **Zalo OA** — khách nhắn trang chính thức của tiệm, vào thẳng hộp thư | 🟡 code xong, chờ pháp nhân |
| **Zalo Mini App** — khách đặt lịch/xem đơn ngay trong Zalo | 🆕 xếp V7 |

⇒ **Đề xuất dồn sức đẩy nhanh giấy phép OA** thay vì đi cửa sau. Nếu founder vẫn muốn làm Zalo cá nhân sau khi đọc mục này, cần một ADR riêng ghi rõ ai chịu trách nhiệm khi khách bị khoá số — tôi không tự làm.

---

## 8. QUYẾT ĐỊNH 6 — Cách hiển thị công khai (giải đúng câu *"chưa show ra đủ"*)

**Cái bẫy phải tránh:** đưa 130 tính năng lên trang, 40 cái chạy được ⇒ tỉ lệ tụt từ **11/20 (55%)** xuống **~30%**. Show nhiều hơn mà **trông tệ hơn**.

**Cách gỡ — đổi ĐƠN VỊ hiển thị, không giấu phạm vi:**

| Chỗ | Hiện nay | Đổi thành |
|---|---|---|
| Nhãn đầu trang chủ | "11/20 mảng dùng được" | **"7/9 nhóm đã có phần lõi chạy thật"** |
| `/tinh-nang` | 20 dòng phẳng, 6 nhóm tự đặt | **9 nhóm** theo tên thị trường, mở ra thấy đủ tính năng kèm nhãn thật |
| `/lo-trinh` | 20 mảng theo đợt | giữ nguyên cách kể, thay bằng **25 mảng** |
| Số tổng cộng "130 tính năng" | — | **KHÔNG in ở đâu cả** |

**Vì sao không in số tổng:** con số đó chỉ phục vụ việc khoe, và nó kéo theo nghĩa vụ phải đúng mãi mãi. Người mua cần biết *"nhóm này có dùng được chưa"*, không cần biết *"còn 90 tính năng nữa"*.

**Chữ phải chính xác tuyệt đối:** "**có phần lõi chạy thật**" ≠ "xong". Mỗi tính năng vẫn mang nhãn riêng của nó. Không có chỗ nào được viết câu khiến người đọc tưởng cả nhóm đã xong.

⚠️ **Luật giữ nguyên từ ADR-0011 mục 5:** cấm đưa con số đếm lên tiêu đề trang chủ. Tầm vóc hiện qua **độ phủ một ngày làm việc**, không qua đếm.

---

## 9. Việc giao Sonnet — theo thứ tự

| # | Việc | Ghi chú bắt buộc |
|---|---|---|
| 1 | **Dựng lại `lib/feature-registry.ts` theo 3 tầng** | Nhóm → mảng → tính năng. Bảng mục 4 + mục 2 là nguồn duy nhất. Trạng thái mỗi tính năng phải khớp `SU-THAT-SAN-PHAM.md`, **cấm gõ tay số đếm** |
| 2 | **Cập nhật `/tinh-nang`** | 9 nhóm, mở ra thấy tính năng. Đọc từ registry |
| 3 | **Cập nhật `/lo-trinh`** | 25 mảng theo đợt V2.5→V8 |
| 4 | **Đổi nhãn hero trang chủ** | "{n}/9 nhóm đã có phần lõi chạy thật" — đọc từ registry |
| 5 | **Kanban cho Công việc** | Việc code duy nhất trong đợt này. Dữ liệu `activities` đã đủ, chỉ thêm cách nhìn |
| 6 | **Cập nhật vault + sổ sự thật** | `00 Trang chủ.md` mục "20 module" → 9 nhóm/25 mảng, trỏ ADR này |

**Không làm trong đợt này:** mọi tính năng V3→V8 ở mục 5. ADR này là **bản đồ**, không phải lệnh thi công tất cả.

---

## 10. Nghiệm thu

| Câu hỏi | Đạt khi |
|---|---|
| Mở `/tinh-nang`, có thấy đủ 9 nhóm theo đúng tên thị trường không? | có |
| Có tính năng nào gắn nhãn "dùng được" mà chưa chạy thật không? | **không** |
| Có in số tổng "130 tính năng" ở đâu không? | **không** |
| Mỗi dòng founder liệt kê ở mục 2, có tra ra được nó nằm nhóm nào / đợt nào không? | có — **trừ Zalo cá nhân, đã từ chối có lý do** |
| 4 mảng CNV Work không có, còn nguyên trên bản đồ không? | có (nhóm 8 + M5) |

## Điều kiện xem lại

- **Khi có khách thật đầu tiên trả tiền** ⇒ đọc lại mục 5: thứ tự đợt hiện xếp bằng suy luận, chưa bằng tiếng khách thật đòi.
- **Khi Zalo mở đường chính thức cho tài khoản cá nhân** ⇒ mục 7c hết hiệu lực, làm được ngay.
- **Khi có ≥3 khách hỏi cùng một tính năng đang xếp V7/V8** ⇒ được kéo sớm, ghi ADR mới.
- **Khi CNV Work bổ sung đặt lịch hoặc kho** ⇒ nhóm 8 mất lợi thế, đọc lại toàn bộ định vị.
- **Khi mảng Lương (M19) bắt đầu code** ⇒ bắt buộc đọc lại 6.5 và xác nhận ranh giới pháp lý còn đúng luật hiện hành.

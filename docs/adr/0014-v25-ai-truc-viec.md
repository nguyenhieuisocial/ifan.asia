# ADR-0014 — V2.5 "AI trực việc": chốt chặn trước, câu trả lời sau (13/08/2026)

**Trạng thái:** đã quyết, CHƯA thi công. Mở việc chính của đợt **V2.5**.
**Người quyết:** Opus 5, phiên 13/08 (ngay sau khi V2 đóng 6/6).
**Thay/đính chính:** mục 35.4 "AI làm việc" (task #95) · hàng V2.5 của `00 Trang chủ.md` mục 4 · điều kiện nghiệm thu của task #110 (A/B Opus vs Haiku).
**Ràng buộc gốc:** luật **D1** (một nguồn sự thật) · luật **D2** (chưa có code ghi thì chưa tạo) · **bất biến 1** (chặn ở CSDL, không ở giao diện) · **bất biến 12** (liên kết chéo qua `domain_events`) · luật **D3** (mỗi ca nghiệm thu phải thấy ĐỎ ít nhất một lần).

---

## 1. Vì sao viết ADR này

"AI làm việc" được founder chốt là **điểm khác biệt số 1** (task #95, 12/08) nhưng tới nay **chưa có một dòng code nào**. Sổ đăng ký mảng đang ghi `aiWork: building` — tức trang `/lo-trinh` công khai đang nói *"Đang xây ngay lúc này"*. Câu đó chỉ đúng nếu đợt này thật sự xây.

Nhưng thứ ép phải viết ADR chứ không code thẳng là **số đo bên dưới**: nó lật ngược giả định lớn nhất của tính năng này.

## 2. Đo thật trước khi quyết (13/08, trên CSDL Singapore + kho code)

| Đo | Kết quả |
|---|---|
| Tiệm thật / tiệm mẫu | **3 / 6** |
| Hội thoại **thật** | **0** — cả 48 hội thoại đều nằm ở tiệm mẫu |
| Tin nhắn **thật** | **0** — cả 478 tin đều ở tiệm mẫu |
| Lượt AI đã dùng từ trước tới nay | **0** |
| Copilot AI hiện có (tóm tắt · gợi ý trả lời · trích thông tin khách) | Đã nối **đủ đường**: `lib/ai/gateway.ts` → `inbox/ai-actions.ts` → `inbox/ai-assist.tsx`. Nhưng **chưa chạy lần nào với dữ liệu thật** |
| Kênh vào đang sống | `livechat` **1 active** · `zalo_oa` **6 pending_platform** (chờ pháp nhân) · Telegram khách: **0 tiệm nối** dù đã dựng xong 13/08 |
| **Dịch vụ & giá đã khai** | **0 dòng** — kể cả tiệm mẫu |
| **Giờ mở cửa đã khai** | **0 dòng** — kể cả tiệm mẫu |
| Lịch hẹn | **0** (V2 vừa đóng hôm qua) |
| Trần lượt AI theo gói | Đã có: free **30**/tháng · pro **300**/tháng |
| Model đang dùng | `claude-opus-5` (biến `AI_MODEL` không đặt ⇒ rơi về mặc định đắt nhất) |

**Kết luận đo — ba điều, điều thứ ba là điều quan trọng nhất:**

1. **Nền AI đã có sẵn nhiều hơn tưởng.** Cổng gọi model, trần lượt theo tenant, phân loại 7 kiểu lỗi, chế độ "chưa cấu hình thì không sập" — đều đã dựng. Đợt này **không phải xây lại cổng**, chỉ thêm một đường đi mới qua cổng đó.

2. **Chỉ có một cửa vào sống.** Zalo OA chờ pháp nhân — không tự gỡ được. Vậy autopilot phải chạy trên **Live Chat + Telegram**, không phải Zalo. Ai viết "AI trả lời khách Zalo" là viết cho một cửa chưa mở.

3. **KHÔNG CÓ GÌ ĐỂ TRẢ LỜI.** 0 dịch vụ, 0 giá, 0 giờ mở cửa — trên **mọi** tiệm, kể cả tiệm mẫu. Một AI trực việc bật lên hôm nay sẽ đứng trước câu *"Shop mở mấy giờ, cắt tóc bao nhiêu tiền?"* mà **không có một dữ kiện nào** trong tay. Nó chỉ còn hai lựa chọn: im lặng, hoặc **bịa**.

> **Đây là bẫy nguy hiểm nhất của cả đợt.** Một AI im lặng thì tiệm tưởng hỏng. Một AI bịa thì tiệm **mất khách và mất mặt** — và lỗi đó *không hiện ra ở đâu cả* cho tới khi khách bỏ đi. Cùng họ với lỗi "báo thành công giả" đã dính nhiều lần: chạy đúng cú pháp, sai với người thật.

## 3. QUYẾT ĐỊNH 1 — Không cho bật khi tiệm chưa có gì để trả lời

Công tắc AI trực việc **bị khoá** cho tới khi tiệm khai **ít nhất một trong hai**: bảng dịch vụ & giá, hoặc giờ mở cửa. Chưa có thì màn hiện thẳng lý do + đường bấm sang chỗ khai, **không** cho gạt công tắc.

**Vì sao khoá chứ không cảnh báo:** cảnh báo là thứ người ta bấm bỏ qua. Hậu quả của việc bật nhầm không rơi vào tiệm ngay lúc bấm — nó rơi vào **khách của tiệm**, vài giờ sau, ở một hội thoại chẳng ai đang nhìn.

**Chốt chặn nằm ở CSDL** (bất biến 1): hàm quyết định gửi phải tự kiểm nguồn dữ liệu, không tin vào việc màn hình đã khoá.

## 4. QUYẾT ĐỊNH 2 — AI chỉ được trả lời từ dữ liệu tiệm, cấm sáng tác

Phạm vi đợt này **đúng một loại việc**: trả lời câu hỏi thông tin mà tiệm **đã tự khai**.

**Được trả lời** — và chỉ khi có dữ liệu tương ứng:

| Câu khách hỏi | Nguồn sự thật |
|---|---|
| Mở cửa mấy giờ, hôm nay có làm không | `business_hours` + `business_closures` (theo `tenants.timezone`) |
| Làm dịch vụ gì, bao nhiêu tiền, bao lâu | `services` (`name`, `price_vnd`, `duration_minutes`, chỉ `is_active`) |
| Ở đâu | `tenant_storefront.address` |
| Giới thiệu tiệm | `tenant_storefront.intro` |

**CẤM tuyệt đối, kể cả khi khách hỏi thẳng:** báo giá ngoài bảng dịch vụ · hứa thời gian/kết quả · chốt lịch hẹn · nhận đơn · nhận tiền hay cọc · nói về khuyến mãi · trả lời thay chủ tiệm về chuyện riêng của một khách cụ thể.

Gặp thứ nằm ngoài bảng trên ⇒ **không đoán**, chuyển người (mục 5).

**Vì sao hẹp tới mức này:** giá trị của AI trực việc ở tiệm nhỏ **không phải** "AI thông minh" — mà là *"khách nhắn lúc 11 giờ đêm vẫn có người trả lời giờ mở cửa"*. Đó là 80% câu hỏi thật của một tiệm, và là 100% loại câu **có thể trả lời đúng mà không cần đoán**. Mở rộng phạm vi lúc chưa có một hội thoại thật nào là mở rộng vào chỗ tối.

## 5. QUYẾT ĐỊNH 3 — Luôn có đường về tay người, và đường đó phải đếm được

AI dừng và **bàn giao cho người** khi rơi vào một trong bốn:

1. Câu hỏi nằm ngoài bảng ở mục 4.
2. Đã trả lời đủ **N lượt** trong cùng hội thoại (mặc định **3**, tiệm chỉnh 1–10).
3. Khách nhắn lại ngay sau câu AI vừa gửi mà nội dung tỏ ý chưa thoả (hỏi lại, phàn nàn, đòi gặp người).
4. Bất kỳ lỗi nào của cổng AI — hết lượt, sai khoá, model từ chối.

Bàn giao = đánh dấu hội thoại **chưa trả lời** (`is_unanswered`) + ghi nhật ký lý do. **Không** gửi thêm câu "để em chuyển cho nhân viên nhé" nếu tiệm không bật — im lặng đúng chỗ tốt hơn một lời hứa máy không giữ được.

## 6. QUYẾT ĐỊNH 4 — Ghi nhật ký cả lần KHÔNG trả lời

Bảng nhật ký phải ghi **mọi lượt quyết định**, không chỉ lượt gửi thật: gửi · tắt · ngoài giờ · hết trần ngày · hết lượt tháng · quá số lượt hội thoại · không có dữ liệu để trả lời · bàn giao · lỗi.

**Vì sao đây là quyết định chứ không phải chi tiết kỹ thuật:** "AI không trả lời" là kiểu hỏng **vô hình**. Không có dòng log nào thì tiệm chỉ thấy "AI chẳng làm gì" và không ai — kể cả mình — biết vì sao. Đúng loại lỗi đã dính hôm nay ở bản tin Tính Năng và ở bảng nhãn `/chude`: chạy đúng, im lặng, sai.

## 7. QUYẾT ĐỊNH 5 — Đổi sang Haiku 4.5 NGAY, không chờ A/B

Task #110 định A/B Opus vs Haiku trên **20 hội thoại thật**. Số đo: có **0** hội thoại thật. Điều kiện đó **không thể đạt được** ở thời điểm này — giữ nguyên là giữ một việc vĩnh viễn không tới lượt.

**Phán:** đổi mặc định sang **Haiku 4.5** cho toàn dòng AI ngay trong đợt này. Ba căn cứ:

1. Việc AI phải làm ở mục 4 là **tra dữ liệu rồi diễn đạt lại** — không phải suy luận nhiều bước. Đây đúng tầm Haiku.
2. Giá vào rẻ hơn **5 lần**, giá ra rẻ hơn **5 lần**. Với gói free 30 lượt/tháng, chênh lệch này quyết định gói free có sống nổi không.
3. Chi phí sai lệch nếu Haiku kém hơn là **có thể quay đầu bằng một biến môi trường** — trong khi chi phí chờ A/B là **đợt này không đóng được**.

**Điều kiện xem lại (thay tiêu chí cũ của #110):** khi có **20 hội thoại thật** đầu tiên, chấm tay 20 câu AI trả lời theo 3 mức (đúng · vô hại nhưng vô dụng · sai sự thật). Có **bất kỳ câu nào sai sự thật** ⇒ nâng model, không tranh luận.

## 8. QUYẾT ĐỊNH 6 — Trần chi phí phải có tầng theo NGÀY, không chỉ theo tháng

Trần tháng đã có (free 30 / pro 300) nhưng nó **không chặn được** kịch bản đắt nhất: một khách nhắn liên tục lúc nửa đêm ăn sạch hạn mức tháng trong 20 phút, và sáng hôm sau tiệm không còn lượt nào cho khách thật.

Thêm hai tầng, cả hai chặn ở CSDL:

- **Trần ngày / tiệm** — mặc định 50, tiệm chỉnh 1–500.
- **Trần lượt / hội thoại** — chính là N ở mục 5.

## 9. Phạm vi V2.5 việc "AI trực việc" — ĐÚNG 6 việc, không hơn

| # | Việc | Ghi chú |
|---|---|---|
| 1 | **Migration nền**: `ai_autopilot` (cài đặt / tiệm) + `ai_reply_log` (nhật ký mọi lượt quyết định) + RLS + RPC `ai_autopilot_decide()` | Khai `ai.*` vào `docs/EVENT_CATALOG.md` **trong cùng migration** (bất biến 12) |
| 2 | **Thẻ design** màn "AI trực việc" | Opus vẽ, không phải Sonnet |
| 3 | **Màn Cài đặt → AI trực việc**: công tắc (khoá theo QĐ 1) · phạm vi giờ · 2 trần · nhật ký | Quyền `owner/admin/manager` — khớp khuôn màn Dịch vụ (ADR-0009 mục 7b) |
| 4 | **Cắm vào đường tin đến** Live Chat + Telegram | Một đường code chung cho cả hai kênh (bất biến 3) |
| 5 | **Đổi `AI_MODEL` mặc định sang Haiku 4.5** | Đóng luôn task #106 + đổi tiêu chí #110 |
| 6 | **Nghiệm thu D3** vào `scripts/rls-smoke.mjs` | Bảng mục 10 |

**CẮT khỏi đợt, ghi rõ để không ai tưởng bị quên:** AI tự đặt lịch hẹn · AI tự tạo đơn/báo giá · AI đọc tài liệu tiệm tải lên (RAG) · AI gọi điện · AI trả lời đa ngôn ngữ · AI chủ động nhắn trước cho khách · trang riêng từng khách `/k/[token]`.

**Vì sao vẫn cắt `/k/[token]`:** ADR-0008 hoãn nó tới *"khi có người dùng thật"*. Đo 13/08: **0 lịch hẹn, 0 hội thoại thật**. Điều kiện **chưa đạt** — dựng bây giờ là dựng một trang không ai có gì để xem (luật D2). Giữ nguyên hoãn, và ghi lại đây để lần sau không phải tra lại vì sao.

## 10. Nghiệm thu (vào `scripts/rls-smoke.mjs` — luật D3, phải thấy ĐỎ ít nhất một lần)

| Ca | Ngưỡng đạt |
|---|---|
| Tiệm **chưa khai** dịch vụ lẫn giờ mở cửa, gọi hàm quyết định | **Từ chối gửi**, ghi log `skipped_no_source` — kể cả khi cột `enabled` bị bật tay trong CSDL |
| Công tắc tắt | Từ chối gửi, ghi log `skipped_off` |
| Đã gửi đủ N lượt trong hội thoại | Từ chối, ghi log, hội thoại bị đánh dấu **chưa trả lời** |
| Vượt trần ngày | Từ chối, ghi log `skipped_daily_cap` |
| Tiệm A đọc nhật ký AI của tiệm B | **0 dòng** |
| `staff` đổi cài đặt AI | **Bị chặn** ở RLS, không chỉ ẩn nút |
| Chưa cấu hình khoá AI (`ANTHROPIC_API_KEY` trống) | **Không sập**, ghi log `error`, hội thoại về tay người |
| Câu hỏi ngoài phạm vi mục 4 | **Không có tin nào gửi đi**, hội thoại về tay người |

**Ca không thể kiểm bằng máy, phải bấm tay:** một hội thoại thật qua Telegram do chính founder nhắn vào một tiệm đã khai dịch vụ + giờ mở cửa, đọc câu AI trả lời bằng mắt. **Không có bước này thì đợt không đóng** — 478 tin của tiệm mẫu không thay được một khách thật.

## 11. Hệ quả

- `aiWork` giữ `building` trong đợt này, chuyển `ready` **chỉ sau** khi ca bấm tay ở mục 10 xanh. Chuyển sớm là nói dối trên trang công khai.
- Bản tin tự động về chủ đề **Tính Năng** sẽ tự báo lúc mảng này đổi trạng thái — không phải nhớ đi báo tay.
- Tiệm mẫu cần được nạp **dịch vụ + giờ mở cửa** thì mới demo được AI trực việc. Hiện 0 dòng ⇒ thêm vào bước nạp dữ liệu mẫu.

## Điều kiện xem lại

- Có **20 hội thoại thật** ⇒ chấm chất lượng theo mục 7.
- Zalo OA được duyệt ⇒ thêm kênh thứ ba vào việc 4, không sửa lại kiến trúc.
- Có tiệm đòi AI chốt lịch hẹn ⇒ mở ADR mới, **không** nới phạm vi mục 4 bằng một dòng sửa.

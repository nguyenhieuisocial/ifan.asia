# EVENT_CATALOG v1 — iFan.asia

Mọi module PHÁT sự kiện vào bảng `domain_events` (outbox, ghi cùng transaction nghiệp vụ).
Workflow Engine là bên TIÊU THỤ chính. Không module nào gọi thẳng module khác.

## Quy ước

- `event_type`: `<aggregate>.<động_từ_quá_khứ>` — vd `deal.stage_changed`
- `aggregate_type` + `aggregate_id`: bản ghi gốc phát sự kiện
- `payload`: JSON phẳng, chỉ chứa dữ liệu cần cho consumer (id, giá trị cũ/mới), KHÔNG nhét cả object
- Mọi event tự động mang `tenant_id` + `actor_user_id` (từ context) — consumer không cần hỏi lại
- Thêm event mới = thêm dòng vào catalog này TRƯỚC khi code phát nó

## Catalog v1 (GĐ0–GĐ1)

| event_type                      | aggregate          | payload chính                                          | Phát bởi                                                 | Tiêu thụ bởi (dự kiến)                  |
| ------------------------------- | ------------------ | ------------------------------------------------------ | -------------------------------------------------------- | --------------------------------------- |
| `tenant.created`                | tenant             | name, slug                                             | Platform (create_tenant)                                 | Onboarding, super-admin                 |
| `member.invited`                | tenant_member      | user_id, role                                          | Platform                                                 | Notification                            |
| `contact.created`               | contact            | source, channel                                        | CRM / Inbox / Import                                     | Workflow, Lead scoring                  |
| `contact.updated`               | contact            | changed_fields                                         | CRM                                                      | Workflow                                |
| `contact.tier_changed`          | contact            | old_tier, new_tier                                     | CRM (rule engine)                                        | Workflow (chăm lại), Báo cáo            |
| `contact.company_linked`        | contact            | company_id, method (`auto_domain`\|`manual`\|`import`) | CRM                                                      | Workflow, Báo cáo B2B                   |
| `contact.owner_changed`         | contact            | old_owner_id, new_owner_id                             | CRM (gán lại phụ trách — đơn lẻ + hàng loạt "Giao cho…") | Workflow, Notification                  |
| `contact.merged`                | contact (bản GIỮ)  | winner_id, loser_id, fields_taken, moved               | CRM (gộp trùng)                                          | Workflow, Báo cáo, Đồng bộ ngoài        |
| `company.created`               | company            | name, email_domain, tax_code                           | CRM                                                      | Workflow, Báo cáo B2B                   |
| `company.updated`               | company            | changed_fields                                         | CRM                                                      | Workflow                                |
| `deal.created`                  | deal               | pipeline_id, stage_id, value_vnd, source               | CRM                                                      | Báo cáo, Workflow                       |
| `deal.stage_changed`            | deal               | old_stage_id, new_stage_id                             | CRM                                                      | SLA engine, Báo cáo                     |
| `deal.won`                      | deal               | value_vnd, source_attribution                          | CRM                                                      | Attribution, Tài chính (GĐ4), Phân hạng |
| `deal.lost`                     | deal               | reason                                                 | CRM                                                      | Báo cáo                                 |
| `conversation.message_received` | conversation       | channel, external_id, direction                        | Inbox (worker)                                           | AI extraction, SLA, Notification        |
| `conversation.assigned`         | conversation       | assignee_user_id                                       | Inbox                                                    | Notification                            |
| `sla.warning` / `sla.breached`  | deal\|conversation | policy_id, elapsed                                     | SLA engine                                               | Notification, leo thang                 |
| `ai.extraction_completed`       | conversation       | contact_fields, confidence                             | AI Engine                                                | CRM (đề xuất cập nhật hồ sơ)            |

## Trạng thái phát event (cập nhật 05/08/2026)

**Cách phát: TRIGGER DB, cùng transaction nghiệp vụ.** Từ migration #15, event của
`contacts` / `deals` / `companies` do trigger AFTER INSERT/UPDATE trên chính bảng đó
phát ra — ghi nghiệp vụ và ghi event vào `domain_events` là MỘT transaction. Không còn
đường nào phát thiếu, phát trùng, hay quên phát khi viết code mới; ghi bằng service role
hay seed script cũng phát đủ. `tenant_id` lấy từ HÀNG (không phải JWT), `actor_user_id`
lấy từ `auth.uid()` và được phép null.

| Event | Trigger phát |
|---|---|
| `tenant.created` | RPC `create_tenant` (migration #1/#15) |
| `contact.created` | `contacts_emit_events` — `source_id`, `channel` |
| `contact.updated` | `contacts_emit_events` — `changed_fields` tính từ OLD/NEW |
| `contact.tier_changed` | `contacts_emit_events` — `old_tier`/`new_tier`; từ migration #19 **nguồn ghi `contacts.tier` là máy phân hạng** `recompute_contact_tier()`, không còn đổi tay |
| `contact.company_linked` | `contacts_emit_events` — `company_id`, `method` |
| `contact.owner_changed` | `contacts_emit_events` — `old_owner_id`, `new_owner_id` (migration #72, task #79 — `assignContactOwner()` dùng chung đơn lẻ + hàng loạt); `owner_id` vẫn còn trong `changed_fields` của `contact.updated`, event này CHỈ THÊM |
| `contact.merged` | **không phải trigger** — `merge_contacts()` gọi `wf_emit` tường minh (migration #18); `aggregate_id` = hồ sơ GIỮ |
| `company.created` | `companies_emit_events` — `name`, `email_domain`, `tax_code` |
| `company.updated` | `companies_emit_events` — `changed_fields` tính từ OLD/NEW |
| `deal.created` | `deals_emit_events` — `pipeline_id`, `stage_id`, `value_vnd`, `contact_id`, `source_id` (nguồn của khách), `owner_id` |
| `deal.stage_changed` | `deals_emit_events` — mọi đường đổi cột (sửa form, kéo-thả, thắng, thua) |
| `deal.won` | `deals_emit_events` — `value_vnd`, `contact_id`, `source_id`, `owner_id` |
| `deal.lost` | `deals_emit_events` — `reason` (tên) + `lost_reason_id`, `contact_id`, `value_vnd` |
| `sla.warning` | `sla_fire()` (migration #17) — `policy_id`, `elapsed` (phút), `policy_name`, `level` (`warning`\|`window_warning`), `urgency`, `escalated_to`, `started_at` |
| `sla.breached` | `sla_fire()` (migration #17) — cùng payload, `level = 'breached'`, `urgency = 'high'` |

**Quy ước phụ để payload đúng catalog:**
- `changed_fields` chỉ tính trên cột NGHIỆP VỤ. Cột hệ thống/dẫn xuất (`lead_score*`,
  `search_text`, `total_revenue`, `last_interaction_at`, `updated_at`) không sinh event;
  `tier` cũng bị loại vì đã có `contact.tier_changed` riêng (1 thao tác = 1 event).
- Xóa mềm (`deleted_at`) không phát event.
- **`contact.merged` là ngoại lệ có chủ đích của luật "event bằng trigger"** (migration #18).
  Hai lý do cứng: (1) `fields_taken` là THAM SỐ của thao tác gộp — người dùng chọn giữ
  giá trị của ai — không nằm trong trạng thái hàng nào nên trigger đọc OLD/NEW không suy
  ra được; (2) bản THUA đổi trạng thái bằng đúng một lần xóa mềm, mà `contacts_emit_events`
  cố ý im lặng với xóa mềm — sửa quy ước đó chỉ để nhét merge vào sẽ làm mọi luồng xóa mềm
  khác phát event rác. Bảo đảm giao dịch KHÔNG yếu đi: `wf_emit()` chạy bên trong
  `merge_contacts()` nên cùng transaction với mọi thao tác ghi, và `merge_contacts()` là
  đường DUY NHẤT đặt `contacts.merged_into_id` nên không có lối nào gộp mà quên phát.
  Gộp lại đúng cặp cũ là no-op → không phát lần hai.
- Bản GIỮ trong lượt gộp cũng phát `contact.updated` (và `contact.tier_changed` /
  `contact.company_linked` nếu người dùng chọn lấy giá trị của bản thua) — đúng nghĩa: hồ
  sơ đó thật sự đổi. Consumer muốn xử lý riêng lượt gộp thì bắt `contact.merged`.
- `channel` (contact.created) và `method` (contact.company_linked) không suy ra được từ
  dữ liệu hàng nên tầng web gửi kèm header `x-ifan-event-ctx` (xem `EventContext` trong
  `lib/supabase/server.ts`); trigger đọc bằng `wf_event_ctx()`. Không có header → mặc
  định `crm` / `manual`.
- Event do hành động của Workflow Engine sinh ra mang `source_module = 'workflow'` và
  `causation_chain = bậc nguồn + 1` (chống vòng lặp, tối đa bậc 3).
- Event SLA mang `source_module = 'sla'`, `causation_chain = 0` (là gốc chuỗi, không do
  event khác gây ra) và `actor_user_id = null` (worker nền, không có phiên đăng nhập).
  `aggregate_type` là `conversation` hoặc `deal` theo `sla_policies.target_type`.
  MỘT mốc phát ĐÚNG MỘT event: chỉ mục duy nhất
  `(policy_id, target_type, target_id, level, started_at)` trên `sla_events` là cơ chế
  chống bắn trùng — `started_at` (mốc bắt đầu đồng hồ) đóng vai trò mã chu kỳ nên khách
  nhắn lại / sale dời hạn thì SLA lên dây lại và được phát tiếp.

**Bên phát phân hạng khách (migration #19):** `recompute_contact_tier(contact_id)` là chỗ
DUY NHẤT ghi `contacts.tier`, chạy từ trigger trên `deals` (thắng / đổi giá trị / đổi khách /
xóa mềm), trigger trên `contacts` (`last_interaction_at` đổi ⇒ thoát Nguội), RPC
`apply_tier_rules()` (đổi ngưỡng ở Cài đặt) và pg_cron `contact-tier-nightly` (02:00 giờ VN —
phần phụ thuộc thời gian: im lặng quá `tier_rules.dormant_after_days` ngày ⇒ Nguội).
**Không** gọi `wf_emit` tường minh: hàm ghi `tier` bằng một UPDATE có điều kiện
`tier is distinct from`, nên tính lại ra cùng hạng ⇒ 0 dòng bị ghi ⇒ `contacts_emit_events`
không chạy ⇒ 0 event. Đúng một event cho một lần đổi hạng thật, cùng transaction.

**Chưa phát (có lý do):**
- Các event của module chưa ship (Kho, Tài chính…) — vẫn là khai-báo-trước.

**Đã nối nốt (12/08, task #79):** `contact.owner_changed` — hành động gán lại phụ
trách (`assignContactOwner()`, dùng chung cho nút đơn lẻ tương lai lẫn nút hàng loạt
"Giao cho…") đã dựng, `contacts_emit_events` đã phát đúng như khai trước (migration #72).

**RPC `emit_event` vẫn còn** (migration #1) làm hợp đồng cho module tương lai chưa có
bảng riêng; các module CRM/Inbox không còn gọi nó — `lib/events.ts` đã xóa.

**Bên tiêu thụ:** `process_workflow_events()` (pg_cron mỗi phút, migration #15) đọc
`domain_events` chưa xử lý, ghép với `workflows` đang bật rồi tạo `workflow_runs`;
`processed_at` chỉ được đặt khi mọi run của event đã kết thúc (`done` hoặc `dead`).

**Bên phát SLA:** `process_sla_timers()` (pg_cron mỗi phút, migration #17) quét
`conversations` chưa được trả lời và `deals` quá hạn việc kế tiếp theo `sla_policies`
đang bật, ghi mốc vào `sla_events`, phát `sla.warning` / `sla.breached` rồi tạo ĐÚNG MỘT
`notifications` cho người nhận (cảnh báo → người phụ trách; vi phạm và mốc "sắp hết cửa
sổ trả lời 48h của Zalo" → người leo thang theo `sla_policies.escalate_to`).

Các giai đoạn sau (kho, tài chính, POS, HRM, booking) bổ sung vào catalog này theo spec từng module — cập nhật bảng TRƯỚC khi phát event đầu tiên.

## Khai trước cho V1b (12/08 — CHƯA CÓ CODE, khai theo bất biến 12 + luật D1)

| event_type | aggregate | payload chính | Phát bởi | Tiêu thụ bởi |
|---|---|---|---|---|
| `help_request.created` | help_request | `message`, `allow_screen_view` | Màn "Cần giúp?" (V1b việc 5) | Thông báo founder (Zalo Bot + bảng điều khiển nền tảng) |
| `support_session.started` | support_session | `admin_user_id`, `reason`, `expires_at` | Phiên hỗ trợ chỉ-đọc (ADR-0006) | Nhật ký bản ghi (24q) · dải báo trong app của tiệm |
| `support_session.ended` | support_session | `ended_by` (`admin`\|`tenant`\|`expiry`) | Phiên hỗ trợ chỉ-đọc | Nhật ký bản ghi (24q) · tắt dải báo |

**Hai mảnh V1b CỐ Ý KHÔNG phát event** (khai rõ để không bị coi là sót — Quy hoạch mục 36.11):

- **Thao tác hàng loạt** (`bulk_operations`): hàng loạt gọi lại ĐÚNG hàm thao tác đơn lẻ, hàm đó đã phát event của nó. Phát thêm `bulk.*` sẽ khiến consumer **đếm hai lần**. Bảng `bulk_operations` là **biên nhận**, không phải nguồn phát.
- **Bộ lọc lưu sẵn** (`saved_views`): cấu hình đọc, không đổi dữ liệu nghiệp vụ. Tính năng tương lai (gửi tin, voucher) **GỌI** nó lấy danh sách chứ không **NGHE** nó.

## Lịch hẹn V2 (12/08 — ĐÃ CÓ TRIGGER PHÁT, migration #83, ADR-0009)

**ĐÚNG 5 event — một cho mỗi trạng thái** của máy trạng thái đã chốt ở ADR-0009 mục 5
(`booked → arrived → done`, nhánh `cancelled` / `no_show`). Không khai thừa: mỗi tên dưới
đây có đúng một chỗ sinh ra nó, và mọi trạng thái đều có đúng một tên.

| event_type | aggregate | payload chính | Phát bởi | Tiêu thụ bởi |
|---|---|---|---|---|
| `appointment.booked` | appointment | `contact_id`, `staff_user_id`, `resource_id`, `item_id` (đổi tên từ `service_id`, migration #125/ADR-0019), `start_at`, `end_at`, `price_vnd`, `source` | `appointments_emit_events` (INSERT, và mọi lần trạng thái trở lại `booked`) | Nhắc nhân viên (`bot_outbox` + `activities`, V2 việc 6) · Timeline khách (ma trận 32 đường 49) |
| `appointment.arrived` | appointment | cùng bộ trên | `appointments_emit_events` (đổi trạng thái) | Timeline khách · màn Lịch |
| `appointment.done` | appointment | cùng bộ trên | `appointments_emit_events` (đổi trạng thái) | Timeline khách; **V3+**: Gói buổi (24f), Đơn/Thu tiền (đường 13), Kho tiêu hao (đường 25) |
| `appointment.cancelled` | appointment | cùng bộ trên + `cancel_reason`, `cancelled_by` | `appointments_emit_events` (đổi trạng thái) | Timeline khách · task reconciliation (đường 48) |
| `appointment.no_show` | appointment | cùng bộ trên | `appointments_emit_events` (đổi trạng thái) | Timeline khách; **V3+**: Sổ tiền (đường 15), độ tin cậy khách (đường 16) |

| Event | Trigger phát |
|---|---|
| `appointment.*` | `appointments_emit_events` — AFTER INSERT OR UPDATE trên `public.appointments`, cùng transaction nghiệp vụ (đúng khuôn `contacts_emit_events`). Tên event dựng thẳng từ `new.status` nên **không có đường nào đổi trạng thái mà quên phát**, cũng không có đường nào phát một tên không thuộc 5 trạng thái |

**Ba thứ CỐ Ý KHÔNG phát** (khai rõ kèm lý do — im lặng bị tính là sót):

- **`appointment.status_changed` (event gộp):** 4 event trạng thái ở trên đã phủ hết. Phát cả
  hai khiến consumer **đếm hai lần** — đúng bài học `bulk_operations` của V1b. Đây cũng là
  **đính chính tên event ở Quy hoạch mục 32 hàng 7**, vốn viết `appointment.booked/status_changed`
  từ trước khi máy trạng thái được chốt còn 5.
- **`appointment.rescheduled` (dời giờ):** V2 chưa có ai NGHE. Job nhắc nhân viên đọc thẳng
  `start_at` lúc gửi nên luôn thấy giờ mới; phát một event không consumer là vi phạm luật D2.
  Khi V7 dựng nghỉ phép/đổi ca (ma trận 32 đường 37–39) thì thêm cùng `appointment.conflict_flagged`.
- **Xoá mềm (`deleted_at`):** giữ nguyên quy ước sẵn có của kho ("xóa mềm không phát event").
  Huỷ một ca là `appointment.cancelled` — có lý do, có người huỷ; xoá mềm chỉ là dọn màn hình.
- **`item.*` (`service.*`/`resource.*` cũ — màn Cài đặt → Dịch vụ & Tài nguyên, V2 việc 3, 13/08;
  ĐÃ MỞ LẠI theo đúng lời hẹn ở trên, migration #125/ADR-0019 mục 3, 17/08 — vẫn giữ nguyên
  quyết định KHÔNG phát):** sửa bảng giá/catalog là **thay cấu hình**, không phải một việc xảy
  ra với khách — vẫn **chưa có consumer nào** cần đồng bộ giá tự động (order_lines V3 chốt giá
  TẠI THỜI ĐIỂM đặt/bán, không đọc lại `items.price_vnd` sau đó — xem ADR-0019 mục 5). Phát một
  event không ai nghe là vi phạm D2. Ai đổi gì đã có `record_audit` của kho lo, không cần đường
  thứ hai. Kể cả nút "nạp dịch vụ mẫu theo ngành" cũng không phát: nó chỉ chèn thẳng vào `items`
  (khác `apply_industry_pack`, hàm đó có ghi audit `pack_applied` vì nó đổi cả NGÀNH của tiệm).
  **Điều kiện xem lại (lần hai):** khi có nơi thật sự cần đồng bộ giá đổi (vd. giỏ hàng đang mở
  của khách phải cập nhật giá mới) thì mới thêm `item.created`/`item.updated`.

**Chưa có đường tới KHÁCH (ADR-0009 quyết định 1):** V2 nhắc **nhân viên** tự động, còn tin cho
khách là **soạn sẵn để lễ tân bấm gửi**. Không event nào ở trên được nối vào một consumer tự
gửi tin cho khách. Khi Zalo OA cắm xong thì ba việc đi cùng nhau: thêm adapter `NotifyChannel`,
thêm trạng thái `confirmed`, bật nhắc khách tự động.

## AI trực việc V2.5 (13/08 — nền đã dựng, migration #105, ADR-0014)

| event_type | aggregate | payload chính | Phát bởi | Tiêu thụ bởi (dự kiến) |
|---|---|---|---|---|
| `ai.replied` | conversation | `message_id` | `ai_reply_log_record()` khi `p_outcome='sent'` | Timeline khách (đánh dấu tin do AI gửi) · Báo cáo (bao nhiêu % câu do AI xử) |

**Phát TƯỜNG MINH từ RPC, đúng khuôn `contact.merged`** (không phải trigger đọc OLD/NEW): "AI đã
trả lời" là một QUYẾT ĐỊNH của `ai_reply_log_record()`, không phải một cột đổi giá trị trên hàng
nào. Cùng transaction với dòng ghi vào `ai_reply_log` — không có đường nào ghi 'sent' mà quên phát.

**CỐ Ý KHÔNG phát cho 7 outcome còn lại** (`skipped_*`, `error`): đây là quyết định KHÔNG làm gì
với khách — không consumer nào có việc phải xử lý khi AI im lặng (phát một event không ai nghe là
vi phạm D2). Nhật ký đủ trong `ai_reply_log`; ai cần đếm "bao nhiêu lần AI im lặng" thì đọc bảng
đó, không phải nghe event.

**Chưa có consumer thật** tại thời điểm khai (13/08) — đúng tinh thần "khai trước cho V1b": bảng
trên khai event TRƯỚC khi có ai nghe, để khi Timeline khách/Báo cáo cần tới thì chỉ việc đăng ký
nghe, không phải sửa lại `ai_reply_log_record()`.

> ⚠️ **Bổ sung 14/08:** `ai.replied` khai ở đây từ 13/08 nhưng **thiếu hàng trong ma trận Quy
> hoạch mục 32** cho tới hôm nay — tức chỉ khai MỘT trong HAI nơi bắt buộc (bất biến 12 + luật
> D1). Đã thêm **hàng 53** vào ma trận. Xem thêm hai mục ngay dưới: hai module cùng đợt cũng
> thiếu khai, dù chúng cố ý không phát gì.

## Kho tri thức (ADR-0015, migration #113–117, 13/08) — CỐ Ý KHÔNG PHÁT EVENT NÀO

Khai rõ ở đây vì **mảnh cố ý không phát cũng phải khai kèm lý do — im lặng bị tính là sót**
(bất biến 12; bẫy 5 của `AGENTS.md`).

Viết/sửa/đăng/gỡ một bài tri thức là **thay cấu hình cho AI đọc**, không phải một việc xảy ra
với khách. Không consumer nào có gì để làm với nó, mà phát một event không ai nghe là vi phạm
D2. Ai đổi gì đã có `record_audit` của kho lo — không cần đường thứ hai. Đây đúng lý do đã dùng
cho `service.*`/`resource.*` ở V2 việc 3.

**Mở lại quyết định này khi:** có module cần biết "kho tri thức vừa đổi" — ví dụ đo chất lượng
AI theo từng phiên bản bài (task #110 khi có 20 hội thoại thật), hoặc cảnh báo "bài này AI trích
sai nhiều lần".

## Zalo Bot hỏi đáp (ADR-0016, migration #120, 13/08) — CỐ Ý KHÔNG PHÁT EVENT NÀO

`bot_answer()` là **TRA CỨU thuần**: đọc việc/lịch/khách rồi trả về chữ. Không ghi gì, không đổi
trạng thái gì — **không có "việc đã xảy ra" nào để kể lại**. Phát event cho một lượt đọc là tạo
tiếng ồn không consumer.

**Mở lại khi:** bot được phép GHI (ví dụ nhân viên chốt việc / đổi trạng thái lịch qua Zalo).
Lúc đó **chính hành động ghi đó** phát event theo đúng đường module gốc đã khai (`task.*`,
`appointment.*`), **không phải** bản thân việc hỏi bot — bot chỉ là một cửa vào, không phải một
module có vòng đời riêng.

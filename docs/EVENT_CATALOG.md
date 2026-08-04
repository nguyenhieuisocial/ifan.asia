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

| event_type | aggregate | payload chính | Phát bởi | Tiêu thụ bởi (dự kiến) |
|---|---|---|---|---|
| `tenant.created` | tenant | name, slug | Platform (create_tenant) | Onboarding, super-admin |
| `member.invited` | tenant_member | user_id, role | Platform | Notification |
| `contact.created` | contact | source, channel | CRM / Inbox / Import | Workflow, Lead scoring |
| `contact.updated` | contact | changed_fields | CRM | Workflow |
| `contact.tier_changed` | contact | old_tier, new_tier | CRM (rule engine) | Workflow (chăm lại), Báo cáo |
| `contact.company_linked` | contact | company_id, method (`auto_domain`\|`manual`\|`import`) | CRM | Workflow, Báo cáo B2B |
| `company.created` | company | name, email_domain, tax_code | CRM | Workflow, Báo cáo B2B |
| `company.updated` | company | changed_fields | CRM | Workflow |
| `deal.created` | deal | pipeline_id, stage_id, value_vnd, source | CRM | Báo cáo, Workflow |
| `deal.stage_changed` | deal | old_stage_id, new_stage_id | CRM | SLA engine, Báo cáo |
| `deal.won` | deal | value_vnd, source_attribution | CRM | Attribution, Tài chính (GĐ4), Phân hạng |
| `deal.lost` | deal | reason | CRM | Báo cáo |
| `conversation.message_received` | conversation | channel, external_id, direction | Inbox (worker) | AI extraction, SLA, Notification |
| `conversation.assigned` | conversation | assignee_user_id | Inbox | Notification |
| `sla.warning` / `sla.breached` | deal\|conversation | policy_id, elapsed | SLA engine | Notification, leo thang |
| `ai.extraction_completed` | conversation | contact_fields, confidence | AI Engine | CRM (đề xuất cập nhật hồ sơ) |

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
| `contact.tier_changed` | `contacts_emit_events` — `old_tier`/`new_tier` |
| `contact.company_linked` | `contacts_emit_events` — `company_id`, `method` |
| `company.created` | `companies_emit_events` — `name`, `email_domain`, `tax_code` |
| `company.updated` | `companies_emit_events` — `changed_fields` tính từ OLD/NEW |
| `deal.created` | `deals_emit_events` — `pipeline_id`, `stage_id`, `value_vnd`, `contact_id`, `source_id` (nguồn của khách), `owner_id` |
| `deal.stage_changed` | `deals_emit_events` — mọi đường đổi cột (sửa form, kéo-thả, thắng, thua) |
| `deal.won` | `deals_emit_events` — `value_vnd`, `contact_id`, `source_id`, `owner_id` |
| `deal.lost` | `deals_emit_events` — `reason` (tên) + `lost_reason_id`, `contact_id`, `value_vnd` |

**Quy ước phụ để payload đúng catalog:**
- `changed_fields` chỉ tính trên cột NGHIỆP VỤ. Cột hệ thống/dẫn xuất (`lead_score*`,
  `search_text`, `total_revenue`, `last_interaction_at`, `updated_at`) không sinh event;
  `tier` cũng bị loại vì đã có `contact.tier_changed` riêng (1 thao tác = 1 event).
- Xóa mềm (`deleted_at`) không phát event.
- `channel` (contact.created) và `method` (contact.company_linked) không suy ra được từ
  dữ liệu hàng nên tầng web gửi kèm header `x-ifan-event-ctx` (xem `EventContext` trong
  `lib/supabase/server.ts`); trigger đọc bằng `wf_event_ctx()`. Không có header → mặc
  định `crm` / `manual`.
- Event do hành động của Workflow Engine sinh ra mang `source_module = 'workflow'` và
  `causation_chain = bậc nguồn + 1` (chống vòng lặp, tối đa bậc 3).

**Chưa phát (có lý do):**
- `contact.owner_changed` — **chưa có luồng đổi người phụ trách khách** trong sản phẩm.
  Khi xây hành động gán lại phụ trách thì BẮT BUỘC thêm vào `contacts_emit_events`
  (payload: `old_owner_id`, `new_owner_id`); hiện `owner_id` đổi chỉ nằm trong
  `changed_fields` của `contact.updated`.
- Các event của module chưa ship (Kho, Tài chính…) — vẫn là khai-báo-trước.

**RPC `emit_event` vẫn còn** (migration #1) làm hợp đồng cho module tương lai chưa có
bảng riêng; các module CRM/Inbox không còn gọi nó — `lib/events.ts` đã xóa.

**Bên tiêu thụ:** `process_workflow_events()` (pg_cron mỗi phút, migration #15) đọc
`domain_events` chưa xử lý, ghép với `workflows` đang bật rồi tạo `workflow_runs`;
`processed_at` chỉ được đặt khi mọi run của event đã kết thúc (`done` hoặc `dead`).

Các giai đoạn sau (kho, tài chính, POS, HRM, booking) bổ sung vào catalog này theo spec từng module — cập nhật bảng TRƯỚC khi phát event đầu tiên.

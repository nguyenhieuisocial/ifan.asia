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
| `deal.created` | deal | pipeline_id, stage_id, value_vnd, source | CRM | Báo cáo, Workflow |
| `deal.stage_changed` | deal | old_stage_id, new_stage_id | CRM | SLA engine, Báo cáo |
| `deal.won` | deal | value_vnd, source_attribution | CRM | Attribution, Tài chính (GĐ4), Phân hạng |
| `deal.lost` | deal | reason | CRM | Báo cáo |
| `conversation.message_received` | conversation | channel, external_id, direction | Inbox (worker) | AI extraction, SLA, Notification |
| `conversation.assigned` | conversation | assignee_user_id | Inbox | Notification |
| `sla.warning` / `sla.breached` | deal\|conversation | policy_id, elapsed | SLA engine | Notification, leo thang |
| `ai.extraction_completed` | conversation | contact_fields, confidence | AI Engine | CRM (đề xuất cập nhật hồ sơ) |

Các giai đoạn sau (kho, tài chính, POS, HRM, booking) bổ sung vào catalog này theo spec từng module — cập nhật bảng TRƯỚC khi phát event đầu tiên.

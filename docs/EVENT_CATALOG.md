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

## Trạng thái phát event (cập nhật 04/08/2026)

**Đang phát thật:**

| Event | Nơi phát |
|---|---|
| `tenant.created` | RPC `create_tenant` (migration #2) |
| `contact.created` | `app/app/contacts/actions.ts` (channel `crm`), `app/app/inbox/actions.ts` (channel = loại kênh hội thoại) và `app/app/contacts/import-export-actions.ts` (channel `import`, mỗi khách nhập từ Excel một event) |
| `contact.updated` | `contacts/actions.ts` — payload `changed_fields`, chỉ phát khi có trường thực sự đổi |
| `contact.tier_changed` | `contacts/actions.ts` — `old_tier`/`new_tier` |
| `contact.company_linked` | `contacts/actions.ts` (tạo/sửa khách: `auto_domain` khi khớp domain email công việc, `manual` khi người dùng tự chọn), `app/app/companies/actions.ts` (nhận gợi ý trên hồ sơ khách → `manual`), `contacts/import-export-actions.ts` (nhập Excel → `import`) |
| `company.created` | `app/app/companies/actions.ts` — `name`, `email_domain`, `tax_code` |
| `company.updated` | `app/app/companies/actions.ts` — `changed_fields`, chỉ phát khi có trường thực sự đổi |
| `deal.created` | `app/app/deals/actions.ts` — `pipeline_id`, `stage_id`, `value_vnd`, `contact_id`, `source_id`, `owner_id` |
| `deal.stage_changed` | `deals/actions.ts` — cả 4 đường đổi cột (sửa form, kéo-thả, thắng, thua): `old_stage_id`/`new_stage_id` |
| `deal.won` | `deals/actions.ts` — `value_vnd`, `contact_id`, `source_id` (quy kết nguồn), `owner_id` |
| `deal.lost` | `deals/actions.ts` — `reason` (tên) + `lost_reason_id`, `contact_id`, `value_vnd` |

**Chưa phát (có lý do):**
- `contact.owner_changed` — **chưa có luồng đổi người phụ trách khách** trong sản phẩm (owner_id chỉ đọc).
  Khi xây hành động gán lại phụ trách thì BẮT BUỘC phát event này (payload: `old_owner_id`, `new_owner_id`).
- Các event của module chưa ship (Kho, Tài chính, Workflow…) — vẫn là khai-báo-trước.

**Giới hạn đã biết của cách phát hiện tại:** server action gọi RPC `emit_event` ở lượt riêng, KHÔNG
cùng transaction với thao tác nghiệp vụ (spec §7 mong muốn cùng transaction). Best-effort ở đợt 1:
lỗi phát event chỉ ghi log, không hủy nghiệp vụ đã ghi. Muốn bảo đảm tuyệt đối → chuyển sang trigger
DB, xếp cùng đợt xây Workflow Engine (GĐ2), lúc đó consumer mới thực sự phụ thuộc vào tính đầy đủ.

Các giai đoạn sau (kho, tài chính, POS, HRM, booking) bổ sung vào catalog này theo spec từng module — cập nhật bảng TRƯỚC khi phát event đầu tiên.

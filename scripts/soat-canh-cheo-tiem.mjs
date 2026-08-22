#!/usr/bin/env node
/**
 * Cổng canh CẠNH CHÉO TIỆM — mọi khoá ngoại giữa hai bảng đều có `tenant_id`
 * phải có chốt, hoặc được khai miễn trừ kèm bằng chứng ĐÃ ĐO.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ CỔNG NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Lớp bệnh: bảng con chỉ kiểm `tenant_id` của CHÍNH DÒNG NÓ, không kiểm bản ghi
 * CHA có cùng tiệm hay không. Người tiệm A ghi một dòng mang `tenant_id = A`
 * nhưng khoá ngoại trỏ sang bản ghi của tiệm B — RLS thấy `tenant_id` khớp nên
 * cho qua, rồi trigger chạy quyền cao vẫn đụng vào dữ liệu tiệm B.
 *
 * Lớp bệnh này đã phải rà BỐN lần: #131 (1 cạnh) → #136 (12) → #204 (4) → #205
 * (26). Ba đợt đầu đều là rà MỘT LẦN RỒI THÔI, **không để lại cổng nào canh**.
 * Hệ quả đo được ngày 20/08: 10 mảng dựng sau #136 (Kho · Nhập hàng · Hợp đồng ·
 * CSAT · Điểm/Voucher · Webhook · Giảm giá · Nhân sự · Lương/Hoa hồng · Tuyển
 * dụng · Chiến dịch) **bắt đầu lại từ số không và không có gì báo** — 26 cạnh
 * hở, trong đó cạnh nặng nhất làm LỘ LƯƠNG nhân viên sang tiệm khác.
 *
 * Cổng này tồn tại để #205 là đợt rà CUỐI: mảng mới thêm cạnh mới thì ĐỎ NGAY,
 * không đợi ai nhớ ra phải rà lại.
 *
 * ═══════════════════════════════════════════════════════════════════
 * ⚠️ CỔNG NÀY *KHÔNG* CHỨNG MINH ĐƯỢC GÌ — đọc kỹ phần này
 * ═══════════════════════════════════════════════════════════════════
 * Nó soát **CÓ CHỐT HAY KHÔNG**, KHÔNG soát **chốt có đúng hay không**. Nó vẫn
 * XANH khi:
 *  · Thân trigger có đủ ba dấu hiệu nhận diện nhưng so sai chiều, hoặc `return
 *    new` trước khi kịp kiểm — cổng đọc HÌNH DẠNG, không chạy thử.
 *  · Chốt đúng ở đường INSERT nhưng quên đường UPDATE (đúng lỗ #204 đã bắt được
 *    ở `leave_self_insert`: chốt canh cửa UPDATE mà quên cửa INSERT).
 *  · Khoá ngoại NHIỀU CỘT — cổng chỉ xét khoá ngoại MỘT CỘT, vì khoá ghép
 *    `(tenant_id, cha_id)` tự nó đã là chốt.
 *  · Cạnh trỏ sang bảng KHÔNG có `tenant_id` (bảng dùng chung) — không thuộc
 *    lớp bệnh này, cổng cố ý không xét.
 *
 * Muốn chắc một cạnh kín thì vẫn phải THỬ GHI thật: dựng hai tiệm trong một
 * giao dịch, ghi dòng con của tiệm A trỏ sang bản ghi cha của tiệm B, xem LỌT
 * hay CHẶN. Cổng này bảo đảm đúng MỘT điều, nhưng bảo đảm tự động và mãi mãi:
 * **không cạnh nào lọt vào kho mà không ai từng nhìn tới.**
 *
 * ═══════════════════════════════════════════════════════════════════
 * ⚠️ "CHƯA CÓ CHỐT" KHÔNG ĐỒNG NGHĨA "CÓ LỖ" — luật quan trọng nhất
 * ═══════════════════════════════════════════════════════════════════
 * Đo ngày 20/08 trên 41 cạnh chưa có chốt: **26 LỌT, 15 CHẶN**. Mười lăm cạnh
 * chặn sẵn không phải nhờ trigger nào — nhờ RLS không có policy INSERT, hoặc
 * policy tự kiểm quan hệ. Rải trigger cho chúng là trả phí ghi vĩnh viễn cho
 * một lỗ không tồn tại, và làm loãng ý nghĩa của chính lớp chốt này.
 *
 * ⇒ Vì thế `MIEN_TRU` bắt buộc kèm **bằng chứng ĐÃ ĐO**, không nhận lý do suông
 *   kiểu "chắc là an toàn". Cạnh nào chưa đo thì ghi thẳng là CHƯA ĐO.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NHẬN DIỆN CHỐT: ĐỌC THÂN HÀM, KHÔNG ĐỌC TÊN
 * ═══════════════════════════════════════════════════════════════════
 * Bản đầu định nhận diện bằng tên `*_tenant_guard`. **Phép đó SAI và đã suýt
 * cho ra hai kết luận sai ngày 20/08**: `task_blocks_mot_tang` (#168) và
 * `campaign_recipient_guard` (#171) đều là chốt chéo tiệm thật, chỉ là không
 * mang tên đó — đếm theo tên thì chúng bị xếp nhầm vào "chưa có chốt", và suýt
 * bị vá chồng thêm một trigger thứ hai cho cùng một luật.
 *
 * Đếm theo tên cũng chính là chỗ #204 lệch số: #204 ghi "24 cạnh đã có chốt"
 * vì đếm theo BẢNG có trigger; đếm theo CỘT thật sự nằm trong `tgattr` thì chỉ
 * có 18. Đọc thân hàm cho ra 50.
 *
 * Ba dấu hiệu phải có ĐỦ trong MỘT hàm trigger của bảng con:
 *   ① một câu lệnh nhắc CẢ bảng cha LẪN `new.<cột>`  (tức có tra bảng cha theo cột đó)
 *   ② thân hàm có phép so với `new.tenant_id`
 *   ③ trigger đó đang gắn thật vào bảng con (đọc `pg_trigger`, không đọc file)
 * Điều ① xét theo TỪNG CÂU (tách theo `;`) chứ không xét cả thân hàm: một hàm
 * dài nhắc bảng cha ở câu này và nhắc cột ở câu khác thì KHÔNG phải chốt của
 * cạnh này — xét cả thân hàm là cách dễ nhất để tự lừa mình.
 *
 * ═══════════════════════════════════════════════════════════════════
 * `--tu-be` — CỔNG CHƯA TỪNG ĐỎ LÀ CỔNG CHƯA BIẾT NÓ CÓ CHẠY KHÔNG
 * ═══════════════════════════════════════════════════════════════════
 * Chế độ này cố ý phá theo hai kiểu rồi rollback: XOÁ một chốt thật, và THÊM
 * một bảng mới có cạnh chéo tiệm (đúng hình dạng của một mảng vừa dựng). Cả
 * hai phải làm cổng chuyển ĐỎ, và cổng phải tự xanh lại sau rollback.
 * Lượt chạy 20/08: bẻ 1 → 2 cạnh đỏ (có `payslips.employee_id`) · bẻ 2 → 1 cạnh
 * đỏ (có `zz_canh_gia.contact_id`) · sau rollback → 0. ✓
 *
 * ⚠️ CỐ Ý KHÔNG cắm `--tu-be` vào CI, dù lượt chạy thường thì có. Nó cần
 * `drop trigger` + `create table`, tức khoá ACCESS EXCLUSIVE trên CSDL mà
 * PostgREST của khách thật đang dùng chung (chỗ yếu đã biết — xem việc theo dõi
 * "tách kho cho việc kiểm"). Đo ngay hôm viết: áp migration #205 phải thử lại
 * 4 lượt vì `lock_timeout` và một lần `deadlock detected`. Cắm vào CI thì mỗi
 * push là một lần tranh khoá ⇒ cổng đỏ vì tranh chấp chứ không vì code sai —
 * mà một cổng đỏ oan sẽ bị người ta tập cho thói quen bỏ qua. Chạy tay sau mỗi
 * lần sửa phần nhận diện chốt là đủ, và ghi kết quả vào đây.
 *
 * Chạy:  node scripts/soat-canh-cheo-tiem.mjs
 *        node scripts/soat-canh-cheo-tiem.mjs --tu-be   # chứng minh cổng bắt được
 * Chỉ ĐỌC CSDL. `--tu-be` có ghi nhưng nằm trong giao dịch và luôn `rollback`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

// ══════════════════════════════════════════════════════════════════════
// MIỄN TRỪ — cạnh KHÔNG cần trigger, kèm lý do + BẰNG CHỨNG ĐÃ ĐO
// ══════════════════════════════════════════════════════════════════════
// Khoá là `bảng_con.cột`. Mỗi dòng phải trả lời được hai câu: *cái gì đang
// chặn* và *ai đã đo, ngày nào*. Không có bằng chứng thì không phải miễn trừ,
// chỉ là phỏng đoán mặc áo miễn trừ.
//
// ⚠️ Miễn trừ KHÔNG vĩnh viễn. Cái giữ mấy cạnh này là RLS/policy — thứ đổi
// được bằng một migration một dòng. Đợt nào sửa policy của bảng nằm ở đây thì
// phải ĐO LẠI cạnh đó, đừng tin dòng chữ này.

/** Bằng chứng dùng chung cho 26 cạnh đã đo LỌT rồi vá ở #205 — không nằm ở đây,
 *  chúng có trigger thật. Hằng số này chỉ để nhắc nguồn của đợt đo. */
const DOT_DO = "đo 20/08 (đợt rà #205): dựng 2 tiệm trong 1 giao dịch, đóng vai `authenticated`, ghi dòng con tiệm A trỏ sang bản ghi cha tiệm B, rollback";

const DOT_DO_2208 = "đo 22/08: chạy lại `scripts/do-canh-cheo-tiem.mjs` — dựng 2 tiệm trong 1 giao dịch, đóng vai `authenticated`, ghi dòng con tiệm A trỏ sang bản ghi cha tiệm B, rollback";

const MIEN_TRU = {
  // ── Đợt đo 22/08: 8 cạnh cổng báo đỏ, đo lại thì 8/8 ĐỀU CHẶN SẴN ─────────
  //
  // ⚠️ Nhắc lại luật đã in ở đầu file, vì đây đúng là chỗ dễ quên nó nhất:
  //   "cổng báo chưa có chốt" KHÔNG đồng nghĩa "có lỗ". Không đo mà vá thì
  //   thêm 8 trigger cho 8 chỗ vốn đã kín — và mỗi trigger thừa là một thứ
  //   phải nuôi, một chỗ có thể sai về sau.
  //
  // ⚠️ `cash_entries.supplier_payment_id` suýt nằm lại ở "CHƯA ĐO" MÃI MÃI.
  //   Bộ điền giá trị tự động đặt `chung_tu = "{}"` cho mọi cột jsonb, còn
  //   CHECK của bảng đòi một MẢNG — nên lệnh ghi hỏng ở 23514 TRƯỚC KHI chạm
  //   tới câu hỏi chéo tiệm, và phép đo báo "hỏng vì lý do khác". Chỗ mù đó
  //   trông y hệt chỗ an toàn. Đã sửa bộ đo (`EP_GIA_TRI`) rồi mới kết luận.
  "attendance_proxy_punches.punch_id": {
    viSao: "Bảng chấm công hộ không có policy INSERT cho client — đường ghi thật đi qua hàm chấm công hộ (security definer) tự tra tiệm.",
    bangChung: `CHẶN — 42501 new row violates row-level security policy (${DOT_DO_2208})`,
  },
  "bank_transactions.order_id": {
    viSao: "Sổ nhận tiền ngân hàng do webhook SePay ghi bằng khoá riêng, không có policy INSERT cho client.",
    bangChung: `CHẶN — 42501 new row violates row-level security policy (${DOT_DO_2208})`,
  },
  "bank_transactions.order_payment_id": {
    viSao: "Cùng bảng, cùng lý do.",
    bangChung: `CHẶN — 42501 new row violates row-level security policy (${DOT_DO_2208})`,
  },
  "cash_entries.supplier_payment_id": {
    viSao:
      "Kín theo kiểu KHÁC RLS: cột này có khoá DUY NHẤT, và trigger `supplier_payments_emit_cash` sinh dòng sổ quỹ NGAY khi lượt trả nhà cung cấp ra đời, còn xoá dòng tiền thì bị chặn — nên ô ấy có chủ từ giây đầu và không bao giờ trống lại. Tiệm A không chen vào lượt trả của tiệm B được.",
    bangChung: `CHẶN — 23505 khoá duy nhất trên chính cột khoá ngoại (${DOT_DO_2208}; phải sửa bộ đo trước mới đo được — xem ghi chú trên)`,
  },
  "chat_reactions.message_id": {
    viSao: "Thả cảm xúc vào tin nhắn nội bộ: không có policy INSERT cho client, đi qua hàm riêng.",
    bangChung: `CHẶN — 42501 new row violates row-level security policy (${DOT_DO_2208})`,
  },
  "data_erasure_requests.contact_id": {
    viSao: "Yêu cầu xoá dữ liệu chỉ sinh từ hàm riêng — bảng không mở policy INSERT.",
    bangChung: `CHẶN — 42501 new row violates row-level security policy (${DOT_DO_2208})`,
  },
  "loyalty_ledger.referred_contact_id": {
    viSao: "Sổ điểm chỉ ghi bằng hàm tích điểm/đổi điểm (security definer); client ghi thẳng bị RLS từ chối.",
    bangChung: `CHẶN — 42501 new row violates row-level security policy (${DOT_DO_2208})`,
  },
  "storefront_lead_holds.contact_id": {
    viSao: "Bảng giữ chỗ khách từ trang mặt tiền không cấp quyền cho vai `authenticated` chút nào.",
    bangChung: `CHẶN — 42501 permission denied for table storefront_lead_holds (${DOT_DO_2208})`,
  },
  // ── Nhóm 1: RLS KHÔNG có policy INSERT ⇒ client ghi thẳng là bị từ chối ──
  // Đường ghi thật đi qua hàm `security definer` tự tra tiệm. Đã đo từng cạnh,
  // không suy từ việc "bảng này chắc chỉ ghi qua RPC".
  "voucher_redemptions.voucher_id": {
    viSao: "Bảng đổi voucher không có policy INSERT nào — mọi lượt ghi thẳng đều bị RLS từ chối; đường thật đi qua hàm đổi voucher (security definer) tự tra tiệm.",
    bangChung: `CHẶN — 42501 new row violates row-level security policy (${DOT_DO})`,
  },
  "voucher_redemptions.contact_id": {
    viSao: "Cùng bảng, cùng lý do: không có policy INSERT.",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO})`,
  },
  "voucher_redemptions.order_id": {
    viSao: "Cùng bảng, cùng lý do: không có policy INSERT.",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO})`,
  },
  "loyalty_ledger.contact_id": {
    viSao: "Sổ điểm là APPEND-ONLY qua hàm tích/tiêu điểm; không có policy INSERT cho client.",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO})`,
  },
  "loyalty_ledger.order_id": {
    viSao: "Cùng bảng, cùng lý do: sổ điểm không nhận ghi thẳng.",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO})`,
  },
  "discount_approvals.order_id": {
    viSao: "Phiếu duyệt giảm giá chỉ sinh qua hàm xin/duyệt (migration #165 đã đóng đường ghi thẳng để trần theo vai không thành nút bấm trang trí).",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO})`,
  },
  "discount_approvals.order_line_id": {
    viSao: "Cùng bảng, cùng lý do.",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO})`,
  },
  "webhook_deliveries.endpoint_id": {
    viSao: "Phiếu gửi webhook do việc chạy nền sinh ra, client không có policy INSERT.",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO})`,
  },

  // ── Nhóm 2: policy TỰ kiểm quan hệ ⇒ trigger sẽ là lớp thứ hai thừa ──
  "attendance_punches.employee_id": {
    viSao: "Policy `attendance_self_insert` đòi `employee_id in (select id from employees where user_id = auth.uid())` — nhân viên tiệm khác không thuộc `auth.uid()` nên không lọt.",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO})`,
  },
  "leave_requests.employee_id": {
    viSao: "Policy `leave_self_insert` đòi đúng như trên. Đây chính là PHẢN VÍ DỤ mà #204 ghi lại: không có trigger nào mà vẫn chặn.",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO}; #204 cũng đo ra kết quả này ngày 20/08)`,
  },
  "internal_messages.thread_id": {
    viSao: "Policy `internal_messages_insert` đòi `exists (select 1 from internal_threads t where t.id = thread_id)`, mà `internal_threads` có RLS ⇒ luồng của tiệm khác VÔ HÌNH với phép `exists` này.",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO})`,
  },
  // ⚠️ `internal_mentions.message_id` ĐÃ RỜI khỏi danh sách này (21/08): cạnh đó
  //   nay có chốt thật `internal_mentions_bao`, nên giữ dòng miễn trừ là NÓI SAI
  //   về code — người đọc sẽ tưởng chỗ này chỉ dựa vào policy.

  // ── Nhóm 3: cạnh CÓ TRƯỚC đợt rà #136 (17/08) ──
  // #136 xét từng cạnh một và kết luận an toàn qua ba đường: RPC `security
  // definer` tự tra tiệm · Server Action select-trước-dùng-lại · RLS/GRANT đã
  // chặn ghi thẳng. Đợt #205 **KHÔNG đo lại nhóm này** — phạm vi #205 là 10 mảng
  // sinh SAU #136. Ghi thẳng ra để không ai đọc nhầm thành "đã đo lại và sạch".
  ...Object.fromEntries([
    ["activities.contact_id", "contacts"], ["activities.deal_id", "deals"], ["activities.project_id", "projects"],
    ["ai_reply_log.conversation_id", "conversations"], ["ai_reply_log.message_id", "messages"],
    ["ai_reply_log.trigger_message_id", "messages"],
    ["cash_entries.order_id", "orders"], ["cash_entries.order_payment_id", "order_payments"],
    ["cash_entries.project_id", "projects"],
    ["contact_identities.contact_id", "contacts"],
    ["contact_merge_dismissals.contact_a_id", "contacts"], ["contact_merge_dismissals.contact_b_id", "contacts"],
    ["contact_tags.contact_id", "contacts"], ["contact_tags.tag_id", "tags"],
    ["contacts.merged_into_id", "contacts"],
    ["conversation_handoffs.conversation_id", "conversations"],
    ["conversations.channel_id", "channels"], ["conversations.contact_id", "contacts"],
    ["deal_stage_history.deal_id", "deals"], ["deal_stage_history.from_stage_id", "pipeline_stages"],
    ["deal_stage_history.to_stage_id", "pipeline_stages"],
    ["deals.company_id", "companies"], ["deals.pipeline_id", "pipelines"],
    ["deals.source_id", "lead_sources"], ["deals.stage_id", "pipeline_stages"],
    ["item_costs.item_id", "items"],
    ["livechat_visitors.channel_id", "channels"], ["livechat_visitors.contact_id", "contacts"],
    ["livechat_visitors.conversation_id", "conversations"],
    ["messages.conversation_id", "conversations"],
    ["order_line_costs.order_line_id", "order_lines"], ["order_lines.appointment_id", "appointments"],
    ["orders.parent_order_id", "orders"],
    ["pipeline_stages.pipeline_id", "pipelines"],
    ["qr_codes.source_id", "lead_sources"], ["qr_scans.qr_code_id", "qr_codes"],
    ["quick_reply_usages.reply_id", "quick_replies"],
    ["sla_events.policy_id", "sla_policies"], ["source_costs.source_id", "lead_sources"],
    ["storefront_lead_submissions.contact_id", "contacts"],
    ["subscription_invoices.subscription_id", "subscriptions"],
    ["subscription_lifecycle_log.subscription_id", "subscriptions"],
    ["subscription_payments.invoice_id", "subscription_invoices"],
    ["support_sessions.help_request_id", "help_requests"],
    ["wf_approval_assignees.request_id", "wf_approval_requests"],
    ["wf_approval_requests.run_id", "workflow_runs"],
    ["wf_approval_requests.submission_id", "wf_form_submissions"],
    ["workflow_runs.event_id", "domain_events"], ["workflow_runs.workflow_id", "workflows"],
  ].map(([k, cha]) => [k, {
    viSao: `Cạnh có TRƯỚC đợt rà #136 (17/08). Đợt đó xét từng cạnh và kết luận an toàn qua RPC security definer / select-trước-dùng-lại / RLS-GRANT chặn ghi thẳng (51/63 cạnh an toàn). Bảng cha: ${cha}.`,
    bangChung: "#136 xét tay 17/08 — ⚠️ đợt #205 (20/08) KHÔNG đo lại nhóm này, phạm vi #205 là 10 mảng sinh SAU #136. Đây là bằng chứng CŨ, không phải bằng chứng mới.",
  }])),
};

// ══════════════════════════════════════════════════════════════════════

const napEnv = () => {
  if (process.env.SUPABASE_DB_URL) return;
  try {
    for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* CI đã có env sẵn */ }
};
napEnv();
if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL (biến môi trường hoặc .env.local).");
  process.exit(1);
}

// TLS verify-full với CA Supabase đã ghim — giống mọi script khác của kho.
const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"), rejectUnauthorized: true },
});
await c.connect();
// Bắt buộc theo `soat-ky-luat-bo-kiem.mjs`: mọi bộ đụng CSDL phải đặt hạn chờ khoá.
await c.query("set lock_timeout = '10s'");

const SQL_CANH = `
with co_tenant as (
  select table_name from information_schema.columns
   where table_schema = 'public' and column_name = 'tenant_id'
)
select tcon.relname as bang_con, att.attname as cot, tref.relname as bang_cha
  from pg_constraint con
  join pg_class tcon on tcon.oid = con.conrelid
  join pg_class tref on tref.oid = con.confrelid
  join pg_namespace n on n.oid = tcon.relnamespace
  join unnest(con.conkey) with ordinality as k(attnum, ord) on true
  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
 where con.contype = 'f' and n.nspname = 'public'
   and array_length(con.conkey, 1) = 1
   and tcon.relname in (select table_name from co_tenant)
   and tref.relname in (select table_name from co_tenant)
   and att.attname <> 'tenant_id'
 order by tcon.relname, att.attname`;

const SQL_TRIGGER = `
select t.relname as bang, tg.tgname, p.prosrc
  from pg_trigger tg
  join pg_class t on t.oid = tg.tgrelid
  join pg_proc p on p.oid = tg.tgfoid
  join pg_namespace n on n.oid = t.relnamespace
 where not tg.tgisinternal and n.nspname = 'public'`;

async function docCsdl() {
  const { rows: canh } = await c.query(SQL_CANH);
  const { rows: tg } = await c.query(SQL_TRIGGER);
  const theoBang = {};
  for (const r of tg) (theoBang[r.bang] ??= []).push(r);
  return { canh, theoBang };
}

/** Trigger nào của bảng con đang chốt cạnh này — xem phần "đọc thân hàm" ở đầu file. */
function aiDangChot(e, theoBang) {
  return (theoBang[e.bang_con] ?? []).filter((t) => {
    const s = t.prosrc.toLowerCase();
    if (!/(is\s+distinct\s+from|<>|=)\s*new\.tenant_id/.test(s)) return false;
    return s.split(";").some((cau) =>
      new RegExp(`\\b(public\\.)?${e.bang_cha}\\b`).test(cau) && cau.includes(`new.${e.cot}`));
  }).map((t) => t.tgname);
}

/** Trả về danh sách cạnh ĐỎ. Không in gì — để `--tu-be` gọi lại được im lặng. */
function soat({ canh, theoBang }) {
  const do_ = [], thuaMienTru = [];
  const dungToi = new Set();
  for (const e of canh) {
    const khoa = `${e.bang_con}.${e.cot}`;
    const chot = aiDangChot(e, theoBang);
    if (chot.length > 0) {
      if (MIEN_TRU[khoa]) thuaMienTru.push({ khoa, chot });
      continue;
    }
    if (MIEN_TRU[khoa]) { dungToi.add(khoa); continue; }
    do_.push({ ...e, khoa });
  }
  const mienTruMoCoi = Object.keys(MIEN_TRU).filter(
    (k) => !dungToi.has(k) && !thuaMienTru.some((x) => x.khoa === k));
  return { do_, thuaMienTru, mienTruMoCoi, tong: canh.length, coChot: canh.length - do_.length - dungToi.size };
}

// ══════════════════════════════════════════════════════════════════════
// TỰ BẺ — chứng minh cổng bắt được. Cổng chưa từng đỏ là cổng chưa biết
// nó có chạy không.
// ══════════════════════════════════════════════════════════════════════
if (process.argv.includes("--tu-be")) {
  console.log("[tu-be] Cố ý phá chốt trong MỘT giao dịch rồi rollback — cổng phải chuyển ĐỎ.\n");
  const truoc = soat(await docCsdl());
  console.log(`  Trước khi phá: ${truoc.do_.length} cạnh đỏ.`);
  if (truoc.do_.length !== 0) {
    console.error("  ✗ Cổng đang ĐỎ SẴN — phép tự bẻ không nói lên điều gì. Sửa cho xanh trước đã.");
    await c.end();
    process.exit(1);
  }

  await c.query("begin");
  await c.query("set local lock_timeout = '10s'");
  let ma = 0;
  try {
    // Bẻ 1 — XOÁ một chốt thật (cạnh nặng nhất đợt #205: phiếu lương).
    await c.query("savepoint be1");
    await c.query("drop trigger payslips_tenant_guard on public.payslips");
    const sau1 = soat(await docCsdl());
    const bat1 = sau1.do_.some((d) => d.khoa === "payslips.employee_id");
    console.log(`  Bẻ 1 · xoá trigger payslips_tenant_guard  → ${sau1.do_.length} cạnh đỏ` +
      `${bat1 ? " ✓ có payslips.employee_id" : " ✗ KHÔNG bắt được"}`);
    if (!bat1) ma = 1;
    await c.query("rollback to savepoint be1");

    // Bẻ 2 — THÊM một cạnh giả (bảng mới, chưa ai khai miễn trừ). Đây đúng là
    // hình dạng của một mảng mới dựng: bảng con có tenant_id, trỏ sang bảng cha
    // có tenant_id, không ai nhớ thêm chốt.
    await c.query("savepoint be2");
    await c.query(`create table public.zz_canh_gia (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references public.tenants(id),
      contact_id uuid not null references public.contacts(id))`);
    const sau2 = soat(await docCsdl());
    const bat2 = sau2.do_.some((d) => d.khoa === "zz_canh_gia.contact_id");
    console.log(`  Bẻ 2 · thêm bảng mới có cạnh chéo tiệm    → ${sau2.do_.length} cạnh đỏ` +
      `${bat2 ? " ✓ có zz_canh_gia.contact_id" : " ✗ KHÔNG bắt được"}`);
    if (!bat2) ma = 1;
    await c.query("rollback to savepoint be2");

    const lai = soat(await docCsdl());
    console.log(`  Sau khi rollback: ${lai.do_.length} cạnh đỏ (phải về 0)`);
    if (lai.do_.length !== 0) ma = 1;
  } finally {
    await c.query("rollback");
    await c.end();
  }
  console.log(ma === 0
    ? "\n[tu-be] ✓ Cổng CHUYỂN ĐỎ khi bị phá, và tự xanh lại sau rollback."
    : "\n[tu-be] ✗ Cổng KHÔNG bắt được — nó không canh được gì.");
  process.exit(ma);
}

// ══════════════════════════════════════════════════════════════════════
// Lượt chạy thường
// ══════════════════════════════════════════════════════════════════════
const kq = soat(await docCsdl());
await c.end();

let ma = 0;
console.log(`[soat-canh-cheo-tiem] ${kq.tong} cạnh khoá ngoại giữa hai bảng đều có tenant_id`);
console.log(`  ${kq.coChot} có chốt (đọc thân hàm trigger) · ${Object.keys(MIEN_TRU).length - kq.mienTruMoCoi.length} miễn trừ có bằng chứng · ${kq.do_.length} ĐỎ`);

if (kq.do_.length > 0) {
  ma = 1;
  console.error("\n✗ CẠNH CHÉO TIỆM KHÔNG CÓ CHỐT, cũng không được khai miễn trừ:");
  for (const d of kq.do_) {
    console.error(`\n  ${d.bang_con}.${d.cot}  →  ${d.bang_cha}`);
    console.error(`    Người tiệm A ghi được dòng ${d.bang_con} mang tenant_id = A nhưng ${d.cot}`);
    console.error(`    trỏ sang bản ghi ${d.bang_cha} của tiệm B. RLS thấy tenant_id khớp nên cho qua.`);
    console.error(`    SỬA — làm ĐÚNG THỨ TỰ, đừng đảo:`);
    console.error(`      ① ĐO TRƯỚC: dựng 2 tiệm trong 1 giao dịch, đóng vai authenticated, thử ghi,`);
    console.error(`         rollback. "Chưa có chốt" KHÔNG đồng nghĩa "có lỗ" — 15/41 cạnh đo ngày`);
    console.error(`         20/08 đã chặn sẵn nhờ RLS/policy.`);
    console.error(`      ② CHẶN thì khai vào MIEN_TRU của ${path.basename(fileURLToPath(import.meta.url))}`);
    console.error(`         kèm lý do + bằng chứng đo được (cái gì chặn, ngày nào).`);
    console.error(`      ③ LỌT thì thêm trigger ${d.bang_con}_tenant_guard theo khuôn có sẵn —`);
    console.error(`         đọc supabase/migrations/20260820000205_*.sql rồi chép, đừng nghĩ khuôn mới.`);
  }
}

if (kq.thuaMienTru.length > 0) {
  ma = 1;
  console.error("\n✗ KHAI MIỄN TRỪ THỪA — cạnh này ĐÃ có chốt thật, dòng miễn trừ nói sai về code:");
  for (const t of kq.thuaMienTru) console.error(`    ${t.khoa} — đang được chốt bởi: ${t.chot.join(", ")}`);
  console.error("  SỬA: xoá các khoá đó khỏi MIEN_TRU.");
}

if (kq.mienTruMoCoi.length > 0) {
  ma = 1;
  console.error("\n✗ KHAI MIỄN TRỪ MỒ CÔI — không còn cạnh nào mang tên này (bảng/cột đã đổi hoặc đã xoá):");
  for (const k of kq.mienTruMoCoi) console.error(`    ${k}`);
  console.error("  SỬA: xoá các khoá đó khỏi MIEN_TRU — giữ lại là để cổng canh một thứ không tồn tại.");
}

console.log(ma === 0 ? "\n✓ Mọi cạnh chéo tiệm đều có chốt hoặc có miễn trừ kèm bằng chứng." : "");
process.exit(ma);

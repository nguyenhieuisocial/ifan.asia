#!/usr/bin/env node
/**
 * Seed 5 tiệm mẫu (shop/kham/pet/fnb/retail) cho chế độ Tham quan tiệm mẫu
 * (15b, migration #64). Ngành "spa" đã có sẵn tiệm demo phong phú
 * (seed-demo.mjs) — đánh dấu is_sample ở migration #64, KHÔNG tạo lại.
 *
 * Làm giàu 11/08 (chỉ đạo founder: "tiệm mẫu phải cực kỳ chi tiết, không nửa
 * vời") — trước đó mỗi tiệm chỉ có 5 khách/4 cơ hội/2 việc, KHÔNG có kênh/hội
 * thoại/tin nhắn nào (Hộp thư trống trơn). Nay mỗi tiệm có kênh Zalo + nhiều
 * hội thoại tự nhiên (8-14 tin/hội thoại), khách đa dạng, cơ hội rải đủ
 * thắng/thua/đang mở, việc quá hạn — khớp độ chi tiết của tiệm demo Spa.
 * Nội dung từng ngành nằm ở seed-sample-tenants-data.mjs (tách riêng vì rất dài).
 *
 * IDEMPOTENT: chạy lại an toàn — mọi bản ghi neo theo khóa cố định (slug
 * tenant, external_id kênh/hội thoại/tin nhắn, tên/SĐT khách).
 */
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { CONTENT } from "./seed-sample-tenants-data.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([a-zA-Z]):/, "$1:");
const envPath = `${ROOT}.env.local`;
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
const DB_URL = process.env.SUPABASE_DB_URL;
const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DB_URL || !SB_URL || !SERVICE) {
  console.error("Thiếu SUPABASE_DB_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const OWNER_EMAIL = "sample.tenants.owner@ifan.asia";
const OWNER_PASSWORD = "SampleTenantsOwner#2026";
const OWNER_NAME = "Chủ tiệm (mẫu)";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const now = Date.now();
const ago = (ms) => new Date(now - ms).toISOString();

const PACKS = [
  {
    industry: "shop", tenantName: "Sắc Màu Boutique (Mẫu)", slug: "sample-shop",
    stages: ["Hỏi giá", "Chốt", "Giao hàng", "Thu tiền"],
    tags: ["Hỏi giá", "Chốt đơn", "Giao hàng", "Khách thân thiết"],
  },
  {
    industry: "kham", tenantName: "Nha Khoa Gia Đình An Tâm (Mẫu)", slug: "sample-kham",
    stages: ["Tư vấn", "Đặt hẹn", "Đang điều trị", "Tái khám"],
    tags: ["Tư vấn", "Đặt hẹn", "Đang điều trị", "Khách VIP"],
  },
  {
    industry: "pet", tenantName: "Spa Thú Cưng Bống Bang (Mẫu)", slug: "sample-pet",
    stages: ["Tư vấn", "Hẹn lịch", "Đã đến làm", "Chăm sau"],
    tags: ["Tắm chải", "Cắt tỉa lông", "Khám thú y", "Khách VIP"],
  },
  {
    industry: "fnb", tenantName: "Cafe Góc Phố (Mẫu)", slug: "sample-fnb",
    stages: ["Hỏi", "Đặt bàn", "Đã đến", "Quay lại"],
    tags: ["Đặt bàn", "Đặt trước", "Khách quen", "Tiệc nhóm"],
  },
  {
    industry: "retail", tenantName: "Mỹ Phẩm Ngọc Trai (Mẫu)", slug: "sample-retail",
    stages: ["Hỏi", "Giữ hàng", "Đã mua", "Quay lại"],
    tags: ["Hỏi giá", "Giữ hàng", "Đã mua", "Khách thân thiết"],
  },
];

// ---------- 1) Chủ tiệm mẫu dùng chung (một tài khoản, owner của cả 5 tiệm) ----------
const admin = createClient(SB_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
let ownerId;
{
  const { data, error } = await admin.auth.admin.createUser({
    email: OWNER_EMAIL, password: OWNER_PASSWORD, email_confirm: true,
    user_metadata: { display_name: OWNER_NAME },
  });
  if (error) {
    if (!/already|registered|exists/i.test(error.message)) throw error;
    const { data: list } = await admin.auth.admin.listUsers();
    ownerId = list.users.find((u) => u.email === OWNER_EMAIL)?.id;
  } else {
    ownerId = data.user.id;
  }
}
if (!ownerId) throw new Error("Không lấy được id chủ tiệm mẫu");

// ---------- 2) Postgres trực tiếp (TLS ghim CA, đúng mẫu seed-demo.mjs) ----------
const c = new pg.Client({
  connectionString: DB_URL,
  ssl: { ca: readFileSync(`${ROOT}supabase/supabase-ca.crt`, "utf8"), rejectUnauthorized: true },
});
await c.connect();
// BẮT BUỘC một giao dịch xuyên suốt: set_config(...,true) là LOCAL THEO
// TRANSACTION — không mở "begin" thì mỗi c.query() tự commit riêng, giá trị
// đặt ở asUser() mất ngay trước khi câu lệnh kế tiếp kịp đọc (đã bắt lỗi
// 'no_tenant_context' thật khi chạy thử, đúng mẫu seed-demo.mjs).
await c.query("begin");

// asUser: chạy 1 câu dưới danh nghĩa chủ tiệm mẫu (mô phỏng JWT, đúng mẫu
// seed-demo.mjs) — cần cho ensure_deal_defaults() (security definer, đọc
// current_tenant_id() từ claim, không chạy được bằng quyền postgres trần).
async function asUser(tenantId, sql, params = []) {
  await c.query(
    `select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)`,
    [JSON.stringify({ sub: ownerId, role: "authenticated", app_metadata: { tenant_id: tenantId, role: "owner" } })],
  );
  const r = await c.query(sql, params);
  await c.query(`select set_config('role', 'postgres', true)`);
  return r;
}

for (const pack of PACKS) {
  console.log(`--- ${pack.industry} (${pack.slug}) ---`);
  const data = CONTENT[pack.industry];
  if (!data) throw new Error(`Thiếu nội dung cho ngành ${pack.industry} trong seed-sample-tenants-data.mjs`);

  let tenantId;
  const existing = await c.query(`select id from public.tenants where slug = $1`, [pack.slug]);
  if (existing.rowCount) {
    tenantId = existing.rows[0].id;
  } else {
    const { rows: [t] } = await c.query(
      `insert into public.tenants (name, slug, industry, is_sample) values ($1,$2,$3,true) returning id`,
      [pack.tenantName, pack.slug, pack.industry],
    );
    tenantId = t.id;
  }

  await c.query(
    `insert into public.tenant_members (tenant_id, user_id, role, status, joined_at)
     values ($1,$2,'owner','active',now()) on conflict (tenant_id, user_id) do nothing`,
    [tenantId, ownerId],
  );

  // Pipeline + stages (idempotent: chỉ tạo nếu tenant chưa có pipeline nào)
  let pipelineId, stageIds;
  const existingPl = await c.query(`select id from public.pipelines where tenant_id=$1 and is_default`, [tenantId]);
  if (existingPl.rowCount) {
    pipelineId = existingPl.rows[0].id;
    const st = await c.query(`select id from public.pipeline_stages where pipeline_id=$1 order by position`, [pipelineId]);
    stageIds = st.rows.map((r) => r.id);
  } else {
    const { rows: [pl] } = await c.query(
      `insert into public.pipelines (tenant_id, name, is_default) values ($1,'Mặc định',true) returning id`,
      [tenantId],
    );
    pipelineId = pl.id;
    stageIds = [];
    for (let i = 0; i < pack.stages.length; i++) {
      const kind = i === pack.stages.length - 1 ? "won" : "open";
      const { rows: [st] } = await c.query(
        `insert into public.pipeline_stages (tenant_id, pipeline_id, name, position, kind)
         values ($1,$2,$3,$4,$5) returning id`,
        [tenantId, pipelineId, pack.stages[i], i + 1, kind],
      );
      stageIds.push(st.id);
    }
  }

  // ensure_deal_defaults(): bù cột "Thua" (kind='lost') cho pipeline 4-stage
  // hiện có (chỉ có 'open'+'won', chưa có cột thua) + seed lost_reasons mặc
  // định nếu thiếu — cần cho phần deals stageKind:'lost' bên dưới.
  await asUser(tenantId, `select public.ensure_deal_defaults()`);
  const stAll = await c.query(`select id, name, kind from public.pipeline_stages where pipeline_id=$1 order by position`, [pipelineId]);
  const stageByName = (name) => stAll.rows.find((s) => s.name === name)?.id ?? stAll.rows[0].id;
  const stageByKind = (kind) => stAll.rows.find((s) => s.kind === kind)?.id ?? stAll.rows[0].id;
  const lostReasons = (await c.query(`select id, name from public.lost_reasons where tenant_id=$1`, [tenantId])).rows;
  const lostReasonByKw = (kw) => lostReasons.find((r) => r.name.toLowerCase().includes(kw.toLowerCase()))?.id ?? lostReasons[0]?.id ?? null;

  // lead_sources mặc định (create_tenant() seed 4 nguồn cho tenant tạo qua RPC —
  // tenant mẫu tạo bằng insert thẳng nên KHÔNG có sẵn, phải seed tay).
  const existingSrc = await c.query(`select count(*)::int as n from public.lead_sources where tenant_id=$1`, [tenantId]);
  if (existingSrc.rows[0].n === 0) {
    await c.query(
      `insert into public.lead_sources (tenant_id, name, channel_type, is_system, i18n_key) values
        ($1,'Zalo','zalo',true,'source.zalo'),
        ($1,'Facebook','facebook',true,'source.facebook'),
        ($1,'Giới thiệu','referral',true,'source.referral'),
        ($1,'Khác','other',true,'source.other')`,
      [tenantId],
    );
  }
  // QUY TRÌNH TỰ CHẠY + LUẬT CAM KẾT — cùng lý do với lead_sources ngay trên:
  // `create_tenant()` gieo sẵn cho tiệm tạo qua RPC, nhưng tiệm mẫu tạo bằng
  // insert thẳng nên KHÔNG có, và hai hàm `ensure_*` chỉ chạy khi một người vai
  // CHỦ hoặc QUẢN TRỊ mở đúng màn đó. Khách tham quan vào bằng vai Chỉ xem, nên
  // không bao giờ kích được — và thấy màn trống trơn.
  //
  // ⚠️ Đo 21/08: cả 5 tiệm mẫu có **0 quy trình, 0 luật cam kết**, trong khi
  // mỗi tiệm sinh 450–1.200 sự kiện mỗi tuần. Người đi xem thử phần mềm mở màn
  // "Việc tự chạy" và thấy nó rỗng — đúng mảng đáng khoe nhất lại trông như
  // chưa làm.
  //
  // Gọi thẳng hàm GỐC (nhận tenant làm tham số) chứ không gọi `ensure_*`: hai
  // hàm kia đòi vai chủ/quản trị, và mở quyền đó cho vai Chỉ xem để "cho tiện"
  // chính là lỗ đã phải vá sáng cùng ngày.
  await c.query(`select public.wf_seed_playbooks($1)`, [tenantId]);
  await c.query(`select public.sla_seed_policies($1)`, [tenantId]);

  const sources = (await c.query(`select id, name, channel_type from public.lead_sources where tenant_id=$1`, [tenantId])).rows;
  const srcId = (kw) => sources.find((s) => s.channel_type === kw)?.id ?? sources[0]?.id ?? null;

  // Tags
  for (const tag of pack.tags) {
    await c.query(
      `insert into public.tags (tenant_id, name) values ($1,$2) on conflict (tenant_id, name) do nothing`,
      [tenantId, tag],
    );
  }
  const tagRows = (await c.query(`select id from public.tags where tenant_id=$1 order by name`, [tenantId])).rows;

  // Công ty (neo theo email_domain, đúng mẫu seed-demo.mjs — bảng không có
  // unique constraint nên phải tự kiểm tồn tại trước khi chèn).
  const companyId = {};
  for (const co of data.companies ?? []) {
    const found = await c.query(
      `select id from public.companies where tenant_id=$1 and email_domain=$2 and deleted_at is null`,
      [tenantId, co.domain],
    );
    if (found.rowCount) {
      companyId[co.domain] = found.rows[0].id;
      await c.query(
        `update public.companies set name=$2, tax_code=$3, address=$4, phone=$5 where id=$1`,
        [found.rows[0].id, co.name, co.taxCode, co.address, co.phone],
      );
    } else {
      const ins = await c.query(
        `insert into public.companies (tenant_id, name, email_domain, tax_code, address, phone, owner_id, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$7) returning id`,
        [tenantId, co.name, co.domain, co.taxCode, co.address, co.phone, ownerId],
      );
      companyId[co.domain] = ins.rows[0].id;
    }
  }

  // Khách (neo theo SĐT)
  const contactId = {};
  for (const p of data.contacts) {
    const found = await c.query(`select id from public.contacts where tenant_id=$1 and phone=$2 and deleted_at is null`, [tenantId, p.phone]);
    if (found.rowCount) {
      contactId[p.phone] = found.rows[0].id;
      await c.query(
        `update public.contacts set full_name=$2, email=$3, address=$4, province=$5, tier=$6,
           company_id=$7, source_id=$8 where id=$1`,
        [found.rows[0].id, p.name, p.email ?? null, p.address ?? null, p.province ?? null, p.tier,
          p.company ? companyId[p.company] : null, srcId(p.sourceNow ?? p.source)],
      );
    } else {
      const ins = await c.query(
        `insert into public.contacts
           (tenant_id, full_name, phone, phone_e164, email, address, province, tier, lifecycle,
            owner_id, source_id, created_by, company_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'customer',$9,$10,$9,$11) returning id`,
        [tenantId, p.name, p.phone, "+84" + p.phone.slice(1), p.email ?? null, p.address ?? null,
          p.province ?? null, p.tier, ownerId, srcId(p.source), p.company ? companyId[p.company] : null],
      );
      contactId[p.phone] = ins.rows[0].id;
    }
  }

  // Gán 2 thẻ/khách (xoay vòng bộ thẻ theo ngành)
  if (tagRows.length) {
    let i = 0;
    for (const p of data.contacts) {
      await c.query(
        `insert into public.contact_tags (tenant_id, contact_id, tag_id) values ($1,$2,$3),($1,$2,$4) on conflict do nothing`,
        [tenantId, contactId[p.phone], tagRows[i % tagRows.length].id, tagRows[(i + 2) % tagRows.length].id],
      );
      i++;
    }
  }

  // Kênh Zalo demo (rõ ràng là mẫu, KHÔNG kết nối thật)
  const oaExternalId = `${pack.slug}-oa`;
  await c.query(
    `insert into public.channels (tenant_id, type, external_id, display_name, status)
     values ($1,'zalo_oa',$2,$3,'pending_platform') on conflict (tenant_id, type, external_id) do nothing`,
    [tenantId, oaExternalId, `Zalo OA ${pack.tenantName}`],
  );
  const channelId = (await c.query(
    `select id from public.channels where tenant_id=$1 and type='zalo_oa' and external_id=$2`,
    [tenantId, oaExternalId],
  )).rows[0].id;

  // Hội thoại + tin nhắn (neo theo external_id/external_message_id)
  for (const th of data.threads) {
    const cid = contactId[th.phone];
    const person = data.contacts.find((p) => p.phone === th.phone);
    if (!cid || !person) throw new Error(`Hội thoại ${th.ext} (${pack.industry}) trỏ tới SĐT không có trong contacts: ${th.phone}`);

    let conv = await c.query(
      `select id from public.conversations where tenant_id=$1 and channel_id=$2 and external_user_id=$3`,
      [tenantId, channelId, th.ext],
    );
    let convId;
    if (conv.rowCount) {
      convId = conv.rows[0].id;
    } else {
      conv = await c.query(
        `insert into public.conversations (tenant_id, channel_id, contact_id, external_user_id, status, assignee_user_id)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [tenantId, channelId, cid, th.ext, th.status, ownerId],
      );
      convId = conv.rows[0].id;
    }

    await c.query(
      `insert into public.contact_identities (tenant_id, contact_id, channel_type, external_id, display_name)
       values ($1,$2,'zalo_oa',$3,$4) on conflict (tenant_id, channel_type, external_id) do nothing`,
      [tenantId, cid, th.ext, person.name],
    );

    const existingMsg = new Set((await c.query(
      `select external_message_id from public.messages where conversation_id=$1 and external_message_id is not null`,
      [convId],
    )).rows.map((r) => r.external_message_id));

    let lastAt = null, lastInAt = null;
    for (let i = 0; i < th.m.length; i++) {
      const [kind, content, hoursAgo] = th.m[i];
      const extId = `${th.ext}-${i}`;
      const sentAt = ago(hoursAgo * HOUR);
      if (kind === "in") { lastInAt = sentAt; lastAt = sentAt; }
      else if (kind === "out") { lastAt = sentAt; }
      const direction = kind === "in" ? "in" : "out";
      const senderType = kind === "in" ? "user" : kind === "note" ? "system" : "agent";
      if (existingMsg.has(extId)) {
        await c.query(
          `update public.messages set content=$3, sent_at=$4, direction=$5, sender_type=$6, sender_user_id=$7
           where conversation_id=$1 and external_message_id=$2`,
          [convId, extId, content, sentAt, direction, senderType, kind === "in" ? null : ownerId],
        );
      } else {
        await c.query(
          `insert into public.messages (tenant_id, conversation_id, direction, external_message_id, sender_type, sender_user_id, content, sent_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [tenantId, convId, direction, extId, senderType, kind === "in" ? null : ownerId, content, sentAt],
        );
      }
    }
    await c.query(
      `update public.conversations set status=$2, last_message_at=$3, last_user_message_at=$4, unread_count=$5 where id=$1`,
      [convId, th.status, lastAt, lastInAt, th.unread],
    );
    if (lastInAt) {
      await c.query(`update public.contacts set last_interaction_at=$2 where id=$1`, [cid, lastInAt]);
    }
  }
  console.log(`  ${data.contacts.length} khách, ${data.threads.length} hội thoại (${data.threads.reduce((n, t) => n + t.m.length, 0)} tin)`);

  // Cơ hội — neo theo tiêu đề
  for (const d of data.deals) {
    const stageId = d.stageKind ? stageByKind(d.stageKind) : stageByName(d.stageName);
    const status = d.stageKind ?? "open";
    // Deal đã thắng/thua có thể không kèm closeDays/nextDays (không bắt buộc —
    // ràng buộc deals_open_needs_next_action chỉ đòi next_action_at khi status
    // vẫn 'open'). Math.abs() phòng khi nội dung lỡ ghi wonDays/lostDays âm.
    const row = {
      stage_id: stageId,
      contact_id: contactId[d.phone],
      value_vnd: d.value,
      expected_close_date: d.closeDays !== undefined
        ? new Date(now + d.closeDays * DAY).toISOString().slice(0, 10)
        : null,
      status,
      won_at: d.wonDays !== undefined ? ago(Math.abs(d.wonDays) * DAY) : null,
      lost_at: d.lostDays !== undefined ? ago(Math.abs(d.lostDays) * DAY) : null,
      lost_reason_id: d.lostKw ? lostReasonByKw(d.lostKw) : null,
      next_action_at: d.nextDays !== undefined ? new Date(now + d.nextDays * DAY).toISOString() : null,
      next_action_note: d.next ?? null,
    };
    if (status === "open" && row.next_action_at === null) {
      throw new Error(`Cơ hội đang mở "${d.title}" (${pack.industry}) thiếu nextDays — vi phạm ràng buộc deals_open_needs_next_action`);
    }
    if (!row.contact_id) throw new Error(`Cơ hội "${d.title}" (${pack.industry}) trỏ tới SĐT không có trong contacts: ${d.phone}`);
    const found = await c.query(`select id from public.deals where tenant_id=$1 and title=$2 and deleted_at is null`, [tenantId, d.title]);
    if (found.rowCount) {
      await c.query(
        `update public.deals set stage_id=$2, contact_id=$3, value_vnd=$4, expected_close_date=$5,
           status=$6, won_at=$7, lost_at=$8, lost_reason_id=$9, next_action_at=$10, next_action_note=$11
         where id=$1`,
        [found.rows[0].id, row.stage_id, row.contact_id, row.value_vnd, row.expected_close_date,
          row.status, row.won_at, row.lost_at, row.lost_reason_id, row.next_action_at, row.next_action_note],
      );
    } else {
      await c.query(
        `insert into public.deals
           (tenant_id, pipeline_id, stage_id, contact_id, owner_id, created_by, title, value_vnd,
            expected_close_date, status, won_at, lost_at, lost_reason_id, next_action_at, next_action_note)
         values ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [tenantId, pipelineId, row.stage_id, row.contact_id, ownerId, d.title, row.value_vnd,
          row.expected_close_date, row.status, row.won_at, row.lost_at, row.lost_reason_id,
          row.next_action_at, row.next_action_note],
      );
    }
  }
  console.log(`  ${data.deals.length} cơ hội`);

  // Việc cần làm — neo theo (contact_id, subject)
  for (const a of data.activities) {
    const cid = contactId[a.phone];
    if (!cid) throw new Error(`Việc "${a.subject}" (${pack.industry}) trỏ tới SĐT không có trong contacts: ${a.phone}`);
    const dueAt = new Date(now + a.dueOffsetHours * HOUR).toISOString();
    const found = await c.query(`select id from public.activities where tenant_id=$1 and contact_id=$2 and subject=$3`, [tenantId, cid, a.subject]);
    if (found.rowCount) {
      await c.query(`update public.activities set due_at=$2, done_at=null, body=$3 where id=$1`, [found.rows[0].id, dueAt, a.body]);
    } else {
      await c.query(
        `insert into public.activities (tenant_id, type, subject, body, contact_id, owner_id, due_at)
         values ($1,'task',$2,$3,$4,$5,$6)`,
        [tenantId, a.subject, a.body, cid, ownerId, dueAt],
      );
    }
  }
  console.log(`  ${data.activities.length} việc cần làm`);
}

await c.query("commit");
await c.end();
console.log("\nXong — 5 tiệm mẫu giàu dữ liệu, sẵn sàng cho chế độ Tham quan (15b).");

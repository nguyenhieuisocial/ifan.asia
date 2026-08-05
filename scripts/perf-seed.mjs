#!/usr/bin/env node
/**
 * Sinh dữ liệu TẢI NẶNG cho MỘT tenant thử ("PERF LOAD TEST") để đo hiệu năng
 * ở quy mô tiệm 5.000 khách. KHÔNG chạm dữ liệu tenant khác.
 *
 * Quy mô mặc định: 5.000 khách · 2.000 cơ hội · 500 hội thoại · 50.000 tin nhắn
 * · 10.000 hoạt động · sự kiện nguồn + thông báo tương ứng.
 *
 * An toàn:
 *  - Mọi bản ghi neo vào tenant slug `zz-perf-load-test` → `perf-cleanup.mjs` xoá sạch.
 *  - Bulk insert chạy dưới `session_replication_role=replica` (TẮT trigger CHỈ trong
 *    phiên này, không đụng phiên khác) rồi tự tính lại cột dẫn xuất bằng SQL khối,
 *    nên số liệu vẫn thật mà không mất hàng giờ chạy trigger 50.000 lần.
 *
 * Cần env: SUPABASE_DB_URL (+ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY để tạo auth user)
 * KHÔNG in secret ra console.
 */
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envPath = new URL("../.env.local", import.meta.url);
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

export const PERF_SLUG = "zz-perf-load-test";
export const PERF_EMAIL = "perf.load.20260805@gmail.com";
const PERF_PASSWORD = "PerfLoad#2026!tmp";

const N_CONTACTS = Number(process.env.PERF_CONTACTS || 5000);
const N_DEALS = Number(process.env.PERF_DEALS || 2000);
const N_CONVS = Number(process.env.PERF_CONVS || 500);
const N_MSGS = Number(process.env.PERF_MSGS || 50000);
const N_ACTS = Number(process.env.PERF_ACTS || 10000);
const N_NOTIFS = Number(process.env.PERF_NOTIFS || 2000);

const caPath = new URL("../supabase/supabase-ca.crt", import.meta.url);
const c = new pg.Client({
  connectionString: DB_URL,
  ssl: { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true },
  statement_timeout: 600000,
});
await c.connect();

const t0 = Date.now();
const step = async (label, sql, params) => {
  const s = Date.now();
  const r = await c.query(sql, params);
  console.log(`  ${label}: ${Date.now() - s}ms${r.rowCount != null ? ` (${r.rowCount} dòng)` : ""}`);
  return r;
};

// ---------- 1) auth user ----------
const admin = createClient(SB_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
let userId;
{
  const { data, error } = await admin.auth.admin.createUser({
    email: PERF_EMAIL,
    password: PERF_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: "Perf Load Owner" },
  });
  if (error && !/already|registered|exists/i.test(error.message)) throw error;
  userId = data?.user?.id;
  if (!userId) {
    const { rows } = await c.query(`select id from auth.users where email = $1`, [PERF_EMAIL]);
    userId = rows[0]?.id;
  }
}
if (!userId) throw new Error("Không lấy được user id");
console.log("auth user sẵn sàng");

// ---------- 2) tenant + member (TRIGGER BẬT — chỉ 2 dòng) ----------
const { rows: [tenant] } = await c.query(
  `insert into public.tenants (name, slug, industry)
   values ('PERF LOAD TEST (xoá sau đo)', $1, 'spa_clinic')
   on conflict (slug) do update set name = excluded.name
   returning id`, [PERF_SLUG]);
const TID = tenant.id;
await c.query(
  `insert into public.tenant_members (tenant_id, user_id, role, status)
   values ($1, $2, 'owner', 'active') on conflict (tenant_id, user_id) do nothing`, [TID, userId]);
console.log("tenant:", PERF_SLUG);

// ---------- 3) dữ liệu nền ----------
await c.query("begin");
await c.query(`set local session_replication_role = 'replica'`);

await step("kênh", `
  insert into public.channels (tenant_id, type, external_id, display_name, status)
  values ($1,'livechat',null,'Live Chat','active'),
         ($1,'zalo_oa','perf-oa-000','Zalo OA Perf','active')
  on conflict do nothing`, [TID]);

await step("nguồn", `
  insert into public.lead_sources (tenant_id, name, channel_type, quality_score, is_system)
  select $1, x.n, x.ct, x.q, false from (values
    ('Website','website',60),('Tại tiệm','direct',70),('Facebook','facebook',50),
    ('Giới thiệu','referral',55),('Zalo','zalo',50),('Khác','other',40)) as x(n,ct,q)`, [TID]);

await step("pipeline", `
  with p as (
    insert into public.pipelines (tenant_id, name, is_default) values ($1,'Bán hàng',true) returning id
  )
  insert into public.pipeline_stages (tenant_id, pipeline_id, name, position, kind, win_probability)
  select $1, p.id, s.n, s.pos, s.k, s.w from p, (values
    ('Mới',0,'open',10),('Đang tư vấn',1,'open',30),('Hẹn lịch',2,'open',60),
    ('Đã chốt',3,'won',100),('Quay lại',4,'open',20),('Thua',5,'lost',0)) as s(n,pos,k,w)`, [TID]);

// ---------- 4) contacts ----------
// Họ/tên VN thật → có trùng tên tự nhiên (máy dò trùng lặp gặp đúng dạng dữ liệu thật).
await step("khách hàng", `
  with ho as (select v, i from unnest(array['Nguyễn','Trần','Lê','Phạm','Hoàng','Huỳnh','Phan','Vũ','Võ','Đặng','Bùi','Đỗ','Hồ','Ngô','Dương','Lý']) with ordinality as u(v, i)),
       dem as (select v, i from unnest(array['Thị','Văn','Ngọc','Minh','Thu','Hải','Anh','Quang','Khánh','Bảo']) with ordinality as u(v, i)),
       ten as (select v, i from unnest(array['An','Bình','Chi','Dung','Giang','Hà','Hương','Khoa','Lan','Mai','Nam','Oanh','Phúc','Quân','Sơn','Thảo','Trang','Tú','Vân','Yến','Linh','Hạnh','Duy','Hùng']) with ordinality as u(v, i)),
       src as (select id, row_number() over (order by name) - 1 as k from public.lead_sources where tenant_id = $1)
  insert into public.contacts
    (tenant_id, full_name, phone, phone_e164, email, tier, lifecycle, total_revenue,
     lead_score, last_interaction_at, source_id, owner_id, created_at, updated_at)
  select
    $1,
    h.v || ' ' || d.v || ' ' || t.v,
    '0' || lpad(((900000000 + (g * 7919) % 99000000))::text, 9, '0'),
    '+84' || lpad(((900000000 + (g * 7919) % 99000000))::text, 9, '0'),
    ('kh' || g || '@perfmail.test')::citext,
    (array['new','regular','vip','dormant'])[1 + (g % 4)],
    case when g % 3 = 0 then 'customer' else 'lead' end,
    case when g % 3 = 0 then ((g * 137) % 40) * 500000 else 0 end,
    (g * 37) % 101,
    now() - ((g % 400) || ' days')::interval - ((g % 24) || ' hours')::interval,
    s.id,
    $2,
    now() - ((g % 540) || ' days')::interval - ((g % 86400) || ' seconds')::interval,
    now()
  from generate_series(1, $3) g
  join ho h on h.i = 1 + (g % 16)
  join dem d on d.i = 1 + ((g / 16) % 10)
  join ten t on t.i = 1 + ((g / 160) % 24)
  join src s on s.k = (g % 6)`, [TID, userId, N_CONTACTS]);

await step("khách trùng SĐT (2%)", `
  with base as (
    select id, phone, phone_e164, email, row_number() over (order by created_at) rn
    from public.contacts where tenant_id = $1
  ),
  dup as (select * from base where rn % 50 = 0),          -- 2% sẽ bị ghi đè
  donor as (select * from base where rn % 50 = 1)         -- lấy dữ liệu của khách khác
  update public.contacts c
     set phone = d.phone, phone_e164 = d.phone_e164
  from dup u join donor d on d.rn = u.rn - 49
  where c.id = u.id`, [TID]);

await step("khách trùng email (1%)", `
  with base as (
    select id, email, row_number() over (order by created_at) rn
    from public.contacts where tenant_id = $1
  ),
  dup as (select * from base where rn % 100 = 0),
  donor as (select * from base where rn % 100 = 3)
  update public.contacts c set email = d.email
  from dup u join donor d on d.rn = u.rn - 97
  where c.id = u.id`, [TID]);

// ---------- 5) hội thoại + tin nhắn ----------
await step("hội thoại", `
  with ch as (select id, row_number() over (order by type) - 1 as k from public.channels where tenant_id = $1),
       ct as (select id, row_number() over (order by created_at) - 1 as k from public.contacts where tenant_id = $1)
  insert into public.conversations
    (tenant_id, channel_id, contact_id, external_user_id, status, assignee_user_id,
     last_message_at, last_user_message_at, unread_count, created_at, updated_at)
  select $1, ch.id, ct.id, 'ext-' || g,
    (array['open','open','open','pending','closed'])[1 + (g % 5)],
    case when g % 3 = 0 then $2::uuid else null end,
    now() - ((g % 90) || ' days')::interval,
    -- 20% chờ trả lời: tin khách MỚI HƠN tin cuối ⇒ is_unanswered (cột generated) = true
    case when g % 5 = 0 then now() - ((g % 90) || ' days')::interval + interval '1 minute'
         else now() - ((g % 90) || ' days')::interval - interval '10 minutes' end,
    case when g % 5 = 0 then 1 + (g % 4) else 0 end,
    now() - ((g % 120) || ' days')::interval, now()
  from generate_series(1, $3) g
  join ch on ch.k = (g % 2)
  join ct on ct.k = (g % $4)`, [TID, userId, N_CONVS, N_CONTACTS]);

await step("tin nhắn", `
  with cv as (select id, last_message_at, row_number() over (order by created_at) - 1 as k
              from public.conversations where tenant_id = $1)
  insert into public.messages
    (tenant_id, conversation_id, direction, external_message_id, sender_type, sender_user_id, content, sent_at, created_at)
  select $1, cv.id,
    case when g % 2 = 0 then 'in' else 'out' end,
    'perf-msg-' || g,
    case when g % 2 = 0 then 'user' else 'agent' end,
    case when g % 2 = 0 then null else $2::uuid end,
    'Tin nhắn thử tải số ' || g || ' — nội dung dài vừa phải để mô phỏng hội thoại thật giữa tiệm và khách hàng.',
    cv.last_message_at - (((g / $4) % 500) || ' minutes')::interval,
    now()
  from generate_series(1, $3) g
  join cv on cv.k = (g % $4)`, [TID, userId, N_MSGS, N_CONVS]);

// ---------- 6) cơ hội ----------
await step("cơ hội", `
  with p as (select id from public.pipelines where tenant_id = $1 limit 1),
       st as (select id, position, kind, row_number() over (order by position) - 1 as k
              from public.pipeline_stages where tenant_id = $1),
       ct as (select id, source_id, row_number() over (order by created_at) - 1 as k
              from public.contacts where tenant_id = $1)
  insert into public.deals
    (tenant_id, pipeline_id, stage_id, contact_id, owner_id, title, value_vnd,
     status, won_at, lost_at, source_id, stage_entered_at, next_action_at,
     next_action_note, created_at, updated_at, expected_close_date)
  select $1, p.id, st.id, ct.id, $2,
    'Cơ hội #' || g || ' — gói dịch vụ',
    ((g * 173) % 60 + 1) * 500000,
    case st.kind when 'won' then 'won' when 'lost' then 'lost' else 'open' end,
    case when st.kind = 'won' then now() - ((g % 330) || ' days')::interval end,
    case when st.kind = 'lost' then now() - ((g % 330) || ' days')::interval end,
    ct.source_id,
    now() - ((g % 60) || ' days')::interval,
    case when st.kind = 'open' then now() - ((g % 80) || ' days')::interval + interval '40 days' end,
    case when st.kind = 'open' then 'Gọi lại chốt lịch' end,
    now() - ((g % 400) || ' days')::interval, now(),
    (now() + ((g % 45) || ' days')::interval)::date
  from generate_series(1, $3) g
  join p on true
  join st on st.k = (g % 6)
  join ct on ct.k = (g % $4)`, [TID, userId, N_DEALS, N_CONTACTS]);

// ---------- 7) hoạt động ----------
await step("hoạt động", `
  with ct as (select id, row_number() over (order by created_at) - 1 as k
              from public.contacts where tenant_id = $1)
  insert into public.activities
    (tenant_id, type, subject, body, contact_id, owner_id, due_at, done_at, created_at, updated_at)
  select $1,
    (array['note','call','meeting','task'])[1 + (g % 4)],
    'Việc #' || g,
    'Ghi chú công việc thử tải số ' || g,
    ct.id, $2,
    -- 70% đã xong; 30% còn hạn: một phần quá hạn, một phần trong hôm nay/tương lai
    case when g % 10 < 7 then now() - ((g % 200) || ' days')::interval
         when g % 10 = 7 then now() - ((g % 30) || ' days')::interval - interval '2 hours'
         when g % 10 = 8 then now() + ((g % 600) || ' minutes')::interval
         else now() + ((g % 30) || ' days')::interval end,
    case when g % 10 < 7 then now() - ((g % 190) || ' days')::interval end,
    now() - ((g % 300) || ' days')::interval, now()
  from generate_series(1, $3) g
  join ct on ct.k = (g % $4)`, [TID, userId, N_ACTS, N_CONTACTS]);

// ---------- 8) sự kiện nguồn (Báo cáo nguồn đọc bảng này) ----------
await step("sự kiện contact.created", `
  insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, created_at)
  select $1, 'contact.created', 'contact', c.id::text,
         jsonb_build_object('channel','crm','source_id', c.source_id), c.created_at
  from public.contacts c where c.tenant_id = $1`, [TID]);

await step("sự kiện deal.created/won", `
  insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, created_at)
  select $1, 'deal.created', 'deal', d.id::text,
         jsonb_build_object('contact_id', d.contact_id, 'source_id', d.source_id,
                            'value_vnd', d.value_vnd, 'owner_id', d.owner_id), d.created_at
  from public.deals d where d.tenant_id = $1
  union all
  select $1, 'deal.won', 'deal', d.id::text,
         jsonb_build_object('contact_id', d.contact_id, 'source_id', d.source_id,
                            'value_vnd', d.value_vnd), d.won_at
  from public.deals d where d.tenant_id = $1 and d.status = 'won'`, [TID]);

// Nhật ký sự kiện thật KHÔNG chỉ có 3 loại gắn nguồn: đổi hạng, đổi giai đoạn,
// SLA, tin nhắn… chiếm phần lớn. Không sinh chúng thì Báo cáo nguồn được đo dễ
// hơn thực tế (nó phải lọc 3 loại ra khỏi cả đống sự kiện khác).
await step("sự kiện khác (nhiễu thật)", `
  insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, created_at)
  select $1,
    (array['contact.tier_changed','contact.updated','deal.stage_changed','sla.warning','sla.breached','message.received'])[1 + (g % 6)],
    (array['contact','contact','deal','conversation','conversation','conversation'])[1 + (g % 6)],
    gen_random_uuid()::text,
    jsonb_build_object('n', g),
    now() - ((g % 540) || ' days')::interval - ((g % 86400) || ' seconds')::interval
  from generate_series(1, $2) g`, [TID, Number(process.env.PERF_NOISE_EVENTS || 25000)]);

// ---------- 9) thông báo ----------
await step("thông báo", `
  insert into public.notifications (tenant_id, user_id, type, title, body, link, read_at, created_at)
  select $1, $2,
    (array['sla','approval','workflow','handoff'])[1 + (g % 4)],
    'Thông báo thử tải #' || g,
    'Nội dung thông báo mô phỏng cho phiên đo hiệu năng số ' || g,
    '/app/inbox',
    case when g % 3 <> 0 then now() - ((g % 40) || ' days')::interval end,
    now() - ((g % 120) || ' days')::interval - ((g % 3600) || ' seconds')::interval
  from generate_series(1, $3) g`, [TID, userId, N_NOTIFS]);

await c.query("commit");

// ---------- 10) thống kê lại cho planner ----------
await step("analyze", `analyze public.contacts, public.conversations, public.messages,
  public.deals, public.activities, public.domain_events, public.notifications`);

const { rows: counts } = await c.query(`
  select 'contacts' t, count(*) n from public.contacts where tenant_id=$1
  union all select 'conversations', count(*) from public.conversations where tenant_id=$1
  union all select 'messages', count(*) from public.messages where tenant_id=$1
  union all select 'deals', count(*) from public.deals where tenant_id=$1
  union all select 'activities', count(*) from public.activities where tenant_id=$1
  union all select 'domain_events', count(*) from public.domain_events where tenant_id=$1
  union all select 'notifications', count(*) from public.notifications where tenant_id=$1
  order by 1`, [TID]);
console.log("\nĐÃ SINH:", counts.map((r) => `${r.t}=${r.n}`).join("  "));
console.log(`tenant_id=${TID}  user_id=${userId}`);
console.log(`Tổng thời gian: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await c.end();

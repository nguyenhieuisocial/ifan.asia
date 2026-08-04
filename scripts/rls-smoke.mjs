#!/usr/bin/env node
/**
 * RLS smoke test chạy TRỰC TIẾP trên Postgres (không cần service key):
 * mô phỏng JWT claims bằng set_config, toàn bộ trong 1 transaction ROLLBACK — không để lại dữ liệu.
 * Cần env SUPABASE_DB_URL.
 */
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Thiếu SUPABASE_DB_URL");
  process.exit(1);
}
// TLS verify-full với CA Supabase đã ghim (supabase/supabase-ca.crt)
const caPath = new URL("../supabase/supabase-ca.crt", import.meta.url);
const c = new pg.Client({
  connectionString: url,
  ssl: { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true },
});
await c.connect();

// Khám phá MỌI bảng tenant-scoped (RLS bật + có cột tenant_id) — quét generic ở cuối suite,
// bảng mới thêm trong migration tương lai tự động được phủ.
const { rows: tenantTabs } = await c.query(`
  select c.relname as t
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
  where ns.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  order by 1`);
const genericTables = tenantTabs.map((r) => r.t);

let failed = 0;
let nCheck = 0;
const STATIC_CHECKS = 44; // số check viết tay bên dưới — cập nhật khi thêm/bớt check tĩnh
const mm = STATIC_CHECKS + genericTables.length * 2;
const check = (name, cond, detail = "") => {
  nCheck++;
  console.log(`${cond ? "  PASS" : "  FAIL"} ${nCheck}/${mm} ${name}${cond ? "" : " — " + detail}`);
  if (!cond) failed++;
};

const stamp = String(Date.now() % 1e7);
const uA = randomUUID(), uB = randomUUID(), uC = randomUUID();

try {
  await c.query("begin");

  // ---- seed bằng quyền postgres (bypass RLS như backend thật) ----
  await c.query(
    `insert into auth.users (id, aud, role, email) values
     ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4),($5,'authenticated','authenticated',$6)`,
    [uA, `smoke-a-${stamp}@t.local`, uB, `smoke-b-${stamp}@t.local`, uC, `smoke-c-${stamp}@t.local`],
  );
  const { rows: [tA] } = await c.query(
    `insert into public.tenants (name, slug) values ('Smoke A', $1) returning id`, [`smoke-a-${stamp}`]);
  const { rows: [tB] } = await c.query(
    `insert into public.tenants (name, slug) values ('Smoke B', $1) returning id`, [`smoke-b-${stamp}`]);
  await c.query(
    `insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'owner'),($3,$4,'owner')`,
    [tA.id, uA, tB.id, uB]);
  await c.query(
    `insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id) values ($1,'smoke.seed','tenant',$2)`,
    [tB.id, String(tB.id)]);

  // helper: chạy fn dưới danh nghĩa user (role authenticated + JWT claims giả lập)
  async function asUser(userId, claims, fn) {
    await c.query("savepoint sp_user");
    await c.query(`select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)`,
      [JSON.stringify({ sub: userId, role: "authenticated", app_metadata: claims })]);
    try { return await fn(); } finally { await c.query("rollback to savepoint sp_user"); }
  }

  console.log("[rls-smoke] Kiểm tra cách ly tenant:");
  await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
    const t = await c.query(`select id from public.tenants`);
    check("A chỉ thấy đúng 1 tenant của mình", t.rowCount === 1 && t.rows[0].id === tA.id, JSON.stringify(t.rows));
    const cross = await c.query(`select id from public.tenants where id = $1`, [tB.id]);
    check("A đọc tenant B = 0 dòng", cross.rowCount === 0);
    const m = await c.query(`select user_id from public.tenant_members where tenant_id = $1`, [tB.id]);
    check("A đọc members tenant B = 0 dòng", m.rowCount === 0);
    const u = await c.query(`update public.tenants set name='hacked' where id=$1`, [tB.id]);
    check("A sửa tenant B = 0 dòng", u.rowCount === 0);
    const e = await c.query(`select id from public.domain_events where tenant_id=$1`, [tB.id]);
    check("A đọc events tenant B = 0 dòng", e.rowCount === 0);
    let insErr = null;
    await c.query("savepoint sp_ins");
    try { await c.query(`insert into public.domain_events (tenant_id,event_type,aggregate_type,aggregate_id) values ($1,'hack','x','1')`, [tA.id]); }
    catch (err) { insErr = err; }
    await c.query("rollback to savepoint sp_ins");
    check("Client không insert thẳng domain_events", !!insErr, "insert thành công — SAI");
    const upd = await c.query(`update public.domain_events set event_type='tampered' where tenant_id=$1`, [tA.id]);
    check("Client update domain_events = 0 dòng", upd.rowCount === 0);
  });

  console.log("[rls-smoke] Kiểm tra profiles (không có tenant_id — quét generic không phủ):");
  // uA/uB đã có profile nhờ trigger on_auth_user_created khi seed auth.users ở trên
  await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
    const own = await c.query(`select display_name from public.profiles where user_id = $1`, [uA]);
    check("A đọc được profile của chính mình", own.rowCount === 1, "trigger on_auth_user_created chưa tạo profile");
    const other = await c.query(`select display_name from public.profiles where user_id = $1`, [uB]);
    check("A đọc profile user KHÔNG chung tenant = 0 dòng", other.rowCount === 0, JSON.stringify(other.rows));
  });

  console.log("[rls-smoke] Kiểm tra fallback KHÔNG có claim (hook chưa bật):");
  await asUser(uA, {}, async () => {
    const t = await c.query(`select id from public.tenants`);
    check("A (không claim) vẫn thấy đúng tenant của mình qua membership", t.rowCount === 1 && t.rows[0].id === tA.id, JSON.stringify(t.rows));
    const cross = await c.query(`select id from public.tenants where id = $1`, [tB.id]);
    check("A (không claim) đọc tenant B = 0 dòng", cross.rowCount === 0);
  });

  console.log("[rls-smoke] Kiểm tra RPC create_tenant (user mới, chưa có tenant):");
  await asUser(uC, {}, async () => {
    const { rows: [r] } = await c.query(`select public.create_tenant('Smoke C', $1) as id`, [`smoke-c-${stamp}`]);
    check("create_tenant trả về id", !!r.id);
    // định danh definer: kiểm tra bằng quyền hiện tại (đang là C, đã có claims? chưa — claims cũ) → kiểm tra qua postgres sau savepoint không được vì rollback.
    const mem = await c.query(
      `select 1 from public.tenant_members where tenant_id=$1 and user_id=$2 and role='owner'`, [r.id, uC]);
    // asUser C không có tenant claim → RLS chặn select... dùng hàm definer? Kiểm tra gián tiếp: đọc lại bằng savepoint nội bộ đổi role về postgres
    await c.query(`select set_config('role','postgres', true)`);
    const mem2 = await c.query(
      `select 1 from public.tenant_members where tenant_id=$1 and user_id=$2 and role='owner'`, [r.id, uC]);
    check("create_tenant tạo membership owner", mem2.rowCount === 1, JSON.stringify(mem.rows));
    const ev = await c.query(
      `select 1 from public.domain_events where tenant_id=$1 and event_type='tenant.created'`, [r.id]);
    check("create_tenant phát event tenant.created", ev.rowCount === 1);
  });

  console.log("[rls-smoke] Kiểm tra GĐ1 CRM + Inbox:");
  // seed CRM/Inbox bằng quyền postgres (mô phỏng service role):
  // kênh + hội thoại + tin nhắn cho cả A và B, contact cho B
  const { rows: [chA] } = await c.query(
    `insert into public.channels (tenant_id, type, external_id, display_name) values ($1,'zalo_oa',$2,'OA Smoke A') returning id`,
    [tA.id, `oa-a-${stamp}`]);
  const { rows: [chB] } = await c.query(
    `insert into public.channels (tenant_id, type, external_id, display_name) values ($1,'zalo_oa',$2,'OA Smoke B') returning id`,
    [tB.id, `oa-b-${stamp}`]);
  await c.query(`insert into public.contacts (tenant_id, full_name) values ($1,'Khách Smoke B')`, [tB.id]);
  const { rows: [cvA] } = await c.query(
    `insert into public.conversations (tenant_id, channel_id, external_user_id) values ($1,$2,$3) returning id`,
    [tA.id, chA.id, `zl-a-${stamp}`]);
  const { rows: [cvB] } = await c.query(
    `insert into public.conversations (tenant_id, channel_id, external_user_id) values ($1,$2,$3) returning id`,
    [tB.id, chB.id, `zl-b-${stamp}`]);
  const { rows: [msgA] } = await c.query(
    `insert into public.messages (tenant_id, conversation_id, direction, sender_type, content) values ($1,$2,'in','user','xin chào A') returning id`,
    [tA.id, cvA.id]);
  await c.query(
    `insert into public.messages (tenant_id, conversation_id, direction, sender_type, content) values ($1,$2,'in','user','xin chào B')`,
    [tB.id, cvB.id]);

  await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
    const cb = await c.query(`select id from public.contacts where tenant_id=$1`, [tB.id]);
    check("A đọc contacts tenant B = 0 dòng", cb.rowCount === 0);
    const mb = await c.query(`select id from public.messages where tenant_id=$1`, [tB.id]);
    check("A đọc messages tenant B = 0 dòng", mb.rowCount === 0);
    const mu = await c.query(`update public.messages set content='tampered' where id=$1`, [msgA.id]);
    check("A update message tenant A = 0 dòng (append-only)", mu.rowCount === 0);
    const ins = await c.query(
      `insert into public.contacts (tenant_id, full_name, owner_id) values ($1,'Khách mới A',$2) returning id`,
      [tA.id, uA]);
    check("A tạo contact cho tenant mình = 1 dòng", ins.rowCount === 1);
  });

  // Tenant mới qua create_tenant phải có sẵn pipeline + lead_sources mặc định
  await asUser(uC, {}, async () => {
    const { rows: [r] } = await c.query(`select public.create_tenant('Smoke Seed', $1) as id`, [`smoke-seed-${stamp}`]);
    await c.query(`select set_config('role','postgres', true)`); // kiểm seed bằng quyền postgres (pattern sẵn có)
    const p = await c.query(`select id from public.pipelines where tenant_id=$1 and is_default`, [r.id]);
    check("Tenant mới có 1 pipeline mặc định", p.rowCount === 1);
    // migration #13: 6 stage — 4 mở + đúng 1 'won' + 1 'lost' (spec CRM §5)
    const s = await c.query(`select kind from public.pipeline_stages where tenant_id=$1`, [r.id]);
    check("Pipeline mặc định có 6 stage", s.rowCount === 6, `được ${s.rowCount}`);
    const kinds = s.rows.map((x) => x.kind);
    check(
      "Pipeline mặc định có đúng 1 cột Thắng + 1 cột Thua",
      kinds.filter((k) => k === "won").length === 1 && kinds.filter((k) => k === "lost").length === 1,
      kinds.join(","),
    );
    const ls = await c.query(`select 1 from public.lead_sources where tenant_id=$1`, [r.id]);
    check("Tenant mới có 4 lead_sources mặc định", ls.rowCount === 4, `được ${ls.rowCount}`);
    const lr = await c.query(`select 1 from public.lost_reasons where tenant_id=$1`, [r.id]);
    check("Tenant mới có 5 lý do thua mặc định", lr.rowCount === 5, `được ${lr.rowCount}`);
  });

  console.log("[rls-smoke] Kiểm tra pipeline webhook Zalo:");
  // đang ở role postgres (ngoài asUser) → đọc được private.app_config và gọi được cả 2 RPC
  const { rows: [zCfg] } = await c.query(
    `select value from private.app_config where key = 'zalo_ingest_key'`);
  check("app_config có sẵn zalo_ingest_key", !!zCfg?.value, "migration #5 chưa sinh khóa");

  let zKeyErr = null;
  await c.query("savepoint sp_zkey");
  try { await c.query(`select public.ingest_zalo_event('sai-khoa', 'evt-x', '{}'::jsonb)`); }
  catch (err) { zKeyErr = err; }
  await c.query("rollback to savepoint sp_zkey");
  check("ingest_zalo_event từ chối key sai", !!zKeyErr && /invalid_ingest_key/.test(zKeyErr.message), zKeyErr?.message ?? "không lỗi");

  const zEventId = `zalo-evt-${stamp}`;
  const zPayload = JSON.stringify({
    app_id: "smoke-app",
    oa_id: `oa-a-${stamp}`,           // OA của tenant A (channels đã seed ở trên)
    event_name: "user_send_text",
    timestamp: String(Date.now()),
    sender: { id: `zl-a-${stamp}` },  // trùng external_user_id của cvA → test nhánh upsert
    recipient: { id: `oa-a-${stamp}` },
    message: { msg_id: `zmsg-${stamp}`, text: "xin chào từ webhook" },
  });
  const { rows: [zIng] } = await c.query(
    `select public.ingest_zalo_event($1, $2, $3::jsonb) as id`, [zCfg.value, zEventId, zPayload]);
  check("ingest_zalo_event key đúng trả về id", zIng.id !== null, JSON.stringify(zIng));
  const { rows: [zDup] } = await c.query(
    `select public.ingest_zalo_event($1, $2, $3::jsonb) as id`, [zCfg.value, zEventId, zPayload]);
  check("gọi lần 2 cùng external_event_id trả null (idempotent)", zDup.id === null, JSON.stringify(zDup));

  const { rows: [zProc] } = await c.query(`select public.process_zalo_events() as n`);
  check("process_zalo_events xử lý ≥ 1 message", Number(zProc.n) >= 1, `được ${zProc.n}`);

  const zMsg = await c.query(
    `select content from public.messages
      where tenant_id = $1 and direction = 'in' and external_message_id = $2`,
    [tA.id, `zmsg-${stamp}`]);
  check("tin 'in' mới của tenant A vào messages đúng nội dung",
    zMsg.rowCount === 1 && zMsg.rows[0].content === "xin chào từ webhook", JSON.stringify(zMsg.rows));

  const zEvt = await c.query(
    `select 1 from public.webhook_events
      where provider = 'zalo' and external_event_id = $1
        and tenant_id = $2 and processed_at is not null`,
    [zEventId, tA.id]);
  check("webhook_events đã gắn tenant_id + processed_at", zEvt.rowCount === 1);

  console.log("[rls-smoke] Kiểm tra kết nối kênh Zalo (migration #10 — secret trong Vault):");
  await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
    const { rows: [zc] } = await c.query(
      `select public.connect_zalo_channel($1, 'smoke-access-token', 'smoke-refresh-token', 'OA Vault Smoke') as id`,
      [`9${stamp}001`]);
    check("connect_zalo_channel (owner) trả về channel id", !!zc.id, JSON.stringify(zc));

    // secret phải nằm trong Vault (kiểm bằng quyền postgres — savepoint asUser sẽ rollback hết)
    await c.query(`select set_config('role','postgres', true)`);
    const vs = await c.query(
      `select count(*)::int as n from vault.secrets where name in ($1, $2)`,
      [`zalo:${zc.id}:access`, `zalo:${zc.id}:refresh`]);
    check("2 secret token nằm trong Vault theo channel id", vs.rows[0].n === 2, `được ${vs.rows[0].n}`);
    const ch = await c.query(`select status, secret_ref from public.channels where id = $1`, [zc.id]);
    check("channel active + secret_ref chỉ là tham chiếu (không chứa token)",
      ch.rowCount === 1 && ch.rows[0].status === "active"
        && !/smoke-(access|refresh)-token/.test(ch.rows[0].secret_ref ?? ""),
      JSON.stringify(ch.rows));

    // authenticated KHÔNG gọi được get_zalo_channel_secrets (EXECUTE đã revoke)
    await c.query(`select set_config('role','authenticated', true)`);
    let secErr = null;
    await c.query("savepoint sp_zc_sec");
    try { await c.query(`select * from public.get_zalo_channel_secrets($1)`, [zc.id]); }
    catch (err) { secErr = err; }
    await c.query("rollback to savepoint sp_zc_sec");
    check("authenticated bị chặn get_zalo_channel_secrets",
      !!secErr && /permission denied/i.test(secErr.message), secErr?.message ?? "đọc ĐƯỢC — lộ secret!");

    // worker (service role — mô phỏng bằng postgres) đọc đúng token từ Vault
    await c.query(`select set_config('role','postgres', true)`);
    const st = await c.query(`select * from public.get_zalo_channel_secrets($1)`, [zc.id]);
    check("worker đọc được đúng cặp token từ Vault",
      st.rowCount === 1 && st.rows[0].access_token === "smoke-access-token"
        && st.rows[0].refresh_token === "smoke-refresh-token",
      JSON.stringify(st.rows?.map((r) => ({ a: !!r.access_token, r: !!r.refresh_token }))));

    // tenant B kết nối trùng OA đã thuộc tenant A → bị chặn (chống OA hijack)
    await c.query(
      `select set_config('request.jwt.claims', $1, true), set_config('role','authenticated', true)`,
      [JSON.stringify({ sub: uB, role: "authenticated", app_metadata: { tenant_id: tB.id, role: "owner" } })]);
    let dupErr = null;
    await c.query("savepoint sp_zc_dup");
    try { await c.query(`select public.connect_zalo_channel($1, 'x-access', 'x-refresh', 'OA Cướp')`, [`9${stamp}001`]); }
    catch (err) { dupErr = err; }
    await c.query("rollback to savepoint sp_zc_dup");
    check("tenant B kết nối trùng OA bị chặn 'oa_already_connected'",
      !!dupErr && /oa_already_connected/.test(dupErr.message), dupErr?.message ?? "không lỗi — OA hijack!");

    // staff không được kết nối kênh (thao tác settings — chỉ owner/admin)
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uC, role: "authenticated", app_metadata: { tenant_id: tA.id, role: "staff" } })]);
    let staffErr = null;
    await c.query("savepoint sp_zc_staff");
    try { await c.query(`select public.connect_zalo_channel($1, 'x-access', 'x-refresh', 'OA Staff')`, [`9${stamp}002`]); }
    catch (err) { staffErr = err; }
    await c.query("rollback to savepoint sp_zc_staff");
    check("staff bị chặn connect_zalo_channel 'forbidden'",
      !!staffErr && /forbidden/.test(staffErr.message), staffErr?.message ?? "không lỗi");

    // owner ngắt kết nối → secret xóa khỏi Vault, external_id nhả ra, status='disconnected'
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uA, role: "authenticated", app_metadata: { tenant_id: tA.id, role: "owner" } })]);
    await c.query(`select public.disconnect_zalo_channel($1)`, [zc.id]);
    await c.query(`select set_config('role','postgres', true)`);
    const vd = await c.query(
      `select count(*)::int as n from vault.secrets where name like 'zalo:' || $1 || ':%'`, [zc.id]);
    const chd = await c.query(
      `select status, external_id, secret_ref from public.channels where id = $1`, [zc.id]);
    check("disconnect xóa secret Vault + nhả external_id + status='disconnected'",
      vd.rows[0].n === 0 && chd.rows[0].status === "disconnected"
        && chd.rows[0].external_id === null && chd.rows[0].secret_ref === null,
      JSON.stringify({ vault: vd.rows[0].n, ch: chd.rows }));
  });

  console.log("[rls-smoke] Kiểm tra trigger bảo vệ:");
  let slugErr = null;
  await c.query("savepoint sp_slug");
  try { await c.query(`insert into public.tenants (name, slug) values ('Hack','app')`); }
  catch (err) { slugErr = err; }
  await c.query("rollback to savepoint sp_slug");
  check("Slug reserved ('app') bị chặn", !!slugErr && /slug_reserved/.test(slugErr.message), slugErr?.message ?? "không lỗi");

  let ownerErr = null;
  await c.query("savepoint sp_owner");
  try { await c.query(`delete from public.tenant_members where tenant_id=$1 and user_id=$2`, [tA.id, uA]); }
  catch (err) { ownerErr = err; }
  await c.query("rollback to savepoint sp_owner");
  check("Owner cuối cùng không xóa được", !!ownerErr && /last_owner/.test(ownerErr.message), ownerErr?.message ?? "không lỗi");

  const hook = await c.query(`select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='custom_access_token_hook'`);
  check("Hàm custom_access_token_hook tồn tại", hook.rowCount === 1);

  console.log("[rls-smoke] Guard increment_usage (migration #7 — chặn amount/metric bẩn):");
  await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
    let amtErr = null;
    await c.query("savepoint sp_amt");
    try { await c.query(`select public.increment_usage('ai_calls', -5)`); } catch (err) { amtErr = err; }
    await c.query("rollback to savepoint sp_amt");
    check("increment_usage(-5) bị chặn 'invalid_amount'", !!amtErr && /invalid_amount/.test(amtErr.message),
      amtErr?.message ?? "không lỗi — user reset được quota!");
    let metErr = null;
    await c.query("savepoint sp_met");
    try { await c.query(`select public.increment_usage('Metric Bẩn!', 1)`); } catch (err) { metErr = err; }
    await c.query("rollback to savepoint sp_met");
    check("increment_usage(metric bẩn) bị chặn 'invalid_metric'", !!metErr && /invalid_metric/.test(metErr.message),
      metErr?.message ?? "không lỗi");
    const { rows: [usg] } = await c.query(`select public.increment_usage('ai_calls', 1) as used`);
    check("increment_usage(1) hợp lệ trả về số", Number(usg.used) >= 1, JSON.stringify(usg));
  });

  console.log(`[rls-smoke] Quét generic ${genericTables.length} bảng tenant-scoped (A không đọc/ghi được dữ liệu B):`);
  // Metadata cột (quyền postgres): cột bắt buộc (not null, không default, không identity/generated),
  // FK, và giá trị hợp lệ từ check constraint dạng ANY(ARRAY[...]).
  const { rows: reqCols } = await c.query(`
    select table_name t, column_name col, udt_name typ
    from information_schema.columns
    where table_schema = 'public' and table_name = any($1)
      and is_nullable = 'NO' and column_default is null
      and is_identity = 'NO' and is_generated = 'NEVER'
    order by table_name, ordinal_position`, [genericTables]);
  const { rows: fkRows } = await c.query(`
    select tc.table_name t, kcu.column_name col, ccu.table_name ft, ccu.column_name fc
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
      and tc.table_name = any($1) and ccu.table_schema = 'public'`, [genericTables]);
  const { rows: chkRows } = await c.query(`
    select rel.relname t, pg_get_constraintdef(con.oid) def
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where con.contype = 'c' and nsp.nspname = 'public' and rel.relname = any($1)`, [genericTables]);

  const required = {};
  genericTables.forEach((t) => (required[t] = []));
  reqCols.forEach((r) => required[r.t].push({ col: r.col, typ: r.typ }));
  const fkOf = {};
  fkRows.forEach((r) => (fkOf[`${r.t}.${r.col}`] = { ft: r.ft, fc: r.fc }));
  const enumOf = {};
  chkRows.forEach((r) => {
    const em = r.def.match(/\((\w+)\s*=\s*ANY\s*\(ARRAY\[\s*'([^']*)'/);
    if (em && enumOf[`${r.t}.${em[1]}`] === undefined) enumOf[`${r.t}.${em[1]}`] = em[2];
  });
  // Cột nullable nhưng bắt buộc theo check constraint nghiệp vụ — bổ sung thủ công
  const extras = {
    activities: { contact_id: { ref: "contacts" } },          // check: contact_id OR deal_id not null
    deals: { next_action_at: { val: () => new Date() } },     // check: status='open' → next_action_at not null
  };
  const rnd = () => "smk" + Math.random().toString(36).slice(2, 10);
  const byType = (typ) => {
    if (typ === "uuid") return randomUUID();
    if (/^(int|numeric|float)/.test(typ)) return 1;
    if (typ === "bool") return false;
    if (/json/.test(typ)) return "{}";
    if (/^(timestamp|date)/.test(typ)) return new Date();
    return rnd(); // text, citext, varchar…
  };

  const refCache = new Map(); // bảng -> 1 row của tenant B (đã tồn tại hoặc vừa seed)
  async function ensureRef(table, depth) {
    if (refCache.has(table)) return refCache.get(table);
    if (depth > 5) throw new Error("chuỗi FK quá sâu: " + table);
    const ex = await c.query(`select * from public.${table} where tenant_id = $1 limit 1`, [tB.id]);
    if (ex.rowCount) { refCache.set(table, ex.rows[0]); return ex.rows[0]; }
    const row = await insertGeneric(table, tB.id, uB, depth + 1);
    refCache.set(table, row);
    return row;
  }
  async function insertGeneric(table, tenantId, userId, depth = 0) {
    const spec = new Map(required[table].map((r) => [r.col, r.typ]));
    for (const col of Object.keys(extras[table] ?? {})) if (!spec.has(col)) spec.set(col, null);
    if (!spec.has("tenant_id")) spec.set("tenant_id", "uuid"); // vd webhook_events: tenant_id nullable
    const cols = [], vals = [];
    for (const [col, typ] of spec) {
      let v;
      const ex = extras[table]?.[col];
      if (col === "tenant_id") v = tenantId;
      else if (ex?.val) v = ex.val();
      else if (ex?.ref) v = (await ensureRef(ex.ref, depth + 1)).id;
      else if (fkOf[`${table}.${col}`]) { const f = fkOf[`${table}.${col}`]; v = (await ensureRef(f.ft, depth + 1))[f.fc]; }
      else if (enumOf[`${table}.${col}`] !== undefined) v = enumOf[`${table}.${col}`];
      else if (/(^|_)(user_id|owner_id|actor_user_id|assigned_to|created_by|invited_by)$/.test(col)) v = userId;
      else v = byType(typ ?? "text");
      cols.push(col); vals.push(v);
    }
    const ph = cols.map((_, i) => "$" + (i + 1)).join(",");
    const { rows: [row] } = await c.query(
      `insert into public.${table} (${cols.join(",")}) values (${ph}) returning *`, vals);
    return row;
  }

  // Seed 1 dòng tenant B mỗi bảng bằng quyền postgres (như backend thật); lỗi seed KHÔNG bỏ qua im lặng
  const seedErr = {};
  for (const t of genericTables) {
    const before = new Set(refCache.keys());
    await c.query("savepoint sp_seed_g");
    try { await ensureRef(t, 0); }
    catch (err) {
      seedErr[t] = err.message;
      await c.query("rollback to savepoint sp_seed_g");
      for (const k of refCache.keys()) if (!before.has(k)) refCache.delete(k);
    }
  }
  const bHas = {};
  for (const t of genericTables) {
    const r = await c.query(`select count(*)::int as n from public.${t} where tenant_id = $1`, [tB.id]);
    bHas[t] = r.rows[0].n;
  }

  await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
    for (const t of genericTables) {
      // (a) A không select được rows của B — chỉ có nghĩa khi B thực sự có dữ liệu (seed phải OK)
      const sel = await c.query(`select count(*)::int as n from public.${t} where tenant_id = $1`, [tB.id]);
      check(`${t}: A đọc rows tenant B = 0`, bHas[t] > 0 && sel.rows[0].n === 0,
        seedErr[t] ? `seed B thất bại: ${seedErr[t]}` : `B có ${bHas[t]} dòng, A thấy ${sel.rows[0].n}`);
      // (b) A không insert được row mang tenant_id của B (RLS with-check hoặc không có insert policy)
      let gErr = null;
      await c.query("savepoint sp_gen_ins");
      try { await insertGeneric(t, tB.id, uC); } catch (err) { gErr = err; }
      await c.query("rollback to savepoint sp_gen_ins");
      check(`${t}: A insert với tenant_id B bị chặn`, !!gErr, "insert THÀNH CÔNG — rò rỉ ghi chéo tenant!");
    }
  });
} catch (e) {
  console.error("[rls-smoke] LỖI:", e.message);
  failed++;
} finally {
  try { await c.query("rollback"); } catch {}
  await c.end();
}

if (failed) { console.error(`[rls-smoke] ${failed} kiểm tra FAIL`); process.exit(1); }
console.log("[rls-smoke] TẤT CẢ PASS — cách ly tenant hoạt động trên DB thật, không để lại dữ liệu.");

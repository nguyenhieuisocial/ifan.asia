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
const STATIC_CHECKS = 119; // số check viết tay bên dưới — cập nhật khi thêm/bớt check tĩnh (+7 đăng nhập bằng SĐT không cần mã tiệm, migration #68)
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

  console.log("[rls-smoke] Kiểm tra một tài khoản nhiều tiệm (ADR-0005, migration #66):");
  // uA sở hữu tA; gắn thêm uA vào tB với vai admin để mô phỏng "nhiều tiệm".
  await c.query(
    `insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'admin')`,
    [tB.id, uA],
  );
  await asUser(uA, {}, async () => {
    // Không có claim -> nhánh fallback của current_tenant_id() phải đọc
    // profiles.active_tenant_id trước, rồi mới rơi về tiệm cũ nhất.
    await c.query(`select set_config('role','postgres', true)`);
    await c.query(`update public.profiles set active_tenant_id=$1 where user_id=$2`, [tB.id, uA]);
    await c.query(`select set_config('role','authenticated', true)`);
    const cur = await c.query(`select public.current_tenant_id() as id, public.app_role() as role`);
    check(
      "current_tenant_id() ưu tiên active_tenant_id (B) thay vì tiệm cũ nhất (A)",
      cur.rows[0].id === tB.id && cur.rows[0].role === "admin",
      JSON.stringify(cur.rows[0]),
    );

    // active_tenant_id trỏ vào tiệm CÓ THẬT nhưng A không phải thành viên -> phải tự rơi về tiệm hợp lệ, không kẹt.
    await c.query(`select set_config('role','postgres', true)`);
    const { rows: [foreignTenant] } = await c.query(
      `insert into public.tenants (name, slug) values ('Smoke Foreign', $1) returning id`, [`smoke-foreign-${stamp}`]);
    await c.query(`update public.profiles set active_tenant_id=$1 where user_id=$2`, [foreignTenant.id, uA]);
    await c.query(`select set_config('role','authenticated', true)`);
    const curBad = await c.query(`select public.current_tenant_id() as id`);
    check(
      "active_tenant_id trỏ tiệm không hợp lệ -> tự rơi về tiệm hợp lệ (không null, không lỗi)",
      curBad.rows[0].id === tA.id || curBad.rows[0].id === tB.id,
      JSON.stringify(curBad.rows[0]),
    );

    await c.query(`select set_config('role','postgres', true)`);
    await c.query(`update public.profiles set active_tenant_id=$1 where user_id=$2`, [tA.id, uA]);
    await c.query(`select set_config('role','authenticated', true)`);
  });

  await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
    const { rows: mine } = await c.query(`select tenant_id, role, is_active from public.my_tenants()`);
    check("my_tenants() thấy đủ 2 tiệm của A", mine.length === 2, JSON.stringify(mine));
    const active = mine.find((r) => r.is_active);
    check("my_tenants() đánh dấu ĐÚNG 1 tiệm active, khớp current_tenant_id()", active?.tenant_id === tA.id);

    const { rows: swOk } = await c.query(`select public.switch_tenant($1)`, [tB.id]);
    check("switch_tenant sang tiệm mình là thành viên — không lỗi", swOk !== undefined);
    await c.query(`select set_config('role','postgres', true)`);
    const prof = await c.query(`select active_tenant_id from public.profiles where user_id=$1`, [uA]);
    check("switch_tenant cập nhật profiles.active_tenant_id", prof.rows[0].active_tenant_id === tB.id);
    await c.query(`select set_config('role','authenticated', true)`);

    let swErr = null;
    await c.query("savepoint sp_switch_bad");
    try { await c.query(`select public.switch_tenant($1)`, [randomUUID()]); }
    catch (err) { swErr = err; }
    await c.query("rollback to savepoint sp_switch_bad");
    check("switch_tenant sang tiệm KHÔNG phải thành viên — bị chặn", !!swErr && /not_a_member/.test(swErr.message), swErr?.message);
  });

  // B không liên quan gì tới tiệm A/B của uA — gọi my_tenants() không được thấy tiệm của A.
  await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
    const { rows: mineB } = await c.query(`select tenant_id from public.my_tenants()`);
    check(
      "B gọi my_tenants() KHÔNG thấy tiệm A của uA (không rò rỉ chéo user)",
      mineB.length === 1 && mineB[0].tenant_id === tB.id,
      JSON.stringify(mineB),
    );
  });

  console.log("[rls-smoke] Kiểm tra can_create_tenant() chỉ đếm tiệm mình LÀM CHỦ (migration #66):");
  await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
    // uC vào tB với vai staff — KHÔNG phải chủ tiệm nào, vẫn phải "còn mở được tiệm".
    await c.query(`select set_config('role','postgres', true)`);
    await c.query(`insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'staff')`, [tB.id, uC]);
  });
  await asUser(uC, { tenant_id: tB.id, role: "staff" }, async () => {
    const { rows: [r] } = await c.query(`select public.can_create_tenant() as ok`);
    check("Nhân viên (staff, không phải owner tiệm nào) VẪN được tính là còn mở được tiệm", r.ok === true, JSON.stringify(r));
  });
  await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
    const { rows: [r] } = await c.query(`select public.can_create_tenant() as ok`);
    check("Chủ tiệm B (đã làm chủ 1 tiệm, hạn mức mặc định 1) hết hạn mức", r.ok === false, JSON.stringify(r));
  });

  console.log("[rls-smoke] Kiểm tra tiệm mẫu không còn chặn người ĐÃ có tiệm thật (migration #66):");
  const { rows: [sample] } = await c.query(
    `select id, industry from public.tenants where is_sample=true and industry is not null limit 1`);
  if (sample) {
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      const { rows: [r] } = await c.query(`select public.enter_sample_tenant($1) as id`, [sample.industry]);
      check("A (đã có tiệm thật) vẫn vào được tiệm mẫu — KHÔNG còn lỗi already_has_tenant", r.id === sample.id, JSON.stringify(r));
      await c.query(`select set_config('role','postgres', true)`);
      const prof = await c.query(`select active_tenant_id from public.profiles where user_id=$1`, [uA]);
      check("enter_sample_tenant đặt tiệm mẫu vừa vào làm active_tenant_id", prof.rows[0].active_tenant_id === sample.id);
      await c.query(`select set_config('role','authenticated', true)`);
      await c.query(`select public.exit_sample_tenant()`);
      await c.query(`select set_config('role','postgres', true)`);
      const prof2 = await c.query(`select active_tenant_id from public.profiles where user_id=$1`, [uA]);
      check("exit_sample_tenant xoá active_tenant_id (về null, không kẹt trong tiệm mẫu đã rời)", prof2.rows[0].active_tenant_id === null);
      await c.query(`select set_config('role','authenticated', true)`);
    });
  } else {
    check("Có sẵn ít nhất 1 tiệm mẫu để kiểm enter_sample_tenant", false, "không tìm thấy tiệm mẫu nào có industry — bỏ qua nhóm này");
  }

  console.log("[rls-smoke] Kiểm tra đăng nhập bằng SĐT không cần mã tiệm (migration #68):");
  {
    // CHỐT CHẶN QUAN TRỌNG NHẤT của nhóm này: hàm tra "SĐT làm ở tiệm nào" mà
    // mở cho anon/authenticated thì thành công cụ dò chỗ làm của người khác.
    const { rows: [acl] } = await c.query(`
      select has_function_privilege('anon','public.staff_login_shops(text)','execute') as anon,
             has_function_privilege('authenticated','public.staff_login_shops(text)','execute') as auth_,
             has_function_privilege('service_role','public.staff_login_shops(text)','execute') as svc`);
    check("staff_login_shops: khách vãng lai KHÔNG gọi được", acl.anon === false, JSON.stringify(acl));
    check("staff_login_shops: người đã đăng nhập KHÔNG gọi được", acl.auth_ === false, JSON.stringify(acl));
    check("staff_login_shops: tầng máy chủ vẫn gọi được", acl.svc === true, JSON.stringify(acl));

    await c.query(`select set_config('role','postgres', true)`);
    const phone = `09${String(stamp).slice(-8)}`;
    await c.query(`update public.profiles set phone=$1 where user_id=$2`, [phone, uC]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role, status)
       values ($1,$2,'staff','active')
       on conflict (tenant_id, user_id) do update set status='active'`,
      [tA.id, uC],
    );
    const shops = await c.query(`select * from public.staff_login_shops($1)`, [phone]);
    check("SĐT tra ra đúng tiệm đang làm",
      shops.rowCount === 1 && shops.rows[0].tenant_slug === `smoke-a-${stamp}`,
      JSON.stringify(shops.rows));

    const messy = await c.query(`select * from public.staff_login_shops($1)`,
      [`${phone.slice(0, 3)} ${phone.slice(3, 6)}-${phone.slice(6)}`]);
    check("Gõ SĐT có khoảng trắng/gạch vẫn tra đúng", messy.rowCount === 1, JSON.stringify(messy.rows));

    await c.query(`update public.tenant_members set status='removed' where tenant_id=$1 and user_id=$2`, [tA.id, uC]);
    const gone = await c.query(`select * from public.staff_login_shops($1)`, [phone]);
    check("Bị gỡ khỏi tiệm -> KHÔNG còn đăng nhập được bằng SĐT", gone.rowCount === 0, JSON.stringify(gone.rows));

    const unknown = await c.query(`select * from public.staff_login_shops($1)`, ["0900000000"]);
    check("SĐT lạ -> rỗng, không lộ gì", unknown.rowCount === 0, JSON.stringify(unknown.rows));

    // dọn dấu vết + TRẢ role về postgres — các nhóm sau seed bằng quyền postgres
    await c.query(`delete from public.tenant_members where tenant_id=$1 and user_id=$2`, [tA.id, uC]);
    await c.query(`update public.profiles set phone=null where user_id=$1`, [uC]);
    await c.query(`select set_config('role','postgres', true)`);
  }

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

    // Trigger nhật ký bản ghi (24q, migration #67) — bắt bằng trigger, không
    // rải record_audit_log() ở từng hàm TS.
    await c.query(`select set_config('role','postgres', true)`);
    const audit1 = await c.query(
      `select action from public.record_audit where entity_type='contact' and entity_id=$1 order by id`,
      [ins.rows[0].id]);
    check("Tạo contact tự ghi 1 dòng action='created'", audit1.rows.length === 1 && audit1.rows[0].action === "created", JSON.stringify(audit1.rows));
    await c.query(`select set_config('role','authenticated', true)`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uA, role: "authenticated", app_metadata: { tenant_id: tA.id, role: "owner" } })]);
    await c.query(`update public.contacts set last_interaction_at=now() where id=$1`, [ins.rows[0].id]);
    await c.query(`update public.contacts set full_name='Khách mới A (sửa)' where id=$1`, [ins.rows[0].id]);
    await c.query(`select set_config('role','postgres', true)`);
    const audit2 = await c.query(
      `select action, diff from public.record_audit where entity_type='contact' and entity_id=$1 order by id`,
      [ins.rows[0].id]);
    check(
      "Đổi last_interaction_at (cột ồn) không thêm log, đổi full_name mới thêm -> tổng đúng 2 dòng",
      audit2.rows.length === 2 && audit2.rows[1].action === "updated",
      JSON.stringify(audit2.rows.map((r) => r.action)),
    );
    check(
      "diff của lần sửa CHỈ có full_name, không lẫn last_interaction_at",
      audit2.rows[1]?.diff && Object.keys(audit2.rows[1].diff).join(",") === "full_name",
      JSON.stringify(audit2.rows[1]?.diff),
    );
    await c.query(`select set_config('role','authenticated', true)`);
    const hist = await c.query(`select * from public.contact_audit_history($1, 10)`, [ins.rows[0].id]);
    check("contact_audit_history() (owner) trả đủ 2 dòng", hist.rows.length === 2, JSON.stringify(hist.rows.length));
    await c.query(`select set_config('role','postgres', true)`);
  });

  // Vai viewer gọi contact_audit_history() -> RLS record_audit_select chỉ
  // owner/admin, phải ra 0 dòng dù RPC chạy được (không lộ qua đường phụ).
  await asUser(uB, { tenant_id: tB.id, role: "viewer" }, async () => {
    const contactB = await c.query(`select id from public.contacts where tenant_id=$1 limit 1`, [tB.id]);
    if (contactB.rowCount) {
      const histViewer = await c.query(`select * from public.contact_audit_history($1, 10)`, [contactB.rows[0].id]);
      check("Vai viewer gọi contact_audit_history() -> 0 dòng", histViewer.rows.length === 0, JSON.stringify(histViewer.rows));
    }
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

  // ==========================================================================
  // Migration #40 — MỌI hàm security definer phải ghim `pg_temp` cuối search_path
  // ==========================================================================
  // Không ghim thì Postgres tìm schema tạm TRƯỚC, mở đường đánh tráo bảng cho
  // hàm chạy bằng quyền `postgres`. Kiểm ở đây để migration sau lỡ tạo hàm
  // definer mà quên ghim thì cổng CI bắt được ngay.
  console.log("[rls-smoke] Kiểm tra search_path của hàm security definer:");
  {
    const { rows: sp } = await c.query(`
      select p.oid::regprocedure::text as sig
        from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public' and p.prosecdef
         and not exists (
           select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
            where substring(cfg from '^search_path=(.*)$')
                  ~ '(^|[,[:space:]"])pg_temp([,[:space:]"]|$)')
       order by 1`);
    check("Mọi hàm security definer đã ghim pg_temp cuối search_path", sp.length === 0,
      `còn thiếu: ${sp.map((r) => r.sig).join(", ")}`);
  }

  // ==========================================================================
  // Migration #41-A — Thông tin GÓI CƯỚC chỉ dành cho chủ tiệm + quản trị viên
  // ==========================================================================
  console.log("[rls-smoke] Kiểm tra chốt vai cho thông tin gói cước:");
  {
    // Tiệm + 4 vai RIÊNG cho phần này (không dùng lại uA/tA để không làm nhiễu
    // các kiểm tra phía sau: uA phải chỉ thuộc đúng một tiệm).
    const uOwn = randomUUID(), uAdm = randomUUID(), uMgr = randomUUID(), uStf = randomUUID();
    await c.query(
      `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4),
       ($5,'authenticated','authenticated',$6),($7,'authenticated','authenticated',$8)`,
      [uOwn, `smoke41-own-${stamp}@t.local`, uAdm, `smoke41-adm-${stamp}@t.local`,
       uMgr, `smoke41-mgr-${stamp}@t.local`, uStf, `smoke41-stf-${stamp}@t.local`]);
    const { rows: [tR] } = await c.query(
      `insert into public.tenants (name, slug) values ('Smoke Roles', $1) returning id`,
      [`smoke-roles-${stamp}`]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role, status) values
       ($1,$2,'owner','active'),($1,$3,'admin','active'),
       ($1,$4,'manager','active'),($1,$5,'staff','active')`,
      [tR.id, uOwn, uAdm, uMgr, uStf]);

    const RPCS = [
      ["billing_overview", `select public.billing_overview()`],
      ["tenant_seats", `select public.tenant_seats()`],
      ["quote_plan_change", `select public.quote_plan_change('pro','month')`],
    ];
    const callRpc = async (sql) => {
      let err = null;
      await c.query("savepoint sp_role");
      try { await c.query(sql); } catch (e) { err = e.message; }
      await c.query("rollback to savepoint sp_role");
      return err;
    };
    for (const [uid, label, allowed] of [
      [uOwn, "chủ tiệm", true], [uAdm, "quản trị viên", true],
      [uMgr, "quản lý", false], [uStf, "nhân viên", false],
    ]) {
      await asUser(uid, { tenant_id: tR.id, role: label }, async () => {
        for (const [name, sql] of RPCS) {
          const err = await callRpc(sql);
          if (allowed) check(`${label} gọi ${name}() đọc được`, err === null, err ?? "");
          else check(`${label} gọi ${name}() bị từ chối`, err !== null && /forbidden/.test(err),
            err === null ? "ĐỌC ĐƯỢC — rò rỉ thông tin gói cước!" : err);
        }
      });
    }
    // Claim JWT bịa không mở được cửa: vai đọc từ tenant_members theo auth.uid()
    await asUser(uStf, { tenant_id: tR.id, role: "owner" }, async () => {
      let err = null;
      await c.query("savepoint sp_forge");
      try { await c.query(`select public.billing_overview()`); } catch (e) { err = e.message; }
      await c.query("rollback to savepoint sp_forge");
      check("Nhân viên bịa claim role='owner' vẫn bị từ chối", err !== null && /forbidden/.test(err),
        err === null ? "LỌT — đang tin claim JWT là SAI" : err);
    });
  }

  // ==========================================================================
  // Migration #41-B — Một tài khoản mặc định chỉ mở được MỘT tiệm
  // ==========================================================================
  console.log("[rls-smoke] Kiểm tra hạn mức số tiệm mỗi tài khoản:");
  {
    const uLim = randomUUID();
    await c.query(
      `insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)`,
      [uLim, `smoke41-lim-${stamp}@t.local`]);
    const tryCreate = async (slug) => {
      let err = null;
      await c.query("savepoint sp_ct");
      try { await c.query(`select public.create_tenant('Smoke Lim', $1)`, [slug]); }
      catch (e) { err = e.message; }
      if (err) await c.query("rollback to savepoint sp_ct");
      else await c.query("release savepoint sp_ct");
      return err;
    };
    // TẤT CẢ trong MỘT khối asUser: `asUser` rollback về savepoint khi thoát,
    // tách hai khối sẽ xoá mất mấy tiệm vừa tạo và phép kiểm trần thành vô nghĩa.
    await asUser(uLim, {}, async () => {
      check("Tài khoản mới mở được tiệm đầu tiên", (await tryCreate(`smoke-l1-${stamp}`)) === null);
      const e2 = await tryCreate(`smoke-l2-${stamp}`);
      check("Cùng tài khoản gọi thẳng create_tenant lần 2 bị chặn",
        e2 !== null && /tenant_limit_reached/.test(e2),
        e2 === null ? "TẠO ĐƯỢC — chốt hạn mức không có tác dụng!" : e2);
      check("can_create_tenant() báo đã hết suất",
        (await c.query(`select public.can_create_tenant() as v`)).rows[0].v === false);
      // người dùng không tự nâng hạn mức cho mình được (RLS bật, không policy)
      let wErr = null;
      await c.query("savepoint sp_lim");
      try { await c.query(`insert into public.tenant_creation_limits (user_id, max_tenants) values ($1, 99)`, [uLim]); }
      catch (e) { wErr = e.message; }
      await c.query("rollback to savepoint sp_lim");
      check("Người dùng không tự nâng hạn mức số tiệm cho mình", wErr !== null,
        "GHI ĐƯỢC vào tenant_creation_limits — thủng!");
      const rd = await c.query(`select * from public.tenant_creation_limits`);
      check("Người dùng không đọc được bảng hạn mức", rd.rowCount === 0, `đọc được ${rd.rowCount} dòng`);

      // founder nâng hạn mức lên 3 (mô phỏng service role qua SQL editor), rồi
      // trả lại quyền authenticated để đo tiếp bằng đúng con mắt người dùng
      await c.query(`select set_config('role','postgres', true)`);
      await c.query(
        `insert into public.tenant_creation_limits (user_id, max_tenants, note)
         values ($1, 3, 'smoke: chuỗi nhiều chi nhánh')
         on conflict (user_id) do update set max_tenants = excluded.max_tenants`, [uLim]);
      await c.query(`select set_config('role','authenticated', true)`);

      check("Sau khi nâng lên 3: mở được tiệm thứ hai", (await tryCreate(`smoke-l3-${stamp}`)) === null);
      check("Sau khi nâng lên 3: mở được tiệm thứ ba", (await tryCreate(`smoke-l4-${stamp}`)) === null);
      const e5 = await tryCreate(`smoke-l5-${stamp}`);
      check("Vượt trần mới thì vẫn chặn", e5 !== null && /tenant_limit_reached/.test(e5),
        e5 === null ? "TẠO ĐƯỢC — trần mới không có tác dụng" : e5);
    });
  }

  // ==========================================================================
  // Phạm vi nhân viên thường: HỘI THOẠI dùng chung — TIỀN thì không
  // ==========================================================================
  // Chốt bằng test hai hợp đồng KHÁC NHAU đang cùng tồn tại, để lần sau không ai
  // vô tình đổi bên này theo bên kia:
  //  · conversations = RLS tenant-scope, CHỦ Ý (spec Inbox §4.2 cho mọi vai trò
  //    tab "Chưa gán / Tất cả"; §5 chốt policy chỉ theo tenant; §8 tiêu chí 3 chỉ
  //    đòi cách ly TENANT, không đòi cách ly người dùng) → hộp thư dùng chung,
  //    không ai bỏ sót khách. Siết theo assignee sẽ làm hỏng việc nhặt hội thoại
  //    chưa gán ⇒ test này FAIL để báo động.
  //  · deals/contacts + dashboard_sales = "Pattern B" (spec Báo cáo §5 và §8 tiêu
  //    chí 5: staff không đọc được số của đồng nghiệp) → nới ra sẽ FAIL.
  console.log("[rls-smoke] Kiểm tra phạm vi nhân viên thường (hội thoại dùng chung / tiền riêng):");
  const uS1 = randomUUID(), uS2 = randomUUID();
  await c.query(
    `insert into auth.users (id, aud, role, email) values
     ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4)`,
    [uS1, `smoke-s1-${stamp}@t.local`, uS2, `smoke-s2-${stamp}@t.local`]);
  await c.query(
    `insert into public.tenant_members (tenant_id,user_id,role) values ($1,$2,'staff'),($1,$3,'staff')`,
    [tA.id, uS1, uS2]);

  // Tiền: mỗi nhân viên 1 deal thắng (1tr vs 9tr) trên khách của chính mình
  const { rows: [plA] } = await c.query(
    `insert into public.pipelines (tenant_id,name,is_default) values ($1,'PL Smoke',false) returning id`, [tA.id]);
  const { rows: [stA] } = await c.query(
    `insert into public.pipeline_stages (tenant_id,pipeline_id,name,kind,position)
     values ($1,$2,'Mới','open',1) returning id`, [tA.id, plA.id]);
  const mkDeal = async (uid, ctName, amount) => {
    const { rows: [ct] } = await c.query(
      `insert into public.contacts (tenant_id,full_name,owner_id) values ($1,$2,$3) returning id`,
      [tA.id, ctName, uid]);
    await c.query(
      `insert into public.deals (tenant_id,pipeline_id,stage_id,contact_id,owner_id,title,value_vnd,status,won_at)
       values ($1,$2,$3,$4,$5,$6,$7,'won',now())`,
      [tA.id, plA.id, stA.id, ct.id, uid, `Deal ${ctName}`, amount]);
  };
  await mkDeal(uS1, `Khách NV1 ${stamp}`, 1_000_000);
  await mkDeal(uS2, `Khách NV2 ${stamp}`, 9_000_000);

  // Hội thoại: gán NV1 · gán NV2 · CHƯA GÁN — đều 'open' và tin cuối là của khách
  const mkConv = async (assignee, key) => {
    const { rows: [cv] } = await c.query(
      `insert into public.conversations (tenant_id,channel_id,external_user_id,status,assignee_user_id,
         last_user_message_at,last_message_at)
       values ($1,$2,$3,'open',$4,now(),now()) returning id`,
      [tA.id, chA.id, `zl-scope-${key}-${stamp}`, assignee]);
    return cv.id;
  };
  const cvMine = await mkConv(uS1, "mine");
  const cvMate = await mkConv(uS2, "mate");
  const cvFree = await mkConv(null, "free");

  const STAFF1 = { tenant_id: tA.id, role: "staff" };
  const wFrom = new Date(Date.now() - 86_400_000).toISOString();
  const wTo = new Date(Date.now() + 86_400_000).toISOString();
  const wPrevFrom = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const wPrevTo = new Date(Date.now() - 2 * 86_400_000).toISOString();

  await asUser(uS1, STAFF1, async () => {
    // (1) hộp thư dùng chung — CHỦ Ý, không được siết
    const cv = await c.query(`select id from public.conversations where tenant_id=$1`, [tA.id]);
    const ids = cv.rows.map((r) => r.id);
    check("Nhân viên thấy hội thoại CHƯA GÁN (nhặt việc được)", ids.includes(cvFree),
      "hộp thư dùng chung bị siết — nhân viên hết nhặt được việc");
    check("Nhân viên thấy hội thoại của ĐỒNG NGHIỆP (trực thay được)", ids.includes(cvMate),
      "hộp thư dùng chung bị siết — không trực thay nhau được");
    const ov = (await c.query(`select public.dashboard_overview() as j`)).rows[0].j;
    check("dashboard_overview(): 'Hội thoại đang mở' là số CẢ TIỆM (≥3)",
      Number(ov.open_conversations) >= 3, `được ${ov.open_conversations}`);
    check("dashboard_overview(): 'Chưa trả lời' là số CẢ TIỆM (≥3)",
      Number(ov.unanswered) >= 3, `được ${ov.unanswered}`);

    // (2) tiền vẫn riêng — không được nới
    const s = (await c.query(`select public.dashboard_sales($1,$2,$3,$4) as j`,
      [wFrom, wTo, wPrevFrom, wPrevTo])).rows[0].j;
    check("Nhân viên chỉ thấy doanh thu CỦA MÌNH (1.000.000đ)",
      Number(s.revenue.current) === 1_000_000, `được ${s.revenue.current} — lộ tiền đồng nghiệp!`);
    check("Bảng hiệu suất của nhân viên chỉ có 1 dòng = chính mình",
      s.staff.length === 1, `được ${s.staff.length} dòng — lộ số đồng nghiệp!`);
    const dl = await c.query(`select id from public.deals where tenant_id=$1`, [tA.id]);
    check("Nhân viên đọc deal của đồng nghiệp = 0 dòng", dl.rowCount === 1, `thấy ${dl.rowCount} deal`);
    const ctv = await c.query(
      `select id from public.contacts where tenant_id=$1 and full_name like $2`, [tA.id, `Khách NV%${stamp}`]);
    check("Nhân viên đọc khách của đồng nghiệp = 0 dòng", ctv.rowCount === 1, `thấy ${ctv.rowCount} khách`);

    // (3) cách ly tenant vẫn nguyên với vai trò staff
    const xb = await c.query(`select id from public.conversations where tenant_id=$1`, [tB.id]);
    check("Nhân viên tiệm A đọc hội thoại tiệm B = 0 dòng", xb.rowCount === 0);

    // (4) hộp thư PHẢI còn dùng được — siết mà hỏng hộp thư là thất bại
    const om = await c.query(`select id from public.conversations where id=$1`, [cvMine]);
    check("Nhân viên MỞ được hội thoại được giao", om.rowCount === 1);
    const rep = await c.query(
      `insert into public.messages (tenant_id,conversation_id,direction,sender_type,sender_user_id,content)
       values ($1,$2,'out','agent',$3,'Dạ em trả lời ạ') returning id`, [tA.id, cvMine, uS1]);
    check("Nhân viên TRẢ LỜI được hội thoại được giao", rep.rowCount === 1);
    const cls = await c.query(`update public.conversations set status='closed' where id=$1`, [cvMine]);
    check("Nhân viên ĐÓNG được hội thoại được giao", cls.rowCount === 1);
    const pick = await c.query(
      `update public.conversations set assignee_user_id=$1 where id=$2`, [uS1, cvFree]);
    check("Nhân viên NHẶT được hội thoại chưa ai nhận", pick.rowCount === 1);
  });

  // Chủ tiệm vẫn thấy ĐỦ — siết nhầm phía quản lý cũng phải báo động
  await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
    const s = (await c.query(`select public.dashboard_sales($1,$2,$3,$4) as j`,
      [wFrom, wTo, wPrevFrom, wPrevTo])).rows[0].j;
    check("Chủ tiệm thấy tổng doanh thu cả tiệm (10.000.000đ)",
      Number(s.revenue.current) === 10_000_000, `được ${s.revenue.current}`);
    check("Chủ tiệm thấy đủ 2 nhân viên trong bảng hiệu suất",
      s.staff.length === 2, `được ${s.staff.length}`);
  });

  // ---- Vai viewer — "Chỉ xem, không sửa được gì" (team.roleHints.viewer)
  // — đọc TOÀN TIỆM (không chỉ bản ghi tự sở hữu), ghi/sửa/xoá 0 chỗ nào lọt.
  // Ca thật đã bắt được lỗi ở đây: viewer tự gán mình làm owner_id vẫn
  // ghi được (migration #65 vá) — savepoint từng lệnh vì kỳ vọng LỖI.
  console.log("[rls-smoke] Kiểm tra vai viewer (đọc toàn tiệm, ghi 0 chỗ lọt — tiệm mẫu 15b dùng vai này):");
  const uV = randomUUID();
  await c.query(
    `insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)`,
    [uV, `smoke-viewer-${stamp}@t.local`]);
  await c.query(`insert into public.tenant_members (tenant_id,user_id,role) values ($1,$2,'viewer')`, [tA.id, uV]);
  const VIEWER = { tenant_id: tA.id, role: "viewer" };

  await asUser(uV, VIEWER, async () => {
    const dl = await c.query(`select id from public.deals where tenant_id=$1`, [tA.id]);
    check("Viewer ĐỌC được deal của người khác (không chỉ tự sở hữu)", dl.rowCount >= 2, `thấy ${dl.rowCount} deal`);
    const ctv = await c.query(
      `select id from public.contacts where tenant_id=$1 and full_name like $2`, [tA.id, `Khách NV%${stamp}`]);
    check("Viewer ĐỌC được contact của người khác", ctv.rowCount >= 2, `thấy ${ctv.rowCount} contact`);
    const cmp = await c.query(`select id from public.companies where tenant_id=$1`, [tA.id]);
    check("Viewer ĐỌC được companies (không lỗi)", cmp.rowCount >= 0);

    let insErr = null;
    await c.query("savepoint sp_v1");
    try { await c.query(`insert into public.contacts (tenant_id,full_name) values ($1,'Viewer chèn lén')`, [tA.id]); }
    catch (err) { insErr = err; }
    await c.query("rollback to savepoint sp_v1");
    check("Viewer KHÔNG ghi được contacts", !!insErr, insErr ? "đúng như kỳ vọng" : "LỖI — ghi lọt!");

    const upd = await c.query(`update public.contacts set full_name='sửa lén' where id=$1`, [ctv.rows[0]?.id]);
    check("Viewer KHÔNG sửa được contacts (0 dòng đổi)", upd.rowCount === 0, `đổi ${upd.rowCount} dòng`);

    let compErr = null;
    await c.query("savepoint sp_v2");
    try { await c.query(`insert into public.companies (tenant_id,name) values ($1,'Cty chèn lén')`, [tA.id]); }
    catch (err) { compErr = err; }
    await c.query("rollback to savepoint sp_v2");
    check("Viewer KHÔNG ghi được companies", !!compErr, compErr ? "đúng như kỳ vọng" : "LỖI — ghi lọt!");

    // Ca gắt nhất đã từng lọt: viewer tự gán MÌNH làm owner_id activities.
    let actErr = null;
    await c.query("savepoint sp_v3");
    try {
      await c.query(
        `insert into public.activities (tenant_id,type,contact_id,owner_id) values ($1,'note',$2,$3)`,
        [tA.id, ctv.rows[0]?.id, uV]);
    } catch (err) { actErr = err; }
    await c.query("rollback to savepoint sp_v3");
    check("Viewer tự gán mình làm owner_id vẫn KHÔNG ghi được activities", !!actErr,
      actErr ? "đúng như kỳ vọng" : "LỖI — ghi lọt (chính lỗ đã vá ở migration #65)!");

    const xb = await c.query(`select id from public.deals where tenant_id=$1`, [tB.id]);
    check("Viewer tiệm A đọc deal tiệm B = 0 dòng (cách ly tenant vẫn nguyên)", xb.rowCount === 0);
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

  // -------------------------------------------------------------------------
  // Leo thang quyền admin → owner (migration #38).
  // Món nợ đã từng xảy ra: policy members_manage/invitations_manage cho vai
  // 'admin' toàn quyền ALL trên tenant_members + invitations, nên admin tự đổi
  // vai mình thành 'owner' bằng MỘT lệnh PostgREST — rồi gọi được
  // change_plan/cancel_subscription (những hàm cố ý chỉ dành cho chủ tiệm).
  // Hai đường đã chứng minh khai thác được trên DB thật trước khi vá:
  //   Đ1: update tenant_members set role='owner' where user_id=<chính mình>
  //   Đ2: insert invitations(role='owner', email=<của mình>) + accept_invitation
  // -------------------------------------------------------------------------
  console.log("[rls-smoke] Chống leo thang quyền admin → owner (migration #38):");
  {
    const uAdm = randomUUID();
    const uOwn2 = randomUUID();
    await c.query(
      `insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)`,
      [uAdm, `smoke-adm-${stamp}@t.local`]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role, status, joined_at)
       values ($1,$2,'admin','active',now())`, [tA.id, uAdm]);

    await asUser(uAdm, { tenant_id: tA.id, role: "admin" }, async () => {
      let e1 = null;
      await c.query("savepoint sp_esc1");
      try { await c.query(`update public.tenant_members set role='owner' where user_id=$1`, [uAdm]); }
      catch (err) { e1 = err; }
      await c.query("rollback to savepoint sp_esc1");
      check("admin KHÔNG tự nâng mình lên owner (tenant_members)",
        !!e1 && /only_owner_can_change_owner_role/.test(e1.message),
        e1?.message ?? "không lỗi — admin leo lên owner được!");

      let e2 = null;
      await c.query("savepoint sp_esc2");
      try {
        await c.query(
          `insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
           values ($1,$2,'owner',$3,$4)`,
          [tA.id, `smoke-adm-${stamp}@t.local`, "a".repeat(64), uAdm]);
      } catch (err) { e2 = err; }
      await c.query("rollback to savepoint sp_esc2");
      check("admin KHÔNG tạo được lời mời vai owner",
        !!e2 && /only_owner_can_invite_owner/.test(e2.message),
        e2?.message ?? "không lỗi — còn đường vòng qua lời mời!");

      // Hạ vai chủ tiệm: thêm chủ thứ hai trước, để trigger "chủ cuối cùng"
      // (#2) không nổ trước và che mất chốt mới đang cần chứng minh.
      let e3 = null;
      await c.query("savepoint sp_esc3");
      try {
        await c.query(`select set_config('role','postgres', true)`);
        await c.query(
          `insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)`,
          [uOwn2, `smoke-own2-${stamp}@t.local`]);
        await c.query(
          `insert into public.tenant_members (tenant_id, user_id, role, status, joined_at)
           values ($1,$2,'owner','active',now())`, [tA.id, uOwn2]);
        await c.query(`select set_config('request.jwt.claims', $1, true), set_config('role','authenticated', true)`,
          [JSON.stringify({ sub: uAdm, role: "authenticated", app_metadata: { tenant_id: tA.id, role: "admin" } })]);
        await c.query(`update public.tenant_members set role='staff' where user_id=$1`, [uA]);
      } catch (err) { e3 = err; }
      await c.query("rollback to savepoint sp_esc3");
      check("admin KHÔNG hạ vai chủ tiệm xuống (dù tiệm còn chủ khác)",
        !!e3 && /only_owner_can_change_owner_role/.test(e3.message),
        e3?.message ?? "không lỗi — admin phế được chủ tiệm!");
    });

    // Không siết quá tay: CHỦ TIỆM vẫn trao được vai chủ cho người khác.
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      await c.query("savepoint sp_esc4");
      let ok = false, e4 = null;
      try {
        const r = await c.query(`update public.tenant_members set role='owner' where user_id=$1`, [uAdm]);
        ok = r.rowCount === 1;
      } catch (err) { e4 = err; }
      await c.query("rollback to savepoint sp_esc4");
      check("CHỦ TIỆM vẫn trao được vai owner cho người khác", ok,
        e4?.message ?? "0 dòng — chốt mới siết quá tay");

      await c.query("savepoint sp_esc5");
      let okInv = false, e5 = null;
      try {
        const r = await c.query(
          `insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
           values ($1,$2,'admin',$3,$4)`,
          [tA.id, `smoke-inv-${stamp}@t.local`, "b".repeat(64), uA]);
        okInv = r.rowCount === 1;
      } catch (err) { e5 = err; }
      await c.query("rollback to savepoint sp_esc5");
      check("Lời mời vai thường (admin) vẫn tạo được bình thường", okInv,
        e5?.message ?? "0 dòng");
    });
  }

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
    // check: breach_after_minutes > warn_after_minutes (byType trả 1 cho cả hai → vi phạm)
    sla_policies: {
      warn_after_minutes: { val: () => 30 },
      breach_after_minutes: { val: () => 120 },
    },
    // check 1 giá trị ('zalo_bot') → pg render "kind = 'zalo_bot'" không có ANY(ARRAY[...])
    notification_channels: { kind: { val: () => "zalo_bot" } },
    // check regex '^\d{6}$' — sinh đúng mã 6 số
    link_codes: { code: { val: () => String(Math.floor(Math.random() * 900000) + 100000) } },
    // check month = ngày 1 của tháng (#52)
    source_costs: { month: { val: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; } } },
    // check month ngày 1 + metric thuộc bộ 3 (#59)
    kpi_targets: {
      month: { val: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; } },
      metric: { val: () => "revenue_won" },
    },
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

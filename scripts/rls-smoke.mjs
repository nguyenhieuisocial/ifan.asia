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
const STATIC_CHECKS = 266; // số check viết tay bên dưới — cập nhật khi thêm/bớt check tĩnh (+8 chuông nền tảng ADR-0007, task #84; +16 cổng khách công khai ADR-0008, task #87; +4 storefront_save_hours nguyên tử, task #88; +4 xoá tiệm không bị nhật ký chặn, migration #82; +36 V2 Lịch hẹn nền ADR-0009 mục 8, migration #83; +8 màn Cài đặt Dịch vụ & Tài nguyên ADR-0009 mục 7 việc 3; +12 AI trực việc ADR-0014 mục 10, migration #105-109 — task #126; +11 Kho tri thức ADR-0015 mục 9 (ca 1/3/4/5a/5b/9-12 — ca 2/6/7/8 cần Anthropic thật, xác nhận bằng tay), migration #113-117 — task #131; +7 chủ dự án ≠ chủ tiệm (leo thang quyền: chủ tiệm bất kỳ chiếm được quyền chủ dự án trên bot), migration #119 — task #133; +12 Zalo Bot hỏi đáp (ADR-0016, TRA CỨU không dùng AI), migration #120 — task #128; giá trị 251 đã LỆCH 2 so với thực tế trước đợt này — sửa luôn về đúng số đo được (253) trước khi +13 V3 Đơn hàng/Thu tiền ADR-0019 mục 9, migration #127-129 — task #144)
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
    `insert into public.tenants (name, slug, is_sample) values ('Smoke A', $1, true) returning id`, [`smoke-a-${stamp}`]);
  const { rows: [tB] } = await c.query(
    `insert into public.tenants (name, slug, is_sample) values ('Smoke B', $1, true) returning id`, [`smoke-b-${stamp}`]);
  await c.query(
    `insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'owner'),($3,$4,'owner')`,
    [tA.id, uA, tB.id, uB]);
  await c.query(
    `insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id) values ($1,'smoke.seed','tenant',$2)`,
    [tB.id, String(tB.id)]);

  // helper: chạy fn dưới danh nghĩa user (role authenticated + JWT claims giả lập)
  //
  // Tên savepoint phải DUY NHẤT mỗi lần gọi — Postgres cho phép nhiều savepoint
  // trùng tên (không báo lỗi), và `ROLLBACK TO SAVEPOINT <tên trùng>` LUÔN nhắm
  // vào bản GẦN NHẤT còn tồn tại, bất kể đang ở scope nào. Một tên "sp_user" cố
  // định từng làm asUser() LỒNG NHAU (như ca4/ca10-12 Kho tri thức) rollback SAI
  // savepoint: finally của khối NGOÀI vô tình nhắm lại savepoint của khối TRONG
  // (đã rollback rồi nhưng Postgres không "xoá" nó), nên dòng ghi ở khối NGOÀI
  // (trước khi khối TRONG mở) không hề bị dọn — RÒ RỈ DỮ LIỆU âm thầm sang ca
  // sau. Bắt được vì ca 5a Kho tri thức đếm ĐÚNG 200 dòng nên lộ ra 1 dòng dư
  // từ ca4; các nơi lồng khác (dòng ~193/202, ~1296/1327) không có phép đếm
  // chính xác nên bug này có thể đã âm thầm tồn tại từ trước mà không lộ.
  let spSeq = 0;
  async function asUser(userId, claims, fn) {
    const sp = `sp_user_${++spSeq}`;
    await c.query(`savepoint ${sp}`);
    await c.query(`select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)`,
      [JSON.stringify({ sub: userId, role: "authenticated", app_metadata: claims })]);
    try { return await fn(); } finally { await c.query(`rollback to savepoint ${sp}`); }
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
      `insert into public.tenants (name, slug, is_sample) values ('Smoke Foreign', $1, true) returning id`, [`smoke-foreign-${stamp}`]);
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
  // `can_create_tenant()` (migration #66) CHỈ đếm tiệm `is_sample=false` — đúng
  // ý: vào tiệm mẫu không được tính vào hạn mức thật. Nhưng tB (fixture của cả
  // file) tự nó là `is_sample=true` (đổi khi vá bug chuông báo giả — mọi tiệm
  // smoke đều gắn is_sample=true để không bắn cảnh báo thật) — nên B "làm chủ
  // tB" KHÔNG đụng hạn mức. Dựng thêm MỘT tiệm is_sample=false riêng cho đúng
  // ca này, để test lại đúng hành vi "đã làm chủ 1 tiệm THẬT thì hết hạn mức".
  const { rows: [tBReal] } = await c.query(
    `insert into public.tenants (name, slug, is_sample) values ('Smoke B Real', $1, false) returning id`,
    [`smoke-b-real-${stamp}`]);
  await c.query(`insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'owner')`, [tBReal.id, uB]);
  await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
    // uC vào tB với vai staff — KHÔNG phải chủ tiệm nào, vẫn phải "còn mở được tiệm".
    await c.query(`select set_config('role','postgres', true)`);
    await c.query(`insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'staff')`, [tB.id, uC]);
  });
  await asUser(uC, { tenant_id: tB.id, role: "staff" }, async () => {
    const { rows: [r] } = await c.query(`select public.can_create_tenant() as ok`);
    check("Nhân viên (staff, không phải owner tiệm nào) VẪN được tính là còn mở được tiệm", r.ok === true, JSON.stringify(r));
  });
  await asUser(uB, { tenant_id: tBReal.id, role: "owner" }, async () => {
    const { rows: [r] } = await c.query(`select public.can_create_tenant() as ok`);
    check("Chủ tiệm B (đã làm chủ 1 tiệm THẬT, hạn mức mặc định 1) hết hạn mức", r.ok === false, JSON.stringify(r));
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
    // staff_login_shops() CHỦ Ý lọc is_sample=false ("tiệm mẫu không ai làm
    // nhân viên ở đó") — mà tA là tiệm mẫu (is_sample=true, gắn từ lúc vá bug
    // chuông báo giả, mọi tiệm smoke đều vậy — xem chú thích dòng ~199). Dùng
    // tA cho ca này luôn ra rỗng dù hàm hoàn toàn đúng — lỗi Ở BÀI TEST, không
    // phải sản phẩm (bắt được lúc nghiệm thu D3 việc #144, theo dõi ở #151).
    // Dựng riêng 1 tiệm THẬT (is_sample=false), cùng khuôn với tBReal ở trên.
    const { rows: [tPhoneReal] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke SDT', $1, false) returning id`,
      [`smoke-sdt-${stamp}`]);
    const phone = `09${String(stamp).slice(-8)}`;
    await c.query(`update public.profiles set phone=$1 where user_id=$2`, [phone, uC]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role, status)
       values ($1,$2,'staff','active')
       on conflict (tenant_id, user_id) do update set status='active'`,
      [tPhoneReal.id, uC],
    );
    const shops = await c.query(`select * from public.staff_login_shops($1)`, [phone]);
    check("SĐT tra ra đúng tiệm đang làm",
      shops.rowCount === 1 && shops.rows[0].tenant_slug === `smoke-sdt-${stamp}`,
      JSON.stringify(shops.rows));

    const messy = await c.query(`select * from public.staff_login_shops($1)`,
      [`${phone.slice(0, 3)} ${phone.slice(3, 6)}-${phone.slice(6)}`]);
    check("Gõ SĐT có khoảng trắng/gạch vẫn tra đúng", messy.rowCount === 1, JSON.stringify(messy.rows));

    await c.query(`update public.tenant_members set status='removed' where tenant_id=$1 and user_id=$2`, [tPhoneReal.id, uC]);
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
    // 5 từ #87 (V1.5, ADR-0008): +"Form/Landing" bên cạnh Zalo/Facebook/Giới thiệu/Khác.
    check("Tenant mới có 5 lead_sources mặc định", ls.rowCount === 5, `được ${ls.rowCount}`);
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
      `insert into public.tenants (name, slug, is_sample) values ('Smoke Roles', $1, true) returning id`,
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

  console.log("[rls-smoke] Phiên hỗ trợ chỉ-đọc (ADR-0006 mục 7, task #81):");
  {
    const uAdmin = randomUUID();
    await c.query(
      `insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)`,
      [uAdmin, `smoke-admin-${stamp}@t.local`],
    );
    await c.query(`insert into public.platform_admins (user_id, role) values ($1, 'support')`, [uAdmin]);

    // asUser() (helper chung phía trên) LUÔN rollback-to-savepoint sau khi chạy
    // — đúng ý cho "thử một lượt rồi bỏ", nhưng phiên hỗ trợ cần các dòng
    // support_sessions/tenant_members SỐNG QUA nhiều bước kiểm liên tiếp.
    // Dùng helper riêng: đặt claim, chạy, KHÔNG rollback — chỉ trả role về
    // 'postgres' để câu tiếp theo (viết bằng quyền postgres) không dính claim cũ.
    async function runAs(userId, claims, sql, params = []) {
      await c.query(
        `select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)`,
        [JSON.stringify({ sub: userId, role: "authenticated", app_metadata: claims })],
      );
      try {
        return await c.query(sql, params);
      } finally {
        await c.query(`select set_config('role', 'postgres', true)`);
      }
    }

    const s1 = await runAs(uAdmin, {},
      `select public.open_support_session($1, 'Kiểm rls-smoke — không sửa gì thật', 60) as id`, [tB.id]);
    const sessionId = s1.rows[0]?.id;
    check("Ca 1a — mở phiên hợp lệ", !!sessionId);

    // Ca 1: trong phiên hỗ trợ, thử GHI vào 6 bảng lõi — fail hết 6/6.
    // UPDATE bị RLS USING chặn thì CHẠY XONG nhưng rowCount=0 (không throw) —
    // khác INSERT (throw ngay) — phải soát rowCount, không chỉ bắt try/catch
    // (bẫy đã tự dính lúc viết kịch bản kiểm tay, sửa ở đây luôn).
    const coreWrites = [
      ["contacts", `insert into public.contacts (tenant_id, full_name) values ($1,'QA hack')`],
      ["deals", `insert into public.deals (tenant_id, title, contact_id, value_vnd) values ($1,'QA hack', gen_random_uuid(), 0)`],
      ["tags", `insert into public.tags (tenant_id, name) values ($1,'qa-hack')`],
      ["tenants (update)", `update public.tenants set name = 'HACKED' where id = $1`],
      ["activities", `insert into public.activities (tenant_id, contact_id, type, owner_id) values ($1, gen_random_uuid(), 'note', $2)`],
      ["saved_views", `insert into public.saved_views (tenant_id, screen, name, query, vocab_version) values ($1,'contacts','qa-hack','q=x',2)`],
    ];
    let blocked6 = 0;
    await asUser(uAdmin, { tenant_id: tB.id, role: "viewer" }, async () => {
      for (const [, sql] of coreWrites) {
        await c.query("savepoint sp_core_write");
        try {
          const r = await c.query(sql, [tB.id, uAdmin]);
          if (/^update/i.test(sql) && r.rowCount === 0) blocked6++; // USING chặn im lặng — vẫn là bị chặn
        } catch { blocked6++; }
        await c.query("rollback to savepoint sp_core_write");
      }
    });
    check("Ca 1b — quản trị trong phiên hỗ trợ ghi 6 bảng lõi FAIL hết 6/6", blocked6 === 6, `chặn được ${blocked6}/6`);

    // Ca 2: lùi expires_at về quá khứ → hook không còn cấp claim tenant này.
    await c.query(`update public.support_sessions set expires_at = now() - interval '1 hour' where id = $1`, [sessionId]);
    await c.query(`update public.tenant_members set expires_at = now() - interval '1 hour' where tenant_id = $1 and user_id = $2`, [tB.id, uAdmin]);
    const { rows: [hookExp] } = await c.query(
      `select public.custom_access_token_hook($1) as ev`, [JSON.stringify({ user_id: uAdmin, claims: {} })]);
    const claimExp = hookExp.ev.claims?.app_metadata;
    check("Ca 2 — hết hạn thì hook KHÔNG cấp claim tiệm đó", !claimExp || claimExp.tenant_id !== tB.id, JSON.stringify(claimExp));
    // đặt lại cho ca sau
    await c.query(`update public.support_sessions set expires_at = now() + interval '30 minutes', ended_at = null, ended_by = null where id = $1`, [sessionId]);
    await c.query(`update public.tenant_members set expires_at = now() + interval '30 minutes', status = 'active' where tenant_id = $1 and user_id = $2`, [tB.id, uAdmin]);

    // Ca 3+4: ép tiệm B "đầy ghế" (subscription suspended → plan_limit=0) — vẫn mở được, số ghế không đổi.
    const { rows: seatsBefore } = await c.query(`select public.tenant_seats_used($1) as n`, [tB.id]);
    const { rowCount: hadSub } = await c.query(`select 1 from public.subscriptions where tenant_id = $1`, [tB.id]);
    if (hadSub) await c.query(`update public.subscriptions set status = 'suspended' where tenant_id = $1`, [tB.id]);
    else await c.query(`insert into public.subscriptions (tenant_id, plan_code, status, billing_cycle) values ($1,'pro','suspended','month')`, [tB.id]);
    let sessionId2;
    let openErr = null;
    try {
      const s2 = await runAs(uAdmin, {},
        `select public.open_support_session($1, 'Kiểm rls-smoke lần 2 — tiệm đầy ghế', 60) as id`, [tB.id]);
      sessionId2 = s2.rows[0]?.id;
    } catch (err) { openErr = err; }
    check("Ca 3 — mở phiên được dù tiệm đầy ghế (không dính seat_limit_reached)", !!sessionId2, openErr?.message ?? "");
    const { rows: seatsAfter } = await c.query(`select public.tenant_seats_used($1) as n`, [tB.id]);
    check("Ca 4 — số ghế trước/sau khi mở phiên KHÔNG đổi", seatsBefore[0].n === seatsAfter[0].n,
      `trước=${seatsBefore[0].n} sau=${seatsAfter[0].n}`);
    if (hadSub) await c.query(`update public.subscriptions set status = 'trialing' where tenant_id = $1`, [tB.id]);
    else await c.query(`delete from public.subscriptions where tenant_id = $1`, [tB.id]);

    // Ca 5: hàng tenant_members CŨ (expires_at NULL, không phải hỗ trợ) — hook không đổi hành vi.
    const { rows: [hookOld] } = await c.query(
      `select public.custom_access_token_hook($1) as ev`, [JSON.stringify({ user_id: uB, claims: {} })]);
    const claimOld = hookOld.ev.claims?.app_metadata;
    check("Ca 5 — thành viên thường (expires_at NULL) không đổi hành vi", claimOld?.tenant_id === tB.id, JSON.stringify(claimOld));

    // Ca 6: mọi dòng support_sessions có reason + có dòng record_audit tương ứng.
    const { rows: [noReason] } = await c.query(
      `select count(*)::int as n from public.support_sessions where id = any($1) and (reason is null or char_length(trim(reason)) < 10)`,
      [[sessionId, sessionId2].filter(Boolean)]);
    check("Ca 6a — không dòng support_sessions nào thiếu reason", noReason.n === 0);
    const { rows: [auditN] } = await c.query(
      `select count(*)::int as n from public.record_audit where entity_type = 'support_session' and entity_id = any($1) and action = 'opened'`,
      [[sessionId, sessionId2].filter(Boolean)]);
    check("Ca 6b — mỗi lần mở đều có dòng record_audit", auditN.n === [sessionId, sessionId2].filter(Boolean).length);

    // Ca phụ: chủ tiệm bấm "Dừng ngay" — end_support_session cho phép owner/admin CỦA TIỆM ĐÓ đóng, không phải admin nền tảng.
    let tenantEndErr = null;
    try {
      await runAs(uB, { tenant_id: tB.id, role: "owner" }, `select public.end_support_session($1)`, [sessionId2]);
    } catch (err) { tenantEndErr = err; }
    const { rows: [closedRow] } = await c.query(`select ended_at, ended_by from public.support_sessions where id = $1`, [sessionId2]);
    check("Ca phụ — chủ tiệm bấm Dừng ngay đóng được phiên (ended_by='tenant')",
      !tenantEndErr && closedRow?.ended_at != null && closedRow?.ended_by === "tenant", tenantEndErr?.message ?? "");
    const { rows: [memberAfter] } = await c.query(
      `select status from public.tenant_members where tenant_id = $1 and user_id = $2`, [tB.id, uAdmin]);
    check("Ca phụ — tenant_members thu hồi ngay (status='removed') sau khi đóng", memberAfter?.status === "removed");

    // Ca phụ: lý do < 10 ký tự bị chặn ở tầng CSDL, không phải ở ô nhập — dùng
    // asUser() (không phải runAs): đây là lượt THỬ, phải tự dọn dù thành công hay lỗi.
    let shortErr = null;
    await asUser(uAdmin, {}, async () => {
      try { await c.query(`select public.open_support_session($1, 'ngắn quá', 60)`, [tB.id]); }
      catch (err) { shortErr = err; }
    });
    check("Ca phụ — lý do <10 ký tự bị chặn (reason_required)", !!shortErr && /reason_required/.test(shortErr.message),
      shortErr?.message ?? "không lỗi");
  }

  console.log("[rls-smoke] Chuông nền tảng (ADR-0007 mục 9, task #84):");
  {
    // Cô lập với trạng thái ghép nối THẬT của môi trường (founder đã/chưa
    // ghép nối bot chuông) — lưu lại để khôi phục đúng thứ tự ca; toàn bộ
    // script rollback ở cuối nên đây chỉ để log không gây hiểu nhầm giữa chừng.
    const { rows: [savedChat] } = await c.query(
      `select value from private.app_config where key = 'platform_bot_chat_id'`);

    // Ca 6 — CHƯA ghép nối ĐƯỜNG NÀO: platform_notify() im lặng bỏ qua.
    //
    // Ca này viết từ hồi Zalo là kênh DUY NHẤT nên chỉ xoá `platform_bot_chat_id`
    // là đủ. Migration #102 CỐ Ý đổi luật ("còn bất kỳ đường nào nhận được thì
    // vẫn ghi") và thêm Telegram làm đường thứ hai — từ đó ca này đo thiếu một
    // nửa điều kiện, và nó bắt đầu FAIL thật khi founder nối Telegram. Lộ ra
    // 13/08 lúc vá migration #119.
    //
    // Sửa cho khớp luật đang chạy: phải cắt CẢ HAI đường mới gọi là "chưa ghép
    // nối". Bọc savepoint để không kéo theo việc xoá liên kết sang khối sau.
    await c.query("savepoint sp_no_channel");
    await c.query(`delete from private.app_config where key = 'platform_bot_chat_id'`);
    await c.query(
      `delete from public.user_telegram_links l
        where exists (select 1 from public.platform_admins pa where pa.user_id = l.user_id)`);
    const { rows: [hrNotPaired] } = await c.query(
      `insert into public.help_requests (tenant_id, created_by, message, allow_screen_view)
         values ($1, $2, 'không ai thấy tin này', false) returning id`, [tB.id, uB]);
    const { rows: [cntNotPaired] } = await c.query(
      `select count(*)::int as n from public.platform_outbox where dedupe_key = $1`,
      [`help:${hrNotPaired.id}`]);
    check("Ca 6 — chưa ghép nối đường nào (Zalo lẫn Telegram): không sinh dòng, không lỗi",
      cntNotPaired.n === 0, `thấy ${cntNotPaired.n} dòng`);
    await c.query("rollback to savepoint sp_no_channel");

    // Ghép nối giả lập cho các ca còn lại.
    await c.query(
      `insert into private.app_config (key, value) values ('platform_bot_chat_id', 'smoke-chat-id')
         on conflict (key) do update set value = excluded.value`);

    // Ca 3 + Ca 5 — help_request mới → đúng 1 dòng platform_outbox, nội dung
    // CHỈ là tín hiệu (tên tiệm + dẫn mở /admin), KHÔNG chứa nguyên văn message
    // (ADR-0007 mục 5 — giữ nguyên vẹn nhật ký admin_audit_logs).
    const { rows: [tenantB] } = await c.query(`select name from public.tenants where id = $1`, [tB.id]);
    const secretMsg = `bí mật không được lộ ${stamp}`;
    const { rows: [hr] } = await c.query(
      `insert into public.help_requests (tenant_id, created_by, message, allow_screen_view)
         values ($1, $2, $3, true) returning id`, [tB.id, uB, secretMsg]);
    const { rows: outboxRows } = await c.query(
      `select body from public.platform_outbox where dedupe_key = $1`, [`help:${hr.id}`]);
    check("Ca 3 — insert help_requests sinh đúng 1 dòng platform_outbox", outboxRows.length === 1,
      `thấy ${outboxRows.length} dòng`);
    check("Ca 5 — nội dung tin KHÔNG chứa nguyên văn help_requests.message",
      outboxRows.length === 1 && !outboxRows[0].body.includes(secretMsg), outboxRows[0]?.body ?? "");
    check("Ca 5b — nội dung tin có tên tiệm + dẫn mở /admin",
      outboxRows.length === 1 && outboxRows[0].body.includes(tenantB.name) && outboxRows[0].body.includes("/admin"),
      outboxRows[0]?.body ?? "");

    // Ca 4 — vé chống trùng theo job+ngày: help_requests tự nhiên không lặp
    // (mỗi yêu cầu một id riêng, dedupe_key 'help:<id>' unique theo schema) —
    // ca thật sự có nguy cơ lặp là cùng MỘT job cron hỏng nhiều lần trong
    // ngày (system_alerts UPSERT vào cùng 1 dòng mở). Insert (lần hỏng đầu)
    // rồi update (lần hỏng tiếp) cùng job_id → vẫn phải ra đúng 1 dòng.
    const fakeJobId = 999000 + Number(stamp.slice(-3));
    await c.query(
      `insert into public.system_alerts (job_id, job_name, first_failed_at, last_failed_at, fail_count, detail)
         values ($1, 'smoke-job', now(), now(), 1, 'lần 1')`, [fakeJobId]);
    await c.query(
      `update public.system_alerts set fail_count = fail_count + 1, last_failed_at = now(), detail = 'lần 2'
         where job_id = $1 and acknowledged_at is null`, [fakeJobId]);
    const { rows: [alertCount] } = await c.query(
      `select count(*)::int as n from public.platform_outbox where dedupe_key like $1`,
      [`alert:${fakeJobId}:%`]);
    check("Ca 4 — job hỏng 2 lần trong ngày vẫn 1 dòng (vé chống trùng)", alertCount.n === 1,
      `thấy ${alertCount.n} dòng`);

    // Ca 1 — authenticated (kể cả chủ tiệm) đọc platform_outbox: 0 dòng thấy
    // được, dù bị RLS chặn im lặng hay bị từ chối thẳng ở tầng quyền (table
    // này REVOKE ALL khỏi authenticated — đúng quy ước platform_admins).
    let selBlocked = false;
    await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
      try {
        const r = await c.query(`select id from public.platform_outbox`);
        selBlocked = r.rowCount === 0;
      } catch { selBlocked = true; }
    });
    check("Ca 1 — authenticated đọc platform_outbox = 0 dòng (RLS/khước từ)", selBlocked);

    // Ca 2 — platform_notify() chỉ dành cho trigger nội bộ gọi, client gọi thẳng phải bị từ chối.
    let internalBlocked = false;
    await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
      try { await c.query(`select public.platform_notify('help_request', 'x', 'y')`); }
      catch (err) { internalBlocked = /permission denied/.test(err.message); }
    });
    check("Ca 2 — authenticated gọi thẳng platform_notify() bị từ chối", internalBlocked);

    // Ca 7 — worker gọi sai khóa (bot_ingest_key) phải bị chặn ngay, không claim gì.
    // LƯU Ý (bẫy tự dính lúc viết): raise exception trong Postgres đầu độc cả
    // transaction, không chỉ statement đó — bắt bằng try/catch ở tầng Node là
    // CHƯA ĐỦ, phải rollback to savepoint thì các câu lệnh SAU mới chạy tiếp
    // được (thiếu bước này làm bước khôi phục platform_bot_chat_id ngay dưới
    // chết theo với "current transaction is aborted" — bắt được nhờ chạy thật).
    let claimErr = null;
    await c.query("savepoint sp_claim_bad_key");
    try { await c.query(`select public.platform_claim_outbox('sai-khoa-chac-chan', 5)`); }
    catch (err) { claimErr = err; }
    await c.query("rollback to savepoint sp_claim_bad_key");
    check("Ca 7 — platform_claim_outbox sai p_key bị chặn (invalid_key)",
      !!claimErr && /invalid_key/.test(claimErr.message), claimErr?.message ?? "không lỗi");

    // Khôi phục trạng thái ghép nối thật (transaction rollback ở cuối script
    // cũng tự lo việc này — làm tường minh để log giữa chừng không gây hiểu nhầm).
    if (savedChat) {
      await c.query(
        `insert into private.app_config (key, value) values ('platform_bot_chat_id', $1)
           on conflict (key) do update set value = excluded.value`, [savedChat.value]);
    } else {
      await c.query(`delete from private.app_config where key = 'platform_bot_chat_id'`);
    }
  }

  console.log("[rls-smoke] Chủ dự án ≠ chủ tiệm (migration #119, task #133):");
  {
    // Lỗ leo thang quyền bắt được 13/08: ba hàm dưới đây từng hỏi "có phải
    // chủ/quản trị của MỘT TIỆM NÀO ĐÓ không?" thay vì "có phải CHỦ DỰ ÁN
    // không?". Vì đăng ký iFan là tự phục vụ và `create_tenant()` tự đặt người
    // gọi làm owner, ai cũng tự cấp cho mình vai "chủ tiệm" được ⇒ nối Telegram
    // là chiếm quyền chủ dự án trên bot (kèm cờ sửa file thẳng trên máy
    // founder). Bảy ca dưới đây khoá cả ba hàm lại theo `platform_admins`.
    const { rows: [ingest] } = await c.query(
      `select value from private.app_config where key = 'bot_ingest_key'`);
    const botKey = ingest?.value ?? null;

    // uShop = chủ tiệm THẬT nhưng KHÔNG phải chủ dự án — đóng vai "khách hàng
    // tự đăng ký". uBoss = chủ dự án (có tên trong platform_admins).
    const uShop = randomUUID(), uBoss = randomUUID();
    const tgShop = `smoke-tg-shop-${stamp}`, tgBoss = `smoke-tg-boss-${stamp}`;
    await c.query(
      `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4)`,
      [uShop, `smoke-shop-${stamp}@t.local`, uBoss, `smoke-boss-${stamp}@t.local`]);
    const { rows: [tShop] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke Tiệm Khách', $1, true) returning id`,
      [`smoke-shop-${stamp}`]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'owner')`,
      [tShop.id, uShop]);
    // Chủ tiệm nối Telegram SAU CÙNG — cố ý, để chứng minh "nối gần nhất"
    // KHÔNG thắng được "có phải chủ dự án".
    await c.query(
      `insert into public.user_telegram_links (user_id, telegram_user_id) values ($1,$2)`,
      [uShop, tgShop]);

    if (!botKey) {
      check("KHÓA CHUNG: bot_ingest_key phải có để kiểm 3 hàm bot", false,
        "private.app_config['bot_ingest_key'] trống — 7 ca dưới không chạy được");
    } else {
      // Ca 1 — chủ tiệm nối Telegram: bot phải thấy là NGƯỜI THƯỜNG.
      const { rows: [whoShop] } = await c.query(
        `select public.tg_who_is($1,$2) as w`, [botKey, tgShop]);
      check("CDA ca1: chủ tiệm nối Telegram → is_founder = false (không phải chủ dự án)",
        whoShop.w?.linked === true && whoShop.w?.is_founder === false, JSON.stringify(whoShop.w));

      // Ca 2 — chống hồi quy: trường `is_staff` đã GỠ HẲN. Nó từng là cổng
      // quyền sai ở cả 3 nơi dùng; giữ lại là để nguyên cái bẫy cho lần sau.
      check("CDA ca2: tg_who_is KHÔNG còn trả trường is_staff (đã gỡ, chống dùng nhầm lại)",
        whoShop.w !== null && !("is_staff" in whoShop.w), JSON.stringify(whoShop.w));

      // Ca 3 — chuông nền tảng KHÔNG được chọn chủ tiệm, dù họ nối mới nhất.
      const { rows: [tgt1] } = await c.query(
        `select public.tg_platform_target($1) as t`, [botKey]);
      check("CDA ca3: tg_platform_target KHÔNG trả Telegram của chủ tiệm (dù nối mới nhất)",
        tgt1.t !== tgShop, `trả về ${tgt1.t}`);

      // Ca 4 — cho uBoss vào platform_admins rồi nối Telegram ⇒ phải thành
      // người nhận chuông (nối sau uShop nên cũng là mới nhất).
      await c.query(`insert into public.platform_admins (user_id) values ($1)`, [uBoss]);
      await c.query(
        `insert into public.user_telegram_links (user_id, telegram_user_id) values ($1,$2)`,
        [uBoss, tgBoss]);
      const { rows: [whoBoss] } = await c.query(
        `select public.tg_who_is($1,$2) as w`, [botKey, tgBoss]);
      check("CDA ca4: chủ dự án nối Telegram → is_founder = true",
        whoBoss.w?.is_founder === true, JSON.stringify(whoBoss.w));

      const { rows: [tgt2] } = await c.query(
        `select public.tg_platform_target($1) as t`, [botKey]);
      check("CDA ca5: tg_platform_target trả đúng Telegram của chủ dự án",
        tgt2.t === tgBoss, `trả về ${tgt2.t}`);
    }

    // Ca 6 — CHƯA ghép Zalo và CHỈ có chủ tiệm nối Telegram ⇒ không ai nhận
    // được ⇒ platform_notify phải đứng yên. Bản #102 đếm cả link của chủ tiệm
    // nên tưởng "đã có đường nhận", sinh dòng vào hàng đợi không ai đọc.
    await c.query("savepoint sp_cda_ca6");
    await c.query(`delete from private.app_config where key = 'platform_bot_chat_id'`);
    await c.query(`delete from public.user_telegram_links where telegram_user_id <> $1`, [tgShop]);
    const { rows: [hrShopOnly] } = await c.query(
      `insert into public.help_requests (tenant_id, created_by, message, allow_screen_view)
         values ($1, $2, 'chỉ chủ tiệm nối telegram', false) returning id`, [tB.id, uB]);
    const { rows: [cntShopOnly] } = await c.query(
      `select count(*)::int as n from public.platform_outbox where dedupe_key = $1`,
      [`help:${hrShopOnly.id}`]);
    check("CDA ca6: chỉ chủ tiệm nối Telegram (chưa ghép Zalo) → KHÔNG sinh dòng chuông",
      cntShopOnly.n === 0, `thấy ${cntShopOnly.n} dòng`);
    await c.query("rollback to savepoint sp_cda_ca6");

    // Ca 7 — đối chứng: chủ dự án đã nối Telegram thì vẫn phải sinh dòng
    // (giữ đúng ý định #102 — còn đường nào nhận được thì đừng đứng yên).
    await c.query("savepoint sp_cda_ca7");
    await c.query(`delete from private.app_config where key = 'platform_bot_chat_id'`);
    await c.query(`delete from public.user_telegram_links where telegram_user_id <> $1`, [tgBoss]);
    const { rows: [hrBoss] } = await c.query(
      `insert into public.help_requests (tenant_id, created_by, message, allow_screen_view)
         values ($1, $2, 'chủ dự án đã nối telegram', false) returning id`, [tB.id, uB]);
    const { rows: [cntBoss] } = await c.query(
      `select count(*)::int as n from public.platform_outbox where dedupe_key = $1`,
      [`help:${hrBoss.id}`]);
    check("CDA ca7 (đối chứng): chủ dự án đã nối Telegram → VẪN sinh dòng chuông",
      cntBoss.n === 1, `thấy ${cntBoss.n} dòng`);
    await c.query("rollback to savepoint sp_cda_ca7");
  }

  console.log("[rls-smoke] Zalo Bot hỏi đáp (ADR-0016, task #128):");
  {
    const uZA = randomUUID(), uZB = randomUUID(), uZRem = randomUUID();
    await c.query(
      `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4),
       ($5,'authenticated','authenticated',$6)`,
      [uZA, `smoke-za-${stamp}@t.local`, uZB, `smoke-zb-${stamp}@t.local`,
       uZRem, `smoke-zrem-${stamp}@t.local`]);
    const { rows: [tZalo] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke Zalo', $1, true) returning id`,
      [`smoke-zalo-${stamp}`]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role, status) values
       ($1,$2,'staff','active'),($1,$3,'staff','active'),($1,$4,'staff','removed')`,
      [tZalo.id, uZA, uZB, uZRem]);
    const { rows: [ch] } = await c.query(
      `insert into public.notification_channels (tenant_id, kind) values ($1,'zalo_bot') returning id`,
      [tZalo.id]);
    await c.query(
      `insert into public.staff_channel_links (tenant_id, user_id, external_chat_id) values
       ($1,$2,'chat-a'),($1,$3,'chat-b'),($1,$4,'chat-removed')`,
      [tZalo.id, uZA, uZB, uZRem]);

    // Dữ liệu để "việc"/"lịch"/"khách" có gì mà trả lời.
    const { rows: [contactA] } = await c.query(
      `insert into public.contacts (tenant_id, full_name, phone) values ($1,'Nguyễn Văn Khách', '0900000000') returning id`,
      [tZalo.id]);
    await c.query(
      `insert into public.activities (tenant_id, type, subject, contact_id, owner_id, due_at) values
       ($1,'task','Gọi lại khách', $2, $3, now() - interval '1 hour')`,
      [tZalo.id, contactA.id, uZA]);
    const dow = new Date().getUTCDay();
    await c.query(
      `insert into public.business_hours (tenant_id, weekday, open_time, close_time) values ($1,$2,'00:00','23:59')`,
      [tZalo.id, dow]);
    await c.query(
      `insert into public.appointments (tenant_id, contact_id, staff_user_id, start_at, end_at) values
       ($1,$2,$3, now() + interval '1 hour', now() + interval '2 hour')`,
      [tZalo.id, contactA.id, uZA]);

    const { rows: [ingest] } = await c.query(
      `select value from private.app_config where key = 'bot_ingest_key'`);
    const botKey = ingest?.value ?? null;

    if (!botKey) {
      check("ZALO KHOÁ CHUNG: bot_ingest_key phải có để kiểm bot_answer", false,
        "private.app_config['bot_ingest_key'] trống — 10 ca dưới không chạy được");
    } else {
      const ask = async (chatId, text) =>
        (await c.query(`select public.bot_answer($1,$2,$3,$4) as r`, [botKey, ch.id, chatId, text])).rows[0].r;

      // Ca 1 — "việc" trả đúng số quá hạn của CHÍNH uZA (1 việc quá hạn vừa tạo).
      const r1 = await ask("chat-a", "hôm nay tôi có việc gì?");
      check("Zalo ca1: hỏi 'việc' → trả đúng quá hạn của chính mình",
        typeof r1.reply === "string" && r1.reply.includes("Quá hạn: 1"), JSON.stringify(r1));

      // Ca 2 — việc của uZB (đồng nghiệp, KHÔNG có việc quá hạn nào) không lẫn vào uZA.
      const r2 = await ask("chat-b", "việc");
      check("Zalo ca2: việc của ĐỒNG NGHIỆP không lọt vào câu trả lời (uZB có 0 việc quá hạn)",
        typeof r2.reply === "string" && r2.reply.includes("Quá hạn: 0"), JSON.stringify(r2));

      // Ca 3 — chat lạ chưa từng liên kết → chỉ đường lấy mã, không lộ gì.
      const r3 = await ask("chat-la-hoac-chua-tung-noi", "việc");
      check("Zalo ca3: chat chưa liên kết → chỉ đường lấy mã, không lộ dữ liệu",
        typeof r3.reply === "string" && r3.reply.includes("/link") && !r3.reply.includes("Quá hạn"),
        JSON.stringify(r3));

      // Ca 4 — người ĐÃ BỊ GỠ khỏi tiệm (hàng liên kết còn sót) → bị từ chối,
      // KHÔNG trả dữ liệu — đúng bài học migration #119 tối nay.
      const r4 = await ask("chat-removed", "việc");
      check("Zalo ca4: người đã bị gỡ khỏi tiệm (còn hàng liên kết) → bị từ chối, không trả dữ liệu",
        typeof r4.reply === "string" && !r4.reply.includes("Quá hạn") && !r4.reply.includes("Lịch"),
        JSON.stringify(r4));

      // Ca 5 — hỏi bằng chat đã nối TIỆM KHÁC (tenant khác), gửi tới bot tiệm
      // này → tuyệt đối không trộn dữ liệu hai tiệm.
      const { rows: [tOther] } = await c.query(
        `insert into public.tenants (name, slug, is_sample) values ('Smoke Zalo Khác', $1, true) returning id`,
        [`smoke-zalo-2-${stamp}`]);
      const uOther = randomUUID();
      await c.query(
        `insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)`,
        [uOther, `smoke-zother-${stamp}@t.local`]);
      await c.query(
        `insert into public.tenant_members (tenant_id, user_id, role, status) values ($1,$2,'staff','active')`,
        [tOther.id, uOther]);
      await c.query(
        `insert into public.staff_channel_links (tenant_id, user_id, external_chat_id) values ($1,$2,'chat-other-tenant')`,
        [tOther.id, uOther]);
      const r5 = await ask("chat-other-tenant", "việc"); // hỏi bot TIỆM NÀY (ch.id) bằng chat của TIỆM KIA
      check("Zalo ca5: chat đã nối tiệm KHÁC, hỏi bot tiệm này → không trộn dữ liệu (rơi về chưa liên kết)",
        typeof r5.reply === "string" && r5.reply.includes("/link") && !r5.reply.includes("Quá hạn"),
        JSON.stringify(r5));

      // Ca 6 — "khách <tên>" phải theo ĐÚNG quyền đọc khách trong app
      // (policy contacts_select #65): vai staff CHỈ thấy khách mình phụ trách.
      //
      // Bản đầu của ca này chỉ hỏi "có tìm ra khách không" nên đóng dấu XANH
      // cho đúng hành vi SAI (bot rộng hơn app) — vá ở migration #121. Giờ
      // hỏi đúng câu: AI ĐƯỢC PHÉP thấy.
      await c.query(
        `insert into public.contacts (tenant_id, full_name, phone, owner_id)
           values ($1,'Trần Thị Người Khác','0911111111',$2)`,
        [tZalo.id, uZB]);
      const r6a = await ask("chat-a", "khách Trần Thị Người Khác");
      check("Zalo ca6a: staff KHÔNG thấy khách của đồng nghiệp (khớp policy contacts_select)",
        typeof r6a.reply === "string" && !r6a.reply.includes("0911111111"), JSON.stringify(r6a));

      // Đối chứng 1 — chính chủ phụ trách thì PHẢI thấy.
      const r6b = await ask("chat-b", "khách Trần Thị Người Khác");
      check("Zalo ca6b (đối chứng): staff THẤY khách do chính mình phụ trách",
        typeof r6b.reply === "string" && r6b.reply.includes("0911111111"), JSON.stringify(r6b));

      // Đối chứng 2 — quản lý xem được cả tiệm, y như trong app.
      await c.query(
        `update public.tenant_members set role='manager' where tenant_id=$1 and user_id=$2`,
        [tZalo.id, uZA]);
      const r6c = await ask("chat-a", "khách Trần Thị Người Khác");
      check("Zalo ca6c (đối chứng): quản lý xem được khách cả tiệm, đúng như trong app",
        typeof r6c.reply === "string" && r6c.reply.includes("0911111111"), JSON.stringify(r6c));
      await c.query(
        `update public.tenant_members set role='staff' where tenant_id=$1 and user_id=$2`,
        [tZalo.id, uZA]);

      // Ca 6d — ký tự đại diện của ILIKE không được biến "khách %" thành
      // "khớp tất cả" (contactA không có người phụ trách, uZA vai staff).
      const r6d = await ask("chat-a", "khách %");
      check("Zalo ca6d: 'khách %' KHÔNG khớp bừa cả danh sách (đã thoát ký tự đại diện)",
        typeof r6d.reply === "string" && r6d.reply.includes("Không thấy"), JSON.stringify(r6d));

      // Ca 7 — câu ngoài 3 ý → nói làm được gì, KHÔNG đoán, không gọi AI.
      const r7 = await ask("chat-a", "thời tiết hôm nay thế nào");
      check("Zalo ca7: câu ngoài phạm vi → trả câu 'làm được gì', không đoán bừa",
        typeof r7.reply === "string" && r7.reply.includes("việc") && r7.reply.includes("lịch") && r7.reply.includes("khách"),
        JSON.stringify(r7));

      // Ca 8 — quá 20 câu/ngày: mồi sẵn ĐÚNG 20 dòng 'answer' hôm nay cho uZA,
      // lượt thứ 21 phải là ĐÚNG MỘT câu báo hết lượt, lượt thứ 22 im lặng
      // hoàn toàn. Xoá trước các dòng ca1/ca7 đã lỡ ghi cho uZA/"chat-a" —
      // thiếu bước này thì nền không phải 20 sạch (bắt được nhờ chạy thật).
      await c.query("savepoint sp_zalo_ca8");
      await c.query(
        `delete from public.bot_outbox where tenant_id = $1 and user_id = $2 and kind = 'answer'`,
        [tZalo.id, uZA]);
      await c.query(
        `insert into public.bot_outbox (tenant_id, user_id, external_chat_id, kind, dedupe_key, body, status, sent_at)
           select $1, $2, 'chat-a', 'answer', 'seed:' || gen_random_uuid(), 'mồi', 'sent', now()
             from generate_series(1,20)`,
        [tZalo.id, uZA]);
      const r8a = await ask("chat-a", "việc");
      check("Zalo ca8a: đúng lượt thứ 21 trong ngày → MỘT câu báo hết lượt",
        typeof r8a.reply === "string" && r8a.reply.includes("20") && r8a.reply.toLowerCase().includes("lượt"),
        JSON.stringify(r8a));
      const r8b = await ask("chat-a", "việc");
      check("Zalo ca8b: lượt thứ 22 trong ngày → im lặng hoàn toàn (reply=null)",
        r8b.reply === null, JSON.stringify(r8b));
      await c.query("rollback to savepoint sp_zalo_ca8");

      // Ca 9 — tiệm chạm trần 3.000 tin/tháng → dừng trả lời (im lặng phía
      // người hỏi) NHƯNG rung chuông thật, không chết ngầm.
      await c.query("savepoint sp_zalo_ca9");
      const vMonth = new Date();
      const monthKeyVN = `${vMonth.getUTCFullYear()}-${String(vMonth.getUTCMonth() + 1).padStart(2, "0")}-01`;
      await c.query(
        `insert into public.channel_quota (tenant_id, month, sent_count) values ($1,$2,3000)
           on conflict (tenant_id, month) do update set sent_count = 3000`,
        [tZalo.id, monthKeyVN]);
      const r9 = await ask("chat-b", "việc");
      const { rows: [alert9] } = await c.query(
        `select detail from public.system_alerts where job_name = 'zalo-bot-digest' and acknowledged_at is null
           and detail like '%' || $1 || '%'`, [tZalo.id]);
      check("Zalo ca9: tiệm chạm trần tháng → im lặng phía người hỏi",
        r9.reply === null, JSON.stringify(r9));
      check("Zalo ca9b: tiệm chạm trần tháng → RUNG CHUÔNG thật (system_alerts), không chết ngầm",
        !!alert9, JSON.stringify(alert9));
      await c.query("rollback to savepoint sp_zalo_ca9");

      // Ca 10 — authenticated gọi thẳng bot_answer() KHÔNG qua p_key hợp lệ phải bị chặn.
      let ca10Err = null;
      await asUser(uZA, { tenant_id: tZalo.id, role: "staff" }, async () => {
        try { await c.query(`select public.bot_answer('sai-khoa', $1, 'chat-a', 'việc')`, [ch.id]); }
        catch (e) { ca10Err = e; }
      });
      check("Zalo ca10: gọi bot_answer() sai p_key → bị chặn (invalid_key)",
        !!ca10Err && /invalid_key/.test(ca10Err.message), ca10Err?.message ?? "CHẠY ĐƯỢC — chốt hở!");
    }
  }

  console.log("[rls-smoke] Cổng khách công khai V1.5 (ADR-0008 mục 8, task #87):");
  {
    // Tiệm B: bật mặt tiền + form, giờ mở cửa cả ngày hôm nay (chỉ để storefront_view
    // có dữ liệu trả — is_open không tính ở SQL, xem chú thích đầu migration #80).
    // Tiệm A: KHÔNG có dòng tenant_storefront -> mặc định tắt, dùng làm ca "form chưa bật".
    await c.query(
      `insert into public.tenant_storefront (tenant_id, storefront_enabled, lead_form_enabled)
         values ($1, true, true)`, [tB.id]);
    const dow = new Date().getUTCDay();
    await c.query(
      `insert into public.business_hours (tenant_id, weekday, open_time, close_time)
         values ($1, $2, '00:00', '23:59')`, [tB.id, dow]);
    const { rows: [tARow] } = await c.query(`select slug from public.tenants where id=$1`, [tA.id]);
    const { rows: [tBRow] } = await c.query(`select slug from public.tenants where id=$1`, [tB.id]);

    // Ca 1 — anon đọc THẲNG bảng cấu hình form/giờ mở cửa = 0 dòng. RPC là cửa
    // duy nhất (đúng nguyên tắc livechat #23) — chấp nhận cả 2 dạng: RLS trả 0
    // dòng, hoặc revoke chặn thẳng bằng lỗi quyền (2 cách đều = "không đọc được").
    await c.query("savepoint sp_anon_read");
    await c.query(`select set_config('role','anon', true), set_config('request.jwt.claims','{}', true)`);
    let sfBlocked = false, bhBlocked = false;
    try { const r = await c.query(`select tenant_id from public.tenant_storefront where tenant_id=$1`, [tB.id]); sfBlocked = r.rowCount === 0; }
    catch { sfBlocked = true; }
    try { const r = await c.query(`select id from public.business_hours where tenant_id=$1`, [tB.id]); bhBlocked = r.rowCount === 0; }
    catch { bhBlocked = true; }
    await c.query("rollback to savepoint sp_anon_read");
    check("Ca 1 — anon đọc thẳng tenant_storefront = 0 dòng (RLS/khước từ)", sfBlocked);
    check("Ca 1b — anon đọc thẳng business_hours = 0 dòng (RLS/khước từ)", bhBlocked);

    // storefront_view: slug hợp lệ + đã bật -> trả dữ liệu; slug lạ -> not_found
    // đồng nhất (không dò được tiệm nào tồn tại qua thông báo lỗi, ADR mục 5).
    const view = await c.query(`select public.storefront_view($1) as v`, [tBRow.slug]);
    check("storefront_view trả enabled=true khi tiệm đã bật mặt tiền", view.rows[0].v.enabled === true, JSON.stringify(view.rows[0].v));
    let notFoundErr = null;
    await c.query("savepoint sp_sf_notfound");
    try { await c.query(`select public.storefront_view($1)`, [`khong-ton-tai-${stamp}`]); }
    catch (err) { notFoundErr = err; }
    await c.query("rollback to savepoint sp_sf_notfound");
    check("storefront_view slug không tồn tại -> not_found", !!notFoundErr && /not_found/.test(notFoundErr.message), notFoundErr?.message ?? "không lỗi");

    // Ca 2 — không có tham số tenant_id nào ở storefront_submit_lead (chỉ p_slug)
    // nên "gửi form với tenant_id tiệm khác" KHÔNG CÓ ĐƯỜNG THỰC HIỆN — chốt bằng
    // kết quả: gửi qua slug A luôn rơi vào nhánh của A (form tắt), không lọt sang B.
    // Ca 4 — tiệm CHƯA bật form (tiệm A) -> "từ chối lịch sự" = form_disabled, không tạo lead.
    let disabledErr = null;
    await c.query("savepoint sp_disabled");
    try {
      await c.query(
        `select public.storefront_submit_lead($1,$2,$3,'Khách Test','0912345678','{}'::jsonb)`,
        [tARow.slug, `tok-${stamp}-disabled`, `ip-${stamp}-disabled`]);
    } catch (err) { disabledErr = err; }
    await c.query("rollback to savepoint sp_disabled");
    check("Ca 2+4 — tiệm chưa bật form -> form_disabled, không tạo lead, không lọt sang tiệm khác",
      !!disabledErr && /form_disabled/.test(disabledErr.message), disabledErr?.message ?? "không lỗi");

    // Input cơ bản: tên rỗng / SĐT sai khuôn phải bị chặn ở CSDL, không chỉ ở client.
    let emptyNameErr = null;
    await c.query("savepoint sp_empty_name");
    try { await c.query(`select public.storefront_submit_lead($1,$2,$3,'','0912345678','{}'::jsonb)`, [tBRow.slug, `tok-${stamp}-empty`, `ip-${stamp}-empty`]); }
    catch (err) { emptyNameErr = err; }
    await c.query("rollback to savepoint sp_empty_name");
    check("Tên rỗng -> invalid_request", !!emptyNameErr && /invalid_request/.test(emptyNameErr.message), emptyNameErr?.message ?? "không lỗi");
    let badPhoneErr = null;
    await c.query("savepoint sp_bad_phone");
    try { await c.query(`select public.storefront_submit_lead($1,$2,$3,'Khách Test','090 123','{}'::jsonb)`, [tBRow.slug, `tok-${stamp}-badphone`, `ip-${stamp}-badphone`]); }
    catch (err) { badPhoneErr = err; }
    await c.query("rollback to savepoint sp_bad_phone");
    check("SĐT sai khuôn -> invalid_phone", !!badPhoneErr && /invalid_phone/.test(badPhoneErr.message), badPhoneErr?.message ?? "không lỗi");

    // Ca 3 — chống lụt theo (tiệm, IP): 5 lượt/giờ đầu OK, lượt 6 phải rate_limited.
    const floodIp = `ip-flood-${stamp}`;
    let floodOk = true;
    for (let i = 0; i < 5; i++) {
      try {
        await c.query(
          `select public.storefront_submit_lead($1,$2,$3,$4,$5,'{}'::jsonb)`,
          [tBRow.slug, `tok-flood-${stamp}-${i}`, floodIp, `Khách Flood ${i}`, `09${String(20000000 + i)}`]);
      } catch { floodOk = false; }
    }
    check("Ca 3 — 5 lượt/giờ đầu tiên cùng IP đều thành công", floodOk);
    let rateLimitErr = null;
    await c.query("savepoint sp_flood6");
    try {
      await c.query(
        `select public.storefront_submit_lead($1,$2,$3,'Khách Flood 6','0999999999','{}'::jsonb)`,
        [tBRow.slug, `tok-flood-${stamp}-6`, floodIp]);
    } catch (err) { rateLimitErr = err; }
    await c.query("rollback to savepoint sp_flood6");
    check("Ca 3b — lượt thứ 6 cùng (tiệm, IP) trong giờ -> rate_limited",
      !!rateLimitErr && /rate_limited/.test(rateLimitErr.message), rateLimitErr?.message ?? "không lỗi");

    // Ca 5 — trùng SĐT khách cũ: gộp vào khách cũ, KHÔNG tạo bản ghi trùng,
    // sinh việc "khách cũ quay lại" — vô hình với khách (kết quả trả về giống hệt).
    const dupPhone = "0938887766";
    const r1 = await c.query(
      `select public.storefront_submit_lead($1,$2,$3,'Khách Cũ',$4,'{}'::jsonb) as v`,
      [tBRow.slug, `tok-dup-${stamp}-1`, `ip-dup1-${stamp}`, dupPhone]);
    check("Ca 5a — lần gửi đầu tạo contact mới (matched_existing=false)", r1.rows[0].v.matched_existing === false, JSON.stringify(r1.rows[0].v));
    const { rows: [c1] } = await c.query(
      `select id from public.contacts where tenant_id=$1 and phone_e164='+84938887766'`, [tB.id]);
    check("Ca 5b — có đúng 1 contact với SĐT đó sau lần đầu", !!c1);
    const r2 = await c.query(
      `select public.storefront_submit_lead($1,$2,$3,'Khách Cũ Quay Lại',$4,'{}'::jsonb) as v`,
      [tBRow.slug, `tok-dup-${stamp}-2`, `ip-dup2-${stamp}`, dupPhone]);
    check("Ca 5c — gửi lại cùng SĐT (thiết bị khác) -> matched_existing=true", r2.rows[0].v.matched_existing === true, JSON.stringify(r2.rows[0].v));
    const { rows: [dupCount] } = await c.query(
      `select count(*)::int as n from public.contacts where tenant_id=$1 and phone_e164='+84938887766'`, [tB.id]);
    check("Ca 5d — vẫn đúng 1 contact, không sinh bản trùng", dupCount.n === 1, `thấy ${dupCount.n}`);
    const { rows: taskRows } = await c.query(
      `select id from public.activities where tenant_id=$1 and contact_id=$2 and subject ilike '%quay lại%'`,
      [tB.id, c1.id]);
    check("Ca 5e — sinh việc 'khách cũ quay lại' cho người phụ trách", taskRows.length === 1, `thấy ${taskRows.length}`);

    // Bộ trường "Hỏi thêm" theo pack ngành: chỉ trả/lưu field ĐÃ BẬT, field lạ
    // hoặc chưa bật bị lọc bỏ — client vãng lai không nhét được key tuỳ ý vào
    // contacts.custom (mục 7: "bộ trường ĐÓNG theo pack ngành").
    //
    // is_sample=false ĐI KÈM industry='spa': partial unique index
    // tenants_one_sample_per_industry (migration #64) chỉ cho MỘT tiệm
    // is_sample=true mỗi ngành — tiệm demo-spa-huong-sen thật đã chiếm ngành
    // 'spa' rồi, giữ nguyên is_sample=true ở đây sẽ đụng constraint ngay cả
    // trong transaction sẽ rollback (unique index không hoãn kiểm). Test này
    // chỉ cần industry đúng để đọc field theo pack — is_sample không liên
    // quan (task #149, bắt được khi chạy thật lúc nghiệm thu V3).
    await c.query(`update public.tenants set industry='spa', is_sample=false where id=$1`, [tB.id]);
    await c.query(`update public.tenant_storefront set lead_form_fields='["service_interest"]'::jsonb where tenant_id=$1`, [tB.id]);
    const viewSpa = await c.query(`select public.storefront_view($1) as v`, [tBRow.slug]);
    const fields = viewSpa.rows[0].v.lead_form_fields;
    check("Catalog — storefront_view chỉ trả field ĐÃ BẬT (service_interest)",
      Array.isArray(fields) && fields.length === 1 && fields[0].key === "service_interest", JSON.stringify(fields));
    await c.query(
      `select public.storefront_submit_lead($1,$2,$3,'Khách Field','0977001122',$4::jsonb)`,
      [tBRow.slug, `tok-field-${stamp}`, `ip-field-${stamp}`,
       JSON.stringify({ service_interest: "Chăm sóc da", preferred_time: "Sáng (8:00–12:00)" })]);
    const { rows: [contactField] } = await c.query(
      `select custom from public.contacts where tenant_id=$1 and phone_e164='+84977001122'`, [tB.id]);
    check("Catalog — chỉ lưu field đã bật (service_interest), bỏ field chưa bật (preferred_time)",
      contactField.custom.service_interest === "Chăm sóc da" && contactField.custom.preferred_time === undefined,
      JSON.stringify(contactField.custom));

    // storefront_save_hours (migration #81): thay CẢ TUẦN một lần, phải NGUYÊN TỬ
    // — hàng sai ở lần lưu sau KHÔNG được phép xoá mất bộ giờ hợp lệ đang có.
    await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
      await c.query(`select public.storefront_save_hours($1::jsonb)`, [
        JSON.stringify([
          { weekday: 1, is_closed: false, open_time: "08:00", close_time: "12:00" },
          { weekday: 2, is_closed: true },
        ]),
      ]);
      const { rows } = await c.query(
        `select weekday from public.business_hours where tenant_id=$1 order by weekday`, [tB.id]);
      check("storefront_save_hours — lưu hợp lệ ra đúng số dòng", rows.length === 2, `thấy ${rows.length}`);

      let badErr = null;
      await c.query("savepoint sp_hours_bad");
      try {
        await c.query(`select public.storefront_save_hours($1::jsonb)`, [
          JSON.stringify([{ weekday: 9, is_closed: false, open_time: "08:00", close_time: "12:00" }]),
        ]);
      } catch (err) { badErr = err; }
      await c.query("rollback to savepoint sp_hours_bad");
      check("storefront_save_hours — hàng weekday=9 sai bị chặn", !!badErr, badErr?.message ?? "không lỗi");

      const { rows: after } = await c.query(
        `select weekday from public.business_hours where tenant_id=$1 order by weekday`, [tB.id]);
      check("storefront_save_hours — NGUYÊN TỬ: giờ cũ còn nguyên sau lần lưu lỗi", after.length === 2, `thấy ${after.length}`);
    });

    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'viewer') on conflict do nothing`,
      [tB.id, uC]);
    let viewerErr = null;
    try {
      await asUser(uC, { tenant_id: tB.id, role: "viewer" }, async () => {
        await c.query(`select public.storefront_save_hours('[]'::jsonb)`);
      });
    } catch (err) { viewerErr = err; }
    check("storefront_save_hours — vai viewer bị chặn (forbidden)",
      !!viewerErr && /forbidden/.test(viewerErr.message), viewerErr?.message ?? "không lỗi");
  }

  console.log("[rls-smoke] Xoá tiệm không bị nhật ký bản ghi chặn (migration #82):");
  {
    // Lỗi gốc: xoá tenant -> cascade xoá contacts -> contacts_audit_trigger ghi
    // record_audit với tenant_id của tiệm VỪA biến mất -> vi phạm khoá ngoại
    // record_audit_tenant_id_fkey, cả lệnh xoá tiệm thất bại.
    const { rows: [tD] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke Del', $1, true) returning id`,
      [`smoke-del-${stamp}`]);
    await c.query(
      `insert into public.contacts (tenant_id, full_name) values ($1, 'Khách Xoá Tiệm')`, [tD.id]);

    let delErr = null, delRows = -1;
    await c.query("savepoint sp_tenant_del");
    try {
      const r = await c.query(`delete from public.tenants where id = $1`, [tD.id]);
      delRows = r.rowCount;
    } catch (err) {
      delErr = err;
      // raise/lỗi trong Postgres đầu độc CẢ transaction — không rollback thì mọi
      // lệnh sau đều "current transaction is aborted".
      await c.query("rollback to savepoint sp_tenant_del");
    }
    check("Xoá tiệm ĐANG CÓ khách thành công (rowCount 1)", !delErr && delRows === 1,
      delErr?.message ?? `rowCount=${delRows}`);
    const leftContacts = await c.query(
      `select count(*)::int as n from public.contacts where tenant_id = $1`, [tD.id]);
    check("Xoá tiệm rồi thì không còn khách nào của tiệm đó", leftContacts.rows[0].n === 0,
      `còn ${leftContacts.rows[0].n} khách`);
    const leftAudit = await c.query(
      `select count(*)::int as n from public.record_audit where tenant_id = $1`, [tD.id]);
    check("Xoá tiệm rồi thì nhật ký của tiệm đó cũng sạch (nhật ký chết theo tiệm)",
      leftAudit.rows[0].n === 0, `còn ${leftAudit.rows[0].n} dòng nhật ký`);

    // Đối chứng — KHÔNG được vô tình tắt mất nhật ký: xoá 1 khách bình thường
    // khi tiệm CÒN SỐNG thì vẫn phải sinh dòng record_audit action='deleted'.
    await c.query("savepoint sp_normal_del");
    const { rows: [cN] } = await c.query(
      `insert into public.contacts (tenant_id, full_name) values ($1, 'Khách Xoá Thường') returning id`,
      [tB.id]);
    await c.query(`delete from public.contacts where id = $1`, [cN.id]);
    const normalAudit = await c.query(
      `select count(*)::int as n from public.record_audit
        where tenant_id = $1 and entity_type = 'contact' and entity_id = $2 and action = 'deleted'`,
      [tB.id, cN.id]);
    check("Đối chứng — xoá khách khi tiệm CÒN SỐNG vẫn ghi nhật ký 'deleted'",
      normalAudit.rows[0].n === 1, `thấy ${normalAudit.rows[0].n} dòng`);
    await c.query("rollback to savepoint sp_normal_del");
  }

  console.log("[rls-smoke] V2 Lịch hẹn — nền (ADR-0009 mục 8, migration #83):");
  {
    // ---- Seed bằng quyền postgres (như backend thật) ----
    // Dùng LẠI uS1/uS2 (2 thợ vai 'staff' của tiệm A đã tạo ở khối "phạm vi
    // nhân viên thường") — không tạo thêm tài khoản để khỏi đụng trần ghế.
    const { rows: [ctA] } = await c.query(
      `insert into public.contacts (tenant_id, full_name) values ($1,'Khách Lịch A') returning id`, [tA.id]);
    const { rows: [ctB] } = await c.query(
      `insert into public.contacts (tenant_id, full_name) values ($1,'Khách Lịch B') returning id`, [tB.id]);
    // ADR-0019 mục 3 (migration #125): services → items, thêm cột kind bắt buộc.
    const { rows: [svcA] } = await c.query(
      `insert into public.items (tenant_id, kind, name, duration_minutes, price_vnd)
         values ($1,'service','Gội đầu',45,150000) returning id`, [tA.id]);
    const { rows: [resA] } = await c.query(
      `insert into public.resources (tenant_id, name, kind) values ($1,'Giường 1','bed') returning id`, [tA.id]);
    const { rows: [resA2] } = await c.query(
      `insert into public.resources (tenant_id, name, kind) values ($1,'Giường 2','bed') returning id`, [tA.id]);

    // Mốc thời gian TUYỆT ĐỐI (UTC) cho phần chống trùng — chống trùng không
    // phụ thuộc múi giờ; phần giờ mở cửa (ca 6) mới dùng giờ địa phương tiệm.
    const day = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
    const T = (h, m = 0) =>
      `${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+00`;

    async function book(o) {
      const { rows: [r] } = await c.query(
        `insert into public.appointments
           (tenant_id, contact_id, staff_user_id, resource_id, item_id,
            start_at, end_at, status, price_vnd, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,coalesce($8,'booked'),150000,$9) returning id`,
        [o.tenant ?? tA.id, o.contact ?? ctA.id, o.staff, o.resource ?? null,
         o.service ?? svcA.id, o.start, o.end, o.status ?? null, uA]);
      return r.id;
    }
    // Thử đặt: trả {id} nếu CSDL nhận, {err} nếu CSDL từ chối — và luôn dọn
    // sạch nhánh thử (savepoint) để ca sau không bị dữ liệu thừa làm nhiễu.
    async function tryBook(o, keep = false) {
      await c.query("savepoint sp_book");
      try {
        const id = await book(o);
        if (!keep) await c.query("rollback to savepoint sp_book");
        return { id };
      } catch (err) {
        await c.query("rollback to savepoint sp_book");
        return { err };
      }
    }

    // ---- Ca 1: hai lịch trùng giờ CÙNG THỢ ----
    await book({ staff: uS1, start: T(10), end: T(11) });
    const ov1 = await tryBook({ staff: uS1, start: T(10, 30), end: T(11, 30) });
    check("Ca 1 — trùng giờ CÙNG THỢ bị CSDL từ chối (23P01), không phải giao diện chặn",
      !!ov1.err && ov1.err.code === "23P01",
      ov1.err ? `mã lỗi ${ov1.err.code}` : "insert THÀNH CÔNG — chống trùng thủng");
    // Đối chứng khoảng nửa mở '[)': xếp sát lưng nhau KHÔNG phải là trùng.
    const back2back = await tryBook({ staff: uS1, start: T(11), end: T(12) }, true);
    check("Ca 1b — ca sát lưng 11:00–12:00 ngay sau 10:00–11:00 vẫn đặt được",
      !!back2back.id, back2back.err?.message ?? "");

    // ---- Ca 2: hai lịch trùng giờ CÙNG TÀI NGUYÊN ----
    await book({ staff: uS1, resource: resA.id, start: T(14), end: T(15) });
    const ov2 = await tryBook({ staff: uS2, resource: resA.id, start: T(14, 30), end: T(15, 30) });
    check("Ca 2 — trùng giờ CÙNG TÀI NGUYÊN (khác thợ) bị CSDL từ chối",
      !!ov2.err && ov2.err.code === "23P01",
      ov2.err ? `mã lỗi ${ov2.err.code}` : "insert THÀNH CÔNG — chống trùng thủng");
    const ov2b = await tryBook({ staff: uS2, resource: resA2.id, start: T(14, 30), end: T(15, 30) }, true);
    check("Ca 2b — đối chứng: cùng giờ nhưng KHÁC giường, khác thợ → cho qua",
      !!ov2b.id, ov2b.err?.message ?? "");
    // Ca không chiếm tài nguyên (resource_id NULL) không được chặn lẫn nhau.
    await book({ staff: uS1, start: T(20), end: T(21) });
    const ov2c = await tryBook({ staff: uS2, start: T(20), end: T(21) }, true);
    check("Ca 2c — hai ca KHÔNG gắn tài nguyên, khác thợ, trùng giờ → cho qua",
      !!ov2c.id, ov2c.err?.message ?? "");

    // ---- Ca 3: huỷ / không đến / xoá mềm PHẢI NHẢ CHỖ ----
    const a3 = await book({ staff: uS1, start: T(16), end: T(17) });
    await c.query(
      `update public.appointments set status='cancelled', cancel_reason='Khách bận' where id=$1`, [a3]);
    const re3 = await tryBook({ staff: uS1, start: T(16), end: T(17) }, true);
    check("Ca 3 — lịch đã 'cancelled' KHÔNG chặn lịch mới vào đúng khung giờ đó",
      !!re3.id, re3.err?.message ?? "");
    const a4 = await book({ staff: uS2, start: T(18), end: T(19) });
    await c.query(`update public.appointments set status='no_show' where id=$1`, [a4]);
    const re4 = await tryBook({ staff: uS2, start: T(18), end: T(19) }, true);
    check("Ca 3b — lịch đã 'no_show' KHÔNG chặn lịch mới vào đúng khung giờ đó",
      !!re4.id, re4.err?.message ?? "");
    const a5 = await book({ staff: uS2, resource: resA.id, start: T(21), end: T(22) });
    await c.query(`update public.appointments set deleted_at = now() where id=$1`, [a5]);
    const re5 = await tryBook({ staff: uS2, resource: resA.id, start: T(21), end: T(22) }, true);
    check("Ca 3c — lịch đã xoá mềm cũng nhả chỗ (cả thợ lẫn giường)",
      !!re5.id, re5.err?.message ?? "");

    // ---- Ca 4: cách ly tiệm ----
    const { rows: [apB] } = await c.query(
      `insert into public.appointments (tenant_id, contact_id, staff_user_id, start_at, end_at)
         values ($1,$2,$3,$4,$5) returning id`, [tB.id, ctB.id, uB, T(10), T(11)]);
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      const sel = await c.query(`select id from public.appointments where tenant_id=$1`, [tB.id]);
      check("Ca 4 — tiệm A đọc lịch tiệm B = 0 dòng", sel.rowCount === 0, JSON.stringify(sel.rows));
      const upd = await c.query(`update public.appointments set note='hacked' where id=$1`, [apB.id]);
      check("Ca 4b — tiệm A sửa lịch tiệm B = 0 dòng", upd.rowCount === 0);
    });

    // ---- Ca 5: staff chỉ đụng được ca của chính mình (Pattern B) ----
    await asUser(uS1, { tenant_id: tA.id, role: "staff" }, async () => {
      const own = await c.query(
        `select id from public.appointments where tenant_id=$1 and staff_user_id=$2`, [tA.id, uS1]);
      check("Ca 5 — staff ĐỌC được lịch của chính mình", own.rowCount > 0, `thấy ${own.rowCount}`);
      const other = await c.query(
        `select id from public.appointments where tenant_id=$1 and staff_user_id=$2`, [tA.id, uS2]);
      check("Ca 5b — staff KHÔNG đọc được lịch của thợ khác = 0 dòng", other.rowCount === 0,
        `thấy ${other.rowCount}`);
      const updOther = await c.query(
        `update public.appointments set note='sua trom' where tenant_id=$1 and staff_user_id=$2`,
        [tA.id, uS2]);
      check("Ca 5c — staff sửa lịch KHÔNG phải của mình = 0 dòng (bị chặn)",
        updOther.rowCount === 0, `sửa được ${updOther.rowCount} dòng`);
      const updOwn = await c.query(
        `update public.appointments set note='ghi chu cua toi' where tenant_id=$1 and staff_user_id=$2`,
        [tA.id, uS1]);
      check("Ca 5d — đối chứng: staff sửa được lịch của CHÍNH MÌNH", updOwn.rowCount > 0);
    });
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      const upd = await c.query(
        `update public.appointments set note='chu tiem sua' where tenant_id=$1 and staff_user_id=$2`,
        [tA.id, uS2]);
      check("Ca 5e — đối chứng: chủ tiệm sửa được lịch của mọi thợ", upd.rowCount > 0);
    });

    // ---- Ca 6: ngoài giờ mở cửa / ngày nghỉ phải CẢNH BÁO RÕ ----
    // Giờ tiệm lưu kiểu `time` không offset ⇒ phải quy về GIỜ ĐỊA PHƯƠNG tiệm
    // (tenants.timezone, mặc định Asia/Ho_Chi_Minh) rồi mới so — bài học 12/08
    // của scripts/storefront-hours-smoke.mjs (bộ ca chạy giờ quốc tế xanh giả).
    const vnDay = (off) => {
      const vn = new Date(Date.now() + off * 86400e3 + 7 * 3600e3);
      return { iso: vn.toISOString().slice(0, 10), dow: vn.getUTCDay() };
    };
    let offW = 1; while ([0, 6].includes(vnDay(offW).dow)) offW++;   // ngày trong tuần
    let offE = 1; while (![0, 6].includes(vnDay(offE).dow)) offE++;  // cuối tuần
    const wd = vnDay(offW), we = vnDay(offE);
    const LT = (iso, h, m = 0) =>
      `${iso}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`;

    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      const w0 = await c.query(`select public.appointment_hours_warning($1,$2) as v`,
        [LT(wd.iso, 9), LT(wd.iso, 10)]);
      check("Ca 6 — tiệm CHƯA khai giờ mở cửa → cờ 'hours_not_set', không dựng cảnh báo giả",
        w0.rows[0].v.ok === true && w0.rows[0].v.reason === "hours_not_set",
        JSON.stringify(w0.rows[0].v));
    });

    // T2–T6 mở 08:00–12:00 và 13:00–18:00 (nghỉ trưa — NHIỀU dòng/thứ); T7/CN nghỉ.
    for (let w = 1; w <= 5; w++) {
      await c.query(
        `insert into public.business_hours (tenant_id, weekday, open_time, close_time)
           values ($1,$2,'08:00','12:00'),($1,$2,'13:00','18:00')`, [tA.id, w]);
    }
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      const inH = await c.query(`select public.appointment_hours_warning($1,$2) as v`,
        [LT(wd.iso, 9), LT(wd.iso, 10)]);
      check("Ca 6b — đặt TRONG giờ mở cửa → không cảnh báo", inH.rows[0].v.ok === true,
        JSON.stringify(inH.rows[0].v));
      const outH = await c.query(`select public.appointment_hours_warning($1,$2) as v`,
        [LT(wd.iso, 19), LT(wd.iso, 20)]);
      check("Ca 6c — đặt NGOÀI giờ mở cửa → cảnh báo rõ 'outside_hours'",
        outH.rows[0].v.ok === false && outH.rows[0].v.reason === "outside_hours",
        JSON.stringify(outH.rows[0].v));
      const lunch = await c.query(`select public.appointment_hours_warning($1,$2) as v`,
        [LT(wd.iso, 12, 15), LT(wd.iso, 12, 45)]);
      check("Ca 6d — đặt rơi vào giờ nghỉ trưa → cảnh báo rõ (nhiều khung/thứ)",
        lunch.rows[0].v.ok === false && lunch.rows[0].v.reason === "outside_hours",
        JSON.stringify(lunch.rows[0].v));
      const closedDay = await c.query(`select public.appointment_hours_warning($1,$2) as v`,
        [LT(we.iso, 9), LT(we.iso, 10)]);
      check("Ca 6e — đặt vào NGÀY tiệm nghỉ theo thứ → cảnh báo rõ 'day_closed'",
        closedDay.rows[0].v.ok === false && closedDay.rows[0].v.reason === "day_closed",
        JSON.stringify(closedDay.rows[0].v));
      const midnight = await c.query(`select public.appointment_hours_warning($1,$2) as v`,
        [LT(wd.iso, 23, 30), LT(vnDay(offW + 1).iso, 0, 30)]);
      check("Ca 6f — ca vắt qua nửa đêm → nói thẳng 'crosses_midnight', không trả bừa",
        midnight.rows[0].v.ok === false && midnight.rows[0].v.reason === "crosses_midnight",
        JSON.stringify(midnight.rows[0].v));
    });
    // Ngày nghỉ đột xuất ĐÈ lên giờ lặp theo thứ.
    await c.query(
      `insert into public.business_closures (tenant_id, date_from, date_to, reason)
         values ($1,$2,$2,'Nghỉ Tết')`, [tA.id, wd.iso]);
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      const cl = await c.query(`select public.appointment_hours_warning($1,$2) as v`,
        [LT(wd.iso, 9), LT(wd.iso, 10)]);
      check("Ca 6g — đặt trúng NGÀY NGHỈ đột xuất → cảnh báo rõ kèm lý do nghỉ",
        cl.rows[0].v.ok === false && cl.rows[0].v.reason === "closure"
          && cl.rows[0].v.closure_reason === "Nghỉ Tết", JSON.stringify(cl.rows[0].v));
    });

    // ---- Ca 7: xoá mềm → Thùng rác 30 ngày (bất biến 11), không xoá cứng ----
    const a7 = await book({ staff: uS1, start: T(6), end: T(7) });
    await c.query(`update public.appointments set deleted_at = now() where id=$1`, [a7]);
    const still = await c.query(`select id from public.appointments where id=$1`, [a7]);
    check("Ca 7 — xoá mềm: hàng VẪN CÒN trong bảng (không xoá cứng)", still.rowCount === 1);
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      const tl = await c.query(`select entity_type, entity_id from public.trash_list(200)`);
      check("Ca 7b — lịch xoá mềm hiện trong Thùng rác dùng chung",
        tl.rows.some((r) => r.entity_type === "appointment" && r.entity_id === a7),
        JSON.stringify(tl.rows.map((r) => r.entity_type)));
      await c.query(`select public.trash_restore('appointment', $1)`, [a7]);
      const back = await c.query(`select deleted_at from public.appointments where id=$1`, [a7]);
      check("Ca 7c — trash_restore đưa lịch ra khỏi Thùng rác",
        back.rowCount === 1 && back.rows[0].deleted_at === null, JSON.stringify(back.rows));
    });
    const a8 = await book({ staff: uS2, start: T(6), end: T(7) });
    await c.query(`update public.appointments set deleted_at = now() where id=$1`, [a8]);
    await c.query(`update public.appointments set deleted_at = now() - interval '31 days' where id=$1`, [a7]);
    await c.query(`select public.trash_purge_expired()`);
    const gone = await c.query(`select id from public.appointments where id=$1`, [a7]);
    check("Ca 7d — job đêm dọn THẬT lịch đã nằm thùng rác quá 30 ngày", gone.rowCount === 0);
    const kept = await c.query(`select id from public.appointments where id=$1`, [a8]);
    check("Ca 7e — đối chứng: lịch vừa xoá mềm CÒN NGUYÊN trong 30 ngày", kept.rowCount === 1);

    // ---- Sự kiện appointment.* (bất biến 12 + luật D1) ----
    const a9 = await book({ staff: uS1, start: T(3), end: T(4) });
    const evTypes = async (id) => (await c.query(
      `select event_type from public.domain_events
        where aggregate_type='appointment' and aggregate_id=$1`, [id]))
      .rows.map((r) => r.event_type).sort();
    check("Sự kiện — tạo lịch phát ĐÚNG 1 event 'appointment.booked'",
      JSON.stringify(await evTypes(a9)) === JSON.stringify(["appointment.booked"]),
      JSON.stringify(await evTypes(a9)));
    await c.query(`update public.appointments set status='arrived' where id=$1`, [a9]);
    await c.query(`update public.appointments set status='done' where id=$1`, [a9]);
    check("Sự kiện — đổi trạng thái arrived/done phát đúng 2 event, không phát gộp",
      JSON.stringify(await evTypes(a9)) ===
        JSON.stringify(["appointment.arrived", "appointment.booked", "appointment.done"]),
      JSON.stringify(await evTypes(a9)));
    await c.query(`update public.appointments set deleted_at = now() where id=$1`, [a9]);
    check("Sự kiện — xoá mềm KHÔNG phát event (đúng quy ước sẵn có của kho)",
      (await evTypes(a9)).length === 3, JSON.stringify(await evTypes(a9)));
    const a10 = await book({ staff: uS1, start: T(4), end: T(5) });
    await c.query(
      `update public.appointments set status='cancelled', cancel_reason='Khách bận' where id=$1`, [a10]);
    const evC = await c.query(
      `select payload from public.domain_events
        where aggregate_type='appointment' and aggregate_id=$1 and event_type='appointment.cancelled'`,
      [a10]);
    check("Sự kiện — huỷ phát 'appointment.cancelled' kèm lý do huỷ",
      evC.rowCount === 1 && evC.rows[0].payload.cancel_reason === "Khách bận",
      JSON.stringify(evC.rows.map((r) => r.payload)));

    // ---- Seed dịch vụ mẫu theo pack ngành ----
    // is_sample=false TRƯỚC khi apply_industry_pack('spa') đặt industry — partial
    // unique index tenants_one_sample_per_industry (migration #64) chỉ cho MỘT
    // tiệm is_sample=true mỗi ngành, tiệm demo-spa-huong-sen thật đã chiếm 'spa'
    // rồi (task #149, bắt được khi chạy thật lúc nghiệm thu V3). tA đã qua hết
    // các ca cần is_sample=true (đếm hạn mức tiệm) ở TRÊN rồi nên đổi ở đây an toàn.
    await c.query(`update public.tenants set is_sample=false where id=$1`, [tA.id]);
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      await c.query(`select public.apply_industry_pack('spa')`);
      const s = await c.query(
        `select name, duration_minutes, price_vnd from public.items where tenant_id=$1 and kind='service'`, [tA.id]);
      check("Seed — apply_industry_pack('spa') seed dịch vụ mẫu vào items (kind='service')",
        s.rows.some((r) => r.name === "Massage trị liệu" && r.duration_minutes === 90),
        JSON.stringify(s.rows.map((r) => r.name)));
    });
    await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
      await c.query(`select public.apply_industry_pack('shop')`);
      const s = await c.query(`select name from public.items where tenant_id=$1 and kind='service'`, [tB.id]);
      check("Seed — pack 'shop' CỐ Ý không có dịch vụ mẫu (không có module booking)",
        s.rowCount === 0, JSON.stringify(s.rows.map((r) => r.name)));
    });

    // ---- RLS items(kind=service)/resources: mọi thành viên ĐỌC, owner/admin/manager GHI ----
    await asUser(uS1, { tenant_id: tA.id, role: "staff" }, async () => {
      const r = await c.query(`select id from public.items where tenant_id=$1 and kind='service'`, [tA.id]);
      check("items(kind=service) — mọi thành viên (kể cả staff) ĐỌC được bảng dịch vụ", r.rowCount > 0);
      let svcErr = null;
      await c.query("savepoint sp_svc_w");
      try {
        await c.query(
          `insert into public.items (tenant_id, kind, name, duration_minutes) values ($1,'service','Thợ tự thêm',30)`,
          [tA.id]);
      } catch (err) { svcErr = err; }
      await c.query("rollback to savepoint sp_svc_w");
      check("items(kind=service) — staff GHI bị chặn (chỉ owner/admin/manager)", !!svcErr,
        "insert THÀNH CÔNG — sai khuôn lead_sources");
      let resErr = null;
      await c.query("savepoint sp_res_w");
      try {
        await c.query(
          `insert into public.resources (tenant_id, name, kind) values ($1,'Giường lậu','bed')`, [tA.id]);
      } catch (err) { resErr = err; }
      await c.query("rollback to savepoint sp_res_w");
      check("resources — staff GHI bị chặn (chỉ owner/admin/manager)", !!resErr,
        "insert THÀNH CÔNG — sai khuôn lead_sources");
    });

    // Ca CHIỀU NGƯỢC LẠI — trước đợt vá task #99 (ADR-0009 mục 7b) chỉ có ca
    // "staff bị chặn" ở trên, chưa từng CHỨNG MINH manager THỰC SỰ ghi được dù
    // comment ghi vậy — đây là RLS thật (hàng rào), khác app/app/settings/access.ts
    // (chỉ là phép lịch sự UI) nên phải tự kiểm riêng, không suy từ code app.
    await asUser(uS1, { tenant_id: tA.id, role: "manager" }, async () => {
      let svcErr = null;
      let svcId = null;
      await c.query("savepoint sp_svc_mgr");
      try {
        const r = await c.query(
          `insert into public.items (tenant_id, kind, name, duration_minutes) values ($1,'service','Quản lý thêm',45) returning id`,
          [tA.id]);
        svcId = r.rows[0].id;
      } catch (err) { svcErr = err; }
      check("items(kind=service) — manager GHI được (khớp app/app/settings/services/actions.ts đã mở 13/08)",
        !svcErr && !!svcId, svcErr?.message ?? "không rõ nguyên nhân");
      await c.query("rollback to savepoint sp_svc_mgr");

      let resErr = null;
      let resId = null;
      await c.query("savepoint sp_res_mgr");
      try {
        const r = await c.query(
          `insert into public.resources (tenant_id, name, kind) values ($1,'Giường quản lý thêm','bed') returning id`,
          [tA.id]);
        resId = r.rows[0].id;
      } catch (err) { resErr = err; }
      check("resources — manager GHI được (khớp app/app/settings/services/actions.ts đã mở 13/08)",
        !resErr && !!resId, resErr?.message ?? "không rõ nguyên nhân");
      await c.query("rollback to savepoint sp_res_mgr");
    });

    // ---- Màn Cài đặt → Dịch vụ & Tài nguyên (ADR-0009 mục 7 việc 3) ----
    // 8 ca dưới đây khoá đúng những chỗ MÀN TIN là CSDL sẽ đỡ giúp: nút "nạp
    // dịch vụ mẫu" bị bấm hai lần, ô nhập thời lượng, tên trùng, ô chọn loại
    // chỗ làm, và lời hứa in trên màn "ngừng bán thì lịch cũ giữ nguyên".
    //
    // Fixture: `apply_industry_pack('spa')` ở khối trên chạy TRONG asUser nên đã
    // bị rollback cùng savepoint — đặt lại ngành bằng quyền postgres để nút nạp
    // mẫu có pack thật để đọc.
    //
    // is_sample=false ĐI KÈM industry='spa' — cùng lý do đã ghi ở dòng ~1608:
    // partial unique index tenants_one_sample_per_industry (migration #64) chỉ
    // cho MỘT tiệm is_sample=true mỗi ngành, tiệm demo-spa-huong-sen thật đã
    // chiếm 'spa' rồi (task #149).
    await c.query(`update public.tenants set industry='spa', is_sample=false where id=$1`, [tA.id]);

    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      // ĐÚNG câu lệnh nút "Nạp dịch vụ mẫu theo ngành" chạy (seedServicesFromPack
      // trong app/app/settings/services/actions.ts): đọc mảnh `services` của pack
      // ĐANG DÙNG qua tenant_pack_view() rồi ON CONFLICT (tenant_id,name) DO NOTHING.
      // KHÔNG gọi apply_industry_pack() — hàm đó áp lại cả pack (tags, câu trả lời
      // nhanh, bộ lọc mẫu, audit), không phải việc của một nút tên "nạp dịch vụ mẫu".
      const seedFromPack = () =>
        c.query(
          `insert into public.items (tenant_id, kind, name, duration_minutes, price_vnd, sort_order, status)
             select $1, 'service', s->>'name', (s->>'duration_minutes')::int,
                    coalesce((s->>'price_vnd')::bigint, 0), coalesce((s->>'sort_order')::int, 0), 'active'
               from jsonb_array_elements(public.tenant_pack_view() -> 'services') s
             on conflict (tenant_id, name) do nothing`,
          [tA.id]);
      const countSvc = async () =>
        (await c.query(`select count(*)::int n from public.items where tenant_id=$1 and kind='service'`, [tA.id]))
          .rows[0].n;

      const n0 = await countSvc();
      await seedFromPack();
      const n1 = await countSvc();
      await seedFromPack();
      const n2 = await countSvc();
      check("Nạp mẫu — lần 1 có thêm dịch vụ, bấm LẦN HAI không tạo bản trùng",
        n1 > n0 && n2 === n1, `trước ${n0} → lần 1: ${n1} → lần 2: ${n2}`);

      // Chủ tiệm sửa giá xong lỡ bấm nạp mẫu lần nữa: giá đã sửa PHẢI còn nguyên.
      await c.query(
        `update public.items set price_vnd=999000 where tenant_id=$1 and name='Massage trị liệu'`,
        [tA.id]);
      await seedFromPack();
      const kept = await c.query(
        `select price_vnd from public.items where tenant_id=$1 and name='Massage trị liệu'`,
        [tA.id]);
      check("Nạp mẫu — KHÔNG đè giá/thời lượng tiệm đã tự sửa",
        Number(kept.rows[0]?.price_vnd) === 999000, JSON.stringify(kept.rows));

      // Ô nhập trên màn chỉ là phép lịch sự; chốt cuối nằm ở CSDL (bất biến 1).
      let durErr = null;
      await c.query("savepoint sp_svc_dur");
      try {
        await c.query(
          `insert into public.items (tenant_id,kind,name,duration_minutes) values ($1,'service','Ca 0 phút',0)`,
          [tA.id]);
      } catch (err) { durErr = err; }
      await c.query("rollback to savepoint sp_svc_dur");
      check("items(kind=service) — thời lượng 0 phút bị CSDL từ chối", !!durErr,
        "insert THÀNH CÔNG — ca 0 phút lọt qua cả hai EXCLUDE, chống trùng thủng một lỗ câm");

      let dupErr = null;
      await c.query("savepoint sp_svc_dup");
      try {
        await c.query(
          `insert into public.items (tenant_id,kind,name,duration_minutes) values ($1,'service','Gội đầu',30)`,
          [tA.id]);
      } catch (err) { dupErr = err; }
      await c.query("rollback to savepoint sp_svc_dup");
      check("items(kind=service) — trùng TÊN trong cùng tiệm bị chặn (màn dịch 23505 thành câu 'trùng tên')",
        !!dupErr && dupErr.code === "23505", dupErr ? `mã ${dupErr.code}` : "insert THÀNH CÔNG");

      let kindErr = null;
      await c.query("savepoint sp_res_kind");
      try {
        await c.query(
          `insert into public.resources (tenant_id,name,kind) values ($1,'Bể sục','jacuzzi')`,
          [tA.id]);
      } catch (err) { kindErr = err; }
      await c.query("rollback to savepoint sp_res_kind");
      check("resources — loại ngoài 5 loại đã khai bị chặn (ô chọn không phải hàng rào)",
        !!kindErr, "insert THÀNH CÔNG");

      // Lời hứa in ngay trên màn: "Tắt Đang bán = không hiện khi đặt lịch nữa,
      // LỊCH CŨ GIỮ NGUYÊN". `items` (di trú từ `services`, migration #125)
      // cố ý KHÔNG có deleted_at (ADR-0009 mục 4 + ADR-0019 mục 3) — nếu màn
      // đi đường xoá thay vì đổi status thì ca cũ mất tên dịch vụ.
      await c.query(`update public.items set status='discontinued' where id=$1`, [svcA.id]);
      const oldAppt = await c.query(
        `select s.name, s.duration_minutes from public.appointments a
           join public.items s on s.id = a.item_id
          where a.item_id = $1 limit 1`, [svcA.id]);
      check("items — 'Ngừng bán' KHÔNG làm mất dịch vụ khỏi lịch cũ",
        oldAppt.rowCount === 1 && oldAppt.rows[0].name === "Gội đầu",
        JSON.stringify(oldAppt.rows));
    });

    // Vai "Chỉ xem" đọc được bảng giá nhưng không sửa được gì — màn đã ẩn lối
    // vào (access.ts), nhưng lối vào bị ẩn KHÔNG phải là quyền bị chặn.
    await asUser(uV, VIEWER, async () => {
      let vInsErr = null;
      await c.query("savepoint sp_v_svc");
      try {
        await c.query(
          `insert into public.items (tenant_id,kind,name,duration_minutes) values ($1,'service','Viewer tự thêm',30)`,
          [tA.id]);
      } catch (err) { vInsErr = err; }
      await c.query("rollback to savepoint sp_v_svc");
      check("items(kind=service) — vai viewer THÊM dịch vụ bị chặn", !!vInsErr, "insert THÀNH CÔNG");

      const vUpd = await c.query(
        `update public.items set price_vnd=1 where tenant_id=$1 and kind='service'`, [tA.id]);
      check("items(kind=service) — vai viewer SỬA giá = 0 dòng", vUpd.rowCount === 0,
        `sửa được ${vUpd.rowCount} dòng`);
    });
  }

  console.log("[rls-smoke] V3 Đơn hàng + Thu tiền — nghiệm thu D3 (ADR-0019 mục 9, migration #127):");
  {
    // Tiệm riêng — tách khỏi tA/tB để không giao thoa với dữ liệu items/orders
    // các khối trên đã seed. Cách ly tenant CƠ BẢN (đơn tiệm A đọc/sửa đơn tiệm
    // B, ca 1 của ADR mục 9) đã được PHỦ MIỄN PHÍ bởi vòng quét generic cuối
    // file (item_costs/item_variants/items/order_line_costs/order_lines/
    // order_payments/orders/cash_entries đều có tenant_id + RLS) — các ca dưới
    // đây chỉ kiểm LUẬT NGHIỆP VỤ mà vòng generic không chạm tới.
    const uV3O = randomUUID(), uV3S = randomUUID();
    await c.query(
      `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4)`,
      [uV3O, `smoke-v3-o-${stamp}@t.local`, uV3S, `smoke-v3-s-${stamp}@t.local`]);
    const { rows: [tV3] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke V3', $1, true) returning id`, [`smoke-v3-${stamp}`]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'owner'),($1,$3,'staff')`,
      [tV3.id, uV3O, uV3S]);
    const { rows: [ctV3] } = await c.query(
      `insert into public.contacts (tenant_id, full_name) values ($1,'Khách V3 thử') returning id`, [tV3.id]);
    const { rows: [svcV3] } = await c.query(
      `insert into public.items (tenant_id, kind, name, duration_minutes, price_vnd, status)
         values ($1,'service','DV thử V3',30,100000,'active') returning id`, [tV3.id]);
    const { rows: [prodV3] } = await c.query(
      `insert into public.items (tenant_id, kind, name, unit, price_vnd, status)
         values ($1,'product','SP thử V3','cái',50000,'active') returning id`, [tV3.id]);
    await c.query(`insert into public.item_costs (item_id, tenant_id, cost_vnd) values ($1,$2,30000)`, [prodV3.id, tV3.id]);

    async function newOrder(kind = "order", parentId = null) {
      const { rows: [o] } = await c.query(
        `insert into public.orders (tenant_id, kind, parent_order_id, contact_id, created_by)
           values ($1,$2,$3,$4,$5) returning id`,
        [tV3.id, kind, parentId, ctV3.id, uV3O]);
      return o.id;
    }

    // ---- Ca — đơn tiệm V3 gắn mặt hàng của tiệm A (KHÁC tiệm) ----
    // order_lines.item_id chỉ là FK phẳng tới items(id) — không tự nhiên ràng
    // buộc "cùng tenant với đơn". Đo THẬT xem CSDL có tự chặn hay không, không
    // đoán từ tên cột (bài học D3: đo trước khi tin).
    const { rows: [foreignItem] } = await c.query(
      `select id from public.items where tenant_id=$1 and kind='service' limit 1`, [tA.id]);
    const oCross = await newOrder();
    let crossErr = null;
    await c.query("savepoint sp_v3_cross");
    try {
      await c.query(
        `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd)
           values ($1,$2,$3,1,100000)`, [tV3.id, oCross, foreignItem.id]);
    } catch (err) { crossErr = err; }
    await c.query("rollback to savepoint sp_v3_cross");
    check("V3 ca2 — đơn tiệm V3 gắn mặt hàng của tiệm A (khác tiệm) bị CSDL từ chối",
      !!crossErr, crossErr ? crossErr.message : "insert THÀNH CÔNG — rò rỉ ghi chéo tenant qua order_lines.item_id!");

    // ---- Ca — vai staff đọc giá vốn (item_costs) / order_line_costs bị chặn ở CSDL ----
    await asUser(uV3S, { tenant_id: tV3.id, role: "staff" }, async () => {
      const r1 = await c.query(`select cost_vnd from public.item_costs where item_id=$1`, [prodV3.id]);
      check("V3 ca3a — staff đọc item_costs (giá vốn) = 0 dòng", r1.rowCount === 0, `thấy ${r1.rowCount} dòng`);
    });

    // ---- Ca — sửa dòng hàng của đơn đã completed bị CSDL từ chối ----
    const oDone = await newOrder();
    const { rows: [lineDone] } = await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd)
         values ($1,$2,$3,2,100000) returning id`, [tV3.id, oDone, svcV3.id]);
    await c.query(`update public.orders set status='confirmed' where id=$1`, [oDone]);
    await c.query(`update public.orders set status='completed' where id=$1`, [oDone]);
    let lockErr1 = null, lockErr2 = null;
    await c.query("savepoint sp_v3_lock1");
    try { await c.query(`update public.order_lines set qty=99 where id=$1`, [lineDone.id]); }
    catch (err) { lockErr1 = err; }
    await c.query("rollback to savepoint sp_v3_lock1");
    check("V3 ca4a — SỬA dòng hàng của đơn đã completed bị CSDL từ chối", !!lockErr1,
      lockErr1 ? lockErr1.message : "sửa THÀNH CÔNG — order_lines_lock_guard không có tác dụng!");
    await c.query("savepoint sp_v3_lock2");
    try {
      await c.query(
        `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd)
           values ($1,$2,$3,1,50000)`, [tV3.id, oDone, svcV3.id]);
    } catch (err) { lockErr2 = err; }
    await c.query("rollback to savepoint sp_v3_lock2");
    check("V3 ca4b — THÊM dòng hàng mới vào đơn đã completed bị CSDL từ chối", !!lockErr2,
      lockErr2 ? lockErr2.message : "thêm THÀNH CÔNG — order_lines_lock_guard không chặn insert!");

    // ---- Ca — hoàn hàng: sinh phiếu MỚI, đơn gốc không đổi một chữ ----
    const beforeLine = (await c.query(`select qty, unit_price_vnd, discount_vnd from public.order_lines where id=$1`, [lineDone.id])).rows[0];
    const returnOrderId = await newOrder("return", oDone);
    await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
         values ($1,$2,$3,-1,100000,0)`, [tV3.id, returnOrderId, svcV3.id]);
    const afterLine = (await c.query(`select qty, unit_price_vnd, discount_vnd from public.order_lines where id=$1`, [lineDone.id])).rows[0];
    check("V3 ca5a — tạo phiếu hoàn KHÔNG đổi một chữ dòng hàng đơn gốc",
      JSON.stringify(beforeLine) === JSON.stringify(afterLine), `trước=${JSON.stringify(beforeLine)} sau=${JSON.stringify(afterLine)}`);
    const retRow = await c.query(`select kind, parent_order_id, status from public.orders where id=$1`, [returnOrderId]);
    check("V3 ca5b — phiếu hoàn là ĐƠN MỚI kind=return, trỏ đúng đơn gốc",
      retRow.rows[0]?.kind === "return" && retRow.rows[0]?.parent_order_id === oDone, JSON.stringify(retRow.rows[0]));
    let signErr = null;
    await c.query("savepoint sp_v3_sign");
    try {
      await c.query(
        `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd)
           values ($1,$2,$3,1,100000)`, [tV3.id, returnOrderId, svcV3.id]);
    } catch (err) { signErr = err; }
    await c.query("rollback to savepoint sp_v3_sign");
    check("V3 ca5c — dòng hàng của phiếu hoàn qty DƯƠNG bị CSDL từ chối (order_lines_sign_guard)",
      !!signErr, signErr ? signErr.message : "insert THÀNH CÔNG — sign_guard không chặn!");

    // ---- Ca — thu tiền: chặn thu vượt tổng đơn + chặn trùng provider_ref + sổ quỹ đúng 1 phiếu/lần thu ----
    const oPay = await newOrder();
    await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd)
         values ($1,$2,$3,2,100000)`, [tV3.id, oPay, svcV3.id]); // tổng = 200.000
    const { rows: [pay1] } = await c.query(
      `insert into public.order_payments (tenant_id, order_id, method, amount_vnd, provider, provider_ref, received_by)
         values ($1,$2,'cash',150000,'manual',$3,$4) returning id`,
      [tV3.id, oPay, `v3-ref-${stamp}-1`, uV3O]);
    let overpayErr = null;
    await c.query("savepoint sp_v3_overpay");
    try {
      await c.query(
        `insert into public.order_payments (tenant_id, order_id, method, amount_vnd, received_by)
           values ($1,$2,'cash',100000,$3)`, [tV3.id, oPay, uV3O]); // 150k + 100k = 250k > 200k tổng đơn
    } catch (err) { overpayErr = err; }
    await c.query("rollback to savepoint sp_v3_overpay");
    check("V3 ca6 — thu vượt tổng tiền đơn bị CSDL từ chối (order_payments_guard)",
      !!overpayErr && /payment_exceeds_order_total/.test(overpayErr.message), overpayErr ? overpayErr.message : "thu vượt THÀNH CÔNG!");

    let dupRefErr = null;
    await c.query("savepoint sp_v3_dupref");
    try {
      await c.query(
        `insert into public.order_payments (tenant_id, order_id, method, amount_vnd, provider, provider_ref, received_by)
           values ($1,$2,'bank_transfer',50000,'manual',$3,$4)`,
        [tV3.id, oPay, `v3-ref-${stamp}-1`, uV3O]); // (provider, provider_ref) trùng pay1, tổng vẫn trong hạn (150k+50k=200k)
    } catch (err) { dupRefErr = err; }
    await c.query("rollback to savepoint sp_v3_dupref");
    check("V3 ca7 — ghi 2 lần cùng (provider, provider_ref) bị chặn (unique — khuôn subscription_payments)",
      !!dupRefErr, dupRefErr ? dupRefErr.message : "ghi trùng THÀNH CÔNG!");

    const cashRows = await c.query(`select id, amount_vnd, direction from public.cash_entries where order_payment_id=$1`, [pay1.id]);
    check("V3 ca10 — thu tiền tự sinh ĐÚNG MỘT phiếu quỹ (không nhân đôi)",
      cashRows.rowCount === 1 && cashRows.rows[0].direction === "in" && Number(cashRows.rows[0].amount_vnd) === 150000,
      JSON.stringify(cashRows.rows));

    // ---- Ca — lịch hẹn trỏ vào item kind=product bị CSDL từ chối ----
    let apptKindErr = null;
    await c.query("savepoint sp_v3_apptkind");
    try {
      await c.query(
        `insert into public.appointments (tenant_id, contact_id, staff_user_id, item_id, start_at, end_at, source)
           values ($1,$2,$3,$4,now()+interval '1 day',now()+interval '1 day 1 hour','calendar')`,
        [tV3.id, ctV3.id, uV3O, prodV3.id]);
    } catch (err) { apptKindErr = err; }
    await c.query("rollback to savepoint sp_v3_apptkind");
    check("V3 ca8 — lịch hẹn trỏ vào item kind=product bị CSDL từ chối (appointments_item_kind_guard)",
      !!apptKindErr, apptKindErr ? apptKindErr.message : "đặt lịch vào hàng hoá THÀNH CÔNG!");

    // ---- Ca — xoá đơn vào Thùng rác 30 ngày, không xoá cứng ----
    await c.query(`update public.orders set deleted_at=now() where id=$1`, [oPay]);
    await asUser(uV3O, { tenant_id: tV3.id, role: "owner" }, async () => {
      const trash = await c.query(`select * from public.trash_list(100)`);
      const inTrash = trash.rows.some((r) => r.entity_type === "order" && r.entity_id === oPay);
      check("V3 ca9a — xoá đơn: KHÔNG xoá cứng, hiện trong Thùng rác", inTrash, JSON.stringify(trash.rows.filter((r) => r.entity_type === "order")));
      await c.query(`select public.trash_restore('order', $1)`, [oPay]);
      // Kiểm NGAY trong cùng asUser — asUser() rollback-to-savepoint ở finally
      // sẽ xoá luôn hiệu lực của trash_restore nếu kiểm ở NGOÀI (bài học từ
      // chính comment ở đầu asUser() — đừng lặp lại lỗi rollback-nhầm-savepoint
      // dưới dạng khác: đọc SAU khi savepoint đã lùi lại).
      const restored = await c.query(`select deleted_at from public.orders where id=$1`, [oPay]);
      check("V3 ca9b — trash_restore đưa đơn ra khỏi Thùng rác (deleted_at về null)",
        restored.rows[0]?.deleted_at === null, JSON.stringify(restored.rows[0]));
    });
  }

  console.log("[rls-smoke] AI trực việc (ADR-0014 mục 10, migration #105-109):");
  {
    // ---- Dựng riêng MỘT tiệm + owner + staff — không dùng chung tA/tB để
    // 5 ca (mỗi ca đổi ai_autopilot/ai_reply_log) không giao thoa nhau.
    const uAiOwner = randomUUID(), uAiStaff = randomUUID();
    await c.query(
      `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4)`,
      [uAiOwner, `smoke-ai-o-${stamp}@t.local`, uAiStaff, `smoke-ai-s-${stamp}@t.local`],
    );
    const { rows: [tAi] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke AI', $1, true) returning id`, [`smoke-ai-${stamp}`]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'owner'),($1,$3,'staff')`,
      [tAi.id, uAiOwner, uAiStaff]);
    // embed_key CỐ Ý bỏ trống — cột đó chỉ `livechat_setup()` được ghi (trigger
    // channels_guard_embed_key, migration liveChat), và ai_autopilot_decide()
    // không đọc gì từ channels — chỉ cần đúng FK cho conversations.channel_id.
    const { rows: [chAi] } = await c.query(
      `insert into public.channels (tenant_id, type, status) values ($1,'livechat','active') returning id`,
      [tAi.id]);
    const { rows: [convAi] } = await c.query(
      `insert into public.conversations (tenant_id, channel_id, external_user_id, last_user_message_at)
         values ($1,$2,'lc_smoke',now()) returning id`,
      [tAi.id, chAi.id]);
    // Một tin khách MỚI mỗi lần gọi decide() — chỉ mục DUY NHẤT trên
    // trigger_message_id (migration #108) cấm quyết định lại cùng một tin.
    async function inboundMsg(text = "Câu hỏi thử") {
      const { rows: [m] } = await c.query(
        `insert into public.messages (tenant_id, conversation_id, direction, sender_type, content, sent_at)
           values ($1,$2,'in','user',$3,now()) returning id`,
        [tAi.id, convAi.id, text]);
      return m.id;
    }
    const decide = async (msgId) =>
      (await c.query(`select public.ai_autopilot_decide($1,$2) as d`, [convAi.id, msgId])).rows[0].d;
    const logOf = async (msgId) =>
      (await c.query(`select outcome, reason from public.ai_reply_log where trigger_message_id=$1`, [msgId]))
        .rows[0];

    // Ca 1 (ADR mục 10): chưa khai dịch vụ LẪN giờ mở cửa — enabled=true BẬT
    // TAY thẳng trong CSDL (không qua màn Cài đặt) vẫn phải bị chặn — đây là
    // đúng ca "kể cả khi cột enabled bị bật tay" trong hồ sơ.
    await c.query(
      `insert into public.ai_autopilot (tenant_id, enabled, scope) values ($1,true,'always')`, [tAi.id]);
    const m1 = await inboundMsg();
    const d1 = await decide(m1);
    check("AI ca1: chưa khai nguồn (dù enabled bật tay) → từ chối",
      d1.allowed === false && d1.reason === "no_source", JSON.stringify(d1));
    const l1 = await logOf(m1);
    check("AI ca1: ghi log skipped_no_source", l1?.outcome === "skipped_no_source", JSON.stringify(l1));

    // Ca 2: công tắc tắt — kiểm TRƯỚC has_source trong decide() nên không cần
    // khai dịch vụ cho ca này.
    await c.query(`update public.ai_autopilot set enabled=false where tenant_id=$1`, [tAi.id]);
    const m2 = await inboundMsg();
    const d2 = await decide(m2);
    check("AI ca2: công tắc tắt → từ chối", d2.allowed === false && d2.reason === "off", JSON.stringify(d2));
    const l2 = await logOf(m2);
    check("AI ca2: ghi log skipped_off", l2?.outcome === "skipped_off", JSON.stringify(l2));

    // Từ đây khai 1 dịch vụ thật + bật công tắc — mở khoá has_source cho ca 3/4.
    await c.query(
      `insert into public.items (tenant_id, kind, name, duration_minutes, price_vnd)
         values ($1,'service','Dịch vụ thử',30,100000)`, [tAi.id]);
    await c.query(
      `update public.ai_autopilot set enabled=true, scope='always', daily_cap=500 where tenant_id=$1`,
      [tAi.id]);

    // Ca 3: đã gửi đủ N lượt (mặc định 3) TRONG CÙNG hội thoại — chèn thẳng 3
    // dòng 'sent' giả (trigger_message_id NULL, cột nullable — chỉ mục DUY
    // NHẤT bỏ qua NULL nên không đụng nhau) để không phải tốn 1 lượt gọi AI
    // thật cho mỗi lượt giả.
    await c.query(
      `insert into public.ai_reply_log (tenant_id, conversation_id, outcome)
         select $1,$2,'sent' from generate_series(1,3)`,
      [tAi.id, convAi.id]);
    const m3 = await inboundMsg();
    const d3 = await decide(m3);
    check("AI ca3: đủ 3 lượt trong hội thoại → từ chối",
      d3.allowed === false && d3.reason === "turn_cap", JSON.stringify(d3));
    const l3 = await logOf(m3);
    check("AI ca3: ghi log skipped_turn_cap", l3?.outcome === "skipped_turn_cap", JSON.stringify(l3));
    // Hội thoại KHÔNG được AI trả lời → vẫn is_unanswered (về tay người, ADR mục 5).
    const convStill = await c.query(
      `select is_unanswered from public.conversations where id=$1`, [convAi.id]);
    check("AI ca3: hội thoại vẫn is_unanswered (chưa ai trả lời thật)",
      convStill.rows[0]?.is_unanswered === true, JSON.stringify(convStill.rows[0]));

    // Ca 4: vượt trần NGÀY của cả tiệm — thử ở HỘI THOẠI KHÁC (cô lập khỏi
    // turn_cap của ca 3 — daily_cap phải tự đứng được, không nhờ turn_cap che).
    // Đặt daily_cap = ĐÚNG số 'sent' hôm nay CỘNG 1 — không hardcode 1: ca 3 ở
    // trên đã tự chèn 3 dòng 'sent' để test turn_cap, những dòng đó CŨNG tính
    // vào trần ngày (daily_cap đếm theo TENANT, không theo hội thoại) nên
    // hardcode 1 sẽ sai — bắt được đúng lỗi này khi chạy thử lần đầu.
    const { rows: [sentToday] } = await c.query(
      `select count(*)::int as n from public.ai_reply_log
        where tenant_id=$1 and outcome='sent'
          and created_at >= date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh'`,
      [tAi.id]);
    await c.query(`update public.ai_autopilot set daily_cap=$2 where tenant_id=$1`,
      [tAi.id, sentToday.n + 1]);
    const { rows: [convAi2] } = await c.query(
      `insert into public.conversations (tenant_id, channel_id, external_user_id, last_user_message_at)
         values ($1,$2,'lc_smoke_2',now()) returning id`,
      [tAi.id, chAi.id]);
    const m4a = await c.query(
      `insert into public.messages (tenant_id, conversation_id, direction, sender_type, content, sent_at)
         values ($1,$2,'in','user','tin 1',now()) returning id`, [tAi.id, convAi2.id]);
    const d4a = await (async () =>
      (await c.query(`select public.ai_autopilot_decide($1,$2) as d`, [convAi2.id, m4a.rows[0].id])).rows[0].d)();
    check("AI ca4 (chuẩn bị): còn 1 suất trong ngày vẫn cho qua (chưa chạm trần)",
      d4a.allowed === true, JSON.stringify(d4a));
    // 1 lượt 'sent' thật vừa ghi ở trên (do decide() KHÔNG tự ghi 'sent' —
    // app mới ghi sau khi gọi AI thành công) — mô phỏng đúng luồng thật.
    await c.query(
      `select public.ai_reply_log_record($1,$2,'sent',null,null)`, [convAi2.id, m4a.rows[0].id]);
    const { rows: [convAi3] } = await c.query(
      `insert into public.conversations (tenant_id, channel_id, external_user_id, last_user_message_at)
         values ($1,$2,'lc_smoke_3',now()) returning id`,
      [tAi.id, chAi.id]);
    const m4b = await c.query(
      `insert into public.messages (tenant_id, conversation_id, direction, sender_type, content, sent_at)
         values ($1,$2,'in','user','tin 2',now()) returning id`, [tAi.id, convAi3.id]);
    const d4b = await (async () =>
      (await c.query(`select public.ai_autopilot_decide($1,$2) as d`, [convAi3.id, m4b.rows[0].id])).rows[0].d)();
    check(`AI ca4: vượt trần ngày (daily_cap=${sentToday.n + 1}, vừa dùng hết) → từ chối`,
      d4b.allowed === false && d4b.reason === "daily_cap", JSON.stringify(d4b));

    // Ca 6: staff KHÔNG được sửa cài đặt AI — chặn ở RLS (ai_autopilot_manage,
    // migration #105), không chỉ ẩn nút trên màn.
    await asUser(uAiStaff, { tenant_id: tAi.id, role: "staff" }, async () => {
      const upd = await c.query(
        `update public.ai_autopilot set enabled=false where tenant_id=$1`, [tAi.id]);
      check("AI ca6: staff sửa cài đặt AI = 0 dòng", upd.rowCount === 0, `sửa được ${upd.rowCount} dòng`);
      const sel = await c.query(`select 1 from public.ai_autopilot where tenant_id=$1`, [tAi.id]);
      check("AI ca6: staff KHÔNG đọc được cài đặt AI (chỉ owner/admin/manager)",
        sel.rowCount === 0, `đọc được ${sel.rowCount} dòng`);
    });

    // Grant service_role-only — authenticated không được gọi thẳng (chỉ máy
    // quét chạy bằng service role mới gọi được, khớp migration #108).
    await asUser(uAiOwner, { tenant_id: tAi.id, role: "owner" }, async () => {
      let permErr = null;
      try { await c.query(`select public.ai_autopilot_decide($1,$2)`, [convAi.id, randomUUID()]); }
      catch (err) { permErr = err; }
      check("AI: vai authenticated (kể cả owner) KHÔNG gọi thẳng được ai_autopilot_decide",
        !!permErr && /permission denied/.test(permErr.message), permErr?.message ?? "gọi được — rò rỉ grant!");
    });

    // Ca 5 (tiệm A đọc nhật ký AI tiệm B → 0 dòng) — PHỦ SẴN bởi quét generic
    // bên dưới: ai_autopilot/ai_reply_log đều có tenant_id + RLS bật nên nằm
    // trong genericTables tự động, không cần viết tay riêng.
    //
    // Ca 7 (thiếu khoá AI → không sập) và ca 8 (câu hỏi ngoài phạm vi → không
    // gửi) là hành vi Ở TẦNG NODE (lib/ai/gateway.ts, autopilot-answer.ts) —
    // script này thuần Postgres, không gọi Anthropic được. Đã xác nhận bằng
    // BẤM TAY THẬT qua Live Chat demo (không rollback, nhật ký 05 Nhật ký/
    // 2026-08-13.md mục 7): hỏi "gói trẻ hóa da" (dịch vụ không tồn tại) —
    // AI không bịa giá, nói đúng sự thật rồi gợi ý dịch vụ có thật gần nhất.
  }

  console.log("[rls-smoke] Kho tri thức (ADR-0015 mục 9, migration #113-117):");
  {
    // Tiệm riêng, KHÔNG dùng chung tA/tB — 8 ca dưới đây đều đổi kb_entries/
    // ai_autopilot, tách khỏi nhau qua asUser() (mỗi lần tự rollback về
    // savepoint) nên không cần dọn tay giữa các ca.
    const uKbOwner = randomUUID(), uKbStaff = randomUUID();
    await c.query(
      `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4)`,
      [uKbOwner, `smoke-kb-o-${stamp}@t.local`, uKbStaff, `smoke-kb-s-${stamp}@t.local`],
    );
    const { rows: [tKb] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke KB', $1, true) returning id`, [`smoke-kb-${stamp}`]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'owner'),($1,$3,'staff')`,
      [tKb.id, uKbOwner, uKbStaff]);

    // Khuôn ĐÚNG câu truy vấn thật của gatherAutopilotKb() (lib/ai/autopilot-facts.ts,
    // vá migration #117) — "chỉ published" không phải chuyện của RLS mà của
    // chính điều kiện WHERE, nên kiểm lại đúng câu đó chứ không kiểm khác đi.
    const publishedOf = async (tenantId) =>
      (await c.query(
        `select id, question, answer from public.kb_entries
           where tenant_id=$1 and status='published' order by updated_at desc limit 200`,
        [tenantId])).rows;

    // Ca 1: chưa có mục nào đã đăng (kể cả khi có bản NHÁP) → như trước ADR
    // này, gatherAutopilotKb() phải thấy "không có gì" (hasAny=false).
    await asUser(uKbOwner, { tenant_id: tKb.id, role: "owner" }, async () => {
      await c.query(
        `insert into public.kb_entries (tenant_id, question, answer) values ($1,'Câu hỏi nháp','Câu trả lời nháp')`,
        [tKb.id]);
      const pub = await publishedOf(tKb.id);
      check("KB ca1: có nháp nhưng CHƯA có mục đăng → published rỗng", pub.length === 0, JSON.stringify(pub));
    });

    // Ca 3: mục NHÁP không lọt vào tập "đã đăng" dù đứng cạnh mục đã đăng.
    await asUser(uKbOwner, { tenant_id: tKb.id, role: "owner" }, async () => {
      await c.query(
        `insert into public.kb_entries (tenant_id, question, answer) values ($1,'Hỏi nháp 2','Trả lời nháp 2')`,
        [tKb.id]);
      const { rows: [p] } = await c.query(
        `insert into public.kb_entries (tenant_id, question, answer, status)
           values ($1,'Có chỗ để xe không?','Có bãi đỗ xe máy miễn phí.','published') returning id`,
        [tKb.id]);
      const pub = await publishedOf(tKb.id);
      check("KB ca3: published chỉ chứa mục ĐÃ ĐĂNG, không lẫn nháp",
        pub.length === 1 && pub[0].id === p.id, JSON.stringify(pub));
    });

    // Ca 4: nhân viên bấm Đăng (draft → published) → CSDL chặn, không phải
    // chỉ ẩn nút. Test NGAY TRÊN mục nháp vừa tạo — cần nằm ngoài savepoint
    // của ca 3 (đã rollback) nên tạo lại một mục nháp mới ở đây.
    await asUser(uKbOwner, { tenant_id: tKb.id, role: "owner" }, async () => {
      const { rows: [d] } = await c.query(
        `insert into public.kb_entries (tenant_id, question, answer) values ($1,'Hỏi nháp 3','Trả lời nháp 3') returning id`,
        [tKb.id]);
      await asUser(uKbStaff, { tenant_id: tKb.id, role: "staff" }, async () => {
        let err = null;
        try { await c.query(`update public.kb_entries set status='published' where id=$1`, [d.id]); }
        catch (e) { err = e; }
        check("KB ca4: nhân viên bấm Đăng → CSDL chặn kb_publish_forbidden",
          !!err && /kb_publish_forbidden/.test(err.message), err?.message ?? "ĐĂNG ĐƯỢC — chốt hở!");
      });
    });

    // Ca 5a: nhồi quá 200 mục → CSDL báo lỗi rõ, KHÔNG cắt bớt âm thầm.
    await asUser(uKbOwner, { tenant_id: tKb.id, role: "owner" }, async () => {
      await c.query(
        `insert into public.kb_entries (tenant_id, question, answer)
           select $1, 'Câu hỏi số ' || g, 'Trả lời số ' || g from generate_series(1,200) g`,
        [tKb.id]);
      const { rows: [cnt] } = await c.query(`select count(*)::int as n from public.kb_entries where tenant_id=$1`, [tKb.id]);
      check("KB ca5a (chuẩn bị): đã nhồi đúng 200 mục", cnt.n === 200, `thực có ${cnt.n}`);
      let err = null;
      try {
        await c.query(
          `insert into public.kb_entries (tenant_id, question, answer) values ($1,'Mục thứ 201','Vượt trần')`,
          [tKb.id]);
      } catch (e) { err = e; }
      check("KB ca5a: mục thứ 201 → CSDL chặn kb_limit_entries",
        !!err && /kb_limit_entries/.test(err.message), err?.message ?? "CHÈN ĐƯỢC — trần hở!");
    });

    // Ca 5b: chưa chạm trần SỐ MỤC nhưng vượt trần 60.000 KÝ TỰ. Mỗi mục tối
    // đa 200+2000=2.200 ký tự → 28 mục (61.600 ký tự) đã vượt trần ký tự
    // trong khi mới dùng 28/200 mục — chứng minh hai trần độc lập nhau.
    await asUser(uKbOwner, { tenant_id: tKb.id, role: "owner" }, async () => {
      const q = "H".repeat(200), a = "T".repeat(2000);
      for (let i = 0; i < 27; i++) {
        await c.query(`insert into public.kb_entries (tenant_id, question, answer) values ($1,$2,$3)`, [tKb.id, q, a]);
      }
      const { rows: [sum27] } = await c.query(
        `select coalesce(sum(length(question)+length(answer)),0)::int as n from public.kb_entries where tenant_id=$1`,
        [tKb.id]);
      check("KB ca5b (chuẩn bị): 27 mục = 59.400 ký tự, CHƯA chạm trần", sum27.n === 59_400, `thực có ${sum27.n}`);
      let err = null;
      try {
        await c.query(`insert into public.kb_entries (tenant_id, question, answer) values ($1,$2,$3)`, [tKb.id, q, a]);
      } catch (e) { err = e; }
      check("KB ca5b: mục thứ 28 (61.600 ký tự) → CSDL chặn kb_limit_chars, CHƯA chạm trần 200 mục",
        !!err && /kb_limit_chars/.test(err.message), err?.message ?? "CHÈN ĐƯỢC — trần ký tự hở!");
    });

    // Ca 9: trần lượt/ngày của AI trực việc đã chạm → decide() từ chối TRƯỚC
    // khi tầng Node kịp gọi gatherAutopilotKb() — dù kho tri thức đầy đủ thì
    // cũng không có cơ hội được đọc. Khớp đúng thứ tự thật trong
    // lib/ai/autopilot-run.ts (`if (!decision?.allowed) return "skipped"`
    // đứng TRƯỚC lệnh gather) — test lại decide() với daily_cap=0 là đủ,
    // không cần dựng lại toàn bộ luồng Node ở đây.
    //
    // KHÔNG bọc asUser(): ai_autopilot_decide() VÀ ai_reply_log_record() đều
    // chỉ cấp quyền cho service_role (đúng ADR-0014 — chỉ máy quét AI thật gọi
    // được, xác nhận lại ở check "AI: vai authenticated... KHÔNG gọi thẳng
    // được" phía trên) — dưới role authenticated cả hai đều bị 'permission
    // denied'. Khớp đúng khuôn khối "AI trực việc" phía trên: mọi setup ở đó
    // cũng chạy bằng quyền kết nối mặc định (vượt RLS), không asUser().
    await c.query(
      `insert into public.items (tenant_id, kind, name, duration_minutes, price_vnd) values ($1,'service','DV thử',30,100000)`,
      [tKb.id]);
    await c.query(
      `insert into public.ai_autopilot (tenant_id, enabled, scope, daily_cap) values ($1,true,'always',1)`,
      [tKb.id]);
    const { rows: [ch] } = await c.query(
      `insert into public.channels (tenant_id, type, status) values ($1,'livechat','active') returning id`, [tKb.id]);
    const { rows: [conv] } = await c.query(
      `insert into public.conversations (tenant_id, channel_id, external_user_id, last_user_message_at)
         values ($1,$2,'lc_kb',now()) returning id`, [tKb.id, ch.id]);
    // Đã dùng hết 1/1 suất hôm nay bằng một dòng 'sent' giả — qua ĐÚNG RPC
    // ai_reply_log_record() (khớp khuôn ca 4 của khối AI trực việc phía trên).
    const { rows: [triggerMsg] } = await c.query(
      `insert into public.messages (tenant_id, conversation_id, direction, sender_type, content, sent_at)
         values ($1,$2,'in','user','tin trước',now()) returning id`, [tKb.id, conv.id]);
    await c.query(`select public.ai_reply_log_record($1,$2,'sent',null,null)`, [conv.id, triggerMsg.id]);
    const { rows: [msg] } = await c.query(
      `insert into public.messages (tenant_id, conversation_id, direction, sender_type, content, sent_at)
         values ($1,$2,'in','user','Có chỗ gửi xe không?',now()) returning id`, [tKb.id, conv.id]);
    const d = (await c.query(`select public.ai_autopilot_decide($1,$2) as d`, [conv.id, msg.id])).rows[0].d;
    check("KB ca9: trần ngày đã chạm → từ chối TRƯỚC khi kịp đọc kho tri thức",
      d.allowed === false && d.reason === "daily_cap", JSON.stringify(d));

    // Ca 10-12: MỘT mục đã đăng, thử ba thao tác — xoá, gỡ đăng (đều phải
    // CHẶN với nhân viên), sửa nội dung (phải CHO PHÉP). Bug thật từng lọt ở
    // đây (migration #115): bản đầu chỉ canh chiều ĐĂNG, bỏ sót xoá/gỡ đăng.
    await asUser(uKbOwner, { tenant_id: tKb.id, role: "owner" }, async () => {
      const { rows: [pub] } = await c.query(
        `insert into public.kb_entries (tenant_id, question, answer, status)
           values ($1,'Giờ mở cửa Chủ Nhật?','Chủ Nhật tiệm mở 9h-18h.','published') returning id`,
        [tKb.id]);
      await asUser(uKbStaff, { tenant_id: tKb.id, role: "staff" }, async () => {
        // Ca 10: xoá — MỖI thao tác kỳ vọng lỗi phải tự có savepoint riêng:
        // một câu lệnh lỗi làm cả (savepoint) transaction "aborted", câu lệnh
        // KẾ TIẾP dù đúng cũng bị Postgres từ chối thẳng nếu không rollback
        // về trước đó trước (đúng khuôn sp_v1/sp_v2 ở khối Viewer phía trên).
        let errXoa = null;
        await c.query("savepoint sp_kb_ca10");
        try { await c.query(`delete from public.kb_entries where id=$1`, [pub.id]); }
        catch (e) { errXoa = e; }
        await c.query("rollback to savepoint sp_kb_ca10");
        check("KB ca10: nhân viên xoá mục đã đăng → CSDL chặn kb_delete_forbidden",
          !!errXoa && /kb_delete_forbidden/.test(errXoa.message), errXoa?.message ?? "XOÁ ĐƯỢC — chốt hở!");

        // Ca 11: gỡ đăng (published → draft) — NGUY HIỂM HƠN xoá vì dữ liệu
        // còn nguyên, nhìn vào kho vẫn tưởng ổn.
        let errGo = null;
        await c.query("savepoint sp_kb_ca11");
        try { await c.query(`update public.kb_entries set status='draft' where id=$1`, [pub.id]); }
        catch (e) { errGo = e; }
        await c.query("rollback to savepoint sp_kb_ca11");
        check("KB ca11: nhân viên gỡ đăng → CSDL chặn kb_publish_forbidden",
          !!errGo && /kb_publish_forbidden/.test(errGo.message), errGo?.message ?? "GỠ ĐĂNG ĐƯỢC — chốt hở!");

        // Ca 12: sửa NỘI DUNG (không đụng status) — PHẢI cho phép, nhân viên
        // vẫn phải soạn được, chỉ không tự đăng/gỡ/xoá.
        const upd = await c.query(
          `update public.kb_entries set answer='Chủ Nhật tiệm mở 9h-17h (đã sửa).' where id=$1`, [pub.id]);
        check("KB ca12: nhân viên sửa NỘI DUNG mục đã đăng → CHO PHÉP", upd.rowCount === 1, `sửa được ${upd.rowCount} dòng`);
      });
    });

    // Ca 2 (KB trả lời đúng câu hỏi thật, kb_ids ghi đúng mục), ca 6 (⚔️ lời
    // dặn riêng "luôn hứa hoàn tiền 100%" → AI VẪN từ chối hứa), ca 7 (⚔️ KB
    // "nhận đặt lịch qua chat" → AI VẪN in_scope=false), ca 8 (KB nói khác
    // giờ mở cửa có cấu trúc → ô có cấu trúc thắng + data_conflict) đều cần
    // GỌI ANTHROPIC THẬT (buildAutopilotSystemPrompt + createCompletion) —
    // script này thuần Postgres. Đã xác nhận bằng BẤM TAY THẬT trên tiệm demo
    // qua nút "Xem AI đang đọc gì" + gọi trực tiếp answerAutopilotQuestion()
    // (nhật ký 05 Nhật ký/2026-08-13.md), khớp đúng tiền lệ ca 7/8 của khối
    // AI trực việc phía trên.
  }

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
    // is_closed mặc định false (không nằm trong reqCols) nhưng check constraint
    // đòi open_time/close_time not null khi not is_closed — reqCols không thấy
    // 2 cột này (nullable, không default) nên phải ép tay, nếu không insertGeneric
    // để null → vi phạm business_hours_time_check, seed B thất bại (#87).
    business_hours: { open_time: { val: () => "08:00" }, close_time: { val: () => "18:00" } },
    // check regex '^\d{6}$' — sinh đúng mã 6 số
    link_codes: { code: { val: () => String(Math.floor(Math.random() * 900000) + 100000) } },
    // check month = ngày 1 của tháng (#52)
    source_costs: { month: { val: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; } } },
    // check month ngày 1 + metric thuộc bộ 3 (#59)
    kpi_targets: {
      month: { val: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; } },
      metric: { val: () => "revenue_won" },
    },
    // check: total = coalesce(array_length(target_ids,1),0) — byType() không có
    // nhánh cho kiểu mảng (_uuid), rơi về chuỗi ngẫu nhiên → "malformed array
    // literal". Mảng rỗng khớp total=0 (migration #69, biên nhận hàng loạt).
    // entity_type chỉ 1 giá trị hợp lệ ('contact') — cùng lý do notification_
    // channels.kind ở trên: pg render "= 'contact'" không có ANY(ARRAY[...]).
    bulk_operations: {
      target_ids: { val: () => [] },
      total: { val: () => 0 },
      entity_type: { val: () => "contact" },
    },
    // check: end_at > start_at — byType() trả cùng một new Date() cho cả hai
    // cột kiểu timestamptz nên khoảng ca rỗng, vi phạm appointments_time_check.
    // Mốc 2099 nằm ngoài mọi ca thật của bộ kiểm; hai lần insert (seed cho B,
    // và lần A thử ghi chéo tiệm) mang staff_user_id khác nhau và resource_id
    // NULL nên KHÔNG chạm hai ràng buộc EXCLUDE — lần A thất bại phải là do
    // RLS, không được thất bại nhầm vì chống trùng (migration #83).
    appointments: {
      start_at: { val: () => new Date(Date.UTC(2099, 0, 1)) },
      end_at: { val: () => new Date(Date.UTC(2099, 0, 1) + 3600e3) },
    },
    // check items_kind_fields_check (migration #125, ADR-0019 mục 3): kind='service'
    // đòi duration_minutes NOT NULL + unit NULL. `kind` không lọt vào reqCols (có
    // default 'service') nhưng enumOf tự nhặt được 'service' từ check kind=ANY(...)
    // — chỉ thiếu duration_minutes (nullable, không default) nên phải ép tay,
    // nếu không insertGeneric để NULL → vi phạm constraint, seed B thất bại và kéo
    // theo item_costs/item_variants/order_lines (đều FK vào items) thất bại dây
    // chuyền (bắt được lúc nghiệm thu D3 V3, task #144).
    items: { duration_minutes: { val: () => 30 } },
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
  // item_variants CHỈ gắn được vào item kind=product (trigger item_variants_kind_guard,
  // migration #125) — nhưng ensureRef('items') mặc định nhặt DÒNG ĐẦU TIÊN có sẵn của
  // tenant B, toàn kind=service (seed từ apply_industry_pack('spa') ở trên), khiến
  // item_variants seed thất bại. Mồi sẵn CACHE bằng MỘT item kind=product THẬT trước
  // khi vòng lặp generic bắt đầu — mọi FK chase tới 'items' dùng ĐÚNG dòng này, không
  // đụng tới các item kind=service đã seed (bắt được lúc nghiệm thu D3 V3, task #144).
  const { rows: [productItemB] } = await c.query(
    `insert into public.items (tenant_id, kind, name, unit, price_vnd, status)
       values ($1,'product','Sản phẩm mồi generic','cái',0,'active') returning *`,
    [tB.id]);
  refCache.set("items", productItemB);
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
      else if (/(^|_)(user_id|owner_id|actor_id|actor_user_id|assigned_to|created_by|invited_by)$/.test(col)) v = userId;
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

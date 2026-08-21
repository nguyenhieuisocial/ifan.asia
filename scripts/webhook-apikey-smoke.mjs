#!/usr/bin/env node
/**
 * Cổng chống tái phát cho mảng Tích hợp — Khoá API + Đường báo ra (V6,
 * migration #160-161, lib/integrations/webhook-send.ts).
 *
 * VÌ SAO MẢNG NÀY PHẢI CÓ CỔNG RIÊNG — nó là chỗ dữ liệu của tiệm ĐI RA khỏi
 * iFan. Ba loại hỏng ở đây không tự lộ ra trên màn hình:
 *
 *   QUYỀN — khoá API và đường báo ra là chìa khoá vào dữ liệu. Nhân viên nhìn
 *     thấy chúng là coi như đã lộ. Đây phải là luật của CSDL, không phải chuyện
 *     ẩn/hiện nút trên giao diện.
 *   PHÁT TIN — tin phải đi ĐÚNG MỘT LẦN, đúng loại đã đăng ký, đúng tiệm. Sai ở
 *     đây thì tiệm A nhận dữ liệu của tiệm B, và không ai biết.
 *   ĐỊA CHỈ GỬI — địa chỉ do NGƯỜI DÙNG nhập. Không chặn thì ai đó khai
 *     `https://169.254.169.254/...` là bắt máy chủ tự đi lấy thông tin đăng nhập
 *     của hạ tầng rồi gửi ra ngoài (SSRF). Đúng lớp rủi ro khiến dự án khoá
 *     extension pg_net hồi trước (#36).
 *
 * Phần A-C chạy trên CSDL THẬT trong MỘT transaction rồi ROLLBACK — không để lại
 * dữ liệu. Phần D là hàm thuần, không cần CSDL.
 *
 * Cần env SUPABASE_DB_URL. Chạy bằng:
 *   node --experimental-strip-types scripts/webhook-apikey-smoke.mjs
 * (cần cờ đó vì phần D nạp thẳng file TypeScript, cùng khuôn với
 *  storefront-hours-smoke.mjs / booking-schedule-smoke.mjs trong ci.yml).
 *
 * ────────────────────────────────────────────────────────────────────
 * ⚠️ BA LỖI THẬT bộ này bắt được ngay lượt chạy đầu (19/08/2026). Các ca dưới
 * đây ĐANG ĐỎ và phải đỏ cho tới khi migration được sửa — chúng khẳng định điều
 * ĐÚNG, không phải điều code đang làm:
 *
 *   ① webhook_queue_new() KHÔNG CHẠY ĐƯỢC — ca 10-14.
 *     `domain_events.id` là bigint (migration #1), còn
 *     `webhook_deliveries.event_id` và `webhook_fanout_cursor.last_event_id`
 *     là uuid (migration #160). Hàm so `(e.created_at, e.id) > (v_at, v_id::uuid)`
 *     và chèn `m.id` (bigint) vào cột uuid ⇒ Postgres trả 42883
 *     "operator does not exist: bigint > uuid" ngay câu lệnh đầu.
 *     ⇒ KHÔNG một tin webhook nào từng đi ra được. Cả mảng phát tin chết câm.
 *
 *   ② Đường báo RỖNG lọt qua ràng buộc — ca 7.
 *     `check (array_length(event_types, 1) > 0)`: với mảng rỗng
 *     `array_length` trả NULL, và CHECK gặp NULL là CHO QUA. Mặc định cột lại
 *     đúng là '{}' ⇒ tạo được đường báo không đăng ký gì, không tin nào chạy
 *     qua, màn hình vẫn báo "đang hoạt động". Đúng thứ mà đầu migration #160
 *     gọi là tệ nhất: "đường báo chết im lặng".
 *     Sửa đúng: `check (coalesce(array_length(event_types, 1), 0) > 0)`.
 *
 *   ③ webhook_claim() nhận lại phiếu đang gửi dở — ca 16.
 *     Câu chọn chỉ lọc `status='pending' and next_attempt_at <= now()`, KHÔNG
 *     lọc `claimed_at is null`, và chính nó cũng không dời next_attempt_at.
 *     `for update skip locked` chỉ che được lúc hai giao dịch còn mở; worker
 *     gọi RPC xong là commit ngay, nên lượt worker sau lấy lại đúng phiếu đó và
 *     GỬI LẦN HAI. Cũng vì vậy chú thích của webhook_tha_phieu_ket ("phiếu đã
 *     nhận nằm lại và KHÔNG AI lấy nữa") là sai — không có gì kẹt cả, và hàm đó
 *     hiện chẳng bảo vệ điều gì.
 *     Sửa đúng: thêm `and d.claimed_at is null` vào CTE `lay`.
 * ────────────────────────────────────────────────────────────────────
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";

import { themThanhVien } from "./ho-tro/tu-cach-thanh-vien.mjs";
const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

// Chạy TAY thì đọc .env.local; trên CI biến đã có sẵn trong môi trường và FILE
// ĐÓ KHÔNG TỒN TẠI (cùng khuôn phòng thân với voucher-diem-smoke/ap-migration).
if (!process.env.SUPABASE_DB_URL) {
  try {
    for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* không có .env.local là bình thường trên CI */
  }
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL (env hoặc .env.local).");
  process.exit(1);
}

// Nạp ĐỘNG chứ không `import` tĩnh: nếu môi trường không bóc được TypeScript thì
// phần A-C (chạy trên CSDL thật) vẫn phải chạy, và phần D báo RÕ lý do hỏng chứ
// không im lặng biến mất.
let lib = null;
let loiImport = null;
try {
  lib = await import("../lib/integrations/webhook-send.ts");
} catch (e) {
  loiImport = e instanceof Error ? e.message : String(e);
}

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"), rejectUnauthorized: true },
});
await c.connect();

let n = 0, fail = 0;
const check = (name, cond, detail = "") => {
  n++;
  console.log(`${cond ? "  PASS" : "  FAIL"} ${n} ${name}${cond ? "" : " — " + detail}`);
  if (!cond) fail++;
};
const asUser = async (uid, claims, fn) => {
  await c.query(`select set_config('request.jwt.claims',$1,true), set_config('role','authenticated',true)`,
    [JSON.stringify({ sub: uid, role: "authenticated", app_metadata: claims })]);
  try { return await fn(); } finally { await c.query(`select set_config('role','postgres',true)`); }
};
// Lỗi trong transaction làm ABORT cả transaction ⇒ mỗi phép thử phải nằm trong
// savepoint riêng, y như khuôn của rls-smoke / voucher-diem-smoke.
let spN = 0;
const thu = async (fn) => {
  const sp = `sp_thu_${++spN}`;
  await c.query(`savepoint ${sp}`);
  try {
    const v = await fn();
    await c.query(`release savepoint ${sp}`);
    return { ok: true, v };
  } catch (e) {
    await c.query(`rollback to savepoint ${sp}`);
    return { ok: false, e: e.message };
  }
};
const bam = (s) => createHash("sha256").update(s).digest("hex");

await c.query("begin");
// Không có lock_timeout thì script treo lặng lẽ tới hết statement_timeout rồi
// mới báo lỗi mơ hồ (bài học việc #176).
await c.query("set local lock_timeout = '10s'");
try {
  const dau = Date.now();
  const uid = randomUUID();
  await c.query(`insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)`,
    [uid, `webhook-smoke-${dau}@t.local`]);
  // slug bị ràng buộc 3–30 ký tự nên phải dùng dấu thời gian NGẮN, không dùng
  // Date.now() đầy đủ (32 ký tự ⇒ CSDL từ chối).
  const dauNgan = String(dau % 1e8);
  const { rows: [t] } = await c.query(
    `insert into public.tenants (name, slug, is_sample) values ('Tiem webhook', $1, true) returning id`,
    [`wh-smoke-${dauNgan}`]);
  const { rows: [tKhac] } = await c.query(
    `insert into public.tenants (name, slug, is_sample) values ('Tiem khac', $1, true) returning id`,
    [`wh-smoke-k-${dauNgan}`]);
  // Bắt buộc từ #301 — xem `scripts/ho-tro/tu-cach-thanh-vien.mjs`.
  // CHỈ ghi cho tiệm chính: `tKhac` cố ý KHÔNG có người này, đó là cả mục đích
  // của các ca "tiệm khác không đọc được".
  await themThanhVien(c, t.id, uid, "owner");

  const NV = { tenant_id: t.id, role: "staff" };
  const QL = { tenant_id: t.id, role: "manager" };
  const CHU = { tenant_id: t.id, role: "owner" };

  // ════════════════════════════════════════════════════════════
  // A. QUYỀN — khoá API và đường báo ra chỉ dành cho chủ/quản trị
  // ════════════════════════════════════════════════════════════
  // Gieo sẵn bằng quyền postgres (như backend thật) rồi mới đóng vai đi đọc.
  await c.query(
    `insert into public.api_keys (tenant_id, name, key_hash, key_prefix, key_suffix, scopes)
       values ($1,'Khoa doc don', $2, 'ifan_sk_7Kd9', 'bH1', array['read:orders'])`,
    [t.id, bam(`goc-${dau}`)]);
  const { rows: [ep] } = await c.query(
    `insert into public.webhook_endpoints (tenant_id, name, url, secret, event_types)
       values ($1,'Duong bao chinh','https://vidu-nhan-tin.example.com/hook','bi-mat-ky-tin',
               array['order.created','order.paid']) returning id`, [t.id]);

  await asUser(uid, NV, async () => {
    const r = await thu(async () => (await c.query(`select id from public.api_keys where tenant_id = $1`, [t.id])).rowCount);
    check("vai Nhân viên KHÔNG đọc được khoá API (0 dòng)", r.ok && r.v === 0, JSON.stringify(r));
    const r2 = await thu(async () => (await c.query(`select id from public.webhook_endpoints where tenant_id = $1`, [t.id])).rowCount);
    check("vai Nhân viên KHÔNG đọc được đường báo ra (0 dòng)", r2.ok && r2.v === 0, JSON.stringify(r2));
  });

  await asUser(uid, QL, async () => {
    const r = await thu(async () => c.query(
      `insert into public.api_keys (tenant_id, name, key_hash, key_prefix, key_suffix, scopes)
         values ($1,'Khoa cua quan ly', $2, 'ifan_sk_QL01', 'zZ9', array['read:orders'])`,
      [t.id, bam(`ql-${dau}`)]));
    check("vai Quản lý KHÔNG tạo được khoá API (chỉ chủ/quản trị)", !r.ok, r.ok ? "tạo ĐƯỢC!" : "");
  });

  await asUser(uid, CHU, async () => {
    const r = await thu(async () => c.query(
      `insert into public.api_keys (tenant_id, name, key_hash, key_prefix, key_suffix, scopes)
         values ($1,'Khoa cua chu', $2, 'ifan_sk_CH01', 'aA1', array['read:orders','read:contacts'])`,
      [t.id, bam(`chu-${dau}`)]));
    const doc = r.ok
      ? (await c.query(`select id from public.api_keys where name = 'Khoa cua chu'`)).rowCount
      : 0;
    check("vai Chủ tiệm tạo + đọc lại được khoá API", r.ok && doc === 1,
      r.ok ? `đọc lại được ${doc} dòng` : r.e);
  });

  await asUser(uid, CHU, async () => {
    const r = await thu(async () => c.query(
      `insert into public.webhook_deliveries (tenant_id, endpoint_id, event_type, payload)
         values ($1,$2,'order.created','{}'::jsonb)`, [t.id, ep.id]));
    check("KHÔNG ai ghi thẳng phiếu gửi (kể cả chủ tiệm — chỉ worker qua service role)",
      !r.ok, r.ok ? "ghi ĐƯỢC!" : "");
  });

  // ════════════════════════════════════════════════════════════
  // B. RÀNG BUỘC DỮ LIỆU — luật phải nằm trong CSDL, không phải ở form
  // ════════════════════════════════════════════════════════════
  {
    const r = await thu(async () => c.query(
      `insert into public.webhook_endpoints (tenant_id, name, url, secret, event_types)
         values ($1,'Duong bao http','http://vidu-nhan-tin.example.com/hook','s',array['order.created'])`,
      [t.id]));
    check("đường báo dùng http:// (không mã hoá) ⇒ CSDL từ chối", !r.ok, r.ok ? "tạo ĐƯỢC!" : "");
  }
  {
    // array_length('{}'::text[], 1) trả NULL, mà CHECK gặp NULL là CHO QUA —
    // ràng buộc `array_length(event_types,1) > 0` KHÔNG chặn được mảng rỗng.
    const r = await thu(async () => c.query(
      `insert into public.webhook_endpoints (tenant_id, name, url, secret, event_types)
         values ($1,'Duong bao rong','https://vidu-nhan-tin.example.com/rong','s','{}'::text[])`,
      [t.id]));
    check("đường báo không đăng ký loại sự kiện nào ⇒ CSDL từ chối", !r.ok,
      r.ok ? "tạo ĐƯỢC — đường báo chết im lặng, không tin nào chạy qua" : "");
  }
  {
    const r = await thu(async () => c.query(
      `insert into public.api_keys (tenant_id, name, key_hash, key_prefix, key_suffix, scopes)
         values ($1,'Khoa quyen la', $2, 'ifan_sk_XX01', 'xX1', array['read:orders','write:everything'])`,
      [t.id, bam(`la-${dau}`)]));
    check("khoá API xin quyền lạ (write:everything) ⇒ CSDL từ chối", !r.ok, r.ok ? "tạo ĐƯỢC!" : "");
  }
  {
    const trung = bam(`trung-${dau}`);
    const r1 = await thu(async () => c.query(
      `insert into public.api_keys (tenant_id, name, key_hash, key_prefix, key_suffix)
         values ($1,'Khoa mot', $2, 'ifan_sk_T101', 'q1w')`, [t.id, trung]));
    // Khoá thứ hai đặt ở TIỆM KHÁC: trùng băm phải bị chặn trên TOÀN nền tảng,
    // không chỉ trong một tiệm — nếu không, tiệm B đoán được khoá của tiệm A là
    // dùng luôn được.
    const r2 = r1.ok
      ? await thu(async () => c.query(
          `insert into public.api_keys (tenant_id, name, key_hash, key_prefix, key_suffix)
             values ($1,'Khoa hai', $2, 'ifan_sk_T102', 'q2w')`, [tKhac.id, trung]))
      : { ok: true };
    check("hai khoá API cùng dấu vân (key_hash) ⇒ CSDL từ chối", r1.ok && !r2.ok,
      !r1.ok ? "khoá đầu đã hỏng: " + r1.e : "khoá thứ hai tạo ĐƯỢC!");
  }

  // ════════════════════════════════════════════════════════════
  // C. LUỒNG PHÁT TIN — phần quan trọng nhất
  // ════════════════════════════════════════════════════════════
  // Đẩy con trỏ quét vượt qua MỌI sự kiện có sẵn trên CSDL thật, rồi ghi sự kiện
  // thử ở mốc SAU đó. Không làm vậy thì phép đếm bị lưu lượng thật làm nhiễu.
  const { rows: [m] } = await c.query(
    `select greatest(coalesce((select max(created_at) from public.domain_events), now()), now())
            + interval '1 hour' as moc`);
  const MOC = m.moc;
  await c.query(
    `update public.webhook_fanout_cursor
        set last_event_at = $1, last_event_id = null, updated_at = now() where only_row`, [MOC]);

  const { rows: [epTam] } = await c.query(
    `insert into public.webhook_endpoints (tenant_id, name, url, secret, event_types, status)
       values ($1,'Duong bao tam dung','https://vidu-nhan-tin.example.com/tam','s',
               array['order.created'],'paused') returning id`, [t.id]);
  const { rows: [epKhac] } = await c.query(
    `insert into public.webhook_endpoints (tenant_id, name, url, secret, event_types)
       values ($1,'Duong bao tiem khac','https://vidu-nhan-tin.example.com/khac','s',
               array['order.created']) returning id`, [tKhac.id]);

  const ghiSuKien = (tenantId, loai, phutSauMoc) => c.query(
    `insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, created_at)
       values ($1,$2,'order','1','{"tong":100000}'::jsonb, $3::timestamptz + ($4 || ' minutes')::interval)`,
    [tenantId, loai, MOC, String(phutSauMoc)]);
  const demPhieu = async (epId) =>
    Number((await c.query(`select count(*) n from public.webhook_deliveries where endpoint_id = $1`, [epId])).rows[0].n);
  const quet = () => thu(async () => (await c.query(`select public.webhook_queue_new(500) n`)).rows[0].n);

  await ghiSuKien(t.id, "order.created", 1);
  const q1 = await quet();
  const sau1 = q1.ok ? await demPhieu(ep.id) : -1;
  check("sự kiện đúng loại đã đăng ký ⇒ sinh ĐÚNG 1 phiếu gửi",
    q1.ok && sau1 === 1, q1.ok ? `đếm được ${sau1}` : "webhook_queue_new hỏng: " + q1.e);

  const q2 = await quet();
  const sau2 = q2.ok ? await demPhieu(ep.id) : -1;
  check("quét lần hai ⇒ KHÔNG sinh thêm phiếu (con trỏ đã tiến, không quét lại)",
    q2.ok && sau2 === sau1, q2.ok ? `${sau1} → ${sau2}` : "webhook_queue_new hỏng: " + q2.e);

  await ghiSuKien(t.id, "order.refunded", 2);
  const q3 = await quet();
  const sau3 = q3.ok ? await demPhieu(ep.id) : -1;
  check("sự kiện loại KHÔNG đăng ký ⇒ sinh 0 phiếu",
    q3.ok && sau3 === sau2, q3.ok ? `${sau2} → ${sau3}` : "webhook_queue_new hỏng: " + q3.e);

  const demTam = await demPhieu(epTam.id);
  check("đường báo đang TẠM DỪNG ⇒ sinh 0 phiếu",
    q1.ok && demTam === 0, q1.ok ? `đếm được ${demTam}` : "webhook_queue_new hỏng: " + q1.e);

  await ghiSuKien(tKhac.id, "order.created", 3);
  const q4 = await quet();
  const sau4 = q4.ok ? await demPhieu(ep.id) : -1;
  const lanTiem = q4.ok
    ? Number((await c.query(
        `select count(*) n from public.webhook_deliveries where endpoint_id = $1 and tenant_id = $2`,
        [ep.id, tKhac.id])).rows[0].n)
    : -1;
  // Và tin đó phải tới ĐÚNG đường báo của tiệm kia — không phải rơi mất.
  const veDungTiem = q4.ok ? await demPhieu(epKhac.id) : -1;
  check("sự kiện của TIỆM KHÁC ⇒ 0 phiếu cho đường báo của tiệm này (cách ly tiệm)",
    q4.ok && sau4 === sau3 && lanTiem === 0 && veDungTiem === 1,
    q4.ok ? `phiếu ${sau3} → ${sau4}, lẫn tiệm khác: ${lanTiem}, về đúng tiệm kia: ${veDungTiem}`
          : "webhook_queue_new hỏng: " + q4.e);

  // ── Vòng đời phiếu gửi ──
  // Gieo phiếu THẲNG bằng quyền postgres (đúng vai worker/service role) để phần
  // này đứng độc lập với phép phát tin ở trên.
  const gieoPhieu = async (soPhut = 100 * 365 * 24 * 60) => {
    const { rows: [d] } = await c.query(
      `insert into public.webhook_deliveries (tenant_id, endpoint_id, event_type, payload, next_attempt_at)
         values ($1,$2,'order.created','{"x":1}'::jsonb, now() - ($3 || ' minutes')::interval) returning id`,
      [t.id, ep.id, String(soPhut)]);
    return d.id;
  };
  const doc = async (id) => (await c.query(
    `select status, attempts, claimed_at, last_error from public.webhook_deliveries where id = $1`, [id])).rows[0];
  // Phiếu gieo có next_attempt_at cũ 100 năm ⇒ luôn đứng đầu hàng đợi
  // (`order by next_attempt_at`), nên phép nhận việc là tất định.
  const nhan = (max = 3) => thu(async () =>
    (await c.query(`select delivery_id, attempts from public.webhook_claim($1)`, [max])).rows);

  const d1 = await gieoPhieu();
  const nh1 = await nhan();
  const lay1 = nh1.ok ? nh1.v.find((x) => x.delivery_id === d1) : null;
  const s1 = await doc(d1);
  check("worker nhận được phiếu và số lần thử tăng lên 1",
    nh1.ok && !!lay1 && lay1.attempts === 1 && s1.attempts === 1 && s1.claimed_at !== null,
    nh1.ok ? JSON.stringify({ lay1, s1 }) : nh1.e);

  const nh2 = await nhan();
  const lay2 = nh2.ok ? nh2.v.find((x) => x.delivery_id === d1) : null;
  check("gọi nhận việc NGAY lần nữa ⇒ KHÔNG nhận lại phiếu vừa nhận (không gửi trùng)",
    nh2.ok && !lay2, nh2.ok ? `nhận LẠI, số lần thử thành ${lay2?.attempts}` : nh2.e);

  {
    // Cho đường báo "hỏng sẵn" để chứng minh gửi được MỘT lần là đếm hỏng về 0.
    await c.query(`update public.webhook_endpoints set consecutive_failures = 7 where id = $1`, [ep.id]);
    const r = await thu(async () => c.query(
      `select public.webhook_ghi_ket_qua($1, true)`, [d1]));
    const s = await doc(d1);
    const { rows: [e] } = await c.query(
      `select consecutive_failures, last_success_at from public.webhook_endpoints where id = $1`, [ep.id]);
    check("gửi THÀNH CÔNG ⇒ phiếu thành 'sent' và đếm hỏng liên tiếp về 0",
      r.ok && s.status === "sent" && Number(e.consecutive_failures) === 0 && e.last_success_at !== null,
      JSON.stringify({ ok: r.ok, e: r.e, s, ep: e }));
  }

  const d2 = await gieoPhieu();
  {
    await nhan();  // attempts = 1
    const r = await thu(async () => c.query(
      `select public.webhook_ghi_ket_qua($1, false, 'may chu tra 503')`, [d2]));
    const s = await doc(d2);
    const { rows: [e] } = await c.query(
      `select consecutive_failures, last_error, last_error_at from public.webhook_endpoints where id = $1`, [ep.id]);
    check("gửi HỎNG ⇒ phiếu về 'pending', đếm hỏng tăng, lỗi được ghi lại",
      r.ok && s.status === "pending" && s.last_error === "may chu tra 503" &&
      Number(e.consecutive_failures) === 1 && e.last_error === "may chu tra 503",
      JSON.stringify({ ok: r.ok, e: r.e, s, ep: e }));
  }

  {
    // Hạ trần thử về 1: phiếu đã thử 1 lần ⇒ lần hỏng này là lần cuối.
    const d3 = await gieoPhieu();
    await nhan();  // attempts = 1
    const r = await thu(async () => c.query(
      `select public.webhook_ghi_ket_qua($1, false, 'khong goi duoc', 1)`, [d3]));
    const s = await doc(d3);
    // Ép tới hạn ngay để chứng minh KHÔNG phải "chưa tới giờ" mới không lấy.
    await c.query(`update public.webhook_deliveries set next_attempt_at = now() - interval '1 day' where id = $1`, [d3]);
    const lai = await nhan();
    const conLay = lai.ok ? lai.v.some((x) => x.delivery_id === d3) : true;
    check("hỏng tới trần số lần thử ⇒ phiếu thành 'dead' và KHÔNG được lấy lại nữa",
      r.ok && s.status === "dead" && !conLay, JSON.stringify({ ok: r.ok, e: r.e, s, conLay }));
  }

  {
    const d4 = await gieoPhieu();
    await c.query(`update public.webhook_deliveries set claimed_at = now() - interval '20 minutes' where id = $1`, [d4]);
    const r = await thu(async () => (await c.query(`select public.webhook_tha_phieu_ket() n`)).rows[0].n);
    const s = await doc(d4);
    check("phiếu kẹt quá 10 phút được THẢ ra cho lượt sau (worker chết không làm tắc hàng đợi)",
      r.ok && Number(r.v) >= 1 && s.claimed_at === null, JSON.stringify({ ok: r.ok, e: r.e, n: r.v, s }));
  }
} finally {
  await c.query("rollback");
  await c.end();
}

// ════════════════════════════════════════════════════════════
// D. CHỐT CHẶN SSRF + chữ ký — hàm thuần, không cần CSDL
// ════════════════════════════════════════════════════════════
const hong = async (url) => {
  if (!lib) return { ok: true };            // không nạp được thư viện ⇒ coi như KHÔNG chặn
  return lib.kiemDiaChi(url);
};
const viLoi = "không nạp được lib/integrations/webhook-send.ts: " + loiImport;

{
  const r = await hong("http://vidu.com");
  check("địa chỉ http:// (không mã hoá) ⇒ từ chối", !r.ok, lib ? JSON.stringify(r) : viLoi);
}
{
  const r = await hong("https://127.0.0.1/hook");
  check("địa chỉ trỏ vào chính máy chủ (127.0.0.1) ⇒ từ chối", !r.ok, lib ? JSON.stringify(r) : viLoi);
}
{
  // Ca QUAN TRỌNG NHẤT: 169.254.169.254 là cửa lấy thông tin đăng nhập hạ tầng
  // của máy chủ đám mây. Lọt ca này là lọt toàn bộ khoá của hệ thống.
  const r = await hong("https://169.254.169.254/latest/meta-data/");
  check("địa chỉ metadata đám mây (169.254.169.254) ⇒ từ chối", !r.ok, lib ? JSON.stringify(r) : viLoi);
}
{
  const ds = ["https://10.0.0.5/hook", "https://192.168.1.1/", "https://172.16.0.1/"];
  const kq = [];
  for (const u of ds) kq.push([u, await hong(u)]);
  check("mọi dải mạng riêng (10.x · 192.168.x · 172.16-31.x) ⇒ từ chối",
    kq.every(([, r]) => !r.ok), lib ? JSON.stringify(kq) : viLoi);
}
{
  const r = await hong("https://localhost/hook");
  check("tên miền localhost ⇒ từ chối", !r.ok, lib ? JSON.stringify(r) : viLoi);
}
{
  if (!lib) {
    check("giãn dần thật (lần 1 sớm hơn lần 5) và không vượt quá 6 giờ", false, viLoi);
  } else {
    const bayGio = Date.now();
    const l1 = lib.lanKeTiepSau(1).getTime();
    const l5 = lib.lanKeTiepSau(5).getTime();
    const l50 = lib.lanKeTiepSau(50).getTime();
    const TRAN = bayGio + 6 * 60 * 60 * 1000 + 5_000; // +5s cho lệch đồng hồ khi chạy
    check("giãn dần thật (lần 1 sớm hơn lần 5) và không vượt quá 6 giờ",
      l1 < l5 && l50 <= TRAN,
      JSON.stringify({ l1: l1 - bayGio, l5: l5 - bayGio, l50: l50 - bayGio }));
  }
}
{
  if (!lib) {
    check("chữ ký ĐỔI theo mốc thời gian (bắt được tin cũ phát lại cũng vô dụng)", false, viLoi);
  } else {
    const than = JSON.stringify({ id: "abc", type: "order.created", data: { tong: 1 } });
    const a = lib.kyTin("bi-mat", 1_700_000_000, than);
    const b = lib.kyTin("bi-mat", 1_700_000_060, than);
    check("chữ ký ĐỔI theo mốc thời gian (bắt được tin cũ phát lại cũng vô dụng)",
      a !== b && a.length === 64, JSON.stringify({ a: a.slice(0, 12), b: b.slice(0, 12) }));
  }
}

console.log(
  fail === 0
    ? `[webhook-apikey-smoke] ${n}/${n} PASS — quyền, ràng buộc, luồng phát tin và chốt chặn SSRF đúng luật; không để lại dữ liệu.`
    : `[webhook-apikey-smoke] HỎNG ${fail}/${n} ca — xem dòng FAIL ở trên.`,
);
process.exit(fail === 0 ? 0 : 1);

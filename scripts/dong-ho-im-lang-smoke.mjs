#!/usr/bin/env node
/**
 * Cổng chống tái phát cho ĐỒNG HỒ CANH IM LẶNG (migration #178-179).
 *
 * Ngày 19/08 có HAI thứ hỏng suốt ~12 tiếng mà không gì báo, và người phát hiện
 * là founder chứ không phải máy. Đồng hồ này sinh ra để chuyện đó không lặp lại
 * — nên chính nó mà hỏng im lặng thì tệ hơn không có.
 *
 * Bốn thứ phải đúng, và không cái nào tự nói khi sai:
 *   1. IM thì phải KÊU. Đây là toàn bộ lý do tồn tại.
 *   2. SỐNG LẠI thì phải TỰ TẮT chuông. Chuông cũ không tự dọn thì bảng đầy
 *      tiếng chuông chết, và người ta ngừng đọc.
 *   3. Nhịp CHƯA BAO GIỜ chạy phải bị coi là đáng ngờ NHẤT — không phải "chưa
 *      có dữ liệu nên bỏ qua".
 *   4. Gõ SAI tên nhịp phải trả false, KHÔNG âm thầm tạo nhịp mới: một nhịp
 *      sinh ra do gõ nhầm sẽ không bao giờ được canh mà cũng không ai biết.
 *
 * Chạy trong MỘT transaction rồi ROLLBACK — không để lại gì trên CSDL thật.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
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

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"),
    rejectUnauthorized: true,
  },
});
await c.connect();

let n = 0;
let fail = 0;
const check = (ten, dk, ct = "") => {
  n++;
  console.log(`  ${dk ? "PASS" : "FAIL"} ${n} ${ten}${dk ? "" : " — " + ct}`);
  if (!dk) fail++;
};

let sp = 0;
const thu = async (fn) => {
  const s = `sp_${++sp}`;
  await c.query(`savepoint ${s}`);
  try {
    const v = await fn();
    await c.query(`release savepoint ${s}`);
    return { ok: true, v };
  } catch (e) {
    await c.query(`rollback to savepoint ${s}`);
    return { ok: false, e: e.message };
  }
};

await c.query("begin");
await c.query("set local lock_timeout = '10s'");
const { rows: [kRow] } = await c.query(
  `select value v from private.app_config where key = 'bot_ingest_key'`);
const KHOA = kRow.v;
try {
  const K = "thu.nhip_" + (Date.now() % 1e7);
  const demChuong = async () =>
    (await c.query(
      `select count(*) n from public.system_alerts
        where job_name = $1 and acknowledged_at is null`, ["im lặng: " + K])).rows[0].n | 0;

  console.log("[dong-ho-im-lang] Khai một nhịp thử rồi bỏ đói nó:");
  await c.query(
    `insert into public.heartbeats (key, last_seen_at, max_gap_minutes, mo_ta)
       values ($1, now() - interval '3 hours', 30, 'Nhịp thử của bộ kiểm')`, [K]);

  await c.query(`select public.silence_scan()`);
  check("nhịp im 3 tiếng (cho phép 30 phút) ⇒ CÓ chuông", (await demChuong()) === 1,
    `đếm được ${await demChuong()} chuông`);

  const { rows: [ct] } = await c.query(
    `select detail, fail_count from public.system_alerts where job_name = $1 and acknowledged_at is null`,
    ["im lặng: " + K]);
  check("nội dung chuông nói RÕ im bao lâu và ngưỡng là bao nhiêu",
    /im \d+ phút/.test(ct.detail) && /tối đa 30 phút/.test(ct.detail), ct.detail?.slice(0, 90));

  await c.query(`select public.silence_scan()`);
  check("quét lần hai KHÔNG đẻ chuông thứ hai (gộp vào một dòng)",
    (await demChuong()) === 1, `đếm được ${await demChuong()}`);
  const { rows: [ct2] } = await c.query(
    `select fail_count from public.system_alerts where job_name = $1 and acknowledged_at is null`,
    ["im lặng: " + K]);
  check("nhưng có cộng thêm lần đếm (biết là vẫn còn im)", ct2.fail_count > ct.fail_count,
    `${ct.fail_count} → ${ct2.fail_count}`);

  console.log("[dong-ho-im-lang] Nhịp sống lại — chuông phải TỰ TẮT:");
  check("đóng dấu bằng đúng tên nhịp ⇒ trả true",
    (await c.query(`select public.heartbeat_touch($1,$2) ok`, [KHOA, K])).rows[0].ok === true);
  await c.query(`select public.silence_scan()`);
  check("nhịp sống lại ⇒ chuông tự tắt", (await demChuong()) === 0,
    `còn ${await demChuong()} chuông chưa tắt`);

  console.log("[dong-ho-im-lang] Ba đường sai phải bị chặn:");
  const K2 = K + "_chuachay";
  await c.query(
    `insert into public.heartbeats (key, last_seen_at, max_gap_minutes, mo_ta)
       values ($1, null, 30, 'Nhịp khai rồi mà chưa từng chạy')`, [K2]);
  await c.query(`select public.silence_scan()`);
  const { rows: [ct3] } = await c.query(
    `select detail from public.system_alerts where job_name = $1 and acknowledged_at is null`,
    ["im lặng: " + K2]);
  check("nhịp CHƯA BAO GIỜ chạy ⇒ vẫn kêu, và nói đúng lý do",
    Boolean(ct3) && /CHƯA BAO GIỜ/.test(ct3.detail), ct3?.detail?.slice(0, 80) ?? "không có chuông");

  check("gõ SAI tên nhịp ⇒ trả false, KHÔNG tự tạo nhịp mới",
    (await c.query(`select public.heartbeat_touch($1,$2) ok`, [KHOA, "khong_he_ton_tai_xyz"])).rows[0].ok === false);
  // ⚠️ Bản đầu của ca này TRUYỀN SỐ ĐẾM vào chỗ điều kiện — tức nó đo NHẦM:
  // count = 0 là falsy nên ca luôn FAIL, và phép so `=== 0` nằm ngoài lời gọi
  // check() nên chẳng ảnh hưởng gì. Cùng lớp lỗi "bộ kiểm đo nhầm thứ" đã dính
  // một lần nữa hôm nay ở bộ trần giảm giá. Đo cho đúng: tách số ra biến trước.
  const soDongMa =
    (await c.query(`select count(*) n from public.heartbeats where key = 'khong_he_ton_tai_xyz'`))
      .rows[0].n | 0;
  check("và bảng khai báo KHÔNG mọc thêm dòng nào", soDongMa === 0, `mọc ${soDongMa} dòng`);

  await c.query(
    `update public.heartbeats set tam_tat_ly_do = 'tắt để thử' where key = $1`, [K2]);
  await c.query(`select public.silence_scan()`);
  const conChuong = (await c.query(
    `select count(*) n from public.system_alerts
      where job_name = $1 and acknowledged_at is null`, ["im lặng: " + K2])).rows[0].n | 0;
  check("tắt canh KÈM lý do ⇒ chuông của nhịp đó tự tắt", conChuong === 0, `còn ${conChuong}`);

  console.log("[dong-ho-im-lang] Đóng dấu phải ĐÒI KHOÁ — lỗ đã vá ở #182:");
  {
    // Bản #178 cấp hàm này cho vai `anon`, mà khoá anon nằm CÔNG KHAI trong mã
    // chạy ở trình duyệt ⇒ ai cũng gọi được và giữ cho một nhịp đã chết trông
    // như còn sống, tức vô hiệu hoá đúng cái đồng hồ này. Hai ca dưới canh cho
    // khoá không bị gỡ ra lần nữa.
    const saiKhoa = await thu(() =>
      c.query(`select public.heartbeat_touch($1,$2)`, ["khoa-bia-dat", K]));
    check("đóng dấu bằng khoá BỊA ⇒ bị từ chối",
      !saiKhoa.ok && /invalid_key/.test(saiKhoa.e), JSON.stringify(saiKhoa));
    const khongKhoa = await thu(() =>
      c.query(`select public.heartbeat_touch(null,$1)`, [K]));
    check("đóng dấu KHÔNG khoá ⇒ bị từ chối",
      !khongKhoa.ok && /invalid_key/.test(khongKhoa.e), JSON.stringify(khongKhoa));
  }

  console.log("[dong-ho-im-lang] Bốn nhịp thật của hệ thống đã được khai:");
  const { rows: that } = await c.query(
    `select key from public.heartbeats where key not like 'thu.%' order by key`);
  const canCo = ["db.cron_scheduler", "db.silence_scan", "web.bot_outbox", "web.webhook_dispatch"];
  for (const k of canCo) check(`đã khai nhịp "${k}"`, that.some((r) => r.key === k));
} catch (e) {
  console.error("[dong-ho-im-lang] VỠ:", e.message);
  fail++;
}
await c.query("rollback");
await c.end();

console.log(
  fail
    ? `[dong-ho-im-lang] HỎNG ${fail}/${n} ca — xem dòng FAIL ở trên.`
    : `[dong-ho-im-lang] ${n}/${n} PASS — im thì kêu, sống lại thì tự tắt, gõ sai tên không tạo nhịp ma.`,
);
process.exit(fail ? 1 : 0);

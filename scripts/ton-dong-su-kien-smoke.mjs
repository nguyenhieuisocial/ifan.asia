#!/usr/bin/env node
/**
 * Cổng chống tái phát cho CHUÔNG BÁO TỒN ĐỌNG HÀNG ĐỢI SỰ KIỆN (migration #219).
 *
 * Ngày 20/08 đo được một thứ khó chịu: việc tự động của tiệm trễ 6,5 tiếng,
 * trong khi MỌI ĐÈN ĐỀU XANH — 24/24 việc chạy nền báo "succeeded", 4/4 nhịp
 * tim tươi, bộ kiểm đồng hồ im lặng 16/16 PASS. Nguyên nhân: nhịp
 * `process-workflow-events` chạy đúng mỗi phút nhưng mỗi lượt chỉ ngoạm 200
 * dòng, trong khi 74.000 sự kiện đang xếp hàng.
 *
 * Bài học: đồng hồ #178 đo "CÓ CHẠY KHÔNG". Cái hỏng này là "CHẠY CÓ KỊP
 * KHÔNG". Một việc vừa khoẻ theo mọi thước đo hiện có, vừa vô dụng.
 *
 * Bốn thứ phải đúng, và không cái nào tự nói khi sai:
 *   1. TRỄ thì phải KÊU — đây là toàn bộ lý do tồn tại.
 *   2. Chuông phải nói RÕ trễ bao lâu và còn bao nhiêu, không kêu suông.
 *   3. Quét nhiều lần chỉ GỘP một dòng, không đẻ chuông mới mỗi lượt.
 *   4. ĐUỔI KỊP thì phải TỰ TẮT chuông. Không có bước này thì bảng đầy tiếng
 *      chuông chết và người ta ngừng đọc.
 *
 * Ca 5 là ĐỐI CHỨNG NGƯỢC, và là ca quan trọng nhất: nó chứng minh phép đo
 * này phân biệt được đúng/sai chứ không phải lúc nào cũng xanh. Thiếu nó thì
 * một hàm `return 0` rỗng cũng PASS bốn ca đầu.
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

const demChuong = async () =>
  (
    await c.query(
      `select count(*)::int n from public.system_alerts s
         join cron.job j on j.jobid = s.job_id
        where j.jobname = 'process-workflow-events' and s.acknowledged_at is null`,
    )
  ).rows[0].n;

const chuong = async () =>
  (
    await c.query(
      `select s.detail, s.fail_count from public.system_alerts s
         join cron.job j on j.jobid = s.job_id
        where j.jobname = 'process-workflow-events' and s.acknowledged_at is null`,
    )
  ).rows[0];

await c.query("begin");
await c.query("set local lock_timeout = '10s'");
await c.query("set local statement_timeout = '300s'");
try {
  // Dựng một đống tồn GIẢ, tuổi 90 phút — không phụ thuộc hàng đợi thật đang
  // rỗng hay đầy, nên ca này chạy được mọi lúc. Sự kiện có `causation_chain`
  // vượt trần ⇒ pha 1 chỉ đóng dấu rồi bỏ qua, không đẻ workflow_run nào.
  console.log("[ton-dong-su-kien] Dựng một đống tồn 90 phút tuổi:");
  const { rows: [t] } = await c.query(`select id from public.tenants limit 1`);
  await c.query(
    `insert into public.domain_events
       (tenant_id, event_type, aggregate_type, aggregate_id, payload, created_at, causation_chain)
     select $1::uuid, 'thu.ton_dong', 'test', $1::uuid, '{}'::jsonb,
            now() - interval '90 minutes', 99
       from generate_series(1, 5)`,
    [t.id],
  );

  await c.query(`select public.event_backlog_scan()`);
  check("tồn đọng trễ 90 phút (ngưỡng 30) ⇒ CÓ chuông", (await demChuong()) === 1,
    `đếm được ${await demChuong()}`);

  const ct = await chuong();
  check("chuông nói RÕ trễ bao lâu và còn bao nhiêu việc",
    /trễ \d+ phút/.test(ct.detail) && /còn \d+ sự kiện/.test(ct.detail),
    ct.detail?.slice(0, 90));

  await c.query(`select public.event_backlog_scan()`);
  check("quét lần hai KHÔNG đẻ chuông thứ hai (gộp vào một dòng)",
    (await demChuong()) === 1, `đếm được ${await demChuong()}`);
  const ct2 = await chuong();
  check("nhưng có cộng thêm lần đếm (biết là vẫn còn trễ)",
    ct2.fail_count > ct.fail_count, `${ct.fail_count} → ${ct2.fail_count}`);

  // ⚠️ ĐỐI CHỨNG NGƯỢC — ca quan trọng nhất của bộ này. Bốn ca trên chỉ chứng
  // minh "khi trễ thì kêu"; một hàm kêu VÔ ĐIỀU KIỆN cũng qua hết. Ca này ép
  // hàng đợi về sạch rồi đòi chuông phải TỰ TẮT: chỉ hàm nào thật sự ĐO mới
  // qua được cả hai chiều.
  console.log("[ton-dong-su-kien] Đuổi kịp rồi — chuông phải TỰ TẮT:");
  await c.query(
    `update public.domain_events set processed_at = now() where processed_at is null`);
  await c.query(`select public.event_backlog_scan()`);
  check("hàng đợi sạch ⇒ chuông tự tắt", (await demChuong()) === 0,
    `còn ${await demChuong()} chuông chưa tắt`);

  // Hàng đợi còn việc nhưng CÒN TƯƠI (dưới ngưỡng) cũng không được kêu —
  // nếu không thì mọi nhịp bình thường đều rung chuông và chuông thành vô nghĩa.
  await c.query(
    `insert into public.domain_events
       (tenant_id, event_type, aggregate_type, aggregate_id, payload, created_at, causation_chain)
     values ($1::uuid, 'thu.ton_dong', 'test', $1::uuid, '{}'::jsonb, now() - interval '2 minutes', 99)`,
    [t.id],
  );
  await c.query(`select public.event_backlog_scan()`);
  check("còn việc nhưng mới 2 phút (dưới ngưỡng) ⇒ KHÔNG kêu",
    (await demChuong()) === 0, `kêu oan ${await demChuong()} chuông`);

  console.log("[ton-dong-su-kien] Hàm quét không được hở ra vai công khai:");
  const { rows: [q] } = await c.query(
    `select has_function_privilege('anon','public.event_backlog_scan()','execute') a,
            has_function_privilege('authenticated','public.event_backlog_scan()','execute') b`);
  check("vai anon/authenticated KHÔNG gọi được hàm quét",
    q.a === false && q.b === false, JSON.stringify(q));

  console.log("[ton-dong-su-kien] Trần mỗi nhịp phải đủ lớn cho dữ liệu thật:");
  const { rows: [j] } = await c.query(
    `select command from cron.job where jobname = 'process-workflow-events'`);
  const so = Number(j?.command?.match(/process_workflow_events\((\d+)\)/)?.[1] ?? 0);
  check("nhịp process-workflow-events ngoạm ≥ 2.000 sự kiện mỗi lượt", so >= 2000,
    `đang là ${so} — với 74k tồn đọng thì cần 6,5 tiếng mới hết`);
} catch (e) {
  console.error("[ton-dong-su-kien] VỠ:", e.message);
  fail++;
}
await c.query("rollback");
await c.end();

console.log(
  fail
    ? `[ton-dong-su-kien] HỎNG ${fail}/${n} ca — xem dòng FAIL ở trên.`
    : `[ton-dong-su-kien] ${n}/${n} PASS — trễ thì kêu, đuổi kịp thì tự tắt, còn tươi thì im.`,
);
process.exit(fail ? 1 : 0);

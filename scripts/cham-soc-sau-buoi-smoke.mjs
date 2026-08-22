/**
 * Cổng: buổi hẹn XONG phải sinh đúng chuỗi việc chăm sóc, gắn đúng khách.
 *
 * ⚠️ VÌ SAO CẦN — hai lỗ IM LẶNG nối nhau, cả hai đều "nhìn vào thấy đủ":
 *
 *   ① `wf_aggregate` chỉ biết đọc khách / cơ hội / công ty. Gặp buổi hẹn hay
 *      đơn hàng thì trả về `{}` RỖNG — không lỗi, không cảnh báo. Mọi quy trình
 *      tự động gắn vào `appointment.*` và `order.*` chạy với dữ liệu rỗng: điều
 *      kiện nào cũng không khớp, và không có đích để tạo việc.
 *   ② `wf_exec_action` chỉ suy ra đích từ khách / cơ hội. Buổi hẹn và đơn hàng
 *      ném `wf_task_needs_target`.
 *
 *   Hệ quả: chuỗi chăm sóc 3-5-7 — thứ nghiên cứu trong vault gọi là đáng giá
 *   nhất học được từ SCRM Trung Quốc cho spa/phòng khám — chỉ chạy được sau khi
 *   TẠO CƠ HỘI BÁN HÀNG, tức sai hẳn thời điểm cần chăm. Vá ở #368.
 *
 * ⚠️ Cổng đi ĐÚNG ĐƯỜNG THẬT: chèn một dòng vào hàng đợi sự kiện rồi gọi bộ xử
 *   lý, y như hệ thống chạy hằng ngày. KHÔNG gọi thẳng hàm bên trong — gọi
 *   thẳng thì bỏ qua đúng những mắt xích vừa vá.
 *
 * ⚠️ Toàn bộ nằm trong MỘT giao dịch và luôn `rollback`. Không để lại gì.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const env = {};
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#") && !process.env[line.slice(0, i)]) {
      env[line.slice(0, i)] = line.slice(i + 1).trim();
    }
  }
} catch {
  /* CI cấp biến qua secrets */
}
const DB = process.env.KHO_KIEM_DB_URL || env.KHO_KIEM_DB_URL || process.env.SUPABASE_DB_URL || env.SUPABASE_DB_URL;
if (!DB) {
  console.error("❌ Thiếu đường nối cơ sở dữ liệu.");
  process.exit(1);
}

const loi = [];
const bao = (ok, ten, them = "") => {
  if (!ok) loi.push(ten + (them ? ` — ${them}` : ""));
  console.log(`  ${ok ? "ĐẠT  " : "TRƯỢT"}  ${ten}${them ? " — " + them : ""}`);
};

const c = new pg.Client({
  connectionString: DB,
  ssl: { ca: readFileSync("supabase/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
});
await c.connect();
await c.query("set lock_timeout='20s'");
await c.query("begin");
try {
  const t = (await c.query("select id from public.tenants order by created_at limit 1")).rows[0].id;
  const k = (await c.query("select id from public.contacts where tenant_id=$1 limit 1", [t])).rows[0];
  const nv = (
    await c.query("select user_id from public.tenant_members where tenant_id=$1 and status='active' limit 1", [t])
  ).rows[0];
  if (!k || !nv) throw new Error("tiệm đầu tiên thiếu khách hoặc thiếu người — không đo được");

  await c.query("update public.workflows set is_active=true where tenant_id=$1 and key='cham_sau_buoi_hen'", [t]);

  const ap = (
    await c.query(
      `insert into public.appointments (tenant_id, contact_id, staff_user_id, start_at, end_at, status)
         values ($1,$2,$3, now() - interval '2 hours', now() - interval '1 hour', 'done') returning id`,
      [t, k.id, nv.user_id],
    )
  ).rows[0].id;

  const dem = async () =>
    Number((await c.query("select count(*) n from public.activities where tenant_id=$1 and type='task'", [t])).rows[0].n);
  const truoc = await dem();

  await c.query(
    `insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload)
       values ($1,'appointment.done','appointment',$2,'{}'::jsonb)`,
    [t, ap],
  );
  await c.query("select public.process_workflow_events(200)");

  const them = (await dem()) - truoc;
  bao(them === 3, "buổi hẹn xong sinh đúng 3 việc chăm sóc", `thấy ${them}`);

  const ds = await c.query(
    `select subject, (due_at::date - now()::date) ngay, contact_id
       from public.activities where tenant_id=$1 and type='task'
       order by created_at desc limit 3`,
    [t],
  );
  const han = ds.rows.map((r) => Number(r.ngay)).sort((a, b) => a - b);
  bao(han.join(",") === "3,5,7", "ba việc đúng hạn ngày 3 · 5 · 7", `thấy ${han.join(" · ")}`);
  bao(
    ds.rows.length === 3 && ds.rows.every((r) => r.contact_id === k.id),
    "cả ba việc gắn đúng khách vừa đến",
  );
} catch (e) {
  loi.push("chạy hỏng: " + String(e.message).slice(0, 160));
  console.log("  TRƯỢT  chạy hỏng —", String(e.message).slice(0, 160));
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(loi.length === 0 ? "\nXANH" : `\nĐỎ: ${loi.length} mục`);
process.exit(loi.length === 0 ? 0 : 1);

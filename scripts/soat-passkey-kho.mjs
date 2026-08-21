import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

for (const d of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"), rejectUnauthorized: true } });
await c.connect();
// Cổng kiểm chạy trên ĐÚNG kho của khách thật — một lượt kiểm treo sẽ chặn cả
// việc áp bản vá khẩn. Đặt hạn chờ để nó tự bỏ cuộc thay vì giữ khoá.
await c.query("set lock_timeout = '10s'");
await c.query("set statement_timeout = '30s'");

let dat = 0, truot = 0;
const kiem = (ten, ok, ghiChu = "") => {
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${ghiChu ? " — " + ghiChu : ""}`);
  ok ? dat++ : truot++;
};
/** Chạy 1 câu trong savepoint riêng: câu lỗi không giết cả giao dịch. */
const thu = async (sql, params) => {
  await c.query("savepoint sp");
  try {
    const r = await c.query(sql, params);
    return { ok: true, rows: r.rows, n: r.rowCount };
  } catch (e) {
    await c.query("rollback to savepoint sp");
    return { ok: false, loi: e.message };
  }
};

await c.query("begin");
const uid = (await c.query("select id from auth.users limit 1")).rows[0].id;
await c.query(
  `insert into public.passkeys (credential_id, user_id, public_key, counter, ten)
   values ('THU-324', $1, decode('00','hex'), 0, 'máy thử')`, [uid]);
await c.query(
  `insert into public.passkey_challenges (challenge, user_id, loai)
   values ('THU-324', $1, 'dang_nhap')`, [uid]);

for (const vai of ["anon", "authenticated"]) {
  await c.query("savepoint vai");
  await c.query(`set local role ${vai}`);
  for (const bang of ["passkeys", "passkey_challenges"]) {
    const r = await thu(`select count(*)::int as n from public.${bang}`);
    // Chặn ở tầng quyền (lỗi) HOẶC ở tầng RLS (0 dòng) đều là chặn.
    kiem(`${vai} không đọc được ${bang}`, !r.ok || r.rows[0].n === 0,
      r.ok ? `thấy ${r.rows[0].n} dòng` : "bị từ chối quyền");
  }
  const g = await thu(
    `insert into public.passkeys (credential_id, user_id, public_key) values ('X',$1,decode('00','hex'))`, [uid]);
  kiem(`${vai} không ghi được passkeys`, !g.ok);
  const x = await thu(`delete from public.passkeys where credential_id='THU-324'`);
  kiem(`${vai} không xoá được passkey người khác`, !x.ok || x.n === 0);
  await c.query("rollback to savepoint vai");
}

await c.query("savepoint svc");
await c.query("set local role service_role");
// ⚠️ Lọc ĐÚNG dòng vừa gieo, không đếm cả bảng: bảng thử thách còn dòng của
//   những lượt chạy khác (chúng tự hết hạn sau 5 phút). Đếm cả bảng thì phép đo
//   này lúc xanh lúc đỏ tuỳ vào việc ai vừa bấm nút — đúng loại phép đo dối.
for (const [bang, cot] of [["passkeys", "credential_id"], ["passkey_challenges", "challenge"]]) {
  const r = await thu(`select count(*)::int as n from public.${bang} where ${cot}='THU-324'`);
  kiem(`máy chủ ĐỌC ĐƯỢC ${bang}`, r.ok && r.rows[0].n === 1,
    r.ok ? `thấy ${r.rows[0].n}` : r.loi);
}
const g = await thu(
  `insert into public.passkeys (credential_id, user_id, public_key) values ('SVC-324',$1,decode('00','hex'))`, [uid]);
kiem("máy chủ GHI ĐƯỢC passkeys", g.ok, g.ok ? "" : g.loi);
const u = await thu(`update public.passkeys set counter=9 where credential_id='THU-324'`);
kiem("máy chủ CẬP NHẬT ĐƯỢC bộ đếm", u.ok && u.n === 1, u.ok ? "" : u.loi);
const x = await thu(`delete from public.passkey_challenges where challenge='THU-324'`);
kiem("máy chủ XOÁ ĐƯỢC thử thách", x.ok && x.n === 1, x.ok ? "" : x.loi);
await c.query("rollback to savepoint svc");

await c.query("rollback");
await c.end();
console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);

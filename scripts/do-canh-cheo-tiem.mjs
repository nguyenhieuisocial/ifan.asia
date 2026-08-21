/**
 * ĐO THẬT các cạnh khoá ngoại chưa có chốt chéo tiệm.
 *
 * ═══════════════════════════════════════════════════════════════════
 * HAI KẾT LUẬN SAI MÀ BỘ ĐO NÀY SINH RA ĐỂ TRÁNH
 * ═══════════════════════════════════════════════════════════════════
 * 1. "Cổng báo chưa có chốt" ⇒ KHÔNG có nghĩa là có lỗ. Đo 21/08: 7/10 cạnh đã
 *    bị RLS hoặc thiếu quyền chặn sẵn.
 * 2. "Lệnh ghi bị lỗi" ⇒ KHÔNG có nghĩa là đã chặn. Lượt đo đầu báo 7 CHẶN,
 *    nhưng 2 trong đó hỏng vì ràng buộc dữ liệu và vì đơn đã chốt. Siết lại —
 *    chỉ nhận 42501 hoặc 23514 có chữ "tiệm" — thì một cái hiện nguyên hình là
 *    LỖ DÍNH TIỀN (`order_lines.performed_by_employee_id`, vá ở #326).
 *
 * ⇒ Luật của file này: đọc MÃ LỖI, đừng đọc "có lỗi hay không". Và cạnh nào
 *   không dựng được lệnh ghi hợp lệ thì báo CHƯA ĐO — tuyệt đối không xếp vào
 *   CHẶN cho đẹp bảng. Chưa đo được là CHỖ MÙ, không phải chỗ an toàn.
 *
 * Chạy: node scripts/do-canh-cheo-tiem.mjs
 */
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");


for (const d of readFileSync(".env.local", "utf8").split("\n")) {
  const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const CANH = [
  ["attendance_proxy_punches", "punch_id", "attendance_punches"],
  ["bank_transactions", "order_id", "orders"],
  ["bank_transactions", "order_payment_id", "order_payments"],
  ["cash_entries", "supplier_payment_id", "supplier_payments"],
  ["chat_reactions", "message_id", "chat_messages"],
  ["contacts", "referred_by_contact_id", "contacts"],
  ["data_erasure_requests", "contact_id", "contacts"],
  ["loyalty_ledger", "referred_contact_id", "contacts"],
  ["order_lines", "performed_by_employee_id", "employees"],
  ["storefront_lead_holds", "contact_id", "contacts"],
];

/**
 * Vài bảng cha có "trạng thái khoá" — bốc dòng bừa là vớ phải dòng không sửa
 * được, lệnh ghi hỏng vì lý do KHÁC và ta kết luận nhầm là an toàn. Đo 21/08:
 * 18.943/20.082 đơn đang ở trạng thái completed.
 */
const GOI_Y_CHA = { orders: "status in ('draft','confirmed')" };

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"), rejectUnauthorized: true },
});
await c.connect();
await c.query("set lock_timeout = '10s'");
await c.query("set statement_timeout = '60s'");

const tach = (t) => (t.includes(".") ? t.split(".") : ["public", t]);

async function cotBatBuoc(bang) {
  const { rows } = await c.query(
    `select column_name, data_type, udt_name from information_schema.columns
      where table_schema='public' and table_name=$1
        and is_nullable='NO' and column_default is null and is_generated='NEVER'
      order by ordinal_position`,
    [bang],
  );
  return rows;
}

async function khoaNgoai(bang) {
  const { rows } = await c.query(
    `select kcu.column_name, ccu.table_schema as sc, ccu.table_name as bang_cha,
            ccu.column_name as cot_cha
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.table_schema='public' and tc.table_name=$1 and tc.constraint_type='FOREIGN KEY'`,
    [bang],
  );
  return new Map(rows.map((r) => [r.column_name, { sc: r.sc, bang: r.bang_cha, cot: r.cot_cha }]));
}

async function coTenant(bang) {
  const { rows } = await c.query(
    `select 1 from information_schema.columns
      where table_schema='public' and table_name=$1 and column_name='tenant_id'`,
    [bang],
  );
  return rows.length > 0;
}

/** Giá trị hợp lệ cho cột bị ràng buộc `check (... in ('a','b'))`. */
async function giaTriHopLe(bang, cot) {
  const { rows } = await c.query(
    `select pg_get_constraintdef(oid) as dn from pg_constraint
      where conrelid = ('public.' || $1)::regclass and contype='c'`,
    [bang],
  );
  for (const r of rows) {
    if (!r.dn.includes(cot)) continue;
    const m = r.dn.match(/'([^']+)'/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Một dòng của bảng cha thuộc đúng tiệm.
 *
 * `traKhoiDaDung` loại những dòng ĐÃ bị bảng con chiếm mất khoá duy nhất —
 * không loại thì lệnh ghi hỏng vì trùng khoá, lại thành một kết luận an toàn giả.
 */
async function motDong(bangDay, cot, tenant, viTri = 0, traKhoiDaDung = null) {
  const [sc, bang] = tach(bangDay);
  const co = sc === "public" && (await coTenant(bang));
  const dk = [];
  const ts = [];
  if (co) { ts.push(tenant); dk.push(`tenant_id = $${ts.length}`); }
  if (GOI_Y_CHA[bang]) dk.push(GOI_Y_CHA[bang]);
  if (traKhoiDaDung) {
    dk.push(
      `${cot} not in (select ${traKhoiDaDung.cot} from public.${traKhoiDaDung.bang}
                       where ${traKhoiDaDung.cot} is not null)`,
    );
  }
  const { rows } = await c.query(
    `select ${cot} as v from ${sc}.${bang}
      ${dk.length ? "where " + dk.join(" and ") : ""} limit 1 offset ${viTri}`,
    ts,
  );
  return rows[0]?.v ?? null;
}

function buTheoKieu(kieu, udt) {
  // ⚠️ uuid KHÔNG có khoá ngoại thì SINH MỚI, đừng trả null. Trả null làm cạnh
  //   bị xếp "chưa đo được" — mà chưa đo được là chỗ mù, không phải chỗ an toàn.
  if (/uuid/.test(udt)) return randomUUID();
  if (/int|numeric|decimal|real|double/.test(kieu)) return 1;
  if (/bool/.test(kieu)) return false;
  if (/timestamp|date/.test(kieu)) return new Date().toISOString();
  if (/json/.test(udt)) return "{}";
  return "do-thu";
}

/** Bộ giá trị đủ để ghi một dòng vào `bang` cho `tenant`. */
async function dungGiaTri(bang, tenant, ghiDe = {}, lan = 0) {
  const cots = await cotBatBuoc(bang);
  const fks = await khoaNgoai(bang);
  const gt = {};
  for (const col of cots) {
    const n = col.column_name;
    if (n in ghiDe) { gt[n] = ghiDe[n]; continue; }
    if (n === "tenant_id") { gt[n] = tenant; continue; }
    if (fks.has(n)) {
      const f = fks.get(n);
      gt[n] =
        (await motDong(`${f.sc}.${f.bang}`, f.cot, tenant, lan)) ??
        (await motDong(`${f.sc}.${f.bang}`, f.cot, tenant, 0));
      continue;
    }
    gt[n] = (await giaTriHopLe(bang, n)) ?? buTheoKieu(col.data_type, col.udt_name);
  }
  for (const [k, v] of Object.entries(ghiDe)) if (!(k in gt)) gt[k] = v;
  return gt;
}

/**
 * Gieo một dòng cha cho tiệm B khi bảng cha mới chỉ có dữ liệu ở MỘT tiệm.
 *
 * ⚠️ Bỏ qua cạnh đó là để lại một chỗ mù sẽ nở ra đúng ngày tiệm thứ hai bắt
 *   đầu dùng tính năng — tức là đúng lúc không ai còn nhớ để đi rà lại.
 */
async function gieoDongCha(bang, tenant) {
  const gt = await dungGiaTri(bang, tenant);
  const cot = Object.keys(gt);
  if (cot.some((k) => gt[k] === null)) return null;
  const { rows } = await c.query(
    `insert into public.${bang} (${cot.join(", ")})
     values (${cot.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    cot.map((k) => gt[k]),
  );
  return rows[0]?.id ?? null;
}

/** Khoá duy nhất một cột trên bảng con — dùng để loại dòng cha đã bị chiếm. */
async function khoaDuyNhatMotCot(bang, cot) {
  // ⚠️ ĐỪNG dò bằng `indexdef like '%<cột>%'`. Đã dính: tên cột `id` là chuỗi
  //   con của gần như mọi định nghĩa chỉ mục, nên phép dò báo "có khoá duy
  //   nhất" cho MỌI cạnh, phép loại trừ gạt sạch dòng cha, và cả 10 cạnh rơi về
  //   CHƯA ĐO. Hỏi thẳng danh mục hệ thống: chỉ mục DUY NHẤT trên ĐÚNG MỘT cột,
  //   và cột đó đúng là cột đang xét.
  const { rows } = await c.query(
    `select 1 from pg_index i
       join pg_class t on t.oid = i.indrelid
       join pg_namespace n on n.oid = t.relnamespace
      where n.nspname='public' and t.relname=$1 and i.indisunique and i.indnatts = 1
        and (select attname from pg_attribute
              where attrelid = t.oid and attnum = i.indkey[0]) = $2`,
    [bang, cot],
  );
  return rows.length > 0 ? { bang, cot } : null;
}

const ket = [];
for (const [con, cot, cha] of CANH) {
  await c.query("begin");
  try {
    await c.query("set local lock_timeout = '10s'");
    const chaCoTenant = await coTenant(cha);
    const { rows: tiem } = await c.query(
      chaCoTenant
        ? `select distinct tenant_id from public.${cha} where tenant_id is not null limit 2`
        : `select id as tenant_id from public.tenants limit 2`,
    );

    const fks = await khoaNgoai(con);
    const cotCha = fks.get(cot)?.cot ?? "id";
    const loaiTru = await khoaDuyNhatMotCot(con, cot);

    let A, B, gieo = false;
    if (tiem.length >= 2) {
      [A, B] = [tiem[0].tenant_id, tiem[1].tenant_id];
    } else {
      const { rows: hai } = await c.query(`select id from public.tenants limit 2`);
      if (hai.length < 2) {
        ket.push([con, cot, "CHƯA ĐO", "hệ thống chưa có 2 tiệm"]);
        await c.query("rollback");
        continue;
      }
      A = tiem[0]?.tenant_id ?? hai[0].id;
      B = hai.find((x) => x.id !== A)?.id ?? hai[1].id;
      gieo = true;
    }

    const { rows: nguoi } = await c.query(
      `select user_id from public.tenant_members where tenant_id=$1 limit 1`,
      [A],
    );
    if (!nguoi.length) {
      ket.push([con, cot, "CHƯA ĐO", "tiệm A không có người dùng"]);
      await c.query("rollback");
      continue;
    }

    // Gieo TRƯỚC khi đổi vai: dòng cha của tiệm B là bối cảnh của phép đo, không
    // phải thứ đang đo. Gieo sau khi đổi vai thì RLS chặn và ta mất phép đo.
    const gieoRa = gieo ? await gieoDongCha(cha, B) : null;
    if (gieo && !gieoRa) {
      ket.push([con, cot, "CHƯA ĐO", "không dựng được dòng cha của tiệm B"]);
      await c.query("rollback");
      continue;
    }

    // ⚠️ LẤY SẴN dòng của tiệm B TRƯỚC KHI đổi vai. Sau khi đóng vai người tiệm
    //   A thì chính RLS che mất dòng tiệm B, phép tra trả rỗng, và cả 10 cạnh
    //   rơi về CHƯA ĐO — trông y hệt lúc hệ thống thiếu dữ liệu. Đã dính 21/08.
    const ungVien = [];
    if (gieoRa) ungVien.push(gieoRa);
    else {
      for (let i = 0; i < 8; i++) {
        const v = await motDong(cha, cotCha, B, i, loaiTru);
        if (v === null) break;
        ungVien.push(v);
      }
    }
    // Tiệm B hết dòng dùng được (ví dụ mọi lượt trả nhà cung cấp đều đã bị một
    // dòng quỹ chiếm mất khoá duy nhất) ⇒ GIEO một dòng mới, đừng bỏ cạnh.
    if (!ungVien.length) {
      const gieoBu = await gieoDongCha(cha, B);
      if (gieoBu) ungVien.push(gieoBu);
    }
    if (!ungVien.length) {
      ket.push([con, cot, "CHƯA ĐO", "không dựng được dòng cha nào cho tiệm B"]);
      await c.query("rollback");
      continue;
    }

    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: nguoi[0].user_id, role: "authenticated" }),
    ]);
    await c.query("set local role authenticated");

    let xong = false;
    let loiCuoi = null;
    // Thử tới 8 tổ hợp: đổi cả dòng cha PHỤ lẫn chính dòng của tiệm B.
    for (let lan = 0; lan < 8 && !xong; lan++) {
      const giaTriLan = ungVien[Math.min(lan, ungVien.length - 1)];
      const gt = await dungGiaTri(con, A, { [cot]: giaTriLan }, lan);
      const cacCot = Object.keys(gt);
      if (cacCot.some((k) => gt[k] === null && k !== cot)) {
        loiCuoi = { code: "—", message: "thiếu giá trị bắt buộc" };
        continue;
      }
      await c.query("savepoint thu");
      try {
        await c.query(
          `insert into public.${con} (${cacCot.join(", ")})
           values (${cacCot.map((_, i) => `$${i + 1}`).join(", ")})`,
          cacCot.map((k) => gt[k]),
        );
        ket.push([con, cot, "LỌT", "ghi được dòng trỏ sang tiệm khác"]);
        xong = true;
      } catch (e) {
        await c.query("rollback to savepoint thu");
        loiCuoi = e;
        // CHỈ hai loại lỗi này chứng minh lớp chống chéo tiệm đã chặn:
        //   42501 — RLS hoặc thiếu quyền
        //   23514 kèm chữ "tiệm" — trigger chốt chéo tiệm tự viết
        const laChotTiem =
          e.code === "42501" || (e.code === "23514" && /tiệm|tenant/i.test(String(e.message)));
        if (laChotTiem) {
          ket.push([con, cot, "CHẶN", `${e.code} ${String(e.message).slice(0, 86)}`]);
          xong = true;
        }
      }
    }
    if (!xong) {
      ket.push([
        con,
        cot,
        "CHƯA ĐO",
        `hỏng vì lý do KHÁC: ${loiCuoi?.code} ${String(loiCuoi?.message).slice(0, 76)}`,
      ]);
    }
  } catch (e) {
    ket.push([con, cot, "CHƯA ĐO", `lỗi phép đo: ${String(e.message).slice(0, 88)}`]);
  }
  await c.query("rollback");
}

await c.end();
console.log("");
for (const [b, k, v, ghi] of ket) {
  const dau = v === "LỌT" ? "🔴" : v === "CHẶN" ? "🟢" : "⚪";
  console.log(`${dau} ${v.padEnd(8)} ${b}.${k}\n            ${ghi}`);
}
const lot = ket.filter((x) => x[2] === "LỌT").length;
const chan = ket.filter((x) => x[2] === "CHẶN").length;
console.log(`\nLỌT ${lot} · CHẶN ${chan} · CHƯA ĐO ${ket.length - lot - chan}`);
process.exit(lot ? 1 : 0);

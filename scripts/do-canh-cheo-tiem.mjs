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


// Chỉ đọc `.env.local` khi thiếu biến, và đọc hỏng thì bỏ qua — file này không
// tồn tại trên CI, đọc thẳng là chết ngay dòng đầu (cùng bệnh với
// `soat-passkey-kho.mjs`, xem chú thích ở đó).
if (!process.env.SUPABASE_DB_URL) {
  try {
    // ⚠️ `\r?\n`, KHÔNG phải `\n`: tách theo `\n` thì dòng kiểu Windows còn sót `\r` ở
    //   đuôi, mà trong regex JavaScript `\r` LÀ ký tự xuống dòng — `.` không khớp nó và
    //   `$` (không cờ `m`) chỉ khớp cuối chuỗi, nên `(.*)$` TRƯỢT sạch mọi dòng CRLF.
    //   Đo 22/08 trên `.env.local` của máy này (37 dòng CRLF + 6 dòng LF): đọc được đúng
    //   1/22 biến rồi dừng ở "thiếu khoá" ⇒ script này CHƯA TỪNG CHẠY ĐƯỢC trên Windows.
    for (const d of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* CI cấp biến qua secrets */
  }
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
  // ── 27 cạnh đang đi qua cửa MIỄN TRỪ mà không có rào nào ở tầng CSDL giữ ──
  // Soát 22/08: cổng `soat-canh-cheo-tiem.mjs` tha 68/126 cạnh chỉ vì tên chúng
  // có trong danh sách miễn trừ — không ai kiểm lý do còn đúng không. 26 cạnh
  // dưới đây khai chung một lý do gộp từ đợt rà 17/08 ("an toàn qua RPC / select
  // trước / RLS chặn ghi thẳng"), mà chính đợt đó ghi 12/63 cạnh KHÔNG an toàn —
  // nên câu gộp ấy không chứng minh được cạnh nào cụ thể. Kiểm lại policy hôm
  // nay: các bảng con này VẪN nhận lệnh ghi thẳng từ client và policy INSERT của
  // chúng KHÔNG nhắc tới cột khoá ngoại ⇒ RLS không thể là thứ đang chặn.
  // Chưa chứng minh là thủng — nên phải ĐO, không suy.
  ["activities", "contact_id", "contacts"],
  ["activities", "deal_id", "deals"],
  ["activities", "project_id", "projects"],
  ["cash_entries", "order_id", "orders"],
  ["cash_entries", "order_payment_id", "order_payments"],
  ["cash_entries", "project_id", "projects"],
  ["contact_identities", "contact_id", "contacts"],
  ["contact_merge_dismissals", "contact_a_id", "contacts"],
  ["contact_merge_dismissals", "contact_b_id", "contacts"],
  ["contact_tags", "contact_id", "contacts"],
  ["contact_tags", "tag_id", "tags"],
  ["contacts", "merged_into_id", "contacts"],
  ["conversations", "channel_id", "channels"],
  ["conversations", "contact_id", "contacts"],
  ["deals", "company_id", "companies"],
  ["deals", "pipeline_id", "pipelines"],
  ["deals", "source_id", "lead_sources"],
  ["deals", "stage_id", "pipeline_stages"],
  ["item_costs", "item_id", "items"],
  ["messages", "conversation_id", "conversations"],
  ["order_lines", "appointment_id", "appointments"],
  ["orders", "parent_order_id", "orders"],
  ["pipeline_stages", "pipeline_id", "pipelines"],
  ["qr_codes", "source_id", "lead_sources"],
  ["quick_reply_usages", "reply_id", "quick_replies"],
  ["source_costs", "source_id", "lead_sources"],
];

/**
 * Vài bảng cha có "trạng thái khoá" — bốc dòng bừa là vớ phải dòng không sửa
 * được, lệnh ghi hỏng vì lý do KHÁC và ta kết luận nhầm là an toàn. Đo 21/08:
 * 18.943/20.082 đơn đang ở trạng thái completed.
 */
const GOI_Y_CHA = { orders: "status in ('draft','confirmed')" };

/**
 * ÉP GIÁ TRỊ CHO NHỮNG CỘT MÀ KIỂU DỮ LIỆU KHÔNG NÓI ĐỦ.
 *
 * ⚠️ Không có bảng này thì phép đo TỰ LÀM MÌNH MÙ. Đo 22/08:
 *   `cash_entries.supplier_payment_id` rơi về CHƯA ĐO suốt, vì bộ điền tự động
 *   đặt `chung_tu = "{}"` (mọi cột jsonb đều nhận `{}`) trong khi CHECK
 *   `cash_entries_chung_tu_hop_le` đòi một MẢNG. Lệnh ghi hỏng ở 23514 trước
 *   khi chạm tới câu hỏi chéo tiệm — và "hỏng vì lý do khác" nghĩa là CHỖ MÙ,
 *   không phải chỗ an toàn.
 *
 * `direction`/`category` cũng ép theo đúng cảnh thật: dòng sổ quỹ sinh từ một
 * lượt trả nhà cung cấp là tiền RA, loại `supplier_payment`. Để bộ tự động
 * chọn 'in'/'sale' là dựng một cảnh không bao giờ xảy ra.
 */
const EP_GIA_TRI = {
  "cash_entries.chung_tu": "[]",
  "cash_entries.direction": "out",
  "cash_entries.category": "supplier_payment",
};

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

/**
 * ⚠️ ĐỌC BẰNG `pg_constraint`, KHÔNG BẰNG `information_schema`.
 *
 * Bản cũ nối `key_column_usage` với `constraint_column_usage` CHỈ theo tên
 * chốt, không theo THỨ TỰ cột. Chốt một cột thì đúng; chốt HAI cột — như
 * `chat_messages (channel_id, tenant_id) → chat_channels (id, tenant_id)` —
 * sinh tích chéo 2×2 = 4 dòng, trong đó 2 dòng ghép SAI cột con với cột cha.
 * `new Map()` lấy dòng cuối, nên phép đo nhét MÃ TIỆM vào cột `channel_id`.
 *
 * Hậu quả đo được 22/08: cạnh `chat_reactions.message_id` rơi về **CHƯA ĐO**
 * suốt, với lời báo "insert or update on chat_messages violates foreign key" —
 * trông y hệt một chốt đang làm việc, thật ra là phép đo tự bắn vào chân mình.
 * Cùng một lỗi đã tìm thấy ở `rls-smoke.mjs` cùng ngày.
 *
 * ⚠️ "CHƯA ĐO" KHÔNG PHẢI "AN TOÀN". Một cạnh chưa đo được là một cạnh chưa
 *   biết — và chỗ chưa biết thì không được đếm vào cột đã chặn.
 */
async function khoaNgoai(bang) {
  const { rows } = await c.query(
    `select att.attname as column_name, fnsp.nspname as sc,
            frel.relname as bang_cha, fatt.attname as cot_cha
       from pg_constraint con
       join pg_class rel on rel.oid = con.conrelid
       join pg_namespace nsp on nsp.oid = rel.relnamespace and nsp.nspname = 'public'
       join pg_class frel on frel.oid = con.confrelid
       join pg_namespace fnsp on fnsp.oid = frel.relnamespace
       join lateral unnest(con.conkey, con.confkey) with ordinality as u(k, fk, ord) on true
       join pg_attribute att on att.attrelid = con.conrelid and att.attnum = u.k
       join pg_attribute fatt on fatt.attrelid = con.confrelid and fatt.attnum = u.fk
      where con.contype = 'f' and rel.relname = $1`,
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

/**
 * NGƯỜI ĐANG ĐÓNG VAI — dùng cho mọi cột trỏ sang `auth.users`.
 *
 * ⚠️ ĐỪNG TRA `auth.users`. Sau khi phép đo đổi sang vai `authenticated` thì
 *   bảng đó không đọc được ("permission denied for table users"), và cạnh nào
 *   có cột người dùng bắt buộc — như `chat_reactions.user_id`, đi qua
 *   `chat_messages.sender_user_id` — rơi thẳng về CHƯA ĐO. Đo được 22/08.
 *
 * ⚠️ Dùng chính người của tiệm A cũng ĐÚNG VỀ NGHĨA: dòng đang thử ghi là dòng
 *   do người ấy tạo. Tra một người bất kỳ trong bảng lại là dựng một cảnh không
 *   bao giờ xảy ra.
 */
let nguoiDangDong = null;

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
      if (f.sc === "auth" && f.bang === "users" && nguoiDangDong) {
        gt[n] = nguoiDangDong;
        continue;
      }
      gt[n] =
        (await motDong(`${f.sc}.${f.bang}`, f.cot, tenant, lan)) ??
        (await motDong(`${f.sc}.${f.bang}`, f.cot, tenant, 0));
      continue;
    }
    gt[n] =
      EP_GIA_TRI[`${bang}.${n}`] ??
      (await giaTriHopLe(bang, n)) ??
      buTheoKieu(col.data_type, col.udt_name);
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

    nguoiDangDong = nguoi[0].user_id;

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
        /**
         * LOẠI BẰNG CHỨNG THỨ BA — KHOÁ DUY NHẤT TRÊN ĐÚNG CỘT KHOÁ NGOẠI.
         *
         * Đo 22/08 ở `cash_entries.supplier_payment_id`. Chuỗi lập luận:
         *   · `cash_entries.supplier_payment_id` có khoá DUY NHẤT ⇒ mỗi lượt
         *     trả nhà cung cấp chỉ được MỘT dòng sổ quỹ trỏ tới;
         *   · trigger `supplier_payments_emit_cash` sinh dòng đó NGAY khi lượt
         *     trả ra đời ⇒ ô ấy luôn có chủ từ giây đầu tiên;
         *   · xoá dòng sổ quỹ bị chặn (`so_quy_khong_duoc_xoa_dong_tien`) ⇒ ô
         *     ấy KHÔNG BAO GIỜ trống lại.
         * ⇒ Tiệm A không thể trỏ sang lượt trả của tiệm B, không phải vì RLS mà
         *   vì chỗ đó đã có chủ vĩnh viễn. Cạnh này KÍN, chỉ là kín theo kiểu khác.
         *
         * ⚠️ CHỈ nhận khi khoá duy nhất nằm trên ĐÚNG cột khoá ngoại đang đo
         *   (`loaiTru` khác null). Nhận bừa mọi 23505 là biến một lỗi trùng dữ
         *   liệu tình cờ thành một kết luận an toàn giả — đúng thứ tệ nhất mà
         *   phép đo này có thể sinh ra.
         */
        const laKhoaDuyNhat = e.code === "23505" && loaiTru !== null;
        /**
         * ⚠️ 23503 (vi phạm khoá ngoại) CHỈ được tính là chặn-cùng-tiệm khi tên
         *   ràng buộc kết thúc bằng `_cung_tiem` — tức khoá ngoại GHÉP hai cột
         *   `(cột, tenant_id)` mà bản vá #359 dựng lên.
         *
         *   VÌ SAO PHẢI KHOÁ THEO TÊN, không nhận bừa mọi 23503: một lệnh ghi
         *   trỏ tới bản ghi cha KHÔNG TỒN TẠI cũng trả về 23503. Nhận bừa thì
         *   phép đo tự biến "cha không có thật" thành "đã chặn chéo tiệm" — y
         *   hệt cái bẫy 23505 ghi ngay phía trên.
         *
         *   Không có nhánh này thì sau #359 cả 18 cạnh vừa vá rơi hết về CHƯA
         *   ĐO (đo thật 22/08). Chỗ mù trông y hệt chỗ thủng — và lần sau sẽ có
         *   người kết luận nhầm theo cả hai hướng.
         */
        const laKhoaGhepCungTiem =
          e.code === "23503" && /_cung_tiem"?\s*$|_cung_tiem"/.test(String(e.message));
        const laChotTiem =
          e.code === "42501" ||
          (e.code === "23514" && /tiệm|tenant/i.test(String(e.message))) ||
          laKhoaGhepCungTiem;
        if (laChotTiem || laKhoaDuyNhat) {
          ket.push([
            con,
            cot,
            "CHẶN",
            laKhoaDuyNhat
              ? `23505 khoá duy nhất trên chính cột này — chỗ đó luôn có chủ, không chen vào được`
              : `${e.code} ${String(e.message).slice(0, 86)}`,
          ]);
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

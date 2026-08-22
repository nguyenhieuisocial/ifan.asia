/**
 * SO CẤU TRÚC KHO THẬT với CẤU TRÚC DỰNG TỪ BẢN VÁ — lệch là đỏ.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ CỔNG NÀY — một lỗi thật, chỉ lộ ra khi DỰNG LẠI
 * ═══════════════════════════════════════════════════════════════════
 * Ngày 22/08 dựng kho kiểm riêng bằng cách áp lại toàn bộ bản vá lên một dự án
 * trống, rồi so từng đối tượng với kho thật. Kết quả:
 *   180 bảng · 1.659 cột · 494 chỉ mục · 681 hàm · 279 chính sách · 206 chốt
 *   → giống hệt nhau.
 *   985 vs 984 ràng buộc → **lệch đúng một cái**: `report_shares_payload_gon`.
 *
 * Nó có trên kho thật, không nằm trong bản vá nào — tức được áp thẳng, không
 * qua sổ. Ngày nào phải dựng lại kho (đổi vùng, khôi phục sau sự cố, tách kho
 * kiểm) thì nó **biến mất trong im lặng**: không lỗi, không cảnh báo, chỉ là
 * một lớp bảo vệ không còn ở đó nữa.
 *
 * ⚠️ Kho này từng có **44 bản áp thẳng không ghi sổ** (đã ghi trong sổ sự thật).
 *   Cổng này là thứ ngăn chuyện đó tái diễn mà không ai biết.
 *
 * ⚠️ SO CẢ ĐỊNH NGHĨA, KHÔNG CHỈ SO TÊN. Bản đầu của phép đo này chỉ đối chiếu
 *   TÊN chỉ mục — và nó báo "494 = 494, khớp" trong khi một chỉ mục có thể cùng
 *   tên mà khác hẳn ruột (có điều kiện / không điều kiện, khác cột, khác thứ
 *   tự). So tên là phép đo tự trấn an mình.
 *
 * Chạy: KHO_KIEM_DB_URL="…" node scripts/soat-lech-cau-truc.mjs
 * Thiếu biến ⇒ BỎ QUA và thoát 0 (chưa phải môi trường nào cũng có kho thứ hai).
 */
import { readFileSync } from "node:fs";
import pg from "pg";

function napEnv() {
  if (process.env.SUPABASE_DB_URL && process.env.KHO_KIEM_DB_URL) return;
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (i <= 0 || line.startsWith("#")) continue;
      const k = line.slice(0, i);
      if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* CI cấp biến qua secrets — không có file là bình thường */
  }
}
napEnv();

const THAT = process.env.SUPABASE_DB_URL;
const KIEM = process.env.KHO_KIEM_DB_URL;
if (!THAT || !KIEM) {
  console.log("[lech-cau-truc] Thiếu SUPABASE_DB_URL hoặc KHO_KIEM_DB_URL — bỏ qua.");
  process.exit(0);
}
if (THAT === KIEM) {
  console.error("[lech-cau-truc] ❌ Hai biến trỏ vào CÙNG một kho — phép so vô nghĩa.");
  process.exit(1);
}

const ca = readFileSync("supabase/supabase-ca.crt", "utf8");
const noi = (u) => new pg.Client({ connectionString: u, ssl: { ca, rejectUnauthorized: true } });

/**
 * ⚠️ Mỗi câu trả về CẢ ĐỊNH NGHĨA, không chỉ tên. Xem chú thích đầu file.
 * ⚠️ Bỏ qua bảng sổ migration: hai kho khác nhau ở đó là chuyện đương nhiên.
 */
const Q = {
  "bảng": "select table_name k, '' d from information_schema.tables where table_schema='public'",
  "cột": `select table_name||'.'||column_name k,
            data_type||'|'||coalesce(column_default,'-')||'|'||is_nullable d
          from information_schema.columns where table_schema='public'`,
  "ràng buộc": `select cl.relname||'.'||con.conname k, pg_get_constraintdef(con.oid) d
                from pg_constraint con
                join pg_class cl on cl.oid=con.conrelid
                join pg_namespace n on n.oid=cl.relnamespace
                where n.nspname='public'`,
  "chỉ mục": "select tablename||'.'||indexname k, indexdef d from pg_indexes where schemaname='public'",
  /**
   * ⚠️ BA CHỖ SỬA NGÀY 22/08, cả ba đều là lỗi của PHÉP ĐO chứ không phải của kho.
   * Trước khi sửa, câu này báo 5 hàm "khác ruột"; soi ra 2 trong 5 là báo nhầm.
   *
   * ① KHOÁ PHẢI KÈM KIỂU THAM SỐ, không phải `tên/số-tham-số`.
   *    `proname||'/'||pronargs` KHÔNG duy nhất: kho thật có 6 khoá bị trùng, ví dụ
   *    `texticnlike/2` ứng với CẢ HAI hàm `(citext,text)` và `(citext,citext)`.
   *    Hai hàng cùng khoá rơi vào cùng một ô Map ⇒ hàng sau đè hàng trước, mà thứ
   *    tự trả về của hai kho không nhất thiết giống nhau ⇒ báo lệch trong khi hai
   *    kho giống hệt. Tệ hơn chuyện báo nhầm: chiều ngược lại nó CHE drift thật —
   *    `nap_mat/3` (hàm của iFan, không phải extension) cũng nằm trong nhóm trùng
   *    khoá đó, một trong hai bản có thể trôi mà phép đo không thấy.
   *
   * ② BỎ HÀM THUỘC TIỆN ÍCH MỞ RỘNG (`pg_depend.deptype='e'`).
   *    268/693 hàm trong `public` là của extension (btree_gist, citext, pgmq,
   *    pg_trgm, pgcrypto…), không phải do iFan viết và không nằm trong bản vá nào.
   *    Chúng đổi khi bản extension đổi — không có gì để "ghi sổ", và bắt người ta
   *    đi vá một hàm của citext là chỉ dẫn sai. Đã kiểm: trong `public` CHỈ có hàm
   *    thuộc extension, không có bảng/chỉ mục/ràng buộc nào — nên chỉ lọc ở đây.
   *
   * ③ BỎ KÝ TỰ CR TRƯỚC KHI BĂM.
   *    Thân hàm plpgsql giữ NGUYÊN xuống dòng của file bản vá. 8 file bản vá đang
   *    là CRLF, số còn lại LF (git autocrlf trên Windows). Cùng một hàm áp từ hai
   *    lần checkout khác nhau ra hai chuỗi khác nhau ⇒ md5 khác ⇒ báo lệch, trong
   *    khi PL/pgSQL chạy y hệt. `platform_status/1` lệch đúng vì lý do này: kho
   *    thật LF, kho kiểm CRLF, ngoài ra không khác một ký tự nào.
   */
  "hàm": `select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k,
            md5(replace(pg_get_functiondef(p.oid), chr(13), '')) d
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.prokind in ('f','p')
            and not exists (select 1 from pg_depend dep
                             where dep.objid = p.oid
                               and dep.classid = 'pg_proc'::regclass
                               and dep.deptype = 'e')`,
  "chính sách": `select tablename||'.'||policyname k,
                   cmd||'|'||coalesce(qual,'-')||'|'||coalesce(with_check,'-') d
                 from pg_policies where schemaname='public'`,
  "chốt": `select c2.relname||'.'||t.tgname k, pg_get_triggerdef(t.oid) d
           from pg_trigger t join pg_class c2 on c2.oid=t.tgrelid
           join pg_namespace n on n.oid=c2.relnamespace
           where n.nspname='public' and not t.tgisinternal`,
};

const a = noi(THAT);
const b = noi(KIEM);
await a.connect();
await b.connect();
await a.query("set lock_timeout='10s'");
await b.query("set lock_timeout='10s'");

let lech = 0;
for (const [ten, sql] of Object.entries(Q)) {
  const A = new Map((await a.query(sql)).rows.map((r) => [r.k, r.d]));
  const B = new Map((await b.query(sql)).rows.map((r) => [r.k, r.d]));
  const thieu = [...A.keys()].filter((x) => !B.has(x));
  const thua = [...B.keys()].filter((x) => !A.has(x));
  const khacRuot = [...A.keys()].filter((x) => B.has(x) && A.get(x) !== B.get(x));
  const tong = thieu.length + thua.length + khacRuot.length;
  lech += tong;
  console.log(
    `  ${tong === 0 ? "ĐẠT  " : "LỆCH "} ${ten.padEnd(11)} thật=${A.size} kiểm=${B.size}` +
      (tong ? ` · thiếu ${thieu.length} · thừa ${thua.length} · khác ruột ${khacRuot.length}` : ""),
  );
  const in10 = (nhan, ds) => ds.length && console.log(`      ${nhan}: ` + ds.slice(0, 10).join(", ") + (ds.length > 10 ? ` … +${ds.length - 10}` : ""));
  in10("CHỈ có ở kho thật (thiếu bản vá?)", thieu);
  in10("CHỈ có ở kho kiểm (bản vá thừa?)", thua);
  in10("cùng tên KHÁC RUỘT", khacRuot);
}
await a.end();
await b.end();

if (lech === 0) {
  console.log("\n✅ Cấu trúc kho thật KHỚP với cấu trúc dựng từ bản vá.");
  process.exit(0);
}
console.error(`\n❌ ${lech} chỗ lệch.

   Lệch nghĩa là một trong hai:
     · kho thật có thứ KHÔNG nằm trong bản vá nào ⇒ dựng lại kho là mất nó, im lặng;
     · hoặc bản vá tạo ra thứ kho thật không có ⇒ có bản chưa áp.
   Cả hai đều phải xử, không được ghi chú rồi bỏ qua.`);
process.exit(1);

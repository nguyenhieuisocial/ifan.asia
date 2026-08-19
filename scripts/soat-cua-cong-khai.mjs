#!/usr/bin/env node
/**
 * Cổng canh CỬA CÔNG KHAI — hàm nào người CHƯA ĐĂNG NHẬP gọi được.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Khoá `anon` nằm CÔNG KHAI trong mã chạy ở trình duyệt — ai mở web cũng đọc
 * được. Nên "cấp quyền cho anon" đọc đúng là "cho cả thế giới gọi". Ngày 19/08
 * chuyện này xảy ra HAI lần trong một ngày, cùng một kiểu hại:
 *
 *   · `heartbeat_touch` (#182) — ai cũng giữ được cho một nhịp ĐÃ CHẾT trông
 *     như còn sống ⇒ vô hiệu hoá đúng cái đồng hồ vừa dựng để chống im lặng.
 *   · Sáu việc chạy nền (#190) — trong đó `release_digest()` hút sạch hàng đợi
 *     bản tin lên bản: gọi một phát là bản tin của lượt đó biến mất, không ai
 *     biết. Đúng thứ đã chết câm 12 tiếng sáng cùng ngày.
 *
 * Cả hai đều KHÔNG lộ dữ liệu tiệm. Hại của chúng là **làm cho tiếng chuông
 * nói dối** — thứ khó thấy hơn hẳn rò rỉ, vì bảng nào cũng vẫn xanh.
 *
 * Và cả hai đều lọt qua đợt rà quyền trước đó (việc #134), vì lúc ấy soát
 * "hàm có đọc rộng hơn quyền trong app không" — tức là soát RÒ RỈ. Không ai
 * hỏi "cửa này ai đi được". Cổng này hỏi đúng câu đó, mỗi lượt kiểm.
 *
 * ═══════════════════════════════════════════════════════════════════
 * HAI LUẬT
 * ═══════════════════════════════════════════════════════════════════
 * LUẬT A — Hàm `security definer` mà `anon` gọi được thì PHẢI có chốt bên
 *   trong: đòi khoá riêng, hoặc kiểm vai/kiểm người đăng nhập/kiểm tiệm. Không
 *   có chốt nào thì phải được KHAI TRƯỚC ở bảng dưới, kèm LÝ DO.
 *
 * LUẬT B — Hàm nào có lịch trong bộ hẹn giờ (`cron.job`) thì `anon` KHÔNG được
 *   gọi. Việc chạy nền có nhịp của nó; cho người ngoài giật dây là làm hỏng
 *   chính cái nhịp đó.
 *
 * ⚠️ GIỚI HẠN, nói thẳng: cổng này đọc THÂN HÀM tìm dấu hiệu có chốt, không
 * chứng minh cái chốt đó đúng. Nó bắt được kiểu "quên hẳn", không bắt được
 * "chốt sai". Muốn chắc thì phải có ca nghiệm thu riêng cho từng cửa.
 */
import pg from "pg";

const KET_NOI = process.env.SUPABASE_DB_URL;
if (!KET_NOI) {
  console.error("Thiếu SUPABASE_DB_URL");
  process.exit(1);
}

/**
 * Hàm KHÔNG có chốt bên trong nhưng vẫn được phép mở — mỗi dòng phải có lý do
 * đọc hiểu được. Thêm dòng vào đây là một QUYẾT ĐỊNH, không phải thao tác cho
 * cổng hết đỏ.
 */
const KHAI_TRUOC = {
  qr_gen_code:
    "Giá trị mặc định của cột `qr_codes.code`, chạy bằng vai người đang chèn — thu quyền là gãy việc tạo mã QR. Chỉ sinh chuỗi ngẫu nhiên, không đọc gì.",
  contact_duplicate_count:
    "Chỉ đếm trên `contact_duplicate_base()`, mà hàm đó ĐÃ kiểm vai + tiệm. Người chưa đăng nhập nhận về 0.",
  qr_resolve:
    "Cửa quét mã QR của khách — bắt buộc mở cho người chưa đăng nhập. Tự có chốt riêng: chỉ trả mã đang bật, và chặn 20 lượt/phút cho mỗi cặp (mã + thiết bị), băm IP chứ không lưu IP thô.",
  storefront_view:
    "Trang mặt tiền tiệm, ai cũng phải xem được. Chỉ trả dữ liệu khi chủ tiệm ĐÃ BẬT mặt tiền, và chỉ trả đúng những ô đã bật — không trả cả danh mục.",
  contact_duplicate_pairs:
    "Cũng đọc qua `contact_duplicate_base()` đã có chốt; người chưa đăng nhập nhận danh sách rỗng.",
};

const c = new pg.Client({ connectionString: KET_NOI, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("set lock_timeout = '10s'");

const { rows: ham } = await c.query(`
  select p.proname,
         pg_get_function_identity_arguments(p.oid) as args,
         coalesce(p.prosrc, '') as src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and p.prosecdef
     and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('anon', p.oid, 'execute')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
   order by p.proname`);

const { rows: viec } = await c.query(`select jobname, command from cron.job`);

// Dấu hiệu "có chốt": đòi khoá riêng, hoặc kiểm người/vai/tiệm.
const CO_CHOT = /bot_ingest_key|p_ingest_key|p_key\b|embed_key|p_token|app_role\s*\(\)|auth\.uid\s*\(\)|current_tenant_id\s*\(\)/i;

const loi = [];
let nKhai = 0;

for (const h of ham) {
  if (CO_CHOT.test(h.src)) continue;
  if (KHAI_TRUOC[h.proname]) {
    nKhai += 1;
    continue;
  }
  loi.push([
    `${h.proname}(${h.args})`,
    "anon gọi được nhưng KHÔNG thấy chốt nào bên trong, cũng chưa khai ở KHAI_TRUOC (luật A)",
  ]);
}

// LUẬT B — việc hẹn giờ không được mở cho anon.
for (const v of viec) {
  const m = /public\.([a-z0-9_]+)\s*\(/i.exec(v.command);
  if (!m) continue;
  const {
    rows: [q],
  } = await c.query(
    `select has_function_privilege('anon', p.oid, 'execute') as mo
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1 limit 1`,
    [m[1]],
  );
  if (q?.mo) {
    loi.push([
      `${m[1]}()`,
      `việc hẹn giờ "${v.jobname}" nhưng anon vẫn gọi được — người ngoài giật được dây chuông (luật B)`,
    ]);
  }
}

await c.end();

if (loi.length === 0) {
  console.log(
    `✅ ${ham.length} cửa công khai — tất cả đều có chốt bên trong (${nKhai} cửa khai trước kèm lý do), và không việc hẹn giờ nào mở cho người lạ.`,
  );
  process.exit(0);
}

console.error(`❌ ${loi.length} cửa công khai chưa an toàn:`);
for (const [ten, ly] of loi) console.error(`   · ${ten} — ${ly}`);
console.error("");
console.error("   Khoá `anon` nằm công khai trong mã trình duyệt: mở cho anon = mở cho cả");
console.error("   thế giới. Xem đầu file để biết hai lần chuyện này đã xảy ra và hại thế nào.");
process.exit(1);

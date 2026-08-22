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
 * VÌ SAO CÓ THÊM LUẬT C (19/08, sau khi đo được 4 lỗ CHÉO TIỆM)
 * ═══════════════════════════════════════════════════════════════════
 * Cổng này ban đầu chỉ canh lớp `anon`. Lớp `authenticated` KHÔNG ai canh —
 * và 4 lỗ chéo tiệm đã sống ở đó nhiều tuần: người vai THẤP NHẤT của tiệm A
 * gọi được hàm nội bộ để đọc cấu hình điểm của tiệm B, xoá điểm khách của tiệm
 * B, triệt tiêu hoa hồng nhân viên của tiệm B (#196).
 *
 * Nguyên nhân gốc là lỗi CƠ CHẾ, không phải sơ ý lẻ: Postgres cấp EXECUTE cho
 * `PUBLIC` trên MỌI hàm mới, và Supabase cho `anon`/`authenticated`/
 * `service_role` thuộc `PUBLIC`. Migration viết
 *
 *     revoke execute on function public.<ham>(...) from public, anon;
 *
 * thu quyền của `public` và `anon` — nhưng `authenticated` đã được cấp RIÊNG
 * nên GIỮ NGUYÊN quyền. Đọc câu lệnh thì tưởng đã khoá; ĐO mới ra sự thật. Đây
 * là lần thứ HAI cùng cơ chế cắn (lần trước: #191, `rls_auto_enable`).
 *
 * ⇒ Vì thế cổng này ĐO quyền bằng `has_function_privilege`, TUYỆT ĐỐI không
 *   suy từ câu `revoke` trong file migration — đó chính là cái đã lừa mọi người.
 *
 * ═══════════════════════════════════════════════════════════════════
 * BA LUẬT
 * ═══════════════════════════════════════════════════════════════════
 * LUẬT A — Hàm `security definer` mà `anon` gọi được thì PHẢI có chốt bên
 *   trong: đòi khoá riêng, hoặc kiểm vai/kiểm người đăng nhập/kiểm tiệm. Không
 *   có chốt nào thì phải được KHAI TRƯỚC ở bảng dưới, kèm LÝ DO.
 *
 * LUẬT B — Hàm nào có lịch trong bộ hẹn giờ (`cron.job`) thì `anon` KHÔNG được
 *   gọi. Việc chạy nền có nhịp của nó; cho người ngoài giật dây là làm hỏng
 *   chính cái nhịp đó.
 *
 * LUẬT C — Hàm `security definer` mà `authenticated` gọi được thì PHẢI có ít
 *   nhất một chốt: lọc tiệm (`current_tenant_id()` dùng trong mệnh đề
 *   lọc/so sánh), hoặc đòi khoá riêng (tham số `p_key`/`p_ingest_key`/
 *   `p_embed_key`/`p_token`), hoặc chốt theo người gọi (`auth.uid()` /
 *   `is_platform_admin()` dùng để KIỂM, không chỉ để ghi giá trị). Không có
 *   chốt nào thì phải khai ở `KHAI_TRUOC_C` kèm LÝ DO.
 *
 * ⚠️ GIỚI HẠN, nói thẳng: cổng này đọc THÂN HÀM tìm dấu hiệu có chốt, không
 * chứng minh cái chốt đó đúng. Nó bắt được kiểu "quên hẳn", không bắt được
 * "chốt sai". Muốn chắc thì phải có ca nghiệm thu riêng cho từng cửa.
 *
 * ⚠️ BA CHỖ MÙ CỦA RIÊNG LUẬT C — phải biết trước khi tin nó:
 *   1. LỌC MỘT NỬA. Hàm có `where tenant_id = current_tenant_id()` ở câu này
 *      nhưng câu khác lại `where id = p_x` trống trơn thì cổng vẫn XANH. Đúng
 *      kiểu của `loyalty_settle_return` (#196) — may là hàm đó không có chốt
 *      nào cả nên vẫn bị bắt.
 *   2. KHÔNG NHÌN XUYÊN LỜI GỌI. Hàm A gọi hàm B đã kiểm đủ thì cổng vẫn coi A
 *      là trống (vd `contact_duplicate_count` → `contact_duplicate_base`).
 *      Chữa bằng khai trước, không chữa bằng nới luật.
 *   3. PHÂN BIỆT "KIỂM" VỚI "GHI GIÁ TRỊ" BẰNG TỪ KHOÁ GẦN NHẤT. `auth.uid()`
 *      sau `where`/`if` được tính là KIỂM; sau `set`/`values`/`:=` thì không
 *      (trừ khi biến được gán đó về sau có bị kiểm). Đây là phép ĐOÁN theo
 *      chữ, không phải phân tích cú pháp — viết lắt léo là lừa được nó.
 *
 * ĐÃ THỬ NGƯỢC: cho 5 hàm của #196 chạy qua LUẬT C ⇒ cả 5 đều ĐỎ. Tức luật này
 * bắt được đúng lứa lỗ đã xảy ra thật, chứ không phải luật chép cho đẹp.
 */
import pg from "pg";
import { readFileSync } from "node:fs";

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
  thu_nghiem_hom_nay:
    "Chỉ nhận MỘT trong bốn đường dẫn công khai đã khai cứng, rồi trả về đúng CHỮ TRÊN NÚT mà chính trang đó đang hiện cho mọi người. Không đọc dữ liệu của tiệm nào và không có tham số nào trỏ được sang tiệm khác: gọi bằng đường dẫn lạ thì trả rỗng, gọi bằng đường dẫn thật thì nhận lại đúng thứ đã nhìn thấy (#336).",
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
  storefront_slots:
    "Cửa đọc giờ trống của trang khách tự đặt lịch — bắt buộc mở cho người chưa đăng nhập (#290). CÓ lọc tiệm thật: `private.storefront_resolve(p_slug)` ra tiệm rồi mọi câu đều kèm `tenant_id = v_tenant.id`; cổng không thấy vì chốt đi qua biến chứ không gọi thẳng `current_tenant_id()`. Chỉ trả khi tiệm ĐÃ BẬT mặt tiền VÀ ĐÃ BẬT đặt lịch, và chỉ trả giờ trống của đúng một dịch vụ đang bán.",
  storefront_book:
    "Cửa ghi của trang khách tự đặt lịch, mở công khai là có chủ ý (#290). Cùng kiểu chốt với `storefront_submit_lead`: lọc tiệm qua biến từ `private.storefront_resolve(p_slug)`, đòi tiệm đã bật đặt lịch, chặn 5 lượt/giờ mỗi (tiệm,IP) và 60 lượt/giờ mỗi tiệm.",
};

/**
 * Khai trước cho LUẬT C — hàm `authenticated` gọi được mà cổng KHÔNG thấy chốt.
 * Bảng riêng chứ không dùng chung với `KHAI_TRUOC`: câu hỏi khác nhau. LUẬT A
 * hỏi "vì sao người LẠ đi được cửa này"; LUẬT C hỏi "vì sao người đăng nhập gọi
 * được mà không sợ chéo tiệm". Cùng một hàm có thể an toàn ở câu này và không ở
 * câu kia, nên bắt viết lý do hai lần là CỐ Ý.
 */
const KHAI_TRUOC_C = {
  thu_nghiem_hom_nay:
    "Đã khai ở LUẬT A vì mở cho cả người chưa đăng nhập. Người đăng nhập gọi được chỉ là tập con của người lạ gọi được, nên không thêm đường chéo tiệm nào.",
  qr_gen_code:
    "Chỉ sinh chuỗi ngẫu nhiên cho cột `qr_codes.code`, không đọc bảng nào — không có gì để lọc theo tiệm.",
  qr_resolve:
    "Cửa quét mã QR, mở cho cả người CHƯA đăng nhập là có chủ ý (đã khai ở LUẬT A). Người đăng nhập gọi được chỉ là tập con của người lạ gọi được, nên không thêm đường chéo tiệm nào.",
  storefront_view:
    "Trang mặt tiền tiệm, ai cũng phải xem được (đã khai ở LUẬT A). Chỉ trả ô mà chủ tiệm ĐÃ BẬT, và chỉ của đúng tiệm ứng với slug.",
  storefront_submit_lead:
    "Form nhận khách ở trang mặt tiền, mở công khai là có chủ ý. CÓ lọc tiệm thật: `private.storefront_resolve(p_slug)` ra tiệm rồi mọi câu đều kèm `tenant_id = v_tenant.id` — cổng không thấy vì chốt đi qua biến chứ không gọi thẳng `current_tenant_id()`.",
  storefront_slots:
    "Trang khách tự đặt lịch, ai cũng phải xem được (đã khai ở LUẬT A). Người đăng nhập gọi được chỉ là tập con của người lạ gọi được — không thêm đường chéo tiệm nào, vì tiệm được chốt bằng slug chứ không bằng tham số uuid.",
  storefront_book:
    "Cùng lý do với `storefront_slots`: tiệm resolve từ slug rồi lọc qua biến, không có tham số nào cho phép trỏ sang tiệm khác.",
  contact_duplicate_count:
    "Chỉ đếm trên `contact_duplicate_base()`, mà hàm đó ĐÃ kiểm vai + lọc tiệm bằng `current_tenant_id()`. Cổng không nhìn xuyên qua lời gọi hàm khác (chỗ mù 2).",
  contact_duplicate_pairs:
    "Cũng đọc qua `contact_duplicate_base()` đã có chốt — cùng lý do trên.",
};

// TLS verify-full với CA Supabase đã ghim — GIỐNG 22 script còn lại của kho.
// Bản đầu để `rejectUnauthorized: false`, và đây là script DUY NHẤT làm vậy:
// chuỗi kết nối mang mật khẩu CSDL và chạy trong CI. Một cổng canh an ninh
// mà tự tắt phần kiểm chứng của chính nó là chuyện khó biện minh nhất.
const caPath = new URL("../supabase/supabase-ca.crt", import.meta.url);
const c = new pg.Client({
  connectionString: KET_NOI,
  ssl: { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true },
});
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

// LUẬT C đo lớp `authenticated` — ĐO quyền thật, không đọc câu `revoke`.
const { rows: hamAuth } = await c.query(`
  select p.proname,
         pg_get_function_identity_arguments(p.oid) as args,
         coalesce(p.prosrc, '') as src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and p.prosecdef
     and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('authenticated', p.oid, 'execute')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
   order by p.proname`);

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

// ═══════════════════════════════════════════════════════════════════
// LUẬT C — hàm `authenticated` gọi được phải có chốt
// ═══════════════════════════════════════════════════════════════════

/** Bỏ chú thích và mở gói `(select f())` — kho này viết chốt theo lối đó rất nhiều. */
function chuanHoa(src) {
  let s = src.toLowerCase().replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  for (let i = 0; i < 5; i += 1) s = s.replace(/\(\s*select\s+/g, "(");
  return s;
}

/** Từ khoá mở mệnh đề — dùng để đoán chỗ đứng của một biểu thức. */
const TU_KHOA =
  /\b(where|and|or|on|having|when|if|elsif|elseif|exists|then|case|set|values|into|select|update|insert|delete|from|declare|returning|return|perform|coalesce|nullif)\b|:=/gi;
/** Chỉ những mệnh đề này mới tính là ĐANG KIỂM, phần còn lại là ghi giá trị. */
const MENH_DE_KIEM = new Set([
  "where", "and", "or", "on", "having", "when", "if", "elsif", "elseif", "exists", "then", "case",
]);

function menhDeGanNhat(truoc) {
  const re = new RegExp(TU_KHOA.source, "gi");
  let cuoi = null;
  let m;
  while ((m = re.exec(truoc))) cuoi = m[0].toLowerCase().trim();
  return cuoi;
}

/** Biểu thức `mau` có lần nào đứng trong mệnh đề KIỂM không? */
function dungDeKiem(s, mau) {
  for (const m of s.matchAll(new RegExp(mau, "gi"))) {
    const k = menhDeGanNhat(s.slice(Math.max(0, m.index - 400), m.index));
    if (k && MENH_DE_KIEM.has(k)) return true;
  }
  return false;
}

/** `v_x uuid := current_tenant_id()` rồi về sau KIỂM `v_x` — vẫn là chốt. */
function ganRoiKiem(s, mau) {
  const re = new RegExp(
    "\\b([a-z_][a-z0-9_]*)(?:\\s+[a-z][a-z0-9_\\[\\]]*)?\\s*:=\\s*\\(*\\s*(?:" + mau + ")",
    "gi",
  );
  for (const g of s.matchAll(re)) {
    const conLai = s.slice(0, g.index) + " " + s.slice(g.index + g[0].length);
    if (dungDeKiem(conLai, "\\b" + g[1] + "\\b")) return true;
  }
  return false;
}

const TIEM = "(?:public\\.)?current_tenant_id\\s*\\(\\)";
const NGUOI = "auth\\.uid\\s*\\(\\)";
const QUAN_TRI = "(?:public\\.)?is_platform_admin\\s*\\(\\)";
/**
 * ⚠️ KIỂM VAI CŨNG LÀ MỘT CHỐT — VÀ CỔNG NÀY TỪNG KHÔNG NHÌN THẤY NÓ.
 *   Đo 22/08: `dat_thuong_hieu` chốt bằng
 *   `if public.app_role() not in ('owner','admin') then return forbidden`.
 *   Đó là một chốt rõ ràng và đúng, nhưng cổng vẫn báo "KHÔNG thấy chốt nào"
 *   vì nó chỉ tìm `current_tenant_id()`, `auth.uid()` và `is_platform_admin()`.
 *   Một cổng an ninh báo oan là một cổng người ta học cách khai miễn trừ —
 *   và tới lúc đó danh sách miễn trừ dài ra, cổng thành vô dụng.
 */
const VAI = "(?:public\\.)?app_role\\s*\\(\\)";
const KHOA_RIENG = /\bp_(key|ingest_key|embed_key|token)\b/i;

/**
 * HÀM CHỐT HỘ — gọi một trong những hàm này TỨC LÀ đã có chốt.
 *
 * ⚠️ ĐÂY LÀ DANH SÁCH HÀM ĐƯỢC CHỐT, KHÔNG PHẢI DANH SÁCH HÀM ĐƯỢC THA. Khác
 *   nhau ở chỗ: một dòng thêm vào đây phải là một hàm mà TỰ NÓ kiểm quyền, và
 *   nó bao luôn mọi hàm gọi nó — kể cả hàm viết sau này. Còn `KHAI_TRUOC_C` là
 *   tha cho ĐÚNG MỘT hàm, và mỗi hàm mới lại phải tha thêm một lần.
 *   Cổng vốn tự khai chỗ mù này ("cổng không nhìn xuyên qua lời gọi hàm khác");
 *   đây là cách bịt nó mà không phải nới lỏng gì.
 */
const HAM_CHOT_HO = {
  contact_duplicate_base:
    "Tự kiểm vai + lọc tiệm bằng current_tenant_id() ngay trong thân hàm.",
  tiem_neu_xem_duoc_tien:
    "Trả mã tiệm CHỈ KHI người gọi là chủ/quản trị/quản lý, ngược lại trả null — nơi gọi dùng chính giá trị null đó để trả về rỗng (#347).",
};

let nKhaiC = 0;
for (const h of hamAuth) {
  const s = chuanHoa(h.src);
  const khoa = KHOA_RIENG.exec(h.args);
  // Khoá riêng chỉ tính là chốt khi thân hàm THẬT SỰ đụng tới nó.
  if (khoa && new RegExp(`\\b${khoa[0]}\\b`, "i").test(s)) continue;
  if (dungDeKiem(s, TIEM) || ganRoiKiem(s, TIEM)) continue;
  if (
    dungDeKiem(s, NGUOI) || ganRoiKiem(s, NGUOI) ||
    dungDeKiem(s, QUAN_TRI) || ganRoiKiem(s, QUAN_TRI) ||
    dungDeKiem(s, VAI) || ganRoiKiem(s, VAI)
  ) continue;
  // Gọi một hàm ĐÃ CHỐT HỘ thì cũng là có chốt — xem HAM_CHOT_HO ở trên.
  if (Object.keys(HAM_CHOT_HO).some((ten) => new RegExp(`\\b${ten}\\s*\\(`).test(s))) continue;
  if (KHAI_TRUOC_C[h.proname]) {
    nKhaiC += 1;
    continue;
  }
  loi.push([
    `${h.proname}(${h.args})`,
    "authenticated gọi được nhưng KHÔNG thấy chốt nào (lọc tiệm / khoá riêng / kiểm người gọi), cũng chưa khai ở KHAI_TRUOC_C (luật C)",
  ]);
}

if (loi.length === 0) {
  console.log(
    `✅ ${ham.length} cửa công khai — tất cả đều có chốt bên trong (${nKhai} cửa khai trước kèm lý do), và không việc hẹn giờ nào mở cho người lạ.`,
  );
  console.log(
    `✅ ${hamAuth.length} hàm người ĐĂNG NHẬP gọi được — tất cả đều có chốt (${nKhaiC} hàm khai trước kèm lý do).`,
  );
  process.exit(0);
}

console.error(`❌ ${loi.length} cửa chưa an toàn:`);
for (const [ten, ly] of loi) console.error(`   · ${ten} — ${ly}`);
console.error("");
console.error("   Khoá `anon` nằm công khai trong mã trình duyệt: mở cho anon = mở cho cả");
console.error("   thế giới. Xem đầu file để biết hai lần chuyện này đã xảy ra và hại thế nào.");
console.error("   Còn `authenticated` là MỌI người dùng của MỌI tiệm — hàm nội bộ mở cho vai");
console.error("   đó là mở đường chéo tiệm (4 lỗ đã đo được ngày 19/08, xem #196).");
console.error("");
console.error("   Vá bằng migration `revoke execute … from public, anon, authenticated;` —");
console.error("   PHẢI có cả `authenticated`, thu của `public` KHÔNG kéo theo nó. Rồi ĐO lại.");
process.exit(1);

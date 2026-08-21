/**
 * CỔNG: hàm chạy quyền chủ sở hữu KHÔNG được xoá mất nhánh phân quyền của RLS.
 *
 * ═══════════════════════════════════════════════════════════════════
 * LỖ THẬT NGÀY 22/08 — ĐÃ THỬ BẰNG TÀI KHOẢN THẬT, KHÔNG PHẢI SUY ĐOÁN
 * ═══════════════════════════════════════════════════════════════════
 * Đăng nhập bằng một tài khoản vai `staff` của tiệm demo rồi gọi thẳng ba hàm
 * `cong_no_khach` · `tien_giu_ho` · `so_lieu_hom_nay`: kết quả trả về GIỐNG HỆT
 * tài khoản chủ tiệm. `cong_no_khach` đưa ra toàn bộ khách còn nợ KÈM TÊN VÀ SỐ
 * ĐIỆN THOẠI.
 *
 * Gốc bệnh: cả ba khai `security definer` nên chạy bằng quyền chủ sở hữu và đi
 * vòng qua RLS — mà đúng 23 bảng của iFan có chính sách RLS dạng "quản lý thì
 * thấy hết, nhân viên chỉ thấy dòng của mình". Đi vòng qua nó là xoá luôn vế
 * sau. #347 đã chữa.
 *
 * ⚠️ MÀN CÓ KHOÁ VAI KHÔNG PHẢI LÀ KHOÁ. Trang Công nợ đã chặn đúng
 *   owner/admin/manager. Nhưng hàm gọi được THẲNG qua API bằng khoá công khai
 *   của bất kỳ ai đã đăng nhập, không cần mở trang. Đó là lý do cổng này soát
 *   HÀM chứ không soát MÀN.
 *
 * ⚠️ VÙNG NÀY TRƯỚC ĐÓ KHÔNG AI CANH. Bộ `rls-smoke` có một ca cho hàm định
 *   nghĩa kiểu này, nhưng chỉ soát hàm mà NGƯỜI LẠ (chưa đăng nhập) gọi được.
 *   Ba hàm trên chỉ mở cho người ĐÃ đăng nhập nên lọt sạch. Rò trong nội bộ một
 *   tiệm cũng là rò.
 *
 * ⚠️ PHÉP ĐO ĐẦU TIÊN CỦA CHÍNH TÔI BÁO "0 VI PHẠM" TRONG KHI CÓ 21. Biểu thức
 *   tìm khớp `app_role() = ANY` trong khi chữ thật là `app_role() AS app_role) =
 *   ANY`. Một cổng hỏng không phân biệt được với một cổng luôn xanh — nên ca
 *   cuối cùng ở đây TỰ KIỂM phép đo: nếu không tìm thấy bảng RLS hẹp nào thì
 *   cổng phải ĐỎ, vì iFan chắc chắn có.
 *
 * Chạy: node scripts/vai-ham-so-tien-smoke.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";

if (!process.env.SUPABASE_DB_URL) {
  try {
    for (const d of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* CI đã có env sẵn */
  }
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("❌ Thiếu SUPABASE_DB_URL — cổng này KHÔNG tự bỏ qua.");
  process.exit(1);
}

let dat = 0;
let truot = 0;
const kiem = (ten, ok, ghi = "") => {
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${!ok && ghi ? " — " + ghi : ""}`);
  if (ok) dat++;
  else truot++;
};

/**
 * ĐƯỢC PHÉP đi vòng qua RLS — mỗi tên phải giải thích được, và danh sách này
 * phải giữ NGẮN. Thêm một tên vào đây là tự tay mở một cửa.
 */
const CHO_PHEP = new Map([
  // — Quản trị SaaS: chốt bằng quyền quản trị NỀN TẢNG, không phải vai trong tiệm.
  ["admin_pending_help_requests", "quản trị nền tảng, chốt bằng lớp riêng"],
  ["admin_platform_overview", "quản trị nền tảng"],
  ["admin_tenant_health", "quản trị nền tảng"],
  ["platform_status", "quản trị nền tảng"],
  ["open_support_session", "phiên hỗ trợ — chủ tiệm tự bật, có hạn giờ"],
  ["end_support_session", "đóng phiên hỗ trợ"],
  // — Mặt tiền công khai: khách CHƯA đăng nhập buộc phải gọi được.
  ["storefront_book", "khách tự đặt lịch trên trang tiệm"],
  ["storefront_slots", "khung giờ trống cho khách xem"],
  ["get_survey_info", "khảo sát mở bằng đường dẫn có mã"],
  ["bookable_staff", "danh sách thợ nhận khách, hiện công khai trên trang đặt lịch"],
  // — Có khoá/định danh riêng thay cho vai.
  ["sepay_ingest_transaction", "webhook ngân hàng, chốt bằng khoá bí mật"],
  ["voucher_check", "đối chiếu MỘT mã phiếu người dùng nhập, không liệt kê"],
  ["bot_answer", "bot trả lời khách, có lớp chốt riêng"],
  ["livechat_send", "khách chat trên web tiệm"],
  ["conversation_contact_name", "trả về TÊN của đúng một hội thoại người gọi đã thấy"],
  ["handoff_conversation", "chuyển hội thoại cho người khác trong cùng tiệm"],
  ["cham_cong_giup", "chấm công hộ — có lớp chốt riêng của mảng chấm công"],
  ["face_da_nap", "chỉ trả lời đã nạp khuôn mặt hay chưa, không đọc dữ liệu"],
]);

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync("supabase/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
});
await c.connect();

// ── A. Quét cả kho ──────────────────────────────────────────────────
const { rows: pol } = await c.query(
  `select tablename, qual from pg_policies
    where schemaname = 'public' and cmd in ('SELECT', 'ALL')`,
);
const hep = new Set();
for (const p of pol) {
  const q = (p.qual ?? "").replace(/\s+/g, " ");
  // "quản lý thấy hết HOẶC dòng này là của tôi" — dấu hiệu của RLS phân vai.
  if (/app_role/.test(q) && /auth\.uid/.test(q) && / OR /.test(q)) hep.add(p.tablename);
}
// TỰ KIỂM PHÉP ĐO (xem cảnh báo ở đầu file).
kiem(
  "phép đo còn sống: tìm thấy bảng có RLS phân vai",
  hep.size >= 10,
  `chỉ thấy ${hep.size} bảng — nhiều khả năng biểu thức tìm khớp đã hỏng, không phải kho đã sạch`,
);

const { rows: ham } = await c.query(
  `select p.proname, p.prosrc
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     join pg_type tr on tr.oid = p.prorettype
    where n.nspname = 'public' and p.prosecdef and tr.typname <> 'trigger'
      and has_function_privilege('authenticated', p.oid, 'execute')`,
);
kiem("phép đo còn sống: đọc được danh sách hàm", ham.length >= 50, `chỉ ${ham.length} hàm`);

// Hàm nào tự kiểm vai, hoặc gọi sang một hàm khác đã kiểm hộ (một nấc).
const tuKiem = new Set(ham.filter((h) => /app_role/.test(h.prosrc)).map((h) => h.proname));
const coChot = (h) =>
  /app_role/.test(h.prosrc) ||
  [...tuKiem].some((t) => t !== h.proname && h.prosrc.includes(`${t}(`));

const ho = [];
for (const h of ham) {
  const doc = [...hep].filter((t) => new RegExp(`\\b${t}\\b`).test(h.prosrc));
  if (!doc.length || coChot(h) || CHO_PHEP.has(h.proname)) continue;
  ho.push(`${h.proname} [${doc.join(", ")}]`);
}
kiem(
  `mọi hàm quyền-chủ đọc bảng RLS phân vai đều có chốt vai (${ham.length} hàm, ${hep.size} bảng)`,
  ho.length === 0,
  `không thấy chốt: ${ho.join(" · ")}`,
);

// Danh sách cho phép phải theo kịp thực tế — tên đã biến mất thì phải xoá đi,
// nếu không nó che mất một hàm MỚI trùng tên sau này.
const conSong = new Set(ham.map((h) => h.proname));
const ma = [...CHO_PHEP.keys()].filter((t) => !conSong.has(t));
kiem("danh sách cho phép không còn tên ma", ma.length === 0, `không còn hàm: ${ma.join(", ")}`);

// ── B. Thử thật bằng tài khoản của từng vai ─────────────────────────
const { rows: [t] } = await c.query(
  `select id from public.tenants where slug = 'demo-spa-huong-sen'`,
);
if (!t) {
  console.log("  ⚠️ BỎ QUA phần thử tài khoản: không có tiệm demo trong CSDL này.");
} else {
  const lay = async (vai) => {
    const { rows } = await c.query(
      `select user_id from public.tenant_members where tenant_id = $1 and role = $2 limit 1`,
      [t.id, vai],
    );
    return rows[0]?.user_id ?? null;
  };
  const nhanVien = await lay("staff");
  const chu = await lay("owner");
  kiem("tiệm demo có sẵn một nhân viên và một chủ để thử", Boolean(nhanVien && chu));

  if (nhanVien && chu) {
    const goi = async (uid, sql) => {
      await c.query("begin");
      await c.query(
        `select set_config('request.jwt.claims',
           json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
        [uid],
      );
      await c.query("set local role authenticated");
      const { rows } = await c.query(sql);
      await c.query("rollback");
      return rows[0].j;
    };

    for (const [ten, sql] of [
      ["cong_no_khach", "select public.cong_no_khach(5) j"],
      ["tien_giu_ho", "select public.tien_giu_ho(5) j"],
    ]) {
      const nv = await goi(nhanVien, sql);
      const ch = await goi(chu, sql);
      kiem(
        `${ten}: nhân viên thường KHÔNG đọc được sổ tiền của tiệm`,
        Object.keys(nv ?? {}).length === 0,
        `nhân viên nhận về ${JSON.stringify(nv).slice(0, 120)}`,
      );
      kiem(
        `${ten}: chủ tiệm VẪN đọc được (không phải khoá nhầm cả nhà)`,
        Object.keys(ch ?? {}).length > 0,
      );
    }

    // ⚠️ CHỌN NHÂN VIÊN BẬN NHẤT, không lấy người đầu danh sách. Lần đầu viết
    //   cổng này lấy bừa một nhân viên có đúng 4 lịch trong 14 ngày, rồi khẳng
    //   định "phải thấy số > 0" — nhưng TRUNG VỊ của 4 lịch rải trong 14 ngày
    //   ĐÚNG BẰNG 0. Cổng đỏ oan, và suýt nữa thì tôi đi sửa một hàm không hỏng.
    const { rows: [ban] } = await c.query(
      `select a.staff_user_id uid
         from public.appointments a
         join public.tenant_members m on m.user_id = a.staff_user_id
          and m.tenant_id = a.tenant_id and m.role = 'staff'
        where a.tenant_id = $1 and a.deleted_at is null
        group by 1 order by count(*) desc limit 1`,
      [t.id],
    );
    const nv = await goi(ban?.uid ?? nhanVien, "select public.so_lieu_hom_nay() j");
    const ch = await goi(chu, "select public.so_lieu_hom_nay() j");
    kiem(
      "so_lieu_hom_nay: nhân viên thấy phần của mình, KHÁC số của cả tiệm",
      nv.hen_thuong_ngay !== ch.hen_thuong_ngay || nv.hen_ngay_mai !== ch.hen_ngay_mai,
      `hai vai thấy giống hệt nhau (${JSON.stringify(nv)})`,
    );
    // ⚠️ KHOÁ BẰNG CÁCH TRẢ 0 CHO TẤT CẢ LÀ HỎNG, KHÔNG PHẢI PHÂN QUYỀN. Đối
    //   chiếu với con số tính ĐỘC LẬP bằng một câu truy vấn khác — không tự
    //   hỏi rồi tự trả lời bằng chính hàm đang xét.
    const { rows: [that] } = await c.query(
      `select count(*)::int n from public.appointments
        where tenant_id = $1 and staff_user_id = $2 and deleted_at is null
          and status not in ('cancelled', 'no_show')
          and (start_at at time zone 'Asia/Ho_Chi_Minh')::date = public.ngay_vn() + 1`,
      [t.id, ban?.uid ?? nhanVien],
    );
    kiem(
      "so_lieu_hom_nay: số nhân viên thấy ĐÚNG BẰNG lịch của riêng họ",
      Number(nv.hen_ngay_mai) === that.n,
      `hàm trả ${nv.hen_ngay_mai}, đếm độc lập ra ${that.n}`,
    );
  }
}

await c.end();
console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);

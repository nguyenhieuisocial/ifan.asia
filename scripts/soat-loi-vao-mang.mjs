#!/usr/bin/env node
/**
 * Cổng canh LỐI VÀO của từng mảng — chống bệnh "dựng xong rồi chôn".
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ CỔNG NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Đo ngày 19/08: kho có **31 mảng** khai `status: "ready"` trong
 * `lib/feature-registry.ts`, nhưng thanh dưới của bản điện thoại chỉ có **4 ô
 * đóng cứng** ⇒ **25/31 mảng chỉ tới được qua MỘT nút ảnh đại diện 44×36px**.
 * Khung 4 ô đó dựng lúc kho còn ~8 mảng và **không lần nào được xét lại** qua
 * 6 đợt tính năng.
 *
 * Không cổng kiểm nào bắt được, vì về mặt kỹ thuật mọi thứ vẫn "dựng xong":
 * migration chạy, RLS đúng, build xanh, typecheck sạch, bộ kiểm CSDL đều đạt.
 * Cái hỏng nằm ở chỗ chưa ai đo — **khoảng cách từ ngón tay tới màn hình**.
 * Mảng không có lối vào thì bằng chưa làm, mà nó vẫn được đếm là "ready" trên
 * trang bán hàng công khai.
 *
 * Đây là kiểu hỏng ÂM THẦM và TÍCH LUỸ: mỗi đợt thêm vài mảng, không đợt nào
 * làm gì sai, tới đợt thứ sáu thì 4/5 sản phẩm nằm sau đúng một nút bấm.
 *
 * ═══════════════════════════════════════════════════════════════════
 * ⚠️ CỔNG NÀY *KHÔNG* CHỨNG MINH ĐƯỢC GÌ — đọc kỹ phần này
 * ═══════════════════════════════════════════════════════════════════
 * Nó soát **KHAI BÁO**, KHÔNG chứng minh **màn chạy được**. Nó vẫn XANH khi:
 *  · Mục nav trỏ tới đường dẫn 404, màn trắng, hoặc màn báo "không có quyền".
 *  · Bảng "Thêm" mở ra nhưng nút bấm chết vì lỗi JavaScript lúc chạy.
 *  · Nhãn đủ ngắn theo SỐ KÝ TỰ nhưng vẫn tràn ô. Ngưỡng 10 ký tự SUY RA từ
 *    MỘT phép đo, không phải từ việc đo từng nhãn: đo canvas với đúng phông
 *    đang chạy (Be Vietnam Pro 600, 11px) trên bản thật 19/08 thấy ô hẹp nhất
 *    là 68px (máy 360px) và nhãn dài nhất còn lọt là "Khách hàng" — 10 ký tự =
 *    65,1px ⇒ ~6,5px mỗi ký tự, 68 ÷ 6,5 ≈ 10,4. Đây là phép XẤP XỈ: chữ hoa,
 *    dấu chồng, hay "m/w" liền nhau đều rộng hơn mức trung bình đó.
 *  · Từ vựng ngành (`tenant_packs.terminology`) đổi nhãn `contacts`/`deals`
 *    LÚC CHẠY theo dữ liệu nằm trong CSDL. Cổng này đọc FILE nên KHÔNG thấy:
 *    tiệm nào tự đặt từ dài hơn 10 ký tự thì ô vẫn cụt, và **chưa có cách nào
 *    canh**. Chính "Lịch/liệu trình" (15 ký tự) đã vỡ dòng đúng kiểu đó.
 *
 * Muốn chắc màn chạy được thì vẫn phải bấm tay, hoặc dựng bộ kiểm trình duyệt.
 * Cổng này bảo đảm đúng MỘT điều, nhưng bảo đảm tự động và mãi mãi:
 * **không mảng nào bị chôn trong im lặng.**
 *
 * ═══════════════════════════════════════════════════════════════════
 * NĂM LUẬT (đánh số tới 6 — số 4 đã bỏ, xem bên dưới)
 * ═══════════════════════════════════════════════════════════════════
 *  LUẬT 1 — Mảng `ready` nào cũng phải có lối vào: hoặc có mục trong
 *           `NAV_ITEMS`, hoặc được khai TRƯỚC ở `MIEN_TRU` bên dưới kèm lý do
 *           đọc hiểu được (và đường dẫn kiểm chứng được).
 *  LUẬT 2 — Mục `NAV_ITEMS` nào cũng phải khai nhóm. Cả bảng "Thêm" của điện
 *           thoại LẪN cột trái máy tính nay đều xếp theo `NHOM_CUA_MUC` +
 *           `THU_TU_NHOM` (ADR-0026 QĐ-2) ⇒ mục thiếu khai nhóm, hoặc khai vào
 *           nhóm không có trong `THU_TU_NHOM`, biến mất khỏi **CẢ HAI BẢN**.
 *           Trước 19/08 cột trái còn đỡ được cho điện thoại; nay không còn chỗ
 *           nào đỡ, nên cổng này là thứ DUY NHẤT chặn.
 *  LUẬT 3 — Mỗi vai phải lấp đủ số ô của thanh dưới. Chạy thử đúng phép chọn
 *           của `mobileBarItems` cho từng vai trong enum `tenant_role`.
 *  LUẬT 4 — (ĐÃ BỎ, LUẬT 5 thay hẳn) Bản đầu đếm 12 ký tự trên chuỗi
 *           `shell.nav.<mục>` gốc. Nhưng thanh dưới nay tra bảng
 *           `NHAN_NGAN_THANH_DUOI` TRƯỚC, nên đếm chuỗi gốc là đếm thứ chữ
 *           không bao giờ hiện ra ở đó ⇒ cổng đỏ oan. Giữ số 4 trống để lịch
 *           sử đọc được, không lặng lẽ đánh số lại.
 *  LUẬT 5 — Nhãn THẬT SỰ hiện ở thanh dưới không được quá 10 ký tự. Tra đúng
 *           thứ tự bản chạy: `NHAN_NGAN_THANH_DUOI` → `shell.nav.*`, cả vi lẫn
 *           en. Bài học thật: "Duyệt & yêu cầu" đo được 88px trong ô 68px, bị
 *           `truncate` cắt thành "Duyệt & y…" — ô còn đó mà chữ hết nghĩa.
 *
 *  ⚠️ LỖ CỦA LUẬT 5, đã ĐO chứ không đoán (19/08, trên CSDL thật): từ vựng
 *           ngành đổi nhãn LÚC CHẠY nên cổng đọc-file không thấy. Đo cả 8 gói:
 *           nhãn gọi khách dài 5–9 ký tự (dài nhất "bệnh nhân" 9) — đều LỌT
 *           ngưỡng 10. Và 0 tiệm nào tự đặt tên riêng. Tức lỗ này CHƯA cắn ai.
 *           Nhãn `deal` thì dài thật ("đơn hàng tiềm năng" 18) nhưng `deals`
 *           KHÔNG có trong `UU_TIEN_THEO_VAI` của vai nào ⇒ không lên thanh
 *           dưới. Ai thêm `deals` vào thanh sau này thì phải đo lại chỗ này.
 *
 *  LUẬT 6 — Màn nào cũng phải TỰ CÓ lớp cuộn, hoặc khai `MIEN_TRU_CUON` kèm lý
 *           do. Khung /app cắt phần dài quá màn hình. Bài học thật: màn Sự kiện
 *           marketing mất >1.500px nội dung và nút "Tạo chiến dịch" nằm ngoài
 *           màn hình — điền xong KHÔNG lưu được. Quét cả kho ra thêm 5 màn cùng
 *           bệnh, một trong số đó vừa dựng cùng ngày ⇒ bệnh HỆ THỐNG.
 *
 * Ba luật 1-2-3 canh "có tới được màn không". Luật 5-6 canh "tới rồi thì DÙNG
 * được không" — một mảng có lối vào mà chữ cụt hoặc nút nằm ngoài màn hình thì
 * cũng là mảng không dùng được.
 *
 * Chỉ đọc file, KHÔNG đụng CSDL ⇒ không cần `lock_timeout`.
 *
 * Dùng: node scripts/soat-loi-vao-mang.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const doc = (p) => readFileSync(path.join(GOC, p), "utf8");

const F_NAV = "app/app/sidebar-nav.tsx";
const F_SO = "lib/feature-registry.ts";
const D_MIGRATION = "supabase/migrations";

/**
 * Ngưỡng ký tự của nhãn thanh dưới — XẤP XỈ, xem phần "không chứng minh được gì".
 * Ô hẹp nhất 68px (máy 360px) ÷ ~6,5px mỗi ký tự ≈ 10,4 ⇒ chốt 10.
 */
const GIOI_HAN_NHAN = 10;

// ══════════════════════════════════════════════════════════════════════
// BẢN ĐỒ: mảng trong sổ  →  mục nav
// ══════════════════════════════════════════════════════════════════════
// Sổ mảng đặt tên theo NGƯỜI MUA đọc (`hangHoa`, `soQuy`), nav đặt tên theo
// ĐƯỜNG DẪN (`items`, `cashbook`). Hai bộ tên khác nhau là chủ đích, nên phải
// có bản đồ; nhưng bản đồ này chính là chỗ dễ mục ruỗng nhất, vì thế cổng bắt
// nó phải PHỦ HẾT: mảng ready nào không nằm ở đây cũng không nằm ở MIEN_TRU
// thì ĐỎ, và dòng thừa (mảng đã xoá / đã hạ khỏi ready) cũng ĐỎ.
const NAV_CUA_MANG = {
  contacts: "contacts",
  deals: "deals",
  orders: "orders",
  contractsBilling: "contracts",
  retention: "loyalty",
  events: "events",
  inbox: "inbox",
  csatQc: "csat",
  today: "today",
  tasks: "tasks",
  projects: "projects",
  // 21/08: mảng này TỪNG được miễn trừ với lý do "luôn treo vào một việc nên
  // không có màn riêng". Founder lật quyết định đó sau khi nhìn sản phẩm thật
  // ("chỉ mới thấy note nội bộ thôi") ⇒ nay có màn /app/chat. Phần nhúng trong
  // đơn/khách/lịch/phiếu kho vẫn còn nguyên, chỉ là không còn là lối vào DUY NHẤT.
  internalChat: "chat",
  approvals: "approvals",
  team: "team",
  recruitment: "recruitment",
  payroll: "payroll",
  commission: "commission",
  reports: "reports",
  booking: "calendar",
  hangHoa: "items",
  kho: "stock",
  soQuy: "cashbook",
  ketSat: "ketsat",
  system: "settings",
};

// ══════════════════════════════════════════════════════════════════════
// MIỄN TRỪ — mảng CỐ Ý không có mục nav riêng
// ══════════════════════════════════════════════════════════════════════
// Miễn trừ là cửa hậu, nên phải đắt: mỗi dòng cần LÝ DO người không rành kỹ
// thuật đọc hiểu, và một ĐƯỜNG DẪN có thật để cổng tự kiểm. Lý do suông kiểu
// "chưa cần" không được nhận — đó đúng là câu đã chôn 25 mảng.
const MIEN_TRU = {
  storefront: {
    viSao: "Mặt tiền là trang KHÁCH xem, chủ tiệm chỉnh trong Cài đặt → Kênh → Mặt tiền.",
    duong: "app/app/settings/channels/storefront/page.tsx",
  },
  automation: {
    viSao: "Quy trình tự động là thứ cài một lần rồi chạy nền, nằm ở Cài đặt → Quy trình.",
    duong: "app/app/settings/workflows/page.tsx",
  },
  aiWork: {
    viSao: "Trợ lý AI làm việc BÊN TRONG Hộp thư; chỗ bật/tắt ở Cài đặt → Trợ lý AI.",
    duong: "app/app/settings/ai-autopilot/page.tsx",
  },
  sla: {
    viSao: "Hạn trả lời hiện thành cờ trên từng hội thoại ở Hộp thư; đặt hạn ở Cài đặt → SLA.",
    duong: "app/app/settings/sla/page.tsx",
  },
  dataExport: {
    viSao:
      "Xuất Excel là NÚT nằm ngay trên màn đang xem (Khách · Đơn · Lịch), không phải một màn riêng.",
    duong: "app/api/export/contacts/route.ts",
  },
  industry: {
    viSao: "Chọn ngành làm một lần lúc mở tiệm, nằm ở Cài đặt → Ngành.",
    duong: "app/app/settings/industry/page.tsx",
  },
  integrations: {
    viSao: "Nối Zalo/Facebook/webhook là việc cài đặt, nằm ở Cài đặt → Kết nối.",
    duong: "app/app/settings/integrations/page.tsx",
  },
};

// ══════════════════════════════════════════════════════════════════════
// ĐỌC FILE
// ══════════════════════════════════════════════════════════════════════
const loi = [];
const bao = (luat, tieuDe, ...dong) => loi.push({ luat, tieuDe, dong });

/** Bỏ chú thích trước khi bóc dữ liệu — chú thích ở kho này rất dài và có dấu ngoặc. */
const boChuThich = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/[ \t]+\/\/.*$/gm, "");

/** Bóc một khối khai báo; không khớp = cấu trúc file đã đổi ⇒ dừng hẳn, không đoán. */
function khoi(nguon, bieuThuc, ten, file) {
  const m = nguon.match(bieuThuc);
  if (!m) {
    console.error(`❌ Không đọc được \`${ten}\` trong ${file}.`);
    console.error("   Cấu trúc file đã đổi. Cổng này soát bằng cách ĐỌC MÃ NGUỒN, nên");
    console.error("   đổi cách khai báo thì phải sửa lại phép bóc trong");
    console.error("   scripts/soat-loi-vao-mang.mjs — ĐỪNG xoá bước này khỏi CI để cho qua.");
    process.exit(1);
  }
  return boChuThich(m[1]);
}

const nav = doc(F_NAV);
const so = doc(F_SO);

// ── Mảng trong sổ ────────────────────────────────────────────────────
const khoiMang = khoi(so, /const MODULE_REGISTRY[^=]*=\s*\[([\s\S]*?)\n\];/, "MODULE_REGISTRY", F_SO);
const mangReady = [...khoiMang.matchAll(/\{([^{}]*)\}/g)]
  .map((m) => ({
    key: m[1].match(/key:\s*"([^"]+)"/)?.[1],
    status: m[1].match(/status:\s*"([^"]+)"/)?.[1],
  }))
  .filter((x) => x.key && x.status === "ready")
  .map((x) => x.key);

// ── Mục nav ──────────────────────────────────────────────────────────
const khoiNav = khoi(nav, /const NAV_ITEMS\s*=\s*\[([\s\S]*?)\n\] as const;/, "NAV_ITEMS", F_NAV);
const mucNav = [...khoiNav.matchAll(/\{([^{}]*)\}/g)].map((m) => {
  const roles = m[1].match(/roles:\s*\[([^\]]*)\]/);
  return {
    labelKey: m[1].match(/labelKey:\s*"([^"]+)"/)?.[1],
    href: m[1].match(/href:\s*"([^"]+)"/)?.[1],
    roles: roles ? [...roles[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null,
  };
});
const khoaNav = new Set(mucNav.map((x) => x.labelKey));

// ── Nhóm trong bảng "Thêm" ───────────────────────────────────────────
const nhomCuaMuc = Object.fromEntries(
  [
    ...khoi(nav, /const NHOM_CUA_MUC[^=]*=\s*\{([\s\S]*?)\n\};/, "NHOM_CUA_MUC", F_NAV).matchAll(
      /(\w+):\s*"([^"]+)"/g,
    ),
  ].map((m) => [m[1], m[2]]),
);
const thuTuNhom = new Set(
  [
    ...khoi(nav, /const THU_TU_NHOM\s*=\s*\[([\s\S]*?)\n\] as const;/, "THU_TU_NHOM", F_NAV).matchAll(
      /"([^"]+)"/g,
    ),
  ].map((m) => m[1]),
);

// ── Nhãn riêng của thanh dưới ────────────────────────────────────────
// `navLabelFor(..., ngan = true)` tra bảng này TRƯỚC rồi mới lấy `shell.nav.*`,
// nên muốn biết chữ thật sự hiện ở ô thì phải đi đúng thứ tự đó.
const nhanNganThanhDuoi = Object.fromEntries(
  [
    ...khoi(
      nav,
      /const NHAN_NGAN_THANH_DUOI[^=]*=\s*\{([\s\S]*?)\n\};/,
      "NHAN_NGAN_THANH_DUOI",
      F_NAV,
    ).matchAll(/(\w+):\s*"([^"]+)"/g),
  ].map((m) => [m[1], m[2]]),
);

// ── Ưu tiên theo vai + số ô của thanh dưới ───────────────────────────
const uuTienTheoVai = Object.fromEntries(
  [
    ...khoi(nav, /const UU_TIEN_THEO_VAI[^=]*=\s*\{([\s\S]*?)\n\};/, "UU_TIEN_THEO_VAI", F_NAV).matchAll(
      /(\w+):\s*\[([^\]]*)\]/g,
    ),
  ].map((m) => [m[1], [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1])]),
);

// Số ô đọc THẲNG từ `mobileBarItems` chứ không gõ tay: đổi thanh dưới thành 5 ô
// thì cổng tự canh 5, không phải nhớ sửa hai chỗ.
const mSoO = nav.match(/function mobileBarItems[\s\S]*?\.length === (\d+)/);
if (!mSoO) {
  console.error(`❌ Không đọc được số ô của thanh dưới trong \`mobileBarItems\` (${F_NAV}).`);
  console.error("   Sửa lại phép bóc trong scripts/soat-loi-vao-mang.mjs.");
  process.exit(1);
}
const SO_O = Number(mSoO[1]);

// ── Vai hợp lệ: lấy từ enum CSDL, không gõ tay ───────────────────────
// Thêm vai thứ 6 vào CSDL mà quên khai danh sách ưu tiên ⇒ LUẬT 3 tự đỏ.
let vaiHopLe = null;
let fileVai = null;
for (const f of readdirSync(path.join(GOC, D_MIGRATION))
  .filter((x) => x.endsWith(".sql"))
  .sort()) {
  const m = readFileSync(path.join(GOC, D_MIGRATION, f), "utf8").match(
    /create type public\.tenant_role as enum\s*\(([^)]*)\)/i,
  );
  if (m) {
    vaiHopLe = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    fileVai = f;
    break;
  }
}
if (!vaiHopLe) {
  console.error("❌ Không tìm thấy enum `tenant_role` trong supabase/migrations.");
  console.error("   Cổng cần danh sách vai để chạy thử thanh dưới cho TỪNG vai.");
  process.exit(1);
}

/** Đúng phép chọn của `mobileBarItems`: lấy SO_O mục đầu mà vai đó mở được. */
function thanhDuoiCua(vai) {
  const uuTien = uuTienTheoVai[vai] ?? uuTienTheoVai.staff ?? [];
  const ra = [];
  for (const khoa of uuTien) {
    if (ra.length === SO_O) break;
    const muc = mucNav.find((x) => x.labelKey === khoa);
    if (muc && (!muc.roles || muc.roles.includes(vai))) ra.push(khoa);
  }
  return ra;
}

// ══════════════════════════════════════════════════════════════════════
// LUẬT 1 — mảng ready nào cũng phải có lối vào
// ══════════════════════════════════════════════════════════════════════
for (const mang of mangReady) {
  const coNav = Object.hasOwn(NAV_CUA_MANG, mang);
  const duocMienTru = Object.hasOwn(MIEN_TRU, mang);

  if (coNav && duocMienTru) {
    bao(
      1,
      `Mảng "${mang}" vừa khai có mục nav vừa khai miễn trừ`,
      "Hai lời khai chọi nhau nên không ai biết mảng này thật sự tới được bằng đường nào.",
      "SỬA: xoá nó khỏi MIEN_TRU nếu đã có mục nav thật, hoặc ngược lại.",
    );
    continue;
  }

  if (coNav) {
    if (!khoaNav.has(NAV_CUA_MANG[mang])) {
      bao(
        1,
        `Mảng "${mang}" trỏ tới mục nav "${NAV_CUA_MANG[mang]}" KHÔNG còn tồn tại`,
        "Bản đồ nói mảng này vào được, nhưng mục nav đó đã bị xoá/đổi tên ⇒ mảng đang bị chôn.",
        `SỬA: mở ${F_NAV} xem mục đó nay tên gì rồi sửa NAV_CUA_MANG trong cổng này,`,
        "     hoặc thêm lại mục nav nếu nó bị xoá nhầm.",
      );
    }
    continue;
  }

  if (duocMienTru) {
    const { viSao, duong } = MIEN_TRU[mang];
    if (!viSao || viSao.length < 20) {
      bao(
        1,
        `Miễn trừ của mảng "${mang}" không có lý do đọc hiểu được`,
        "SỬA: viết một câu người không rành kỹ thuật hiểu được, nói RÕ người dùng bấm ở đâu để tới.",
      );
    }
    if (!duong || !existsSync(path.join(GOC, duong))) {
      bao(
        1,
        `Miễn trừ của mảng "${mang}" chỉ tới chỗ không có thật: ${duong ?? "(chưa khai)"}`,
        "Miễn trừ mà không kiểm chứng được thì chỉ là lời hứa suông — đúng thứ đã chôn 25 mảng.",
        "SỬA: khai `duong` là file THẬT chứa lối vào đó (màn Cài đặt, component nhúng, hoặc route).",
      );
    }
    continue;
  }

  bao(
    1,
    `Mảng "${mang}" khai ready nhưng KHÔNG có lối vào nào`,
    "Người dùng không có cách nào bấm tới. Mảng không có lối vào thì bằng chưa làm —",
    'mà nó vẫn được đếm là "đã xong" trên trang bán hàng công khai.',
    "SỬA bằng MỘT trong hai cách:",
    `  (a) thêm mục vào NAV_ITEMS (${F_NAV}) rồi khai nhóm trong NHOM_CUA_MUC,`,
    "      sau đó thêm dòng vào NAV_CUA_MANG của cổng này;",
    "  (b) nếu CỐ Ý không có mục riêng (nằm trong Cài đặt / nhúng trong màn khác),",
    "      khai vào MIEN_TRU kèm lý do + đường dẫn có thật.",
  );
}

// Dòng thừa trong hai bảng — mảng đã xoá hoặc đã hạ khỏi "ready".
const tapReady = new Set(mangReady);
for (const [bang, ten] of [
  [NAV_CUA_MANG, "NAV_CUA_MANG"],
  [MIEN_TRU, "MIEN_TRU"],
]) {
  for (const mang of Object.keys(bang)) {
    if (!tapReady.has(mang)) {
      bao(
        1,
        `${ten} còn dòng thừa cho mảng "${mang}"`,
        `Mảng này không còn ở trạng thái ready trong ${F_SO} (đã xoá, hoặc đã hạ trạng thái).`,
        `SỬA: xoá dòng "${mang}" khỏi ${ten} trong cổng này để bảng không mục ruỗng.`,
      );
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// LUẬT 2 — mục nav nào cũng phải có mặt trên điện thoại
// ══════════════════════════════════════════════════════════════════════
// Bảng "Thêm" (điện thoại) và cột trái (máy tính) cùng xếp theo NHOM_CUA_MUC +
// THU_TU_NHOM, và cùng BỎ QUA mục không thuộc nhóm nào ⇒ mục thiếu khai nhóm
// biến mất khỏi CẢ HAI BẢN. Đọc code không thấy sai, chỉ dùng thật mới thấy.
for (const muc of mucNav) {
  const nhom = nhomCuaMuc[muc.labelKey];
  if (!nhom) {
    bao(
      2,
      `Mục "${muc.labelKey}" (${muc.href}) thiếu khai nhóm`,
      "Bảng \"Thêm\" (điện thoại) và cột trái (máy tính) đều xếp theo nhóm,",
      "mục không thuộc nhóm nào thì KHÔNG hiện ra ở ĐÂU CẢ — mảng bị chôn hoàn toàn.",
      `SỬA: thêm \`${muc.labelKey}: "<nhóm>"\` vào NHOM_CUA_MUC trong ${F_NAV}.`,
      `     Nhóm dùng được: ${[...thuTuNhom].join(" · ")}`,
    );
  } else if (!thuTuNhom.has(nhom)) {
    bao(
      2,
      `Mục "${muc.labelKey}" khai nhóm "${nhom}" — nhóm này không có trong THU_TU_NHOM`,
      "Cả hai bản chỉ vẽ những nhóm có trong THU_TU_NHOM, nên mục này vẫn mất.",
      `SỬA: đổi sang một nhóm có sẵn (${[...thuTuNhom].join(" · ")}),`,
      `     hoặc thêm "${nhom}" vào THU_TU_NHOM đúng chỗ trong trình tự một ngày làm việc.`,
    );
  }
}

for (const khoa of Object.keys(nhomCuaMuc)) {
  if (!khoaNav.has(khoa)) {
    bao(
      2,
      `NHOM_CUA_MUC còn dòng thừa "${khoa}"`,
      "Không còn mục nav nào tên này — bảng nhóm đang mục ruỗng, lần sau đọc sẽ tin nhầm.",
      `SỬA: xoá dòng "${khoa}" khỏi NHOM_CUA_MUC trong ${F_NAV}.`,
    );
  }
}

// ══════════════════════════════════════════════════════════════════════
// LUẬT 3 — mỗi vai phải lấp đủ số ô thanh dưới
// ══════════════════════════════════════════════════════════════════════
for (const vai of vaiHopLe) {
  const uuTien = uuTienTheoVai[vai];
  if (!uuTien) {
    bao(
      3,
      `Vai "${vai}" chưa có danh sách ưu tiên thanh dưới`,
      `Vai này có thật trong CSDL (enum tenant_role, ${D_MIGRATION}/${fileVai}) nhưng`,
      "thanh dưới không biết xếp gì cho họ nên rơi về danh sách của nhân viên —",
      "vai đó mở máy lên thấy thanh dưới của người khác.",
      `SỬA: thêm \`${vai}: [...]\` vào UU_TIEN_THEO_VAI trong ${F_NAV}.`,
    );
    continue;
  }

  for (const khoa of uuTien) {
    if (!khoaNav.has(khoa)) {
      bao(
        3,
        `Vai "${vai}" ưu tiên mục "${khoa}" không có thật`,
        "Gõ sai tên mục thì phép chọn LẶNG LẼ bỏ qua, danh sách tự ngắn đi mà không ai biết.",
        `SỬA: xem tên đúng trong NAV_ITEMS (${F_NAV}) rồi sửa lại UU_TIEN_THEO_VAI.`,
      );
    }
  }

  const thanh = thanhDuoiCua(vai);
  if (thanh.length < SO_O) {
    bao(
      3,
      `Vai "${vai}" chỉ lấp được ${thanh.length}/${SO_O} ô thanh dưới`,
      `Đang ra: ${thanh.length ? thanh.join(" · ") : "(rỗng)"}`,
      "Thanh dưới thủng ô thì phần trống dồn cho các ô còn lại — bấm nhầm, và mất",
      "đúng mấy lối vào hay dùng nhất của vai này.",
      `SỬA: nối thêm mục vào \`${vai}\` trong UU_TIEN_THEO_VAI (${F_NAV}).`,
      "     Nhớ chọn mục vai đó THẬT SỰ mở được — mục bị siết quyền sẽ bị bỏ qua,",
      "     danh sách dài mà toàn mục cấm thì vẫn thủng.",
    );
  }
}

for (const vai of Object.keys(uuTienTheoVai)) {
  if (!vaiHopLe.includes(vai)) {
    bao(
      3,
      `UU_TIEN_THEO_VAI có vai lạ "${vai}"`,
      `Vai này không có trong enum tenant_role (${D_MIGRATION}/${fileVai}) ⇒ không ai dùng tới.`,
      `SỬA: xoá dòng đó, hoặc sửa lại đúng chính tả tên vai (${vaiHopLe.join(" · ")}).`,
    );
  }
}

// ══════════════════════════════════════════════════════════════════════
// LUẬT 5 — nhãn THẬT SỰ hiện ở thanh dưới không được quá dài
// ══════════════════════════════════════════════════════════════════════
// Chỉ soát nhãn CÓ THẬT trên thanh dưới (hợp của mọi vai) + ô "Thêm". Nhãn
// trong bảng "Thêm" được cả chiều ngang màn hình nên không siết ở đây.
//
// ⚠️ Phải tra ĐÚNG THỨ TỰ của bản chạy: `NHAN_NGAN_THANH_DUOI` trước, rồi mới
// `shell.nav.*`. Đếm thẳng chuỗi gốc là đếm chữ của CỘT TRÁI MÁY TÍNH — cột đó
// rộng 186px, ở đó "Duyệt & yêu cầu" vừa thoải mái. Sai chỗ này thì cổng đỏ
// oan, mà cổng hay kêu oan là cổng bị người ta tắt đi.
const khoaTrenThanh = new Set(vaiHopLe.flatMap((vai) => thanhDuoiCua(vai)));
khoaTrenThanh.add("more"); // ô thứ 5 lấy thẳng `nav.more`, không qua bảng nhãn ngắn

/** Khoá từ điển mà thanh dưới THẬT SỰ tra cho mục này. */
const khoaNhanThanhDuoi = (labelKey) => nhanNganThanhDuoi[labelKey] ?? labelKey;

/** Gợi ý nhãn ngắn: cắt ở chỗ nối đầu tiên ("Duyệt & yêu cầu" → "Duyệt"). */
function goiYNhan(nhan) {
  const cat = nhan.split(/\s*(?:&|\/|·|,|\bvà\b|\band\b)\s*/i)[0].trim();
  return cat && cat !== nhan && cat.length <= GIOI_HAN_NHAN ? cat : null;
}

for (const tiengNoi of ["vi", "en"]) {
  const duongTu = `messages/${tiengNoi}.json`;
  const tuDien = JSON.parse(doc(duongTu))?.shell?.nav ?? {};
  for (const muc of [...khoaTrenThanh].sort()) {
    const khoa = khoaNhanThanhDuoi(muc);
    const nhan = tuDien[khoa];

    if (typeof nhan !== "string") {
      bao(
        5,
        `Thiếu nhãn \`shell.nav.${khoa}\` trong ${duongTu}`,
        `Mục "${muc}" có ô ở thanh dưới nhưng không có chữ để hiện.`,
        khoa === muc
          ? `SỬA: thêm khoá \`nav.${khoa}\` vào ${duongTu}.`
          : `SỬA: NHAN_NGAN_THANH_DUOI (${F_NAV}) trỏ "${muc}" sang "${khoa}" mà từ điển chưa có khoá đó —` +
            ` thêm \`nav.${khoa}\` vào ${duongTu}, hoặc bỏ dòng trỏ đó đi.`,
      );
      continue;
    }

    if (nhan.length > GIOI_HAN_NHAN) {
      const y = goiYNhan(nhan);
      bao(
        5,
        `Nhãn ${tiengNoi} ở thanh dưới của "${muc}" dài ${nhan.length} ký tự (tối đa ${GIOI_HAN_NHAN}): "${nhan}"`,
        `Ô thanh dưới hẹp nhất ~68px (màn 360px chia ${SO_O + 1} ô). Ước ~6,5px mỗi ký tự thì`,
        `${nhan.length} ký tự ≈ ${Math.round(nhan.length * 6.5)}px ⇒ tràn, và class \`truncate\` cắt cụt.`,
        'Đã xảy ra thật: "Duyệt & yêu cầu" (88px) hiện ra thành "Duyệt & y…".',
        y
          ? `SỬA: rút gọn \`nav.${khoa}\` trong ${duongTu}, ví dụ "${nhan}" → "${y}".`
          : `SỬA: rút gọn \`nav.${khoa}\` trong ${duongTu} còn ≤ ${GIOI_HAN_NHAN} ký tự.`,
        khoa === muc
          ? `     Muốn GIỮ chữ dài ở cột trái máy tính thì thêm \`${muc}: "${muc}Short"\` vào` +
            ` NHAN_NGAN_THANH_DUOI (${F_NAV}) và khai khoá ngắn riêng.`
          : "     (Mục này đã có nhãn ngắn riêng — chính nhãn ngắn đó vẫn còn dài.)",
        '     Hoặc bỏ mục khỏi UU_TIEN_THEO_VAI — nó vẫn vào được qua bảng "Thêm".',
      );
    }
  }
}

// Dòng thừa: trỏ nhãn ngắn cho mục nav không còn tồn tại.
for (const muc of Object.keys(nhanNganThanhDuoi)) {
  if (!khoaNav.has(muc)) {
    bao(
      5,
      `NHAN_NGAN_THANH_DUOI còn dòng thừa "${muc}"`,
      "Không còn mục nav nào tên này — nhãn ngắn đó không bao giờ được dùng tới.",
      `SỬA: xoá dòng "${muc}" khỏi NHAN_NGAN_THANH_DUOI trong ${F_NAV}.`,
    );
  }
}

// ══════════════════════════════════════════════════════════════════════
// LUẬT 6 — Màn nào cũng phải TỰ CÓ LỚP CUỘN
// ══════════════════════════════════════════════════════════════════════
// Khung /app đặt mọi màn vào
//   <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
// tức một hộp CAO CỐ ĐỊNH có cắt phần thừa. Màn nào trả thẳng một khối nội
// dung mà không tự có lớp cuộn thì phần dài quá màn hình bị CẮT MẤT và không
// có cách nào với tới. Trên máy tính ít lộ vì màn rộng; trên điện thoại là
// hỏng hẳn.
//
// Đo trên bản thật 19/08, vai chủ tiệm, cửa sổ 390px: màn Sự kiện marketing
// mất hơn 1.500px nội dung và nút "Tạo chiến dịch" nằm ngoài màn hình — điền
// xong KHÔNG lưu được. Màn Tuyển dụng: 6 ô cuối + nút "Lưu hồ sơ" không cuộn
// tới được. Quét cả kho sau đó ra THÊM 5 màn cùng bệnh, trong đó có một màn
// vừa dựng cùng ngày ⇒ đây là bệnh HỆ THỐNG, không phải hai lần sơ ý.
//
// ⚠️ Cổng này KHÔNG chứng minh được bố cục đúng — chỉ chứng minh có lớp cuộn.
// Nó bắt kiểu "quên hẳn", không bắt được "cuộn sai chỗ".
//
// 👉 Hình dạng đúng hơn cho lâu dài: cho chính <main> cuộn, rồi màn nào tự
// quản lý khung cuộn riêng (Hộp thư, Lịch) thì khai xin miễn. An-toàn-mặc-định
// bao giờ cũng hơn nhớ-mà-khai. CỐ Ý chưa làm tối 19/08 vì nó đổi bố cục MỌI
// màn cùng lúc, mà đúng đêm đó chưa có cách đo tin cậy ở khổ điện thoại.
const CUON = /overflow-y-auto|overflow-auto|overflow-y-scroll/;
const MIEN_TRU_CUON = {
  "/reports": "chỉ `redirect()` sang /app/reports/sources — không dựng nội dung nào.",
};
{
  const goc = path.join(GOC, "app", "app");
  const duyet = (thuMuc) => {
    for (const m of readdirSync(thuMuc, { withFileTypes: true })) {
      const p = path.join(thuMuc, m.name);
      if (m.isDirectory()) duyet(p);
    }
    if (!existsSync(path.join(thuMuc, "page.tsx"))) return;
    const duong = "/" + path.relative(goc, thuMuc).split(path.sep).join("/");
    const tsx = readdirSync(thuMuc).filter((f) => f.endsWith(".tsx"));
    const coCuon = tsx.some((f) => CUON.test(readFileSync(path.join(thuMuc, f), "utf8")));
    if (coCuon) {
      if (MIEN_TRU_CUON[duong]) {
        bao(6, `Màn "${duong}" khai miễn trừ nhưng ĐÃ có lớp cuộn`,
          "Dòng miễn trừ thành thừa — để lại là che mất một màn thật.",
          `SỬA: xoá "${duong}" khỏi MIEN_TRU_CUON trong ${path.basename(import.meta.url)}.`);
      }
      return;
    }
    if (MIEN_TRU_CUON[duong]) return;
    bao(6, `Màn "${duong}" KHÔNG có lớp cuộn nào`,
      "Khung /app cắt phần dài quá màn hình, và không cuộn tới được.",
      "SỬA: bọc phần trả về theo khuôn của Bảng lương/Dự án —",
      '  <div className="flex flex-1 flex-col overflow-hidden">',
      '    <div className="flex-1 overflow-y-auto"> …nội dung cũ… </div>',
      "  </div>",
      "HOẶC khai vào MIEN_TRU_CUON kèm lý do, nếu màn đó thật sự không dựng nội dung.");
  };
  duyet(goc);
}

// ══════════════════════════════════════════════════════════════════════
// KẾT
// ══════════════════════════════════════════════════════════════════════
if (loi.length === 0) {
  const soMienTru = Object.keys(MIEN_TRU).length;
  console.log(
    `✅ Lối vào của mọi mảng còn nguyên: ${mangReady.length} mảng ready ` +
      `(${mangReady.length - soMienTru} có mục nav, ${soMienTru} miễn trừ có lý do), ` +
      `${mucNav.length} mục nav đều khai nhóm (lên được cả bảng \"Thêm\" lẫn cột trái), ` +
      `${vaiHopLe.length} vai đều đủ ${SO_O} ô, ${khoaTrenThanh.size} nhãn thanh dưới ` +
      `(vi + en) đều ≤ ${GIOI_HAN_NHAN} ký tự, và mọi màn đều có lớp cuộn ` +
      `(${Object.keys(MIEN_TRU_CUON).length} miễn trừ có lý do).`,
  );
  process.exit(0);
}

console.error(`❌ ${loi.length} chỗ làm mảng bị chôn khỏi tầm với trên điện thoại:\n`);
for (const { luat, tieuDe, dong } of loi) {
  console.error(`  [LUẬT ${luat}] ${tieuDe}`);
  for (const d of dong) console.error(`      ${d}`);
  console.error("");
}
console.error("Vì sao chặn: 19/08 đã có lần 25/31 mảng chỉ tới được qua một nút 44×36px,");
console.error("suốt 6 đợt tính năng không gì báo. Cổng này tồn tại để chuyện đó không lặp lại.");
process.exit(1);

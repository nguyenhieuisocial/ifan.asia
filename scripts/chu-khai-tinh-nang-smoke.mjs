#!/usr/bin/env node
/**
 * CỔNG: chữ trên TRANG CÔNG KHAI không được khai trạng thái tính năng lệch
 * với `lib/feature-registry.ts`.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY — bảy dòng chữ đo được ngày 22/08, đều TỰ DÌM
 * ═══════════════════════════════════════════════════════════════════
 * Sổ mảng đã được nối đúng vào trang công khai: /tinh-nang, /lo-trinh và khối
 * "một ngày" trên trang chủ đều đọc `MODULE_REGISTRY` để biết vẽ mảng nào và
 * dán HUY HIỆU gì. Chỗ đó không sai được.
 *
 * Nhưng bên cạnh mỗi huy hiệu còn một câu VĂN XUÔI (`landing.modules.*.desc`,
 * `.note`, `landing.oneDay.steps.*.desc`, các câu giải thích trên /tinh-nang
 * và /bang-gia) nằm trong `messages/vi.json` + `messages/en.json`. Câu đó
 * KHÔNG đọc từ sổ, không ai đối chiếu, và không cổng nào chạm tới. Nó là
 * "nơi thứ hai" mà luật D1 nói tới — và đúng như D1 dự đoán, nó lỗi thời.
 *
 * Đo được (tất cả đang hiện cho khách xem, tất cả nói SẢN PHẨM KÉM HƠN THẬT):
 *
 *   · `landing.modules.reports.note` = "thiếu chia sẻ báo cáo bằng link" —
 *     tính năng đó lên bản 21/08 (`lib/report-share.ts` · `app/bc/[token]` ·
 *     `app/app/settings/report-shares`).
 *   · `landing.modules.ketSat.note` = "làm ở đợt V5" — V5 đóng 19/08, và mảng
 *     đó đứng "ready" trong sổ với `/app/ketsat` + `/app/cong-no` chạy thật.
 *   · `landing.oneDay.steps.closeBooks.desc` = "…đang xếp ở các đợt kế tiếp" —
 *     nằm ngay CẠNH huy hiệu "Sẵn sàng" mà chính nó đọc từ sổ. Một dòng, hai
 *     câu trả lời ngược nhau.
 *   · `tinhNang.whyInterleaveDesc` = nhóm "Nhân sự & Chấm công" chưa có mảng
 *     nào chạy thật — trong khi ngay phía trên cùng trang đang vẽ 4 mảng của
 *     nhóm đó, cả 4 đều huy hiệu "Sẵn sàng".
 *   · `landing.modules.approvals.note` = "thiếu trình tự dựng mẫu…" — trình
 *     dựng mẫu có thật ở `/app/settings/forms` (khai trong `settings/access.ts`).
 *   · `bangGia.notPublishedNote` = "…khi đủ 20 mảng" và
 *     `loTrinh.metaDescription` (bản tiếng Anh) = "20 modules" — sổ có 31 mảng.
 *   · `tinhNang.groups.g8.subtitle` = "4 mảng mà đối thủ không có" — nhóm g8
 *     có 5 mảng trong sổ.
 *
 * Điểm chung của cả bảy: KHÔNG cái nào làm trang hỏng. Build xanh, kiểu chữ
 * xanh, trang hiện đẹp. Thứ hỏng là lời hứa với người mua, và mắt người không
 * bắt được vì phải nhớ đủ 31 mảng mới thấy lệch.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NĂM LUẬT
 * ═══════════════════════════════════════════════════════════════════
 * LUẬT 1 — Không chuỗi công khai nào được GÕ TAY tên đợt (V3, V5, V7–V8…).
 *   Tên đợt là một cái hẹn: đợt đóng thì câu chữ thành lời nói dối ngay hôm
 *   đó, mà không ai đi soát lại. Ba nhãn đợt của `PlannedWave` được miễn — vì
 *   chúng CHỈ hiện khi sổ còn mảng mang đúng `wave` ấy.
 *
 * LUẬT 2 — Chữ gắn với MỘT mảng phải khớp `status` của chính mảng đó. Mảng
 *   "ready" thì `.desc`/`.note` không được nói "đang xây / sắp có"; `.desc`
 *   cũng không được khai thiếu (chỗ khai thiếu là `.note`, và phải theo LUẬT 3).
 *
 * LUẬT 3 — Mỗi `.note` là một câu KHAI THIẾU, nên phải có PHÉP ĐO trong bảng
 *   `KHAI_THIEU` dưới đây, và phép đo phải cho ra "chưa có" thật. Đây là luật
 *   quan trọng nhất: nó biến "viết bừa một câu tự dìm" thành việc KHÔNG LÀM
 *   ĐƯỢC trong im lặng — muốn khai thiếu thì phải chỉ ra thứ đang thiếu, và
 *   nếu thứ đó đã có thì cổng đỏ ngay tại dòng đó.
 *
 * LUẬT 4 — Không gõ tay số đếm mảng/nhóm trong chuỗi công khai; phải để chỗ
 *   trống (`{total}`, `{count}`…) cho trang đổ số từ sổ vào.
 *
 * LUẬT 5 — Khi sổ không còn mảng nào ngoài "ready", không câu nào được nói
 *   "chưa có mảng nào chạy thật". Luật này tự tắt khi sổ có mảng chưa xong.
 *
 * Chỉ đọc file trong kho — không cần CSDL, không cần trình duyệt, không cần
 * `npm ci`. Đỏ trong khoảng một giây.
 *
 * Chạy: node scripts/chu-khai-tinh-nang-smoke.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const F_SO = "lib/feature-registry.ts";
const F_MOT_NGAY = "components/landing/one-day-flow.tsx";
const F_VI = "messages/vi.json";
const F_EN = "messages/en.json";

/** Nhánh câu chữ mà người CHƯA ĐĂNG NHẬP đọc được. Màn sau đăng nhập không tính. */
const NHANH_CONG_KHAI = ["landing", "tinhNang", "loTrinh", "bangGia", "nganh"];

// ─────────────────────────────────────────────────────────────────────
// LUẬT 3 — bảng PHÉP ĐO cho từng câu khai thiếu
// ─────────────────────────────────────────────────────────────────────
/**
 * Khoá = tên mảng trong sổ. Mỗi mảng có `.note` PHẢI có mặt ở đây.
 *
 * `cau`: NGUYÊN VĂN câu khai thiếu tại thời điểm phép đo được duyệt. Đổi một
 *   chữ trong `messages/*.json` mà không sửa ở đây là cổng đỏ. Lý do: phép đo
 *   chỉ đo ĐÚNG cái mà câu đang nói; câu đổi nội dung thì phép đo cũ không còn
 *   chứng minh gì. Bản cũ của `approvals` khai thiếu HAI thứ trong một câu, một
 *   thứ có thật một thứ không — kiểu lệch đó chỉ chặn được bằng cách buộc xét lại.
 * `do`: danh sách phép đo, mỗi phép phải cho kết quả "chưa có":
 *   · `{ tep }`          — đường dẫn này KHÔNG được tồn tại.
 *   · `{ mau, trong }`   — mẫu chữ này KHÔNG được xuất hiện trong các thư mục đó.
 *   · `{ thuMucCon, dungLa }` — thư mục con trực tiếp phải ĐÚNG bằng danh sách
 *     này; mọc thêm cái mới thì đỏ để người thêm phải xét lại câu khai thiếu.
 * `khongDo`: khai THẲNG rằng câu này không đo được bằng mã, kèm lý do. Cố ý
 *   bắt viết ra thay vì cho phép im lặng bỏ qua.
 */
const KHAI_THIEU = {
  // Không đo được bằng mã: đây là trạng thái GIẤY TỜ bên Zalo, không phải
  // thứ nằm trong kho. Khi nào duyệt xong thì người biết tin phải tự xoá câu này.
  inbox: {
    cau: { vi: "Zalo OA chờ pháp nhân duyệt", en: "Zalo OA pending business verification" },
    khongDo: "trạng thái duyệt pháp nhân bên Zalo — không có dấu vết nào trong kho để đo",
  },

  // Trình DỰNG MẪU thì ĐÃ CÓ (`app/app/settings/forms`, khai trong
  // `app/app/settings/access.ts`) — câu cũ khai thiếu cả cái đó và đã sai.
  // Cấp duyệt hiện là `ApprovalLevel = { to: string }`, không có ô điều kiện nào.
  approvals: {
    cau: { vi: "chưa có rẽ nhánh theo điều kiện", en: "no conditional routing yet" },
    do: [{ mau: /dieu_kien|conditional|condition_json|if_field/i, trong: ["app/app/settings/forms", "app/app/approvals"] }],
  },

  // `ai_reply_log` ghi nhật ký từng lượt AI trả lời, nhưng không cột nào chấm
  // điểm chất lượng câu trả lời đó.
  csatQc: {
    cau: { vi: "chưa có chấm chất lượng câu trả lời bằng AI", en: "no AI-scored reply quality yet" },
    do: [{ mau: /qc_score|reply_quality|cham_chat_luong/i, trong: ["lib", "app/app/csat", "supabase/migrations"] }],
  },

  // Xuất dữ liệu hiện là tải tay qua `/api/export/*`; không có lịch, không có
  // đường nối ra Google Sheets hay Looker.
  dataExport: {
    cau: {
      vi: "chưa có xuất theo lịch và nối Google Sheets/Looker",
      en: "no scheduled exports or Google Sheets/Looker link yet",
    },
    do: [{ mau: /scheduled_export|export_schedule|sheets\.googleapis|looker/i, trong: ["lib", "app", "supabase/migrations"] }],
  },

  // Mặt tiền tiệm hiện chỉ có một trang con là đặt lịch; mọc thêm trang con nào
  // thì phải xét lại câu này.
  storefront: {
    cau: { vi: "chưa có trang riêng cho từng khách", en: "no per-customer pages yet" },
    do: [{ thuMucCon: "app/t/[slug]", dungLa: ["dat-lich"] }],
  },

  // `quote` duy nhất trong kho là báo giá ĐỔI GÓI trong `settings/billing` —
  // đó là tiền iFan thu, không phải báo giá tiệm gửi khách.
  orders: {
    cau: { vi: "chưa có báo giá và hoá đơn điện tử", en: "quotes and e-invoices not available yet" },
    do: [
      { tep: "app/app/quotes" },
      { tep: "app/app/invoices" },
      { mau: /e_invoice|einvoice|hoa_don_dien_tu|bao_gia/i, trong: ["lib", "app", "supabase/migrations"] },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────
// Từ vựng trạng thái
// ─────────────────────────────────────────────────────────────────────
/** Nói "đang có người làm ngay lúc này". */
const CHU_DANG_XAY = [
  "đang xây", "đang làm", "đang dựng", "đang xếp", "sắp có", "sắp ra",
  "still coming", "coming soon", "still in progress", "being built", "in the works",
];
/** Nói "chỗ này còn thiếu". */
const CHU_KHAI_THIEU = [
  "chưa có", "chưa hỗ trợ", "thiếu ", "còn thiếu",
  "still missing", "not available yet", "not yet available", "no per-", "nothing live",
];
/** LUẬT 5 — nói "cả một nhóm chưa có gì chạy". */
const CHU_TRONG_NHOM = ["chưa có mảng nào", "mảng chưa có", "nothing live yet", "has nothing live"];

/** LUẬT 1 — ba nhãn này là nhãn của `PlannedWave`, chỉ hiện khi sổ còn mảng thuộc đợt. */
const MIEN_TEN_DOT = new Set(["loTrinh.waveV3V5Sub", "loTrinh.waveV6Sub", "loTrinh.waveV7Sub"]);

/** LUẬT 4b — khoá nào đã nối vào sổ thì phải GIỮ chỗ trống, không được gõ số trở lại. */
const KHOA_CAN_SO = {
  "landing.hero.badge": ["{ready}", "{total}"],
  "tinhNang.metaDescription": ["{groups}"],
  "tinhNang.whyGroupsTitle": ["{groups}"],
  "tinhNang.groups.g8.subtitle": ["{count}"],
  "tinhNang.countReady": ["{count}"],
  "tinhNang.countBuilding": ["{count}"],
  "tinhNang.countPlanned": ["{count}"],
  "loTrinh.launchDesc": ["{ready}", "{total}"],
};

// ─────────────────────────────────────────────────────────────────────
let truot = 0;
const bao = (luat, khoa, cau, viSao) => {
  truot++;
  console.error(`  TRƯỢT  [${luat}] ${khoa}`);
  console.error(`         “${cau}”`);
  console.error(`         ${viSao}`);
};

const doc = (tep) => readFileSync(path.join(GOC, tep), "utf8");

/** Bóc một khối khai báo; không khớp = cấu trúc file đã đổi ⇒ dừng hẳn, không đoán. */
function khoi(nguon, bieuThuc, ten, tep) {
  const m = nguon.match(bieuThuc);
  if (!m) {
    console.error(`❌ Không đọc được \`${ten}\` trong ${tep}.`);
    console.error("   Cổng này soát bằng cách ĐỌC MÃ NGUỒN, nên đổi cách khai báo thì phải");
    console.error("   sửa lại phép bóc trong scripts/chu-khai-tinh-nang-smoke.mjs —");
    console.error("   ĐỪNG gỡ bước này khỏi CI để cho qua.");
    process.exit(1);
  }
  return m[1].replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

// ── Sổ mảng ──────────────────────────────────────────────────────────
const nguonSo = doc(F_SO);
const MANG = [...khoi(nguonSo, /const MODULE_REGISTRY[^=]*=\s*\[([\s\S]*?)\n\];/, "MODULE_REGISTRY", F_SO).matchAll(/\{([^{}]*)\}/g)]
  .map((m) => ({
    key: m[1].match(/key:\s*"([^"]+)"/)?.[1],
    status: m[1].match(/status:\s*"([^"]+)"/)?.[1],
    groupId: m[1].match(/groupId:\s*"([^"]+)"/)?.[1],
  }))
  .filter((x) => x.key && x.status);
if (MANG.length === 0) {
  console.error(`❌ Bóc được 0 mảng từ ${F_SO} — chắc chắn sai, dừng.`);
  process.exit(1);
}
const TRANG_THAI = Object.fromEntries(MANG.map((m) => [m.key, m.status]));
const SO_READY = MANG.filter((m) => m.status === "ready").length;
const SO_CHUA_XONG = MANG.length - SO_READY;
const SO_NHOM = [
  ...khoi(nguonSo, /const GROUP_REGISTRY[^=]*=\s*\[([\s\S]*?)\n\];/, "GROUP_REGISTRY", F_SO).matchAll(/id:\s*"([^"]+)"/g),
].length;

// ── Bản đồ chặng "một ngày" → mảng ───────────────────────────────────
const nguonMotNgay = doc(F_MOT_NGAY);
const CHANG = Object.fromEntries(
  [...khoi(nguonMotNgay, /const STEPS\s*=\s*\[([\s\S]*?)\n\] as const;/, "STEPS", F_MOT_NGAY).matchAll(
    /id:\s*"([^"]+)"[^}]*moduleKey:\s*"([^"]+)"/g,
  )].map((m) => [m[1], m[2]]),
);
if (Object.keys(CHANG).length === 0) {
  console.error(`❌ Bóc được 0 chặng từ ${F_MOT_NGAY} — chắc chắn sai, dừng.`);
  process.exit(1);
}

// ── Câu chữ công khai, cả hai bản dịch ───────────────────────────────
function goc(obj, tien, ra) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const khoa = tien ? `${tien}.${k}` : k;
    if (typeof v === "string") ra.push([khoa, v]);
    else if (v && typeof v === "object") goc(v, khoa, ra);
  }
}
const CAU = [];
for (const [ban, tep] of [["vi", F_VI], ["en", F_EN]]) {
  const tatCa = JSON.parse(doc(tep));
  for (const nhanh of NHANH_CONG_KHAI) {
    if (!tatCa[nhanh]) continue;
    const ra = [];
    goc(tatCa[nhanh], nhanh, ra);
    for (const [khoa, cau] of ra) CAU.push([ban, khoa, cau]);
  }
}

// ─────────────────────────────────────────────────────────────────────
// LUẬT 1 — tên đợt gõ tay
// ─────────────────────────────────────────────────────────────────────
const TEN_DOT = /(?<![A-Za-z0-9])V\d/;
for (const [ban, khoa, cau] of CAU) {
  if (MIEN_TEN_DOT.has(khoa)) continue;
  if (TEN_DOT.test(cau)) {
    bao("LUẬT 1", `${ban}:${khoa}`, cau,
      "gõ tay tên đợt. Đợt đóng là câu này thành lời nói dối mà không ai đi soát. " +
      "Trạng thái lấy từ sổ; đợt nào còn mảng thì để nhãn đợt trong loTrinh.wave*Sub lo.");
  }
}

// ─────────────────────────────────────────────────────────────────────
// LUẬT 2 — chữ của một mảng phải khớp status của chính mảng đó
// ─────────────────────────────────────────────────────────────────────
/** khoá i18n → tên mảng trong sổ (chỉ những câu DÍNH vào đúng một mảng). */
function mangCuaKhoa(khoa) {
  const m1 = khoa.match(/^landing\.modules\.([^.]+)\.(name|desc|note)$/);
  if (m1) return { key: m1[1], phan: m1[2] };
  const m2 = khoa.match(/^landing\.oneDay\.steps\.([^.]+)\.(title|desc)$/);
  if (m2 && CHANG[m2[1]]) return { key: CHANG[m2[1]], phan: m2[2] };
  return null;
}
const chua = (cau, tuVung) => tuVung.find((t) => cau.toLowerCase().includes(t));
for (const [ban, khoa, cau] of CAU) {
  const gan = mangCuaKhoa(khoa);
  if (!gan) continue;
  const tt = TRANG_THAI[gan.key];
  if (!tt) {
    bao("LUẬT 2", `${ban}:${khoa}`, cau, `mảng "${gan.key}" không có trong ${F_SO} — câu chữ mồ côi.`);
    continue;
  }
  if (tt !== "building") {
    const t = chua(cau, CHU_DANG_XAY);
    if (t) bao("LUẬT 2", `${ban}:${khoa}`, cau,
      `nói “${t}” nhưng sổ ghi mảng "${gan.key}" đang là "${tt}". Huy hiệu ngay cạnh câu này đọc từ sổ ⇒ một dòng hai câu trả lời.`);
  }
  if (tt === "ready" && gan.phan === "desc") {
    const t = chua(cau, CHU_KHAI_THIEU);
    if (t) bao("LUẬT 2", `${ban}:${khoa}`, cau,
      `câu MÔ TẢ nói “${t}”. Chỗ khai thiếu là \`.note\` — và \`.note\` phải kèm phép đo (LUẬT 3).`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// LUẬT 3 — mỗi câu khai thiếu phải có phép đo, và phép đo phải đúng
// ─────────────────────────────────────────────────────────────────────
const DUOI_MA = new Set([".ts", ".tsx", ".sql", ".mjs", ".js"]);
function quet(thuMuc, bieu) {
  const day = path.join(GOC, thuMuc);
  if (!existsSync(day)) return null;
  const hangDoi = [day];
  while (hangDoi.length) {
    const cho = hangDoi.pop();
    for (const ten of readdirSync(cho)) {
      if (ten === "node_modules" || ten.startsWith(".")) continue;
      const day2 = path.join(cho, ten);
      if (statSync(day2).isDirectory()) hangDoi.push(day2);
      else if (DUOI_MA.has(path.extname(ten)) && bieu.test(readFileSync(day2, "utf8")))
        return path.relative(GOC, day2).replace(/\\/g, "/");
    }
  }
  return null;
}

/** mảng → { vi, en } nguyên văn câu khai thiếu đang nằm trong kho câu chữ. */
const NOTE_THAT = {};
for (const [ban, khoa, cau] of CAU) {
  const m = khoa.match(/^landing\.modules\.([^.]+)\.note$/);
  if (m) (NOTE_THAT[m[1]] ??= {})[ban] = cau;
}
const coNote = new Set(Object.keys(NOTE_THAT));
for (const key of coNote) {
  const muc = KHAI_THIEU[key];
  if (!muc) {
    truot++;
    console.error(`  TRƯỢT  [LUẬT 3] landing.modules.${key}.note`);
    console.error(`         Câu khai thiếu này CHƯA có phép đo trong bảng KHAI_THIEU.`);
    console.error(`         Đây chính là chỗ đã lọt hai lần: viết "thiếu X" mà X đang chạy thật.`);
    console.error(`         Thêm mục "${key}" vào bảng trong scripts/chu-khai-tinh-nang-smoke.mjs:`);
    console.error(`         chỉ ra thứ đang thiếu bằng { tep } hoặc { mau, trong }. Nếu không chỉ`);
    console.error(`         ra được vì thứ đó ĐÃ CÓ ⇒ câu khai thiếu là sai, xoá câu đi.`);
    continue;
  }
  // Câu đổi chữ mà bảng chưa xét lại ⇒ phép đo bên dưới không còn chứng minh
  // cho câu ĐANG hiện trên trang nữa. Đỏ ở đây rẻ hơn nhiều so với xanh giả.
  for (const ban of ["vi", "en"]) {
    if (NOTE_THAT[key][ban] !== muc.cau?.[ban])
      bao("LUẬT 3", `${ban}:landing.modules.${key}.note`, NOTE_THAT[key][ban] ?? "(không có)",
        `khác với nguyên văn đã duyệt trong bảng KHAI_THIEU (“${muc.cau?.[ban] ?? "(chưa khai)"}”). ` +
        `Đọc lại phép đo xem còn đo đúng thứ câu mới đang nói không, rồi cập nhật \`cau\`.`);
  }
  if (muc.khongDo) continue;
  for (const phep of muc.do ?? []) {
    if (phep.tep) {
      if (existsSync(path.join(GOC, phep.tep)))
        bao("LUẬT 3", `landing.modules.${key}.note`, `phép đo { tep: "${phep.tep}" }`,
          `đường dẫn đó ĐANG TỒN TẠI ⇒ thứ bị khai là thiếu thì đã có. Sửa câu chữ, đừng sửa phép đo.`);
    } else if (phep.mau) {
      for (const tm of phep.trong) {
        const thay = quet(tm, phep.mau);
        if (thay)
          bao("LUẬT 3", `landing.modules.${key}.note`, `phép đo ${phep.mau} trong ${tm}`,
            `khớp tại ${thay} ⇒ thứ bị khai là thiếu thì đã có. Sửa câu chữ, đừng sửa phép đo.`);
      }
    } else if (phep.thuMucCon) {
      const day = path.join(GOC, phep.thuMucCon);
      const con = existsSync(day) ? readdirSync(day).filter((t) => statSync(path.join(day, t)).isDirectory()) : [];
      const them = con.filter((t) => !phep.dungLa.includes(t));
      if (them.length)
        bao("LUẬT 3", `landing.modules.${key}.note`, `phép đo thư mục con của ${phep.thuMucCon}`,
          `mọc thêm ${them.join(", ")} ⇒ xét lại câu khai thiếu rồi cập nhật \`dungLa\`.`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// LUẬT 4 — số đếm mảng/nhóm gõ tay
// ─────────────────────────────────────────────────────────────────────
const SO_GO_TAY = /(\d+)\s*(mảng|nhóm|modules?|groups?)\b/i;
for (const [ban, khoa, cau] of CAU) {
  const m = cau.match(SO_GO_TAY);
  if (m)
    bao("LUẬT 4", `${ban}:${khoa}`, cau,
      `gõ tay “${m[0]}”. Sổ đang có ${MANG.length} mảng trong ${SO_NHOM} nhóm — số gõ tay không tự đổi theo. ` +
      `Để chỗ trống ({total}/{count}/{groups}) rồi cho trang đổ số từ feature-registry.ts vào.`);
}
for (const [khoa, cans] of Object.entries(KHOA_CAN_SO)) {
  for (const [ban, k, cau] of CAU) {
    if (k !== khoa) continue;
    for (const can of cans)
      if (!cau.includes(can))
        bao("LUẬT 4", `${ban}:${khoa}`, cau, `mất chỗ trống ${can} — câu này phải lấy số từ sổ, không được gõ.`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// LUẬT 5 — khai "cả nhóm chưa có gì" trong khi sổ nói ngược lại
// ─────────────────────────────────────────────────────────────────────
if (SO_CHUA_XONG === 0) {
  for (const [ban, khoa, cau] of CAU) {
    const t = chua(cau, CHU_TRONG_NHOM);
    if (t)
      bao("LUẬT 5", `${ban}:${khoa}`, cau,
        `nói “${t}” trong khi sổ ghi ${SO_READY}/${MANG.length} mảng đều "ready" — không nhóm nào trống.`);
  }
}

// ─────────────────────────────────────────────────────────────────────
if (truot) {
  console.error(`\n❌ ${truot} chỗ chữ công khai lệch khỏi ${F_SO}.`);
  console.error("   Sổ là nguồn duy nhất (D1). Sửa CÂU CHỮ cho khớp sổ, hoặc sửa SỔ nếu sổ sai —");
  console.error("   đừng nới cổng.");
  process.exit(1);
}
console.log(
  `✅ Chữ công khai khớp sổ: ${CAU.length} câu (${NHANH_CONG_KHAI.join(" · ")}) ` +
    `soi theo ${MANG.length} mảng (${SO_READY} ready), ${Object.keys(CHANG).length} chặng "một ngày", ` +
    `${coNote.size} câu khai thiếu đều có phép đo.`,
);

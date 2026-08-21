/**
 * KIỂM ĐƯỜNG GHI LỖI ỨNG DỤNG — từ trình duyệt tới sổ, và ai đọc được sổ đó.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Trước migration #327, kho KHÔNG có đường nào để biết một tiệm vừa gặp lỗi:
 * `app/error.tsx` chỉ VẼ một màn xin lỗi rồi thôi. Một màn hỏng với khách hàng
 * thật có thể nằm im nhiều ngày.
 *
 * ⚠️ CHÍNH ĐƯỜNG GHI LỖI LÀ THỨ DỄ HỎNG TRONG IM LẶNG NHẤT. Nó cố ý nuốt mọi
 *   lỗi của bản thân (ném lỗi ở đó sẽ nuốt mất lỗi gốc). Nghĩa là khi nó hỏng,
 *   KHÔNG có dấu hiệu nào: màn lỗi vẫn hiện, người dùng vẫn thấy y hệt, và sổ
 *   thì trống. "Sổ trống" trông giống hệt "không có lỗi nào" — đó là lý do
 *   phải đo bằng cách bắn một lỗi thật rồi đi đọc sổ.
 *
 * ⚠️ PHẢI ĐO CẢ PHÉP GỘP. Không gộp thì một lỗi trong vòng lặp vẽ giao diện
 *   bắn hàng nghìn dòng, kho hết dung lượng, và người đọc không nhìn ra đang
 *   có MẤY LOẠI lỗi — thứ duy nhất thật sự cần biết.
 *
 * ⚠️ BỘ KIỂM NÀY CHỈ ĐO ĐƯỜNG LỖI TỪ TRÌNH DUYỆT. Đường lỗi phía MÁY CHỦ
 *   (`instrumentation.ts` → `onRequestError`) đã đo TAY ngày 21/08 — dựng một
 *   đường dẫn cố tình ném lỗi, gọi vào, và thấy đủ lời lỗi + đường dẫn + vết
 *   gọi hàm trong sổ, ghi đúng là `server`. KHÔNG tự động hoá được vì muốn vậy
 *   phải để lại một đường dẫn cố tình hỏng trên bản chạy thật — cái giá đó lớn
 *   hơn cái lợi. Ghi ra đây để không ai đọc bộ kiểm này rồi tưởng cả hai đường
 *   đều đang được canh.
 *
 * Chạy: node scripts/so-loi-smoke.mjs [địa-chỉ]
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const NEN = process.argv[2] ?? process.env.DIA_CHI ?? "http://localhost:3000";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && existsSync(path.join(GOC, ".env.local"))) {
  for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split("\n")) {
    const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
const URL_NEN = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KHOA = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KHOA_CHUNG = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_NEN || !KHOA) {
  console.error("❌ Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

let dat = 0;
let truot = 0;
const kiem = (ten, ok, ghi = "") => {
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${ghi ? " — " + ghi : ""}`);
  ok ? dat++ : truot++;
};

const db = createClient(URL_NEN, KHOA, { auth: { persistSession: false } });
// Dấu riêng cho lượt chạy này — không đụng vào lỗi thật đang có trong sổ.
const DAU = `THU-SO-LOI-${Date.now().toString(36)}`;
const than = {
  loi: `${DAU}: lỗi giả của bộ kiểm`,
  vet: `at boKiem (so-loi-smoke.mjs:1:1)\nat X (y.js:2:2)`,
  duongDan: "/thu-nghiem",
};

const gui = async (b) =>
  (
    await fetch(`${NEN}/api/loi`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(b),
    })
  ).status;

// (1) Bắn hai lượt CÙNG một lỗi.
kiem("cửa nhận báo lỗi trả 204", (await gui(than)) === 204);
await gui(than);

// Chờ tới khi sổ có dòng đó — chờ theo ĐIỀU KIỆN, không theo đồng hồ.
let dong = null;
for (let i = 0; i < 20 && !dong; i++) {
  const { data } = await db.from("app_errors").select("*").eq("loi", than.loi).maybeSingle();
  dong = data ?? null;
  if (!dong) await new Promise((r) => setTimeout(r, 500));
}
kiem("lỗi từ trình duyệt ĐÃ vào sổ", Boolean(dong), dong ? "" : "sổ vẫn trống");

if (dong) {
  kiem("gộp đúng: hai lượt cùng lỗi = MỘT dòng, đếm 2", dong.so_lan === 2, `so_lan=${dong.so_lan}`);
  kiem("giữ được đường dẫn màn hình lúc lỗi", dong.duong_dan === "/thu-nghiem", dong.duong_dan);
  kiem("giữ được vết gọi hàm", Boolean(dong.vet), (dong.vet ?? "").slice(0, 26));
  kiem("ghi đúng là lỗi ở trình duyệt", dong.noi === "client", dong.noi);
}

// (2) Lời báo RỖNG và QUÁ CỠ không được vào sổ.
await gui({ loi: "" });
await gui({ loi: "x".repeat(9000) });
const { count: soDong } = await db
  .from("app_errors")
  .select("dau_van_tay", { count: "exact", head: true })
  .like("loi", "x%");
kiem("lời báo quá cỡ KHÔNG vào sổ", (soDong ?? 0) === 0, `${soDong} dòng`);

// (3) Người ngoài KHÔNG đọc được sổ lỗi — vết gọi hàm có thể mang dữ liệu tiệm.
if (KHOA_CHUNG) {
  const ngoai = createClient(URL_NEN, KHOA_CHUNG);
  const r = await ngoai.from("app_errors").select("dau_van_tay").limit(1);
  kiem("người ngoài KHÔNG đọc được sổ lỗi", (r.data ?? []).length === 0, r.error ? "bị chặn" : "0 dòng");
}

// Dọn dấu của lượt chạy này.
await db.from("app_errors").delete().eq("loi", than.loi);

console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);

/**
 * Cổng: phiên hết hạn → đăng nhập lại phải QUAY VỀ ĐÚNG CHỖ đang đứng, và
 * tham số `next` không được biến thành lỗ chuyển hướng mở.
 *
 * Hai phần, phần nào hỏng cũng đỏ:
 *   1. Phép lọc `noiQuayLai` — chạy thẳng, không cần máy chủ.
 *   2. Máy chủ thật: vào /app/... khi chưa đăng nhập phải bị đá về
 *      /login?next=<chỗ đó>. Đây là phần dễ mục nhất — proxy sửa một dòng là
 *      mất, mà không màn nào báo lỗi.
 *
 * Nền đo: đối số dòng lệnh, rồi tới biến NEN, mặc định máy cục bộ. (Từng có
 * cổng chỉ đọc NEN và bỏ qua đối số → tôi sửa nhầm ba lần trên bản đã phát
 * hành trong lúc tưởng đang đo bản cục bộ.)
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const nen = process.argv[2] ?? process.env.NEN ?? "http://127.0.0.1:3000";
let loi = 0;
const bao = (ok, ten, them = "") => {
  if (!ok) loi++;
  console.log(`${ok ? "  ok " : "ĐỎ  "} ${ten}${them ? ` — ${them}` : ""}`);
};

// ---------- 1. Phép lọc ----------
// Nạp THẲNG file thật (Node tự bóc chú thích kiểu của TypeScript). Không chép
// lại luật vào đây: cổng chép luật là cổng đo bản sao, sửa file thật mà cổng
// vẫn xanh.
const { noiQuayLai, NHA_SAU_DANG_NHAP } = await import(
  pathToFileURL(resolve("lib/auth/noi-quay-lai.ts")).href
);

const NHAN = ["/app/tai-san", "/app/orders/abc?tab=chi-tiet", "/onboarding", "/admin/tenants"];
const TU_CHOI = [
  "//trang-gia.example",
  "https://trang-gia.example",
  "http://trang-gia.example/app",
  "\\trang-gia.example",
  "/appearance-gia",            // tiền tố giống nhưng KHÁC nhánh
  "/onboardingXYZ",
  "/",
  "",
  null,
  undefined,
  42,
  "/app" + "x".repeat(600),     // quá dài
];
for (const p of NHAN) bao(noiQuayLai(p) === p, `nhận: ${p}`);
for (const p of TU_CHOI)
  bao(noiQuayLai(p) === NHA_SAU_DANG_NHAP, `chặn: ${JSON.stringify(p)}`, `→ ${noiQuayLai(p)}`);

// ---------- 2. Máy chủ thật ----------
const dich = "/app/tai-san";
try {
  const r = await fetch(nen + dich, { redirect: "manual" });
  const den = r.headers.get("location") ?? "";
  bao([302, 303, 307].includes(r.status), `chưa đăng nhập thì bị chặn (${r.status})`);
  const u = den ? new URL(den, nen) : null;
  bao(u?.pathname === "/login", "đá về trang đăng nhập", den);
  bao(u?.searchParams.get("next") === dich, "nhớ chỗ đang đứng", `next=${u?.searchParams.get("next")}`);
} catch (e) {
  bao(false, "gọi được máy chủ", `${nen} — ${e.message}`);
}

console.log(loi === 0 ? "\nXANH" : `\nĐỎ: ${loi} mục`);
process.exit(loi === 0 ? 0 : 1);

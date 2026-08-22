/**
 * QUAY LUI — đưa web về một bản đã dựng trước đó.
 *
 * ═══════════════════════════════════════════════════════════════════
 * ⚠️ ĐỌC HẾT KHỐI NÀY TRƯỚC KHI CHẠY. QUAY LUI KHÔNG PHẢI NÚT HOÀN TÁC.
 * ═══════════════════════════════════════════════════════════════════
 * Nó chỉ đưa MÃ NGUỒN về bản cũ. Nó KHÔNG đưa CƠ SỞ DỮ LIỆU về theo, và kho
 * này có hơn 330 bản vá lược đồ chỉ đi TỚI, không có đường lùi.
 *
 * Hệ quả cụ thể:
 *   · Bản vá chỉ THÊM bảng/cột  → quay lui an toàn: mã cũ không biết tới thứ
 *     mới, và thứ mới nằm im. Đây là phần lớn các trường hợp.
 *   · Bản vá ĐỔI TÊN hoặc XOÁ cột, đổi kiểu, đổi ràng buộc → quay lui làm mã cũ
 *     đòi một cột KHÔNG CÒN, và màn đó hỏng ngay. Lúc đó quay lui khiến mọi
 *     chuyện TỆ HƠN là để nguyên.
 *
 * ⇒ TRƯỚC KHI QUAY LUI, xem các bản vá đã áp SAU bản định quay về. Công cụ này
 *   tự liệt kê ra cho bạn xem, và tự KHÔNG làm gì nếu bạn chưa xác nhận.
 *
 * ⚠️ Công cụ này KHÔNG TỰ ĐỘNG quay lui bao giờ. Phải chỉ đích danh bản muốn
 *   về. "Tự quay lui khi thấy lỗi" nghe hay nhưng là cách chắc chắn nhất để một
 *   sự cố nhỏ thành một vòng lặp lên-xuống giữa hai bản đều hỏng.
 *
 * Chạy:
 *   node scripts/quay-lui.mjs                     → liệt kê các bản có thể quay về
 *   node scripts/quay-lui.mjs --ve <mã> --thu     → XEM THỬ: phân tích, chưa đổi gì
 *   node scripts/quay-lui.mjs --ve <mã>           → quay về đúng bản đó (LÀM THẬT)
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
if (!process.env.VERCEL_TOKEN && existsSync(path.join(GOC, ".env.local"))) {
  // ⚠️ `\r?\n`, KHÔNG phải `\n`: tách theo `\n` thì dòng kiểu Windows còn sót `\r` ở
  //   đuôi, mà trong regex JavaScript `\r` LÀ ký tự xuống dòng — `.` không khớp nó và
  //   `$` (không cờ `m`) chỉ khớp cuối chuỗi, nên `(.*)$` TRƯỢT sạch mọi dòng CRLF.
  //   Đo 22/08 trên `.env.local` của máy này (37 dòng CRLF + 6 dòng LF): đọc được đúng
  //   1/22 biến rồi dừng ở "thiếu khoá" ⇒ script này CHƯA TỪNG CHẠY ĐƯỢC trên Windows.
  for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
const TOKEN = process.env.VERCEL_TOKEN;
if (!TOKEN) {
  console.error("❌ Thiếu VERCEL_TOKEN.");
  process.exit(1);
}
const H = { Authorization: `Bearer ${TOKEN}` };

const duAn = await (await fetch("https://api.vercel.com/v9/projects?limit=20", { headers: H })).json();
const p = (duAn.projects ?? []).find((x) => x.name === "ifan-web");
if (!p) {
  console.error("❌ Không thấy dự án `ifan-web`.");
  process.exit(1);
}

const ds = await (
  await fetch(`https://api.vercel.com/v6/deployments?projectId=${p.id}&limit=12&target=production`, {
    headers: H,
  })
).json();
const ban = (ds.deployments ?? []).filter((x) => x.state === "READY");

const ve = (() => {
  const i = process.argv.indexOf("--ve");
  return i >= 0 ? process.argv[i + 1] : null;
})();

if (!ve) {
  console.log(`Các bản có thể quay về (dự án ${p.name}):\n`);
  ban.forEach((x, i) => {
    const luc = new Date(x.created).toISOString().replace("T", " ").slice(0, 16);
    const cau = (x.meta?.githubCommitMessage ?? "").split("\n")[0].slice(0, 56);
    console.log(`  ${i === 0 ? "→ ĐANG CHẠY" : "            "}  ${luc}  ${x.uid}`);
    console.log(`                ${cau}`);
  });
  console.log("\nQuay về một bản:  node scripts/quay-lui.mjs --ve <mã-bản>");
  console.log("\n⚠️ Quay lui CHỈ đưa mã nguồn về, KHÔNG đưa cơ sở dữ liệu về theo.");
  console.log("   Công cụ sẽ liệt kê các bản vá lược đồ đã áp sau bản đó để bạn cân nhắc.");
  process.exit(0);
}

const dich = ban.find((x) => x.uid === ve);
if (!dich) {
  console.error(`❌ Không thấy bản \`${ve}\` trong 12 bản gần nhất, hoặc bản đó chưa sẵn sàng.`);
  process.exit(1);
}
if (dich.uid === ban[0]?.uid) {
  console.log("Bản này ĐANG chạy rồi — không có gì để quay lui.");
  process.exit(0);
}

// ── Cảnh báo về cơ sở dữ liệu, dựa trên số liệu thật ─────────────────
//
// ⚠️ PHÉP ĐO NÀY CỐ Ý THÔ VÀ NGHIÊNG VỀ PHÍA CẢNH BÁO THỪA:
//   · Tên bản vá chỉ có NGÀY, không có giờ — nên mọi bản vá CÙNG NGÀY với bản
//     định quay về đều bị tính vào, kể cả bản đã áp trước đó. Đếm dư.
//   · Nó đọc CHỮ trong tệp, không hiểu ngữ nghĩa: một dòng `drop column` nằm
//     trong chú thích cũng bị tính.
//   Cả hai đều làm nó kêu nhiều hơn thực tế. Với một công cụ chỉ dùng lúc đang
//   có sự cố thì nghiêng về phía đó là đúng: kêu thừa thì mất một phút đọc,
//   im lặng thiếu thì mất dữ liệu. KHÔNG được "chỉnh cho bớt kêu".
//
// ⚠️ Nó KHÔNG kiểm được sổ áp bản vá thật trong cơ sở dữ liệu — cố ý: lúc cần
//   quay lui thì chính cơ sở dữ liệu có thể là thứ đang hỏng.
const thuMuc = path.join(GOC, "supabase", "migrations");
const moc = new Date(dich.created);
const sauDo = readdirSync(thuMuc)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => {
    const m = f.match(/^(\d{8})/);
    if (!m) return false;
    const d = new Date(`${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`);
    return d >= new Date(moc.getFullYear(), moc.getMonth(), moc.getDate());
  })
  .sort();

console.log(`Quay về bản dựng lúc ${new Date(dich.created).toISOString().slice(0, 16)}`);
console.log(`  ${(dich.meta?.githubCommitMessage ?? "").split("\n")[0].slice(0, 70)}\n`);

if (sauDo.length) {
  console.log(`⚠️ CÓ ${sauDo.length} BẢN VÁ LƯỢC ĐỒ áp từ ngày đó trở đi:`);
  for (const f of sauDo.slice(-12)) {
    const noi = readFileSync(path.join(thuMuc, f), "utf8").toLowerCase();
    // Chỉ THÊM thì thường an toàn; ĐỔI/XOÁ mới là thứ làm mã cũ hỏng.
    const nguyHiem = /drop column|drop table|rename column|rename to|alter column .* type|drop constraint/.test(noi);
    console.log(`   ${nguyHiem ? "🔴 CÓ ĐỔI/XOÁ" : "🟢 chỉ thêm  "}  ${f}`);
  }
  const soNguyHiem = sauDo.filter((f) =>
    /drop column|drop table|rename column|rename to|alter column .* type|drop constraint/.test(
      readFileSync(path.join(thuMuc, f), "utf8").toLowerCase(),
    ),
  ).length;
  console.log("");
  if (soNguyHiem > 0) {
    console.error(`❌ ${soNguyHiem} bản vá có ĐỔI hoặc XOÁ cột/bảng.`);
    console.error("   Quay lui lúc này làm mã cũ đòi một thứ KHÔNG CÒN trong kho dữ liệu —");
    console.error("   màn đó sẽ hỏng ngay, và quay lui khiến mọi chuyện TỆ HƠN là để nguyên.");
    console.error("   Muốn vẫn làm thì thêm `--toi-hieu-rui-ro`.");
    if (!process.argv.includes("--toi-hieu-rui-ro")) process.exit(1);
  } else {
    console.log("🟢 Các bản vá đó chỉ THÊM — mã cũ không biết tới thứ mới, và thứ mới nằm im.");
  }
}

// ⚠️ XEM THỬ trước khi làm thật. Quay lui đổi thứ khách hàng đang nhìn thấy —
//   phải xem được phần phân tích lược đồ TRƯỚC khi quyết, chứ không phải sau.
if (process.argv.includes("--thu")) {
  console.log("\n(xem thử — CHƯA đổi gì trên bản chạy thật)");
  console.log("Muốn làm thật: bỏ `--thu`.");
  process.exit(0);
}

const r = await fetch(`https://api.vercel.com/v13/deployments/${dich.uid}/promote`, {
  method: "POST",
  headers: { ...H, "content-type": "application/json" },
});
if (!r.ok) {
  console.error(`❌ Quay lui hỏng: ${r.status} ${(await r.text()).slice(0, 200)}`);
  process.exit(1);
}
console.log("✓ Đã đưa bản đó lên chạy. Kiểm lại ngay: node scripts/canh-song.mjs");

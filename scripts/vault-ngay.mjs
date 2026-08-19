#!/usr/bin/env node
/**
 * ADR-0018 — đóng dấu "ngày tạo" + "sửa lần cuối" vào frontmatter mọi file
 * vault, TỰ ĐỘNG (founder 14/08: "Toàn bộ vault đều phải có ngày tạo và
 * ngày chỉnh sửa gần nhất (auto)").
 *
 * Đọc đủ ADR-0018 trước khi sửa file này — đặc biệt mục 2-4 (vì sao KHÔNG
 * dùng riêng git hoặc riêng ổ đĩa) và mục 6 (4 ca nghiệm thu bắt buộc).
 *
 * BA CHẾ ĐỘ:
 *   node scripts/vault-ngay.mjs             — đo + đóng dấu (chỉ ghi file có đổi)
 *   node scripts/vault-ngay.mjs --kiem      — chỉ so sánh, KHÔNG ghi; lệch = ĐỎ, exit 1
 *   node scripts/vault-ngay.mjs --cai-moc   — cài móc pre-commit vào kho vault
 *
 * NGUỒN NGÀY (đã chốt ở ADR, đo thật — đừng quyết lại):
 *   ngày tạo      = SỚM NHẤT giữa (a) commit ĐẦU TIÊN chạm file và (b) ngày
 *                   tạo ổ đĩa. Git sai 36/57 file (vault vào git muộn 11
 *                   ngày so với lúc viết); ổ đĩa sai 12/57 file (đồng bộ ghi
 *                   đè xoá mất ngày gốc). Lấy MIN thì không bao giờ khai file
 *                   già hơn sự thật — chỉ có thể khai trẻ hơn.
 *   sửa lần cuối  = file SẠCH so với git ⇒ ngày commit CUỐI chạm nó.
 *                   file ĐANG có sửa đổi chưa commit ⇒ HÔM NAY.
 *
 * ⚠️ File hoàn toàn ngoài git (3 file trong `99 Lưu trữ/`, bị .gitignore
 * chặn) không có lịch sử để hỏi — dùng NGUYÊN ổ đĩa cho cả hai trường. Ngày
 * yếu hơn phần còn lại, chấp nhận (ADR mục 3.3).
 *
 * ⚠️ TÊN FILE CÓ DẤU TIẾNG VIỆT: git mặc định BỌC NHÁY + MÃ HOÁ OCTAL tên
 * file "khác thường" (mọi ký tự ngoài ASCII, `core.quotePath` mặc định bật)
 * trong output của `status`/`ls-files`. Bẫy này đã cắn 2 lần trong dự án
 * (vault-status.mjs, và chính phiên đo hôm nay của ADR-0018 — lệnh đối
 * chiếu báo NHẦM cả 57 file "ngoài git"). BẮT BUỘC dùng `-z` cho MỌI lệnh
 * git mà output có tên file — không có ngoại lệ.
 *
 * ⚠️ RESET MỘT LẦN DUY NHẤT khi BẬT tính năng này (đã xảy ra thật, không phải
 * đoán): lượt "đóng dấu" ĐẦU TIÊN tự nó LÀ một thay đổi (chèn khối frontmatter)
 * ⇒ commit đóng dấu đó khiến "sửa lần cuối" của MỌI file bị vá = ngày đóng dấu,
 * kể cả file không ai đụng nội dung từ lâu. Đây KHÔNG PHẢI vá lặp lại như bug
 * ngày-sửa-ổ-đĩa mà ADR mục 3.2 đã bác — nó chỉ xảy ra ĐÚNG MỘT LẦN lúc bật:
 * từ sau đó, file không có sửa đổi thật thì `noiDungMoi === noiDungGoc` (cùng
 * ngày đã đóng dấu), không ghi lại, không tạo commit mới, "sửa lần cuối" đứng
 * yên mãi cho tới lần sửa NỘI DUNG thật tiếp theo. Chấp nhận theo đúng nếp ADR
 * mục 5.3 ("không đáng dựng thêm cho vault một người dùng") — ghi rõ ở đây để
 * người sau đọc `--kiem` thấy 51 file "lệch" ngay sau lượt đóng dấu đầu tiên
 * thì hiểu đó là NGHIÊM TÚC, không phải máy hỏng.
 */
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

// Kho ghi chép của founder — CỐ Ý là đường dẫn cố định: nó chỉ tồn tại trên
// máy này và không có bản trên mạng, nên công cụ này KHÔNG chạy ở cổng kiểm.
// Cho phép đè bằng biến môi trường và báo lỗi tử tế nếu kho không ở đó —
// cùng lớp lỗi với đường dẫn cứng vừa làm đỏ cổng kiểm 19/08, chỉ khác là
// ở đây đường dẫn cứng là ĐÚNG CHỦ ĐÍCH, không phải sơ suất.
const VAULT = process.env.IFAN_VAULT || "C:/iFan.asia";
if (!existsSync(VAULT)) {
  console.error(`Không thấy kho ghi chép ở "${VAULT}".`);
  console.error("Đặt biến môi trường IFAN_VAULT trỏ tới nơi kho đang nằm.");
  process.exit(1);
}
// CODE_REPO: nơi file script này thật sự sống — móc pre-commit trong kho
// vault sẽ gọi ngược lại đường tuyệt đối này (hai kho khác nhau, không
// tránh được — cùng nếp VAULT hardcode sẵn có ở vault-status.mjs).
const CODE_REPO = path.resolve(import.meta.dirname, "..");

// Cấu hình máy (không phải kiến thức vault) — có frontmatter riêng cho
// hookify (name/enabled/event), chèn thêm khoá ngày vào đó là chèn nhầm
// vùng file khác đang đọc (ADR mục 3.3).
const BO_THU_MUC = new Set([".git", ".obsidian", ".claude", "node_modules"]);

const CHE_DO = process.argv.includes("--kiem")
  ? "kiem"
  : process.argv.includes("--cai-moc")
    ? "cai-moc"
    : "dong-dau";

function quetFileMd(dir, ra = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (BO_THU_MUC.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) quetFileMd(p, ra);
    else if (e.name.endsWith(".md")) ra.push(p);
  }
  return ra;
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: VAULT, encoding: "utf8" });
  } catch {
    return "";
  }
}

/**
 * `git ls-files -z` — danh sách file ĐANG được git theo dõi, đường dẫn
 * POSIX tương đối từ gốc kho. `-z` bắt buộc (xem cảnh báo đầu file).
 */
function tapFileDuocTheoDoi() {
  const out = git(["ls-files", "-z"]);
  return new Set(out.split("\0").filter(Boolean));
}

/**
 * `git status --porcelain -z` — chỉ cần biết file NÀO đang có sửa đổi chưa
 * commit (để suy ra "sửa lần cuối" = hôm nay). Không cần phân biệt loại
 * trạng thái (M/A/R…), chỉ cần biết CÓ MẶT trong danh sách hay không.
 */
function tapFileDangSua() {
  const out = git(["status", "--porcelain", "-z"]);
  const items = out.split("\0").filter(Boolean);
  const ra = new Set();
  for (const it of items) {
    // Khuôn: "XY <path>" — rename/copy có thêm một mục ngay sau là tên cũ,
    // nhưng ta chỉ quan tâm tên MỚI (mục đang xét), tên cũ tự bị bỏ qua ở
    // lượt lặp kế (không khớp .md thật hoặc không tồn tại trên đĩa).
    const p = it.slice(3);
    if (p) ra.add(p);
  }
  return ra;
}

/** `git log --format=%ad --date=short -- <path>` — mọi commit chạm file, MỚI NHẤT trước. */
function lichSuCommit(relPosix) {
  const out = git(["log", "--format=%ad", "--date=short", "--", relPosix]);
  return out.split("\n").filter(Boolean);
}

function ngaySom(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function ngayISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const HOM_NAY = ngayISO(new Date());

/** Tính (ngày tạo, sửa lần cuối) cho MỘT file theo đúng luật ADR mục 3.2. */
function tinhNgay(fullPath, relPosix, theoDoi, dangSua) {
  const st = statSync(fullPath);
  const diaTao = ngayISO(st.birthtime);
  const diaSua = ngayISO(st.mtime);

  if (!theoDoi.has(relPosix)) {
    // Ngoài git hoàn toàn — không có lịch sử để hỏi, dùng nguyên ổ đĩa.
    return { ngayTao: diaTao, suaLanCuoi: diaSua, ngoaiGit: true };
  }

  const cacDong = lichSuCommit(relPosix);
  const gitCuoi = cacDong[0] ?? null; // mới nhất trước
  const gitDauTien = cacDong.length ? cacDong[cacDong.length - 1] : null;

  const ngayTao = ngaySom(gitDauTien, diaTao);
  const suaLanCuoi = dangSua.has(relPosix) ? HOM_NAY : (gitCuoi ?? HOM_NAY);

  return { ngayTao, suaLanCuoi, ngoaiGit: false };
}

/** Tách khối frontmatter YAML đầu file (nếu có). */
function tachFrontmatter(noiDung) {
  const m = noiDung.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { than: noiDung, dongCu: [] };
  const dongCu = m[1].split("\n").filter((d) => d.trim() !== "");
  return { than: noiDung.slice(m[0].length), dongCu };
}

/** Dựng lại khối frontmatter: 2 khoá ngày lên đầu, giữ nguyên khoá khác (nếu có). */
function dungFrontmatter(dongCu, ngayTao, suaLanCuoi) {
  const conLai = dongCu.filter(
    (d) => !/^ngày tạo\s*:/.test(d) && !/^sửa lần cuối\s*:/.test(d),
  );
  const dong = [`ngày tạo: ${ngayTao}`, `sửa lần cuối: ${suaLanCuoi}`, ...conLai];
  return `---\n${dong.join("\n")}\n---\n`;
}

function doiTuongFile(fullPath, theoDoi, dangSua) {
  const relPosix = path.relative(VAULT, fullPath).replace(/\\/g, "/");
  const { ngayTao, suaLanCuoi, ngoaiGit } = tinhNgay(fullPath, relPosix, theoDoi, dangSua);
  const noiDungGoc = readFileSync(fullPath, "utf8");
  const { than, dongCu } = tachFrontmatter(noiDungGoc);
  const ngayTaoCu = dongCu.find((d) => /^ngày tạo\s*:/.test(d))?.split(":")[1]?.trim() ?? null;
  const suaLanCuoiCu = dongCu.find((d) => /^sửa lần cuối\s*:/.test(d))?.split(":")[1]?.trim() ?? null;
  const noiDungMoi = dungFrontmatter(dongCu, ngayTao, suaLanCuoi) + than;
  return {
    fullPath,
    relPosix,
    ngoaiGit,
    ngayTao,
    suaLanCuoi,
    ngayTaoCu,
    suaLanCuoiCu,
    daKhop: ngayTaoCu === ngayTao && suaLanCuoiCu === suaLanCuoi,
    noiDungGoc,
    noiDungMoi,
    doi: noiDungGoc !== noiDungMoi,
  };
}

function caiMoc() {
  const hooksDir = path.join(VAULT, ".git", "hooks");
  const hookPath = path.join(hooksDir, "pre-commit");
  // Script script này CHẠY NGAY TRÊN kho vault (VAULT hardcode ở đầu file) —
  // móc chỉ cần gọi đúng file .mjs bằng đường tuyệt đối, không cần biết gì
  // thêm về máy đang chạy.
  const noiDung = `#!/bin/sh
# ADR-0018 — tự đóng dấu ngày tạo/sửa lần cuối cho file .md TRƯỚC khi commit.
# Cài bởi: node scripts/vault-ngay.mjs --cai-moc (trong kho code ${CODE_REPO})
# Móc KHÔNG nằm trong git (.git/hooks/ không được commit) — máy mới/kho mới
# clone sẽ MẤT SẠCH, không có gì báo. Cài lại: chạy đúng lệnh trên.
node "${CODE_REPO.replace(/\\/g, "/")}/scripts/vault-ngay.mjs" || exit 1
git add -- '*.md'
`;
  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(hookPath, noiDung, "utf8");
  try {
    chmodSync(hookPath, 0o755);
  } catch {
    // NTFS không có bit thực thi thật — Git for Windows vẫn chạy được móc
    // qua shebang khi gọi bằng bash đi kèm. Bỏ qua lỗi chmod trên Windows.
  }
  console.log(`Đã cài móc pre-commit: ${hookPath}`);
  console.log(`Gọi ngược file: ${CODE_REPO}/scripts/vault-ngay.mjs`);
}

function chinh() {
  if (!existsSync(VAULT)) {
    console.error(`Không thấy thư mục vault: ${VAULT}`);
    process.exit(1);
  }

  const dsFile = quetFileMd(VAULT);
  const theoDoi = tapFileDuocTheoDoi();
  const dangSua = tapFileDangSua();

  const ketQua = dsFile.map((f) => doiTuongFile(f, theoDoi, dangSua));

  if (CHE_DO === "kiem") {
    const lech = ketQua.filter((k) => !k.daKhop);
    console.log(`[vault-ngay --kiem] Đã kiểm ${ketQua.length} file.`);
    if (lech.length === 0) {
      console.log("✅ XANH — mọi file đã đúng ngày tính lại.");
      process.exit(0);
    }
    console.log(`\n❌ ĐỎ — ${lech.length} file LỆCH giữa dấu đang có và giá trị tính lại:\n`);
    for (const k of lech) {
      console.log(`  ${k.relPosix}`);
      console.log(`    đang có : ngày tạo=${k.ngayTaoCu ?? "(chưa có)"} · sửa lần cuối=${k.suaLanCuoiCu ?? "(chưa có)"}`);
      console.log(`    tính lại: ngày tạo=${k.ngayTao} · sửa lần cuối=${k.suaLanCuoi}${k.ngoaiGit ? " (ngoài git — dùng ổ đĩa)" : ""}`);
    }
    process.exit(1);
  }

  // Chế độ mặc định: đóng dấu — chỉ ghi file THẬT SỰ đổi (idempotent, không
  // tạo diff rỗng mỗi lần chạy).
  const daGhi = [];
  for (const k of ketQua) {
    if (!k.doi) continue;
    writeFileSync(k.fullPath, k.noiDungMoi, "utf8");
    daGhi.push(k.relPosix);
  }
  console.log(`[vault-ngay] Đã đo ${ketQua.length} file, ghi lại ${daGhi.length} file có đổi.`);
  for (const f of daGhi) console.log(`  · ${f}`);
}

if (CHE_DO === "cai-moc") caiMoc();
else chinh();

#!/usr/bin/env node
/**
 * Cổng kiểm: đọc vai của người đang đăng nhập phải dùng `getCurrentMembership`.
 *
 * LỖI THẬT, đo trên dữ liệu production 19/08. Năm chỗ tự viết:
 *
 *     const { data: member } = await supabase
 *       .from("tenant_members").select("role").maybeSingle();
 *
 * Truy vấn này KHÔNG lọc `user_id`, mà RLS cho một thành viên nhìn thấy TẤT CẢ
 * thành viên cùng tiệm. Tiệm có 1 người thì chạy đúng — nên bug ngủ yên. Tiệm
 * từ 2 người trở lên thì `maybeSingle()` trả LỖI (nhiều dòng), `member` thành
 * null, và màn hình chặn luôn CẢ CHỦ TIỆM. Lúc phát hiện đã có một tiệm 3 người
 * trên CSDL thật ⇒ với tiệm đó, Két sắt · Hợp đồng · cả ba nút Xuất Excel đều
 * đang từ chối chủ tiệm.
 *
 * `getCurrentMembership` (lib/auth/membership.ts) lọc đủ ba điều kiện: đúng
 * user_id, `status='active'`, và hạn của phiên hỗ trợ chỉ-đọc (ADR-0006).
 *
 * Chạy: node scripts/soat-doc-vai.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const GOC = path.resolve(import.meta.dirname, "..");
const QUET = ["app", "lib", "components"];
const BO_QUA = new Set(["node_modules", ".next", ".git", "dist", "build"]);

// Chính nó là bản cài đặt đúng — nơi duy nhất được phép viết truy vấn này.
const MIEN_TRU = new Set([path.join("lib", "auth", "membership.ts")]);

function duyet(thuMuc, ra = []) {
  let muc;
  try {
    muc = readdirSync(thuMuc);
  } catch {
    return ra;
  }
  for (const m of muc) {
    if (BO_QUA.has(m)) continue;
    const day = path.join(thuMuc, m);
    try {
      if (statSync(day).isDirectory()) duyet(day, ra);
      else if (/\.tsx?$/.test(day)) ra.push(day);
    } catch {
      /* symlink hỏng, đường dẫn lạ trên Windows */
    }
  }
  return ra;
}

const viPham = [];
for (const thuMuc of QUET) {
  for (const file of duyet(path.join(GOC, thuMuc))) {
    const tuongDoi = path.relative(GOC, file);
    if (MIEN_TRU.has(tuongDoi)) continue;

    let noiDung;
    try {
      noiDung = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const dong = noiDung.split("\n");

    for (let i = 0; i < dong.length; i++) {
      // Dòng chú thích không phải mã chạy — chính chú thích CẢNH BÁO về lỗi này
      // cũng chứa đoạn mã sai, và bản đầu của cổng đã tự bắt nhầm nó.
      const batDau = dong[i].trimStart();
      if (batDau.startsWith("//") || batDau.startsWith("*")) continue;
      if (!/\.from\(\s*["']tenant_members["']\s*\)/.test(dong[i])) continue;

      // Cả câu truy vấn nằm trong vài dòng kế tiếp — đọc tới dấu chấm phẩy.
      let cau = dong[i];
      for (let j = i + 1; j < Math.min(i + 12, dong.length); j++) {
        cau += "\n" + dong[j];
        if (dong[j].includes(";")) break;
      }

      if (!/\.select\(\s*["'][^"']*\brole\b/.test(cau)) continue;
      // CHỈ bắt truy vấn "vai CỦA TÔI" — dấu nhận biết là đòi đúng một dòng
      // (`maybeSingle`/`single`). Truy vấn LIỆT KÊ cả đội (màn Nhóm, Hộp thư,
      // Lịch...) cũng select role nhưng không đòi một dòng, và chúng ĐÚNG.
      if (!/\.(maybeSingle|single)\(\s*\)/.test(cau)) continue;
      if (/\.eq\(\s*["']user_id["']/.test(cau)) continue; // đã lọc đúng người

      viPham.push({ file: tuongDoi.replace(/\\/g, "/"), dong: i + 1, cau: cau.trim() });
    }
  }
}

if (viPham.length > 0) {
  console.error("\n❌ Đọc vai KHÔNG lọc theo người đang đăng nhập:\n");
  for (const v of viPham) {
    console.error(`  ${v.file}:${v.dong}`);
    console.error(
      v.cau
        .split("\n")
        .map((d) => "    " + d.trim())
        .join("\n"),
    );
  }
  console.error(
    "\nRLS cho một thành viên thấy MỌI thành viên cùng tiệm ⇒ tiệm từ 2 người trở lên",
  );
  console.error(
    "thì maybeSingle() trả lỗi và màn hình chặn nhầm CẢ CHỦ TIỆM (đo thật 19/08).",
  );
  console.error("Cách sửa: import { getCurrentMembership } from \"@/lib/auth/membership\";\n");
  process.exit(1);
}

console.log("✅ Mọi chỗ đọc vai đều lọc đúng người đăng nhập (getCurrentMembership).");

#!/usr/bin/env node
/**
 * Cổng kiểm: file "use server" chỉ được export async function.
 *
 * Next.js 16 Turbopack từ chối build khi gặp `export const`, `export let`,
 * `export var`, hoặc `export function` (không async) trong file có directive
 * `"use server"`. Lỗi báo ngược: Turbopack nói "Export X doesn't exist" thay
 * vì chỉ thẳng vào hằng số — khiến mất nhiều thời gian truy tìm gốc.
 *
 * Bắt được tận gốc 19/08: `purchases/actions.ts` + `sla/actions.ts` làm
 * 3 build Vercel liên tiếp thất bại.
 *
 * Chạy: node scripts/soat-use-server-exports.mjs
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

function walk(dir, results = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full, results);
      } else {
        const ext = extname(full);
        if (ext === ".ts" || ext === ".tsx") results.push(full);
      }
    } catch {
      // bỏ qua file không đọc được (symlink hỏng, bracket path trên Windows...)
    }
  }
  return results;
}

const appDir = new URL("../app", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const files = walk(appDir);
const violations = [];

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = content.split("\n");

  // Chỉ kiểm file có "use server" ở dòng đầu tiên
  if (lines[0]?.trim() !== '"use server"') continue;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // OK: export type, export async function, export { X } (re-export)
    if (/^export\s+type[\s{]/.test(trimmed)) continue;
    if (/^export\s+async\s+function/.test(trimmed)) continue;
    if (/^\/\//.test(trimmed)) continue; // comment

    // Vi phạm: export const / let / var (hằng số)
    if (/^export\s+(const|let|var)\s/.test(trimmed)) {
      violations.push({ file: file.replace(/\\/g, "/"), lineNo: i + 1, code: trimmed });
      continue;
    }

    // Vi phạm: export function (không async)
    if (/^export\s+function\s/.test(trimmed)) {
      violations.push({ file: file.replace(/\\/g, "/"), lineNo: i + 1, code: trimmed });
    }
  }
}

if (violations.length > 0) {
  console.error('\n❌ Vi phạm "use server": chỉ được export async function\n');
  for (const v of violations) {
    // Rút ngắn path cho dễ đọc
    const short = v.file.replace(/.*\/app\//, "app/");
    console.error(`  ${short}:${v.lineNo}`);
    console.error(`    ${v.code.slice(0, 120)}`);
  }
  console.error(
    "\nNext.js 16 Turbopack sẽ TỪ CHỐI BUILD file này (lỗi báo ở chỗ khác, rất khó trace).",
  );
  console.error(
    "Cách sửa: bỏ export khỏi hằng số nội bộ, hoặc chuyển sang file riêng không có \"use server\".\n",
  );
  process.exit(1);
} else {
  console.log('✅ Không có vi phạm export non-async trong "use server" — Turbopack sẽ chấp nhận.');
}

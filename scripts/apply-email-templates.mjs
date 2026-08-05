#!/usr/bin/env node
/**
 * Đẩy mẫu thư trong `supabase/email-templates/` lên dự án Supabase.
 *
 * Mẫu thư là cấu hình MỨC DỰ ÁN, không nằm trong CSDL: `pg_dump` không chép,
 * migration không ghi lại, và nó biến mất khi dựng lại dự án. Giữ mẫu trong git
 * + chạy script này là cách duy nhất để nó tái lập được.
 *
 * Cần env: SUPABASE_ACCESS_TOKEN (token quản trị), SUPABASE_PROJECT_REF.
 */
import { readFileSync } from "node:fs";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error("Thiếu SUPABASE_ACCESS_TOKEN hoặc SUPABASE_PROJECT_REF");
  process.exit(1);
}

const TEMPLATES = [
  {
    file: "recovery.html",
    subjectField: "mailer_subjects_recovery",
    contentField: "mailer_templates_recovery_content",
    subject: "Đặt lại mật khẩu iFan.asia",
  },
];

const url = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const body = {};
for (const t of TEMPLATES) {
  const path = new URL(`../supabase/email-templates/${t.file}`, import.meta.url);
  body[t.contentField] = readFileSync(path, "utf8");
  body[t.subjectField] = t.subject;
}

const res = await fetch(url, {
  method: "PATCH",
  headers,
  body: JSON.stringify(body),
});
if (!res.ok) {
  console.error(`Đẩy mẫu thư thất bại: ${res.status} ${await res.text()}`);
  process.exit(1);
}

// Đọc lại để chắc chắn đã ghi, không tin mỗi mã 200
const after = await (await fetch(url, { headers })).json();
let ok = true;
for (const t of TEMPLATES) {
  const saved = after[t.contentField] ?? "";
  const matched = saved.includes("token_hash") && saved.includes("/auth/confirm");
  if (!matched) ok = false;
  console.log(`${matched ? "OK  " : "LỖI "} ${t.file} → ${t.contentField}`);
}
process.exit(ok ? 0 : 1);

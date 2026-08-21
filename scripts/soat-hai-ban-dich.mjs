#!/usr/bin/env node
/**
 * Cổng soát: HAI BẢN DỊCH PHẢI CÓ ĐÚNG CÙNG MỘT BỘ KHOÁ.
 *
 * ════════════════════════════════════════════════════════════════════
 * VÌ SAO DỰNG — một lỗi ĐÃ XẢY RA, và không cổng nào bắt được
 * ════════════════════════════════════════════════════════════════════
 *
 * Màn Thùng rác trả về năm loại (khách · cơ hội · công ty · đơn hàng · lịch
 * hẹn) nhưng bản tiếng Việt chỉ có ba cái tên. Người dùng tiếng Việt — tức
 * ĐA SỐ người dùng — mở màn đó ra sẽ thấy **mã khoá thô** thay vì "Đơn hàng".
 *
 * Điều đáng nói không phải là lỗi, mà là **cách nó sống sót**: chính file màn
 * đó đã có sẵn một dòng chú thích cảnh báo đúng chuyện này. Người trước đã
 * phát hiện, đã vá phần kiểu dữ liệu, đã thêm tên bên bản tiếng Anh — **rồi
 * quên bản tiếng Việt**. Lỗi được nhìn thấy, được ghi lại, được sửa một nửa,
 * và vẫn nằm nguyên ở nửa quan trọng hơn.
 *
 * Mọi cổng đang có đều xanh trong suốt thời gian đó: chữ hiển thị không phải
 * mã nên trình biên dịch không thấy, không phải lệnh ghi nên cổng ghi-im-lặng
 * không thấy, không phải thẻ design nên cổng thẻ không thấy.
 *
 * ════════════════════════════════════════════════════════════════════
 * CỔNG NÀY SOÁT GÌ, VÀ CỐ Ý KHÔNG SOÁT GÌ
 * ════════════════════════════════════════════════════════════════════
 *
 * SOÁT: hai file có đúng cùng một bộ khoá. Thiếu bên nào cũng đỏ.
 *
 * KHÔNG soát chất lượng bản dịch — câu tiếng Anh giống hệt câu tiếng Việt là
 * chuyện BÌNH THƯỜNG và thường là ĐÚNG: "Spa / Salon / Nail", "© 2026
 * iFan.asia", "{actual} / {target}". Đã đo: 11 câu như vậy, cả 11 đều đúng.
 * Bắt lỗi ở đó là dạy người ta dịch bừa cho cổng xanh.
 *
 * KHÔNG soát ký hiệu tiền `đ` nằm trong câu tiếng Anh — sản phẩm mới chỉ dùng
 * đồng Việt Nam (founder chốt), nên "Rate per workday (đ)" là đúng.
 */

import { readFileSync } from "node:fs";

const FILE_VI = "messages/vi.json";
const FILE_EN = "messages/en.json";

/** Trải phẳng cây JSON thành danh sách khoá đầy đủ, để so được từng lá. */
function trai(o, tien = "", ra = []) {
  for (const [k, v] of Object.entries(o)) {
    const khoa = tien ? `${tien}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) trai(v, khoa, ra);
    else ra.push(khoa);
  }
  return ra;
}

const vi = JSON.parse(readFileSync(FILE_VI, "utf8"));
const en = JSON.parse(readFileSync(FILE_EN, "utf8"));

const kVi = new Set(trai(vi));
const kEn = new Set(trai(en));

const thieuVi = [...kEn].filter((k) => !kVi.has(k));
const thieuEn = [...kVi].filter((k) => !kEn.has(k));

if (thieuVi.length === 0 && thieuEn.length === 0) {
  console.log(`✅ Hai bản dịch khớp nhau: ${kVi.size} câu chữ, không thiếu bên nào.`);
  process.exit(0);
}

console.error("❌ HAI BẢN DỊCH LỆCH KHOÁ — người dùng một trong hai bên sẽ thấy mã thô.\n");

if (thieuVi.length) {
  console.error(`   THIẾU BẢN TIẾNG VIỆT (${thieuVi.length}) — hại nặng hơn, đa số người dùng là tiếng Việt:`);
  for (const k of thieuVi.slice(0, 30)) console.error(`     · ${k}`);
  if (thieuVi.length > 30) console.error(`     … và ${thieuVi.length - 30} khoá nữa`);
  console.error("");
}
if (thieuEn.length) {
  console.error(`   THIẾU BẢN TIẾNG ANH (${thieuEn.length}):`);
  for (const k of thieuEn.slice(0, 30)) console.error(`     · ${k}`);
  if (thieuEn.length > 30) console.error(`     … và ${thieuEn.length - 30} khoá nữa`);
  console.error("");
}

console.error("   Thêm câu còn thiếu vào đúng file, giữ nguyên thứ tự của bên kia cho dễ đối chiếu.");
process.exit(1);

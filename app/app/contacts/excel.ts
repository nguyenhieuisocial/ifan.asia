/**
 * Đọc/ghi file bảng tính cho màn Khách hàng — CHỈ chạy phía server.
 * File người dùng tải lên KHÔNG bao giờ được parse ở client: mọi bước
 * (đoán cột, chạy thử, nhập thật) đều parse lại từ bytes gốc trên server.
 *
 * Thư viện: `write-excel-file` + `read-excel-file` (cùng tác giả, còn bảo trì
 * 2026, phụ thuộc duy nhất fflate/saxen — không nằm trong danh sách cấm
 * eslint no-restricted-imports). SheetJS `xlsx` trên npm đứng ở 0.18.5 kèm CVE
 * nên bị loại.
 */

import { readSheet } from "read-excel-file/node";
import writeXlsxFile from "write-excel-file/node";
import {
  IMPORT_FIELDS,
  EMPTY_MAPPING,
  normalizePhone,
  normalizeSearch,
  type ColumnMapping,
  type ImportField,
  type RowProblem,
} from "./types";

// ---------------------------------------------------------------- đọc file

/**
 * Ô Excel → chuỗi. Số nguyên 9 chữ số được trả lại số 0 đầu: người Việt lưu SĐT
 * ở ô kiểu Số thì Excel nuốt mất số 0 (0912345678 → 912345678) — không bù thì
 * cả file toàn dòng lỗi. CSV giữ nguyên chữ nên không dính lỗi này.
 */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    const digits = String(value);
    return /^\d{9}$/.test(digits) ? `0${digits}` : digits;
  }
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

/** Dấu ngăn cột: Excel bản Việt hay xuất CSV bằng `;`. Đếm ngoài vùng nháy kép. */
function detectDelimiter(firstLine: string): string {
  const counts = [",", ";", "\t"].map((d) => ({
    d,
    n: firstLine.split(d).length - 1,
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ",";
}

/** Parser CSV theo RFC 4180: hỗ trợ nháy kép, dấu ngăn/xuống dòng trong ô, `""` escape. */
function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const delimiter = detectDelimiter(clean.split("\n", 1)[0] ?? "");
  const table: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      table.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  table.push(row);

  // Bỏ dòng trống cuối file (Excel luôn thêm một dòng)
  return table.filter((r) => r.some((c) => c !== ""));
}

/** Parse .xlsx hoặc .csv thành bảng chuỗi thô (dòng 0 = tiêu đề). */
export async function parseSpreadsheet(
  buffer: Buffer,
  fileName: string,
): Promise<string[][]> {
  if (/\.csv$/i.test(fileName)) return parseCsv(buffer.toString("utf8"));
  const sheet = await readSheet(buffer);
  return sheet
    .map((row) => row.map(cellToString))
    .filter((r) => r.some((c) => c !== ""));
}

// ------------------------------------------------------------ đoán cột

/** Tên tiêu đề thường gặp (đã bỏ dấu, thường hóa) cho từng trường. */
const HEADER_HINTS: Record<ImportField, string[]> = {
  fullName: ["ten", "ho ten", "hoten", "ten khach", "ten khach hang", "khach hang", "name", "full name", "fullname", "contact"],
  phone: ["sdt", "so dien thoai", "dien thoai", "so dt", "dt", "phone", "phone number", "mobile", "tel", "telephone"],
  email: ["email", "e-mail", "mail", "dia chi email", "email address"],
  source: ["nguon", "nguon khach", "kenh", "source", "lead source", "channel"],
  tags: ["the", "cac the", "nhan", "tag", "tags", "label", "labels"],
};

/** Tự đoán cột theo tên tiêu đề: khớp chính xác trước, khớp chứa sau. */
export function guessMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map((h) => normalizeSearch(h));
  const mapping = { ...EMPTY_MAPPING };
  const taken = new Set<number>();

  for (const exact of [true, false]) {
    for (const field of IMPORT_FIELDS) {
      if (mapping[field] !== -1) continue;
      const hints = HEADER_HINTS[field];
      const index = normalized.findIndex(
        (h, i) =>
          h !== "" &&
          !taken.has(i) &&
          (exact ? hints.includes(h) : hints.some((hint) => h.includes(hint))),
      );
      if (index !== -1) {
        mapping[field] = index;
        taken.add(index);
      }
    }
  }
  return mapping;
}

// ------------------------------------------------------------ kiểm dữ liệu

export type ImportRow = {
  /** Số dòng trong file như người dùng thấy ở Excel (1 = tiêu đề). */
  rowNumber: number;
  fullName: string;
  phone: string;
  phoneE164: string | null;
  email: string;
  sourceName: string;
  tagNames: string[];
};

const PHONE_RE = /^0\d{9,10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** SĐT hợp lệ 0xxx → E.164 +84xxx (cột dedupe `contacts.phone_e164`). */
export function toE164(phone: string): string | null {
  return PHONE_RE.test(phone) ? `+84${phone.slice(1)}` : null;
}

function cell(row: string[], index: number): string {
  return index === -1 ? "" : (row[index] ?? "").trim();
}

/**
 * Tách dòng hợp lệ / dòng lỗi từ bảng thô theo mapping.
 * Trùng SĐT NGAY TRONG FILE cũng tính là trùng (giữ dòng đầu tiên).
 */
export function extractRows(
  table: string[][],
  mapping: ColumnMapping,
): { rows: ImportRow[]; problems: RowProblem[] } {
  const rows: ImportRow[] = [];
  const problems: RowProblem[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < table.length; i++) {
    const raw = table[i];
    const rowNumber = i + 1;
    const fullName = cell(raw, mapping.fullName);
    const label = fullName || cell(raw, mapping.phone) || `#${rowNumber}`;

    if (!fullName) {
      problems.push({ rowNumber, label, reason: "nameRequired" });
      continue;
    }

    const phone = normalizePhone(cell(raw, mapping.phone));
    if (phone !== "" && !PHONE_RE.test(phone)) {
      problems.push({ rowNumber, label, reason: "phoneInvalid" });
      continue;
    }

    const email = cell(raw, mapping.email);
    if (email !== "" && !EMAIL_RE.test(email)) {
      problems.push({ rowNumber, label, reason: "emailInvalid" });
      continue;
    }

    const phoneE164 = toE164(phone);
    if (phoneE164 && seen.has(phoneE164)) {
      problems.push({ rowNumber, label, reason: "duplicateInFile" });
      continue;
    }
    if (phoneE164) seen.add(phoneE164);

    rows.push({
      rowNumber,
      fullName: fullName.slice(0, 120),
      phone,
      phoneE164,
      email: email.slice(0, 254),
      sourceName: cell(raw, mapping.source).slice(0, 80),
      tagNames: cell(raw, mapping.tags)
        .split(/[,;|]/)
        .map((t) => t.trim().slice(0, 50))
        .filter(Boolean),
    });
  }

  return { rows, problems };
}

// ------------------------------------------------------------- ghi file

export type SheetCell = string | number;

/**
 * Dựng file .xlsx. Mọi ô chuỗi ghi kiểu String — SĐT `0912…` giữ nguyên số 0
 * đầu (lỗi kinh điển khi xuất Excel), ô số ghi kiểu Number để sắp xếp được.
 */
export async function buildXlsx(
  sheetName: string,
  headers: string[],
  rows: SheetCell[][],
  columnWidths: number[],
): Promise<Buffer> {
  const data = [
    headers.map((value) => ({ value, type: String, fontWeight: "bold" as const })),
    ...rows.map((row) =>
      row.map((value) =>
        typeof value === "number"
          ? { value, type: Number }
          : { value, type: String },
      ),
    ),
  ];
  return writeXlsxFile(data, {
    sheet: sheetName,
    columns: columnWidths.map((width) => ({ width })),
  }).toBuffer();
}

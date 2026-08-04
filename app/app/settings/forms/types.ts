/**
 * Kiểu dùng chung cho biểu mẫu tự tạo (migration #29).
 * Hợp đồng phải KHỚP CHÍNH XÁC hàm kiểm `wf_form_fields_valid()` trong DB:
 * DB là lưới cuối, chỗ này chỉ để giao diện báo lỗi sớm cho dễ chịu.
 */

export const FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "multiselect",
  "boolean",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export type FormField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  options?: string[];
};

/** Ai duyệt một cấp: 'role:owner' | 'role:admin' | 'role:staff' | '<uuid nhân sự>' */
export type ApprovalLevel = { to: string };

export type FormRow = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  fields: FormField[];
  approvalLevels: ApprovalLevel[];
  submissionCount: number;
  updatedAt: string;
};

export const MAX_FIELDS = 30;
export const MAX_OPTIONS = 30;
export const HAS_OPTIONS: FieldType[] = ["select", "multiselect"];

/** Giá trị một ô nhập: khớp đúng kiểu jsonb mà DB chờ đợi. */
export type FieldValue = string | number | boolean | string[] | null;

/** Dấu thanh tiếng Việt sau khi tách bằng NFD (U+0300–U+036F). */
const COMBINING = new RegExp("[\\u0300-\\u036f]", "g");

/** Nhãn tiếng Việt → mã ô ổn định (a-z0-9_). Người dùng KHÔNG bao giờ thấy mã này. */
export function slugKey(label: string, taken: string[]): string {
  const base =
    label
      .normalize("NFD")
      .replace(COMBINING, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^([0-9])/, "o$1")
      .slice(0, 28) || "o";
  let key = base;
  let i = 2;
  while (taken.includes(key)) {
    key = `${base}_${i}`;
    i += 1;
  }
  return key;
}

/** Ô đã điền chưa? Cùng quy ước "rỗng" với wf_validate_form_data() trong DB. */
export function isEmptyValue(v: FieldValue | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

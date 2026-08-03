/** Danh sách ngôn ngữ — thêm ngôn ngữ mới = thêm mã vào đây + 1 file messages/<locale>.json. */
export const locales = ["vi", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "vi";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** Chữ ký hàm dịch tối giản — cho helper ngoài React nhận `t` từ next-intl. */
export type Translator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

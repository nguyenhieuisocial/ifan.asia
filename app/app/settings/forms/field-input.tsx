"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FieldValue, FormField } from "./types";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

const TEXTAREA_CLASS =
  "w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * Một ô nhập của biểu mẫu tự tạo — dùng chung cho màn XEM THỬ (lúc dựng) và màn
 * ĐIỀN THẬT (lúc gửi yêu cầu), nên hai màn không bao giờ lệch nhau.
 */
export function FieldInput({
  field,
  value,
  onChange,
  invalid,
  disabled,
  idPrefix = "ff",
}: {
  field: FormField;
  value: FieldValue | undefined;
  onChange: (v: FieldValue) => void;
  invalid?: boolean;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const t = useTranslations("forms.field");
  const id = `${idPrefix}-${field.key}`;
  const options = field.options ?? [];
  const selected = Array.isArray(value) ? value : [];

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium">
        {field.label}
        {field.required && <span className="ml-1 text-destructive">*</span>}
      </label>

      {field.type === "textarea" ? (
        <textarea
          id={id}
          rows={3}
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined}
          className={cn(TEXTAREA_CLASS, invalid && "border-destructive")}
        />
      ) : field.type === "select" ? (
        <select
          id={id}
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined}
          className={cn(SELECT_CLASS, invalid && "border-destructive")}
        >
          <option value="">{t("choosePlaceholder")}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : field.type === "multiselect" ? (
        <div
          id={id}
          className={cn(
            "flex flex-wrap gap-x-4 gap-y-2 rounded-md border border-input px-3 py-2",
            invalid && "border-destructive",
          )}
        >
          {options.length === 0 ? (
            <span className="text-[13px] text-muted-foreground">{t("noOptions")}</span>
          ) : (
            options.map((o) => (
              <label key={o} className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={selected.includes(o)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...selected, o]
                        : selected.filter((x) => x !== o),
                    )
                  }
                  className="size-4 accent-foreground"
                />
                {o}
              </label>
            ))
          )}
        </div>
      ) : field.type === "boolean" ? (
        <label className="flex items-center gap-2 text-[13px]">
          <input
            id={id}
            type="checkbox"
            disabled={disabled}
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="size-4 accent-foreground"
          />
          {t("yes")}
        </label>
      ) : (
        <Input
          id={id}
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          inputMode={field.type === "number" ? "decimal" : undefined}
          disabled={disabled}
          value={
            value === null || value === undefined || typeof value === "boolean"
              ? ""
              : String(value)
          }
          onChange={(e) =>
            onChange(
              field.type === "number"
                ? e.target.value === ""
                  ? null
                  : Number(e.target.value)
                : e.target.value,
            )
          }
          aria-invalid={invalid || undefined}
          className={cn(invalid && "border-destructive")}
        />
      )}

      {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
    </div>
  );
}

/** Hiển thị giá trị đã nộp thành câu người thường đọc được (không hiện JSON thô). */
export function formatValue(
  field: FormField,
  raw: unknown,
  yes: string,
  no: string,
  empty: string,
): string {
  if (raw === null || raw === undefined || raw === "") return empty;
  if (field.type === "boolean") return raw === true ? yes : no;
  if (Array.isArray(raw)) return raw.length ? raw.join(", ") : empty;
  if (field.type === "number" && typeof raw === "number") {
    return new Intl.NumberFormat("vi-VN").format(raw);
  }
  return String(raw);
}

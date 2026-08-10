"use client";

import { Fragment, useTransition } from "react";
import { useLocale } from "next-intl";
import { setLocale } from "@/i18n/actions";
import { locales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** Mã ngôn ngữ hiển thị dạng chữ (không dịch — mã quốc tế). */
const SHORT_LABELS: Record<Locale, string> = { vi: "VI", en: "EN" };

/** Switcher nhỏ kiểu chữ cho landing/login — góc trên phải. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 text-sm font-medium",
        className,
      )}
    >
      {locales.map((l, i) => (
        <Fragment key={l}>
          {i > 0 && (
            <span aria-hidden className="text-muted-foreground/40">
              ·
            </span>
          )}
          <button
            type="button"
            disabled={pending || l === locale}
            onClick={() =>
              startTransition(async () => {
                await setLocale(l);
              })
            }
            // Cùng lý do như ThemeToggle: chữ "VI"/"EN" chỉ rộng ~20px, đệm
            // cho đủ tầm ngón tay thay vì bắt người ta chọc trúng hai chữ cái.
            className={cn(
              "inline-flex h-9 items-center rounded-md px-2 transition-colors",
              l === locale
                ? "text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {SHORT_LABELS[l]}
          </button>
        </Fragment>
      ))}
    </div>
  );
}

"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Thứ tự xoay vòng khi bấm: Hệ thống → Sáng → Tối. */
const CYCLE = ["system", "light", "dark"] as const;
type ThemeChoice = (typeof CYCLE)[number];

const ICONS: Record<ThemeChoice, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

// Mounted guard: theme chỉ biết ở client — server snapshot luôn false, tránh lệch hydration
const emptySubscribe = () => () => {};
const useMounted = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

/** Nút icon nhỏ đổi giao diện cho landing header/footer — cạnh LocaleSwitcher. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("common.theme");
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  const current: ThemeChoice =
    mounted && theme && (CYCLE as readonly string[]).includes(theme)
      ? (theme as ThemeChoice)
      : "system";
  const Icon = ICONS[current];
  const label = `${t("label")}: ${t(current)}`;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() =>
        setTheme(CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length])
      }
      className={cn(
        "text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );
}

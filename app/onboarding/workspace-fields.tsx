"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { checkWorkspaceSlug } from "@/app/auth/actions";

/**
 * Bỏ dấu tiếng Việt + ký tự lạ → địa chỉ rút gọn.
 * "Spa Hương Sen" → "spa-huong-sen" · "Nhà thuốc Đức Tín" → "nha-thuoc-duc-tin"
 * · "Shop Mẹ & Bé" → "shop-me-be".
 *
 * Lưu ý: NFD KHÔNG tách được chữ đ/Đ — phải thay thủ công (cùng quy ước với
 * normalizeSearch ở màn Khách hàng).
 */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 30)
    .replace(/-+$/, "");
}

type SlugState = "idle" | "checking" | "ok" | "taken" | "reserved" | "invalid";

/**
 * Tên tiệm + địa chỉ rút gọn.
 *
 * Chủ tiệm KHÔNG phải tự nghĩ ra địa chỉ: gõ tên là ô địa chỉ tự điền. Chạm tay
 * vào ô địa chỉ thì hệ thống ngừng tự điền (`touched`) — sửa của người dùng
 * luôn thắng. Địa chỉ trùng được báo NGAY tại chỗ, không đợi bấm gửi rồi bị đá về.
 */
export function WorkspaceFields() {
  const t = useTranslations("auth.onboarding");
  const tErrors = useTranslations("auth.errors");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [state, setState] = useState<SlugState>("idle");
  // Chỉ nhận kết quả của lần gõ mới nhất — trả lời cũ về sau không ghi đè
  const latest = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** Đặt địa chỉ + hẹn giờ hỏi máy chủ (chờ 400ms cho người dùng gõ xong). */
  const applySlug = (value: string) => {
    setSlug(value);
    if (timer.current) clearTimeout(timer.current);
    const trimmed = value.trim();
    if (trimmed === "") {
      setState("idle");
      return;
    }
    setState("checking");
    const seq = ++latest.current;
    timer.current = setTimeout(async () => {
      const res = await checkWorkspaceSlug(trimmed);
      if (seq === latest.current) setState(res.status);
    }, 400);
  };

  const onName = (value: string) => {
    setName(value);
    if (!touched) applySlug(slugify(value));
  };

  const message =
    state === "checking"
      ? { text: t("slugChecking"), tone: "muted" as const }
      : state === "ok"
        ? { text: t("slugAvailable"), tone: "ok" as const }
        : state === "taken"
          ? { text: tErrors("slugTaken"), tone: "bad" as const }
          : state === "reserved"
            ? { text: tErrors("slugReserved"), tone: "bad" as const }
            : state === "invalid"
              ? { text: tErrors("slugInvalid"), tone: "bad" as const }
              : null;

  return (
    <>
      <Input
        name="name"
        required
        maxLength={120}
        value={name}
        onChange={(e) => onName(e.target.value)}
        placeholder={t("namePlaceholder")}
        autoComplete="organization"
      />
      <div className="space-y-1.5">
        {/* `-` phải escape: trình duyệt biên dịch pattern bằng cờ `v`, ở đó `-`
            trần trong lớp ký tự là lỗi cú pháp → cả thuộc tính bị bỏ qua và ô
            nhập KHÔNG còn được kiểm tra phía trình duyệt. */}
        <Input
          name="slug"
          required
          pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]"
          value={slug}
          onChange={(e) => {
            setTouched(true);
            applySlug(e.target.value.toLowerCase());
          }}
          placeholder={t("slugPlaceholder")}
          className="lowercase"
          autoComplete="off"
          aria-invalid={state === "taken" || state === "reserved" || state === "invalid"}
        />
        <p className="text-xs text-muted-foreground">{t("slugHint")}</p>
        {message && (
          <p
            className={
              message.tone === "ok"
                ? "flex items-center gap-1.5 text-xs font-medium text-status-closed-foreground"
                : message.tone === "bad"
                  ? "flex items-center gap-1.5 text-xs font-medium text-destructive"
                  : "flex items-center gap-1.5 text-xs text-muted-foreground"
            }
          >
            {message.tone === "ok" && <Check className="size-3.5 shrink-0" />}
            {message.tone === "bad" && <TriangleAlert className="size-3.5 shrink-0" />}
            {message.tone === "muted" && (
              <Loader2 className="size-3.5 shrink-0 animate-spin" />
            )}
            {message.text}
          </p>
        )}
      </div>
    </>
  );
}

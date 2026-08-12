"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { TenantPackLeadFormField } from "@/lib/tenant-pack";
import type { StorefrontStatus } from "@/lib/storefront/hours";
import { submitStorefrontLead } from "./actions";

/** Cùng luật chuẩn hoá SĐT VN đang dùng ở app/app/contacts/actions.ts (toE164). */
const PHONE_RE = /^0\d{9,10}$/;

function callbackWindowLabel(
  status: StorefrontStatus,
  t: ReturnType<typeof useTranslations>,
): string {
  if (status.kind === "open") return t("success.windowToday", { time: status.closesAtLabel });
  if ((status.kind === "closed" || status.kind === "closure") && status.reopensLabel) {
    return t("success.windowReopen", { time: status.reopensLabel });
  }
  return t("success.windowSoon");
}

export function StorefrontLeadForm({
  slug,
  fields,
  statusForCallback,
}: {
  slug: string;
  fields: TenantPackLeadFormField[];
  statusForCallback: StorefrontStatus;
}) {
  const t = useTranslations("storefront.public.form");
  const [outcome, setOutcome] = useState<"idle" | "success" | "duplicate">("idle");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    setPhoneError(null);
    setFormError(null);

    const trimmedName = fullName.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName) {
      setFormError(t("errors.nameRequired"));
      return;
    }
    if (!PHONE_RE.test(trimmedPhone)) {
      setPhoneError(t("errors.phoneInvalid"));
      return;
    }

    startTransition(async () => {
      const res = await submitStorefrontLead({
        slug,
        fullName: trimmedName,
        phone: trimmedPhone,
        fields: extra,
      });
      if (res.error) {
        if (res.error === "invalid_phone") {
          setPhoneError(t("errors.phoneInvalid"));
          return;
        }
        setFormError(t(`errors.${res.error === "rate_limited" ? "rateLimited" : "generic"}`));
        return;
      }
      setOutcome(res.duplicate ? "duplicate" : "success");
    });
  };

  if (outcome === "success") {
    return (
      <div className="rounded-lg border p-5 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-status-closed text-lg text-status-closed-foreground">
          ✓
        </div>
        <p className="mt-3 text-sm font-semibold">{t("success.title")}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {callbackWindowLabel(statusForCallback, t)}
        </p>
      </div>
    );
  }

  if (outcome === "duplicate") {
    return (
      <div className="rounded-lg border p-5 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted text-lg text-muted-foreground">
          ⏱
        </div>
        <p className="mt-3 text-sm font-semibold">{t("duplicate.title")}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{t("duplicate.body")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-lg border p-4">
      <p className="text-sm font-semibold">{t("title")}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">{t("subtitle")}</p>

      <div className="mt-3 space-y-2.5">
        <div>
          <label htmlFor="sf-name" className="text-[12px] text-muted-foreground">
            {t("nameLabel")} <span className="text-primary">*</span>
          </label>
          <Input
            id="sf-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t("namePlaceholder")}
            maxLength={120}
            required
          />
        </div>

        <div>
          <label htmlFor="sf-phone" className="text-[12px] text-muted-foreground">
            {t("phoneLabel")} <span className="text-primary">*</span>
          </label>
          <Input
            id="sf-phone"
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09xx xxx xxx"
            maxLength={20}
            aria-invalid={!!phoneError}
            required
          />
          {phoneError && <p className="mt-1 text-[12px] text-destructive">{phoneError}</p>}
        </div>

        {fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={`sf-${f.key}`} className="text-[12px] text-muted-foreground">
              {f.label} <span className="text-muted-foreground/70">({t("optional")})</span>
            </label>
            {f.type === "select" ? (
              <Select
                id={`sf-${f.key}`}
                value={extra[f.key] ?? ""}
                onChange={(e) => setExtra((prev) => ({ ...prev, [f.key]: e.target.value }))}
              >
                <option value="">{t("choose")}</option>
                {(f.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id={`sf-${f.key}`}
                value={extra[f.key] ?? ""}
                maxLength={200}
                onChange={(e) => setExtra((prev) => ({ ...prev, [f.key]: e.target.value }))}
              />
            )}
          </div>
        ))}

        {formError && <p className="text-[12px] text-destructive">{formError}</p>}

        <button
          type="submit"
          disabled={pending}
          className="flex h-10 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? t("sending") : t("submit")}
        </button>
        <p className="text-center text-[11px] text-muted-foreground">{t("privacyHint")}</p>
      </div>
    </form>
  );
}

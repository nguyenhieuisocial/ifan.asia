"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { LifeBuoy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { openSupportSession } from "./actions";
import type { PendingHelpRequestRow } from "./types";

/**
 * Khu "Cần giúp?" đang mở trên /admin (mục 36.8-5, thẻ design
 * man-ho-tro-chi-doc.html) — cặp đôi với OpenInvoicesSection: founder thấy
 * tiệm đang kẹt, bấm mở ngay tại đây, không mở SQL editor.
 *
 * "Bắt đầu xem" điều hướng THẲNG vào tiệm đó (redirect trong action) — không
 * quay lại /admin, vì bấm xong đúng là founder MUỐN đang đứng trong tiệm đó.
 */
export function PendingHelpRequestsSection({
  requests,
}: {
  requests: PendingHelpRequestRow[];
}) {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const [pending, startTransition] = useTransition();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function openForm(req: PendingHelpRequestRow) {
    setOpenFor(req.id);
    setReason("");
  }

  function submit(req: PendingHelpRequestRow) {
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      toast.error(t("support.errors.reasonRequired"));
      return;
    }
    startTransition(async () => {
      const res = await openSupportSession({ tenantId: req.tenant_id, reason: trimmed });
      // Thành công thì action redirect() luôn — chỉ còn nhánh lỗi tới được đây.
      if (res?.error) toast.error(t(`support.errors.${res.error}` as "support.errors.failed"));
    });
  }

  if (requests.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <LifeBuoy aria-hidden className="size-3.5" />
        {t("support.clean")}
      </p>
    );
  }

  return (
    <section className="rounded-lg border p-4">
      <h2 className="flex items-center gap-1.5 text-[14px] font-semibold">
        <LifeBuoy aria-hidden className="size-4" />
        {t("support.title", { n: requests.length })}
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        {t("support.description")}
      </p>
      <ul className="mt-3 space-y-2">
        {requests.map((req) => (
          <li key={req.id} className="rounded-md border px-3 py-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">
                  {req.tenant_name}
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    @{req.tenant_slug}
                  </span>
                  {req.allow_screen_view && (
                    <Badge variant="secondary" className="ml-2">
                      {t("support.allowedScreenView")}
                    </Badge>
                  )}
                  {req.has_active_session && (
                    <Badge className="ml-2">{t("support.alreadyOpen")}</Badge>
                  )}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {req.message}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("support.createdAt", { date: formatDateTime(req.created_at, locale) })}
                </p>
              </div>
              {openFor !== req.id && (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => openForm(req)}>
                  {t("support.openAction")}
                </Button>
              )}
            </div>

            {openFor === req.id && (
              <div className="mt-2.5 flex flex-col gap-2 border-t pt-2.5">
                <div>
                  <label htmlFor={`reason-${req.id}`} className="mb-1 block text-xs text-muted-foreground">
                    {t("support.reasonLabel")}
                  </label>
                  <Textarea
                    id={`reason-${req.id}`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t("support.reasonPlaceholder")}
                    rows={2}
                    maxLength={500}
                    disabled={pending}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t("support.durationNote")}</p>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" disabled={pending} onClick={() => submit(req)}>
                    {pending ? t("support.opening") : t("support.confirmOpen")}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOpenFor(null)}>
                    {t("invoices.cancel")}
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

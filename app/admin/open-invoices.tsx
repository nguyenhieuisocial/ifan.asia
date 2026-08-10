"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { recordManualPayment } from "./actions";
import type { OpenInvoiceRow } from "./types";

/**
 * Khu "Hóa đơn chờ thu" trên /admin — cặp đôi với #47 (chủ tiệm thấy phiếu +
 * số tài khoản iFan): founder thấy tiền về thì bấm "Đã nhận tiền" ngay tại đây,
 * nhập số tiền + số biên lai, khỏi mở SQL editor.
 *
 * Kết quả từ RPC (applied / duplicate / underpaid / already_paid) được nói lại
 * bằng lời dễ hiểu qua toast — riêng phần idempotent (duplicate) nói rõ là
 * KHÔNG ghi trùng để founder yên tâm bấm lại khi mạng chập chờn.
 */
export function OpenInvoicesSection({ invoices }: { invoices: OpenInvoiceRow[] }) {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const [pending, startTransition] = useTransition();
  // Phiếu đang mở form nhập tiền (theo số phiếu) — mỗi lúc chỉ một phiếu.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");

  function openForm(inv: OpenInvoiceRow) {
    setOpenFor(inv.number);
    // Điền sẵn đúng số phải thu — founder chỉ sửa khi khách chuyển lệch.
    setAmount(String(inv.amount_due));
    setRef("");
  }

  function submit(invoiceNumber: string) {
    const amountNumber = Number(amount);
    if (!Number.isInteger(amountNumber) || amountNumber <= 0 || ref.trim().length === 0) {
      toast.error(t("invoices.errors.invalidInput"));
      return;
    }
    startTransition(async () => {
      const res = await recordManualPayment({
        invoiceNumber,
        amount: amountNumber,
        ref: ref.trim(),
      });
      if (res.error !== null) {
        toast.error(t(`invoices.errors.${res.error}`));
        return;
      }
      if (res.outcome === "applied") {
        toast.success(t("invoices.result.applied", { invoice: res.invoice }));
      } else if (res.outcome === "underpaid") {
        toast.error(
          t("invoices.result.underpaid", {
            amount: formatMoney(res.amountDue ?? 0, locale),
          }),
        );
      } else {
        // duplicate / alreadyPaid — không có gì đổi, chỉ báo cho yên tâm
        toast.info(t(`invoices.result.${res.outcome}`, { invoice: res.invoice }));
      }
      setOpenFor(null);
    });
  }

  if (invoices.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Receipt aria-hidden className="size-3.5" />
        {t("invoices.clean")}
      </p>
    );
  }

  return (
    <section className="rounded-lg border p-4">
      <h2 className="flex items-center gap-1.5 text-[14px] font-semibold">
        <Receipt aria-hidden className="size-4" />
        {t("invoices.title", { n: invoices.length })}
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        {t("invoices.description")}
      </p>
      <ul className="mt-3 space-y-2">
        {invoices.map((inv) => (
          <li key={inv.number} className="rounded-md border px-3 py-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">
                  {inv.number}
                  <Badge className="ml-2 font-semibold">{t(`plans.${inv.plan_code}`)}</Badge>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {inv.tenant_name} · @{inv.tenant_slug} · {t("invoices.createdAt", {
                    date: formatDateTime(inv.created_at, locale),
                  })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[15px] font-semibold tabular-nums">
                  {formatMoney(inv.amount_due, locale)}
                </span>
                {openFor !== inv.number && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => openForm(inv)}
                  >
                    {t("invoices.record")}
                  </Button>
                )}
              </div>
            </div>

            {openFor === inv.number && (
              <div className="mt-2.5 flex flex-col gap-2 border-t pt-2.5 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label
                    htmlFor={`amount-${inv.number}`}
                    className="mb-1 block text-xs text-muted-foreground"
                  >
                    {t("invoices.amountLabel")}
                  </label>
                  <Input
                    id={`amount-${inv.number}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={pending}
                  />
                </div>
                <div className="flex-1">
                  <label
                    htmlFor={`ref-${inv.number}`}
                    className="mb-1 block text-xs text-muted-foreground"
                  >
                    {t("invoices.refLabel")}
                  </label>
                  <Input
                    id={`ref-${inv.number}`}
                    value={ref}
                    onChange={(e) => setRef(e.target.value)}
                    placeholder={t("invoices.refPlaceholder")}
                    disabled={pending}
                  />
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" disabled={pending} onClick={() => submit(inv.number)}>
                    {t("invoices.confirm")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setOpenFor(null)}
                  >
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

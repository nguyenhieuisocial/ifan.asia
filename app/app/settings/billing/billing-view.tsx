"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Info, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import {
  yearlySaving,
  type BillingCycle,
  type BillingOverview,
  type PlanQuote,
  type PlanRow,
  type SubscriptionStatus,
} from "@/lib/billing/types";
import { cancelSubscription, changePlan, getPlanQuote } from "./actions";

const STATUS_STYLE: Record<SubscriptionStatus, string> = {
  trialing: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  past_due: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  suspended: "bg-destructive/10 text-destructive",
  canceled: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground",
};

/** Thanh mức dùng: đọc được bằng mắt, con số vẫn nói bằng lời bên cạnh. */
function UsageBar({ used, limit }: { used: number; limit: number | null }) {
  if (limit === null || limit <= 0) return null;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div
      className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"
      role="presentation"
    >
      <div
        className={cn(
          "h-full rounded-full transition-all",
          pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function BillingView({
  overview,
  plans,
  canManage,
  restricted = false,
}: {
  overview: BillingOverview | null;
  plans: PlanRow[];
  canManage: boolean;
  /** CSDL từ chối vì không đủ vai (migration #41) — khác hẳn "chưa tải được". */
  restricted?: boolean;
}) {
  const t = useTranslations("billing");
  const locale = useLocale() as Locale;
  const [cycle, setCycle] = useState<BillingCycle>("month");
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pending, startTransition] = useTransition();
  const quoteRef = useRef<HTMLElement | null>(null);
  // Khối "Hóa đơn đang chờ" (#47): trạng thái quá hạn/tạm ngưng có nút dẫn
  // thẳng xuống đây — người đang bị khóa cần thấy ngay phải trả phiếu nào.
  const invoiceRef = useRef<HTMLElement | null>(null);

  // Bảng báo giá nằm dưới đáy lưới gói: bấm xong mà màn hình không nhúc nhích
  // thì chủ tiệm tưởng nút hỏng và bấm tiếp gói khác.
  useEffect(() => {
    if (quote) {
      quoteRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [quote]);

  const planName = (p: Pick<PlanRow, "name_vi" | "name_en">) =>
    locale === "vi" ? p.name_vi : p.name_en;

  // Không đủ vai: nói thẳng vì sao và bảo họ hỏi ai — KHÔNG hiện bảng giá,
  // KHÔNG hiện màn lỗi. Người bị siết phải hiểu chuyện gì đang xảy ra.
  if (restricted) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl p-6">
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <div className="mt-4 rounded-lg border border-dashed p-8 text-center">
            <Lock aria-hidden className="mx-auto size-5 text-muted-foreground" />
            <h2 className="mt-3 text-[15px] font-semibold">
              {t("restricted.title")}
            </h2>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
              {t("restricted.description")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl p-6">
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Lock aria-hidden className="mx-auto size-5 text-muted-foreground" />
            <h1 className="mt-3 text-[15px] font-semibold">{t("empty.title")}</h1>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted-foreground">
              {t("empty.description")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const askQuote = (planCode: string) => {
    if (pending) return;
    startTransition(async () => {
      const res = await getPlanQuote({ planCode, cycle });
      if (res.error !== null) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      setQuote(res.quote);
    });
  };

  const confirm = () => {
    if (!quote || pending) return;
    startTransition(async () => {
      const res = await changePlan({
        planCode: quote.plan_code,
        cycle: quote.billing_cycle,
      });
      if (res.error !== null) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      setQuote(null);
      toast.success(
        res.applied
          ? t("toasts.applied")
          : t("toasts.invoiceCreated", {
              invoice: res.invoice,
              amount: formatMoney(res.amountDue, locale),
            }),
      );
    });
  };

  const isFree = overview.plan_code === "free";
  const periodEnd = overview.period_end
    ? formatDate(overview.period_end, locale)
    : null;
  // Chỉ hiện đường dừng khi đang có gói trả phí chạy thật (active, có ngày hết
  // kỳ). Gói Miễn phí không có gì để dừng; đang dùng thử thì hết thử tự về Free.
  const canCancel =
    !isFree && overview.status === "active" && overview.period_end !== null;

  // Dừng/tiếp tục đăng ký (RPC cancel_subscription — HỦY CUỐI KỲ, không hủy ngay).
  const setCancel = (cancel: boolean) => {
    if (pending) return;
    startTransition(async () => {
      const res = await cancelSubscription(cancel);
      if (res.error !== null) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      setConfirmCancel(false);
      toast.success(
        cancel
          ? t("cancel.scheduled", { date: periodEnd ?? "" })
          : t("cancel.resumed"),
      );
    });
  };

  // ---- Hóa đơn đang chờ + thông tin chuyển khoản (#47) ----
  const openInvoices = overview.open_invoices ?? [];
  const bank = overview.bank_transfer ?? {};
  // Founder CHƯA điền thông tin chuyển khoản (seed để rỗng): nói thật là
  // "liên hệ iFan", tuyệt đối không hiện hướng dẫn với ô trống.
  const bankInfo =
    bank.account_name && bank.account_number && bank.bank
      ? { name: bank.account_name, account: bank.account_number, bank: bank.bank }
      : null;
  const needsPaymentAttention =
    overview.status === "past_due" || overview.status === "suspended";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {t("description")}
          </p>
        </div>

        {/* ---- Gói đang dùng ---- */}
        <section className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={cn("font-semibold", STATUS_STYLE[overview.status])}>
              {t(`status.${overview.status}`)}
            </Badge>
            <span className="text-[15px] font-semibold">
              {locale === "vi" ? overview.plan_name_vi : overview.plan_name_en}
            </span>
          </div>

          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            {overview.status === "suspended"
              ? t("current.suspended")
              : overview.status === "past_due"
                ? t("current.pastDue")
                : isFree
                  ? t("current.free")
                  : overview.status === "trialing"
                    ? t("current.trial", {
                        days: overview.days_left ?? 0,
                        date: periodEnd ?? "",
                      })
                    : t("current.active", {
                        days: overview.days_left ?? 0,
                        date: periodEnd ?? "",
                      })}
          </p>

          {/* Quá hạn/tạm ngưng mà có phiếu chờ: dẫn thẳng xuống khối hóa đơn
              để người bị khóa biết ngay phải trả phiếu nào, bao nhiêu (#47). */}
          {needsPaymentAttention && openInvoices.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() =>
                invoiceRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                })
              }
            >
              {t("invoices.view")}
            </Button>
          )}

          {overview.credit_balance > 0 && (
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {t("current.credit", {
                amount: formatMoney(overview.credit_balance, locale),
              })}
            </p>
          )}

          <ul className="mt-4 space-y-3">
            {overview.usage.map((u) => {
              const left = u.limit === null ? null : Math.max(u.limit - u.used, 0);
              // Cảnh báo 70%/90% túi AI (ADR-0011 mục 4.2 luật 3) — chỉ áp
              // dụng metric ai_calls, chỉ khi có trần thật (limit !== null).
              const pct = u.limit && u.limit > 0 ? (u.used / u.limit) * 100 : 0;
              const warnKey =
                u.metric === "ai_calls" && u.limit !== null
                  ? pct >= 90
                    ? "usage.ai_callsWarn90"
                    : pct >= 70
                      ? "usage.ai_callsWarn70"
                      : null
                  : null;
              return (
                <li key={u.metric}>
                  <p className="text-[13px] leading-relaxed">
                    {u.limit === null
                      ? t(`usage.${u.metric}Unlimited`, { used: u.used })
                      : t(`usage.${u.metric}`, {
                          used: u.used,
                          limit: u.limit,
                          left: left ?? 0,
                        })}
                  </p>
                  <UsageBar used={u.used} limit={u.limit} />
                  {warnKey && (
                    <p
                      className={cn(
                        "mt-1 text-[12px] leading-relaxed",
                        pct >= 90 ? "text-destructive" : "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {t(warnKey, { left: left ?? 0, date: periodEnd ?? "" })}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {/* ---- Dừng / tiếp tục đăng ký (RPC HỦY CUỐI KỲ, không hủy ngay) ----
              Đã hẹn dừng: nói rõ gói còn chạy đến hết kỳ rồi mới thôi, và cho
              đổi ý (tiếp tục). Đang chạy: nút dừng, mở hộp xác nhận. */}
          {!isFree && overview.cancel_at_period_end ? (
            <div className="mt-4 border-t pt-3">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {t("cancel.scheduledNotice", { date: periodEnd ?? "" })}
              </p>
              {canManage && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => setCancel(false)}
                  disabled={pending}
                >
                  {t("cancel.resume")}
                </Button>
              )}
            </div>
          ) : canCancel && canManage ? (
            <div className="mt-4 border-t pt-3">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmCancel(true)}
                disabled={pending}
              >
                {t("cancel.trigger")}
              </Button>
            </div>
          ) : null}
        </section>

        {/* ---- Hóa đơn đang chờ thanh toán (#47) ---- */}
        {openInvoices.length > 0 && (
          <section
            ref={invoiceRef}
            className="rounded-lg border border-amber-500/60 p-4"
          >
            <h2 className="text-[14px] font-semibold">{t("invoices.title")}</h2>
            <ul className="mt-2 space-y-1.5">
              {openInvoices.map((inv) => (
                <li
                  key={inv.number}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]"
                >
                  <span>
                    {t("invoices.item", {
                      number: inv.number,
                      date: formatDate(inv.created_at, locale),
                    })}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatMoney(inv.amount_due, locale)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t pt-3 text-[13px] leading-relaxed text-muted-foreground">
              {bankInfo
                ? t("invoices.instruction", {
                    name: bankInfo.name,
                    account: bankInfo.account,
                    bank: bankInfo.bank,
                    invoice: openInvoices.map((i) => i.number).join(", "),
                  })
                : t("invoices.contact")}
            </p>
          </section>
        )}

        {/* ---- Nói thật: chưa nhận tiền tự động ---- */}
        <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{t("paymentNotice")}</span>
        </p>

        {/* ---- Chọn kỳ thanh toán ---- */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted-foreground">
            {t("cycle.label")}
          </span>
          <div className="flex gap-1 rounded-md border p-0.5">
            {(["month", "year"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCycle(c);
                  setQuote(null);
                }}
                className={cn(
                  "rounded px-2.5 py-1 text-[13px] whitespace-nowrap transition-colors",
                  cycle === c
                    ? "bg-foreground/[0.06] font-semibold"
                    : "text-muted-foreground hover:bg-foreground/[0.04]",
                )}
              >
                {t(c === "month" ? "cycle.month" : "cycle.year")}
              </button>
            ))}
          </div>
        </div>

        {/* ---- Danh sách gói ---- */}
        <ul className="grid gap-2 sm:grid-cols-2">
          {plans.map((p) => {
            const price = cycle === "year" ? p.price_year : p.price_month;
            const saving = yearlySaving(p.price_month, p.price_year);
            const isCurrent =
              p.code === overview.plan_code &&
              (isFree || cycle === overview.billing_cycle) &&
              overview.status !== "trialing";
            // Gói đang dùng thử: CHỈ để neo mắt (viền + nhãn). Không đưa vào
            // isCurrent/disabled — người dùng thử vẫn cần bấm được để trả tiền.
            const isTrialPlan =
              p.code === overview.plan_code && overview.status === "trialing";
            // So theo giá tháng chứ không riêng gói Miễn phí: mọi gói rẻ hơn
            // gói đang dùng đều là hạ gói, kể cả tiệm đã trả tiền.
            const isDowngrade = !isTrialPlan && p.price_month < overview.price_month;
            return (
              <li
                key={p.code}
                className={cn(
                  "flex flex-col rounded-lg border p-3",
                  (isCurrent || isTrialPlan) && "border-primary",
                )}
              >
                <p className="text-[14px] font-semibold">{planName(p)}</p>
                {isTrialPlan && (
                  <p className="mt-0.5 text-xs font-medium text-primary">
                    {t("plan.trialing")}
                  </p>
                )}
                {/* Gói Miễn phí hiện "0đ/tháng" — tên gói phía trên đã nói "Miễn phí",
                    lặp lại chữ đó ở dòng giá làm thẻ đọc như bị lỗi. */}
                <p className="mt-1 text-lg font-semibold">
                  {formatMoney(price, locale)}
                  <span className="text-xs font-normal text-muted-foreground">
                    {t(cycle === "year" ? "plan.perYear" : "plan.perMonth")}
                  </span>
                </p>
                {cycle === "year" && saving > 0 && (
                  <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                    {t("plan.saving", { amount: formatMoney(saving, locale) })}
                  </p>
                )}
                <ul className="mt-2 flex-1 space-y-1 text-[13px] text-muted-foreground">
                  <li>
                    {p.limits.ai_calls == null
                      ? t("limits.aiUnlimited")
                      : t("limits.ai", { n: p.limits.ai_calls })}
                  </li>
                  <li>
                    {p.limits.max_members == null
                      ? t("limits.membersUnlimited")
                      : t("limits.members", { n: p.limits.max_members })}
                  </li>
                </ul>
                <Button
                  type="button"
                  variant={isCurrent || isDowngrade ? "outline" : "default"}
                  size="sm"
                  disabled={!canManage || isCurrent || pending}
                  onClick={() => askQuote(p.code)}
                  className="mt-3 w-full"
                >
                  {isCurrent
                    ? t("plan.current")
                    : isTrialPlan
                      ? t("plan.keepTrial")
                      : isDowngrade
                        ? t("plan.downgrade")
                        : t("plan.choose")}
                </Button>
              </li>
            );
          })}
        </ul>

        {!canManage && (
          <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
            <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>{t("ownerOnly")}</span>
          </p>
        )}

        {/* ---- Bảng tính pro-rata trước khi xác nhận ---- */}
        {quote && (
          <section ref={quoteRef} className="rounded-lg border border-primary p-4">
            <h2 className="text-[14px] font-semibold">
              {t("quote.title", {
                plan:
                  planName(
                    plans.find((p) => p.code === quote.plan_code) ?? {
                      name_vi: quote.plan_code,
                      name_en: quote.plan_code,
                    },
                  ) ?? quote.plan_code,
                cycle: t(
                  quote.billing_cycle === "year"
                    ? "cycle.yearShort"
                    : "cycle.monthShort",
                ),
              })}
            </h2>
            <dl className="mt-3 space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("quote.listPrice")}</dt>
                <dd className="tabular-nums">
                  {formatMoney(quote.list_price, locale)}
                </dd>
              </div>
              {quote.unused_credit > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t("quote.unused")}</dt>
                  <dd className="tabular-nums">
                    −{formatMoney(quote.unused_credit, locale)}
                  </dd>
                </div>
              )}
              {quote.existing_credit > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t("quote.credit")}</dt>
                  <dd className="tabular-nums">
                    −{formatMoney(quote.existing_credit, locale)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3 border-t pt-1.5 font-semibold">
                <dt>{t("quote.due")}</dt>
                <dd className="tabular-nums">
                  {formatMoney(quote.amount_due, locale)}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {quote.credit_carried > 0
                ? t("quote.carried", {
                    amount: formatMoney(quote.credit_carried, locale),
                  })
                : t("quote.rounding")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={confirm} disabled={pending}>
                {t("quote.confirm")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setQuote(null)}
                disabled={pending}
              >
                {t("quote.cancel")}
              </Button>
            </div>
          </section>
        )}

        {/* ---- Xác nhận dừng đăng ký (thao tác quan trọng) ---- */}
        <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("cancel.confirmTitle")}</DialogTitle>
              <DialogDescription>
                {t("cancel.confirmBody", { date: periodEnd ?? "" })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmCancel(false)}
                disabled={pending}
              >
                {t("cancel.keep")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setCancel(true)}
                disabled={pending}
              >
                {pending ? t("cancel.pending") : t("cancel.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowUpCircle, ChevronLeft, ChevronRight, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatMoney } from "@/lib/format";
import { kpiMonthLabel, shiftMonth } from "@/lib/kpi";
import type { Locale } from "@/i18n/config";
import {
  CASH_CATEGORIES_IN,
  CASH_CATEGORIES_OUT,
  type CashCategory,
  type CashDirection,
  type CashEntry,
  type CashFund,
  type CashSummary,
} from "@/lib/finance/cash-ledger";
import { recordCashEntry } from "./actions";

const digitsOnly = (v: string) => v.replace(/\D/g, "");

const TOAST_KEYS = new Set(["saved", "invalidInput", "notAuthenticated", "forbidden", "notFound", "saveFailed"]);
const ERROR_TO_TOAST_KEY: Record<string, string> = {
  invalid_input: "invalidInput",
  not_authenticated: "notAuthenticated",
  forbidden: "forbidden",
  not_found: "notFound",
};
function toastKeyFor(error: string | null | undefined): string {
  const key = error ? (ERROR_TO_TOAST_KEY[error] ?? "") : "";
  return TOAST_KEYS.has(key) ? key : "saveFailed";
}

function NewEntryForm({ onDone, moSan }: { onDone: () => void; moSan: boolean }) {
  const t = useTranslations("cashbook");
  /**
   * `?tao=1` mo san o ghi thu chi — loi vao tu BANG LENH (Ctrl K).
   * Doc MOT LAN luc dung: dong o roi ma van con ?tao=1 tren thanh dia chi thi
   * moi lan render lai se bat o mo lai.
   */
  const [open, setOpen] = useState(moSan);
  const [direction, setDirection] = useState<CashDirection>("out");
  const categories = direction === "in" ? CASH_CATEGORIES_IN : CASH_CATEGORIES_OUT;
  const [category, setCategory] = useState<CashCategory>(categories[0]);
  const [amount, setAmount] = useState("");
  const [fund, setFund] = useState<CashFund>("cash");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const pickDirection = (d: CashDirection) => {
    setDirection(d);
    const list = d === "in" ? CASH_CATEGORIES_IN : CASH_CATEGORIES_OUT;
    setCategory(list[0]);
  };

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        {t("addNew")}
      </Button>
    );
  }

  const submit = () => {
    const amountNum = Number(amount || "0");
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error(t("toasts.invalidInput"));
      return;
    }
    startTransition(async () => {
      const res = await recordCashEntry({ direction, amountVnd: amountNum, fund, category, note: note.trim() || null });
      if (res.error) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      toast.success(t("toasts.saved"));
      setOpen(false);
      setAmount("");
      setNote("");
      onDone();
    });
  };

  return (
    <div className="space-y-3 rounded-lg border-2 border-primary/50 bg-muted/20 p-3">
      <div className="flex gap-1.5 rounded-md bg-muted p-1">
        {(["in", "out"] as CashDirection[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => pickDirection(d)}
            className={`flex-1 rounded px-2 py-1.5 text-[13px] font-medium ${direction === d ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            {t(`direction.${d}`)}
          </button>
        ))}
      </div>

      <div>
        <Label className="text-[11px] text-muted-foreground">{t("amountLabel")}</Label>
        <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(digitsOnly(e.target.value).slice(0, 10))} className="h-9" autoFocus />
      </div>

      <div>
        <Label className="text-[11px] text-muted-foreground">{t("categoryLabel")}</Label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
                category === c ? "bg-primary text-primary-foreground" : "border text-foreground"
              }`}
            >
              {t(`categories.${c}`)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-[11px] text-muted-foreground">{t("fundLabel")}</Label>
        <div className="mt-1 flex gap-1.5">
          {(["cash", "bank"] as CashFund[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFund(f)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${f === fund ? "bg-primary text-primary-foreground" : "border text-foreground"}`}
            >
              {t(`fund.${f}`)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-[11px] text-muted-foreground">{t("noteLabel")}</Label>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} maxLength={500} className="min-h-16 text-[13px]" />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Một dòng sổ quỹ.
 *
 * Trước đây "· xem đơn" là <a> nằm LỌT GIỮA một dòng phụ có `truncate`: vùng
 * chạm chỉ 105×14px và mọi cách nới padding đều bị chính khung cắt chữ xén đi
 * (việc đã thử và thất bại đợt trước). Nên lần này đổi CẤU TRÚC dòng, hai chỗ:
 *
 *  1. Cả hàng trở thành liên kết khi khoản này sinh ra từ một đơn → vùng chạm
 *     bằng nguyên hàng (~56px), không phải mấy chữ bé tí. Không thêm chiều cao
 *     nào cho danh sách vì hàng vẫn đúng hai dòng chữ như cũ.
 *  2. Dòng phụ tách khỏi cột giữa, chạy SUỐT bề ngang hàng (kể cả phần dưới số
 *     tiền) → rộng thêm ~100px, đủ chỗ để "· xem đơn" hiện nguyên chữ thay vì
 *     bị dấu "…" nuốt mất như trước.
 *
 * Hàng ghi tay (không gắn đơn) vẫn là <div> thường — không có gì để mở.
 */
function EntryRow({ entry, locale, memberNames }: { entry: CashEntry; locale: Locale; memberNames: Record<string, string> }) {
  const t = useTranslations("cashbook");
  const isAuto = entry.orderPaymentId !== null;
  const recorderName = entry.recordedBy ? (memberNames[entry.recordedBy] ?? t("unknownMember")) : null;
  const orderHref = isAuto && entry.orderId ? `/app/orders/${entry.orderId}` : null;

  const body = (
    <>
      <div className="flex items-center gap-2.5">
        {entry.direction === "in" ? (
          <ArrowUpCircle className="size-4 shrink-0 text-green-600" />
        ) : (
          <ArrowDownCircle className="size-4 shrink-0 text-destructive" />
        )}
        <span className="min-w-0 flex-1 truncate">{t(`categories.${entry.category}`)}</span>
        <span className={`shrink-0 font-medium ${entry.direction === "in" ? "text-green-700" : "text-destructive"}`}>
          {entry.direction === "in" ? "+" : "-"}
          {formatMoney(entry.amountVnd, locale)}
        </span>
      </div>
      <div className="truncate text-[11px] text-muted-foreground">
        {formatDateTime(entry.createdAt, locale)} · {t(`fund.${entry.fund}`)} ·{" "}
        {isAuto ? (
          orderHref ? (
            <span className="text-primary underline-offset-2 group-hover:underline">{t("autoFromOrder")}</span>
          ) : (
            t("auto")
          )
        ) : (
          t("manualBy", { name: recorderName ?? "—" })
        )}
        {entry.note ? ` · ${entry.note}` : ""}
      </div>
    </>
  );

  if (orderHref) {
    return (
      <Link href={orderHref} className="group block border-b py-2.5 text-[13px] last:border-b-0 hover:bg-muted/50">
        {body}
      </Link>
    );
  }
  return <div className="border-b py-2.5 text-[13px] last:border-b-0">{body}</div>;
}

export function CashbookView({
  canManage,
  canView,
  monthKey,
  entries,
  summary,
  memberNames,
}: {
  canManage: boolean;
  canView: boolean;
  monthKey: string;
  entries: CashEntry[];
  summary: CashSummary;
  memberNames: Record<string, string>;
}) {
  const t = useTranslations("cashbook");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const spDauVao = useSearchParams();

  if (!canView) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Lock className="size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t("noPermission.title")}</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">{t("noPermission.description")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Từ lg mới nới: sổ quỹ liệt kê từng dòng thu/chi kèm ngày, khoản,
            số tiền, ghi chú — khoá 672px thì ghi chú dài bị xuống dòng liên
            tục. Dưới lg giữ nguyên. */}
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6 lg:max-w-5xl xl:max-w-7xl 2xl:max-w-[1600px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">{t("title")}</h1>
              <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <Link
              href={`/app/cashbook?m=${shiftMonth(monthKey, -1)}`}
              className="flex size-8 max-md:size-11 items-center justify-center rounded-md border hover:bg-muted/60"
              aria-label={t("prevMonth")}
            >
              <ChevronLeft className="size-4" />
            </Link>
            <span className="min-w-20 text-center text-[13px] font-medium">{t("month.label", { month: kpiMonthLabel(monthKey) })}</span>
            <Link
              href={`/app/cashbook?m=${shiftMonth(monthKey, 1)}`}
              className="flex size-8 max-md:size-11 items-center justify-center rounded-md border hover:bg-muted/60"
              aria-label={t("nextMonth")}
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-lg border p-3">
              <div className="text-[12px] text-muted-foreground">{t("summary.in")}</div>
              <div className="mt-1 text-[17px] font-semibold text-green-700">{formatMoney(summary.inVnd, locale)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-[12px] text-muted-foreground">{t("summary.out")}</div>
              <div className="mt-1 text-[17px] font-semibold text-destructive">{formatMoney(summary.outVnd, locale)}</div>
            </div>
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
              <div className="text-[12px] text-primary">{t("summary.net")}</div>
              <div className="mt-1 text-[17px] font-semibold text-primary">{formatMoney(summary.netVnd, locale)}</div>
            </div>
          </div>

          {canManage && <NewEntryForm onDone={() => router.refresh()} moSan={spDauVao.get("tao") === "1"} />}

          {entries.length === 0 ? (
            <p className="rounded-md border border-dashed p-5 text-center text-[13px] text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="rounded-md border px-3">
              {entries.map((e) => (
                <EntryRow key={e.id} entry={e} locale={locale} memberNames={memberNames} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

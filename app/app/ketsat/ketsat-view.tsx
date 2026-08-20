"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Plus, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { formatMoney, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import type { ShiftClosing, SupplierDebt } from "./queries";
import { chotSoCa, ghiThanhToanNCC } from "./actions";

const digitsOnly = (v: string) => v.replace(/\D/g, "");

// ==================== CHỐT SỔ CA ====================

function ShiftClosingForm({
  suggestedOpening,
  onDone,
}: {
  suggestedOpening: number;
  onDone: () => void;
}) {
  const t = useTranslations("ketsat");
  const [openingStr, setOpeningStr] = useState(String(suggestedOpening));
  const [actualStr, setActualStr] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const opening = parseInt(openingStr.replace(/\D/g, "") || "0", 10);
  const actual = parseInt(actualStr.replace(/\D/g, "") || "0", 10);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actualStr.trim()) return;
    // +7 tiếng TRƯỚC khi cắt chuỗi (khuôn của `app/app/team/punch-panel.tsx`):
    // tiệm đóng cửa 1–2 giờ sáng mà chốt ca thì `toISOString()` cho ra ngày UTC
    // = HÔM TRƯỚC, nên ca tối 23h và ca khuya 1h cùng một đêm bị dán CÙNG một
    // ngày. Chỉ cái NHÃN ngày sai — tiền vẫn đúng vì `queries.ts` cộng theo mốc
    // thời gian tuyệt đối, không theo nhãn này.
    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    startTransition(async () => {
      const res = await chotSoCa({
        shiftDate: today,
        openingCash: opening,
        actualCash: actual,
        note: note.trim() || null,
      });
      if (res.error) {
        toast.error(t(`errors.${res.error}`, { defaultValue: t("errors.save_failed") }));
      } else {
        toast.success(t("shift.saved"));
        router.refresh();
        onDone();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-4">
      <h3 className="font-semibold">{t("shift.newTitle")}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("shift.openingCash")}</Label>
          <Input
            value={openingStr}
            onChange={(e) => setOpeningStr(e.target.value)}
            onBlur={(e) => setOpeningStr(digitsOnly(e.target.value))}
            inputMode="numeric"
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("shift.actualCash")}</Label>
          <Input
            value={actualStr}
            onChange={(e) => setActualStr(e.target.value)}
            onBlur={(e) => setActualStr(digitsOnly(e.target.value))}
            inputMode="numeric"
            placeholder="0"
            required
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t("shift.note")}</Label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder={t("shift.notePlaceholder")}
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending || !actualStr.trim()}>
          {pending ? t("saving") : t("shift.saveShift")}
        </Button>
      </div>
    </form>
  );
}

function ShiftClosingList({ closings }: { closings: ShiftClosing[] }) {
  const t = useTranslations("ketsat");
  const locale = useLocale() as Locale;

  if (closings.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">{t("shift.empty")}</p>
    );
  }

  return (
    <div className="divide-y rounded-lg border">
      {closings.map((c) => {
        const isShort = c.variance < 0;
        const isOver = c.variance > 0;
        return (
          <div key={c.id} className="flex items-center gap-3 p-3">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{formatDate(c.shiftDate, locale)}</span>
                <span className="text-xs text-muted-foreground">{c.closedByName}</span>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>{t("shift.actual")}: {formatMoney(c.actualCash, locale)}</span>
                <span>{t("shift.expected")}: {formatMoney(c.expectedCash, locale)}</span>
              </div>
            </div>
            <div
              className={cn(
                "shrink-0 text-sm font-semibold",
                isShort ? "text-destructive" : isOver ? "text-emerald-600" : "text-muted-foreground",
              )}
            >
              {isShort ? <TrendingDown className="inline size-3.5 mr-0.5" /> : isOver ? <TrendingUp className="inline size-3.5 mr-0.5" /> : <Minus className="inline size-3.5 mr-0.5" />}
              {c.variance > 0 ? "+" : ""}{formatMoney(c.variance, locale)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ==================== CÔNG NỢ NCC ====================

function SupplierPaymentForm({
  supplierId,
  supplierName,
  onDone,
}: {
  supplierId: string;
  supplierName: string;
  onDone: () => void;
}) {
  const t = useTranslations("ketsat");
  const [amountStr, setAmountStr] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseInt(amountStr.replace(/\D/g, "") || "0", 10);
    if (!amount) return;
    startTransition(async () => {
      const res = await ghiThanhToanNCC({
        supplierId,
        purchaseId: null,
        amountVnd: amount,
        paymentMethod: method,
        note: note.trim() || null,
      });
      if (res.error) {
        toast.error(t(`errors.${res.error}`, { defaultValue: t("errors.save_failed") }));
      } else {
        toast.success(t("debt.saved"));
        router.refresh();
        onDone();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <h4 className="text-sm font-semibold">{t("debt.payTitle", { name: supplierName })}</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("debt.amount")}</Label>
          <Input
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            onBlur={(e) => setAmountStr(digitsOnly(e.target.value))}
            inputMode="numeric"
            placeholder="0"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("debt.method")}</Label>
          <Select value={method} onChange={(e) => setMethod(e.target.value as "cash" | "transfer")}>
            <option value="cash">{t("debt.methods.cash")}</option>
            <option value="transfer">{t("debt.methods.transfer")}</option>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t("debt.note")}</Label>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("debt.notePlaceholder")}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending || !amountStr.trim()}>
          {pending ? t("saving") : t("debt.recordPayment")}
        </Button>
      </div>
    </form>
  );
}

function SupplierDebtList({ debts }: { debts: SupplierDebt[] }) {
  const t = useTranslations("ketsat");
  const locale = useLocale() as Locale;
  const [payingId, setPayingId] = useState<string | null>(null);

  if (debts.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t("debt.empty")}</p>;
  }

  return (
    <div className="space-y-2">
      {debts.map((d) => (
        <div key={d.supplierId} className="rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{d.supplierName}</div>
              {d.supplierPhone && (
                <div className="text-xs text-muted-foreground">{d.supplierPhone}</div>
              )}
            </div>
            <div className="text-right">
              <div
                className={cn(
                  "text-sm font-semibold",
                  d.outstanding > 0 ? "text-destructive" : "text-emerald-600",
                )}
              >
                {d.outstanding > 0
                  ? t("debt.owes", { amount: formatMoney(d.outstanding, locale) })
                  : t("debt.settled")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("debt.of", { total: formatMoney(d.totalPurchases, locale) })}
              </div>
            </div>
          </div>
          {d.outstanding > 0 && payingId !== d.supplierId && (
            <div className="mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPayingId(d.supplierId)}
              >
                <Plus className="mr-1 size-3.5" />
                {t("debt.recordPayment")}
              </Button>
            </div>
          )}
          {payingId === d.supplierId && (
            <div className="mt-3">
              <SupplierPaymentForm
                supplierId={d.supplierId}
                supplierName={d.supplierName}
                onDone={() => setPayingId(null)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ==================== ROOT VIEW ====================

export default function KetsatView({
  closings,
  debts,
  suggestedOpening,
  loadFailed,
}: {
  closings: ShiftClosing[];
  debts: SupplierDebt[];
  suggestedOpening: number;
  loadFailed: boolean;
}) {
  const t = useTranslations("ketsat");
  const [tab, setTab] = useState<"shift" | "debt">("shift");
  const [showForm, setShowForm] = useState(false);

  if (loadFailed) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">{t("loadFailed")}</div>
    );
  }

  // ⚠️ HAI LỚP VÙNG CUỘN — bắt buộc. Khung /app đặt màn vào
  // `<main className="flex min-h-0 flex-1 flex-col overflow-hidden">`: hộp CAO
  // CỐ ĐỊNH, cắt phần thừa. Màn nào không tự có lớp cuộn thì phần dài quá màn
  // hình bị CẮT và không có cách nào với tới — máy tính ít lộ vì màn rộng,
  // điện thoại là hỏng hẳn (đo 19/08: hai màn khác mất >1.500px nội dung và
  // nút Lưu nằm ngoài màn hình). Khuôn chép từ Bảng lương/Dự án.
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Từ lg mới nới: mỗi ca là một cụm số (đầu ca/thực đếm/chênh lệch)
            cộng lịch sử nộp/rút, khoá 672px thì các cụm số dồn sát nhau khó
            đọc. Dưới lg giữ nguyên. */}
        <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6 lg:max-w-5xl">
          <h1 className="text-xl font-bold">{t("title")}</h1>

          {/* Tab switcher */}
          <div className="flex gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
            {(["shift", "debt"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "rounded px-3 py-1 text-sm font-medium transition-colors",
                  tab === key
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`tabs.${key}`)}
              </button>
            ))}
          </div>

          {/* Tab: chốt ca */}
          {tab === "shift" && (
            <div className="space-y-3">
              {!showForm && (
                <Button onClick={() => setShowForm(true)}>
                  <Plus className="mr-1 size-4" />
                  {t("shift.newShift")}
                </Button>
              )}
              {showForm && (
                <ShiftClosingForm
                  suggestedOpening={suggestedOpening}
                  onDone={() => setShowForm(false)}
                />
              )}
              <ShiftClosingList closings={closings} />
            </div>
          )}

          {/* Tab: công nợ NCC */}
          {tab === "debt" && <SupplierDebtList debts={debts} />}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Landmark, Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SITE_URL } from "@/lib/config";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { VN_BANKS } from "@/lib/payments/vn-banks";
import { connectSePay, disconnectSePay, saveBankInfo, saveVatSettings } from "./actions";

const OTHER_BANK = "other";

type BankInfo = { bankBin: string | null; accountNo: string | null; accountName: string | null };

export type SePayTransaction = {
  id: string;
  amountVnd: number;
  content: string | null;
  transactionDate: string;
  orderCode: string | null;
  orderId: string | null;
  matchStatus: string;
  transferType: string;
  referenceCode: string | null;
};

export type SePayState = {
  tenantId: string;
  connected: boolean;
  transactions: SePayTransaction[];
};

const TOAST_KEYS = new Set(["saved", "invalidInput", "bankFieldsPartial", "notAuthenticated", "forbidden", "notFound", "saveFailed", "sepayKeyTooShort"]);
const ERROR_TO_TOAST_KEY: Record<string, string> = {
  invalid_input: "invalidInput",
  bank_fields_partial: "bankFieldsPartial",
  not_authenticated: "notAuthenticated",
  forbidden: "forbidden",
  not_found: "notFound",
  sepay_key_too_short: "sepayKeyTooShort",
};
function toastKeyFor(error: string | null | undefined): string {
  const key = error ? (ERROR_TO_TOAST_KEY[error] ?? "") : "";
  return TOAST_KEYS.has(key) ? key : "saveFailed";
}

/**
 * Kết quả khớp mà bản web NÀY biết diễn giải — phải khớp `match_status` của
 * `bank_transactions` (migration #243) và `settings.payments.sepay.status.*`.
 * Khoá lạ (CSDL mới hơn bản web) rơi về câu chung thay vì để next-intl ném lỗi
 * làm sập cả sổ. Khuôn chép từ `KNOWN_MESSAGE_KEYS` của Trung tâm thông báo.
 */
const MATCH_STATUS_KEYS = new Set([
  "matched",
  "partial",
  "no_code",
  "order_not_found",
  "ambiguous",
  "order_cancelled",
  "already_paid",
  "amount_over",
  "no_amount",
  "duplicate_payment",
  "ignored_out",
]);

/** Xanh = tiền đã vào đơn. Vàng = tiền có thật nhưng đang chờ người xử. */
const MATCH_STATUS_TONE: Record<string, string> = {
  matched: "bg-green-100 text-green-800",
  partial: "bg-green-100 text-green-800",
  duplicate_payment: "bg-muted text-muted-foreground",
  ignored_out: "bg-muted text-muted-foreground",
};

/**
 * SePay — nhận tiền tự động (migration #243).
 *
 * Ba việc, đúng thứ tự chủ tiệm cần: địa chỉ để dán sang SePay · khoá để hai
 * bên nhận nhau · sổ giao dịch gần đây để thấy nó CÓ chạy thật.
 *
 * Sổ giao dịch không phải trang trí: nó là chỗ DUY NHẤT chủ tiệm thấy được
 * những đồng tiền đã về tài khoản mà hệ thống không ghép được vào đơn nào.
 */
function SePayCard({ sepay, hasBank }: { sepay: SePayState; hasBank: boolean }) {
  const t = useTranslations("settings.payments.sepay");
  const tToast = useTranslations("settings.payments.toasts");
  const tLoi = useTranslations("errors");
  const locale = useLocale() as Locale;
  const [apiKey, setApiKey] = useState("");
  const [pending, startTransition] = useTransition();

  const webhookUrl = `${SITE_URL}/api/webhooks/sepay?t=${sepay.tenantId}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success(t("urlCopied"));
    } catch {
      // Không nuốt: trình duyệt từ chối chép thì phải nói ra, không thì người
      // dùng bấm mãi mà dán ra rỗng (cùng bài học ở màn Kênh kết nối).
      toast.error(tLoi("copyFailed"));
    }
  };

  const connect = () => {
    startTransition(async () => {
      const res = await connectSePay({ apiKey: apiKey.trim() });
      if (res.error) {
        toast.error(tToast(toastKeyFor(res.error)));
        return;
      }
      setApiKey("");
      toast.success(t("connected"));
    });
  };

  const disconnect = () => {
    startTransition(async () => {
      const res = await disconnectSePay();
      if (res.error) {
        toast.error(tToast(toastKeyFor(res.error)));
        return;
      }
      toast.success(t("disconnected"));
    });
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Label className="flex items-center gap-1.5 text-sm font-medium">
            <Zap className="size-4" />
            {t("title")}
          </Label>
          <p className="mt-1 text-[11px] text-muted-foreground">{t("desc")}</p>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${
            sepay.connected ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"
          }`}
        >
          {sepay.connected ? t("on") : t("off")}
        </span>
      </div>

      {/* Không có số tài khoản thì mã QR không dựng được, mà mã QR chính là chỗ
          in NỘI DUNG mang mã đơn — thiếu nó thì mọi giao dịch về đều "không có
          mã đơn". Nói trước, đừng để chủ tiệm nối xong rồi ngồi đợi vô ích. */}
      {!hasBank && (
        <p className="rounded-md bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900">
          {t("needBankFirst")}
        </p>
      )}

      <div>
        <Label className="text-[12px] text-muted-foreground">{t("urlLabel")}</Label>
        <div className="flex gap-2">
          <Input readOnly value={webhookUrl} className="h-9 font-mono text-[11px]" />
          <Button type="button" variant="outline" size="sm" onClick={copy}>
            {t("copy")}
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{t("urlHint")}</p>
      </div>

      <div>
        <Label className="text-[12px] text-muted-foreground">{t("keyLabel")}</Label>
        <div className="flex gap-2">
          <Input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value.slice(0, 200))}
            placeholder={t("keyPlaceholder")}
            className="h-9 font-mono text-[12px]"
            autoComplete="off"
            spellCheck={false}
          />
          {/* Khoá do NGƯỜI tự nghĩ thường ngắn và đoán được, mà cổng nhận là
              địa chỉ công khai. Nút này sinh 32 ký tự ngẫu nhiên để không ai
              phải tự nghĩ ra một chuỗi "đủ khó". */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setApiKey(crypto.randomUUID().replace(/-/g, ""))}
          >
            {t("generate")}
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{t("keyHint")}</p>
      </div>

      <div className="flex justify-end gap-2">
        {sepay.connected && (
          <Button variant="outline" size="sm" onClick={disconnect} disabled={pending}>
            {t("disconnect")}
          </Button>
        )}
        <Button size="sm" onClick={connect} disabled={pending || apiKey.trim().length < 24}>
          {pending ? t("saving") : sepay.connected ? t("replaceKey") : t("connect")}
        </Button>
      </div>

      <div className="border-t pt-3">
        <Label className="text-[12px] font-medium">{t("logTitle")}</Label>
        {sepay.transactions.length === 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">{t("logEmpty")}</p>
        ) : (
          <ul className="mt-2 divide-y">
            {sepay.transactions.map((tx) => {
              const key = MATCH_STATUS_KEYS.has(tx.matchStatus) ? tx.matchStatus : null;
              return (
                <li key={tx.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium ${
                          MATCH_STATUS_TONE[tx.matchStatus] ?? "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {key ? t(`status.${key}`) : t("status.unknown")}
                      </span>
                      {tx.orderId && (
                        <Link
                          href={`/app/orders/${tx.orderId}`}
                          className="text-[11px] text-primary hover:underline"
                        >
                          {tx.orderCode}
                        </Link>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {tx.content || t("noContent")}
                    </p>
                    <p className="text-[10.5px] text-muted-foreground">
                      {formatDateTime(tx.transactionDate, locale)}
                      {tx.referenceCode ? ` · ${tx.referenceCode}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-[13px] font-medium tabular-nums ${
                      tx.transferType === "in" ? "text-green-700" : "text-muted-foreground"
                    }`}
                  >
                    {tx.transferType === "in" ? "+" : "−"}
                    {formatMoney(tx.amountVnd, locale)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function PaymentsSettingsView({
  canManage,
  initial,
  vat,
  sepay,
}: {
  canManage: boolean;
  initial: BankInfo;
  vat: { enabled: boolean; rate: number };
  sepay: SePayState;
}) {
  const t = useTranslations("settings.payments");
  const knownBank = initial.bankBin ? VN_BANKS.some((b) => b.bin === initial.bankBin) : true;

  const [bankSelect, setBankSelect] = useState(
    initial.bankBin ? (knownBank ? initial.bankBin : OTHER_BANK) : (VN_BANKS[0]?.bin ?? ""),
  );
  const [customBin, setCustomBin] = useState(!knownBank && initial.bankBin ? initial.bankBin : "");
  const [accountNo, setAccountNo] = useState(initial.accountNo ?? "");
  const [accountName, setAccountName] = useState(initial.accountName ?? "");
  const [vatEnabled, setVatEnabled] = useState(vat.enabled);
  const [vatRate, setVatRate] = useState(String(vat.rate));
  const [pending, startTransition] = useTransition();

  const saveVat = () => {
    const r = Number(vatRate);
    if (!Number.isFinite(r) || r < 0 || r > 20) {
      toast.error(t("toasts.vatRateInvalid"));
      return;
    }
    startTransition(async () => {
      const res = await saveVatSettings({ enabled: vatEnabled, rate: r });
      if (res.error) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      toast.success(t("toasts.saved"));
    });
  };

  const effectiveBin = bankSelect === OTHER_BANK ? customBin.trim() : bankSelect;

  const save = () => {
    const hasAny = effectiveBin || accountNo.trim() || accountName.trim();
    startTransition(async () => {
      const res = await saveBankInfo({
        bankBin: hasAny ? effectiveBin || null : null,
        accountNo: hasAny ? accountNo.trim() || null : null,
        accountName: hasAny ? accountName.trim() || null : null,
      });
      if (res.error) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      toast.success(t("toasts.saved"));
    });
  };

  const clear = () => {
    startTransition(async () => {
      const res = await saveBankInfo({ bankBin: null, accountNo: null, accountName: null });
      if (res.error) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      setBankSelect(VN_BANKS[0]?.bin ?? "");
      setCustomBin("");
      setAccountNo("");
      setAccountName("");
      toast.success(t("toasts.saved"));
    });
  };

  if (!canManage) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4 p-4 sm:p-6">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-8 text-center">
          <Lock className="size-8 text-muted-foreground/50" />
          <p className="text-[13px] text-muted-foreground">{t("noPermission")}</p>
          {initial.accountName && (
            <p className="mt-2 text-[13px]">
              {initial.accountName} · {initial.accountNo}
            </p>
          )}
        </div>
      </div>
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
        <div className="mx-auto w-full max-w-lg space-y-4 p-4 sm:p-6">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <Landmark className="size-5" />
              {t("title")}
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div>
              <Label className="text-[12px] text-muted-foreground">{t("bankLabel")}</Label>
              <Select value={bankSelect} onChange={(e) => setBankSelect(e.target.value)} className="h-9">
                {VN_BANKS.map((b) => (
                  <option key={b.bin} value={b.bin}>
                    {b.shortName}
                  </option>
                ))}
                <option value={OTHER_BANK}>{t("otherBank")}</option>
              </Select>
            </div>
            {bankSelect === OTHER_BANK && (
              <div>
                <Label className="text-[12px] text-muted-foreground">{t("binLabel")}</Label>
                <Input
                  value={customBin}
                  onChange={(e) => setCustomBin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder={t("binPlaceholder")}
                  inputMode="numeric"
                  className="h-9"
                />
              </div>
            )}
            <div>
              <Label className="text-[12px] text-muted-foreground">{t("accountNoLabel")}</Label>
              <Input
                value={accountNo}
                onChange={(e) => setAccountNo(e.target.value.replace(/\D/g, "").slice(0, 30))}
                placeholder={t("accountNoPlaceholder")}
                inputMode="numeric"
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-[12px] text-muted-foreground">{t("accountNameLabel")}</Label>
              <Input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value.toUpperCase().slice(0, 120))}
                placeholder={t("accountNamePlaceholder")}
                className="h-9"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">{t("hint")}</p>
            <div className="flex justify-end gap-2">
              {(initial.bankBin || initial.accountNo) && (
                <Button variant="outline" size="sm" onClick={clear} disabled={pending}>
                  {t("clear")}
                </Button>
              )}
              <Button size="sm" onClick={save} disabled={pending}>
                {pending ? t("saving") : t("save")}
              </Button>
            </div>
          </div>

          {/* #243 — Nhận tiền TỰ ĐỘNG. Nằm ngay dưới khối số tài khoản vì nó
              đọc đúng cái tài khoản đó: không có tài khoản thì không có mã QR,
              không có mã QR thì không có mã đơn trong nội dung chuyển khoản. */}
          <SePayCard sepay={sepay} hasBank={Boolean(initial.bankBin && initial.accountNo)} />

          {/* #190 — VAT (Model A: giá niêm yết đã gồm VAT). Bật/tắt + mức thuế
              + nút nhanh 8/10%. Đơn không cộng thêm; chi tiết đơn bóc ngược
              hiện "trong đó VAT". */}
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-sm font-medium">{t("vat.title")}</Label>
                <p className="text-[11px] text-muted-foreground">{t("vat.desc")}</p>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={vatEnabled}
                  onChange={(e) => setVatEnabled(e.target.checked)}
                  className="size-4"
                />
                <span className="text-[13px]">{vatEnabled ? t("vat.on") : t("vat.off")}</span>
              </label>
            </div>
            {vatEnabled && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-[12px] text-muted-foreground">{t("vat.rateLabel")}</Label>
                  <Input
                    value={vatRate}
                    onChange={(e) => setVatRate(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
                    inputMode="decimal"
                    className="h-9 w-20 tabular-nums"
                  />
                  <span className="text-[12px] text-muted-foreground">%</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => setVatRate("8")}>
                    8%
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setVatRate("10")}>
                    10%
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">{t("vat.rateHint")}</p>
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" onClick={saveVat} disabled={pending}>
                {pending ? t("saving") : t("save")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

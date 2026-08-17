"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Landmark, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { VN_BANKS } from "@/lib/payments/vn-banks";
import { saveBankInfo } from "./actions";

const OTHER_BANK = "other";

type BankInfo = { bankBin: string | null; accountNo: string | null; accountName: string | null };

const TOAST_KEYS = new Set(["saved", "invalidInput", "bankFieldsPartial", "notAuthenticated", "forbidden", "notFound", "saveFailed"]);
const ERROR_TO_TOAST_KEY: Record<string, string> = {
  invalid_input: "invalidInput",
  bank_fields_partial: "bankFieldsPartial",
  not_authenticated: "notAuthenticated",
  forbidden: "forbidden",
  not_found: "notFound",
};
function toastKeyFor(error: string | null | undefined): string {
  const key = error ? (ERROR_TO_TOAST_KEY[error] ?? "") : "";
  return TOAST_KEYS.has(key) ? key : "saveFailed";
}

export function PaymentsSettingsView({ canManage, initial }: { canManage: boolean; initial: BankInfo }) {
  const t = useTranslations("settings.payments");
  const knownBank = initial.bankBin ? VN_BANKS.some((b) => b.bin === initial.bankBin) : true;

  const [bankSelect, setBankSelect] = useState(
    initial.bankBin ? (knownBank ? initial.bankBin : OTHER_BANK) : (VN_BANKS[0]?.bin ?? ""),
  );
  const [customBin, setCustomBin] = useState(!knownBank && initial.bankBin ? initial.bankBin : "");
  const [accountNo, setAccountNo] = useState(initial.accountNo ?? "");
  const [accountName, setAccountName] = useState(initial.accountName ?? "");
  const [pending, startTransition] = useTransition();

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

  return (
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
    </div>
  );
}

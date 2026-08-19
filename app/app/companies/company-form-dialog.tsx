"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createCompany,
  findDuplicateCompany,
  updateCompany,
  type CompanyDuplicate,
} from "./actions";

export type CompanyFormValues = {
  name: string;
  emailDomain: string;
  taxCode: string;
  /** Cột `companies.phone` có từ #14 và 13 công ty ĐANG có số — nhưng trước
   *  19/08 KHÔNG màn nào nhập hay sửa được, số chỉ vào bằng đường nhập liệu
   *  khác. Đúng bệnh "có dữ liệu, không có đường vào". */
  phone: string;
};

const EMPTY: CompanyFormValues = { name: "", emailDomain: "", taxCode: "", phone: "" };

type FormProps = {
  mode: "create" | "edit";
  companyId?: string;
  initialValues?: CompanyFormValues;
  onDone: () => void;
  onSuccess?: () => void;
};

/** Thân form — nằm trong DialogContent nên tự unmount khi đóng, state tự reset. */
function CompanyForm({
  mode,
  companyId,
  initialValues,
  onDone,
  onSuccess,
}: FormProps) {
  const t = useTranslations("companies.form");
  const tToasts = useTranslations("companies.toasts");
  const tCommon = useTranslations("common");
  const [values, setValues] = useState<CompanyFormValues>(initialValues ?? EMPTY);
  const [pending, startTransition] = useTransition();
  const [duplicate, setDuplicate] = useState<CompanyDuplicate | null>(null);

  const set = (patch: Partial<CompanyFormValues>) =>
    setValues((v) => ({ ...v, ...patch }));

  /*
   * Gợi ý "đã có công ty này rồi" ngay lúc gõ MST / đuôi email — debounce 400ms.
   * Báo TRƯỚC khi bấm Lưu, để người dùng đi thẳng sang công ty đã có thay vì gõ
   * xong cả form mới nhận lỗi trùng MST. Gợi ý không chặn nút Lưu.
   */
  useEffect(() => {
    const taxCode = values.taxCode;
    const emailDomain = values.emailDomain;
    let alive = true;
    const timer = setTimeout(async () => {
      const found =
        taxCode.trim() || emailDomain.trim()
          ? await findDuplicateCompany({ taxCode, emailDomain, excludeId: companyId })
          : null;
      if (alive) setDuplicate(found);
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [values.taxCode, values.emailDomain, companyId]);

  const submit = () => {
    if (pending || !values.name.trim()) return;
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createCompany(values)
          : await updateCompany(companyId as string, values);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(mode === "create" ? tToasts("created") : tToasts("updated"));
      onDone();
      onSuccess?.();
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <label htmlFor="co-name" className="text-[13px] font-medium">
          {t("nameLabel")} <span className="text-destructive">*</span>
        </label>
        <Input
          id="co-name"
          value={values.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={t("namePlaceholder")}
          required
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="co-phone" className="text-[13px] font-medium">
          {t("phoneLabel")}
        </label>
        <Input
          id="co-phone"
          value={values.phone}
          onChange={(e) => set({ phone: e.target.value })}
          placeholder={t("phonePlaceholder")}
          inputMode="tel"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="co-domain" className="text-[13px] font-medium">
          {t("domainLabel")}
        </label>
        <Input
          id="co-domain"
          value={values.emailDomain}
          onChange={(e) => set({ emailDomain: e.target.value })}
          placeholder={t("domainPlaceholder")}
          inputMode="url"
        />
        <p className="text-xs text-muted-foreground">{t("domainHint")}</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="co-tax" className="text-[13px] font-medium">
          {t("taxCodeLabel")}
        </label>
        <Input
          id="co-tax"
          value={values.taxCode}
          onChange={(e) => set({ taxCode: e.target.value })}
          placeholder={t("taxCodePlaceholder")}
          inputMode="numeric"
        />
        <p className="text-xs text-muted-foreground">{t("taxCodeHint")}</p>
      </div>

      {duplicate && (
        // 375px: nút xuống dòng riêng thay vì để chữ chảy vòng quanh nút
        <div className="flex flex-col gap-2 rounded-md bg-status-pending p-2.5 text-status-pending-foreground sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <Building2 aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 text-[13px] leading-relaxed">
              {t(
                duplicate.matchedBy === "tax_code"
                  ? "duplicateTaxCode"
                  : "duplicateDomain",
                { name: duplicate.name },
              )}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            asChild
            className="shrink-0"
          >
            <Link href={`/app/companies/${duplicate.id}`} onClick={onDone}>
              {t("duplicateUse")}
            </Link>
          </Button>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={pending || !values.name.trim()}>
          {tCommon("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

type Props = {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bắt buộc khi mode="edit". */
  companyId?: string;
  initialValues?: CompanyFormValues;
  onSuccess?: () => void;
};

/** Dialog Thêm công ty / Sửa công ty — server action validate, lỗi đã dịch sẵn toast thẳng. */
export function CompanyFormDialog({
  mode,
  open,
  onOpenChange,
  companyId,
  initialValues,
  onSuccess,
}: Props) {
  const t = useTranslations("companies.form");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("createTitle") : t("editTitle")}
          </DialogTitle>
          <DialogDescription>
            {mode === "create" ? t("createDescription") : t("editDescription")}
          </DialogDescription>
        </DialogHeader>
        <CompanyForm
          mode={mode}
          companyId={companyId}
          initialValues={initialValues}
          onDone={() => onOpenChange(false)}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
import { createCompany, updateCompany } from "./actions";

export type CompanyFormValues = {
  name: string;
  emailDomain: string;
  taxCode: string;
};

const EMPTY: CompanyFormValues = { name: "", emailDomain: "", taxCode: "" };

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

  const set = (patch: Partial<CompanyFormValues>) =>
    setValues((v) => ({ ...v, ...patch }));

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

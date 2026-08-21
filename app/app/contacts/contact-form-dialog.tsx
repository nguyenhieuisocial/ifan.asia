"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createContact, updateContact } from "./actions";
import { CompanyPicker } from "./company-picker";
import { ReferrerPicker } from "./referrer-picker";
import type { LeadSource } from "./types";
import type { TenantPackCustomField } from "@/lib/tenant-pack";

export type ContactFormValues = {
  fullName: string;
  phone: string;
  email: string;
  sourceId: string | null;
  companyId: string | null;
  /** Chỉ để hiện tên công ty đang gắn — không gửi lên server. */
  companyName?: string;
  /** Ai giới thiệu khách này tới (#300). */
  referredByContactId?: string | null;
  /** Chỉ để hiện tên người giới thiệu — không gửi lên server. */
  referrerName?: string;
  /** Trường tự khai theo pack ngành (V1a — chỉ lưu + hiện trên hồ sơ). */
  custom?: Record<string, string>;
};

const EMPTY: ContactFormValues = {
  fullName: "",
  phone: "",
  email: "",
  sourceId: null,
  companyId: null,
  referredByContactId: null,
};

type FormProps = {
  mode: "create" | "edit";
  leadSources: LeadSource[];
  contactId?: string;
  initialValues?: ContactFormValues;
  /** Trường tự khai theo pack ngành đang chọn — rỗng/undefined thì không hiện khối nào. */
  customFields?: TenantPackCustomField[];
  onDone: () => void;
  onSuccess?: () => void;
};

/** Phần thân form — nằm trong DialogContent nên tự unmount khi đóng, state tự reset. */
function ContactForm({
  mode,
  leadSources,
  contactId,
  initialValues,
  customFields,
  onDone,
  onSuccess,
}: FormProps) {
  const t = useTranslations("contacts.form");
  const tToasts = useTranslations("contacts.toasts");
  const tCommon = useTranslations("common");
  const [values, setValues] = useState<ContactFormValues>(initialValues ?? EMPTY);
  const [firstNote, setFirstNote] = useState("");
  const [pending, startTransition] = useTransition();

  const set = (patch: Partial<ContactFormValues>) =>
    setValues((v) => ({ ...v, ...patch }));
  const setCustom = (key: string, value: string) =>
    setValues((v) => ({ ...v, custom: { ...v.custom, [key]: value } }));

  const submit = () => {
    if (pending || !values.fullName.trim()) return;
    startTransition(async () => {
      // companyName chỉ phục vụ hiển thị — server action nhận đúng 5 trường + custom
      const input = {
        fullName: values.fullName,
        phone: values.phone,
        email: values.email,
        sourceId: values.sourceId,
        companyId: values.companyId,
        referredByContactId: values.referredByContactId ?? null,
        custom: values.custom,
      };
      const res =
        mode === "create"
          ? await createContact({ ...input, firstNote: firstNote.trim() || undefined })
          : await updateContact(contactId as string, input);
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
        <Label htmlFor="cf-name">
          {t("nameLabel")} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="cf-name"
          value={values.fullName}
          onChange={(e) => set({ fullName: e.target.value })}
          placeholder={t("namePlaceholder")}
          required
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cf-phone">{t("phoneLabel")}</Label>
        <Input
          id="cf-phone"
          value={values.phone}
          onChange={(e) => set({ phone: e.target.value })}
          placeholder={t("phonePlaceholder")}
          inputMode="tel"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cf-email">{t("emailLabel")}</Label>
        <Input
          id="cf-email"
          value={values.email}
          onChange={(e) => set({ email: e.target.value })}
          placeholder={t("emailPlaceholder")}
          type="email"
        />
      </div>
      <div className="space-y-1.5">
        <span className="block text-[13px] font-medium">{t("companyLabel")}</span>
        <CompanyPicker
          value={values.companyId}
          selectedName={values.companyName}
          onChange={(companyId, companyName) => set({ companyId, companyName })}
        />
        <p className="text-xs text-muted-foreground">{t("companyHint")}</p>
      </div>
      <div className="space-y-1.5">
        <span className="block text-[13px] font-medium">{t("referrerLabel")}</span>
        <ReferrerPicker
          value={values.referredByContactId ?? null}
          selectedName={values.referrerName}
          excludeId={contactId ?? null}
          onChange={(referredByContactId, referrerName) => set({ referredByContactId, referrerName })}
        />
        <p className="text-xs text-muted-foreground">{t("referrerHint")}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cf-source">{t("sourceLabel")}</Label>
        <Select
          id="cf-source"
          value={values.sourceId ?? ""}
          onChange={(e) => set({ sourceId: e.target.value || null })}
        >
          <option value="">{t("sourceNone")}</option>
          {leadSources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      {customFields?.map((field) => (
        <div className="space-y-1.5" key={field.key}>
          <Label htmlFor={`cf-custom-${field.key}`}>{field.label}</Label>
          <Input
            id={`cf-custom-${field.key}`}
            value={values.custom?.[field.key] ?? ""}
            onChange={(e) => setCustom(field.key, e.target.value)}
          />
        </div>
      ))}
      {mode === "create" && (
        <div className="space-y-1.5">
          <Label htmlFor="cf-note">{t("noteLabel")}</Label>
          {/* resize-none: hộp thoại không có thanh cuộn riêng — kéo ô cao lên
              sẽ đẩy nút Lưu ra ngoài màn hình, không cuộn xuống lại được */}
          <Textarea
            id="cf-note"
            value={firstNote}
            onChange={(e) => setFirstNote(e.target.value)}
            rows={2}
            placeholder={t("notePlaceholder")}
            className="resize-none"
          />
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={pending || !values.fullName.trim()}>
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
  leadSources: LeadSource[];
  /** Bắt buộc khi mode="edit". */
  contactId?: string;
  initialValues?: ContactFormValues;
  /** Trường tự khai theo pack ngành đang chọn — chưa chọn ngành thì undefined. */
  customFields?: TenantPackCustomField[];
  onSuccess?: () => void;
};

/** Dialog Thêm khách / Sửa khách dùng chung — server action validate, lỗi đã dịch sẵn toast thẳng. */
export function ContactFormDialog({
  mode,
  open,
  onOpenChange,
  leadSources,
  contactId,
  initialValues,
  customFields,
  onSuccess,
}: Props) {
  const t = useTranslations("contacts.form");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("createTitle") : t("editTitle")}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? t("createDescription")
              : t("editDescription")}
          </DialogDescription>
        </DialogHeader>
        <ContactForm
          mode={mode}
          leadSources={leadSources}
          contactId={contactId}
          initialValues={initialValues}
          customFields={customFields}
          onDone={() => onOpenChange(false)}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}

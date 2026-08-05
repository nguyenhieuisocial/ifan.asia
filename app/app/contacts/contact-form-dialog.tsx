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
import type { LeadSource } from "./types";

export type ContactFormValues = {
  fullName: string;
  phone: string;
  email: string;
  sourceId: string | null;
  companyId: string | null;
  /** Chỉ để hiện tên công ty đang gắn — không gửi lên server. */
  companyName?: string;
};

const EMPTY: ContactFormValues = {
  fullName: "",
  phone: "",
  email: "",
  sourceId: null,
  companyId: null,
};

type FormProps = {
  mode: "create" | "edit";
  leadSources: LeadSource[];
  contactId?: string;
  initialValues?: ContactFormValues;
  onDone: () => void;
  onSuccess?: () => void;
};

/** Phần thân form — nằm trong DialogContent nên tự unmount khi đóng, state tự reset. */
function ContactForm({
  mode,
  leadSources,
  contactId,
  initialValues,
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

  const submit = () => {
    if (pending || !values.fullName.trim()) return;
    startTransition(async () => {
      // companyName chỉ phục vụ hiển thị — server action nhận đúng 5 trường
      const input = {
        fullName: values.fullName,
        phone: values.phone,
        email: values.email,
        sourceId: values.sourceId,
        companyId: values.companyId,
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
          onDone={() => onOpenChange(false)}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}

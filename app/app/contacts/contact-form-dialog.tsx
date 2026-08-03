"use client";

import { useState, useTransition } from "react";
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
import { createContact, updateContact } from "./actions";
import type { LeadSource } from "./types";

export type ContactFormValues = {
  fullName: string;
  phone: string;
  email: string;
  sourceId: string | null;
};

const EMPTY: ContactFormValues = {
  fullName: "",
  phone: "",
  email: "",
  sourceId: null,
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
  const [values, setValues] = useState<ContactFormValues>(initialValues ?? EMPTY);
  const [firstNote, setFirstNote] = useState("");
  const [pending, startTransition] = useTransition();

  const set = (patch: Partial<ContactFormValues>) =>
    setValues((v) => ({ ...v, ...patch }));

  const submit = () => {
    if (pending || !values.fullName.trim()) return;
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createContact({ ...values, firstNote: firstNote.trim() || undefined })
          : await updateContact(contactId as string, values);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(mode === "create" ? "Đã thêm khách hàng" : "Đã lưu thay đổi");
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
        <label htmlFor="cf-name" className="text-[13px] font-medium">
          Tên khách <span className="text-destructive">*</span>
        </label>
        <Input
          id="cf-name"
          value={values.fullName}
          onChange={(e) => set({ fullName: e.target.value })}
          placeholder="Nguyễn Thị Hoa"
          required
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="cf-phone" className="text-[13px] font-medium">
          Số điện thoại
        </label>
        <Input
          id="cf-phone"
          value={values.phone}
          onChange={(e) => set({ phone: e.target.value })}
          placeholder="0909…"
          inputMode="tel"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="cf-email" className="text-[13px] font-medium">
          Email
        </label>
        <Input
          id="cf-email"
          value={values.email}
          onChange={(e) => set({ email: e.target.value })}
          placeholder="hoa@example.com"
          type="email"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="cf-source" className="text-[13px] font-medium">
          Nguồn khách
        </label>
        <select
          id="cf-source"
          value={values.sourceId ?? ""}
          onChange={(e) => set({ sourceId: e.target.value || null })}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="">— Chưa rõ nguồn —</option>
          {leadSources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {mode === "create" && (
        <div className="space-y-1.5">
          <label htmlFor="cf-note" className="text-[13px] font-medium">
            Ghi chú đầu tiên (tùy chọn)
          </label>
          <textarea
            id="cf-note"
            value={firstNote}
            onChange={(e) => setFirstNote(e.target.value)}
            rows={2}
            placeholder="VD: khách hỏi liệu trình chăm da, hẹn gọi lại thứ 5…"
            className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Bỏ qua
        </Button>
        <Button type="submit" disabled={pending || !values.fullName.trim()}>
          Lưu
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

/** Dialog Thêm khách / Sửa khách dùng chung — server action validate, lỗi tiếng Việt toast thẳng. */
export function ContactFormDialog({
  mode,
  open,
  onOpenChange,
  leadSources,
  contactId,
  initialValues,
  onSuccess,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Thêm khách hàng" : "Sửa thông tin khách"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Chỉ cần tên là đủ — các thông tin khác bổ sung sau."
              : "Cập nhật thông tin cơ bản của khách."}
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

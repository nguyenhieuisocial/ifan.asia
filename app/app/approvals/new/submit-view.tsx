"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, FileText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FieldInput } from "../../settings/forms/field-input";
import { isEmptyValue, type FieldValue, type FormField } from "../../settings/forms/types";
import { submitForm } from "../actions";

export type PublishedForm = {
  id: string;
  name: string;
  description: string | null;
  fields: FormField[];
  needsApproval: boolean;
};

const TOAST_KEYS = ["not_allowed", "not_found", "not_published"];

export function SubmitView({ forms }: { forms: PublishedForm[] }) {
  const t = useTranslations("approvals.submit");
  const router = useRouter();
  const [formId, setFormId] = useState(forms[0]?.id ?? "");
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [touched, setTouched] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = forms.find((f) => f.id === formId);
  const missing = (form?.fields ?? [])
    .filter((f) => f.required && isEmptyValue(values[f.key]))
    .map((f) => f.key);

  const send = () => {
    if (!form || pending) return;
    setTouched(true);
    if (missing.length > 0) {
      toast.error(t("missingRequired"));
      return;
    }
    const data: Record<string, unknown> = {};
    for (const f of form.fields) {
      const v = values[f.key];
      if (!isEmptyValue(v)) data[f.key] = v;
    }
    startTransition(async () => {
      const res = await submitForm(form.id, data);
      if (res.error) {
        const key = TOAST_KEYS.includes(res.error) ? res.error : "failed";
        toast.error(t(`toasts.${key}`));
        return;
      }
      toast.success(t(res.requestId ? "toasts.sentForApproval" : "toasts.sent"));
      router.push("/app/approvals");
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <Link
          href="/app/approvals"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>

        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
        </div>

        {forms.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <FileText className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-3 text-[13px] text-muted-foreground">{t("noForms")}</p>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="sv-form">{t("pickLabel")}</Label>
              <Select
                id="sv-form"
                value={formId}
                onChange={(e) => {
                  setFormId(e.target.value);
                  setValues({});
                  setTouched(false);
                }}
              >
                {forms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </div>

            {form && (
              <section className="space-y-3 rounded-lg border p-4">
                {form.description && (
                  <p className="text-[13px] text-muted-foreground">{form.description}</p>
                )}
                {form.fields.map((f) => (
                  <FieldInput
                    key={f.key}
                    field={f}
                    idPrefix="sv"
                    value={values[f.key]}
                    invalid={touched && missing.includes(f.key)}
                    onChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))}
                  />
                ))}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button onClick={send} disabled={pending}>
                    <Send className="size-4" />
                    {t("send")}
                  </Button>
                  <span className="text-[13px] text-muted-foreground">
                    {form.needsApproval ? t("needsApproval") : t("noApproval")}
                  </span>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

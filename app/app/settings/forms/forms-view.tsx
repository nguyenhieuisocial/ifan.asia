"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileText, Lock, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatVN } from "@/lib/datetime";
import { createForm } from "./actions";
import type { FormRow } from "./types";

export function FormsView({
  canManage,
  forms,
}: {
  canManage: boolean;
  forms: FormRow[];
}) {
  const t = useTranslations("forms");
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  const add = () => {
    const clean = name.trim();
    if (!clean || pending) return;
    startTransition(async () => {
      const res = await createForm(clean);
      if (res.error || !res.formId) {
        toast.error(t(`toasts.${res.error === "forbidden" ? "forbidden" : "failed"}`));
        return;
      }
      setName("");
      router.push(`/app/settings/forms/${res.formId}`);
    });
  };

  if (!canManage) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl p-6">
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Lock className="mx-auto size-5 text-muted-foreground" />
            <h1 className="mt-3 text-[15px] font-semibold">{t("noPermission.title")}</h1>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted-foreground">
              {t("noPermission.description")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">{t("list.title")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("list.description")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={t("list.namePlaceholder")}
            maxLength={120}
            className="h-9 min-w-0 flex-1"
          />
          <Button size="sm" onClick={add} disabled={pending || name.trim() === ""}>
            <Plus className="size-4" />
            {t("list.create")}
          </Button>
        </div>

        {forms.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <FileText className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-3 text-[13px] text-muted-foreground">{t("list.empty")}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {forms.map((f) => (
              <li key={f.id} className="rounded-lg border">
                <Link
                  href={`/app/settings/forms/${f.id}`}
                  className="flex flex-wrap items-start gap-x-3 gap-y-2 p-3 transition-colors hover:bg-foreground/[0.03]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium">{f.name}</p>
                      <Badge variant={f.status === "published" ? "secondary" : "outline"}>
                        {t(`status.${f.status}`)}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      {t("list.fieldCount", { n: f.fields.length })}
                      {" · "}
                      {f.approvalLevels.length === 0
                        ? t("list.noApproval")
                        : t("list.levelCount", { n: f.approvalLevels.length })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/80">
                      {f.submissionCount > 0
                        ? t("list.submissions", { n: f.submissionCount })
                        : t("list.noSubmissions")}
                      {" · "}
                      {t("list.updated", { time: formatVN(f.updatedAt) })}
                    </p>
                  </div>
                  <span className="shrink-0 text-[13px] font-medium text-muted-foreground">
                    {t("list.edit")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="rounded-lg border border-dashed px-3 py-2.5 text-[13px] text-muted-foreground">
          {t("list.hint")}
        </p>
      </div>
    </div>
  );
}

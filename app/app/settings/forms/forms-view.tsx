"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileText, Lock, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/lib/format";
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
  const locale = useLocale() as Locale;
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

        {/* 375px: nút "Tạo biểu mẫu" không co, ép ô nhập tên còn ~135px nên câu
            gợi ý bị cắt cụt. Xếp dọc trên điện thoại. */}
        <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:flex-wrap sm:items-center">
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
                  className="flex flex-wrap items-start gap-x-3 gap-y-2 px-3 pt-3 transition-colors hover:bg-foreground/[0.03]"
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
                  </div>
                  <span className="shrink-0 text-[13px] font-medium text-muted-foreground">
                    {t("list.edit")}
                  </span>
                </Link>
                {/* Dòng phiếu nằm NGOÀI Link sửa biểu mẫu (không lồng <a> trong <a>):
                    "n phiếu đã gửi" bấm được → màn Duyệt, tab "Yêu cầu của tôi". */}
                <p className="px-3 pt-1 pb-3 text-xs text-muted-foreground">
                  {f.submissionCount > 0 ? (
                    <Link
                      href="/app/approvals?tab=mine"
                      className="underline-offset-2 hover:text-foreground hover:underline"
                    >
                      {t("list.submissions", { n: f.submissionCount })}
                    </Link>
                  ) : (
                    t("list.noSubmissions")
                  )}
                  {" · "}
                  {t("list.updated", { time: formatDateTime(f.updatedAt, locale) })}
                </p>
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

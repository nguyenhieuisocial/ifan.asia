"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Building2,
  ExternalLink,
  Handshake,
  Pencil,
  Trash2,
  Users,
} from "lucide-react";
import { BackButton } from "@/components/back-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { ScoreBadge } from "../../contacts/score-badge";
import { STAGE_KIND_BADGE } from "../../deals/types";
import { softDeleteCompany } from "../actions";
import { CompanyFormDialog } from "../company-form-dialog";
import {
  formatTaxCode,
  type CompanyContactRow,
  type CompanyDealRow,
  type CompanyDetailRow,
  type CompanyStats,
} from "../types";

/** Field panel phải: label 12 muted trên / value 14 dưới (chuẩn hồ sơ 360). */
function InfoField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm">{children}</p>
    </div>
  );
}

type Props = {
  company: CompanyDetailRow;
  stats: CompanyStats;
  contacts: CompanyContactRow[];
  deals: CompanyDealRow[];
};

export function CompanyDetail({ company, stats, contacts, deals }: Props) {
  const t = useTranslations("companies");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, startDelete] = useTransition();

  const confirmDelete = () => {
    startDelete(async () => {
      const res = await softDeleteCompany(company.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("toasts.deleted"));
      router.push("/app/companies");
    });
  };

  const taxCode = formatTaxCode(company.tax_code);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-28 shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3">
        {/* Lùi về màn VỪA ĐỨNG (danh sách/hồ sơ khách…), không ép về danh sách */}
        <BackButton fallbackHref="/app/companies" ariaLabel={t("detail.backAria")} />
        <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Building2 className="size-7 text-muted-foreground" />
        </span>
        {/* min-w-40: ở 375px buộc cụm nút xuống dòng riêng thay vì bóp nát tên công ty */}
        <div className="min-w-40 flex-1">
          <p className="truncate text-xl font-semibold">{company.name}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {company.email_domain ? (
              <a
                href={`https://${company.email_domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                @{company.email_domain}
                <ExternalLink className="size-3" />
              </a>
            ) : (
              <span>{t("detail.noDomain")}</span>
            )}
            <span aria-hidden>·</span>
            <span>
              {taxCode
                ? t("detail.taxCodeValue", { code: taxCode })
                : t("detail.noTaxCode")}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            {t("detail.edit")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
            {t("detail.delete")}
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Users className="size-4 text-muted-foreground" />
                  {t("detail.contacts")}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4">
                {contacts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("detail.contactsEmpty")}
                  </p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {contacts.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/app/contacts/${c.id}`}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {c.full_name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {c.email ?? c.phone ?? tCommon("notSet")}
                            </span>
                          </span>
                          <ScoreBadge score={c.lead_score} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Handshake className="size-4 text-muted-foreground" />
                  <Link href="/app/deals" className="hover:underline">
                    {t("detail.deals")}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-4">
                {deals.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("detail.dealsEmpty")}
                  </p>
                ) : (
                  deals.map((d) => (
                    <Link
                      key={d.id}
                      href={`/app/deals/${d.id}`}
                      className="block space-y-1 rounded-md border p-2 transition-colors hover:bg-accent"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-[13px] leading-snug font-medium break-words">
                          {d.title}
                        </span>
                        <Badge
                          className={cn(
                            "shrink-0 font-semibold",
                            STAGE_KIND_BADGE[d.pipeline_stages?.kind ?? "open"],
                          )}
                        >
                          {d.pipeline_stages?.name ?? "—"}
                        </Badge>
                      </div>
                      <span className="text-[13px] font-semibold">
                        {formatMoney(d.value_vnd, locale)}
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-sm">{t("detail.numbers")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-4">
                <InfoField label={t("table.contacts")}>
                  {stats.contact_count}
                </InfoField>
                <InfoField label={t("table.openDeals")}>
                  {stats.open_deal_count}
                </InfoField>
                <InfoField label={t("table.wonValue")}>
                  <span className="font-semibold">
                    {formatMoney(stats.won_value_vnd, locale)}
                  </span>
                </InfoField>
              </CardContent>
            </Card>

            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-sm">{t("detail.info")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-4">
                <InfoField label={t("form.domainLabel")}>
                  {company.email_domain ?? (
                    <span className="text-muted-foreground">{tCommon("notSet")}</span>
                  )}
                </InfoField>
                <InfoField label={t("form.taxCodeLabel")}>
                  {taxCode ?? (
                    <span className="text-muted-foreground">{tCommon("notSet")}</span>
                  )}
                </InfoField>
                <InfoField label={t("detail.phone")}>
                  {company.phone ? (
                    <a
                      href={`tel:${company.phone}`}
                      className="text-primary hover:underline"
                    >
                      {company.phone}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">{tCommon("notSet")}</span>
                  )}
                </InfoField>
                <InfoField label={t("detail.createdAt")}>
                  {formatDate(company.created_at, locale)}
                </InfoField>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <CompanyFormDialog
        mode="edit"
        open={editOpen}
        onOpenChange={setEditOpen}
        companyId={company.id}
        initialValues={{
          name: company.name,
          emailDomain: company.email_domain ?? "",
          taxCode: company.tax_code ?? "",
        }}
        onSuccess={() => router.refresh()}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("detail.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("detail.deleteDescription", { name: company.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? t("detail.deleting") : t("detail.deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

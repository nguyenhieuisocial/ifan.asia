"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  Handshake,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { BackButton } from "@/components/back-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import type { TenantPackCustomField } from "@/lib/tenant-pack";
import {
  createCompanyFromContactDomain,
  linkContactCompany,
} from "../../companies/actions";
import {
  DealFormDialog,
  tomorrowVN,
} from "../../deals/deal-form-dialog";
import {
  needsNextAction,
  STAGE_KIND_BADGE,
  type ContactDealRow,
  type MemberOption,
  type PipelineStage,
} from "../../deals/types";
import {
  addTagToContact,
  removeTagFromContact,
  softDeleteContact,
} from "../actions";
import { ContactFormDialog } from "../contact-form-dialog";
import { ScoreBadge } from "../score-badge";
import {
  ownerLabel,
  tierReason,
  TIER_BADGE,
  type ActivityRow,
  type ContactDetailRow,
  type ConversationLite,
  type LeadSource,
  type MemberNames,
} from "../types";
import { InternalChat } from "@/components/internal-chat/internal-chat";
import { AuditHistory } from "./audit-history";
import { PendingTasks } from "./pending-tasks";
import { LoyaltyWallet, type LoyaltyWalletData } from "./loyalty-wallet";
import { Timeline, type TimelineApi } from "./timeline";

/** Quản lý thẻ: thêm bằng input + Enter (upsert theo tên), gỡ bằng nút X. */
function TagsCard({ contact }: { contact: ContactDetailRow }) {
  const t = useTranslations("contacts.tags");
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  const tags = contact.contact_tags
    .map((ct) => ct.tags)
    .filter((tag): tag is NonNullable<typeof tag> => tag !== null);

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    startTransition(async () => {
      const res = await addTagToContact(contact.id, trimmed);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setName("");
    });
  };

  const remove = (tagId: string) => {
    startTransition(async () => {
      const res = await removeTagFromContact(contact.id, tagId);
      if (res.error) toast.error(res.error);
    });
  };

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Tag className="size-4 text-muted-foreground" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge key={tag.id} variant="secondary" className="gap-1 pr-1">
                {tag.name}
                <button
                  type="button"
                  aria-label={t("removeAria", { name: tag.name })}
                  onClick={() => remove(tag.id)}
                  disabled={pending}
                  className="relative rounded-full p-0.5 opacity-60 transition-opacity after:absolute after:-inset-3 hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={t("placeholder")}
          disabled={pending}
          className="h-10 text-sm"
        />
      </CardContent>
    </Card>
  );
}

/** Card Cơ hội trong hồ sơ 360: list mini (giai đoạn + giá trị) + nút tạo. */
function DealsCard({
  deals,
  locale,
  onCreate,
  canWrite,
  dealLimit,
}: {
  deals: ContactDealRow[];
  locale: Locale;
  onCreate: () => void;
  /** Khớp RLS deals_insert — mọi vai TRỪ viewer. */
  canWrite: boolean;
  /** Trần danh sách cơ hội — page.tsx truyền xuống (queries.ts là code server). */
  dealLimit: number;
}) {
  const t = useTranslations("contacts.deals");
  const tDetail = useTranslations("contacts.detail");
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Handshake className="size-4 text-muted-foreground" />
          <Link href="/app/deals" className="hover:underline">
            {t("title")}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4">
        {deals.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("empty")}</p>
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
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[13px] font-semibold">
                  {formatMoney(d.value_vnd, locale)}
                </span>
                {needsNextAction(d) && (
                  <Badge className="gap-1 bg-destructive/10 text-destructive">
                    <AlertTriangle className="size-3" />
                    {t("needsNextAction")}
                  </Badge>
                )}
              </div>
            </Link>
          ))
        )}
        {/* Chạm trần thì NÓI RA — không để người dùng tưởng đây là tất cả. */}
        {deals.length >= dealLimit && (
          <p className="text-[12px] text-muted-foreground">
            {tDetail("dealsLimitNote", { limit: dealLimit })}
          </p>
        )}
        {canWrite && (
          <Button variant="outline" size="sm" className="w-full" onClick={onCreate}>
            <Plus className="size-4" />
            {t("create")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Gợi ý nối công ty theo đuôi email công việc — chỉ hiện khi khách CHƯA có công ty.
 * Hệ thống không bao giờ tự tạo công ty: có sẵn thì mời nối, chưa có thì mời tạo.
 */
function CompanySuggestion({
  contactId,
  suggestion,
}: {
  contactId: string;
  suggestion: CompanySuggestionData;
}) {
  const t = useTranslations("contacts.detail.companySuggestion");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (action: () => Promise<{ error: string | null }>) =>
    startTransition(async () => {
      const res = await action();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("done"));
      router.refresh();
    });

  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/[0.04] p-3">
      <p className="text-xs leading-relaxed">
        {suggestion.company
          ? t("linkPrompt", {
              domain: suggestion.domain,
              name: suggestion.company.name,
            })
          : t("createPrompt", { domain: suggestion.domain })}
      </p>
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        disabled={pending}
        onClick={() =>
          run(() =>
            suggestion.company
              ? linkContactCompany(contactId, suggestion.company.id)
              : createCompanyFromContactDomain(contactId),
          )
        }
      >
        <Building2 className="size-4" />
        {suggestion.company ? t("linkAction") : t("createAction")}
      </Button>
    </div>
  );
}

/** Field panel phải: label 12 muted trên / value 14 dưới. */
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

/** Đuôi email công việc của khách + công ty khớp (nếu tenant đã có) — tính ở server. */
export type CompanySuggestionData = {
  domain: string;
  company: { id: string; name: string } | null;
};

/**
 * Nội dung tab "Tổng quan": layout 2 cột y hệt bố cục hồ sơ khách trước khi
 * có tab Lịch sử — tách riêng để dùng lại được ở cả nhánh có/không có Tabs
 * (staff/viewer không có quyền xem lịch sử phải thấy đúng layout này, không bọc Tabs).
 */
function ContactOverview({
  contact,
  activities,
  conversations,
  timelineApi,
  companySuggestion,
  customFields,
  deals,
  dealLimit,
  locale,
  onCreateDeal,
  canWrite,
  loyaltyWallet,
}: {
  contact: ContactDetailRow;
  activities: ActivityRow[];
  conversations: ConversationLite[];
  timelineApi: React.MutableRefObject<TimelineApi | null>;
  companySuggestion: CompanySuggestionData | null;
  customFields?: TenantPackCustomField[];
  deals: ContactDealRow[];
  dealLimit: number;
  locale: Locale;
  onCreateDeal: () => void;
  /** Khớp RLS deals_insert/activities_insert — mọi vai TRỪ viewer. */
  canWrite: boolean;
  /** Ví điểm — null khi tiệm chưa bật tích điểm (V6 retention). */
  loyaltyWallet: LoyaltyWalletData | null;
}) {
  const t = useTranslations("contacts");
  const tWhy = useTranslations("contacts.tierWhy");
  const tCommon = useTranslations("common");
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Việc đang chờ ghim ĐẦU cột dòng thời gian — thông báo quá hạn nhảy thẳng vào đây (B15) */}
      <div className="min-w-0 space-y-4">
        <PendingTasks activities={activities} canWrite={canWrite} />
        {/* Trao đổi nội bộ (thẻ man-chat-noi-bo, migration #169) — bảng RIÊNG,
            KHÔNG dính gì tới dòng thời gian hội thoại với khách bên dưới. */}
        <InternalChat entityType="contact" entityId={contact.id} defaultOpen={false} />
        <Timeline
          contactId={contact.id}
          activities={activities}
          conversations={conversations}
          apiRef={timelineApi}
          canWrite={canWrite}
        />
      </div>

      <div className="space-y-4">
        <LoyaltyWallet data={loyaltyWallet} />
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">{t("detail.info")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4">
            <InfoField label={t("detail.phone")}>
              {contact.phone ? (
                <a
                  href={`tel:${contact.phone}`}
                  className="text-primary hover:underline"
                >
                  {contact.phone}
                </a>
              ) : (
                <span className="text-muted-foreground">
                  {tCommon("notSet")}
                </span>
              )}
            </InfoField>
            <InfoField label={t("detail.email")}>
              {contact.email ?? (
                <span className="text-muted-foreground">
                  {tCommon("notSet")}
                </span>
              )}
            </InfoField>
            <InfoField label={t("detail.company")}>
              {contact.companies ? (
                <Link
                  href={`/app/companies/${contact.companies.id}`}
                  className="text-primary hover:underline"
                >
                  {contact.companies.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">
                  {tCommon("notSet")}
                </span>
              )}
            </InfoField>
            {companySuggestion && (
              <CompanySuggestion
                contactId={contact.id}
                suggestion={companySuggestion}
              />
            )}
            <InfoField label={t("detail.customerSince")}>
              {formatDate(contact.created_at, locale)}
            </InfoField>
            {/* Số tiền quyết định hạng VIP — để ngay đây cho khỏi phải đoán */}
            <InfoField label={tWhy("revenueLabel")}>
              {formatMoney(contact.total_revenue, locale)}
            </InfoField>
            {customFields?.map((field) => {
              const value = contact.custom?.[field.key];
              if (!value) return null;
              return (
                <InfoField key={field.key} label={field.label}>
                  {value}
                </InfoField>
              );
            })}
          </CardContent>
        </Card>
        <DealsCard
          deals={deals}
          dealLimit={dealLimit}
          locale={locale}
          onCreate={onCreateDeal}
          canWrite={canWrite}
        />
        <TagsCard contact={contact} />
      </div>
    </div>
  );
}

type Props = {
  currentUserId: string;
  memberNames: MemberNames;
  contact: ContactDetailRow;
  activities: ActivityRow[];
  conversations: ConversationLite[];
  leadSources: LeadSource[];
  deals: ContactDealRow[];
  /** Trần danh sách cơ hội của khách — page.tsx truyền xuống (queries.ts là code
   *  server, client component không được import thẳng). Chạm trần thì NÓI RA. */
  dealLimit: number;
  openStages: PipelineStage[];
  members: MemberOption[];
  canAssignOthers: boolean;
  /** null khi khách đã có công ty hoặc email không phải email công việc. */
  companySuggestion: CompanySuggestionData | null;
  /** Số lần khách đã mua (deal thắng) — để giải thích hạng đang hiển thị. */
  wonDeals: number;
  /** Số ngày im lặng, tính ở server (render phải thuần, không gọi Date.now()). */
  silentDays: number;
  /** Trường tự khai theo pack ngành (V1a — chỉ lưu + hiện trên hồ sơ, mục 35.2 bước 4). */
  customFields?: TenantPackCustomField[];
  /** Chỉ owner/admin thấy tab Lịch sử — vai khác thấy hệt màn hiện tại, không có tab nào. */
  canViewHistory: boolean;
  /** Khớp RLS contacts_update/contacts_delete/activities_insert/deals_insert
   *  (migration #65 viewer_role_fix): mọi vai TRỪ viewer — gate nút Sửa/Xoá hồ
   *  sơ, Tạo cơ hội, Ghi việc mới/thêm ghi chú (việc #163/#165, cùng lớp lỗi đã
   *  vá ở deals-board.tsx). PHẠM VI CỐ Ý HẸP: chỉ chặn viewer, không đụng sắc
   *  thái sở hữu riêng của staff. */
  canWrite: boolean;
  /** Ví điểm của khách — null khi tiệm chưa bật tích điểm (V6 retention). */
  loyaltyWallet: LoyaltyWalletData | null;
};

export function ContactDetail({
  currentUserId,
  memberNames,
  contact,
  activities,
  conversations,
  leadSources,
  deals,
  dealLimit,
  openStages,
  members,
  canAssignOthers,
  companySuggestion,
  wonDeals,
  silentDays,
  customFields,
  canViewHistory,
  canWrite,
  loyaltyWallet,
}: Props) {
  const t = useTranslations("contacts");
  const tWhy = useTranslations("contacts.tierWhy");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timelineApi = useRef<TimelineApi | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [createDealOpen, setCreateDealOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, startDelete] = useTransition();
  // Bookmark "?tab=history" mở đúng tab đó khi vào lại — chỉ áp dụng khi có quyền xem.
  const [tab, setTab] = useState<"overview" | "history">(() =>
    canViewHistory && searchParams.get("tab") === "history" ? "history" : "overview",
  );

  const handleTabChange = (value: string) => {
    const next = value === "history" ? "history" : "overview";
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "history") params.set("tab", "history");
    else params.delete("tab");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Hạng do máy xếp (migration #19) — hiển thị kèm LÝ DO, không sửa tay được
  const reason = tierReason(contact.tier, wonDeals, silentDays, tWhy);

  const confirmDelete = () => {
    startDelete(async () => {
      const res = await softDeleteContact(contact.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("toasts.deleted"));
      router.push("/app/contacts");
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-28 shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3">
        {/* Lùi về màn VỪA ĐỨNG (Tổng quan/Hộp thư/Cơ hội…), không ép về danh sách */}
        <BackButton fallbackHref="/app/contacts" ariaLabel={t("detail.backAria")} />
        <Avatar className="size-14">
          <AvatarFallback className="text-lg">
            {(contact.full_name[0] ?? "?").toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate text-xl font-semibold">
              {contact.full_name}
            </span>
            <Badge className={cn("font-semibold", TIER_BADGE[contact.tier])}>
              {t(`tier.${contact.tier}`)}
            </Badge>
            <ScoreBadge score={contact.lead_score} />
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {contact.lead_sources?.name ?? t("detail.unknownSource")}
            {" · "}
            {t("detail.owner", {
              owner: ownerLabel(contact.owner_id, currentUserId, t, memberNames),
            })}
          </p>
          {/* Máy xếp hạng thì phải nói được lý do — nhất là hạng Nguội */}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {tWhy("prefix", { tier: t(`tier.${contact.tier}`), reason })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {contact.phone ? (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${contact.phone}`}>
                <Phone className="size-4" />
                {t("detail.call")}
              </a>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <Phone className="size-4" />
              {t("detail.call")}
            </Button>
          )}
          <Button variant="outline" size="sm" disabled>
            {t("detail.zaloSoon")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/app/orders/new?contactId=${contact.id}`)}
          >
            <Receipt className="size-4" />
            {t("detail.createOrder")}
          </Button>
          {canWrite && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => timelineApi.current?.openTask()}
            >
              {t("detail.addTask")}
            </Button>
          )}
          {canWrite && (
            <Button
              variant="outline"
              size="sm"
              disabled={openStages.length === 0}
              onClick={() => setCreateDealOpen(true)}
            >
              <Handshake className="size-4" />
              {t("deals.create")}
            </Button>
          )}
          {canWrite && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              {t("detail.edit")}
            </Button>
          )}
          {canWrite && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              {t("detail.delete")}
            </Button>
          )}
        </div>
      </header>

      {canViewHistory ? (
        <Tabs
          value={tab}
          onValueChange={handleTabChange}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="shrink-0 border-b px-4">
            <TabsList variant="line" className="h-10">
              <TabsTrigger value="overview">{t("history.overviewTab")}</TabsTrigger>
              <TabsTrigger value="history">{t("history.tab")}</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="overview" className="min-h-0 flex-1 overflow-y-auto">
            <ContactOverview
              loyaltyWallet={loyaltyWallet}
              contact={contact}
              activities={activities}
              conversations={conversations}
              timelineApi={timelineApi}
              companySuggestion={companySuggestion}
              customFields={customFields}
              deals={deals}
              dealLimit={dealLimit}
              locale={locale}
              onCreateDeal={() => setCreateDealOpen(true)}
              canWrite={canWrite}
            />
          </TabsContent>
          <TabsContent value="history" className="min-h-0 flex-1 overflow-y-auto">
            <AuditHistory contactId={contact.id} />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ContactOverview
              loyaltyWallet={loyaltyWallet}
            contact={contact}
            activities={activities}
            conversations={conversations}
            timelineApi={timelineApi}
            companySuggestion={companySuggestion}
            customFields={customFields}
            deals={deals}
            dealLimit={dealLimit}
            locale={locale}
            onCreateDeal={() => setCreateDealOpen(true)}
            canWrite={canWrite}
          />
        </div>
      )}

      <ContactFormDialog
        mode="edit"
        open={editOpen}
        onOpenChange={setEditOpen}
        leadSources={leadSources}
        contactId={contact.id}
        initialValues={{
          fullName: contact.full_name,
          phone: contact.phone ?? "",
          email: contact.email ?? "",
          sourceId: contact.source_id,
          companyId: contact.company_id,
          companyName: contact.companies?.name,
          custom: contact.custom ?? undefined,
        }}
        customFields={customFields}
      />

      {createDealOpen && (
        <DealFormDialog
          mode="create"
          open={createDealOpen}
          onOpenChange={setCreateDealOpen}
          initialValues={{
            title: "",
            contactId: contact.id,
            value: "",
            expectedCloseDate: "",
            stageId: openStages[0]?.id ?? "",
            ownerId: contact.owner_id ?? currentUserId,
            nextActionDate: tomorrowVN(),
            nextActionNote: "",
          }}
          openStages={openStages}
          members={members}
          canAssignOthers={canAssignOthers}
          lockedContactName={contact.full_name}
          onSuccess={() => router.refresh()}
        />
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("detail.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("detail.deleteDescription", { name: contact.full_name })}
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

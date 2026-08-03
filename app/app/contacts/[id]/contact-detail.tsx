"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Phone, Tag, Trash2, X } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import {
  addTagToContact,
  removeTagFromContact,
  softDeleteContact,
  updateContactTier,
} from "../actions";
import { ContactFormDialog } from "../contact-form-dialog";
import {
  ownerLabel,
  TIER_BADGE,
  type ActivityRow,
  type ContactDetailRow,
  type ConversationLite,
  type LeadSource,
  type Tier,
} from "../types";
import { Timeline, type TimelineApi } from "./timeline";

const TIERS = Object.keys(TIER_BADGE) as Tier[];

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

type Props = {
  currentUserId: string;
  contact: ContactDetailRow;
  activities: ActivityRow[];
  conversations: ConversationLite[];
  leadSources: LeadSource[];
};

export function ContactDetail({
  currentUserId,
  contact,
  activities,
  conversations,
  leadSources,
}: Props) {
  const t = useTranslations("contacts");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const timelineApi = useRef<TimelineApi | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, startDelete] = useTransition();
  // Optimistic: đổi hạng hiện ngay, lỗi thì hoàn lại
  const [tier, setTier] = useState<Tier>(contact.tier);
  const [tierPending, startTier] = useTransition();

  const changeTier = (next: Tier) => {
    if (next === tier || tierPending) return;
    const prev = tier;
    setTier(next);
    startTier(async () => {
      const res = await updateContactTier(contact.id, next);
      if (res.error) {
        setTier(prev);
        toast.error(res.error);
        return;
      }
      toast.success(t("toasts.updated"));
    });
  };

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
        <Button asChild variant="ghost" size="icon" aria-label={t("detail.backAria")}>
          <Link href="/app/contacts">
            <ArrowLeft />
          </Link>
        </Button>
        <Avatar className="size-14">
          <AvatarFallback className="text-lg">
            {(contact.full_name[0] ?? "?").toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="truncate text-xl font-semibold">
              {contact.full_name}
            </span>
            <Badge className={cn("font-semibold", TIER_BADGE[tier])}>
              {t(`tier.${tier}`)}
            </Badge>
            <select
              aria-label={t("detail.tierLabel")}
              value={tier}
              disabled={tierPending}
              onChange={(e) => changeTier(e.target.value as Tier)}
              className="h-10 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {TIERS.map((value) => (
                <option key={value} value={value}>
                  {t(`tier.${value}`)}
                </option>
              ))}
            </select>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {contact.lead_sources?.name ?? t("detail.unknownSource")}
            {" · "}
            {t("detail.owner", {
              owner: ownerLabel(contact.owner_id, currentUserId, t),
            })}
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
            onClick={() => timelineApi.current?.openTask()}
          >
            {t("detail.addTask")}
          </Button>
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
          <Timeline
            contactId={contact.id}
            activities={activities}
            conversations={conversations}
            apiRef={timelineApi}
          />

          <div className="space-y-4">
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
                  {contact.companies?.name ?? (
                    <span className="text-muted-foreground">
                      {tCommon("notSet")}
                    </span>
                  )}
                </InfoField>
                <InfoField label={t("detail.customerSince")}>
                  {formatDate(contact.created_at, locale)}
                </InfoField>
              </CardContent>
            </Card>
            <TagsCard contact={contact} />
          </div>
        </div>
      </div>

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
        }}
      />

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

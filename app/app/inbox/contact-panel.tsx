"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Calendar,
  ExternalLink,
  Handshake,
  Mail,
  Phone,
  SquareCheckBig,
  UserPlus,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { seedLabel } from "@/lib/seed-i18n";
import { createClient } from "@/lib/supabase/client";
import type { Locale } from "@/i18n/config";
import { addActivity } from "../contacts/actions";
import { ScoreBadge } from "../contacts/score-badge";
import { TIER_BADGE } from "../contacts/types";
import { DealFormDialog, tomorrowVN } from "../deals/deal-form-dialog";
import {
  ensureDealDefaults,
  fetchContactDeals,
  fetchOpenStages,
} from "../deals/queries";
import { buildMemberOptions, STAGE_KIND_BADGE } from "../deals/types";
import { createAndLinkContact } from "./actions";
import { BookAppointmentDialog } from "./book-appointment-dialog";
import { conversationName, type ConversationRow, type Member, type MemberNames } from "./types";

/** Vai được gán cơ hội cho người khác — khớp fetchDealPermissions (deals/queries.ts). */
const DEAL_MANAGE_ROLES = ["owner", "admin", "manager"];

/**
 * Dialog "Thêm việc" ngay trong Hộp thư — cùng server action addActivity với
 * composer ở hồ sơ 360, chỉ gói lại thành dialog để không phải rời màn chat.
 */
function AddTaskDialog({
  contactId,
  open,
  onOpenChange,
}: {
  contactId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tDetail = useTranslations("contacts.detail");
  const tTimeline = useTranslations("contacts.timeline");
  const tToasts = useTranslations("contacts.toasts");
  const tCommon = useTranslations("common");
  const [content, setContent] = useState("");
  // Mặc định hạn = 9h sáng mai (giờ VN) — cùng tinh thần "việc kế tiếp" của form
  // cơ hội: gõ nội dung xong là Lưu được ngay, muốn hạn khác thì sửa.
  const [dueAt, setDueAt] = useState(() => `${tomorrowVN()}T09:00`);
  const [pending, startTransition] = useTransition();

  const canSubmit = content.trim() !== "" && dueAt !== "" && !pending;

  const submit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await addActivity(contactId, {
        type: "task",
        content: content.trim(),
        // datetime-local trả giờ địa phương → chuyển ISO trước khi gửi
        dueAt: new Date(dueAt).toISOString(),
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(tToasts("activityLogged"));
      setContent("");
      setDueAt(`${tomorrowVN()}T09:00`);
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{tDetail("addTask")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={2}
            placeholder={tTimeline("taskPlaceholder")}
            className="resize-none"
            autoFocus
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {tTimeline("dueLabel")}
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContactCard({
  conversationId,
  contact,
  currentUserId,
  members,
  memberNames,
}: {
  conversationId: string;
  contact: NonNullable<ConversationRow["contacts"]>;
  currentUserId: string;
  members: Member[];
  memberNames: MemberNames;
}) {
  const t = useTranslations("inbox.contactPanel");
  const tContacts = useTranslations("contacts");
  const tOwner = useTranslations("contacts.owner");
  const tSeed = useTranslations("seed");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [dealOpen, setDealOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);

  const tags = contact.contact_tags
    .map((ct) => ct.tags)
    .filter((t): t is NonNullable<typeof t> => t !== null);

  // Cơ hội của khách — cùng fetcher với hồ sơ 360, panel chỉ bày cơ hội ĐANG MỞ.
  const dealsQuery = useQuery({
    queryKey: ["contact-open-deals", contact.id],
    queryFn: () => fetchContactDeals(supabase, contact.id),
  });
  const openDeals = (dealsQuery.data ?? []).filter((d) => d.status === "open");

  // Các cột MỞ cho form tạo cơ hội. ensureDealDefaults trước (idempotent) để
  // tiệm chưa từng mở màn Cơ hội vẫn tạo được từ Hộp thư. Cache 5 phút — đổi
  // hội thoại không hỏi lại CSDL.
  const stagesQuery = useQuery({
    queryKey: ["inbox-open-stages"],
    queryFn: async () => {
      await ensureDealDefaults(supabase);
      return fetchOpenStages(supabase);
    },
    staleTime: 5 * 60_000,
  });
  // Tên bước CÀI SẴN dịch được (migration #36) — đọc giống hệt bảng Cơ hội
  const openStages = (stagesQuery.data ?? []).map((s) => ({
    ...s,
    name: seedLabel(s.i18n_key, s.name, tSeed),
  }));

  const canAssignOthers = DEAL_MANAGE_ROLES.includes(
    members.find((m) => m.user_id === currentUserId)?.role ?? "",
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar className="size-12">
          <AvatarFallback className="text-lg">
            {(contact.full_name[0] ?? "?").toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="min-w-0 truncate text-sm font-semibold">
            {contact.full_name}
          </p>
          {/* Hạng + điểm do máy xếp — cùng badge với danh sách khách/hồ sơ 360 */}
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge className={cn("font-semibold", TIER_BADGE[contact.tier])}>
              {tContacts(`tier.${contact.tier}`)}
            </Badge>
            <ScoreBadge score={contact.lead_score} />
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="size-3.5 shrink-0" />
            {t("phone")}
          </p>
          <p className="mt-0.5 text-sm">
            {contact.phone ?? (
              <span className="text-muted-foreground">{tCommon("notSet")}</span>
            )}
          </p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="size-3.5 shrink-0" />
            {t("email")}
          </p>
          <p className="mt-0.5 text-sm">
            {contact.email ?? (
              <span className="text-muted-foreground">{tCommon("notSet")}</span>
            )}
          </p>
        </div>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Badge key={t.id} variant="secondary">
              {t.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Cơ hội đang mở — card mini như hồ sơ 360, bấm vào là sang deal 360 */}
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Handshake className="size-3.5 shrink-0" />
          {t("openDeals")}
        </p>
        {dealsQuery.isPending ? null : openDeals.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("openDealsEmpty")}</p>
        ) : (
          openDeals.map((d) => (
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
                  {seedLabel(
                    d.pipeline_stages?.i18n_key,
                    d.pipeline_stages?.name,
                    tSeed,
                  ) || "—"}
                </Badge>
              </div>
              <span className="text-[13px] font-semibold">
                {formatMoney(d.value_vnd, locale)}
              </span>
            </Link>
          ))
        )}
      </div>

      {/* Đặt lịch NGAY từ khung chat (ADR-0009 mục 7 việc 5) — cửa vào chính,
          đặt trước + nổi bật hơn Tạo cơ hội/Thêm việc đúng thẻ design
          man-dat-lich-tu-chat.html ("lời hứa 2 chạm, dưới 15 giây"). */}
      <Button className="w-full" size="sm" onClick={() => setBookOpen(true)}>
        <Calendar className="size-4" />
        {t("bookAppointment")}
      </Button>

      {/* Tạo cơ hội / Thêm việc ngay tại đây — không phải rời màn chat */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={openStages.length === 0}
          onClick={() => setDealOpen(true)}
        >
          <Handshake className="size-4" />
          {tContacts("deals.create")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setTaskOpen(true)}>
          <SquareCheckBig className="size-4" />
          {tContacts("detail.addTask")}
        </Button>
      </div>

      <Button asChild variant="outline" className="w-full">
        <Link href={`/app/contacts/${contact.id}`}>
          <ExternalLink className="size-4" />
          {t("openProfile")}
        </Link>
      </Button>

      {dealOpen && (
        <DealFormDialog
          mode="create"
          open={dealOpen}
          onOpenChange={setDealOpen}
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
          members={buildMemberOptions(
            members.map((m) => m.user_id),
            memberNames,
            currentUserId,
            tOwner,
          )}
          canAssignOthers={canAssignOthers}
          lockedContactName={contact.full_name}
          onSuccess={() =>
            void queryClient.invalidateQueries({
              queryKey: ["contact-open-deals", contact.id],
            })
          }
        />
      )}

      <AddTaskDialog
        contactId={contact.id}
        open={taskOpen}
        onOpenChange={setTaskOpen}
      />

      {bookOpen && (
        <BookAppointmentDialog
          open={bookOpen}
          onOpenChange={setBookOpen}
          conversationId={conversationId}
          contactId={contact.id}
          contactName={contact.full_name}
        />
      )}
    </div>
  );
}

function CreateContactForm({
  conversationId,
  initialName,
}: {
  conversationId: string;
  initialName: string;
}) {
  const t = useTranslations("inbox.contactPanel");
  const tToasts = useTranslations("inbox.toasts");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  // Prefill tên từ tên hội thoại — thường là tên Zalo/Facebook của khách, sửa được
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    startTransition(async () => {
      const res = await createAndLinkContact(conversationId, {
        name: trimmed,
        phone: phone.trim() || null,
      });
      if (res.error === "already_linked") {
        toast.error(tToasts("alreadyLinked"));
      } else if (res.error) {
        toast.error(tToasts("createFailed"));
      } else {
        toast.success(tToasts("createSuccess"));
        setName("");
        setPhone("");
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }
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
      <div className="flex items-center gap-2 text-sm font-medium">
        <UserPlus className="size-4" />
        {t("addTitle")}
      </div>
      <p className="text-xs text-muted-foreground">{t("addHint")}</p>
      <div className="space-y-1.5">
        <label htmlFor="contact-name" className="text-[13px] font-medium">
          {t("nameLabel")} <span className="text-destructive">*</span>
        </label>
        <Input
          id="contact-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          required
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="contact-phone" className="text-[13px] font-medium">
          {t("phoneLabel")}
        </label>
        <Input
          id="contact-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("phonePlaceholder")}
          inputMode="tel"
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending || !name.trim()}>
        {tCommon("save")}
      </Button>
    </form>
  );
}

type Props = {
  conversation: ConversationRow | null;
  currentUserId: string;
  members: Member[];
  memberNames: MemberNames;
  className?: string;
};

/** Phần ruột hồ sơ khách — dùng chung cho panel bên phải (≥xl) và dialog (<xl). */
export function ContactPanelBody({
  conversation,
  currentUserId,
  members,
  memberNames,
}: Omit<Props, "className">) {
  const t = useTranslations("inbox.contactPanel");
  const tInbox = useTranslations("inbox");
  if (!conversation) {
    return <p className="text-sm text-muted-foreground">{t("selectHint")}</p>;
  }
  if (conversation.contacts) {
    return (
      <ContactCard
        conversationId={conversation.id}
        contact={conversation.contacts}
        currentUserId={currentUserId}
        members={members}
        memberNames={memberNames}
      />
    );
  }
  if (conversation.contact_id) {
    // Đã gắn khách nhưng RLS không cho người này xem (staff không phụ trách) — không đưa form tạo trùng
    return <p className="text-sm text-muted-foreground">{t("linkedHidden")}</p>;
  }
  return (
    // key theo hội thoại: đổi hội thoại là prefill lại tên, không giữ tên khách cũ
    <CreateContactForm
      key={conversation.id}
      conversationId={conversation.id}
      initialName={conversationName(conversation, tInbox)}
    />
  );
}

export function ContactPanel({
  conversation,
  currentUserId,
  members,
  memberNames,
  className,
}: Props) {
  const t = useTranslations("inbox.contactPanel");
  return (
    <aside className={cn("w-80 shrink-0 flex-col border-l", className)}>
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <h3 className="text-sm font-semibold">{t("title")}</h3>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ContactPanelBody
          conversation={conversation}
          currentUserId={currentUserId}
          members={members}
          memberNames={memberNames}
        />
      </div>
    </aside>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { formatVN } from "@/lib/datetime";
import { addTagToContact, removeTagFromContact, softDeleteContact } from "../actions";
import { ContactFormDialog } from "../contact-form-dialog";
import {
  ownerLabel,
  TIER_BADGE,
  TIER_LABELS,
  type ActivityRow,
  type ContactDetailRow,
  type ConversationLite,
  type LeadSource,
} from "../types";
import { Timeline, type TimelineApi } from "./timeline";

/** Quản lý thẻ: thêm bằng input + Enter (upsert theo tên), gỡ bằng nút X. */
function TagsCard({ contact }: { contact: ContactDetailRow }) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  const tags = contact.contact_tags
    .map((ct) => ct.tags)
    .filter((t): t is NonNullable<typeof t> => t !== null);

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
          Thẻ
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Chưa có thẻ nào. Gắn thẻ để lọc và nhóm khách dễ hơn.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Badge key={t.id} variant="secondary" className="gap-1 pr-1">
                {t.name}
                <button
                  type="button"
                  aria-label={`Gỡ thẻ ${t.name}`}
                  onClick={() => remove(t.id)}
                  disabled={pending}
                  className="rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
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
          placeholder="Thêm thẻ, nhấn Enter…"
          disabled={pending}
          className="h-8 text-sm"
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
  const router = useRouter();
  const timelineApi = useRef<TimelineApi | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, startDelete] = useTransition();

  const confirmDelete = () => {
    startDelete(async () => {
      const res = await softDeleteContact(contact.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Đã xóa khách hàng");
      router.push("/app/contacts");
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-28 shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3">
        <Button asChild variant="ghost" size="icon" aria-label="Về danh sách">
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
            <Badge className={cn("font-semibold", TIER_BADGE[contact.tier])}>
              {TIER_LABELS[contact.tier]}
            </Badge>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {contact.lead_sources?.name ?? "Chưa rõ nguồn"}
            {" · "}
            Phụ trách: {ownerLabel(contact.owner_id, currentUserId)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {contact.phone ? (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${contact.phone}`}>
                <Phone className="size-4" />
                Gọi
              </a>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <Phone className="size-4" />
              Gọi
            </Button>
          )}
          <Button variant="outline" size="sm" disabled>
            Nhắn Zalo (sắp mở)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => timelineApi.current?.openTask()}
          >
            Thêm việc
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Sửa
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
            Xóa
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
                <CardTitle className="text-sm">Thông tin</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-4">
                <InfoField label="Số điện thoại">
                  {contact.phone ? (
                    <a
                      href={`tel:${contact.phone}`}
                      className="text-primary hover:underline"
                    >
                      {contact.phone}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Chưa có</span>
                  )}
                </InfoField>
                <InfoField label="Email">
                  {contact.email ?? (
                    <span className="text-muted-foreground">Chưa có</span>
                  )}
                </InfoField>
                <InfoField label="Công ty">
                  {contact.companies?.name ?? (
                    <span className="text-muted-foreground">Chưa có</span>
                  )}
                </InfoField>
                <InfoField label="Khách từ">
                  {formatVN(contact.created_at, "dd/MM/yyyy")}
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
            <DialogTitle>Xóa khách hàng?</DialogTitle>
            <DialogDescription>
              Hồ sơ &ldquo;{contact.full_name}&rdquo; sẽ bị ẩn khỏi danh sách.
              Lịch sử hoạt động và hội thoại vẫn được giữ lại.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Bỏ qua
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Đang xóa…" : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

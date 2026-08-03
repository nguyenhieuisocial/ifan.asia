"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ExternalLink, Mail, Phone, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createAndLinkContact } from "./actions";
import type { ConversationRow } from "./types";

function ContactCard({
  contact,
}: {
  contact: NonNullable<ConversationRow["contacts"]>;
}) {
  const t = useTranslations("inbox.contactPanel");
  const tCommon = useTranslations("common");
  const tags = contact.contact_tags
    .map((ct) => ct.tags)
    .filter((t): t is NonNullable<typeof t> => t !== null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar className="size-12">
          <AvatarFallback className="text-lg">
            {(contact.full_name[0] ?? "?").toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <p className="min-w-0 truncate text-sm font-semibold">
          {contact.full_name}
        </p>
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
      <Button asChild variant="outline" className="w-full">
        <Link href={`/app/contacts/${contact.id}`}>
          <ExternalLink className="size-4" />
          {t("openProfile")}
        </Link>
      </Button>
    </div>
  );
}

function CreateContactForm({ conversationId }: { conversationId: string }) {
  const t = useTranslations("inbox.contactPanel");
  const tToasts = useTranslations("inbox.toasts");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
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
  className?: string;
};

export function ContactPanel({ conversation, className }: Props) {
  const t = useTranslations("inbox.contactPanel");
  return (
    <aside className={cn("w-80 shrink-0 flex-col border-l", className)}>
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <h3 className="text-sm font-semibold">{t("title")}</h3>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!conversation ? (
          <p className="text-sm text-muted-foreground">{t("selectHint")}</p>
        ) : conversation.contacts ? (
          <ContactCard contact={conversation.contacts} />
        ) : (
          <CreateContactForm conversationId={conversation.id} />
        )}
      </div>
    </aside>
  );
}

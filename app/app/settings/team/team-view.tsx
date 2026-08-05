"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Copy, Lock, Trash2, TriangleAlert, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
import { inviteMember, removeMember, revokeInvite } from "./actions";
import type { InviteRow, MemberRow, SeatInfo } from "./types";

const INVITE_ROLES = ["admin", "manager", "staff", "viewer"] as const;

const ROLE_STYLE: Record<string, string> = {
  owner: "bg-primary/10 text-primary",
  admin: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  manager: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  staff: "bg-muted text-muted-foreground",
  viewer: "bg-muted text-muted-foreground",
};

/** Thanh ghế đã dùng — nhìn là biết còn chỗ hay hết chỗ. */
function SeatBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  return (
    <div
      className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"
      role="presentation"
    >
      <div
        className={cn(
          "h-full rounded-full transition-all",
          used >= limit ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function TeamView({
  seats,
  members,
  invites,
  canManage,
  currentUserId,
  seatsRestricted = false,
}: {
  seats: SeatInfo | null;
  members: MemberRow[];
  invites: InviteRow[];
  canManage: boolean;
  currentUserId: string;
  /** CSDL từ chối số ghế vì không đủ vai (migration #41). */
  seatsRestricted?: boolean;
}) {
  const t = useTranslations("team");
  const locale = useLocale() as Locale;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof INVITE_ROLES)[number]>("staff");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const limit = seats?.limit ?? null;
  const used = seats?.used ?? members.length;
  const isFull = limit !== null && used >= limit;
  const isOver = seats?.over_limit === true;

  const submit = () => {
    if (pending || !email.trim()) return;
    startTransition(async () => {
      const res = await inviteMember({ email, role });
      if (res.error !== null) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      setEmail("");
      setCopied(false);
      setLink(res.link);
      toast.success(t("toasts.invited"));
    });
  };

  const doRevoke = (id: string) => {
    if (pending) return;
    startTransition(async () => {
      const res = await revokeInvite(id);
      if (res.error) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      toast.success(t("toasts.revoked"));
    });
  };

  const doRemove = (userId: string) => {
    if (pending) return;
    startTransition(async () => {
      const res = await removeMember(userId);
      if (res.error) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      toast.success(t("toasts.removed"));
    });
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success(t("toasts.copied"));
    } catch {
      toast.error(t("errors.copyFailed"));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {t("description")}
          </p>
        </div>

        {/* ---- Còn bao nhiêu chỗ ---- */}
        {/* Không đủ vai: thay con số bằng một câu nói rõ vì sao, KHÔNG bịa
            "không giới hạn" (seats = null trước đây rơi đúng vào nhánh đó). */}
        {seatsRestricted ? (
          <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
            <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>{t("seats.restricted")}</span>
          </p>
        ) : (
        <section className="rounded-lg border p-4">
          <h2 className="text-[14px] font-semibold">{t("seats.title")}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed">
            {limit === null
              ? t("seats.unlimited", { used })
              : t("seats.usage", { used, limit })}
          </p>
          {limit !== null && <SeatBar used={used} limit={limit} />}
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {t("seats.breakdown", {
              members: seats?.members ?? members.length,
              pending: seats?.pending ?? invites.length,
            })}
          </p>

          {isOver && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
              <TriangleAlert
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
              />
              <p className="text-[13px] leading-relaxed">
                {t("seats.over", { used, limit: limit ?? 0 })}
              </p>
            </div>
          )}
        </section>
        )}

        {/* ---- Mời thêm người ---- */}
        {canManage ? (
          <section className="rounded-lg border p-4">
            <h2 className="text-[14px] font-semibold">{t("invite.title")}</h2>

            {/* Hết chỗ: nói bằng tiếng người + dẫn thẳng sang màn gói */}
            {isFull && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2.5">
                <p className="text-[13px] leading-relaxed">
                  {t("seats.full", { limit: limit ?? 0 })}
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/app/settings/billing">{t("seats.upgrade")}</Link>
                </Button>
              </div>
            )}

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <div className="flex-1">
                <label htmlFor="invite-email" className="sr-only">
                  {t("invite.emailLabel")}
                </label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("invite.emailPlaceholder")}
                  disabled={isFull || pending}
                />
              </div>
              <div>
                <label htmlFor="invite-role" className="sr-only">
                  {t("invite.roleLabel")}
                </label>
                <Select
                  id="invite-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as (typeof INVITE_ROLES)[number])}
                  disabled={isFull || pending}
                  className="sm:w-40"
                >
                  {INVITE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`roles.${r}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                type="button"
                size="default"
                onClick={submit}
                disabled={isFull || pending || !email.trim()}
                className="sm:w-auto"
              >
                <UserPlus aria-hidden className="size-4" />
                {t("invite.submit")}
              </Button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t("invite.linkNote")}
            </p>
          </section>
        ) : (
          <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
            <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>{t("managerOnly")}</span>
          </p>
        )}

        {/* ---- Đang làm ở tiệm ---- */}
        <section className="rounded-lg border p-4">
          <h2 className="text-[14px] font-semibold">
            {t("members.title", { n: members.length })}
          </h2>
          <ul className="mt-3 divide-y">
            {members.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">
                    {m.display_name}
                    {m.user_id === currentUserId && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {t("members.you")}
                      </span>
                    )}
                  </p>
                  {m.joined_at && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("members.joined", { date: formatDate(m.joined_at, locale) })}
                    </p>
                  )}
                </div>
                <Badge className={cn("font-semibold", ROLE_STYLE[m.role])}>
                  {t(`roles.${m.role}`)}
                </Badge>
                {canManage && m.user_id !== currentUserId && m.role !== "owner" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => doRemove(m.user_id)}
                    disabled={pending}
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                    {t("members.remove")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* ---- Lời mời đang chờ ---- */}
        {canManage && invites.length > 0 && (
          <section className="rounded-lg border p-4">
            <h2 className="text-[14px] font-semibold">
              {t("invites.title", { n: invites.length })}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {t("invites.description")}
            </p>
            <ul className="mt-3 divide-y">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{i.email}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("invites.expires", {
                        date: formatDate(i.expires_at, locale),
                      })}
                    </p>
                  </div>
                  <Badge className={cn("font-semibold", ROLE_STYLE[i.role])}>
                    {t(`roles.${i.role}`)}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => doRevoke(i.id)}
                    disabled={pending}
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                    {t("invites.revoke")}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* ---- Đường link mời: chỉ hiện MỘT LẦN ---- */}
      <Dialog open={link !== null} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("invite.linkTitle")}</DialogTitle>
            <DialogDescription>{t("invite.linkDescription")}</DialogDescription>
          </DialogHeader>
          <p className="rounded-md border bg-muted/40 p-2.5 text-xs break-all">{link}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLink(null)}>
              {t("invite.close")}
            </Button>
            <Button type="button" onClick={copyLink}>
              {copied ? (
                <Check aria-hidden className="size-4" />
              ) : (
                <Copy aria-hidden className="size-4" />
              )}
              {copied ? t("invite.copied") : t("invite.copy")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

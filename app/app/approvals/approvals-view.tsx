"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronRight, Inbox, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/lib/format";
import { formatValue } from "../settings/forms/field-input";
import type { FormField } from "../settings/forms/types";
import { decideApproval, loadMoreAssigned, loadMoreMyRequests } from "./actions";
import { APPROVALS_PAGE_SIZE, type MyRequestRow, type TicketRow } from "./types";

const TOAST_KEYS = ["not_allowed", "already_decided", "note_required", "not_found"];

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  approved: "secondary",
  submitted: "outline",
  pending: "outline",
  rejected: "destructive",
  cancelled: "outline",
};

/** Bảng "ô nhập → giá trị đã điền" — đọc như tờ đơn giấy, không phải JSON. */
function DataTable({
  fields,
  data,
}: {
  fields: FormField[];
  data: Record<string, unknown>;
}) {
  const t = useTranslations("approvals");
  const tf = useTranslations("forms.field");
  if (fields.length === 0) {
    return <p className="text-[13px] text-muted-foreground">{t("card.noData")}</p>;
  }
  return (
    <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
      {fields.map((f) => (
        <div key={f.key} className="contents">
          <dt className="text-[13px] text-muted-foreground">{f.label}</dt>
          <dd className="text-[13px] break-words">
            {formatValue(f, data[f.key], tf("yesShort"), tf("noShort"), t("card.blank"))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Một phiếu chờ tôi duyệt: xem dữ liệu → bấm Duyệt, hoặc Từ chối kèm lý do. */
function PendingCard({ ticket }: { ticket: TicketRow }) {
  const t = useTranslations("approvals");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const decide = (decision: "approved" | "rejected") => {
    if (pending) return;
    startTransition(async () => {
      const res = await decideApproval(ticket.id, decision, note.trim() || null);
      if (res.error) {
        toast.error(
          t(`toasts.${TOAST_KEYS.includes(res.error) ? res.error : "failed"}`),
        );
        return;
      }
      toast.success(
        t(
          res.result === "rejected"
            ? "toasts.rejected"
            : res.result === "next_level"
              ? "toasts.nextLevel"
              : "toasts.approved",
        ),
      );
      setRejecting(false);
      setNote("");
      router.refresh();
    });
  };

  return (
    <li className="rounded-lg border">
      <div className="space-y-1 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] font-medium">{ticket.title}</p>
          {ticket.totalLevels > 1 && (
            <Badge variant="outline">
              {t("card.level", { level: ticket.level, total: ticket.totalLevels })}
            </Badge>
          )}
        </div>
        <p className="text-[13px] text-muted-foreground">
          {ticket.submitterName
            ? t("card.from", { name: ticket.submitterName })
            : ticket.fromWorkflow
              ? t("card.fromWorkflow", { name: ticket.sourceName ?? "" })
              : (ticket.sourceName ?? "")}
        </p>
        <p className="text-xs text-muted-foreground/80">{formatDateTime(ticket.createdAt, locale)}</p>
      </div>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-1 border-t px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {t(open ? "card.hide" : "card.detail")}
      </button>

      {open && (
        <div className="space-y-2 border-t px-3 py-3">
          {ticket.body && <p className="text-[13px] text-muted-foreground">{ticket.body}</p>}
          <DataTable fields={ticket.fields} data={ticket.data} />
        </div>
      )}

      <div className="space-y-2 border-t p-3">
        {rejecting && (
          <div className="space-y-1.5">
            <label htmlFor={`rn-${ticket.id}`} className="block text-[13px] font-medium">
              {t("card.reasonLabel")}
            </label>
            <textarea
              id={`rn-${ticket.id}`}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder={t("card.reasonPlaceholder")}
              className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {rejecting ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                disabled={pending || note.trim() === ""}
                onClick={() => decide("rejected")}
              >
                <X className="size-4" />
                {t("card.confirmReject")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setRejecting(false)}
              >
                {t("card.cancel")}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" disabled={pending} onClick={() => decide("approved")}>
                <Check className="size-4" />
                {t("card.approve")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => setRejecting(true)}
              >
                <X className="size-4" />
                {t("card.reject")}
              </Button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <Inbox className="mx-auto size-5 text-muted-foreground" />
      <p className="mt-3 text-[13px] text-muted-foreground">{text}</p>
    </div>
  );
}

/** Nút "Tải thêm" dùng chung cho cả 3 tab (khóa dịch có sẵn ở `common`). */
function LoadMore({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  const tCommon = useTranslations("common");
  return (
    <div className="flex justify-center pt-1">
      <Button variant="outline" size="sm" disabled={busy} onClick={onClick}>
        {busy ? tCommon("loading") : tCommon("loadMore")}
      </Button>
    </div>
  );
}

export function ApprovalsView({
  pendingCount,
  pending: pendingFirstPage,
  handled: handledFirstPage,
  myRequests: myRequestsFirstPage,
}: {
  /** Số phiếu chờ tôi duyệt do CSDL đếm — KHÔNG phải số dòng đang bày. */
  pendingCount: number;
  pending: TicketRow[];
  handled: TicketRow[];
  myRequests: MyRequestRow[];
}) {
  const t = useTranslations("approvals");
  const locale = useLocale() as Locale;

  // Trang đầu do server dựng; các trang sau nạp thêm vào state. Props đổi (sau
  // khi duyệt/từ chối → router.refresh) thì trở về trang đầu — đúng, vì phiếu
  // vừa quyết định phải nhảy từ tab này sang tab kia.
  const [pending, setPending] = useState(pendingFirstPage);
  const [handled, setHandled] = useState(handledFirstPage);
  const [myRequests, setMyRequests] = useState(myRequestsFirstPage);
  const [syncedFrom, setSyncedFrom] = useState(pendingFirstPage);
  if (syncedFrom !== pendingFirstPage) {
    setSyncedFrom(pendingFirstPage);
    setPending(pendingFirstPage);
    setHandled(handledFirstPage);
    setMyRequests(myRequestsFirstPage);
  }

  const [loadingTab, setLoadingTab] = useState<string | null>(null);
  // Hai tab này không có bộ đếm riêng: trang trả về đầy ⇒ coi như còn nữa.
  const [moreHandled, setMoreHandled] = useState(
    handledFirstPage.length === APPROVALS_PAGE_SIZE,
  );
  const [moreMine, setMoreMine] = useState(
    myRequestsFirstPage.length === APPROVALS_PAGE_SIZE,
  );

  const loadMoreTickets = (kind: "pending" | "handled") => {
    if (loadingTab) return;
    const current = kind === "pending" ? pending : handled;
    setLoadingTab(kind);
    loadMoreAssigned(kind, current.length)
      .then((rows) => {
        const setter = kind === "pending" ? setPending : setHandled;
        setter((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          return [...prev, ...rows.filter((x) => !seen.has(x.id))];
        });
        if (kind === "handled") setMoreHandled(rows.length === APPROVALS_PAGE_SIZE);
      })
      // Nạp hụt thì danh sách giữ nguyên và nút vẫn còn để bấm lại — huy hiệu
      // vẫn là con số thật nên không có gì bị giấu.
      .catch(() => {})
      .finally(() => setLoadingTab(null));
  };

  const loadMoreMine = () => {
    if (loadingTab) return;
    setLoadingTab("mine");
    loadMoreMyRequests(myRequests.length)
      .then((rows) => {
        setMyRequests((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          return [...prev, ...rows.filter((x) => !seen.has(x.id))];
        });
        setMoreMine(rows.length === APPROVALS_PAGE_SIZE);
      })
      .catch(() => {})
      .finally(() => setLoadingTab(null));
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link href="/app/approvals/new">
              <Plus className="size-4" />
              {t("newRequest")}
            </Link>
          </Button>
        </div>

        <Tabs defaultValue="pending">
          {/* Ở 375px 3 nhãn tiếng Việt dài hơn bề ngang máy → cho cuộn NGANG trong
              chính thanh tab (cùng cách xử lý của sub-nav khu Cài đặt), trang vẫn
              không tràn ngang và tab thứ 3 vẫn tới được. */}
          <TabsList className="max-w-full justify-start overflow-x-auto">
            <TabsTrigger value="pending">
              {t("tabs.pending")}
              {/* Con số do CSDL đếm: trước đây đếm trong 50 phiếu vừa tải nên
                  tiệm nào quá 50 phiếu chờ là huy hiệu đứng yên ở 50. */}
              {pendingCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 tabular-nums">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="handled">{t("tabs.handled")}</TabsTrigger>
            <TabsTrigger value="mine">{t("tabs.mine")}</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-3">
            {pending.length === 0 ? (
              <EmptyBox text={t("empty.pending")} />
            ) : (
              <ul className="space-y-2">
                {pending.map((x) => (
                  <PendingCard key={x.id} ticket={x} />
                ))}
                {pending.length < pendingCount && (
                  <LoadMore
                    busy={loadingTab === "pending"}
                    onClick={() => loadMoreTickets("pending")}
                  />
                )}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="handled" className="mt-3">
            {handled.length === 0 ? (
              <EmptyBox text={t("empty.handled")} />
            ) : (
              <ul className="space-y-2">
                {handled.map((x) => (
                  <li key={x.id} className="space-y-1 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium">{x.title}</p>
                      <Badge variant={STATUS_VARIANT[x.myDecision] ?? "outline"}>
                        {t(`decision.${x.myDecision}`)}
                      </Badge>
                    </div>
                    {x.myNote && (
                      <p className="text-[13px] text-muted-foreground">
                        {t("card.myNote", { note: x.myNote })}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/80">
                      {formatDateTime(x.myDecidedAt ?? x.createdAt, locale)}
                    </p>
                  </li>
                ))}
                {moreHandled && (
                  <LoadMore
                    busy={loadingTab === "handled"}
                    onClick={() => loadMoreTickets("handled")}
                  />
                )}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="mine" className="mt-3">
            {myRequests.length === 0 ? (
              <EmptyBox text={t("empty.mine")} />
            ) : (
              <ul className="space-y-2">
                {myRequests.map((x) => (
                  <li key={x.id} className="space-y-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium">{x.formName}</p>
                      <Badge variant={STATUS_VARIANT[x.status] ?? "outline"}>
                        {t(`submissionStatus.${x.status}`)}
                      </Badge>
                      {x.status === "submitted" && x.totalLevels && x.totalLevels > 1 && (
                        <Badge variant="outline">
                          {t("card.level", { level: x.level ?? 1, total: x.totalLevels })}
                        </Badge>
                      )}
                    </div>
                    <DataTable fields={x.fields} data={x.data} />
                    {x.decisionNote && x.status !== "submitted" && (
                      <p className="text-[13px] text-muted-foreground">
                        {t("card.decisionNote", {
                          name: x.deciderName ?? "",
                          note: x.decisionNote,
                        })}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/80">
                      {formatDateTime(x.createdAt, locale)}
                    </p>
                  </li>
                ))}
                {moreMine && <LoadMore busy={loadingTab === "mine"} onClick={loadMoreMine} />}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

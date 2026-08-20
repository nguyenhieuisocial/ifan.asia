"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Lock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { nowVN } from "@/lib/datetime";
import type { Locale } from "@/i18n/config";
import { thiHanhYeuCauXoa, tuChoiYeuCauXoa } from "./actions";

/** Tóm tắt CSDL ghi lại sau khi thi hành (cột `summary`, migration #287-288). */
export type ErasureSummary = {
  xoa_tin_nhan?: number;
  xoa_ghi_chu?: number;
  xoa_tep?: number;
  xoa_danh_tinh_kenh?: number;
  giu_don_hang?: number;
  giu_lich_hen?: number;
  nhan_thay_the?: string;
};

export type ErasureRequestRow = {
  id: string;
  contactId: string;
  contactName: string | null;
  requestedAt: string;
  /** Hạn 30 ngày, ĐÓNG BĂNG lúc ghi nhận — không tính lại theo ngày đọc. */
  deadlineAt: string;
  status: "pending" | "done" | "rejected";
  note: string | null;
  rejectReason: string | null;
  decidedAt: string | null;
  summary: ErasureSummary | null;
};

type Props = {
  canManage: boolean;
  requests: ErasureRequestRow[];
  /** Trần số dòng đọc về — chạm trần thì NÓI RA, không âm thầm cắt. */
  listLimit?: number;
  /** Đọc CSDL hỏng. Khác hẳn "chưa có yêu cầu nào" — xem chú thích ở page.tsx. */
  loadFailed?: boolean;
};

const STATUS_BADGE: Record<ErasureRequestRow["status"], string> = {
  pending: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
  done: "bg-muted text-muted-foreground",
  rejected: "bg-muted text-muted-foreground",
};

function daysLeft(deadlineAt: string): number {
  return Math.ceil((new Date(deadlineAt).getTime() - nowVN().getTime()) / 86_400_000);
}

/**
 * Cài đặt → Yêu cầu xoá dữ liệu cá nhân (Nghị định 13).
 *
 * Nguyên tắc gọi tên trên thẻ design là **XOÁ NGƯỜI, GIỮ SỐ** — nên cửa sổ xác
 * nhận KHÔNG phải một câu "bạn chắc chứ": nó liệt kê ĐỦ HAI VẾ (xoá gì · giữ
 * gì) và nói luôn VÌ SAO giữ. Người bấm nút này đang làm một việc không hoàn
 * tác được, và họ phải trả lời được cho khách là đã giữ lại cái gì.
 *
 * Thẻ design: design-system/man-xuat-du-lieu-pdpl.html (nửa dưới).
 */
export function DataErasureView({ canManage, requests, listLimit, loadFailed }: Props) {
  const t = useTranslations("settings.dataErasure");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;

  const [rejectFor, setRejectFor] = useState<ErasureRequestRow | null>(null);
  const [applyFor, setApplyFor] = useState<ErasureRequestRow | null>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

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

  const submitReject = () => {
    const target = rejectFor;
    if (!target || !reason.trim()) return;
    startTransition(async () => {
      const res = await tuChoiYeuCauXoa(target.id, reason.trim());
      if (res.error) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      toast.success(t("toasts.rejected"));
      setRejectFor(null);
      setReason("");
    });
  };

  const submitApply = () => {
    const target = applyFor;
    if (!target) return;
    startTransition(async () => {
      const res = await thiHanhYeuCauXoa(target.id);
      if (res.error) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      toast.success(t("toasts.applied"));
      setApplyFor(null);
    });
  };

  const nameOf = (r: ErasureRequestRow) => r.contactName ?? t("unknownContact");

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {t("description")}
          </p>
        </div>

        <div className="rounded-md bg-muted/50 p-3 text-[13px] leading-relaxed">
          <p className="font-semibold">{t("principle.title")}</p>
          <p className="mt-1 text-muted-foreground">{t("principle.body")}</p>
        </div>

        {loadFailed ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-[13px] leading-relaxed text-destructive">
            {t("loadFailed")}
          </p>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <ShieldCheck className="size-8 text-muted-foreground/50" aria-hidden />
            <p className="mt-3 text-[15px] font-semibold">{t("empty.title")}</p>
            <p className="mt-1.5 max-w-sm text-[13px] text-muted-foreground">
              {t("empty.description")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {requests.map((r) => {
              const left = daysLeft(r.deadlineAt);
              const urgent = r.status === "pending" && left <= 7;
              return (
                <div key={r.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                      {nameOf(r)}
                    </span>
                    <Badge className={STATUS_BADGE[r.status]}>
                      {t(`status.${r.status}`)}
                    </Badge>
                  </div>

                  <p
                    className={
                      urgent
                        ? "mt-0.5 text-xs font-medium text-destructive"
                        : "mt-0.5 text-xs text-muted-foreground"
                    }
                  >
                    {t("receivedAt", { date: formatDate(r.requestedAt, locale) })}
                    {r.status === "pending"
                      ? ` · ${left < 0 ? t("overdue", { count: -left }) : t("daysLeft", { count: left })}`
                      : r.decidedAt
                        ? ` · ${t("decidedAt", { date: formatDate(r.decidedAt, locale) })}`
                        : ""}
                  </p>

                  {r.note && (
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                      {t("customerNote", { note: r.note })}
                    </p>
                  )}

                  {r.status === "rejected" && r.rejectReason && (
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                      {t("rejectedReason", { reason: r.rejectReason })}
                    </p>
                  )}

                  {r.status === "done" && (
                    <div className="mt-2 rounded-md bg-muted/50 p-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                      {r.summary ? (
                        <>
                          <p>
                            {t("doneSummary.deleted", {
                              messages: r.summary.xoa_tin_nhan ?? 0,
                              notes: r.summary.xoa_ghi_chu ?? 0,
                              files: r.summary.xoa_tep ?? 0,
                              identities: r.summary.xoa_danh_tinh_kenh ?? 0,
                            })}
                          </p>
                          <p>
                            {t("doneSummary.kept", {
                              orders: r.summary.giu_don_hang ?? 0,
                              appointments: r.summary.giu_lich_hen ?? 0,
                            })}
                          </p>
                          {r.summary.nhan_thay_the && (
                            <p>
                              {t("doneSummary.label", { label: r.summary.nhan_thay_the })}
                            </p>
                          )}
                        </>
                      ) : (
                        // Yêu cầu 'done' mà không có tóm tắt là dữ liệu không
                        // đúng hình dạng hàm trả về — nói ra chứ không hiện
                        // một khối trống để người đọc tự đoán.
                        <p>{t("doneSummary.missing")}</p>
                      )}
                    </div>
                  )}

                  {r.status === "pending" && (
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="max-md:h-11"
                        disabled={pending}
                        onClick={() => {
                          setReason("");
                          setRejectFor(r);
                        }}
                      >
                        {t("actions.reject")}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="max-md:h-11"
                        disabled={pending}
                        onClick={() => setApplyFor(r)}
                      >
                        {t("actions.apply")}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {listLimit && requests.length >= listLimit && (
          <p className="text-xs text-muted-foreground">{t("limitNote", { n: listLimit })}</p>
        )}
      </div>

      {/* Từ chối — lý do BẮT BUỘC. Từ chối im lặng thì đúng bằng không trả lời. */}
      <Dialog
        open={rejectFor !== null}
        onOpenChange={(open) => {
          if (!open) setRejectFor(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("reject.title")}</DialogTitle>
            <DialogDescription>
              {t("reject.description", { name: rejectFor ? nameOf(rejectFor) : "" })}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reject.placeholder")}
            aria-label={t("reject.label")}
            maxLength={2000}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectFor(null)}
              disabled={pending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={submitReject}
              disabled={pending || !reason.trim()}
            >
              {t("reject.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Thi hành — cửa sổ này phải nói ĐỦ HAI VẾ, xem chú thích đầu file. */}
      <Dialog
        open={applyFor !== null}
        onOpenChange={(open) => {
          if (!open) setApplyFor(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("apply.title", { name: applyFor ? nameOf(applyFor) : "" })}
            </DialogTitle>
            <DialogDescription>{t("apply.description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-[13px] leading-relaxed">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">
                {t("apply.deleteTitle")}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                <li>{t("apply.deleteItems.identity")}</li>
                <li>{t("apply.deleteItems.media")}</li>
                <li>{t("apply.deleteItems.messages")}</li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">
                {t("apply.keepTitle")}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                <li>{t("apply.keepItems.orders")}</li>
                <li>{t("apply.keepItems.money")}</li>
              </ul>
            </div>
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive">
              {t("apply.why")}
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApplyFor(null)}
              disabled={pending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={submitApply}
              disabled={pending}
            >
              {pending ? t("apply.applying") : t("apply.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

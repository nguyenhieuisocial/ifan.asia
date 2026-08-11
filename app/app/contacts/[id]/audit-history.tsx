"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatVN } from "@/lib/datetime";
import { formatDateTime } from "@/lib/format";
import type { Locale, Translator } from "@/i18n/config";

type AuditAction = "created" | "updated" | "deleted" | "restored";

type AuditRow = {
  id: number;
  action: AuditAction;
  diff: Record<string, { from: unknown; to: unknown }> | null;
  at: string;
  actor_id: string | null;
  actor_name: string;
};

/** Trần một lần gọi RPC (mặc định của contact_audit_history) — cũng là ngưỡng hiện "đang hiện N gần nhất". */
const AUDIT_LIMIT = 50;

/** Chấm màu theo action — khớp thẻ design lich-su-ho-so.html. */
const DOT_CLASS: Record<AuditAction, string> = {
  created: "bg-[#0ea5e9]",
  updated: "bg-[#16a34a]",
  deleted: "bg-[#dc2626]",
  restored: "bg-[#16a34a]",
};

/**
 * company_id/owner_id/source_id là uuid tham chiếu bảng khác — bản này CHƯA có
 * ngân sách join sang tên thật, hiện thẳng 8 ký tự đầu cho biết còn thô, không
 * giả vờ đẹp hơn thực tế (chỉ đạo mục 3 của việc này).
 */
const UUID_DIFF_FIELDS = new Set(["company_id", "owner_id", "source_id"]);

/** deleted_at đã thể hiện qua action deleted/restored — không lặp lại ở dòng diff. */
const SKIPPED_DIFF_FIELDS = new Set(["deleted_at"]);

async function fetchAuditHistory(
  supabase: SupabaseClient,
  contactId: string,
): Promise<AuditRow[]> {
  const { data, error } = await supabase.rpc("contact_audit_history", {
    p_contact_id: contactId,
    p_limit: AUDIT_LIMIT,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditRow[];
}

function formatDiffValue(field: string, value: unknown, emptyLabel: string): string {
  if (value === null || value === undefined || value === "") return emptyLabel;
  if (UUID_DIFF_FIELDS.has(field) && typeof value === "string") {
    return value.slice(0, 8);
  }
  return String(value);
}

/** "Hôm nay HH:mm" / "Hôm qua HH:mm" / dd/MM/yyyy HH:mm — cùng quy ước ngày với Timeline, có kèm giờ. */
function historyWhen(at: string, locale: Locale, tTime: Translator): string {
  const time = formatVN(at, "HH:mm");
  const dayKey = formatVN(at, "yyyy-MM-dd");
  const nowMs = Date.now();
  const todayKey = formatVN(nowMs, "yyyy-MM-dd");
  const yesterdayKey = formatVN(nowMs - 86_400_000, "yyyy-MM-dd");
  if (dayKey === todayKey) return `${tTime("today")} ${time}`;
  if (dayKey === yesterdayKey) return `${tTime("yesterday")} ${time}`;
  return formatDateTime(at, locale);
}

/** Dòng phụ liệt kê field đổi: "Tên: "A" → "B" · Số điện thoại: "X" → "Y"". */
function DiffLine({
  diff,
}: {
  diff: Record<string, { from: unknown; to: unknown }>;
}) {
  const tField = useTranslations("contacts.history.field");
  const tHistory = useTranslations("contacts.history");
  const emptyLabel = tHistory("emptyValue");

  const parts = Object.entries(diff)
    .filter(([field]) => !SKIPPED_DIFF_FIELDS.has(field))
    .map(([field, { from, to }]) => {
      const label = tField.has(field) ? tField(field) : field;
      return `${label}: "${formatDiffValue(field, from, emptyLabel)}" → "${formatDiffValue(field, to, emptyLabel)}"`;
    });

  if (parts.length === 0) return null;
  return <p className="mt-0.5 text-xs text-muted-foreground">{parts.join(" · ")}</p>;
}

function AuditItem({ row, isLast }: { row: AuditRow; isLast: boolean }) {
  const t = useTranslations("contacts.history");
  const tTime = useTranslations("time");
  const locale = useLocale() as Locale;
  const actor = row.actor_name || t("unknownActor");

  return (
    <div className={cn("flex gap-2.5 py-2.5", !isLast && "border-b")}>
      <span
        className={cn("mt-1.5 size-[7px] shrink-0 rounded-full", DOT_CLASS[row.action])}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px]">
          {t.rich(`action.${row.action}`, {
            actor,
            b: (chunks) => <span className="font-medium">{chunks}</span>,
          })}
        </p>
        {row.action === "updated" && row.diff && <DiffLine diff={row.diff} />}
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {historyWhen(row.at, locale, tTime)}
        </p>
      </div>
    </div>
  );
}

/**
 * Tab Lịch sử trong hồ sơ khách — chỉ tự fetch qua RPC contact_audit_history
 * khi tab được mở (TabsContent radix không mount nội dung tab chưa chọn).
 * RLS đã khoanh owner/admin ở tầng CSDL; ContactDetail chỉ render <AuditHistory>
 * khi canViewHistory, đây là lớp UI-lịch sự thứ hai, không phải chốt quyền thật.
 */
export function AuditHistory({ contactId }: { contactId: string }) {
  const t = useTranslations("contacts.history");
  const supabase = useMemo(() => createClient(), []);
  const query = useQuery({
    queryKey: ["contact-audit-history", contactId],
    queryFn: () => fetchAuditHistory(supabase, contactId),
  });

  const rows = query.data ?? [];

  if (query.isPending) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-3 p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-2.5 py-2.5">
            <Skeleton className="mt-1 size-[7px] shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4">
        <p className="text-sm text-muted-foreground">{t("loadFailed")}</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4">
        <div className="pt-5 pb-5 text-center">
          <p className="text-[13px] font-semibold">{t("empty.title")}</p>
          <p className="mx-auto mt-1 max-w-[280px] text-xs text-muted-foreground">
            {t("empty.description")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 p-4">
      <div>
        {rows.map((row, i) => (
          <AuditItem key={row.id} row={row} isLast={i === rows.length - 1} />
        ))}
      </div>
      {rows.length >= AUDIT_LIMIT && (
        <p className="text-xs text-muted-foreground">{t("limitNote", { n: rows.length })}</p>
      )}
    </div>
  );
}

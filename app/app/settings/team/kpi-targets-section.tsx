"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import {
  KPI_METRICS,
  currentMonthVN,
  kpiMonthLabel,
  shiftMonth,
  type KpiMetric,
} from "@/lib/kpi";
import type { Locale } from "@/i18n/config";
import { clearKpiTarget, setKpiTarget } from "./actions";
import type { MemberRow } from "./types";

type TargetRow = { user_id: string | null; metric: string; target: number };

/**
 * Khu "Mục tiêu tháng" trong Cài đặt → Nhân viên (hồ sơ KPI mục 9, phần 1–3):
 * bảng [Cả tiệm + từng nhân viên] × 3 chỉ số, sửa TẠI CHỖ kiểu ô Chi phí của
 * báo cáo nguồn (bấm số → ô nhập); để TRỐNG = tắt chỉ số đó (xóa dòng, không
 * đặt 0). Tháng đang xem chuyển được — hết tháng bảng tháng mới trống chờ đặt.
 * Chỉ render cho owner/admin/manager (page kiểm vai); RLS #59 vẫn là chốt thật.
 */
export function KpiTargetsSection({ members }: { members: MemberRow[] }) {
  const t = useTranslations("kpi");
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(() => currentMonthVN());

  const targets = useQuery({
    queryKey: ["kpi-targets", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_targets")
        .select("user_id, metric, target")
        .eq("month", month);
      if (error) throw new Error(error.message);
      return (data ?? []) as TargetRow[];
    },
  });

  const byKey = new Map(
    (targets.data ?? []).map((r) => [`${r.user_id ?? "shop"}|${r.metric}`, Number(r.target)]),
  );
  // Hàng đầu là "Cả tiệm" (user_id null) — hồ sơ: mục tiêu cho từng nhân viên HOẶC cả tiệm
  const rows: { userId: string | null; name: string }[] = [
    { userId: null, name: t("settings.shopRow") },
    ...members.map((m) => ({ userId: m.user_id as string | null, name: m.display_name })),
  ];

  return (
    <section className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold">{t("settings.title")}</h2>
        </div>
        {/* Chuyển tháng: mũi tên + nhãn MM/yyyy (đọc được cả vi lẫn en) */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t("month.prev")}
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </Button>
          <span className="text-[13px] font-medium tabular-nums">
            {t("month.label", { month: kpiMonthLabel(month) })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t("month.next")}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          >
            <ChevronRight aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        {t("settings.description")}
      </p>

      {targets.isPending ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : targets.isError ? (
        <p className="mt-3 text-[13px] text-muted-foreground">{t("settings.loadError")}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="h-9 border-b">
                <th className="pr-3 font-medium">{t("settings.memberCol")}</th>
                {KPI_METRICS.map((m) => (
                  <th key={m} className="px-3 text-right font-medium whitespace-nowrap">
                    {t(`metrics.${m}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId ?? "shop"} className="border-b last:border-b-0">
                  <td className="max-w-40 truncate py-2 pr-3 font-medium">{row.name}</td>
                  {KPI_METRICS.map((metric) => (
                    <td key={metric} className="px-3 py-2 text-right whitespace-nowrap">
                      <TargetCell
                        userId={row.userId}
                        rowName={row.name}
                        month={month}
                        metric={metric}
                        value={byKey.get(`${row.userId ?? "shop"}|${metric}`) ?? null}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {t("settings.hint")}
      </p>
    </section>
  );
}

/**
 * Một ô mục tiêu — bấm là thành ô nhập (mẫu CostCell màn báo cáo nguồn):
 * Enter lưu · Escape thoát · để TRỐNG rồi Enter = tắt chỉ số (xóa mục tiêu).
 * Lưu xong invalidate query để bảng và các màn đang mở cùng thấy số mới.
 */
function TargetCell({
  userId,
  rowName,
  month,
  metric,
  value,
}: {
  userId: string | null;
  rowName: string;
  month: string;
  metric: KpiMetric;
  value: number | null;
}) {
  const t = useTranslations("kpi");
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const cellLabel = t("settings.cellLabel", {
    metric: t(`metrics.${metric}`),
    name: rowName,
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["kpi-targets", month] });

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value === null ? "" : String(value));
          setEditing(true);
        }}
        aria-label={cellLabel}
        className={
          value === null
            ? "rounded-sm text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
            : "rounded-sm tabular-nums underline decoration-dotted underline-offset-2 hover:text-foreground"
        }
      >
        {value === null
          ? t("settings.notSet")
          : metric === "revenue_won"
            ? formatMoney(value, locale)
            : value}
      </button>
    );
  }

  return (
    <form
      className="inline-flex"
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving) return;
        const raw = draft.trim();
        // Trống = tắt chỉ số này (xóa mục tiêu) — xóa cái không có cũng vô hại
        if (raw === "") {
          if (value === null) {
            setEditing(false);
            return;
          }
          setSaving(true);
          const res = await clearKpiTarget({ userId, month, metric });
          setSaving(false);
          if (res.error) {
            toast.error(t("settings.saveError"));
            return;
          }
          toast.success(t("settings.cleared"));
          setEditing(false);
          void refresh();
          return;
        }
        const n = Math.round(Number(raw));
        if (!Number.isFinite(n) || n <= 0) {
          toast.error(t("settings.invalidTarget"));
          return;
        }
        if (n === value) {
          setEditing(false);
          return;
        }
        setSaving(true);
        const res = await setKpiTarget({ userId, month, metric, target: n });
        setSaving(false);
        if (res.error) {
          toast.error(t("settings.saveError"));
          return;
        }
        toast.success(t("settings.saved"));
        setEditing(false);
        void refresh();
      }}
    >
      <Input
        autoFocus
        type="number"
        inputMode="numeric"
        min={1}
        step={metric === "revenue_won" ? 100000 : 1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
        disabled={saving}
        aria-label={cellLabel}
        className="h-8 w-28 text-right tabular-nums"
      />
    </form>
  );
}

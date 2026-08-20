"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Lock, QrCode } from "lucide-react";
import { TileChart } from "@/components/illustrations/tile-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { ReportNav } from "../report-nav";
import {
  ATTRIBUTION_MODELS,
  DEFAULT_RANGE,
  RANGE_PRESETS,
  currentMonthVN,
  fetchSourceCosts,
  fetchSourceReport,
  pickModel,
  type AttributionModel,
  type RangePreset,
  type SourceCostRow,
  type SourceReportRow,
} from "./types";

/** Màu Lời/Lỗ: dương xanh, âm đỏ, bằng 0 giữ màu chữ thường. */
function profitClass(v: number): string {
  if (v < 0) return "text-destructive";
  if (v > 0) return "text-emerald-600 dark:text-emerald-400";
  return "";
}

/**
 * Ô "Chi phí": bấm là thành ô nhập tiền cho THÁNG HIỆN TẠI (chi phí lưu theo
 * tháng — migration #52). Số hiển thị là TỔNG các tháng chạm khoảng đang xem,
 * nên dưới ô nhập ghi rõ đang sửa tháng nào để không lẫn khi xem 90 ngày.
 * Ai vào được màn này đều là manager trở lên (REPORT_ROLES) nên không cần cờ
 * quyền riêng — RLS/RPC vẫn là chốt quyền thật ở CSDL.
 */
function CostCell({
  displayAmount,
  currentAmount,
  monthLabel,
  onSave,
  locale,
}: {
  /** Tổng chi phí các tháng trong khoảng — null = chưa nhập tháng nào. */
  displayAmount: number | null;
  /** Chi phí THÁNG HIỆN TẠI (đổ sẵn vào ô nhập) — null = chưa có. */
  currentAmount: number | null;
  monthLabel: string;
  onSave: (amount: number) => Promise<void>;
  locale: Locale;
}) {
  const t = useTranslations("reports.sources");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(currentAmount === null ? "" : String(currentAmount));
          setEditing(true);
        }}
        title={
          displayAmount === null
            ? t("cost.editHint")
            : t("cost.editTitle", { month: monthLabel })
        }
        aria-label={t("cost.editTitle", { month: monthLabel })}
        className={cn(
          "rounded-sm tabular-nums underline decoration-dotted underline-offset-2 hover:text-foreground",
          displayAmount === null && "text-muted-foreground",
        )}
      >
        {displayAmount === null ? "—" : formatMoney(displayAmount, locale)}
      </button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const amount = Math.round(Number(draft));
        if (draft.trim() === "" || !Number.isFinite(amount) || amount < 0) return;
        setSaving(true);
        try {
          await onSave(amount);
          toast.success(t("cost.saved", { month: monthLabel }));
          setEditing(false);
        } catch {
          toast.error(t("cost.saveError"));
        } finally {
          setSaving(false);
        }
      }}
      className="inline-flex flex-col items-end gap-0.5"
    >
      <Input
        autoFocus
        type="number"
        inputMode="numeric"
        min={0}
        step={1000}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
        disabled={saving}
        aria-label={t("cost.editTitle", { month: monthLabel })}
        className="h-8 w-28 text-right tabular-nums"
      />
      <span className="text-[11px] whitespace-nowrap text-muted-foreground">
        {t("cost.editingMonth", { month: monthLabel })}
      </span>
    </form>
  );
}

/**
 * "Nguồn nào ra tiền" — bảng + thanh ngang dựng bằng token (KHÔNG thư viện biểu
 * đồ; danh sách thư viện cấm ở eslint.config.mjs giữ codebase gọn).
 * Khoảng thời gian nằm trên URL (?r=) để chia sẻ được; đổi mô hình quy kết là
 * tức thì vì RPC trả sẵn cả 3 mô hình trong một lượt.
 */
export function SourcesView({
  canView,
  initialRange,
  initialRows,
  initialCosts,
  seedSourceNames,
  qrSourceIds,
}: {
  canView: boolean;
  initialRange: RangePreset;
  initialRows?: SourceReportRow[];
  /** Chi phí theo tháng đã nhập trong khoảng ban đầu (migration #52). */
  initialCosts?: SourceCostRow[];
  /** id nguồn → tên hiển thị (nguồn cài sẵn đã dịch, migration #36). */
  seedSourceNames?: Record<string, string>;
  /** id các nguồn ĐANG gắn mã QR — dòng nguồn có link ngược về màn Mã QR. */
  qrSourceIds?: string[];
}) {
  const t = useTranslations("reports.sources");
  const locale = useLocale() as Locale;
  const supabase = useMemo(() => createClient(), []);
  const qrSources = useMemo(() => new Set(qrSourceIds ?? []), [qrSourceIds]);

  const [range, setRange] = useQueryState(
    "r",
    parseAsStringLiteral(RANGE_PRESETS).withDefault(initialRange),
  );
  const [model, setModel] = useQueryState(
    "m",
    parseAsStringLiteral(ATTRIBUTION_MODELS).withDefault("first"),
  );

  const report = useQuery({
    queryKey: ["source-report", range],
    queryFn: () => fetchSourceReport(supabase, range),
    initialData: range === initialRange ? initialRows : undefined,
    enabled: canView,
  });

  // Chi phí lưu THEO THÁNG (migration #52): lấy mọi tháng chạm khoảng đang xem.
  const costsQuery = useQuery({
    queryKey: ["source-costs", range],
    queryFn: () => fetchSourceCosts(supabase, range),
    initialData: range === initialRange ? initialCosts : undefined,
    enabled: canView,
  });
  const queryClient = useQueryClient();
  const month = currentMonthVN();
  const costs = useMemo(() => {
    // sum: tổng các tháng trong khoảng (số hiện trên cột) · current: riêng
    // tháng hiện tại (giá trị đổ vào ô nhập — ô sửa luôn sửa tháng hiện tại)
    const sum = new Map<string, number>();
    const current = new Map<string, number>();
    for (const c of costsQuery.data ?? []) {
      sum.set(c.source_id, (sum.get(c.source_id) ?? 0) + Number(c.amount));
      if (c.month === month.key) current.set(c.source_id, Number(c.amount));
    }
    return { sum, current };
  }, [costsQuery.data, month.key]);

  const saveCost = async (sourceId: string, amount: number) => {
    const { error } = await supabase.rpc("upsert_source_cost", {
      p_source_id: sourceId,
      p_month: month.key,
      p_amount: amount,
    });
    if (error) throw new Error(error.message);
    await queryClient.invalidateQueries({ queryKey: ["source-costs"] });
  };

  if (!canView) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg border bg-card p-8 text-center">
          <div className="rounded-full bg-muted p-4">
            <Lock className="size-8 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold">{t("noPermission.title")}</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t("noPermission.description")}
          </p>
        </div>
      </div>
    );
  }

  // Tên hiển thị chốt TRƯỚC khi sắp xếp: bản tiếng Anh phải xếp theo tên tiếng
  // Anh, không theo tên tiếng Việt đã lưu trong CSDL.
  const baseRows = (report.data ?? []).map((r) => ({
    ...r,
    source_name: r.source_id
      ? (seedSourceNames?.[r.source_id] ?? r.source_name)
      : r.source_name,
  }));
  // Nguồn CÓ chi phí nhưng không có khách/doanh thu trong khoảng vẫn phải lên
  // bảng: nguồn đốt tiền mà không ra gì chính là dòng lỗ cần thấy nhất.
  const inReport = new Set(baseRows.map((r) => r.source_id));
  const costOnlyRows: SourceReportRow[] = [...costs.sum.keys()]
    .filter((id) => !inReport.has(id))
    .map((id) => ({
      source_id: id,
      source_name: seedSourceNames?.[id] ?? null,
      new_contacts: 0,
      deals_first: 0,
      revenue_first: 0,
      deals_last: 0,
      revenue_last: 0,
      deals_linear: 0,
      revenue_linear: 0,
    }));
  const rows = [...baseRows, ...costOnlyRows].sort(
    (a, b) =>
      pickModel(b, model).revenue - pickModel(a, model).revenue ||
      Number(b.new_contacts) - Number(a.new_contacts) ||
      (a.source_name ?? "").localeCompare(b.source_name ?? ""),
  );
  const maxRevenue = Math.max(1, ...rows.map((r) => pickModel(r, model).revenue));
  const totals = rows.reduce(
    (acc, r) => {
      const m = pickModel(r, model);
      const rowCost = r.source_id ? (costs.sum.get(r.source_id) ?? null) : null;
      return {
        newContacts: acc.newContacts + Number(r.new_contacts),
        deals: acc.deals + m.deals,
        revenue: acc.revenue + m.revenue,
        cost: acc.cost + (rowCost ?? 0),
        hasCost: acc.hasCost || rowCost !== null,
      };
    },
    { newContacts: 0, deals: 0, revenue: 0, cost: 0, hasCost: false },
  );
  // Lời/Lỗ tổng chỉ tính được khi ĐÃ nhập ít nhất một dòng chi phí
  const totalProfit = totals.hasCost ? totals.revenue - totals.cost : null;
  const hasRevenue = totals.revenue > 0;
  // Cột "Khách thành đơn" VƯỢT 100% được: cơ hội thắng đếm theo ngày thắng
  // trong kỳ, còn khách mới đếm theo ngày tạo trong kỳ — khách đến từ tháng
  // trước mà chốt trong kỳ này thì lọt vào tử số chứ không lọt mẫu số. Không
  // phải tính sai, nhưng "150% thành đơn" đọc như phần mềm hỏng. Cùng gốc với
  // ghi chú `revenueFromOlderContacts` đã có sẵn cho ca 0 khách mới — đây là
  // nửa còn lại của ca đó, trước giờ bỏ trống.
  const coTiLeVuot = rows.some((r) => {
    const n = Number(r.new_contacts);
    return n > 0 && pickModel(r, model).deals > n;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
        <h1 className="mr-auto min-w-0 truncate text-sm font-semibold">
          {t("title")}
        </h1>
        <div className="flex flex-wrap items-center gap-1">
          {RANGE_PRESETS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={range === p ? "secondary" : "ghost"}
              onClick={() => setRange(p === DEFAULT_RANGE ? null : p)}
            >
              {t(`range.${p}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Từ xl mới nới: bảng báo cáo nhiều cột số, trên màn 1440px khoá 896px
            thì cột bị bóp trong khi hai bên bỏ trống. Ba màn dùng chung thanh
            ReportNav này phải cùng một mốc — lệch nhau thì bấm qua lại giữa
            chúng thấy khung nhảy. Dưới xl giữ nguyên. */}
        <div className="mx-auto w-full max-w-4xl space-y-4 p-4 xl:max-w-6xl">
          {/* Chuyển giữa các màn báo cáo (thêm khi có màn "Vì sao thua") */}
          <ReportNav />

          <div className="space-y-2">
            <Tabs
              value={model}
              onValueChange={(v) =>
                setModel(v === "first" ? null : (v as AttributionModel))
              }
            >
              <TabsList>
                {ATTRIBUTION_MODELS.map((m) => (
                  <TabsTrigger key={m} value={m}>
                    {t(`model.${m}.label`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <p className="text-[13px] text-muted-foreground">
              {t(`model.${model}.explain`)}
            </p>
          </div>

          {report.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : report.isError ? (
            <div className="rounded-lg border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">{t("error")}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => report.refetch()}
              >
                {t("retry")}
              </Button>
            </div>
          ) : !hasRevenue && rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
              <TileChart className="size-16" />
              <h2 className="text-base font-semibold">{t("empty.title")}</h2>
              <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
                {t("empty.description")}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card">
              {!hasRevenue && (
                <p className="border-b bg-muted/40 px-4 py-2.5 text-[13px] text-muted-foreground">
                  {t("empty.title")}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="h-10 border-b">
                      <th className="px-4 font-medium">{t("table.source")}</th>
                      <th className="hidden px-4 text-right font-medium sm:table-cell">
                        {t("table.newContacts")}
                      </th>
                      <th className="hidden px-4 text-right font-medium sm:table-cell">
                        {t("table.wonDeals")}
                      </th>
                      <th className="hidden px-4 text-right font-medium md:table-cell">
                        {t("table.closeRate")}
                      </th>
                      <th className="px-4 text-right font-medium">
                        {t("table.revenue")}
                      </th>
                      <th className="hidden px-4 text-right font-medium sm:table-cell">
                        {t("table.cost")}
                      </th>
                      <th className="hidden px-4 text-right font-medium sm:table-cell">
                        {t("table.profit")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const m = pickModel(r, model);
                      const newContacts = Number(r.new_contacts);
                      const rate =
                        newContacts > 0
                          ? Math.round((m.deals / newContacts) * 100)
                          : null;
                      // "0 khách mới mà vẫn ra tiền" trông như phần mềm tính
                      // sai; nói ngay tại dòng rằng tiền đến từ khách có trước
                      // khoảng đang xem, thay vì bắt đọc ghi chú cuối trang.
                      const fromOlderContacts =
                        rate === null && (m.deals > 0 || m.revenue > 0);
                      // Chi phí + Lời/Lỗ (migration #52). Biến hẹp kiểu để
                      // closure của CostCell không mất narrowing string|null.
                      const sourceId = r.source_id;
                      const cost = sourceId
                        ? (costs.sum.get(sourceId) ?? null)
                        : null;
                      const profit = cost === null ? null : m.revenue - cost;
                      return (
                        <tr key={r.source_id ?? "none"} className="border-b last:border-b-0">
                          <td className="px-4 py-2.5">
                            {r.source_id ? (
                              // Dòng nguồn bấm được → danh sách Khách hàng lọc
                              // đúng nguồn này (?source= trên URL).
                              <Link
                                href={`/app/contacts?source=${r.source_id}`}
                                className={cn(
                                  "block truncate font-medium underline-offset-2 hover:underline",
                                  !r.source_name && "text-muted-foreground",
                                )}
                              >
                                {r.source_name ?? t("table.unknownSource")}
                              </Link>
                            ) : (
                              <p
                                className={cn(
                                  "truncate font-medium",
                                  !r.source_name && "text-muted-foreground",
                                )}
                              >
                                {r.source_name ?? t("table.unknownSource")}
                              </p>
                            )}
                            {/* Nguồn đang gắn mã QR → link ngược về màn Mã QR
                                (chiều xuôi: màn QR có "Xem khách từ nguồn này") */}
                            {r.source_id && qrSources.has(r.source_id) && (
                              <Link
                                href="/app/settings/qr"
                                className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                              >
                                <QrCode className="size-3" />
                                {t("table.qrLink")}
                              </Link>
                            )}
                            {/* Thanh ngang dựng bằng token — tỉ lệ so với nguồn
                                cao nhất. KHÔNG vẽ khi nguồn chưa ra đồng nào:
                                một vạch xám rỗng dài bằng nguồn dẫn đầu không
                                nói lên điều gì, chỉ làm bảng đầy lên và khiến
                                mắt tưởng nguồn đó cũng có phần. */}
                            {m.revenue > 0 && (
                              <div
                                className="mt-1.5 h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-muted"
                                role="presentation"
                              >
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{
                                    width: `${Math.round((m.revenue / maxRevenue) * 100)}%`,
                                  }}
                                />
                              </div>
                            )}
                            {/* 375px: gộp 3 cột ẩn vào 1 dòng phụ để không mất số liệu */}
                            <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                              {fromOlderContacts
                                ? t("table.mobileSummaryOlderContacts", {
                                    contacts: newContacts,
                                    deals: m.deals,
                                  })
                                : t("table.mobileSummary", {
                                    contacts: newContacts,
                                    deals: m.deals,
                                    rate: rate === null ? "—" : `${rate}%`,
                                  })}
                            </p>
                            {/* 375px: cột Chi phí/Lời-Lỗ bị ẩn — quản lý vẫn phải
                                nhập và xem được trên điện thoại, thêm 1 dòng gọn */}
                            {sourceId && (
                              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground sm:hidden">
                                <span>{t("table.cost")}:</span>
                                <CostCell
                                  displayAmount={cost}
                                  currentAmount={costs.current.get(sourceId) ?? null}
                                  monthLabel={month.label}
                                  onSave={(amount) => saveCost(sourceId, amount)}
                                  locale={locale}
                                />
                                {profit !== null && (
                                  <span>
                                    · {t("table.profit")}:{" "}
                                    <span className={profitClass(profit)}>
                                      {formatMoney(profit, locale)}
                                    </span>
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="hidden px-4 text-right tabular-nums sm:table-cell">
                            {newContacts}
                          </td>
                          <td className="hidden px-4 text-right tabular-nums sm:table-cell">
                            {m.deals}
                          </td>
                          <td className="hidden px-4 text-right tabular-nums md:table-cell">
                            {rate !== null ? (
                              `${rate}%`
                            ) : fromOlderContacts ? (
                              <span className="text-xs text-muted-foreground">
                                {t("table.revenueFromOlderContacts")}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 text-right font-medium tabular-nums whitespace-nowrap">
                            {formatMoney(m.revenue, locale)}
                          </td>
                          <td className="hidden px-4 text-right whitespace-nowrap sm:table-cell">
                            {sourceId ? (
                              <CostCell
                                displayAmount={cost}
                                currentAmount={costs.current.get(sourceId) ?? null}
                                monthLabel={month.label}
                                onSave={(amount) => saveCost(sourceId, amount)}
                                locale={locale}
                              />
                            ) : (
                              // "Chưa rõ nguồn" không gắn chi phí được — không
                              // có nguồn nào để gắn dòng chi phí vào
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="hidden px-4 text-right tabular-nums whitespace-nowrap sm:table-cell">
                            {profit === null ? (
                              <span
                                title={t("cost.editHint")}
                                className="cursor-help text-muted-foreground"
                              >
                                —
                              </span>
                            ) : (
                              <>
                                <span className={cn("font-medium", profitClass(profit))}>
                                  {formatMoney(profit, locale)}
                                </span>
                                {/* ROAS chỉ từ md trở lên — cột đã chật, không nhồi */}
                                {cost !== null && cost > 0 && (
                                  <span className="hidden text-xs font-normal text-muted-foreground md:block">
                                    {t("table.roas", {
                                      percent: Math.round((m.revenue / cost) * 100),
                                    })}
                                  </span>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="h-11 border-t bg-muted/40 text-[13px] font-semibold">
                      <td className="px-4">{t("table.total")}</td>
                      <td className="hidden px-4 text-right tabular-nums sm:table-cell">
                        {totals.newContacts}
                      </td>
                      <td className="hidden px-4 text-right tabular-nums sm:table-cell">
                        {totals.deals}
                      </td>
                      <td className="hidden px-4 md:table-cell" />
                      <td className="px-4 text-right tabular-nums whitespace-nowrap">
                        {formatMoney(totals.revenue, locale)}
                      </td>
                      <td className="hidden px-4 text-right tabular-nums whitespace-nowrap sm:table-cell">
                        {totals.hasCost ? formatMoney(totals.cost, locale) : "—"}
                      </td>
                      <td className="hidden px-4 text-right tabular-nums whitespace-nowrap sm:table-cell">
                        {totalProfit === null ? (
                          <span title={t("cost.editHint")}>—</span>
                        ) : (
                          <span className={profitClass(totalProfit)}>
                            {formatMoney(totalProfit, locale)}
                          </span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Hai câu đủ dùng ở ngoài; phần định nghĩa dài (có dấu chia, có so
              sánh với chỉ số màn khác) gập lại. Bốn dòng chữ xám 12px cuối
              trang thì không ai đọc, mà bỏ hẳn thì mất chỗ tra khi số đá nhau. */}
          <div className="text-xs leading-relaxed text-muted-foreground">
            <p>
              {t("footnote.definitions")}
              {` ${t("footnote.costNote")}`}
              {model === "linear" && ` ${t("footnote.linearDeals")}`}
              {coTiLeVuot && ` ${t("footnote.rateOverflow")}`}
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-foreground">
                {t("footnote.definitionsToggle")}
              </summary>
              <p className="mt-2">{t("footnote.definitionsMore")}</p>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}

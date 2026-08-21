"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, Link2, Lock, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Locale } from "@/i18n/config";
import { currentMonthVN, kpiMonthLabel, shiftMonth } from "@/lib/kpi";
import {
  LOST_SHARE_PERIODS,
  SHARE_DAY_OPTIONS,
  SHARE_DEFAULT_DAYS,
  daysLeft,
  formatInTenantTz,
  type ShareReportKey,
} from "@/lib/report-share";
import { createReportShare, revokeReportShare } from "./actions";

export type ShareRow = {
  id: string;
  /** null = bản chụp của một báo cáo không còn trong danh sách đóng. */
  reportKey: ShareReportKey | null;
  periodKey: string;
  hasPassword: boolean;
  expiresAt: string;
  revokedAt: string | null;
  isActive: boolean;
  openCount: number;
  lastOpenedAt: string | null;
  createdAt: string;
};

export type ShareOpenEvent = {
  id: number;
  shareId: string;
  reportKey: ShareReportKey | null;
  periodKey: string;
  ipPrefix: string | null;
  region: string | null;
  device: "mobile" | "desktop" | null;
  at: string;
};

/** Số tháng lùi lại cho ô chọn kỳ của báo cáo Mục tiêu tháng. */
const KPI_MONTHS_BACK = 6;

/** Khoá lỗi CÓ CÂU DỊCH. Mã lạ rơi về "failed" — không im lặng, không đoán. */
const ERROR_KEYS = new Set([
  "invalid_input",
  "not_authenticated",
  "forbidden",
  "no_tenant_context",
  "bad_report",
  "bad_days",
  "bad_payload",
  "payload_too_big",
  "bad_password",
  "not_revocable",
  "report_unavailable",
  "save_failed",
]);

export function ReportSharesView({
  canManage,
  shares,
  openEvents,
  tz,
  loadFailed = false,
  openLogLimit,
}: {
  canManage: boolean;
  shares: ShareRow[];
  openEvents: ShareOpenEvent[];
  tz: string;
  loadFailed?: boolean;
  openLogLimit?: number;
}) {
  const t = useTranslations("settings.reportShares");
  const locale = useLocale() as Locale;

  const [reportKey, setReportKey] = useState<ShareReportKey>("lost_reasons");
  const [lostPeriod, setLostPeriod] = useState<string>("month");
  const [monthKey, setMonthKey] = useState<string>(currentMonthVN());
  const [days, setDays] = useState<number>(SHARE_DEFAULT_DAYS);
  const [password, setPassword] = useState("");
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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

  const periodKey = reportKey === "kpi" ? monthKey : lostPeriod;

  const periodLabel = (rk: ShareReportKey | null, pk: string): string => {
    if (rk === "kpi") return kpiMonthLabel(pk);
    if ((LOST_SHARE_PERIODS as readonly string[]).includes(pk)) return t(`period.${pk}`);
    return pk;
  };
  const reportLabel = (rk: ShareReportKey | null): string =>
    rk ? t(`report.${rk}`) : t("report.unknown");

  const onCreate = () => {
    startTransition(async () => {
      const res = await createReportShare({ reportKey, periodKey, days, password });
      // So với `null` chứ không dùng phép kiểm đúng/sai: chuỗi rỗng cũng là
      // "đúng/sai = sai", và ta cần TS thu hẹp về đúng nhánh có đường dẫn.
      if (res.error !== null) {
        toast.error(t(`errors.${ERROR_KEYS.has(res.error) ? res.error : "save_failed"}`));
        return;
      }
      setNewUrl(res.url);
      setCopied(false);
      setPassword("");
      toast.success(t("toasts.created"));
    });
  };

  const onRevoke = (row: ShareRow) => {
    // Hỏi lại vì việc này CẮT NGAY cái người ngoài đang xem — và không hoàn tác
    // được (mã đã băm, không phát lại được cái cũ).
    if (!window.confirm(t("confirmRevoke", { report: reportLabel(row.reportKey) }))) return;
    startTransition(async () => {
      const res = await revokeReportShare(row.id);
      if (res.error) {
        toast.error(t(`errors.${ERROR_KEYS.has(res.error) ? res.error : "save_failed"}`));
        return;
      }
      toast.success(t("toasts.revoked"));
    });
  };

  const onCopy = async () => {
    if (!newUrl) return;
    try {
      await navigator.clipboard.writeText(newUrl);
      setCopied(true);
      toast.success(t("toasts.copied"));
    } catch {
      // Trình duyệt chặn clipboard (thường vì không phải https) — nói thật và
      // để nguyên đường dẫn trên màn cho người ta tự bôi đen chép tay.
      toast.error(t("errors.copy_failed"));
    }
  };

  const monthOptions = Array.from({ length: KPI_MONTHS_BACK }, (_, i) =>
    shiftMonth(currentMonthVN(), -i),
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-5 p-6">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {t("description")}
          </p>
        </div>

        {loadFailed && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-[13px] text-destructive">
            {t("errors.list_failed")}
          </p>
        )}

        {/* ── Đường dẫn vừa tạo: hiện ĐÚNG MỘT LẦN ─────────────────────── */}
        {newUrl && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
            <p className="text-[13px] font-semibold">{t("created.title")}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t("created.onlyOnce")}
            </p>
            <p className="mt-2.5 rounded-md border bg-background p-2.5 font-mono text-xs break-all">
              {newUrl}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button type="button" onClick={onCopy} className="min-h-11">
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                {t("created.copy")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setNewUrl(null)}
              >
                {t("created.done")}
              </Button>
            </div>
          </div>
        )}

        {/* ── Phát đường dẫn mới ────────────────────────────────────────── */}
        <section className="rounded-lg border p-4">
          <h2 className="text-[15px] font-semibold">{t("create.title")}</h2>

          <div className="mt-3 space-y-3">
            <div>
              <label htmlFor="rs-report" className="text-xs text-muted-foreground">
                {t("create.reportLabel")}
              </label>
              <Select
                id="rs-report"
                className="mt-1"
                value={reportKey}
                onChange={(e) => setReportKey(e.target.value as ShareReportKey)}
              >
                <option value="lost_reasons">{t("report.lost_reasons")}</option>
                <option value="kpi">{t("report.kpi")}</option>
              </Select>
            </div>

            <div>
              <label htmlFor="rs-period" className="text-xs text-muted-foreground">
                {t("create.periodLabel")}
              </label>
              {reportKey === "kpi" ? (
                <Select
                  id="rs-period"
                  className="mt-1"
                  value={monthKey}
                  onChange={(e) => setMonthKey(e.target.value)}
                >
                  {monthOptions.map((m) => (
                    <option key={m} value={m}>
                      {kpiMonthLabel(m)}
                    </option>
                  ))}
                </Select>
              ) : (
                <Select
                  id="rs-period"
                  className="mt-1"
                  value={lostPeriod}
                  onChange={(e) => setLostPeriod(e.target.value)}
                >
                  {LOST_SHARE_PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {t(`period.${p}`)}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <div>
              <label htmlFor="rs-days" className="text-xs text-muted-foreground">
                {t("create.daysLabel")}
              </label>
              <Select
                id="rs-days"
                className="mt-1"
                value={String(days)}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                {SHARE_DAY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {t("create.daysOption", { n: d })}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label htmlFor="rs-password" className="text-xs text-muted-foreground">
                {t("create.passwordLabel")}
              </label>
              <Input
                id="rs-password"
                className="mt-1"
                type="text"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("create.passwordPlaceholder")}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t("create.passwordHint")}</p>
            </div>

            {/* Khối này BẮT BUỘC có: chủ tiệm phải đọc được CHÍNH XÁC cái gì
                sắp ra khỏi tiệm trước khi bấm, không thể tự đoán từ tên báo cáo. */}
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200">
                <AlertTriangle className="size-3.5" aria-hidden />
                {t("preview.title")}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
                {t(`preview.${reportKey}`)}
              </p>
            </div>

            <Button type="button" className="min-h-11 w-full" disabled={pending} onClick={onCreate}>
              <Share2 aria-hidden />
              {t("create.submit")}
            </Button>
          </div>
        </section>

        {/* ── Đang chia sẻ ──────────────────────────────────────────────── */}
        <section>
          <h2 className="text-[15px] font-semibold">{t("list.title")}</h2>
          {shares.length === 0 ? (
            <div className="mt-2 flex flex-col items-center rounded-lg border border-dashed py-8 text-center">
              <Link2 className="size-7 text-muted-foreground/50" aria-hidden />
              <p className="mt-2.5 text-[13px] font-semibold">{t("list.empty")}</p>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {shares.map((row) => {
                const left = daysLeft(row.expiresAt);
                return (
                  <div key={row.id} className="rounded-lg border p-3.5">
                    <p className="text-[13px] font-semibold">
                      {reportLabel(row.reportKey)} · {periodLabel(row.reportKey, row.periodKey)}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {row.revokedAt
                        ? t("list.revoked", {
                            at: formatInTenantTz(row.revokedAt, tz, locale),
                          })
                        : !row.isActive
                          ? t("list.expired", {
                              at: formatInTenantTz(row.expiresAt, tz, locale),
                            })
                          : t("list.active", { n: Math.max(left, 0) })}
                      {row.hasPassword && ` · ${t("list.hasPassword")}`}
                      {` · ${t("list.opened", { n: row.openCount })}`}
                    </p>
                    {row.isActive && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={() => onRevoke(row)}
                        className="mt-2.5 min-h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        {t("list.revokeNow")}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Ai đã mở ──────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-[15px] font-semibold">{t("log.title")}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("log.description")}
          </p>
          {openEvents.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed p-5 text-center text-[13px] text-muted-foreground">
              {t("log.empty")}
            </p>
          ) : (
            <>
              <div className="mt-2 overflow-hidden rounded-lg border">
                {openEvents.map((e, i) => (
                  <div
                    key={e.id}
                    className={i === openEvents.length - 1 ? "px-3.5 py-2.5" : "border-b px-3.5 py-2.5"}
                  >
                    <p className="text-[13px] font-semibold">
                      {reportLabel(e.reportKey)}
                      {e.periodKey && ` · ${periodLabel(e.reportKey, e.periodKey)}`}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatInTenantTz(e.at, tz, locale)}
                      {e.region && ` · ${e.region}`}
                      {e.device && ` · ${t(`log.device.${e.device}`)}`}
                      {e.ipPrefix && ` · ${t("log.machine", { id: e.ipPrefix })}`}
                    </p>
                  </div>
                ))}
              </div>
              {openLogLimit && openEvents.length >= openLogLimit && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("log.limitNote", { n: openLogLimit })}
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

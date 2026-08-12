"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Check, Copy, Download, Lock, Plus, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SITE_URL } from "@/lib/config";
import { weekdayLabelsFor, type StorefrontLocale } from "@/lib/storefront/hours";
import type { TenantPackLeadFormField } from "@/lib/tenant-pack";
import { saveStorefrontConfig, saveBusinessHours, addBusinessClosure, deleteBusinessClosure } from "./actions";

export type StorefrontSettings = {
  slug: string;
  storefrontEnabled: boolean;
  leadFormEnabled: boolean;
  intro: string;
  address: string;
  zaloContactUrl: string;
  enabledFieldKeys: string[];
  fieldCatalog: TenantPackLeadFormField[];
  hours: { id: string; weekday: number; isClosed: boolean; openTime: string | null; closeTime: string | null }[];
  closures: {
    id: string;
    dateFrom: string;
    dateTo: string;
    reason: string;
    isFullDay: boolean;
    openTime: string | null;
    closeTime: string | null;
  }[];
};

type TimeRange = { open: string; close: string };
type DayState = { isClosed: boolean; ranges: TimeRange[] };
type WeekState = Record<number, DayState>;

/** Phần cấu hình mặt tiền — gom vào một object để so sánh "đã đổi chưa" bằng 1 phép. */
type ConfigState = {
  storefrontEnabled: boolean;
  leadFormEnabled: boolean;
  intro: string;
  address: string;
  zaloContactUrl: string;
  fieldKeys: string[];
};

// Thứ hiển thị theo thói quen Việt: T2…T7 rồi CN — KHÁC thứ tự lưu trữ (0=CN
// theo extract(dow), migration #80) nên phải giữ mảng riêng, không suy ra từ index.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Khoá dịch đã CÓ trong messages/*.json (namespace storefront.settings.toasts) — lỗi lạ rơi về "saveFailed". */
const TOAST_KEYS = new Set(["notAuthenticated", "forbidden", "notFound", "invalidInput", "saveFailed"]);
const ERROR_TO_TOAST_KEY: Record<string, string> = {
  not_authenticated: "notAuthenticated",
  forbidden: "forbidden",
  not_found: "notFound",
  invalid_input: "invalidInput",
};
function toastKeyFor(error: string | null | undefined): string {
  const key = error ? (ERROR_TO_TOAST_KEY[error] ?? "") : "";
  return TOAST_KEYS.has(key) ? key : "saveFailed";
}

function toWeekState(rows: StorefrontSettings["hours"]): WeekState {
  const week: WeekState = {};
  for (let w = 0; w <= 6; w++) week[w] = { isClosed: false, ranges: [] };
  for (const r of rows) {
    if (r.isClosed) {
      week[r.weekday] = { isClosed: true, ranges: [] };
    } else if (r.openTime && r.closeTime) {
      week[r.weekday].ranges.push({ open: r.openTime, close: r.closeTime });
      week[r.weekday].isClosed = false;
    }
  }
  return week;
}

/** Chữ ký so sánh — chỉ để biết "có đổi so với bản đã lưu không", không lưu xuống DB. */
function weekSignature(week: WeekState): string {
  return DISPLAY_ORDER.map((w) => {
    const d = week[w];
    if (!d || d.isClosed) return `${w}:closed`;
    return `${w}:${d.ranges.map((r) => `${r.open}-${r.close}`).join(",")}`;
  }).join("|");
}
function configSignature(c: ConfigState): string {
  return JSON.stringify({ ...c, fieldKeys: [...c.fieldKeys].sort() });
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function StorefrontView({
  canManage,
  canConfig,
  initial,
}: {
  canManage: boolean;
  canConfig: boolean;
  initial: StorefrontSettings;
}) {
  const t = useTranslations("storefront.settings");
  const tCommon = useTranslations("common");
  const tChannels = useTranslations("settings.channels");
  const weekdayLabels = weekdayLabelsFor(useLocale() as StorefrontLocale);

  const initialConfig: ConfigState = useMemo(
    () => ({
      storefrontEnabled: initial.storefrontEnabled,
      leadFormEnabled: initial.leadFormEnabled,
      intro: initial.intro,
      address: initial.address,
      zaloContactUrl: initial.zaloContactUrl,
      fieldKeys: initial.enabledFieldKeys,
    }),
    [initial],
  );

  const [config, setConfig] = useState<ConfigState>(initialConfig);
  const [week, setWeek] = useState<WeekState>(() => toWeekState(initial.hours));
  // Bản ĐÃ LƯU — thanh Lưu so với bản này, không so với `initial` (sau khi lưu
  // xong mà vẫn so với initial thì thanh Lưu không bao giờ tắt).
  const [savedConfig, setSavedConfig] = useState<ConfigState>(initialConfig);
  const [savedWeekSig, setSavedWeekSig] = useState(() => weekSignature(toWeekState(initial.hours)));
  const [savePending, startSaveTransition] = useTransition();

  const [copied, setCopied] = useState(false);
  const [downloadingQr, setDownloadingQr] = useState(false);

  const [closures, setClosures] = useState(initial.closures);
  const [closureOpen, setClosureOpen] = useState(false);
  const EMPTY_CLOSURE = {
    dateFrom: "",
    dateTo: "",
    reason: "",
    isFullDay: true,
    openTime: "08:00",
    closeTime: "18:00",
  };
  const [closureForm, setClosureForm] = useState(EMPTY_CLOSURE);
  const [closurePending, startClosureTransition] = useTransition();

  const publicUrl = useMemo(() => `${SITE_URL}/t/${initial.slug}`, [initial.slug]);

  const configDirty = configSignature(config) !== configSignature(savedConfig);
  const hoursDirty = weekSignature(week) !== savedWeekSig;
  const dirty = configDirty || hoursDirty;

  // "Đã bật" KHÔNG có nghĩa là "khách liên hệ được" — cùng bài học với hộp chat
  // (thẻ design man-cai-dat-mat-tien.html, khối 3). Đọc bản ĐÃ LƯU: gõ dở link
  // Zalo trong ô không được phép làm cảnh báo tắt sớm.
  const noContactWay =
    savedConfig.storefrontEnabled && !savedConfig.zaloContactUrl.trim() && !savedConfig.leadFormEnabled;

  if (!canManage) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Lock className="size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium">{tChannels("noPermission.title")}</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">
          {tChannels("noPermission.description")}
        </p>
      </div>
    );
  }

  const patch = (p: Partial<ConfigState>) => setConfig((c) => ({ ...c, ...p }));

  const toggleField = (key: string) =>
    setConfig((c) => ({
      ...c,
      fieldKeys: c.fieldKeys.includes(key)
        ? c.fieldKeys.filter((k) => k !== key)
        : [...c.fieldKeys, key],
    }));

  const discard = () => {
    setConfig(savedConfig);
    setWeek(toWeekState(initial.hours));
    setSavedWeekSig(weekSignature(toWeekState(initial.hours)));
  };

  /**
   * MỘT nút Lưu cho cả màn (thẻ design, khối 1): chủ tiệm sửa giới thiệu VÀ sửa
   * giờ rồi bấm một nút thì phải lưu CẢ HAI. Bản dựng đầu có hai nút riêng nên
   * bấm một nút là mất im lặng nửa số thay đổi.
   * Lưu từng phần rồi báo trung thực: phần nào hỏng thì nói đúng phần đó, và
   * phần đã lưu được vẫn được ghi nhận (không bắt gõ lại).
   */
  const save = () => {
    if (savePending || !dirty) return;
    startSaveTransition(async () => {
      let configOk = !configDirty;
      let hoursOk = !hoursDirty;
      let firstError: string | null = null;

      if (configDirty) {
        const res = await saveStorefrontConfig({
          storefrontEnabled: config.storefrontEnabled,
          leadFormEnabled: config.leadFormEnabled,
          intro: config.intro,
          address: config.address,
          zaloContactUrl: config.zaloContactUrl,
          leadFormFields: config.fieldKeys,
        });
        configOk = !res.error;
        if (res.error) firstError = res.error;
        else setSavedConfig(config);
      }

      if (hoursDirty) {
        const rows = Object.entries(week).flatMap(([weekdayStr, day]) => {
          const weekday = Number(weekdayStr);
          if (day.isClosed) return [{ weekday, isClosed: true }];
          return day.ranges
            .filter((r) => r.open && r.close)
            .map((r) => ({ weekday, isClosed: false, openTime: r.open, closeTime: r.close }));
        });
        const res = await saveBusinessHours(rows);
        hoursOk = !res.error;
        if (res.error && !firstError) firstError = res.error;
        if (!res.error) setSavedWeekSig(weekSignature(week));
      }

      if (configOk && hoursOk) {
        toast.success(t("toasts.saved"));
        return;
      }
      // Một phần hỏng → nói ĐÚNG phần nào hỏng, không báo chung chung "lưu thất bại"
      // (phần kia đã lưu thật, báo sai thì chủ tiệm gõ lại lần nữa vô ích).
      const failedPart = !configOk ? t("unsaved.storefront") : t("unsaved.hours");
      toast.error(t("toasts.partFailed", { part: failedPart, reason: t(`toasts.${toastKeyFor(firstError)}`) }));
    });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success(t("toasts.linkCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard bị chặn — chủ tiệm bôi đen ô để copy tay
    }
  };

  const downloadQr = async () => {
    if (downloadingQr) return;
    setDownloadingQr(true);
    try {
      // 1024px: mã QR này để IN ra dán ở quầy/tờ rơi, không chỉ xem trên màn hình.
      const dataUrl = await QRCode.toDataURL(publicUrl, { width: 1024, margin: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `qr-${initial.slug || "mat-tien"}.png`;
      a.click();
    } catch {
      toast.error(t("toasts.qrFailed"));
    } finally {
      setDownloadingQr(false);
    }
  };

  // ---------- Giờ mở cửa ----------

  const setDayClosed = (weekday: number, isClosed: boolean) =>
    setWeek((prev) => ({
      ...prev,
      [weekday]: isClosed
        ? { isClosed: true, ranges: [] }
        : { isClosed: false, ranges: [{ open: "08:00", close: "18:00" }] },
    }));
  const addRange = (weekday: number) =>
    setWeek((prev) => ({
      ...prev,
      [weekday]: { ...prev[weekday], ranges: [...prev[weekday].ranges, { open: "13:00", close: "18:00" }] },
    }));
  const removeRange = (weekday: number, index: number) =>
    setWeek((prev) => ({
      ...prev,
      [weekday]: { ...prev[weekday], ranges: prev[weekday].ranges.filter((_, i) => i !== index) },
    }));
  const setRange = (weekday: number, index: number, p: Partial<TimeRange>) =>
    setWeek((prev) => ({
      ...prev,
      [weekday]: {
        ...prev[weekday],
        ranges: prev[weekday].ranges.map((r, i) => (i === index ? { ...r, ...p } : r)),
      },
    }));
  const copyMondayToWeek = () => {
    const monday = week[1];
    setWeek((prev) => {
      const next: WeekState = {};
      for (let w = 0; w <= 6; w++) {
        next[w] =
          w === 1 ? prev[1] : { isClosed: monday.isClosed, ranges: monday.ranges.map((r) => ({ ...r })) };
      }
      return next;
    });
  };

  // ---------- Ngày nghỉ (thêm/xoá NGAY, không qua thanh Lưu chung) ----------

  const addClosure = () => {
    if (closurePending) return;
    if (!closureForm.dateFrom || !closureForm.dateTo || !closureForm.reason.trim()) {
      toast.error(t("closures.toasts.missing"));
      return;
    }
    startClosureTransition(async () => {
      const res = await addBusinessClosure({
        dateFrom: closureForm.dateFrom,
        dateTo: closureForm.dateTo,
        reason: closureForm.reason.trim(),
        isFullDay: closureForm.isFullDay,
        openTime: closureForm.isFullDay ? undefined : closureForm.openTime,
        closeTime: closureForm.isFullDay ? undefined : closureForm.closeTime,
      });
      if (res.error || !res.id) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      setClosures((prev) => [
        ...prev,
        {
          id: res.id!,
          dateFrom: closureForm.dateFrom,
          dateTo: closureForm.dateTo,
          reason: closureForm.reason.trim(),
          isFullDay: closureForm.isFullDay,
          openTime: closureForm.isFullDay ? null : closureForm.openTime,
          closeTime: closureForm.isFullDay ? null : closureForm.closeTime,
        },
      ]);
      setClosureForm(EMPTY_CLOSURE);
      setClosureOpen(false);
      toast.success(t("toasts.saved"));
    });
  };

  const removeClosure = (id: string) =>
    startClosureTransition(async () => {
      const res = await deleteBusinessClosure(id);
      if (res.error) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      setClosures((prev) => prev.filter((c) => c.id !== id));
      toast.success(t("toasts.saved"));
    });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
          <div>
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
          </div>

          {noContactWay && (
            <div className="flex items-start gap-2 rounded-lg border bg-status-pending p-3 text-status-pending-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-[13px] font-semibold">{t("warnings.noContact.title")}</p>
                <p className="mt-0.5 text-[13px]">{t("warnings.noContact.body")}</p>
              </div>
            </div>
          )}

          {/* ---------- Mặt tiền tiệm ---------- */}
          <Section title={t("storefront.title")}>
            {!canConfig ? (
              <p className="rounded-md bg-muted/50 p-3 text-[13px] text-muted-foreground">
                {t("storefront.needOwnerAdmin")}
              </p>
            ) : (
              <>
                <Label className="flex cursor-pointer items-start gap-2">
                  <Checkbox
                    checked={config.storefrontEnabled}
                    onChange={(e) => patch({ storefrontEnabled: e.target.checked })}
                  />
                  <span>
                    <span className="block font-medium">{t("storefront.enable")}</span>
                    <span className="block text-[13px] font-normal text-muted-foreground">
                      {t("storefront.enableHint")}
                    </span>
                  </span>
                </Label>

                <div className="rounded-md border bg-muted/40 p-3">
                  <p className="text-[11px] text-muted-foreground">{t("storefront.linkLabel")}</p>
                  <p className="mt-1 break-all text-[13px]">{publicUrl}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={copyLink}>
                      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                      {t("storefront.copyLink")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadQr} disabled={downloadingQr}>
                      <Download className="size-4" />
                      {t("storefront.downloadQr")}
                    </Button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="sf-intro">{t("storefront.introLabel")}</Label>
                  <Textarea
                    id="sf-intro"
                    rows={3}
                    maxLength={160}
                    value={config.intro}
                    onChange={(e) => patch({ intro: e.target.value })}
                    placeholder={t("storefront.introPlaceholder")}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("storefront.introRemaining", { n: 160 - config.intro.length })}
                  </p>
                </div>

                <div>
                  <Label htmlFor="sf-address">{t("storefront.addressLabel")}</Label>
                  <Input
                    id="sf-address"
                    value={config.address}
                    maxLength={200}
                    onChange={(e) => patch({ address: e.target.value })}
                    placeholder={t("storefront.addressPlaceholder")}
                  />
                </div>

                <div>
                  <Label htmlFor="sf-zalo">
                    {t("storefront.zaloLabel")} <span className="text-primary">*</span>
                  </Label>
                  <Input
                    id="sf-zalo"
                    value={config.zaloContactUrl}
                    maxLength={300}
                    onChange={(e) => patch({ zaloContactUrl: e.target.value })}
                    placeholder="https://zalo.me/..."
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">{t("storefront.zaloHint")}</p>
                </div>

                <div className="border-t pt-3">
                  <Label className="flex cursor-pointer items-start gap-2">
                    <Checkbox
                      checked={config.leadFormEnabled}
                      onChange={(e) => patch({ leadFormEnabled: e.target.checked })}
                    />
                    <span>
                      <span className="block font-medium">{t("storefront.enableForm")}</span>
                      <span className="block text-[13px] font-normal text-muted-foreground">
                        {t("storefront.enableFormHint")}
                      </span>
                    </span>
                  </Label>
                  {initial.fieldCatalog.length > 0 && (
                    <div className="mt-2 pl-6">
                      <p className="text-[11px] text-muted-foreground">{t("storefront.extraFields")}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {initial.fieldCatalog.map((f) => {
                          const on = config.fieldKeys.includes(f.key);
                          return (
                            <button
                              key={f.key}
                              type="button"
                              onClick={() => toggleField(f.key)}
                              aria-pressed={on}
                              className={
                                "rounded-full border px-2.5 py-1 text-[12px] " +
                                (on
                                  ? "border-transparent bg-status-pending text-status-pending-foreground"
                                  : "text-muted-foreground")
                              }
                            >
                              {f.label} {on && "✓"}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {t("storefront.extraFieldsHint")}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </Section>

          {/* ---------- Giờ mở cửa ---------- */}
          <Section title={t("hours.title")} description={t("hours.description")}>
            {DISPLAY_ORDER.map((weekday) => {
              const day = week[weekday] ?? { isClosed: false, ranges: [] };
              return (
                <div key={weekday} className="border-b pb-2 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="w-8 text-[13px] font-semibold">{weekdayLabels[weekday]}</span>
                    <Label className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                      <Checkbox
                        checked={!day.isClosed}
                        onChange={(e) => setDayClosed(weekday, !e.target.checked)}
                      />
                      {day.isClosed ? t("hours.closed") : t("hours.open")}
                    </Label>
                  </div>
                  {!day.isClosed && (
                    <div className="mt-1.5 space-y-1.5 pl-8">
                      {day.ranges.map((r, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <Input
                            type="time"
                            value={r.open}
                            onChange={(e) => setRange(weekday, i, { open: e.target.value })}
                            className="h-8 w-28"
                            aria-label={t("hours.openTime")}
                          />
                          <span className="text-muted-foreground">–</span>
                          <Input
                            type="time"
                            value={r.close}
                            onChange={(e) => setRange(weekday, i, { close: e.target.value })}
                            className="h-8 w-28"
                            aria-label={t("hours.closeTime")}
                          />
                          {day.ranges.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeRange(weekday, i)}
                              className="text-muted-foreground hover:text-destructive"
                              aria-label={t("hours.removeRange")}
                            >
                              <X className="size-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addRange(weekday)}
                        className="text-[12px] font-medium text-primary"
                      >
                        + {t("hours.addRange")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            <Button variant="outline" size="sm" onClick={copyMondayToWeek}>
              {t("hours.copyMonday")}
            </Button>
          </Section>

          {/* ---------- Ngày nghỉ (thêm/xoá ngay, KHÔNG qua thanh Lưu chung) ---------- */}
          <Section title={t("closures.title")} description={t("closures.description")}>
            {closures.length > 0 && (
              <div className="space-y-2">
                {closures.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-start justify-between gap-2 rounded-md border border-status-pending bg-status-pending p-2.5 text-status-pending-foreground"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold">{c.reason}</p>
                      <p className="text-[12px]">
                        {c.dateFrom === c.dateTo ? c.dateFrom : `${c.dateFrom} → ${c.dateTo}`} ·{" "}
                        {c.isFullDay ? t("closures.fullDay") : `${c.openTime}–${c.closeTime}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeClosure(c.id)}
                      disabled={closurePending}
                      className="shrink-0 opacity-70 hover:opacity-100"
                      aria-label={t("closures.remove")}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!closureOpen ? (
              <Button size="sm" onClick={() => setClosureOpen(true)}>
                <Plus className="size-4" />
                {t("closures.add")}
              </Button>
            ) : (
              <div className="space-y-2 rounded-md border border-dashed p-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label htmlFor="cl-from">{t("closures.from")}</Label>
                    <Input
                      id="cl-from"
                      type="date"
                      value={closureForm.dateFrom}
                      onChange={(e) => setClosureForm((f) => ({ ...f, dateFrom: e.target.value }))}
                    />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="cl-to">{t("closures.to")}</Label>
                    <Input
                      id="cl-to"
                      type="date"
                      value={closureForm.dateTo}
                      onChange={(e) => setClosureForm((f) => ({ ...f, dateTo: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="cl-reason">{t("closures.reasonLabel")}</Label>
                  <Input
                    id="cl-reason"
                    value={closureForm.reason}
                    maxLength={200}
                    onChange={(e) => setClosureForm((f) => ({ ...f, reason: e.target.value }))}
                    placeholder={t("closures.reasonPlaceholder")}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">{t("closures.reasonHint")}</p>
                </div>
                <Label className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                  <Checkbox
                    checked={closureForm.isFullDay}
                    onChange={(e) => setClosureForm((f) => ({ ...f, isFullDay: e.target.checked }))}
                  />
                  {t("closures.fullDay")}
                </Label>
                {!closureForm.isFullDay && (
                  <div className="flex items-center gap-1.5 pl-6">
                    <Input
                      type="time"
                      value={closureForm.openTime}
                      onChange={(e) => setClosureForm((f) => ({ ...f, openTime: e.target.value }))}
                      className="h-8 w-28"
                      aria-label={t("hours.openTime")}
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="time"
                      value={closureForm.closeTime}
                      onChange={(e) => setClosureForm((f) => ({ ...f, closeTime: e.target.value }))}
                      className="h-8 w-28"
                      aria-label={t("hours.closeTime")}
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setClosureForm(EMPTY_CLOSURE);
                      setClosureOpen(false);
                    }}
                    disabled={closurePending}
                  >
                    {tCommon("cancel")}
                  </Button>
                  <Button size="sm" onClick={addClosure} disabled={closurePending}>
                    {t("closures.confirmAdd")}
                  </Button>
                </div>
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* MỘT thanh Lưu cho cả màn, dính đáy, chỉ hiện khi có thay đổi chưa lưu.
          Nêu TÊN KHỐI đang chờ lưu (không nêu con số) — trên điện thoại khối kia
          thường đã cuộn khuất, "còn 3 thay đổi" không giúp tìm ra chúng ở đâu. */}
      {dirty && (
        <div className="border-t bg-background shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          <div className="mx-auto flex w-full max-w-2xl items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            <p className="min-w-0 flex-1 text-[12px] leading-snug text-muted-foreground">
              {t("unsaved.label")}{" "}
              <span className="font-medium text-foreground">
                {[configDirty ? t("unsaved.storefront") : null, hoursDirty ? t("unsaved.hours") : null]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </p>
            <Button variant="outline" size="sm" onClick={discard} disabled={savePending}>
              {t("unsaved.discard")}
            </Button>
            <Button size="sm" onClick={save} disabled={savePending}>
              {savePending ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

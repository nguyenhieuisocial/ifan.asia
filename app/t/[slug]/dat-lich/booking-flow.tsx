"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addDaysToDateKey,
  computeOpenRanges,
  weekdayOfDateKey,
  type DayClosureOverride,
} from "@/lib/booking/schedule";
import { weekdayLabelsFor, type StorefrontLocale } from "@/lib/storefront/hours";
import type { StorefrontBookingItem } from "../storefront-data";
import {
  fetchStorefrontSlots,
  submitStorefrontBooking,
  type StorefrontSlot,
} from "../actions";

/** Cùng luật chuẩn hoá SĐT VN đang dùng ở form nhận khách và ở `storefront_book`. */
const PHONE_RE = /^0\d{9,10}$/;

/** Bốn tuần kể từ hôm nay — trần đặt trước ở CSDL là 60 ngày, màn chỉ mở 28. */
const DAYS_SHOWN = 28;

/**
 * Mã lỗi của `storefront_book` → khoá câu chữ. Lỗi KHÔNG có tên ở đây rơi về
 * "generic" — cấm im lặng, khách luôn phải nhận một câu.
 * ('slot_taken' và 'slot_invalid' xử lý riêng: chúng còn phải đưa khách VỀ bước
 * chọn giờ và nạp lại danh sách, không chỉ hiện chữ.)
 */
const MESSAGE_KEY: Record<string, string> = {
  rate_limited: "rateLimited",
  booking_disabled: "bookingDisabled",
  item_not_found: "itemNotFound",
  no_staff: "noStaff",
};

type Step = "service" | "date" | "time" | "info" | "done";

type Done = {
  dateKey: string;
  label: string;
  itemName: string;
  durationMinutes: number;
};

export type BookingHourRow = {
  weekday: number;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
};

export type BookingClosureRow = {
  date_from: string;
  date_to: string;
  reason: string;
  is_full_day: boolean;
  open_time: string | null;
  close_time: string | null;
};

/** "T6, 22/08" — thuần chuỗi ngày, KHÔNG đụng múi giờ (bài học #99, #192). */
function dayLabel(dateKey: string, locale: StorefrontLocale): string {
  const labels = weekdayLabelsFor(locale);
  return `${labels[weekdayOfDateKey(dateKey)]}, ${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`;
}

export function BookingFlow({
  slug,
  shopName,
  todayKey,
  items,
  hours,
  closures,
  zaloUrl,
  mauNen,
}: {
  slug: string;
  shopName: string;
  /** Ngày HÔM NAY theo lịch của TIỆM — CSDL tính sẵn, tầng web không tính lại. */
  todayKey: string;
  items: StorefrontBookingItem[];
  hours: BookingHourRow[];
  closures: BookingClosureRow[];
  zaloUrl: string | null;
  /** Màu thương hiệu tiệm (#334) — cùng màu với trang mặt tiền. */
  mauNen: string;
}) {
  const t = useTranslations("storefront.public.booking");
  const locale = useLocale() as StorefrontLocale;

  const [step, setStep] = useState<Step>("service");
  const [item, setItem] = useState<StorefrontBookingItem | null>(null);
  const [dateKey, setDateKey] = useState<string>("");
  const [slots, setSlots] = useState<StorefrontSlot[]>([]);
  const [closureReason, setClosureReason] = useState<string | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [start, setStart] = useState<string>("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [loadingSlots, startLoadingSlots] = useTransition();
  const [saving, startSaving] = useTransition();

  const money = (n: number) => n.toLocaleString(locale === "vi" ? "vi-VN" : "en-US");

  /** Khung giờ mở cửa của một ngày — ngày nghỉ ĐÈ giờ thường (cùng luật với CSDL). */
  const closureFor = useCallback(
    (key: string): DayClosureOverride => {
      const c = closures.find((x) => x.date_from <= key && key <= x.date_to);
      return c
        ? { is_full_day: c.is_full_day, open_time: c.open_time, close_time: c.close_time }
        : null;
    },
    [closures],
  );

  const dayIsOpen = useCallback(
    (key: string): boolean => {
      const wd = weekdayOfDateKey(key);
      return computeOpenRanges(
        hours.filter((h) => h.weekday === wd),
        closureFor(key),
      ).length > 0;
    },
    [hours, closureFor],
  );

  const loadSlots = useCallback(
    (chosenItem: StorefrontBookingItem, key: string) => {
      startLoadingSlots(async () => {
        setSlotsError(null);
        const res = await fetchStorefrontSlots({ slug, itemId: chosenItem.id, dateKey: key });
        if (res.error) {
          setSlots([]);
          setClosureReason(null);
          setSlotsError(t(`errors.${res.error === "throttled" ? "rateLimited" : "generic"}`));
          return;
        }
        setSlots(res.slots);
        setClosureReason(res.closure?.reason ?? null);
      });
    },
    [slug, t],
  );

  const pickDate = (key: string) => {
    if (!item) return;
    setDateKey(key);
    setStart("");
    setStep("time");
    loadSlots(item, key);
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving || !item) return;
    setPhoneError(null);
    setFormError(null);

    const trimmedName = fullName.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName) {
      setFormError(t("errors.nameRequired"));
      return;
    }
    if (!PHONE_RE.test(trimmedPhone)) {
      setPhoneError(t("errors.phoneInvalid"));
      return;
    }

    startSaving(async () => {
      const res = await submitStorefrontBooking({
        slug,
        itemId: item.id,
        start,
        fullName: trimmedName,
        phone: trimmedPhone,
        note: note.trim(),
      });
      if (res.error) {
        if (res.error === "invalid_phone") {
          setPhoneError(t("errors.phoneInvalid"));
          return;
        }
        // Giờ vừa bị người khác giữ mất (CSDL phán, không phải màn hình đoán):
        // đưa khách VỀ bước chọn giờ và nạp lại danh sách — tên và số đã gõ
        // vẫn còn nguyên, không bắt gõ lại.
        if (res.error === "slot_taken" || res.error === "slot_invalid") {
          setStep("time");
          setStart("");
          setSlotsError(t(`errors.${res.error === "slot_taken" ? "slotTaken" : "slotInvalid"}`));
          loadSlots(item, dateKey);
          return;
        }
        setFormError(t(`errors.${MESSAGE_KEY[res.error] ?? "generic"}`));
        return;
      }
      setDone({
        dateKey: res.dateKey,
        label: res.label,
        itemName: res.itemName,
        durationMinutes: res.durationMinutes,
      });
      setStep("done");
    });
  };

  // ── Màn XONG ────────────────────────────────────────────────────────────
  if (step === "done" && done) {
    return (
      <div className="rounded-lg border p-6 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-status-closed text-lg text-status-closed-foreground">
          ✓
        </div>
        <p className="mt-3 text-sm font-semibold">{t("done.title")}</p>
        <p className="mt-2 text-[13px] font-semibold leading-relaxed">
          {t("done.when", { date: dayLabel(done.dateKey, locale), time: done.label })}
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {done.itemName} · {t("minutes", { n: done.durationMinutes })}
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          {t("done.confirmHint", { shop: shopName })}
        </p>
        {zaloUrl && (
          <a
            href={zaloUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex h-11 items-center justify-center rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: mauNen }}
          >
            {t("done.zalo")}
          </a>
        )}
        <Link
          href={`/t/${slug}`}
          className="mt-2.5 flex h-11 items-center justify-center rounded-lg border text-sm font-medium"
        >
          {t("done.backToShop")}
        </Link>
      </div>
    );
  }

  const stepNumber = step === "service" ? 1 : step === "date" ? 2 : step === "time" ? 3 : 4;

  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {t("stepOf", { n: stepNumber })}
      </p>

      {/* ── Bước 1: chọn dịch vụ ── */}
      {step === "service" && (
        <>
          <h2 className="mt-1 text-base font-semibold">{t("step1Title")}</h2>
          <div className="mt-3 space-y-2">
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  setItem(it);
                  setStep("date");
                }}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border p-3 text-left"
              >
                <span className="text-[13px] font-semibold">{it.name}</span>
                <span className="shrink-0 text-[12px] text-muted-foreground">
                  {t("minutes", { n: it.duration_minutes })} · {money(it.price_vnd)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Bước 2: chọn ngày ── */}
      {step === "date" && item && (
        <>
          <h2 className="mt-1 text-base font-semibold">{t("step2Title")}</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {item.name} · {t("minutes", { n: item.duration_minutes })}
          </p>
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {Array.from({ length: DAYS_SHOWN }, (_, i) => addDaysToDateKey(todayKey, i)).map((key) => {
              const open = dayIsOpen(key);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!open}
                  onClick={() => pickDate(key)}
                  className={`flex h-11 flex-col items-center justify-center rounded-lg border text-[10px] ${
                    open ? "text-muted-foreground" : "bg-muted/40 text-muted-foreground/40"
                  }`}
                >
                  <span>{weekdayLabelsFor(locale)[weekdayOfDateKey(key)]}</span>
                  <span className={`text-[12px] ${open ? "font-semibold text-foreground" : ""}`}>
                    {key.slice(8, 10)}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{t("closedDayHint")}</p>
          <button
            type="button"
            onClick={() => setStep("service")}
            className="mt-3 flex h-11 w-full items-center justify-center rounded-lg border text-sm font-medium"
          >
            {t("back")}
          </button>
        </>
      )}

      {/* ── Bước 3: chọn giờ ── */}
      {step === "time" && item && (
        <>
          <h2 className="mt-1 text-base font-semibold">{t("step3Title")}</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {dayLabel(dateKey, locale)} · {t("minutes", { n: item.duration_minutes })}
          </p>

          {slotsError && (
            <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-[12px] text-destructive">
              {slotsError}
            </p>
          )}

          {loadingSlots && <p className="mt-3 text-[13px] text-muted-foreground">{t("loading")}</p>}

          {!loadingSlots && closureReason && (
            <div className="mt-3 rounded-lg bg-muted p-3 text-center">
              <p className="text-[13px] font-semibold">{t("closedDay")}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{closureReason}</p>
            </div>
          )}

          {!loadingSlots && !closureReason && slots.length === 0 && !slotsError && (
            <p className="mt-3 rounded-lg bg-muted p-3 text-center text-[13px] text-muted-foreground">
              {t("noSlots")}
            </p>
          )}

          {!loadingSlots && slots.length > 0 && (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {slots.map((s) => (
                  <button
                    key={s.start}
                    type="button"
                    disabled={s.taken}
                    onClick={() => {
                      setStart(s.start);
                      setStep("info");
                    }}
                    className={`flex h-11 items-center justify-center rounded-lg border text-[13px] ${
                      s.taken
                        ? "bg-muted/40 text-muted-foreground/50 line-through"
                        : "font-medium"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">{t("takenHint")}</p>
            </>
          )}

          <button
            type="button"
            onClick={() => setStep("date")}
            className="mt-3 flex h-11 w-full items-center justify-center rounded-lg border text-sm font-medium"
          >
            {t("pickAnotherDay")}
          </button>
        </>
      )}

      {/* ── Bước 4: tên + số điện thoại ── */}
      {step === "info" && item && (
        <form onSubmit={submit}>
          <h2 className="mt-1 text-base font-semibold">{t("step4Title")}</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {t("chosen", {
              date: dayLabel(dateKey, locale),
              time: slots.find((s) => s.start === start)?.label ?? "",
              item: item.name,
            })}
          </p>

          <div className="mt-3 space-y-2.5">
            <div>
              <label htmlFor="bk-name" className="text-[12px] text-muted-foreground">
                {t("nameLabel")} <span className="text-primary">*</span>
              </label>
              <Input
                id="bk-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t("namePlaceholder")}
                maxLength={120}
                required
              />
            </div>

            <div>
              <label htmlFor="bk-phone" className="text-[12px] text-muted-foreground">
                {t("phoneLabel")} <span className="text-primary">*</span>
              </label>
              <Input
                id="bk-phone"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09xx xxx xxx"
                maxLength={20}
                aria-invalid={!!phoneError}
                required
              />
              {phoneError && <p className="mt-1 text-[12px] text-destructive">{phoneError}</p>}
            </div>

            <div>
              <label htmlFor="bk-note" className="text-[12px] text-muted-foreground">
                {t("noteLabel")}{" "}
                <span className="text-muted-foreground/70">({t("optional")})</span>
              </label>
              <Textarea
                id="bk-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={2}
              />
            </div>

            {formError && <p className="text-[12px] text-destructive">{formError}</p>}

            <button
              type="submit"
              disabled={saving}
              className="flex h-11 w-full items-center justify-center rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: mauNen }}
            >
              {saving ? t("submitting") : t("submit")}
            </button>
            <button
              type="button"
              onClick={() => setStep("time")}
              className="flex h-11 w-full items-center justify-center rounded-lg border text-sm font-medium"
            >
              {t("back")}
            </button>
            <p className="text-center text-[11px] text-muted-foreground">{t("privacyHint")}</p>
          </div>
        </form>
      )}
    </div>
  );
}

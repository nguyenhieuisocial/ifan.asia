import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import {
  computeStorefrontStatus,
  weekdayLabelsFor,
  type StorefrontClosureRow,
  type StorefrontHourRow,
  type StorefrontLocale,
  type StorefrontStatus,
} from "@/lib/storefront/hours";
import type { TenantPackLeadFormField } from "@/lib/tenant-pack";
import { StorefrontLeadForm } from "./lead-form";

// Trang công khai — KHÔNG đăng nhập, dữ liệu đổi theo giờ thật (đang mở/đóng)
// nên không được cache tĩnh (đúng nguyên tắc app/invite/[token]/page.tsx).
export const dynamic = "force-dynamic";

type StorefrontViewData = {
  enabled: boolean;
  name?: string;
  intro?: string | null;
  address?: string | null;
  zalo_contact_url?: string | null;
  lead_form_enabled?: boolean;
  lead_form_fields?: TenantPackLeadFormField[];
  timezone?: string;
  now?: string;
  today_weekday?: number;
  hours?: StorefrontHourRow[];
  closures?: StorefrontClosureRow[];
};

async function fetchStorefront(slug: string): Promise<StorefrontViewData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("storefront_view", { p_slug: slug });
  // 'not_found' (chưa từng có tiệm) VÀ mọi lỗi khác đều rơi về CÙNG một kết quả
  // (null → notFound()) — không lộ khác biệt nào cho khách vãng lai (ADR-0008 mục 5).
  if (error || !data) return null;
  return data as StorefrontViewData;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const d = await fetchStorefront(slug);
  if (!d || !d.enabled) return {};
  return {
    title: d.name,
    description: d.intro || undefined,
    // ADR-0008 mục 4: /t/[slug] là mặt tiền — PHẢI cho Google đánh chỉ mục
    // (ngược hẳn /k/[token] sau này — noindex). Đừng đổi dòng này khi không đọc ADR.
    robots: { index: true, follow: true },
  };
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/**
 * Khuôn mã QR — đúng bằng `qr_codes.code` check ở CSDL (migration #24).
 *
 * `?ifan_qr` do `app/q/[code]/route.ts` gắn khi khách quét mã, nhưng nó nằm
 * TRÊN URL nên ai cũng sửa được: lọc ở đây để chuỗi tuỳ ý không đi tiếp, và mã
 * trượt khuôn thì coi như không có — KHÔNG chặn khách để lại số (cùng luật
 * "mềm" của migration #201).
 */
const QR_CODE_RE = /^[a-z0-9]{8,16}$/;

export default async function StorefrontPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ifan_qr?: string | string[] }>;
}) {
  const { slug } = await params;
  const sp = await searchParams; // Next 16: searchParams phải await
  const rawQr = typeof sp.ifan_qr === "string" ? sp.ifan_qr.trim().toLowerCase() : "";
  const qrCode = QR_CODE_RE.test(rawQr) ? rawQr : undefined;
  const locale = (await getLocale()) as StorefrontLocale;
  const t = await getTranslations("storefront.public");
  const d = await fetchStorefront(slug);
  if (!d) notFound();

  if (!d.enabled) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-muted text-lg text-muted-foreground">
            ◼
          </div>
          <p className="mt-3 text-sm font-semibold">{t("disabled.title")}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {t("disabled.body")}
          </p>
        </div>
      </main>
    );
  }

  const hours = d.hours ?? [];
  const closures = d.closures ?? [];
  const status = computeStorefrontStatus({
    now: d.now ?? "",
    todayWeekday: d.today_weekday ?? 0,
    hours,
    closures,
    locale,
  });
  const zaloUrl = d.zalo_contact_url;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-background">
      <div className="h-20 bg-gradient-to-br from-muted to-secondary" />
      <div className="px-5 pb-10">
        <div className="-mt-8 flex size-16 items-center justify-center rounded-2xl border bg-card text-xl font-bold text-primary shadow-sm">
          {initialsOf(d.name ?? "") || "?"}
        </div>
        <h1 className="mt-3 text-lg font-semibold">{d.name}</h1>

        <StatusLine status={status} t={t} />

        {d.intro && (
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{d.intro}</p>
        )}

        <div className="mt-4 space-y-2.5">
          {zaloUrl && (
            <a
              href={zaloUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
            >
              {t("zaloButton")}
            </a>
          )}
          {d.lead_form_enabled && (
            <StorefrontLeadForm
              slug={slug}
              fields={d.lead_form_fields ?? []}
              statusForCallback={status}
              qrCode={qrCode}
            />
          )}
          {!zaloUrl && !d.lead_form_enabled && (
            <p className="rounded-lg bg-muted/50 p-3 text-center text-[13px] text-muted-foreground">
              {t("noContact")}
            </p>
          )}
        </div>

        {hours.length > 0 && (
          <HoursBlock hours={hours} todayWeekday={d.today_weekday ?? 0} locale={locale} t={t} />
        )}

        {d.address && (
          <div className="mt-4 flex h-16 items-center justify-center rounded-lg bg-muted text-center text-[12px] text-muted-foreground">
            📍 {d.address}
          </div>
        )}
      </div>
    </main>
  );
}

function StatusLine({
  status,
  t,
}: {
  status: StorefrontStatus;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  if (status.kind === "no_hours") return null;

  if (status.kind === "closure") {
    return (
      <div className="mt-2.5 rounded-lg border bg-status-pending p-2.5 text-status-pending-foreground">
        <p className="text-[13px] font-semibold">{status.reason}</p>
        {status.reopensLabel && (
          <p className="mt-0.5 text-[12px]">{t("closureReopens", { date: status.reopensLabel })}</p>
        )}
      </div>
    );
  }

  if (status.kind === "open") {
    return (
      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px]">
        <span className="rounded-full bg-status-closed px-2 py-0.5 font-medium text-status-closed-foreground">
          ● {t("openNow")}
        </span>
        <span className="text-muted-foreground">· {t("closesAt", { time: status.closesAtLabel })}</span>
      </p>
    );
  }

  return (
    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px]">
      <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
        ● {t("closedNow")}
      </span>
      {status.reopensLabel && (
        <span className="text-muted-foreground">· {t("reopensAt", { time: status.reopensLabel })}</span>
      )}
    </p>
  );
}

function HoursBlock({
  hours,
  todayWeekday,
  locale,
  t,
}: {
  hours: StorefrontHourRow[];
  todayWeekday: number;
  locale: StorefrontLocale;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const byWeekday = new Map<number, StorefrontHourRow[]>();
  for (const h of hours) {
    const list = byWeekday.get(h.weekday) ?? [];
    list.push(h);
    byWeekday.set(h.weekday, list);
  }
  const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const weekdayLabels = weekdayLabelsFor(locale);

  return (
    <div className="mt-4 border-t pt-3">
      <p className="text-[11px] text-muted-foreground">{t("hoursTitle")}</p>
      <div className="mt-1.5 space-y-1">
        {DISPLAY_ORDER.map((weekday) => {
          const rows = byWeekday.get(weekday) ?? [];
          const isToday = weekday === todayWeekday;
          const closed = rows.length === 0 || rows.every((r) => r.is_closed);
          const label = closed
            ? t("dayClosed")
            : rows
                .filter((r) => !r.is_closed && r.open_time && r.close_time)
                .map((r) => `${r.open_time}–${r.close_time}`)
                .join(" · ");
          return (
            <div
              key={weekday}
              className={`flex justify-between text-[12px] ${isToday ? "font-semibold" : "text-muted-foreground"}`}
            >
              <span>{isToday ? t("today", { day: weekdayLabels[weekday] }) : weekdayLabels[weekday]}</span>
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

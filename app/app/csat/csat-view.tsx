"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { NutChiaSe } from "@/components/ui/nut-chia-se";

type SurveyRow = {
  id: string;
  token: string;
  rating: number | null;
  comment: string | null;
  submitted_at: string | null;
  created_at: string;
  appointments: {
    start_at: string | null;
    contacts: { full_name: string; phone: string | null } | null;
    items: { name: string } | null;
  } | null;
};

function StarRating({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`size-3.5 ${s <= value ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </span>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function avgRating(surveys: SurveyRow[]): number | null {
  const rated = surveys.filter((s) => s.rating !== null);
  if (!rated.length) return null;
  return rated.reduce((sum, s) => sum + (s.rating ?? 0), 0) / rated.length;
}

export function CsatView({
  surveys,
  limit,
}: {
  surveys: SurveyRow[];
  limit: number;
}) {
  const t = useTranslations("csat");
  const avg = avgRating(surveys);
  const submitted = surveys.filter((s) => s.submitted_at !== null);

  // Gốc địa chỉ, đọc một lần. `NutChiaSe` lo phần chia sẻ / chép và cả việc
  // báo cho người dùng biết vừa xảy ra chuyện gì.
  const goc = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
          {/* Header + summary */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">{t("title")}</h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {t("description", {
                  total: surveys.length,
                  submitted: submitted.length,
                })}
              </p>
            </div>
            {avg !== null && (
              <div className="shrink-0 rounded-lg border bg-muted/40 px-4 py-2 text-center">
                <p className="text-2xl font-semibold">{avg.toFixed(1)}</p>
                <StarRating value={Math.round(avg)} />
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t("avgLabel", { count: submitted.length })}
                </p>
              </div>
            )}
          </div>

          {/* List */}
          {surveys.length === 0 ? (
            <div className="rounded-xl border bg-muted/20 p-8 text-center text-[13px] text-muted-foreground">
              {t("empty")}
            </div>
          ) : (
            <div className="divide-y rounded-xl border bg-card">
              {surveys.map((s) => {
                const appt = s.appointments;
                const contact = appt?.contacts;
                const item = appt?.items;
                return (
                  <div key={s.id} className="flex items-start gap-3 p-3 sm:p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13px] font-medium">
                          {contact?.full_name ?? t("unknownContact")}
                        </span>
                        {contact?.phone && (
                          <span className="text-[12px] text-muted-foreground">
                            {contact.phone}
                          </span>
                        )}
                        {item?.name && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {item.name}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {s.rating ? (
                          <StarRating value={s.rating} />
                        ) : (
                          <span className="text-[12px] text-muted-foreground italic">
                            {t("pending")}
                          </span>
                        )}
                        {s.comment && (
                          <p className="text-[12px] text-muted-foreground">
                            &ldquo;{s.comment}&rdquo;
                          </p>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                        <span>{fmtDate(appt?.start_at ?? s.created_at)}</span>
                        {!s.submitted_at && (
                          /* CHIA SẺ chứ không chỉ chép. Trên điện thoại, một
                             chạm là gửi thẳng cho khách qua Zalo; trước đây
                             phải chép, thoát app, mở Zalo, tìm khách, dán. */
                          <NutChiaSe
                            noiDung={`${goc}/survey/${s.token}`}
                            tieuDe={t("shareTitle")}
                            nhan={t("copyLink")}
                            bienThe="ghost"
                            className="px-1 underline underline-offset-2"
                          />
                        )}
                        {s.submitted_at && (
                          <span className="text-green-600">
                            {t("submittedOn", { date: fmtDate(s.submitted_at) })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Chạm trần thì NÓI RA — không để người dùng tưởng đây là tất cả. */}
          {surveys.length >= limit && (
            <p className="text-center text-[12px] text-muted-foreground">
              {t("limitNote", { limit })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

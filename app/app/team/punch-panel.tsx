"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Clock, LogIn, LogOut, MapPin, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import { chamCong, datViTriTiem } from "./actions";
import {
  khoangCachM,
  PUNCH_LIST_LIMIT,
  WORK_RADIUS_M,
  type Employee,
  type Punch,
  type WorkLocation,
} from "./queries";
import { toastKeyFor } from "./toast-keys";

type Toado = { lat: number; lng: number };

/**
 * Chấm công (quyết định 1 của thẻ man-nhan-su-cham-cong.html): MỘT NÚT, có
 * kiểm tra vị trí, nhưng ở ngoài vùng thì GẮN CỜ + hỏi lý do — KHÔNG CHẶN.
 * Chặn cứng là ngày mất sóng GPS cả tiệm không ai chấm được.
 */
export function PunchPanel({
  me,
  punches,
  workLocation,
  canHr,
}: {
  me: Employee | null;
  punches: Punch[];
  workLocation: WorkLocation | null;
  canHr: boolean;
}) {
  const t = useTranslations("hr");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toado, setToado] = useState<Toado | null>(null);
  const [geoState, setGeoState] = useState<"asking" | "ok" | "denied">("asking");
  const [reason, setReason] = useState("");
  // Giờ hiện tại VÀ ngày hôm nay đều là "thứ đọc từ đồng hồ" — chỉ đọc SAU khi
  // gắn vào trình duyệt. Đọc lúc render thì máy chủ và máy khách ra hai kết quả
  // (hydration mismatch) và hàm render hết thuần khiết.
  const [now, setNow] = useState("");
  const [todayKey, setTodayKey] = useState("");

  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      setNow(formatTime(t, locale));
      setTodayKey(new Date(t + 7 * 3600 * 1000).toISOString().slice(0, 10));
    };
    const id = setInterval(tick, 30_000);
    tick();
    return () => clearInterval(id);
  }, [locale]);

  useEffect(() => {
    let conSong = true;
    const hong = () => {
      if (conSong) setGeoState("denied");
    };
    // Không setState THẲNG trong thân effect: mọi lối thoát đều đi qua callback
    // (hoặc một mốc hẹn giờ) để React không phải render dây chuyền.
    if (!navigator.geolocation) {
      const id = setTimeout(hong, 0);
      return () => {
        conSong = false;
        clearTimeout(id);
      };
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!conSong) return;
        setToado({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoState("ok");
      },
      hong,
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
    return () => {
      conSong = false;
    };
  }, []);

  if (!me) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm font-medium">{t("noProfile.title")}</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
          {t("noProfile.description")}
        </p>
      </div>
    );
  }

  const todayPunches = punches.filter(
    (p) => new Date(new Date(p.punchedAt).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10) === todayKey,
  );
  // Lần chấm kế tiếp: chưa chấm vào hôm nay ⇒ "vào ca"; vừa chấm vào ⇒ "tan ca".
  const nextKind: "in" | "out" = todayPunches[0]?.kind === "in" ? "out" : "in";

  const distance =
    workLocation && toado ? khoangCachM(workLocation, toado) : null;
  // Không biết toạ độ tiệm, hoặc không lấy được vị trí ⇒ máy chủ ghi
  // `distance_m = null` ⇒ trigger gắn cờ ⇒ BẮT BUỘC có lý do.
  const willFlag = distance === null || distance > WORK_RADIUS_M;
  const canSubmit = !willFlag || reason.trim().length > 0;

  function doPunch() {
    startTransition(async () => {
      const res = await chamCong({
        kind: nextKind,
        lat: toado?.lat ?? null,
        lng: toado?.lng ?? null,
        reason: reason.trim() || null,
      });
      if (res.error) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      toast.success(t(nextKind === "in" ? "punch.savedIn" : "punch.savedOut"));
      setReason("");
      router.refresh();
    });
  }

  function saveShopLocation() {
    if (!toado) {
      toast.error(t("toasts.geoDenied"));
      return;
    }
    startTransition(async () => {
      const res = await datViTriTiem(toado);
      if (res.error) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      toast.success(t("punch.shopLocationSaved"));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{me.fullName}</p>
            <p className="text-[13px] text-muted-foreground">{t("punch.todayLabel")}</p>
          </div>
          <p className="flex items-center gap-1 text-2xl font-bold tabular-nums">
            <Clock className="size-4 text-muted-foreground" />
            {now || "—"}
          </p>
        </div>

        {/* Trạng thái vị trí — nói THẲNG đang biết gì, không vờ như đã kiểm tra xong. */}
        <div
          className={cn(
            "mt-3 flex items-start gap-2 rounded-md p-2.5 text-[13px]",
            willFlag ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
          )}
        >
          {willFlag ? (
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          ) : (
            <MapPin className="mt-0.5 size-4 shrink-0" />
          )}
          <span>
            {!workLocation
              ? t("punch.noShopLocation")
              : geoState === "denied"
                ? t("punch.geoDenied")
                : geoState !== "ok"
                  ? t("punch.geoAsking")
                  : willFlag
                    ? t("punch.outOfRange", { distance: distance ?? 0 })
                    : t("punch.inRange")}
          </span>
        </div>

        {canHr && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={saveShopLocation}
              disabled={pending || geoState !== "ok"}
            >
              <MapPin className="mr-1 size-3.5" />
              {workLocation ? t("punch.updateShopLocation") : t("punch.setShopLocation")}
            </Button>
            <span className="text-xs text-muted-foreground">{t("punch.setShopLocationHint")}</span>
          </div>
        )}

        {willFlag && (
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="punch-reason">{t("punch.reasonLabel")}</Label>
            <Textarea
              id="punch-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder={t("punch.reasonPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">{t("punch.reasonHint")}</p>
          </div>
        )}

        <Button className="mt-3 w-full" size="lg" onClick={doPunch} disabled={pending || !canSubmit}>
          {nextKind === "in" ? <LogIn className="mr-1.5 size-4" /> : <LogOut className="mr-1.5 size-4" />}
          {pending ? t("saving") : t(nextKind === "in" ? "punch.punchIn" : "punch.punchOut")}
        </Button>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">{t("punch.weekTitle")}</h3>
        {punches.length === 0 ? (
          <p className="rounded-lg border border-dashed py-6 text-center text-[13px] text-muted-foreground">
            {t("punch.empty")}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {punches.map((p) => (
              <li key={p.id} className="flex items-start gap-2 p-3 text-[13px]">
                {p.kind === "in" ? (
                  <LogIn className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                ) : (
                  <LogOut className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {formatDateTime(p.punchedAt, locale)} · {t(`punch.kinds.${p.kind}`)}
                  </p>
                  {p.outOfRange && (
                    <p className="text-amber-700 dark:text-amber-400">
                      {t("punch.flagged")}
                      {p.reason ? ` — ${p.reason}` : ""}
                    </p>
                  )}
                </div>
                {p.distanceM != null && (
                  <span className="shrink-0 text-xs text-muted-foreground">{p.distanceM} m</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {punches.length >= PUNCH_LIST_LIMIT && (
          <p className="mt-2 text-xs text-muted-foreground">{t("punch.limitNote", { n: PUNCH_LIST_LIMIT })}</p>
        )}
      </div>
    </div>
  );
}

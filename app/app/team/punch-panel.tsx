"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Camera, Clock, LogIn, LogOut, MapPin, ScanFace, TriangleAlert, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import { chamCong, chamCongGiup, datCauHinhCham, datViTriTiem, layDiaChiTuToaDo, napMat } from "./actions";
import { SelfieCapture } from "./selfie-capture";
import { tinhDauMat } from "./face-utils";
import {
  khoangCachM,
  PUNCH_LIST_LIMIT,
  type AttendanceConfig,
  type Employee,
  type Punch,
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
  chamCongCfg,
  tenantId,
  businessName,
  colleagues,
  canHr,
}: {
  me: Employee | null;
  punches: Punch[];
  chamCongCfg: AttendanceConfig;
  tenantId: string;
  businessName: string;
  colleagues: { id: string; name: string }[];
  canHr: boolean;
}) {
  // Toạ độ tiệm rút từ cấu hình (#232) — dùng cho phép đo khoảng cách.
  const workLocation =
    chamCongCfg.lat != null && chamCongCfg.lng != null
      ? { lat: chamCongCfg.lat, lng: chamCongCfg.lng }
      : null;
  const t = useTranslations("hr");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toado, setToado] = useState<Toado | null>(null);
  const [geoState, setGeoState] = useState<"asking" | "ok" | "denied">("asking");
  const [reason, setReason] = useState("");
  const [radiusInput, setRadiusInput] = useState(String(chamCongCfg.radiusM));
  const [requireSelfie, setRequireSelfie] = useState(chamCongCfg.requireSelfie);
  const [faceMatchInput, setFaceMatchInput] = useState(String(chamCongCfg.faceMatchMin));
  // Địa chỉ chữ của vị trí tiệm ĐÃ đặt — để chủ tiệm thấy "đã đặt ở đâu" thay vì
  // chỉ một cặp toạ độ. Tra một lần khi có toạ độ (dịch vụ miễn phí, máy chủ).
  const [shopAddress, setShopAddress] = useState<string | null>(null);
  // #219 — ảnh selfie đã upload (client) chờ gửi kèm khi chấm.
  const [selfiePath, setSelfiePath] = useState<string | null>(null);
  const [selfieContentType, setSelfieContentType] = useState<string | null>(null);
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

  // Tra địa chỉ chữ của vị trí tiệm đã đặt (một lần, khi toạ độ đổi). Chưa đặt
  // toạ độ thì khối hiển thị đã tự ẩn — không cần xoá state ở đây. Hỏng tra thì
  // giữ null và màn chỉ hiện toạ độ + link bản đồ, không chặn gì.
  useEffect(() => {
    if (chamCongCfg.lat == null || chamCongCfg.lng == null) return;
    let con = true;
    void layDiaChiTuToaDo({ lat: chamCongCfg.lat, lng: chamCongCfg.lng }).then((kq) => {
      if (con) setShopAddress(kq.address);
    });
    return () => {
      con = false;
    };
  }, [chamCongCfg.lat, chamCongCfg.lng]);

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
  const willFlag = distance === null || distance > chamCongCfg.radiusM;
  // #219 — tiệm bắt buộc selfie thì phải có ảnh mới chấm được (chặn cả ở CSDL).
  const canSubmit = (!willFlag || reason.trim().length > 0) && (!chamCongCfg.requireSelfie || selfiePath !== null);

  function doPunch() {
    startTransition(async () => {
      const res = await chamCong({
        kind: nextKind,
        lat: toado?.lat ?? null,
        lng: toado?.lng ?? null,
        reason: reason.trim() || null,
        selfiePath,
        selfieContentType,
      });
      if (res.error) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      toast.success(t(nextKind === "in" ? "punch.savedIn" : "punch.savedOut"));
      setReason("");
      setSelfiePath(null);
      setSelfieContentType(null);
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

  function saveConfig() {
    const r = Number(radiusInput);
    if (!Number.isInteger(r) || r < 20 || r > 5000) {
      toast.error(t("punch.radiusInvalid"));
      return;
    }
    const fm = Number(faceMatchInput);
    if (!Number.isInteger(fm) || fm < 0 || fm > 100) {
      toast.error(t("punch.faceMatchInvalid"));
      return;
    }
    startTransition(async () => {
      const res = await datCauHinhCham({ radiusM: r, requireSelfie, faceMatchMin: fm });
      if (res.error) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      toast.success(t("punch.settingsSaved"));
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
          <div className="mt-2 space-y-2 rounded-md border border-dashed p-2.5">
            <div className="flex flex-wrap items-center gap-2">
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
            {/* Đã đặt vị trí rồi thì hiện ĐÃ ĐẶT Ở ĐÂU (địa chỉ chữ) + link mở
                bản đồ, thay vì để chủ tiệm đoán từ một cặp toạ độ. */}
            {workLocation && (
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <MapPin className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {t("punch.shopLocationAt", {
                    place: shopAddress ?? `${workLocation.lat.toFixed(5)}, ${workLocation.lng.toFixed(5)}`,
                  })}{" "}
                  <a
                    href={`https://www.google.com/maps?q=${workLocation.lat},${workLocation.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary hover:underline"
                  >
                    {t("punch.viewOnMap")}
                  </a>
                </span>
              </div>
            )}
            {/* #232 — bán kính "coi như tại tiệm" cấu hình được (trước cố định 300m). */}
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="punch-radius" className="text-xs">
                {t("punch.radiusLabel")}
              </Label>
              <input
                id="punch-radius"
                type="number"
                min={20}
                max={5000}
                value={radiusInput}
                onChange={(e) => setRadiusInput(e.target.value)}
                className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm tabular-nums"
              />
              <span className="text-xs text-muted-foreground">m</span>
            </div>
            {/* #219 — bắt buộc selfie khi chấm (chèn chữ vị trí+giờ+tên tiệm lên ảnh). */}
            <label className="flex cursor-pointer items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={requireSelfie}
                onChange={(e) => setRequireSelfie(e.target.checked)}
                className="size-4"
              />
              {t("punch.requireSelfieLabel")}
            </label>
            {/* #225 — ngưỡng % khớp mặt khi chấm giúp: dưới mức này thì đánh dấu đỏ. */}
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="punch-facematch" className="text-xs">
                {t("punch.faceMatchLabel")}
              </Label>
              <input
                id="punch-facematch"
                type="number"
                min={0}
                max={100}
                value={faceMatchInput}
                onChange={(e) => setFaceMatchInput(e.target.value)}
                className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm tabular-nums"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            <p className="text-[11px] text-muted-foreground">{t("punch.faceMatchHint")}</p>
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="outline" onClick={saveConfig} disabled={pending}>
                {t("punch.saveSettings")}
              </Button>
            </div>
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

        {/* #219 — bắt buộc selfie: hiện nút chụp (camera + chèn chữ). Chưa chụp
            thì nút chấm bị khoá (canSubmit). */}
        {chamCongCfg.requireSelfie && (
          <div className="mt-3">
            <SelfieCapture
              tenantId={tenantId}
              businessName={businessName}
              coords={toado}
              onCaptured={(path, ct) => {
                setSelfiePath(path);
                setSelfieContentType(ct);
              }}
              onCleared={() => {
                setSelfiePath(null);
                setSelfieContentType(null);
              }}
            />
          </div>
        )}

        <Button className="mt-3 w-full" size="lg" onClick={doPunch} disabled={pending || !canSubmit}>
          {nextKind === "in" ? <LogIn className="mr-1.5 size-4" /> : <LogOut className="mr-1.5 size-4" />}
          {pending ? t("saving") : t(nextKind === "in" ? "punch.punchIn" : "punch.punchOut")}
        </Button>
      </div>

      {/* #225 — nạp mặt gốc của MÌNH (một lần), để người khác chấm giúp thì máy
          có cái đối chiếu. */}
      <FaceEnroll employeeId={me.id} />

      {/* #225 — chấm giúp đồng nghiệp (điện thoại họ hỏng). Chỉ hiện khi có đồng
          nghiệp để giúp. Chốt chặn thật ở hàm CSDL cham_cong_giup. */}
      {colleagues.length > 0 && (
        <ProxyPunch tenantId={tenantId} businessName={businessName} coords={toado} colleagues={colleagues} />
      )}

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
                  {/* #219 — ảnh selfie đã chèn chữ (vị trí + giờ + tên tiệm). Mở
                      link tạm ở tab mới để xem cỡ lớn. */}
                  {p.selfieUrl && (
                    <a href={p.selfieUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.selfieUrl}
                        alt={t("selfie.title")}
                        className="h-16 w-16 rounded-md border object-cover"
                      />
                    </a>
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

/**
 * #225 — chấm giúp đồng nghiệp (điện thoại họ hỏng). Chọn người → BẮT BUỘC chụp
 * MẶT họ → chấm giúp vào/tan ca. Toàn bộ chốt chặn nằm ở hàm CSDL
 * `cham_cong_giup` (bắt buộc ảnh, luôn gắn cờ, ghi người bấm, chặn tiệm khác);
 * đây chỉ là ô nhập + gọi. Thu gọn mặc định để không rối luồng tự chấm.
 */
function ProxyPunch({
  tenantId,
  businessName,
  coords,
  colleagues,
}: {
  tenantId: string;
  businessName: string;
  coords: Toado | null;
  colleagues: { id: string; name: string }[];
}) {
  const t = useTranslations("hr");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [selfiePath, setSelfiePath] = useState<string | null>(null);
  const [selfieContentType, setSelfieContentType] = useState<string | null>(null);
  // #225 — "dấu mặt" điện thoại tính từ ảnh vừa chụp (gửi kèm để so mặt server).
  const [faceDescriptor, setFaceDescriptor] = useState<number[] | null>(null);
  const [pending, startTransition] = useTransition();

  const canSubmit = employeeId !== "" && selfiePath !== null;
  const tenNguoi = colleagues.find((c) => c.id === employeeId)?.name ?? "";

  function submit(kind: "in" | "out") {
    if (!canSubmit || !selfiePath) return;
    startTransition(async () => {
      const res = await chamCongGiup({
        employeeId,
        kind,
        selfiePath,
        selfieContentType,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        faceDescriptor,
      });
      if (res.error) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      // Hiện % khớp mặt nếu có (người được chấm đã nạp mặt + máy thấy mặt rõ).
      if (typeof res.faceMatchPct === "number") {
        toast.success(t("punch.proxyDoneMatch", { name: tenNguoi, pct: res.faceMatchPct }));
      } else {
        toast.success(t("punch.proxyDone", { name: tenNguoi }));
      }
      setSelfiePath(null);
      setSelfieContentType(null);
      setFaceDescriptor(null);
      setEmployeeId("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
        <UserPlus className="mr-1.5 size-4" />
        {t("punch.proxyOpen")}
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <p className="text-sm font-semibold">{t("punch.proxyTitle")}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{t("punch.proxyHint")}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="proxy-colleague" className="text-xs">
          {t("punch.proxyColleague")}
        </Label>
        <Select id="proxy-colleague" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          <option value="">{t("punch.proxyPick")}</option>
          {colleagues.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      {/* Ảnh MẶT người được chấm là bắt buộc — nút chấm khoá tới khi có ảnh. */}
      <SelfieCapture
        tenantId={tenantId}
        businessName={businessName}
        coords={coords}
        onCaptured={(path, ct) => {
          setSelfiePath(path);
          setSelfieContentType(ct);
        }}
        onCleared={() => {
          setSelfiePath(null);
          setSelfieContentType(null);
          setFaceDescriptor(null);
        }}
        onFaceDescriptor={setFaceDescriptor}
      />
      <p className="text-[12px] text-amber-700 dark:text-amber-400">{t("punch.proxyFaceHint")}</p>
      <div className="flex gap-2">
        <Button className="flex-1" size="sm" onClick={() => submit("in")} disabled={pending || !canSubmit}>
          <LogIn className="mr-1 size-4" />
          {t("punch.proxyIn")}
        </Button>
        <Button className="flex-1" size="sm" variant="outline" onClick={() => submit("out")} disabled={pending || !canSubmit}>
          <LogOut className="mr-1 size-4" />
          {t("punch.proxyOut")}
        </Button>
      </div>
      <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setOpen(false)}>
        {t("cancel")}
      </button>
    </div>
  );
}

/**
 * #225 — nạp "mặt gốc" của CHÍNH MÌNH (một lần), để đồng nghiệp chấm giúp thì
 * máy có cái đối chiếu. Chụp → điện thoại tính dấu mặt (128 số) → gửi lên; ảnh
 * KHÔNG lưu (khác chấm công), chỉ lấy dãy số. Chạy trên máy, miễn phí.
 */
function FaceEnroll({ employeeId }: { employeeId: string }) {
  const t = useTranslations("hr");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<"idle" | "live" | "working" | "done">("idle");
  const [pending, startTransition] = useTransition();

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  };
  useEffect(() => () => stopStream(), []);

  async function start() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
      setPhase("live");
    } catch {
      toast.error(t("selfie.cameraDenied"));
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    stopStream();
    setPhase("working");
    startTransition(async () => {
      const desc = await tinhDauMat(canvas);
      if (!desc) {
        toast.error(t("punch.faceNotFound"));
        setPhase("idle");
        return;
      }
      const res = await napMat({ employeeId, descriptor: desc });
      if (res.error) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        setPhase("idle");
        return;
      }
      toast.success(t("punch.faceEnrolled"));
      setPhase("done");
    });
  }

  if (phase === "idle" || phase === "done") {
    return (
      <Button type="button" variant="outline" size="sm" className="w-full" onClick={start}>
        <ScanFace className="mr-1.5 size-4" />
        {phase === "done" ? t("punch.faceEnrollAgain") : t("punch.faceEnrollOpen")}
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <p className="text-sm font-semibold">{t("punch.faceEnrollTitle")}</p>
      <p className="text-[12px] text-muted-foreground">{t("punch.faceEnrollHint")}</p>
      {phase === "live" && (
        <>
          <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full rounded-md bg-black object-cover" />
          <Button type="button" size="sm" className="w-full" onClick={capture}>
            <Camera className="mr-1 size-4" />
            {t("punch.faceEnrollCapture")}
          </Button>
        </>
      )}
      {phase === "working" && (
        <p className="py-4 text-center text-[13px] text-muted-foreground">{t("punch.faceWorking")}</p>
      )}
      <button
        type="button"
        className="text-xs text-muted-foreground hover:underline"
        onClick={() => {
          stopStream();
          setPhase("idle");
        }}
        disabled={pending}
      >
        {t("cancel")}
      </button>
    </div>
  );
}

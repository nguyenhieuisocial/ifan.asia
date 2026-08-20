"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Clock, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { luuGioCa, xepCa } from "./actions";
import {
  SHIFT_KINDS,
  gioCuaCa,
  type AttendanceConfig,
  type Employee,
  type Shift,
  type ShiftKind,
} from "./queries";
import { toastKeyFor } from "./toast-keys";

/** Bấm một ô là quay vòng: trống → sáng → chiều → cả ngày → nghỉ → trống. */
const VONG: (ShiftKind | null)[] = [null, ...SHIFT_KINDS];

function themNgay(ngay: string, n: number): string {
  return new Date(new Date(`${ngay}T00:00:00Z`).getTime() + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

const MAU: Record<ShiftKind, string> = {
  morning: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  afternoon: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  full: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  off: "bg-muted text-muted-foreground",
};

/**
 * Xếp ca (quyết định 3 của thẻ): đối chiếu ca với LỊCH HẸN ĐÃ ĐẶT để báo thiếu
 * người TRƯỚC, không đợi đến hôm đó mới vỡ.
 *
 * Ngưỡng cảnh báo: mỗi người trực gánh tối đa 6 lịch/ngày. Thẻ không nói con số
 * — chọn 6 vì một ca 8 tiếng với dịch vụ ~60-75 phút là quanh mức đó. Đây là
 * lựa chọn của bản cài đặt, không phải luật; đổi thì đổi ở đúng hằng số này.
 */
const LICH_MOI_NGUOI = 6;

export function ShiftPanel({
  weekStart,
  employees,
  shifts,
  apptByDay,
  canManage,
  canHr,
  cfg,
}: {
  weekStart: string;
  employees: Employee[];
  shifts: Shift[];
  apptByDay: Record<string, number>;
  canManage: boolean;
  /** Đặt giờ ca CHUẨN của tiệm là owner/admin — khớp RLS `attendance_settings_manage` (#232). */
  canHr: boolean;
  cfg: AttendanceConfig;
}) {
  const t = useTranslations("hr");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /**
   * #251 — chế độ "đặt giờ riêng": bấm ô thì mở ô nhập giờ thay vì xoay vòng ca.
   *
   * VÌ SAO LÀ MỘT CÔNG TẮC CHỨ KHÔNG PHẢI GIỮ-ĐỂ-SỬA: giữ lâu không có dấu hiệu
   * nào trên màn, và trên máy tính thì gần như không ai đoán ra. Công tắc có
   * nhãn, thấy được đang bật, và tắt lại được — đổi lại là thao tác thường ngày
   * (xoay vòng ca) không bị đụng tới.
   */
  const [dangDatGio, setDangDatGio] = useState(false);
  const [oDangSua, setODangSua] = useState<string | null>(null);
  const [moGioChuan, setMoGioChuan] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => themNgay(weekStart, i));
  const byKey = new Map(shifts.map((s) => [`${s.employeeId}|${s.workDate}`, s]));
  const active = employees.filter((e) => !e.endedOn);

  function doi(employeeId: string, workDate: string) {
    if (!canManage) return;
    const key = `${employeeId}|${workDate}`;
    if (dangDatGio) {
      // Ca "Nghỉ" và ô trống không có giờ để đặt — mở ô nhập ở đó là mời người
      // dùng gõ một thứ sẽ bị bỏ đi lúc lưu.
      const s = byKey.get(key);
      if (!s || s.kind === "off") {
        toast.error(t("shifts.timeNeedsShift"));
        return;
      }
      setODangSua(oDangSua === key ? null : key);
      return;
    }
    const hienTai = byKey.get(key)?.kind ?? null;
    const ke = VONG[(VONG.indexOf(hienTai) + 1) % VONG.length];
    startTransition(async () => {
      const res = await xepCa({ employeeId, workDate, kind: ke });
      if (res.error) toast.error(t(`toasts.${toastKeyFor(res.error)}`));
      else router.refresh();
    });
  }

  const caDangSua = oDangSua ? byKey.get(oDangSua) : undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-3">
        <Link
          href={`/app/team?w=${themNgay(weekStart, -7)}`}
          className="flex size-8 items-center justify-center rounded-md border hover:bg-muted/60"
          aria-label={t("shifts.prevWeek")}
        >
          <ChevronLeft className="size-4" />
        </Link>
        <span className="text-sm font-medium tabular-nums">
          {weekStart} → {themNgay(weekStart, 6)}
        </span>
        <Link
          href={`/app/team?w=${themNgay(weekStart, 7)}`}
          className="flex size-8 items-center justify-center rounded-md border hover:bg-muted/60"
          aria-label={t("shifts.nextWeek")}
        >
          <ChevronRight className="size-4" />
        </Link>
      </div>

      {/* #251 — giờ ca CHUẨN của tiệm. Đây là mốc mà đi muộn / về sớm / tăng ca
          đem ra so; không có nó thì ba số đó không tính được. */}
      {canHr && (
        <div className="rounded-lg border">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 p-3 text-left"
            onClick={() => setMoGioChuan((v) => !v)}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Clock className="size-4" />
              {t("shifts.standardHours")}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {cfg.morningStart}–{cfg.morningEnd} · {cfg.afternoonStart}–{cfg.afternoonEnd}
            </span>
          </button>
          {moGioChuan && <GioChuan cfg={cfg} onDone={() => setMoGioChuan(false)} />}
        </div>
      )}

      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={dangDatGio ? "default" : "outline"}
            onClick={() => {
              setDangDatGio((v) => !v);
              setODangSua(null);
            }}
          >
            <Clock className="mr-1 size-3.5" />
            {t("shifts.timeMode")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {dangDatGio ? t("shifts.timeModeOn") : t("shifts.tapHint")}
          </p>
        </div>
      )}

      {active.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-[13px] text-muted-foreground">
          {t("shifts.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-left font-medium">{t("shifts.person")}</th>
                {days.map((d) => (
                  <th key={d} className="p-2 text-center font-medium">
                    {t(`shifts.dow.${new Date(`${d}T00:00:00Z`).getUTCDay()}`)}
                    <span className="block font-normal">{d.slice(8)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {active.map((e) => (
                <tr key={e.id}>
                  <td className="p-2 font-medium">{e.fullName}</td>
                  {days.map((d) => {
                    const key = `${e.id}|${d}`;
                    const s = byKey.get(key);
                    const gio = s ? gioCuaCa(s, cfg) : null;
                    const rieng = !!(s?.startTime && s.endTime);
                    return (
                      <td key={d} className="p-1 text-center align-top">
                        <button
                          type="button"
                          disabled={!canManage || pending}
                          onClick={() => doi(e.id, d)}
                          className={cn(
                            "w-full min-w-10 rounded px-0.5 py-1 text-xs font-medium",
                            s ? MAU[s.kind] : "bg-muted/40 text-muted-foreground",
                            canManage && "hover:opacity-80",
                            // Ô đang mở sửa giờ, và ô mang giờ RIÊNG khác chuẩn.
                            oDangSua === key && "ring-2 ring-primary",
                            rieng && oDangSua !== key && "ring-1 ring-dashed ring-amber-500/70",
                          )}
                          aria-label={`${e.fullName} ${d}`}
                        >
                          <span className="block">{s ? t(`shifts.kinds.${s.kind}`) : "·"}</span>
                          {/* Giờ hiện ngay trên ô: xếp ca mà không thấy giờ thì
                              vẫn phải mở từng ô ra mới biết ai làm tới mấy giờ. */}
                          {gio && (
                            <span
                              className={cn(
                                "mt-0.5 block text-[10px] font-normal tabular-nums",
                                rieng ? "opacity-100" : "opacity-60",
                              )}
                            >
                              {gio.start}–{gio.end}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {oDangSua && caDangSua && (
        <GioRieng
          ca={caDangSua}
          cfg={cfg}
          ten={active.find((e) => e.id === caDangSua.employeeId)?.fullName ?? ""}
          onDone={() => setODangSua(null)}
        />
      )}

      {/* Cảnh báo thiếu người — dựa trên lịch hẹn THẬT của đúng ngày đó. */}
      <div className="space-y-1.5">
        {days.map((d) => {
          const lich = apptByDay[d] ?? 0;
          const nguoi = active.filter((e) => {
            const k = byKey.get(`${e.id}|${d}`)?.kind;
            return k === "morning" || k === "afternoon" || k === "full";
          }).length;
          if (lich === 0 || lich <= nguoi * LICH_MOI_NGUOI) return null;
          return (
            <p
              key={d}
              className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2.5 text-[13px] text-amber-700 dark:text-amber-400"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {t("shifts.understaffed", { date: d, appts: lich, people: nguoi })}
            </p>
          );
        })}
      </div>
    </div>
  );
}

/** #251 — bộ giờ chuẩn của tiệm + ân hạn đi muộn + ngưỡng tăng ca. */
function GioChuan({ cfg, onDone }: { cfg: AttendanceConfig; onDone: () => void }) {
  const t = useTranslations("hr");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState({
    morningStart: cfg.morningStart,
    morningEnd: cfg.morningEnd,
    afternoonStart: cfg.afternoonStart,
    afternoonEnd: cfg.afternoonEnd,
    lateGraceMin: String(cfg.lateGraceMin),
    overtimeMinMinutes: String(cfg.overtimeMinMinutes),
    congChuanThang: String(cfg.congChuanThang),
  });

  function luu() {
    startTransition(async () => {
      const res = await luuGioCa({
        morningStart: v.morningStart,
        morningEnd: v.morningEnd,
        afternoonStart: v.afternoonStart,
        afternoonEnd: v.afternoonEnd,
        lateGraceMin: Number(v.lateGraceMin) || 0,
        overtimeMinMinutes: Number(v.overtimeMinMinutes) || 0,
        // #283 — 0 không hợp lệ (tắt ngầm cảnh báo), nên rơi về mốc mặc định
        // thay vì gửi 0 lên rồi bị chặn với một câu lỗi khó hiểu.
        congChuanThang: Number(v.congChuanThang) || 24,
      });
      if (res.error) toast.error(t(`toasts.${toastKeyFor(res.error)}`));
      else {
        toast.success(t("toasts.saved"));
        onDone();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3 border-t bg-muted/30 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("shifts.kinds.morning")}</Label>
          <div className="flex items-center gap-2">
            <Input
              type="time"
              value={v.morningStart}
              onChange={(e) => setV({ ...v, morningStart: e.target.value })}
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="time"
              value={v.morningEnd}
              onChange={(e) => setV({ ...v, morningEnd: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("shifts.kinds.afternoon")}</Label>
          <div className="flex items-center gap-2">
            <Input
              type="time"
              value={v.afternoonStart}
              onChange={(e) => setV({ ...v, afternoonStart: e.target.value })}
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="time"
              value={v.afternoonEnd}
              onChange={(e) => setV({ ...v, afternoonEnd: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("shifts.grace")}</Label>
          <Input
            inputMode="numeric"
            value={v.lateGraceMin}
            onChange={(e) => setV({ ...v, lateGraceMin: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("shifts.otThreshold")}</Label>
          <Input
            inputMode="numeric"
            value={v.overtimeMinMinutes}
            onChange={(e) => setV({ ...v, overtimeMinMinutes: e.target.value })}
          />
        </div>
        {/*
          #283 — trước đây con số này đóng cứng 24 trong mã cho MỌI tiệm. Tiệm
          nghỉ hai ngày mỗi tuần (khoảng 22 công) bị màn Bảng lương gắn cờ toàn
          bộ nhân viên mỗi tháng. Nó là mốc để HỎI, không phải để trừ tiền.
        */}
        <div className="space-y-1.5">
          <Label>{t("shifts.standardDays")}</Label>
          <Input
            inputMode="numeric"
            value={v.congChuanThang}
            onChange={(e) => setV({ ...v, congChuanThang: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">{t("shifts.standardDaysHint")}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("shifts.standardHint")}</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button size="sm" onClick={luu} disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}

/** #251 — giờ RIÊNG của một ô ca. Xoá giờ = quay về giờ chuẩn của tiệm. */
function GioRieng({
  ca,
  cfg,
  ten,
  onDone,
}: {
  ca: Shift;
  cfg: AttendanceConfig;
  ten: string;
  onDone: () => void;
}) {
  const t = useTranslations("hr");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const chuan = gioCuaCa({ ...ca, startTime: null, endTime: null }, cfg);
  const [bd, setBd] = useState(ca.startTime ?? chuan?.start ?? "");
  const [kt, setKt] = useState(ca.endTime ?? chuan?.end ?? "");

  function ghi(startTime: string | null, endTime: string | null) {
    startTransition(async () => {
      const res = await xepCa({
        employeeId: ca.employeeId,
        workDate: ca.workDate,
        kind: ca.kind,
        startTime,
        endTime,
      });
      if (res.error) toast.error(t(`toasts.${toastKeyFor(res.error)}`));
      else {
        toast.success(t("toasts.saved"));
        onDone();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">
          {t("shifts.customTitle", { name: ten, date: ca.workDate })}
        </h4>
        <button type="button" className="text-xs text-muted-foreground underline" onClick={onDone}>
          {t("close")}
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label>{t("shifts.from")}</Label>
          <Input type="time" value={bd} onChange={(e) => setBd(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("shifts.to")}</Label>
          <Input type="time" value={kt} onChange={(e) => setKt(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => ghi(bd, kt)} disabled={pending || !bd || !kt}>
          {pending ? t("saving") : t("save")}
        </Button>
        {/* Xoá giờ riêng ⇒ ô quay về giờ chuẩn. Cần một đường RÕ RÀNG để về mặc
            định, nếu không người ta phải nhớ giờ chuẩn rồi gõ lại y hệt — và
            lúc tiệm đổi giờ chuẩn thì ô đó vẫn giữ số cũ mà không ai biết. */}
        {ca.startTime && (
          <Button size="sm" variant="outline" onClick={() => ghi(null, null)} disabled={pending}>
            <X className="mr-1 size-3.5" />
            {t("shifts.clearCustom")}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("shifts.customHint", { start: chuan?.start ?? "—", end: chuan?.end ?? "—" })}
      </p>
    </div>
  );
}

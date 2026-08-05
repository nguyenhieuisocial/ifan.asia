"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Clock, Lock, Pencil, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/lib/format";
import {
  setSlaPolicyActive,
  SLA_MAX_MINUTES,
  updateSlaPolicyThresholds,
} from "./actions";

export type PolicyRow = {
  id: string;
  name: string;
  targetType: string;
  warnAfterMinutes: number;
  breachAfterMinutes: number;
  escalateTo: string;
  isActive: boolean;
  fired7d: number;
};

export type SlaEventRow = {
  id: string;
  level: string;
  targetType: string;
  elapsedMinutes: number;
  createdAt: string;
  policyName: string;
};

/** Đồng nghiệp có thể nhận cảnh báo vi phạm (chỉ định đích danh). */
export type SlaMember = { userId: string; name: string };

/** level trong sla_events → key i18n (không dùng dấu chấm — next-intl coi là namespace). */
const LEVEL_KEYS: Record<string, string> = {
  warning: "warning",
  window_warning: "windowWarning",
  breached: "breached",
};

const LEVEL_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  warning: "outline",
  window_warning: "secondary",
  breached: "destructive",
};

/** Khóa lỗi từ server action → key trong messages `sla.toasts.*`. */
const TOAST_KEYS: Record<string, string> = {
  forbidden: "forbidden",
  escalate_not_member: "escalateNotMember",
};

type Unit = "minutes" | "hours" | "days";
const UNIT_MINUTES: Record<Unit, number> = { minutes: 1, hours: 60, days: 1440 };
const UNITS: Unit[] = ["minutes", "hours", "days"];

/** Số phút → cặp {số, đơn vị} lớn nhất chia hết — ô nhập hiện "2 giờ" thay vì "120 phút". */
function splitDuration(minutes: number): { value: string; unit: Unit } {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    return { value: String(minutes / 1440), unit: "days" };
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    return { value: String(minutes / 60), unit: "hours" };
  }
  return { value: String(minutes), unit: "minutes" };
}

/** Ô "số + đơn vị" dùng cho cả mốc nhắc lẫn mốc vi phạm. */
function DurationField({
  id,
  label,
  hint,
  value,
  unit,
  onValue,
  onUnit,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  unit: Unit;
  onValue: (v: string) => void;
  onUnit: (u: Unit) => void;
}) {
  const t = useTranslations("sla.edit");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          inputMode="numeric"
          onChange={(e) => onValue(e.target.value.replace(/\D/g, "").slice(0, 5))}
          className="w-24"
        />
        <Select
          aria-label={t("unitAria", { field: label })}
          value={unit}
          onChange={(e) => onUnit(e.target.value as Unit)}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {t(`unit.${u}`)}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * Sửa mốc thời gian + người nhận cảnh báo vi phạm.
 * Mọi ràng buộc của DB (mốc > 0, vi phạm phải muộn hơn nhắc, trần 30 ngày) được
 * kiểm TRƯỚC KHI LƯU và giải thích bằng tiếng Việt đời thường — người dùng không
 * bao giờ nhìn thấy lỗi kỹ thuật của Postgres.
 */
function EditPolicyDialog({
  policy,
  members,
  onClose,
}: {
  policy: PolicyRow;
  members: SlaMember[];
  onClose: () => void;
}) {
  const t = useTranslations("sla.edit");
  const tSla = useTranslations("sla");
  const tCommon = useTranslations("common");
  const [warn, setWarn] = useState(() => splitDuration(policy.warnAfterMinutes));
  const [breach, setBreach] = useState(() => splitDuration(policy.breachAfterMinutes));
  const [escalateTo, setEscalateTo] = useState(policy.escalateTo);
  const [pending, startTransition] = useTransition();

  const warnMinutes = Number(warn.value || "0") * UNIT_MINUTES[warn.unit];
  const breachMinutes = Number(breach.value || "0") * UNIT_MINUTES[breach.unit];

  const error =
    warnMinutes <= 0 || breachMinutes <= 0
      ? t("errors.empty")
      : warnMinutes > SLA_MAX_MINUTES || breachMinutes > SLA_MAX_MINUTES
        ? t("errors.tooLarge")
        : breachMinutes <= warnMinutes
          ? t("errors.order")
          : null;

  const save = () => {
    if (error || pending) return;
    startTransition(async () => {
      const res = await updateSlaPolicyThresholds(policy.id, {
        warnAfterMinutes: warnMinutes,
        breachAfterMinutes: breachMinutes,
        escalateTo,
      });
      if (res.error) {
        toast.error(tSla(`toasts.${TOAST_KEYS[res.error] ?? "failed"}`));
        return;
      }
      toast.success(t("saved"));
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { name: policy.name })}</DialogTitle>
          <DialogDescription>{tSla("editSoon")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <DurationField
            id="sla-warn"
            label={t("warnLabel")}
            hint={t("warnHint")}
            value={warn.value}
            unit={warn.unit}
            onValue={(v) => setWarn((s) => ({ ...s, value: v }))}
            onUnit={(u) => setWarn((s) => ({ ...s, unit: u }))}
          />
          <DurationField
            id="sla-breach"
            label={t("breachLabel")}
            hint={t("breachHint")}
            value={breach.value}
            unit={breach.unit}
            onValue={(v) => setBreach((s) => ({ ...s, value: v }))}
            onUnit={(u) => setBreach((s) => ({ ...s, unit: u }))}
          />
          <div className="space-y-1.5">
            <Label htmlFor="sla-escalate">{t("escalateLabel")}</Label>
            <Select
              id="sla-escalate"
              value={escalateTo}
              onChange={(e) => setEscalateTo(e.target.value)}
            >
              <option value="owner">{tSla("escalate.owner")}</option>
              <option value="manager">{tSla("escalate.manager")}</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">{t("escalateHint")}</p>
          </div>
          {error && (
            <p className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={save} disabled={pending || error !== null}>
            {tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SlaView({
  canManage,
  policies,
  events,
  members = [],
}: {
  canManage: boolean;
  policies: PolicyRow[];
  events: SlaEventRow[];
  members?: SlaMember[];
}) {
  const t = useTranslations("sla");
  const locale = useLocale() as Locale;
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<PolicyRow | null>(null);

  /** Mốc chính sách → "30 phút" / "2 giờ" / "1 ngày" (mốc luôn là số tròn). */
  const duration = (minutes: number) => {
    if (minutes >= 1440 && minutes % 1440 === 0) {
      return t("duration.days", { n: minutes / 1440 });
    }
    if (minutes >= 60 && minutes % 60 === 0) {
      return t("duration.hours", { n: minutes / 60 });
    }
    return t("duration.minutes", { n: minutes });
  };

  /**
   * Thời gian đã trễ → làm tròn XUỐNG đơn vị lớn nhất ("4321 phút" là con số máy,
   * chủ tiệm cần đọc "3 ngày"). Làm tròn xuống để không nói quá mức trễ.
   */
  const elapsed = (minutes: number) => {
    if (minutes >= 1440) return t("duration.days", { n: Math.floor(minutes / 1440) });
    if (minutes >= 60) return t("duration.hours", { n: Math.floor(minutes / 60) });
    return t("duration.minutes", { n: Math.max(minutes, 0) });
  };

  const targetLabel = (target: string) =>
    target === "deal"
      ? t("target.deal")
      : target === "activity"
        ? t("target.activity")
        : t("target.conversation");

  /** uuid có trong danh sách đồng nghiệp thì gọi thẳng tên, không nói chung chung. */
  const escalateLabel = (spec: string) =>
    spec === "manager"
      ? t("escalate.manager")
      : spec === "owner"
        ? t("escalate.owner")
        : (members.find((m) => m.userId === spec)?.name ?? t("escalate.specific"));

  const levelLabel = (level: string) =>
    LEVEL_KEYS[level] ? t(`level.${LEVEL_KEYS[level]}`) : level;

  const toggle = (row: PolicyRow) => {
    if (pending) return;
    startTransition(async () => {
      const res = await setSlaPolicyActive(row.id, !row.isActive);
      if (res.error) {
        toast.error(t(`toasts.${TOAST_KEYS[res.error] ?? "failed"}`));
        return;
      }
      toast.success(t(row.isActive ? "toasts.disabled" : "toasts.enabled"));
    });
  };

  if (!canManage) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl p-6">
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Lock className="mx-auto size-5 text-muted-foreground" />
            <h1 className="mt-3 text-[15px] font-semibold">
              {t("noPermission.title")}
            </h1>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted-foreground">
              {t("noPermission.description")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("description")}
          </p>
        </div>

        {policies.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-[13px] text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {policies.map((p) => (
              <li key={p.id} className="rounded-lg border">
                {/* Trên điện thoại hai nút xuống HÀNG RIÊNG: để chung hàng thì
                    chúng chiếm hết bề ngang và bóp cột chữ còn mỗi dòng một chữ
                    (thấy rõ nhất ở bản tiếng Anh, nhãn nút dài hơn). */}
                <div className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-3 sm:gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium">{p.name}</p>
                      <Badge variant="outline">{targetLabel(p.targetType)}</Badge>
                      <Badge variant={p.isActive ? "secondary" : "outline"}>
                        {t(p.isActive ? "card.on" : "card.off")}
                      </Badge>
                    </div>
                    <p className="mt-1 flex items-start gap-1.5 text-[13px] text-muted-foreground">
                      <Clock className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        {t("card.thresholds", {
                          warn: duration(p.warnAfterMinutes),
                          breach: duration(p.breachAfterMinutes),
                        })}
                      </span>
                    </p>
                    <p className="mt-0.5 flex items-start gap-1.5 text-[13px] text-muted-foreground">
                      <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                      <span>{t("card.escalateTo", { who: escalateLabel(p.escalateTo) })}</span>
                    </p>
                    {p.targetType === "conversation" && (
                      <p className="mt-0.5 flex items-start gap-1.5 text-[13px] text-muted-foreground">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        <span>{t("card.zaloWindow")}</span>
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground/80">
                      {p.fired7d > 0
                        ? t("card.fired7d", { count: p.fired7d })
                        : t("card.noFired")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => setEditing(p)}
                    >
                      <Pencil className="size-4" />
                      {t("edit.action")}
                    </Button>
                    <Button
                      variant={p.isActive ? "outline" : "default"}
                      size="sm"
                      disabled={pending}
                      onClick={() => toggle(p)}
                    >
                      {t(p.isActive ? "toggle.off" : "toggle.on")}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <section className="space-y-2">
          <h2 className="text-[13px] font-semibold">{t("events.title")}</h2>
          {events.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-[13px] text-muted-foreground">
              {t("events.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[520px] text-[13px]">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">{t("events.time")}</th>
                    <th className="px-3 py-2 font-medium">{t("events.policy")}</th>
                    <th className="px-3 py-2 font-medium">{t("events.level")}</th>
                    <th className="px-3 py-2 font-medium">{t("events.late")}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {formatDateTime(e.createdAt, locale)}
                      </td>
                      <td className="px-3 py-2">{e.policyName}</td>
                      <td className="px-3 py-2">
                        <Badge variant={LEVEL_VARIANT[e.level] ?? "outline"}>
                          {levelLabel(e.level)}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {elapsed(e.elapsedMinutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {editing && (
        <EditPolicyDialog
          policy={editing}
          members={members}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

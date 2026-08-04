"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Clock, Lock, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatVN } from "@/lib/datetime";
import { setSlaPolicyActive } from "./actions";

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

const TOAST_KEYS: Record<string, string> = { forbidden: "forbidden" };

export function SlaView({
  canManage,
  policies,
  events,
}: {
  canManage: boolean;
  policies: PolicyRow[];
  events: SlaEventRow[];
}) {
  const t = useTranslations("sla");
  const tShell = useTranslations("shell");
  const [pending, startTransition] = useTransition();

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
    target === "deal" ? t("target.deal") : t("target.conversation");

  const escalateLabel = (spec: string) =>
    spec === "manager"
      ? t("escalate.manager")
      : spec === "owner"
        ? t("escalate.owner")
        : t("escalate.specific");

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
                <div className="flex flex-wrap items-start gap-x-3 gap-y-2 p-3">
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
                  <Button
                    variant={p.isActive ? "outline" : "default"}
                    size="sm"
                    className="shrink-0"
                    disabled={pending}
                    onClick={() => toggle(p)}
                  >
                    {t(p.isActive ? "toggle.off" : "toggle.on")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed px-3 py-2.5 text-[13px] text-muted-foreground">
          {t("editSoon")}
          <Badge variant="outline">{tShell("comingSoon")}</Badge>
        </p>

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
                        {formatVN(e.createdAt)}
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
    </div>
  );
}

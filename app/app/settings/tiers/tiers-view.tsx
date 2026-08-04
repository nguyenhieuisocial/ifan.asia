"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Lock, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { TIER_BADGE, type Tier } from "../../contacts/types";
import { saveTierRules } from "./actions";

export type TierRulesRow = {
  vipMinRevenue: number;
  vipMinWonDeals: number;
  regularMinWonDeals: number;
  dormantAfterDays: number;
};

const MILLION = 1_000_000;

/** Ô số nhỏ đi kèm nhãn trước + đơn vị sau — đọc thành một câu tiếng Việt. */
function NumberField({
  label,
  unit,
  value,
  onChange,
  min,
  step,
  invalid,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  step?: number;
  invalid?: boolean;
}) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <Input
        type="number"
        inputMode="decimal"
        min={min}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-9 w-24 tabular-nums", invalid && "border-destructive")}
      />
      <span className="text-muted-foreground">{unit}</span>
    </label>
  );
}

/** Một hạng: huy hiệu + giải thích đời thường + số khách đang ở hạng đó. */
function TierCard({
  tier,
  name,
  rule,
  count,
  children,
}: {
  tier: Tier;
  name: string;
  rule: string;
  count: number | undefined;
  children?: React.ReactNode;
}) {
  const t = useTranslations("tiers");
  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={cn("font-semibold", TIER_BADGE[tier])}>{name}</Badge>
        <span className="text-xs text-muted-foreground">
          {count ? t("count", { n: count }) : t("countEmpty")}
        </span>
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">{rule}</p>
      {children}
    </li>
  );
}

export function TiersView({
  canManage,
  rules,
  counts,
}: {
  canManage: boolean;
  rules: TierRulesRow;
  counts: Record<string, number>;
}) {
  const t = useTranslations("tiers");
  const locale = useLocale() as Locale;
  const [pending, startTransition] = useTransition();

  // Tiền nhập theo "triệu" cho dễ đọc — chủ tiệm không phải đếm số 0
  const [vipRevenue, setVipRevenue] = useState(
    String(rules.vipMinRevenue / MILLION),
  );
  const [vipWon, setVipWon] = useState(String(rules.vipMinWonDeals));
  const [regularWon, setRegularWon] = useState(String(rules.regularMinWonDeals));
  const [dormantDays, setDormantDays] = useState(String(rules.dormantAfterDays));

  const revenueVnd = Math.round((Number(vipRevenue) || 0) * MILLION);
  const vipWonNum = Number(vipWon);
  const regularWonNum = Number(regularWon);
  const dormantNum = Number(dormantDays);
  const orderBroken = vipWonNum < regularWonNum;
  const valid =
    revenueVnd >= 0 &&
    Number.isInteger(vipWonNum) &&
    vipWonNum >= 1 &&
    Number.isInteger(regularWonNum) &&
    regularWonNum >= 1 &&
    Number.isInteger(dormantNum) &&
    dormantNum >= 7 &&
    dormantNum <= 3650 &&
    !orderBroken;

  const save = () => {
    if (!valid || pending) return;
    startTransition(async () => {
      const res = await saveTierRules({
        vipMinRevenue: revenueVnd,
        vipMinWonDeals: vipWonNum,
        regularMinWonDeals: regularWonNum,
        dormantAfterDays: dormantNum,
      });
      if (res.error) {
        toast.error(
          t(res.error === "forbidden" ? "toasts.forbidden" : "toasts.failed"),
        );
        return;
      }
      toast.success(t("toasts.saved", { count: res.recomputed ?? 0 }));
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
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {t("description")}
          </p>
        </div>

        <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
          <Sparkles aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{t("howItWorks")}</span>
        </p>

        <ul className="space-y-2">
          <TierCard
            tier="new"
            name={t("name.new")}
            rule={t("newTier.rule")}
            count={counts.new}
          />

          <TierCard
            tier="regular"
            name={t("name.regular")}
            rule={t("regular.rule")}
            count={counts.regular}
          >
            <NumberField
              label={t("regular.wonLabel")}
              unit={t("regular.wonUnit")}
              value={regularWon}
              onChange={setRegularWon}
              min={1}
            />
          </TierCard>

          <TierCard
            tier="vip"
            name={t("name.vip")}
            rule={t("vip.rule")}
            count={counts.vip}
          >
            <div className="space-y-2">
              <div className="space-y-1">
                <NumberField
                  label={t("vip.revenueLabel")}
                  unit={t("vip.revenueUnit")}
                  value={vipRevenue}
                  onChange={setVipRevenue}
                  min={0}
                  step={1}
                />
                <p className="text-xs text-muted-foreground/80">
                  {t("vip.revenueHint", {
                    amount: formatMoney(revenueVnd, locale),
                  })}
                </p>
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {t("vip.orLabel")}
              </p>
              <NumberField
                label={t("vip.wonLabel")}
                unit={t("vip.wonUnit")}
                value={vipWon}
                onChange={setVipWon}
                min={1}
                invalid={orderBroken}
              />
              {orderBroken && (
                <p className="text-xs text-destructive">{t("errors.order")}</p>
              )}
            </div>
          </TierCard>

          <TierCard
            tier="dormant"
            name={t("name.dormant")}
            rule={t("dormant.rule")}
            count={counts.dormant}
          >
            <NumberField
              label={t("dormant.daysLabel")}
              unit={t("dormant.daysUnit")}
              value={dormantDays}
              onChange={setDormantDays}
              min={7}
            />
            <p className="text-xs leading-relaxed text-muted-foreground/80">
              {t("dormant.why")}
            </p>
          </TierCard>
        </ul>

        <Button onClick={save} disabled={!valid || pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}

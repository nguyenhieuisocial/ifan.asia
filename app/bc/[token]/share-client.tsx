"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/lib/format";
import { kpiMonthLabel, type KpiMetric } from "@/lib/kpi";
import { formatInTenantTz, type SharePayload } from "@/lib/report-share";
import { seedLabel } from "@/lib/seed-i18n";
import { unlockShare } from "./actions";
import type { ShareOpenFail, ShareOpenResult } from "./open";

/**
 * Trang người NGOÀI tiệm nhìn thấy (migration #295).
 *
 * ⚠️ BA LUẬT CỦA MÀN NÀY — đừng nới khi thêm báo cáo mới:
 *  1. KHÔNG một liên kết nào ra khỏi trang. Không thanh điều hướng, không nút
 *     đăng nhập, không logo bấm được. Mã nằm trên địa chỉ trang, nên mỗi liên
 *     kết ra ngoài là một đường rò mã qua header giới thiệu.
 *  2. KHÔNG tham số nào người xem điều khiển được — không đổi kỳ, không lọc,
 *     không tìm kiếm. Bản chụp đã đóng băng thì không có gì để hỏi lại.
 *  3. Chỉ in ĐÚNG những gì có trong bản chụp. Không gọi thêm câu truy vấn nào.
 */
export function ShareClient({
  token,
  initial,
}: {
  token: string;
  initial: ShareOpenResult;
}) {
  const t = useTranslations("reportShare.public");
  const [result, setResult] = useState<ShareOpenResult>(initial);
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();

  if (result.ok) return <ReportBody result={result} />;

  if (result.reason === "need_password" || result.reason === "wrong_password") {
    const onSubmit = () => {
      if (!password.trim()) return;
      startTransition(async () => {
        const res = await unlockShare({ token, password });
        setResult(res);
        // Xoá ô mật khẩu dù đúng hay sai: đúng thì không cần giữ lại, sai thì
        // gõ lại từ đầu rõ hơn là sửa giữa chuỗi cũ.
        setPassword("");
      });
    };
    return (
      <Frame>
        <Lock className="mx-auto size-6 text-muted-foreground" aria-hidden />
        <h1 className="mt-3 text-center text-[15px] font-semibold">{t("locked.title")}</h1>
        <p className="mt-1.5 text-center text-[13px] leading-relaxed text-muted-foreground">
          {t("locked.description")}
        </p>
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <label htmlFor="bc-pw" className="sr-only">
            {t("locked.passwordLabel")}
          </label>
          <Input
            id="bc-pw"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("locked.passwordLabel")}
          />
          {result.reason === "wrong_password" && (
            <p className="mt-1.5 text-[13px] text-destructive">{t("locked.wrong")}</p>
          )}
          <Button type="submit" className="mt-3 min-h-11 w-full" disabled={pending || !password.trim()}>
            {t("locked.submit")}
          </Button>
        </form>
      </Frame>
    );
  }

  return <Blocked reason={result.reason} />;
}

/**
 * Khung chung: nền trung tính, một cột hẹp, KHÔNG khung app. Trang này không
 * thuộc vùng đăng nhập nên không mượn khung của nó — mượn là mở đường cho một
 * thanh điều hướng lọt vào, mà luật 1 ở trên cấm.
 */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main id="noi-dung-chinh" className="flex min-h-dvh justify-center bg-muted/30 px-4 py-8">
      <div className="w-full max-w-lg rounded-xl border bg-background p-5 shadow-sm">{children}</div>
    </main>
  );
}

/** Mọi kết cục KHÔNG mở được. Không kết cục nào lộ tiệm nào, báo cáo nào. */
function Blocked({ reason }: { reason: ShareOpenFail }) {
  const t = useTranslations("reportShare.public");
  // Mã sai và đã thu hồi CHUNG một câu (ADR-0008 mục 5). Hết hạn nói thật là
  // hết hạn: người này vốn cầm mã đúng nên không lộ thêm gì, mà giấu đi chỉ
  // khiến họ tưởng phần mềm hỏng.
  const key: Record<ShareOpenFail, string> = {
    not_found: "gone",
    expired: "expired",
    rate_limited: "throttled",
    failed: "failed",
    need_password: "gone",
    wrong_password: "gone",
  };
  const k = key[reason];
  return (
    <Frame>
      <h1 className="text-center text-[15px] font-semibold">{t(`blocked.${k}.title`)}</h1>
      <p className="mt-1.5 text-center text-[13px] leading-relaxed text-muted-foreground">
        {t(`blocked.${k}.body`)}
      </p>
    </Frame>
  );
}

function ReportBody({ result }: { result: Extract<ShareOpenResult, { ok: true }> }) {
  const t = useTranslations("reportShare.public");
  const locale = useLocale() as Locale;
  const { payload, periodKey, shopName, tz, generatedAt, expiresAt } = result;

  // Nhãn kỳ: tháng thì in thẳng MM/yyyy; ba kỳ của "Vì sao thua" có câu dịch
  // riêng. Kỳ lạ (bản chụp của một khuôn cũ hơn) thì BỎ NHÃN, không in chuỗi
  // thô lên trang công khai.
  const known = ["month", "3m", "all"];
  const period =
    payload.reportKey === "kpi"
      ? kpiMonthLabel(payload.data.monthKey)
      : known.includes(periodKey)
        ? t(`period.${periodKey}`)
        : "";

  return (
    <Frame>
      <p className="text-xs text-muted-foreground">{shopName}</p>
      <h1 className="mt-0.5 text-base font-semibold">
        {t(`report.${payload.reportKey}`)}
        {period && ` — ${period}`}
      </h1>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {t("snapshotAt", { at: formatInTenantTz(generatedAt, tz, locale) })}
        {" · "}
        {t("expiresAt", { at: formatInTenantTz(expiresAt, tz, locale, false) })}
      </p>

      <div className="mt-4">
        {payload.reportKey === "lost_reasons" ? (
          <LostTable data={payload.data} />
        ) : (
          <KpiTable data={payload.data} locale={locale} />
        )}
      </div>

      {/* Câu này BẮT BUỘC có: người xem phải biết đây là ảnh chụp một thời
          điểm, không phải cửa sổ nhìn vào số hôm nay. Thiếu nó thì kế toán đọc
          số cũ mà tưởng là số mới — sai lầm đắt hơn mọi lỗi kỹ thuật ở đây. */}
      <p className="mt-5 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
        {t("footer")}
      </p>
    </Frame>
  );
}

function LostTable({ data }: { data: Extract<SharePayload, { reportKey: "lost_reasons" }>["data"] }) {
  const t = useTranslations("reportShare.public");
  const tSeed = useTranslations("seed");
  const rows = data.rows.filter((r) => r.cnt > 0);

  if (rows.length === 0) {
    return <p className="py-6 text-center text-[13px] text-muted-foreground">{t("noData")}</p>;
  }

  return (
    <>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="py-1.5 text-left font-medium">{t("lost.reason")}</th>
            <th className="py-1.5 text-right font-medium">{t("lost.count")}</th>
            <th className="py-1.5 text-right font-medium">{t("lost.share")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.key ?? r.name}-${i}`} className="border-b last:border-0">
              <td className="py-2">{seedLabel(r.key, r.name, tSeed) || t("lost.unknown")}</td>
              <td className="py-2 text-right tabular-nums">{r.cnt}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">
                {data.total > 0 ? `${Math.round((r.cnt / data.total) * 100)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2.5 text-xs text-muted-foreground">
        {t("lost.total", { n: data.total })}
        {data.prevTotal > 0 && ` · ${t("lost.prevTotal", { n: data.prevTotal })}`}
      </p>
    </>
  );
}

function KpiTable({
  data,
  locale,
}: {
  data: Extract<SharePayload, { reportKey: "kpi" }>["data"];
  locale: Locale;
}) {
  const t = useTranslations("reportShare.public");

  if (data.rows.length === 0) {
    return <p className="py-6 text-center text-[13px] text-muted-foreground">{t("noData")}</p>;
  }

  const show = (metric: KpiMetric, value: number) =>
    metric === "revenue_won" ? formatMoney(value, locale) : String(value);

  return (
    <>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="py-1.5 text-left font-medium">{t("kpi.who")}</th>
            <th className="py-1.5 text-left font-medium">{t("kpi.metric")}</th>
            <th className="py-1.5 text-right font-medium">{t("kpi.actual")}</th>
            <th className="py-1.5 text-right font-medium">{t("kpi.target")}</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={`${r.who ?? "all"}-${r.metric}-${i}`} className="border-b last:border-0">
              <td className="py-2">{r.who ?? t("kpi.wholeShop")}</td>
              <td className="py-2">{t(`kpi.metricName.${r.metric}`)}</td>
              <td className="py-2 text-right tabular-nums">{show(r.metric, r.actual)}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">
                {show(r.metric, r.target)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2.5 text-xs text-muted-foreground">
        {t("kpi.progress", { done: data.daysElapsed, total: data.daysInMonth })}
      </p>
    </>
  );
}

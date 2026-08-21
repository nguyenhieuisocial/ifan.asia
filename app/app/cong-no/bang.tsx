"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Phone } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";

/**
 * CÔNG NỢ & TIỀN GIỮ HỘ (thẻ `man-cong-no-va-tien-giu-ho`, #340).
 *
 * ⚠️ HAI THẺ, KHÔNG GỘP THÀNH MỘT CON SỐ. "Khách nợ mình" là tiền SẼ VỀ; "giữ
 *   hộ khách" là tiền PHẢI TRẢ LẠI BẰNG DỊCH VỤ. Cộng hay trừ hai cái đó đều
 *   ra một con số vô nghĩa. Để cạnh nhau vì chúng cùng trả lời một câu: *tiền
 *   trong két có bao nhiêu thật sự là của tiệm?*
 *
 * ⚠️ Xếp theo SỐ TIỀN, không theo tên. Chủ tiệm mở màn này để biết gọi ai
 *   trước — người nợ 12 triệu phải nằm trên người nợ 1,8 triệu.
 */

export interface CongNo {
  tong: number;
  so_khach: number;
  so_don: number;
  tuoi: { d30: number; d60: number; d90: number; tren90: number };
  khach: {
    contact_id: string;
    ten: string;
    dien_thoai: string;
    con: number;
    so_don: number;
    ngay_cu_nhat: number;
  }[];
}

export interface GiuHo {
  dang_giu: number;
  da_thu: number;
  so_goi: number;
  so_buoi_con: number;
  sap_het_han: number;
  goi: {
    contract_id: string;
    contact_id: string;
    ten: string;
    goi: string;
    dang_giu: number;
    con_buoi: number;
    tong_buoi: number;
    het_han: string | null;
    /** Số ngày còn lại, do CSDL tính theo giờ Việt Nam (#342). `null` = không hạn. */
    con_ngay: number | null;
  }[];
}

function SoLon({
  nhan,
  tien,
  phu,
  mau,
  locale,
}: {
  nhan: string;
  tien: number;
  phu: string;
  mau?: "do" | "giu";
  locale: Locale;
}) {
  return (
    <div className="flex-1 p-3">
      <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">{nhan}</p>
      <p
        className={cn(
          "mt-0.5 text-xl font-bold tabular-nums",
          mau === "do" && "text-destructive",
          mau === "giu" && "text-amber-700 dark:text-amber-400",
        )}
      >
        {formatMoney(tien, locale)}
      </p>
      <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">{phu}</p>
    </div>
  );
}

export function BangCongNo({
  no,
  giuHo,
  locale,
}: {
  no: Partial<CongNo>;
  giuHo: Partial<GiuHo>;
  locale: Locale;
}) {
  const t = useTranslations("congNo");
  const [tab, datTab] = useState<"no" | "giu">("no");

  const tuoi = no.tuoi ?? { d30: 0, d60: 0, d90: 0, tren90: 0 };
  const tong = no.tong ?? 0;
  const tiLeQua = tong > 0 ? Math.round((tuoi.tren90 / tong) * 100) : 0;

  return (
    <>
      <div className="flex border-b">
        {(["no", "giu"] as const).map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => datTab(x)}
            className={cn(
              "min-h-10 px-3 text-[12.5px] font-semibold",
              x === tab
                ? "border-b-2 border-primary text-foreground"
                : "border-b-2 border-transparent text-muted-foreground",
            )}
          >
            {t(x === "no" ? "tabNo" : "tabGiu")}
          </button>
        ))}
      </div>

      {tab === "no" ? (
        <>
          <div className="flex flex-col divide-y rounded-b-lg border border-t-0 sm:flex-row sm:divide-x sm:divide-y-0">
            <SoLon
              nhan={t("tongNo")}
              tien={tong}
              phu={t("tongNoPhu", { khach: no.so_khach ?? 0, don: no.so_don ?? 0 })}
              mau="do"
              locale={locale}
            />
            <SoLon
              nhan={t("qua90")}
              tien={tuoi.tren90}
              phu={t("qua90Phu", { pct: tiLeQua })}
              mau="do"
              locale={locale}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                ["d30", tuoi.d30, false],
                ["d60", tuoi.d60, false],
                ["d90", tuoi.d90, false],
                ["tren90", tuoi.tren90, true],
              ] as const
            ).map(([k, v, gay]) => (
              <div
                key={k}
                className={cn(
                  "min-w-[110px] flex-1 rounded-lg border p-2",
                  gay && "border-destructive/40 bg-destructive/5",
                )}
              >
                <p className="text-[9.5px] text-muted-foreground">{t(`tuoi.${k}`)}</p>
                <p className={cn("mt-0.5 text-[13px] font-bold tabular-nums", gay && "text-destructive")}>
                  {formatMoney(v, locale)}
                </p>
              </div>
            ))}
          </div>

          {(no.khach ?? []).length === 0 ? (
            <p className="mt-4 rounded-lg border p-4 text-sm text-muted-foreground">{t("khongAiNo")}</p>
          ) : (
            <ul className="mt-3 divide-y rounded-lg border">
              {(no.khach ?? []).map((k) => (
                <li key={k.contact_id} className="flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/app/contacts/${k.contact_id}`}
                      className="text-[13px] font-semibold hover:underline"
                    >
                      {k.ten || t("khongTen")}
                    </Link>
                    <p className="text-[11px] text-muted-foreground">
                      {k.dien_thoai ? `${k.dien_thoai} · ` : ""}
                      {t("soDon", { n: k.so_don })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] font-bold tabular-nums">{formatMoney(k.con, locale)}</p>
                    <p
                      className={cn(
                        "text-[10.5px]",
                        k.ngay_cu_nhat > 90
                          ? "font-semibold text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {t("ngay", { n: k.ngay_cu_nhat })}
                    </p>
                  </div>
                  {/* Trên điện thoại, việc tiếp theo sau khi thấy nợ là bấm gọi
                      ngay — không phải phân tích. Nút này chỉ hiện khi CÓ số. */}
                  {k.dien_thoai && (
                    <a
                      href={`tel:${k.dien_thoai.replace(/\s/g, "")}`}
                      aria-label={t("goi")}
                      className="flex size-9 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
                    >
                      <Phone className="size-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-col divide-y rounded-b-lg border border-t-0 sm:flex-row sm:divide-x sm:divide-y-0">
            <SoLon
              nhan={t("dangGiu")}
              tien={giuHo.dang_giu ?? 0}
              phu={t("dangGiuPhu", { goi: giuHo.so_goi ?? 0, buoi: giuHo.so_buoi_con ?? 0 })}
              mau="giu"
              locale={locale}
            />
            <SoLon
              nhan={t("daThu")}
              tien={giuHo.da_thu ?? 0}
              phu={t("daThuPhu", {
                tien: formatMoney((giuHo.da_thu ?? 0) - (giuHo.dang_giu ?? 0), locale),
              })}
              locale={locale}
            />
          </div>

          {/* ⚠️ Ô CẢNH BÁO NÀY KHÔNG ĐƯỢC BỎ. Đây là cả lý do màn tồn tại: chủ
              tiệm đang đọc tiền bán gói như LÃI. */}
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {t("canhBaoGiuHo")}
          </p>

          {(giuHo.goi ?? []).length === 0 ? (
            <p className="mt-4 rounded-lg border p-4 text-sm text-muted-foreground">{t("khongCoGoi")}</p>
          ) : (
            <ul className="mt-3 divide-y rounded-lg border">
              {(giuHo.goi ?? []).map((g) => {
                // ⚠️ Số ngày do CSDL tính (#342). KHÔNG tính lại ở đây bằng
                //   `Date.now()`: đồng hồ máy khách lệch múi giờ là hạn gói lệch
                //   một ngày, và React cũng chặn phép tính không thuần khiết
                //   lúc dựng giao diện.
                const conNgay = g.con_ngay;
                return (
                  <li key={g.contract_id} className="flex items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/app/contacts/${g.contact_id}`}
                        className="text-[13px] font-semibold hover:underline"
                      >
                        {g.ten || t("khongTen")}
                      </Link>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {g.goi || t("goiKhongTen")} · {t("conBuoi", { con: g.con_buoi, tong: g.tong_buoi })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-bold tabular-nums">
                        {formatMoney(g.dang_giu, locale)}
                      </p>
                      <p
                        className={cn(
                          "text-[10.5px]",
                          conNgay !== null && conNgay <= 30
                            ? "font-semibold text-amber-700 dark:text-amber-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {conNgay === null
                          ? t("khongHan")
                          : conNgay < 0
                            ? t("daHetHan")
                            : t("conNgay", { n: conNgay })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}

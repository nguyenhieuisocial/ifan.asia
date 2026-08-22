"use client";

import { useMemo } from "react";
import Link from "next/link";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { BellOff, HeartHandshake, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  KhoiTrong,
  KhoiTrongDoLoc,
  KhoiTrongLoi,
} from "@/components/ui/khoi-trong";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { ReportNav } from "../report-nav";
import {
  CUA_SO,
  CUA_SO_MAC_DINH,
  LOC,
  LOC_MAC_DINH,
  NGUON,
  NGUON_MAC_DINH,
  NHIP,
  fetchChamSoc,
  oMoc,
  type BaoCaoChamSoc,
  type CuaSo,
  type DongChamSoc,
  type Loc,
  type Nguon,
  type OMoc,
} from "./types";

/** Ô mốc 3-5-7. Màu chỉ nói ĐÚNG thứ đã đo — xem chú thích của `oMoc`. */
const MAU_O: Record<OMoc, string> = {
  xong: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400",
  tre: "border-destructive/30 bg-destructive/10 text-destructive",
  hom_nay:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400",
  chua_toi: "border-border bg-background text-muted-foreground",
  chua_ro: "border-border bg-background text-muted-foreground",
};

/**
 * "Lỗ hổng chăm sóc" — ai vừa đến rồi bị bỏ quên (thẻ `man-lo-hong-cham-soc`).
 *
 * Bốn ô số ở đầu, bộ lọc theo hạn + theo nguồn, rồi một bảng: khách · lượt gần
 * nhất · chuỗi 3-5-7 · người phụ trách. Bộ lọc nằm trên URL để gửi cho nhau
 * được (cùng nếp với ba tab báo cáo kia).
 *
 * ⚠️ MÁY KHÔNG TỰ NHẮN CHO KHÁCH — luật của thẻ, và lý do là thật: iFan chưa có
 * đường gửi tin hàng loạt tới khách. Nên nút ở mỗi dòng chỉ MỞ HỒ SƠ KHÁCH để
 * người phụ trách tự gọi/nhắn, không có nút nào ngầm hứa là đã gửi.
 */
export function ChamSocView({
  ngayDau,
  locDau,
  nguonDau,
  baoDau,
}: {
  ngayDau: CuaSo;
  locDau: Loc;
  nguonDau: Nguon;
  baoDau?: BaoCaoChamSoc;
}) {
  const t = useTranslations("reports.chamSoc");
  const locale = useLocale() as Locale;
  const supabase = useMemo(() => createClient(), []);

  // ⚠️ `withDefault` phải là hằng số MẶC ĐỊNH THẬT, không phải giá trị đọc từ
  // URL lúc vào màn. Nếu lấy giá trị hiện tại làm mặc định thì mở màn bằng
  // `?n=90` rồi bấm "30 ngày" sẽ xoá tham số và rơi ngược về 90 — nút trông
  // như hỏng.
  const [ngay, setNgay] = useQueryState(
    "n",
    parseAsInteger.withDefault(CUA_SO_MAC_DINH),
  );
  const [loc, setLoc] = useQueryState(
    "l",
    parseAsStringLiteral(LOC).withDefault(LOC_MAC_DINH),
  );
  const [nguon, setNguon] = useQueryState(
    "g",
    parseAsStringLiteral(NGUON).withDefault(NGUON_MAC_DINH),
  );
  const cuaSo = (CUA_SO as readonly number[]).includes(ngay)
    ? (ngay as CuaSo)
    : ngayDau;

  const bao = useQuery({
    queryKey: ["lo-hong-cham-soc", cuaSo, loc, nguon],
    queryFn: () => fetchChamSoc(supabase, cuaSo, loc, nguon),
    initialData:
      cuaSo === ngayDau && loc === locDau && nguon === nguonDau
        ? baoDau
        : undefined,
  });

  const d = bao.data ?? null;
  // Tỉ lệ chăm đủ = đã có liên hệ ÷ đã tới hạn. Mẫu số KHÔNG phải tổng khách:
  // khách vừa đến hôm qua chưa tới hạn chăm, đưa vào mẫu số là bôi đen một
  // con số vì lý do không phải lỗi của ai.
  const tiLe =
    d && d.da_toi_han > 0 ? Math.round((d.da_cham / d.da_toi_han) * 100) : null;

  const doiLoc = (v: Loc) => setLoc(v === LOC_MAC_DINH ? null : v);
  const doiNguon = (v: Nguon) => setNguon(v === NGUON_MAC_DINH ? null : v);
  /** Đang ở đúng khung mặc định "ai bị bỏ quên" — không có bộ lọc nào thu hẹp. */
  const khungMacDinh = loc === LOC_MAC_DINH && nguon === NGUON_MAC_DINH;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
        <h1 className="mr-auto min-w-0 truncate text-sm font-semibold">
          {t("title")}
        </h1>
        <div className="flex flex-wrap items-center gap-1">
          {CUA_SO.map((n) => (
            <Button
              key={n}
              size="sm"
              variant={cuaSo === n ? "secondary" : "ghost"}
              onClick={() => setNgay(n === CUA_SO_MAC_DINH ? null : n)}
            >
              {t("cuaSo", { ngay: n })}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Cùng mốc bề rộng với ba tab báo cáo kia — lệch nhau thì bấm qua lại
            giữa chúng thấy khung nhảy. */}
        <div className="mx-auto w-full max-w-4xl space-y-4 p-4 xl:max-w-6xl 2xl:max-w-[1600px]">
          <ReportNav />

          {bao.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : bao.isError || !d ? (
            <div className="rounded-lg border bg-card">
              <KhoiTrongLoi
                moTa={t("loi")}
                hanhDong={
                  <Button variant="outline" size="sm" onClick={() => bao.refetch()}>
                    {t("thuLai")}
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              {/* ── BỐN Ô SỐ ─────────────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
                <OSo
                  nhan={t("oSo.quaHan")}
                  so={d.qua_han}
                  giong={d.qua_han > 0 ? "xau" : undefined}
                />
                <OSo nhan={t("oSo.homNay")} so={d.den_han} />
                <OSo
                  nhan={t("oSo.dungHan")}
                  so={d.dung_han}
                  giong={d.dung_han > 0 ? "tot" : undefined}
                />
                <OSo
                  nhan={t("oSo.tiLe", { ngay: d.ngay })}
                  so={tiLe === null ? "—" : `${tiLe}%`}
                />
              </div>

              {/* Nhân viên chỉ thấy khách mình phụ trách — nói ra, không để họ
                  tưởng cả tiệm chỉ có ngần này khách bị bỏ quên. */}
              {!d.ca_tiem && (
                <p className="text-xs text-muted-foreground">{t("chiKhachCuaToi")}</p>
              )}
              {/* Ẩn im lặng thì tỉ lệ "đã chăm" đẹp lên giả tạo — thẻ chốt phải
                  nói rõ đã ẩn bao nhiêu người. */}
              {d.an_tat_tin > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BellOff className="size-3.5 shrink-0" />
                  {t("anTatTin", { so: d.an_tat_tin })}
                </p>
              )}

              {/* ── BỘ LỌC ───────────────────────────────────────────── */}
              <div className="flex flex-wrap items-center gap-1.5">
                {LOC.map((v) => (
                  <Chip key={v} bat={loc === v} onClick={() => doiLoc(v)}>
                    {t(`loc.${v}`)}
                  </Chip>
                ))}
                <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
                {NGUON.map((v) => (
                  <Chip key={v} bat={nguon === v} onClick={() => doiNguon(v)}>
                    {t(`nguon.${v}`)}
                  </Chip>
                ))}
              </div>

              {/* ── BA TRẠNG THÁI RỖNG, BA CÂU CHUYỆN KHÁC NHAU ──────── */}
              {d.tong === 0 ? (
                /* ① Không có dữ liệu trong khoảng lọc — chưa đo được gì vì
                   không có lượt khách nào, không phải vì tiệm chăm tốt. */
                <div className="rounded-lg border bg-card">
                  <KhoiTrongDoLoc
                    moTa={t("rong.khongDuLieu", { ngay: d.ngay })}
                    hanhDong={
                      cuaSo !== 90 ? (
                        <Button variant="outline" size="sm" onClick={() => setNgay(90)}>
                          {t("rong.moRong")}
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              ) : d.dong.length === 0 && khungMacDinh && !d.bat_tu_dong ? (
                /* ② Có khách, không ai quá hạn, NHƯNG tiệm chưa bật nhịp tự
                   động. Con số 0 ở đây không đọc được là "chăm tốt": không có
                   gì nhắc ai cả, nên lần sau quên là chuyện thường. */
                <div className="rounded-lg border bg-card">
                  <KhoiTrong
                    bieuTuong={<BellOff />}
                    tieuDe={t("rong.chuaBat.tieuDe")}
                    moTa={t("rong.chuaBat.moTa")}
                    hanhDong={
                      d.ca_tiem ? (
                        <Button size="sm" asChild>
                          <Link href="/app/settings/workflows">
                            {t("rong.chuaBat.cta")}
                          </Link>
                        </Button>
                      ) : undefined
                    }
                    goiY={t("rong.chuaBat.goiY")}
                  />
                </div>
              ) : d.dong.length === 0 && khungMacDinh ? (
                /* ③ Đã bật nhịp, có khách, và không ai bị bỏ quên. Đây là tin
                   vui — và phải nói rõ đang đo theo nhịp nào, không thì không
                   ai biết số 0 kia nghĩa là gì. */
                <div className="rounded-lg border bg-card">
                  <KhoiTrong
                    giongTichCuc
                    bieuTuong={<HeartHandshake />}
                    tieuDe={t("rong.khongLoHong.tieuDe")}
                    moTa={t("rong.khongLoHong.moTa", { ngay: d.ngay })}
                    goiY={t("nhipDangDung")}
                  />
                </div>
              ) : d.dong.length === 0 ? (
                <div className="rounded-lg border bg-card">
                  <KhoiTrongDoLoc
                    moTa={t("rong.locKhongRa", {
                      loc: `${t(`loc.${loc}`)} · ${t(`nguon.${nguon}`)}`,
                    })}
                    hanhDong={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          doiLoc(LOC_MAC_DINH);
                          doiNguon(NGUON_MAC_DINH);
                        }}
                      >
                        {t("rong.boLoc")}
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border bg-card">
                  {/* Đã bật hay chưa vẫn ĐO ĐƯỢC (phép đo dựa vào KẾT QUẢ), nên
                      khi có việc để làm thì hiện việc, và chỉ nhắc một dòng. */}
                  {!d.bat_tu_dong && (
                    <p className="border-b bg-muted/40 px-4 py-2.5 text-[13px] text-muted-foreground">
                      {t("chuaBatDai")}{" "}
                      {d.ca_tiem && (
                        <Link
                          href="/app/settings/workflows"
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {t("rong.chuaBat.cta")}
                        </Link>
                      )}
                    </p>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr className="h-10 border-b">
                          <th className="px-4 font-medium">{t("bang.khach")}</th>
                          <th className="hidden px-4 font-medium sm:table-cell">
                            {t("bang.luot")}
                          </th>
                          <th className="hidden px-4 font-medium md:table-cell">
                            {t("bang.chuoi")}
                          </th>
                          <th className="hidden px-4 font-medium lg:table-cell">
                            {t("bang.phuTrach")}
                          </th>
                          <th className="px-4 text-right font-medium">
                            {t("bang.lamGi")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.dong.map((r) => (
                          <Dong key={r.contact_id} r={r} locale={locale} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {d.dong.length >= 100 && (
                    <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
                      {t("catBot")}
                    </p>
                  )}
                </div>
              )}

              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("chuThich.dinhNghia", { ngay: d.ngay })}
                <br />
                {t("chuThich.hanChot")}
                <br />
                {t("chuThich.tiLe")}
                <br />
                {t("chuThich.mocDon")}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OSo({
  nhan,
  so,
  giong,
}: {
  nhan: string;
  so: number | string;
  giong?: "xau" | "tot";
}) {
  return (
    <div className="bg-card px-4 py-3">
      <p
        className={cn(
          "text-xl font-semibold tabular-nums",
          giong === "xau" && "text-destructive",
          giong === "tot" && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {so}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{nhan}</p>
    </div>
  );
}

function Chip({
  bat,
  onClick,
  children,
}: {
  bat: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={bat}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        bat
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Dong({ r, locale }: { r: DongChamSoc; locale: Locale }) {
  const t = useTranslations("reports.chamSoc");
  const o = oMoc(r.so_ngay, r.ngay_lien_he);
  const viec =
    r.loai === "buoi_hen"
      ? (r.nhan ?? t("luot.buoiHen"))
      : r.tien !== null
        ? t("luot.don", { tien: formatMoney(r.tien, locale) })
        : t("luot.donKhongTien");
  const khiNao = t("luot.cachDay", { ngay: r.so_ngay });
  const chuoi = (
    <div className="flex items-center gap-1" aria-label={t(`chuoi.${chuoiKey(o)}`)}>
      {NHIP.map((m, i) => (
        <span key={m} className="flex items-center gap-1">
          {i > 0 && <span className="h-px w-2 bg-border" aria-hidden />}
          <span
            className={cn(
              "flex h-5 w-6 items-center justify-center rounded border text-[10px] font-semibold",
              MAU_O[o[i]],
            )}
          >
            {m}
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <tr className={cn("border-b last:border-0", r.trang_thai === "qua_han" && "bg-destructive/5")}>
      <td className="px-4 py-3 align-top">
        <Link
          href={`/app/contacts/${r.contact_id}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {r.ten}
        </Link>
        {r.dien_thoai && (
          <p className="text-xs text-muted-foreground">{r.dien_thoai}</p>
        )}
        {/* Dưới sm cột "lượt gần nhất" bị ẩn — gộp vào đây, đừng để mất số liệu */}
        <p className="mt-1 text-xs text-muted-foreground sm:hidden">
          {viec} · {khiNao}
        </p>
        {/* Dưới md cột "chuỗi chăm" bị ẩn — ba ô này là thứ nói được ĐANG TẮC Ở
            BƯỚC NÀO, mất nó thì dòng chỉ còn "trễ mấy ngày". */}
        <div className="mt-1.5 md:hidden">{chuoi}</div>
        {/* Dưới lg cột "người phụ trách" bị ẩn — "Chưa giao" là trạng thái phải
            thấy được trên điện thoại, vì đó là việc chắc chắn không ai làm. */}
        <p className="mt-1 text-xs text-muted-foreground lg:hidden">
          {r.nguoi_phu_trach ?? t("chuaGiao")}
        </p>
      </td>
      <td className="hidden px-4 py-3 align-top sm:table-cell">
        <p>{viec}</p>
        <p className="text-xs text-muted-foreground">{khiNao}</p>
      </td>
      <td className="hidden px-4 py-3 align-top md:table-cell">
        {chuoi}
        <p className="mt-1 text-xs text-muted-foreground">{t(`chuoi.${chuoiKey(o)}`)}</p>
      </td>
      <td className="hidden px-4 py-3 align-top lg:table-cell">
        {r.nguoi_phu_trach ? (
          <span>{r.nguoi_phu_trach}</span>
        ) : (
          /* Việc chăm không có người phụ trách là việc sẽ không ai làm — hiện
             thành một trạng thái riêng, đừng để nó lẫn vào đám quá hạn. */
          <span className="text-muted-foreground">{t("chuaGiao")}</span>
        )}
      </td>
      <td className="px-4 py-3 text-right align-top">
        <Button size="sm" variant={r.trang_thai === "qua_han" ? "default" : "outline"} asChild>
          <Link href={`/app/contacts/${r.contact_id}`}>
            <PhoneCall className="size-3.5" />
            <span className="hidden sm:inline">{t("chamNgay")}</span>
          </Link>
        </Button>
      </td>
    </tr>
  );
}

/** Một câu ngắn tả chuỗi — chữ mới nói được điều màu sắc chỉ gợi ý. */
function chuoiKey(o: OMoc[]): "chuaAiDung" | "treMotPhan" | "daCham" | "dungNhip" {
  if (o.includes("xong")) return "daCham";
  if (o.every((x) => x === "tre")) return "chuaAiDung";
  if (o.includes("tre") || o.includes("hom_nay")) return "treMotPhan";
  return "dungNhip";
}

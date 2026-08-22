"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Minus, Plus, Printer, StickyNote, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KhoiTrong } from "@/components/ui/khoi-trong";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import type { Ban, DonBan } from "@/lib/catalog/ban";
import { normalizeSearch } from "../contacts/types";
import { chuyenBan, danhDauTamTinh, datGhiChuDong, doiSoLuong, moBan, themMonVaoBan } from "./actions";

export type MonBan = { id: string; ten: string; giaVnd: number; nhom: string | null };

/**
 * MÀN BÁN TẠI QUẦY (thẻ `man-ban-quan-an`).
 *
 * ═══════════════════════════════════════════════════════════════════
 * BỐ CỤC HỌC TỪ NỀN DẪN ĐẦU MẢNG NÀY
 * ═══════════════════════════════════════════════════════════════════
 * MỘT màn, hai khoang: khoang trái đổi giữa hai tab (Phòng bàn ↔ Thực đơn),
 * khoang phải LUÔN là đơn đang mở. Bản thiết kế đầu của tôi tách thành hai màn
 * rời và tái dùng màn chi tiết đơn — sai, vì nó bắt người đứng quầy nhớ mình
 * đang gọi món cho bàn nào.
 *
 * ⚠️ DƯỚI 1024px KHÔNG ÉP HAI KHOANG CẠNH NHAU. 375px chia đôi là mỗi khoang
 *   187px — lưới món thành một cột, tên món vỡ dòng. Thay bằng: chọn bàn →
 *   khoang trái ẩn đi, và dải tổng tiền dính đáy màn để lúc nào cũng thấy đang
 *   bao nhiêu tiền.
 */
export function BanView({
  banDauVao,
  mon,
  donDauVao,
  locale: localeProp,
}: {
  banDauVao: Ban[];
  mon: MonBan[];
  donDauVao: DonBan | null;
  locale: Locale;
}) {
  const t = useTranslations("ban");
  const tLoi = useTranslations("errors");
  const locale = (useLocale() as Locale) ?? localeProp;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [donId, setDonId] = useState<string | null>(donDauVao?.id ?? null);
  const [tab, setTab] = useState<"ban" | "mon">("ban");
  const [khu, setKhu] = useState<string>("");
  const [locTrangThai, setLocTrangThai] = useState<"tat-ca" | "dang" | "trong">("tat-ca");
  const [tim, setTim] = useState("");
  const [nhom, setNhom] = useState<string>("");
  const [dangGhiChu, setDangGhiChu] = useState<string | null>(null);
  const [chuGhi, setChuGhi] = useState("");

  const don = donDauVao && donDauVao.id === donId ? donDauVao : null;
  const banDangMo = banDauVao.find((b) => b.donId === donId) ?? null;

  /**
   * Khu vực suy từ TÊN bàn: "Bàn sân vườn 1" → "Bàn sân vườn".
   *
   * ⚠️ Bảng `resources` chưa có cột khu vực. Suy từ tên là phép TẠM, và nó chỉ
   *   đúng khi tiệm đặt tên có quy luật (quán mẫu đặt "Bàn 01…12" + "Bàn sân
   *   vườn 1…4" nên ra hai khu). Tiệm đặt tên lộn xộn thì mỗi bàn một khu —
   *   lúc đó bộ lọc vô dụng nhưng KHÔNG hỏng gì. Thêm cột khu vực thật khi có
   *   quán đủ lớn để cần, đừng thêm trước.
   */
  const khuVuc = useMemo(() => {
    const dem = new Map<string, number>();
    for (const b of banDauVao) {
      const k = b.ten.replace(/\s*[\d０-９]+\s*$/u, "").trim() || b.ten;
      dem.set(k, (dem.get(k) ?? 0) + 1);
    }
    return [...dem.entries()].filter(([, n]) => n >= 2).map(([k]) => k);
  }, [banDauVao]);

  const banHien = banDauVao.filter((b) => {
    if (khu && !b.ten.startsWith(khu)) return false;
    if (locTrangThai === "dang" && b.trangThai === "trong") return false;
    if (locTrangThai === "trong" && b.trangThai !== "trong") return false;
    return true;
  });
  const soDangDung = banDauVao.filter((b) => b.trangThai !== "trong").length;

  const cacNhom = useMemo(
    () => [...new Set(mon.map((m) => m.nhom).filter((x): x is string => !!x))].sort(),
    [mon],
  );
  const monHien = useMemo(() => {
    const q = normalizeSearch(tim);
    return mon.filter((m) => {
      if (nhom && m.nhom !== nhom) return false;
      if (!q) return true;
      const ten = normalizeSearch(m.ten);
      if (ten.includes(q)) return true;
      // Gõ tắt chữ đầu: "cfsd" → "Cà phê sữa đá". Người đứng quầy gõ thế.
      const chuDau = ten
        .split(/\s+/)
        .map((w) => w[0] ?? "")
        .join("");
      return chuDau.includes(q);
    });
  }, [mon, nhom, tim]);

  const chay = (viec: () => Promise<{ error: string | null }>, khiXong?: () => void) =>
    startTransition(async () => {
      const kq = await viec();
      if (kq.error) {
        toast.error(kq.error === "ban_dang_co_don" ? t("loi.banDangCoDon") : tLoi("saveFailed"));
        return;
      }
      khiXong?.();
      router.refresh();
    });

  const chamBan = (b: Ban) => {
    if (b.donId) {
      setDonId(b.donId);
      setTab("mon");
      router.push(`/app/ban?don=${b.donId}`);
      return;
    }
    chay(
      async () => {
        const kq = await moBan(b.id);
        if (!kq.error && kq.donId) {
          setDonId(kq.donId);
          setTab("mon");
          router.push(`/app/ban?don=${kq.donId}`);
        }
        return kq;
      },
    );
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Dải đầu: tên màn + đếm bàn đang dùng ─────────────────────── */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="text-[12px] text-muted-foreground">
            {t("dangDung", { dang: soDangDung, tong: banDauVao.length })}
          </p>
        </div>
        {don && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/app/orders/${don.id}`}>{t("moDonDayDu")}</Link>
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 lg:flex-row">
        {/* ══ KHOANG TRÁI ══════════════════════════════════════════════ */}
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col lg:border-r",
            // Trên màn hẹp: đang mở một bàn thì khoang này nhường chỗ cho đơn.
            don && "max-lg:hidden",
          )}
        >
          <div className="flex shrink-0 gap-1 border-b px-2 pt-2">
            {(["ban", "mon"] as const).map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setTab(x)}
                className={cn(
                  "rounded-t-lg px-3 py-2 text-[13px] font-semibold max-md:min-h-11",
                  tab === x
                    ? "bg-card text-primary shadow-[inset_0_-2px_0_var(--primary)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(x === "ban" ? "tabBan" : "tabMon")}
              </button>
            ))}
          </div>

          {tab === "ban" ? (
            <>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-2">
                <Chip on={khu === ""} onClick={() => setKhu("")}>{t("tatCaKhu")}</Chip>
                {khuVuc.map((k) => (
                  <Chip key={k} on={khu === k} onClick={() => setKhu(k)}>{k}</Chip>
                ))}
                {khuVuc.length > 0 && <span className="mx-1 h-4 w-px bg-border" aria-hidden />}
                <Chip on={locTrangThai === "dang"} onClick={() => setLocTrangThai(locTrangThai === "dang" ? "tat-ca" : "dang")}>
                  {t("locDangDung")}
                </Chip>
                <Chip on={locTrangThai === "trong"} onClick={() => setLocTrangThai(locTrangThai === "trong" ? "tat-ca" : "trong")}>
                  {t("locConTrong")}
                </Chip>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {banHien.length === 0 ? (
                  <KhoiTrong
                    className="rounded-md border border-dashed"
                    bieuTuong={<Utensils />}
                    tieuDe={t("trong.tieuDe")}
                    moTa={t("trong.moTa")}
                    hanhDong={
                      <Button asChild size="sm" variant="outline">
                        <Link href="/app/settings/services">{t("trong.cta")}</Link>
                      </Button>
                    }
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
                    {banHien.map((b) => (
                      <OBan
                        key={b.id}
                        ban={b}
                        dangChon={b.donId != null && b.donId === donId}
                        locale={locale}
                        onClick={() => chamBan(b)}
                        disabled={pending}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex shrink-0 flex-col gap-2 border-b px-3 py-2">
                <Input
                  value={tim}
                  onChange={(e) => setTim(e.target.value)}
                  placeholder={t("timMon")}
                  className="h-9"
                />
                {cacNhom.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <Chip on={nhom === ""} onClick={() => setNhom("")}>{t("tatCaNhom")}</Chip>
                    {cacNhom.map((n) => (
                      <Chip key={n} on={nhom === n} onClick={() => setNhom(n)}>{n}</Chip>
                    ))}
                  </div>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {!don ? (
                  <p className="p-6 text-center text-[13px] text-muted-foreground">{t("chuaChonBan")}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {monHien.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        disabled={pending}
                        onClick={() => chay(() => themMonVaoBan({ donId: don.id, itemId: m.id, ghiChu: null }))}
                        className="flex min-h-[64px] flex-col justify-between rounded-lg border p-2.5 text-left transition-colors hover:border-primary hover:bg-primary-tint disabled:opacity-60"
                      >
                        <span className="text-[12.5px] leading-snug font-medium">{m.ten}</span>
                        <span className="text-[12.5px] font-bold tabular-nums text-muted-foreground">
                          {formatMoney(m.giaVnd, locale)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ══ KHOANG PHẢI — đơn đang mở ════════════════════════════════ */}
        {don && (
          <div className="flex min-h-0 w-full shrink-0 flex-col bg-card lg:w-[300px]">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold">{don.banTen ?? t("khongBan")}</div>
                <div className="text-[11px] text-muted-foreground">
                  {don.tamTinhLuc ? t("daTamTinh") : t("soDong", { n: don.dong.length })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDonId(null);
                  setTab("ban");
                  router.push("/app/ban");
                }}
                className="text-[12px] text-muted-foreground hover:text-foreground max-md:min-h-11 max-md:px-2"
              >
                {t("dongDon")}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {don.dong.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-muted-foreground">{t("chuaCoMon")}</p>
              ) : (
                don.dong.map((d) => (
                  <div key={d.id} className="border-b py-2 last:border-b-0">
                    <div className="flex items-start justify-between gap-2 text-[13px]">
                      <span className="min-w-0 flex-1">{d.ten}</span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatMoney(d.qty * d.donGiaVnd, locale)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <NutSo
                          onClick={() => chay(() => doiSoLuong({ donId: don.id, lineId: d.id, qty: d.qty - 1 }))}
                          disabled={pending}
                          nhan={t("bot")}
                        >
                          <Minus className="size-3.5" />
                        </NutSo>
                        <span className="w-7 text-center text-[13px] font-semibold tabular-nums">{d.qty}</span>
                        <NutSo
                          onClick={() => chay(() => doiSoLuong({ donId: don.id, lineId: d.id, qty: d.qty + 1 }))}
                          disabled={pending}
                          nhan={t("them")}
                        >
                          <Plus className="size-3.5" />
                        </NutSo>
                        {/* Đơn giá của MỘT cái. Không có nó thì "2 · 70.000đ"
                            không kiểm được bằng mắt lúc khách soi hoá đơn. */}
                        {d.qty > 1 && (
                          <span className="ml-1 text-[11px] text-muted-foreground tabular-nums">
                            {formatMoney(d.donGiaVnd, locale)}/{t("cai")}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDangGhiChu(d.id);
                          setChuGhi(d.ghiChu ?? "");
                        }}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground max-md:min-h-11 max-md:px-1"
                      >
                        <StickyNote className="size-3.5" />
                        {d.ghiChu ? t("suaGhiChu") : t("themGhiChu")}
                      </button>
                    </div>
                    {d.ghiChu && !(dangGhiChu === d.id) && (
                      <p className="mt-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-500">
                        {d.ghiChu}
                      </p>
                    )}
                    {dangGhiChu === d.id && (
                      <div className="mt-1.5 flex gap-1.5">
                        <Input
                          value={chuGhi}
                          onChange={(e) => setChuGhi(e.target.value)}
                          placeholder={t("ghiChuViDu")}
                          maxLength={200}
                          autoFocus
                          className="h-8 text-[12px]"
                        />
                        <Button
                          size="sm"
                          className="h-8 shrink-0"
                          disabled={pending}
                          onClick={() =>
                            chay(
                              () => datGhiChuDong({ donId: don.id, lineId: d.id, ghiChu: chuGhi }),
                              () => setDangGhiChu(null),
                            )
                          }
                        >
                          {t("luu")}
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Dải tổng — dính đáy, luôn nhìn thấy. */}
            <div className="shrink-0 border-t px-3 py-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-muted-foreground">{t("tong")}</span>
                <span className="text-[19px] font-bold tabular-nums">{formatMoney(don.tongVnd, locale)}</span>
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={pending || don.dong.length === 0}
                  onClick={() =>
                    chay(() => danhDauTamTinh(don.id), () => window.open(`/in/don/${don.id}`, "_blank"))
                  }
                >
                  <Printer className="size-4" />
                  {t("tamTinh")}
                </Button>
                <Button asChild size="sm" className="flex-[1.3]">
                  <Link href={`/app/orders/${don.id}`}>{t("thanhToan")}</Link>
                </Button>
              </div>
              {banDangMo && (
                <ChuyenBanNhanh
                  banHienTai={banDangMo}
                  cacBan={banDauVao}
                  disabled={pending}
                  onChuyen={(banMoi) => chay(() => chuyenBan(don.id, banMoi))}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11.5px] font-medium max-md:min-h-9",
        on ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function NutSo({
  onClick,
  disabled,
  nhan,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  nhan: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={nhan}
      className="flex size-7 items-center justify-center rounded-md border hover:bg-accent disabled:opacity-50 max-md:size-11"
    >
      {children}
    </button>
  );
}

/**
 * MỘT Ô BÀN.
 *
 * ⚠️ TRẠNG THÁI NÓI BẰNG CHỮ, MÀU CHỈ ĐỂ NHẤN (WCAG 1.4.1). Quán sáng đèn vàng,
 *   màn hình loá nắng, và người bưng bê không phải ai cũng phân biệt được cam
 *   với xanh dương.
 *
 * ⚠️ "Đã in tạm tính" dùng HỌ MÀU KHÁC HẲN (xanh dương) chứ không phải sắc đậm
 *   hơn của "đang phục vụ" — nó nói một việc khác: khách đã xin tính tiền.
 */
function OBan({
  ban,
  dangChon,
  locale,
  onClick,
  disabled,
}: {
  ban: Ban;
  dangChon: boolean;
  locale: Locale;
  onClick: () => void;
  disabled: boolean;
}) {
  const t = useTranslations("ban");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-[72px] flex-col justify-between rounded-lg border p-2.5 text-left transition-colors disabled:opacity-60",
        ban.trangThai === "trong" && "border-dashed bg-transparent hover:border-primary",
        ban.trangThai === "dang" && "border-primary bg-primary-tint",
        ban.trangThai === "tam_tinh" && "border-sky-600 bg-sky-50 dark:bg-sky-950/40",
        dangChon && "outline-2 outline-offset-1 outline-foreground",
      )}
    >
      <div>
        <div className="text-[13px] font-semibold">{ban.ten}</div>
        <div
          className={cn(
            "text-[9.5px] font-bold tracking-wide uppercase",
            ban.trangThai === "trong" && "text-muted-foreground",
            ban.trangThai === "dang" && "text-primary",
            ban.trangThai === "tam_tinh" && "text-sky-700 dark:text-sky-400",
          )}
        >
          {ban.trangThai === "trong" ? t("oTrong") : ban.trangThai === "dang" ? t("oDang") : t("oTamTinh")}
        </div>
      </div>
      {ban.trangThai === "trong" ? (
        <span className="text-[11px] text-muted-foreground">{t("chamDeMo")}</span>
      ) : (
        <span className="text-[14px] font-bold tabular-nums">{formatMoney(ban.tongVnd, locale)}</span>
      )}
    </button>
  );
}

/** Chuyển bàn — một ô chọn, không phải một hộp thoại. Khách đổi chỗ là việc vặt. */
function ChuyenBanNhanh({
  banHienTai,
  cacBan,
  disabled,
  onChuyen,
}: {
  banHienTai: Ban;
  cacBan: Ban[];
  disabled: boolean;
  onChuyen: (banMoiId: string) => void;
}) {
  const t = useTranslations("ban");
  const [mo, setMo] = useState(false);
  const trong = cacBan.filter((b) => b.trangThai === "trong" && b.id !== banHienTai.id);
  if (trong.length === 0) return null;

  if (!mo) {
    return (
      <button
        type="button"
        onClick={() => setMo(true)}
        className="mt-2 w-full text-[11.5px] text-muted-foreground hover:text-foreground max-md:min-h-11"
      >
        {t("chuyenBan")}
      </button>
    );
  }
  return (
    <div className="mt-2">
      <div className="mb-1 text-[11px] text-muted-foreground">{t("chonBanMoi")}</div>
      <div className="flex flex-wrap gap-1.5">
        {trong.map((b) => (
          <button
            key={b.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              onChuyen(b.id);
              setMo(false);
            }}
            className="rounded-md border px-2 py-1 text-[11.5px] hover:bg-accent disabled:opacity-50 max-md:min-h-9"
          >
            {b.ten}
          </button>
        ))}
      </div>
    </div>
  );
}

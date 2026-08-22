"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Package, Plus, QrCode, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KhoiTrong, KhoiTrongDoLoc } from "@/components/ui/khoi-trong";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import {
  conBaoNhieuNgayBaoHanh,
  TINH_TRANG_TAI_SAN,
  type TaiSan,
  type TinhTrangTaiSan,
} from "@/lib/catalog/tai-san-chung";
import { normalizeSearch } from "../contacts/types";
import {
  doiTinhTrang,
  giaoTaiSan,
  luuTaiSan,
  thuHoiTaiSan,
  xacNhanNhan,
} from "./actions";

export type NhanVienChon = { id: string; ten: string };

/** Ngưỡng "sắp hết bảo hành" — 30 ngày. Đủ sớm để gọi bảo hành, không sớm tới mức nhàm. */
const SAP_HET = 30;

const MAU_TINH_TRANG: Record<TinhTrangTaiSan, string> = {
  dung_duoc:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  dang_sua:
    "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  hong: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  da_thanh_ly: "bg-muted text-muted-foreground",
};

/**
 * MÀN TÀI SẢN & THIẾT BỊ (thẻ `man-tai-san`).
 *
 * ⚠️ MỖI DÒNG ĐEO TỚI BA NHÃN, VÀ BA NHÃN NÓI BA CHUYỆN KHÁC NHAU:
 *   ① tình trạng vật lý · ② đang ở tay ai · ③ cảnh báo thời hạn.
 *   Đây không phải trang trí — đó là điều học đắt nhất khi đọc mã Snipe-IT:
 *   gộp ① và ② vào một nhãn thì cái giường *đang giao cho phòng 2 nhưng vừa
 *   gãy chân* chỉ nói được một nửa sự thật.
 */
export function TaiSanView({
  dsDauVao,
  nhanVien,
  homNayVn,
  canManage,
}: {
  dsDauVao: TaiSan[];
  nhanVien: NhanVienChon[];
  homNayVn: string;
  canManage: boolean;
}) {
  const t = useTranslations("taiSan");
  const tLoi = useTranslations("errors");
  const locale = useLocale() as Locale;
  const [pending, startTransition] = useTransition();

  const [tim, setTim] = useState("");
  const [locTinhTrang, setLocTinhTrang] = useState<"tat-ca" | TinhTrangTaiSan>(
    "tat-ca",
  );
  const [dangSua, setDangSua] = useState<TaiSan | "moi" | null>(null);
  const [dangGiao, setDangGiao] = useState<TaiSan | null>(null);

  const chay = (
    viec: () => Promise<{ error: string | null }>,
    xong?: () => void,
  ) =>
    startTransition(async () => {
      const kq = await viec();
      if (kq.error) {
        const rieng = [
          "trung_ma",
          "khong_giao_duoc",
          "dang_giao_roi",
          "phai_chon_mot",
          "forbidden",
        ];
        toast.error(
          rieng.includes(kq.error) ? t(`loi.${kq.error}`) : tLoi("saveFailed"),
        );
        return;
      }
      xong?.();
    });

  const hien = useMemo(() => {
    const q = normalizeSearch(tim);
    return dsDauVao.filter((x) => {
      if (locTinhTrang !== "tat-ca" && x.tinhTrang !== locTinhTrang)
        return false;
      if (!q) return true;
      return normalizeSearch(
        `${x.ten} ${x.ma ?? ""} ${x.loai ?? ""} ${x.viTri ?? ""}`,
      ).includes(q);
    });
  }, [dsDauVao, tim, locTinhTrang]);

  const soSapHet = dsDauVao.filter((x) => {
    const n = conBaoNhieuNgayBaoHanh(x.baoHanhDen, homNayVn);
    return n !== null && n >= 0 && n <= SAP_HET;
  }).length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">{t("title")}</h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {t("tomTat", { n: dsDauVao.length })}
                {soSapHet > 0
                  ? ` · ${t("sapHetBaoHanh", { n: soSapHet })}`
                  : ""}
              </p>
            </div>
            {canManage && (
              <Button size="sm" onClick={() => setDangSua("moi")}>
                <Plus className="size-4" />
                {t("them")}
              </Button>
            )}
          </div>

          {dsDauVao.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={tim}
                onChange={(e) => setTim(e.target.value)}
                placeholder={t("tim")}
                className="h-9 max-w-xs"
              />
              <Select
                value={locTinhTrang}
                onChange={(e) =>
                  setLocTinhTrang(e.target.value as typeof locTinhTrang)
                }
                className="h-9 w-auto"
              >
                <option value="tat-ca">{t("locTatCa")}</option>
                {TINH_TRANG_TAI_SAN.map((x) => (
                  <option key={x} value={x}>
                    {t(`tinhTrang.${x}`)}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {dsDauVao.length === 0 ? (
            <KhoiTrong
              className="rounded-md border border-dashed"
              bieuTuong={<Package />}
              tieuDe={t("trong.tieuDe")}
              moTa={t("trong.moTa")}
              hanhDong={
                canManage ? (
                  <Button size="sm" onClick={() => setDangSua("moi")}>
                    {t("trong.cta")}
                  </Button>
                ) : undefined
              }
            />
          ) : hien.length === 0 ? (
            <KhoiTrongDoLoc
              className="rounded-md border border-dashed"
              moTa={t("locKhongRa")}
              hanhDong={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTim("");
                    setLocTinhTrang("tat-ca");
                  }}
                >
                  {t("boLoc")}
                </Button>
              }
            />
          ) : (
            <div className="divide-y rounded-md border">
              {hien.map((x) => (
                <DongTaiSan
                  key={x.id}
                  ts={x}
                  homNayVn={homNayVn}
                  canManage={canManage}
                  locale={locale}
                  pending={pending}
                  onSua={() => setDangSua(x)}
                  onGiao={() => setDangGiao(x)}
                  onThuHoi={() =>
                    x.dangGiao && chay(() => thuHoiTaiSan(x.dangGiao!.id))
                  }
                  onXacNhan={() =>
                    x.dangGiao && chay(() => xacNhanNhan(x.dangGiao!.id))
                  }
                  onDoiTinhTrang={(tt) =>
                    chay(() => doiTinhTrang({ assetId: x.id, tinhTrang: tt }))
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {dangSua && (
        <HopSua
          ts={dangSua === "moi" ? null : dangSua}
          pending={pending}
          onDong={() => setDangSua(null)}
          onLuu={(du) =>
            chay(
              () => luuTaiSan(du),
              () => setDangSua(null),
            )
          }
        />
      )}
      {dangGiao && (
        <HopGiao
          ts={dangGiao}
          nhanVien={nhanVien}
          pending={pending}
          onDong={() => setDangGiao(null)}
          onGiao={(du) =>
            chay(
              () => giaoTaiSan(du),
              () => setDangGiao(null),
            )
          }
        />
      )}
    </div>
  );
}

function DongTaiSan({
  ts,
  homNayVn,
  canManage,
  locale,
  pending,
  onSua,
  onGiao,
  onThuHoi,
  onXacNhan,
  onDoiTinhTrang,
}: {
  ts: TaiSan;
  homNayVn: string;
  canManage: boolean;
  locale: Locale;
  pending: boolean;
  onSua: () => void;
  onGiao: () => void;
  onThuHoi: () => void;
  onXacNhan: () => void;
  onDoiTinhTrang: (tt: TinhTrangTaiSan) => void;
}) {
  const t = useTranslations("taiSan");
  const conNgay = conBaoNhieuNgayBaoHanh(ts.baoHanhDen, homNayVn);
  const phu = [
    ts.ma,
    ts.viTri,
    ts.ngayMua ? formatDate(ts.ngayMua, locale) : null,
    ts.giaMuaVnd !== null ? formatMoney(ts.giaMuaVnd, locale) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-start gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold">{ts.ten}</div>
        {phu && (
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {phu}
          </div>
        )}

        {/* BA NHÃN, BA TRỤC — xem chú thích đầu file. */}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold",
              MAU_TINH_TRANG[ts.tinhTrang],
            )}
          >
            {t(`tinhTrang.${ts.tinhTrang}`)}
          </span>

          {ts.dangGiao ? (
            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">
              {t("dangGiaoCho", {
                ai: ts.dangGiao.nguoiGiu ?? ts.dangGiao.boPhan ?? "",
              })}
              {/* Chưa xác nhận là một trạng thái CÓ NGHĨA, không phải chi tiết
                  phụ: trước khi người nhận bấm xác nhận thì chưa ai chịu trách
                  nhiệm cho món đồ. */}
              {!ts.dangGiao.xacNhanLuc ? ` · ${t("chuaXacNhan")}` : ""}
            </span>
          ) : (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {t("chuaGiao")}
            </span>
          )}

          {conNgay !== null && conNgay < 0 && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {t("hetBaoHanh", { ngay: formatDate(ts.baoHanhDen!, locale) })}
            </span>
          )}
          {conNgay !== null && conNgay >= 0 && conNgay <= SAP_HET && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              {t("conNgayBaoHanh", { n: conNgay })}
            </span>
          )}
        </div>

        {canManage && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ts.dangGiao ? (
              <>
                {!ts.dangGiao.xacNhanLuc && (
                  <NutNho onClick={onXacNhan} disabled={pending}>
                    {t("xacNhanHo")}
                  </NutNho>
                )}
                <NutNho onClick={onThuHoi} disabled={pending}>
                  {t("thuHoi")}
                </NutNho>
              </>
            ) : (
              ts.tinhTrang === "dung_duoc" && (
                <NutNho onClick={onGiao} disabled={pending}>
                  {t("giao")}
                </NutNho>
              )
            )}
            {ts.tinhTrang === "dung_duoc" && (
              <NutNho onClick={() => onDoiTinhTrang("hong")} disabled={pending}>
                <Wrench className="size-3" />
                {t("baoHong")}
              </NutNho>
            )}
            {(ts.tinhTrang === "hong" || ts.tinhTrang === "dang_sua") && (
              <NutNho
                onClick={() => onDoiTinhTrang("dung_duoc")}
                disabled={pending}
              >
                {t("dungLaiDuoc")}
              </NutNho>
            )}
            <NutNho onClick={onSua} disabled={pending}>
              {t("sua")}
            </NutNho>
          </div>
        )}
      </div>
      <QrCode
        className="size-4 shrink-0 text-muted-foreground/40"
        aria-hidden
      />
    </div>
  );
}

function NutNho({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11.5px] hover:bg-accent disabled:opacity-50 max-md:h-11 max-md:px-3"
    >
      {children}
    </button>
  );
}

function HopSua({
  ts,
  pending,
  onDong,
  onLuu,
}: {
  ts: TaiSan | null;
  pending: boolean;
  onDong: () => void;
  onLuu: (du: Parameters<typeof luuTaiSan>[0]) => void;
}) {
  const t = useTranslations("taiSan");
  const [ten, setTen] = useState(ts?.ten ?? "");
  const [ma, setMa] = useState(ts?.ma ?? "");
  const [loai, setLoai] = useState(ts?.loai ?? "");
  const [viTri, setViTri] = useState(ts?.viTri ?? "");
  const [ngayMua, setNgayMua] = useState(ts?.ngayMua ?? "");
  const [gia, setGia] = useState(
    ts?.giaMuaVnd != null ? String(ts.giaMuaVnd) : "",
  );
  const [baoHanh, setBaoHanh] = useState(ts?.baoHanhDen ?? "");
  const [ghiChu, setGhiChu] = useState(ts?.ghiChu ?? "");
  const [tinhTrang, setTinhTrang] = useState<TinhTrangTaiSan>(
    ts?.tinhTrang ?? "dung_duoc",
  );

  return (
    <Dialog open onOpenChange={(v) => !v && onDong()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ts ? t("suaTieuDe") : t("themTieuDe")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label
              htmlFor="ts-ten"
              className="text-[11px] text-muted-foreground"
            >
              {t("f.ten")}
            </Label>
            <Input
              id="ts-ten"
              value={ten}
              onChange={(e) => setTen(e.target.value)}
              maxLength={200}
              autoFocus
              className="h-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label
                htmlFor="ts-ma"
                className="text-[11px] text-muted-foreground"
              >
                {t("f.ma")}
              </Label>
              <Input
                id="ts-ma"
                value={ma}
                onChange={(e) => setMa(e.target.value)}
                maxLength={60}
                className="h-9"
              />
            </div>
            <div>
              <Label
                htmlFor="ts-loai"
                className="text-[11px] text-muted-foreground"
              >
                {t("f.loai")}
              </Label>
              <Input
                id="ts-loai"
                value={loai}
                onChange={(e) => setLoai(e.target.value)}
                maxLength={60}
                className="h-9"
              />
            </div>
          </div>
          <div>
            <Label
              htmlFor="ts-vitri"
              className="text-[11px] text-muted-foreground"
            >
              {t("f.viTri")}
            </Label>
            <Input
              id="ts-vitri"
              value={viTri}
              onChange={(e) => setViTri(e.target.value)}
              maxLength={120}
              className="h-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label
                htmlFor="ts-ngaymua"
                className="text-[11px] text-muted-foreground"
              >
                {t("f.ngayMua")}
              </Label>
              <Input
                id="ts-ngaymua"
                type="date"
                value={ngayMua}
                onChange={(e) => setNgayMua(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label
                htmlFor="ts-baohanh"
                className="text-[11px] text-muted-foreground"
              >
                {t("f.baoHanhDen")}
              </Label>
              <Input
                id="ts-baohanh"
                type="date"
                value={baoHanh}
                onChange={(e) => setBaoHanh(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label
                htmlFor="ts-gia"
                className="text-[11px] text-muted-foreground"
              >
                {t("f.giaMua")}
              </Label>
              <Input
                id="ts-gia"
                inputMode="numeric"
                value={gia}
                onChange={(e) =>
                  setGia(e.target.value.replace(/\D/g, "").slice(0, 12))
                }
                className="h-9"
              />
            </div>
            <div>
              <Label
                htmlFor="ts-tinhtrang"
                className="text-[11px] text-muted-foreground"
              >
                {t("f.tinhTrang")}
              </Label>
              <Select
                id="ts-tinhtrang"
                value={tinhTrang}
                onChange={(e) =>
                  setTinhTrang(e.target.value as TinhTrangTaiSan)
                }
                className="h-9"
              >
                {TINH_TRANG_TAI_SAN.map((x) => (
                  <option key={x} value={x}>
                    {t(`tinhTrang.${x}`)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label
              htmlFor="ts-ghichu"
              className="text-[11px] text-muted-foreground"
            >
              {t("f.ghiChu")}
            </Label>
            <Textarea
              id="ts-ghichu"
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              maxLength={500}
              className="min-h-16 text-[13px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onDong} disabled={pending}>
            {t("huy")}
          </Button>
          <Button
            disabled={pending || ten.trim() === ""}
            onClick={() =>
              onLuu({
                id: ts?.id ?? null,
                ten: ten.trim(),
                ma: ma.trim() || null,
                loai: loai.trim() || null,
                viTri: viTri.trim() || null,
                ngayMua: ngayMua || null,
                giaMuaVnd: gia === "" ? null : Number(gia),
                baoHanhDen: baoHanh || null,
                ghiChu: ghiChu.trim() || null,
                tinhTrang,
              })
            }
          >
            {t("luu")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HopGiao({
  ts,
  nhanVien,
  pending,
  onDong,
  onGiao,
}: {
  ts: TaiSan;
  nhanVien: NhanVienChon[];
  pending: boolean;
  onDong: () => void;
  onGiao: (du: Parameters<typeof giaoTaiSan>[0]) => void;
}) {
  const t = useTranslations("taiSan");
  const [kieu, setKieu] = useState<"nguoi" | "boPhan">("nguoi");
  const [nguoi, setNguoi] = useState(nhanVien[0]?.id ?? "");
  const [boPhan, setBoPhan] = useState("");
  const [ghiChu, setGhiChu] = useState("");

  return (
    <Dialog open onOpenChange={(v) => !v && onDong()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("giaoTieuDe", { ten: ts.ten })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-1.5">
            {(["nguoi", "boPhan"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKieu(k)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-[12.5px] max-md:min-h-11",
                  kieu === k
                    ? "border-foreground bg-foreground text-background"
                    : "text-muted-foreground",
                )}
              >
                {t(k === "nguoi" ? "giaoChoNguoi" : "giaoChoBoPhan")}
              </button>
            ))}
          </div>
          {kieu === "nguoi" ? (
            <Select
              value={nguoi}
              onChange={(e) => setNguoi(e.target.value)}
              className="h-9"
            >
              {nhanVien.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.ten}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              value={boPhan}
              onChange={(e) => setBoPhan(e.target.value)}
              maxLength={120}
              placeholder={t("boPhanViDu")}
              className="h-9"
            />
          )}
          <Textarea
            value={ghiChu}
            onChange={(e) => setGhiChu(e.target.value)}
            maxLength={500}
            placeholder={t("ghiChuGiao")}
            className="min-h-16 text-[13px]"
          />
          {/* Nói TRƯỚC rằng còn một bước nữa — không để người giao tưởng xong. */}
          <p className="rounded-md bg-muted/50 p-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
            {t("nhacXacNhan")}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onDong} disabled={pending}>
            {t("huy")}
          </Button>
          <Button
            disabled={
              pending ||
              (kieu === "nguoi" ? nguoi === "" : boPhan.trim() === "")
            }
            onClick={() =>
              onGiao({
                assetId: ts.id,
                employeeId: kieu === "nguoi" ? nguoi : null,
                boPhan: kieu === "boPhan" ? boPhan.trim() : null,
                ghiChu: ghiChu.trim() || null,
              })
            }
          >
            {t("giao")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

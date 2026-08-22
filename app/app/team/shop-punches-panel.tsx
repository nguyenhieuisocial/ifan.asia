"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CameraOff, Clock, RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KhoiTrong } from "@/components/ui/khoi-trong";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import { PUNCH_LIST_LIMIT, type Punch } from "./queries";

/**
 * BẢNG CHẤM CÔNG CẢ TIỆM — thẻ design `cham-cong-co-anh.html`.
 *
 * Màn `/app/team` vốn đã ĐỌC VỀ lượt chấm của cả tiệm (RLS cho owner/admin/
 * manager thấy hết) rồi lọc bỏ, chỉ giữ lượt của chính người xem. Bảng này
 * không mở thêm quyền đọc nào — nó chỉ thôi vứt phần dữ liệu đã có đi.
 *
 * ⚠️ Người gọi phải tự chặn theo vai: mảng `punches` mang theo LINK ẢNH ĐÃ KÝ
 *   của mọi người trong tiệm, nên chỉ được truyền xuống khi người xem đúng là
 *   quản lý trở lên (xem `page.tsx`).
 */
export function ShopPunchesPanel({
  punches,
  names,
  faceMatchMin,
  requireSelfie,
}: {
  punches: Punch[];
  /** Tên tra theo id hồ sơ. Quản lý không đọc được hồ sơ đầy đủ nên có người sẽ khuyết. */
  names: Map<string, string>;
  faceMatchMin: number;
  /** Công tắc "Bắt chụp ảnh khi chấm công" HIỆN TẠI của tiệm — để giải thích vì sao cả cột ảnh trống. */
  requireSelfie: boolean;
}) {
  const t = useTranslations("hr");
  const locale = useLocale() as Locale;
  const router = useRouter();
  /**
   * Ảnh nào tải hỏng. Link ký chỉ sống 1 giờ, nên một màn mở lâu rồi mới bấm
   * là ảnh chết — phải bắt `onError` thay vì để trình duyệt vẽ biểu tượng ảnh vỡ.
   */
  const [broken, setBroken] = useState<Record<string, true>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  function thuLai(id: string) {
    // Xoá dấu hỏng TRƯỚC khi tải lại: `router.refresh()` chạy lại phần máy chủ
    // (ký lại link) nhưng state của khối này thì còn nguyên, không xoá thì ô ảnh
    // vẫn đỏ dù link mới đã về.
    setBroken((b) => {
      const con = { ...b };
      delete con[id];
      return con;
    });
    router.refresh();
  }

  /**
   * Ba trạng thái ô ảnh — cố ý KHÔNG gộp "không có ảnh" với "ảnh hỏng":
   * một bên là tiệm chưa bật chụp ảnh (không ai làm gì sai), bên kia là sổ ghi
   * có ảnh mà kho không trả được (bất thường, cần người xem lại).
   */
  function trangThaiAnh(p: Punch): "co" | "khong" | "vo" {
    if (!p.hasSelfie) return "khong";
    if (!p.selfieUrl || broken[p.id]) return "vo";
    return "co";
  }

  function tenNguoi(employeeId: string): string {
    return names.get(employeeId) ?? t("timesheets.hiddenName", { id: employeeId.slice(0, 8) });
  }

  const dangMo = punches.find((p) => p.id === openId) ?? null;

  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">{t("shopPunches.title")}</h3>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{t("shopPunches.subtitle")}</p>
      </div>

      {/* Cột ảnh trống hàng loạt là chuyện BÌNH THƯỜNG khi công tắc đang tắt —
          nói ra một lần ở đây, thay vì để quản lý đoán từng dòng. */}
      {!requireSelfie && (
        <p className="flex items-start gap-2 rounded-md bg-muted/60 p-2.5 text-[12px] text-muted-foreground">
          <CameraOff className="mt-0.5 size-3.5 shrink-0" />
          {t("shopPunches.selfieOffNote")}
        </p>
      )}

      {punches.length === 0 ? (
        <div className="rounded-lg border border-dashed">
          <KhoiTrong
            bieuTuong={<Clock />}
            tieuDe={t("shopPunches.emptyTitle")}
            moTa={t("shopPunches.emptyBody")}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          {/* Hàng tiêu đề chỉ có ở khổ máy tính; điện thoại xếp dọc nên tiêu đề
              cột thành thừa. Bề rộng cột phải trùng với hàng dữ liệu bên dưới. */}
          <div className="hidden items-center gap-3 border-b bg-muted/50 px-2.5 py-2 text-xs font-medium text-muted-foreground md:flex">
            <span className="w-10 shrink-0">{t("shopPunches.colPhoto")}</span>
            <span className="w-40 shrink-0">{t("shopPunches.colPerson")}</span>
            <span className="w-28 shrink-0">{t("shopPunches.colTime")}</span>
            <span className="w-20 shrink-0">{t("shopPunches.colKind")}</span>
            <span className="min-w-0 flex-1">{t("shopPunches.colLocation")}</span>
          </div>

          <ul className="divide-y">
            {punches.map((p) => {
              const tt = trangThaiAnh(p);
              const ten = tenNguoi(p.employeeId);
              const gio = `${formatTime(p.punchedAt, locale)} · ${formatDate(p.punchedAt, locale)}`;
              const loai = t(`punch.kinds.${p.kind}`);
              return (
                <li key={p.id} className="flex items-start gap-3 p-2.5 text-[13px]">
                  <OAnh
                    trangThai={tt}
                    url={p.selfieUrl}
                    ten={ten}
                    onMo={() => setOpenId(p.id)}
                    onHong={() => setBroken((b) => ({ ...b, [p.id]: true }))}
                  />
                  <div className="min-w-0 flex-1 md:flex md:items-start md:gap-3">
                    <div className="min-w-0 md:w-40 md:shrink-0">
                      <p className="truncate font-medium">{ten}</p>
                      {p.isProxy && (
                        <p className="text-[11px] text-muted-foreground">{t("punch.proxyTag")}</p>
                      )}
                      {tt === "vo" && (
                        <button
                          type="button"
                          onClick={() => thuLai(p.id)}
                          className="mt-1 inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/20"
                        >
                          <RotateCw className="size-3" />
                          {t("shopPunches.photoBroken")} · {t("shopPunches.photoRetry")}
                        </button>
                      )}
                    </div>
                    {/* Điện thoại gộp giờ + loại vào một dòng (thẻ, mục 3); máy
                        tính tách hai cột để mắt quét thẳng xuống. */}
                    <p className="text-muted-foreground md:hidden">
                      {loai} · {gio}
                    </p>
                    <p className="hidden tabular-nums md:block md:w-28 md:shrink-0">{gio}</p>
                    <p
                      className={cn(
                        "hidden md:block md:w-20 md:shrink-0",
                        p.kind === "in" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
                      )}
                    >
                      {loai}
                    </p>
                    <div className="min-w-0 md:flex-1">
                      <ViTri punch={p} faceMatchMin={faceMatchMin} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* `layLanCham` cắt ở PUNCH_LIST_LIMIT dòng cho cả lượt đọc, mà lượt đọc
          này là của CẢ TIỆM — chạm trần sớm hơn hẳn danh sách một người ở trên.
          Chạm trần thì phải nói ra, không lặng lẽ cắt bớt lượt chấm. */}
      {punches.length >= PUNCH_LIST_LIMIT && (
        <p className="text-xs text-muted-foreground">{t("punch.limitNote", { n: PUNCH_LIST_LIMIT })}</p>
      )}

      {dangMo && (
        <KhungXemAnh
          punch={dangMo}
          ten={tenNguoi(dangMo.employeeId)}
          hong={trangThaiAnh(dangMo) !== "co"}
          onHong={() => setBroken((b) => ({ ...b, [dangMo.id]: true }))}
          onThuLai={() => thuLai(dangMo.id)}
          onDong={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

/**
 * Ô ảnh vuông 40px, cột đầu mỗi dòng. LUÔN vẽ, kể cả khi tiệm chưa bật chụp
 * ảnh: cột lúc có lúc không làm bảng đổi hình giữa hai tiệm và người đọc mất mốc.
 */
function OAnh({
  trangThai,
  url,
  ten,
  onMo,
  onHong,
}: {
  trangThai: "co" | "khong" | "vo";
  url: string | null;
  ten: string;
  onMo: () => void;
  onHong: () => void;
}) {
  const t = useTranslations("hr");

  if (trangThai === "khong") {
    // XÁM, KHÔNG ĐỎ: tiệm chưa bật chụp ảnh là trạng thái bình thường — tô đỏ
    // là bêu tên một người không làm gì sai.
    return (
      <span
        role="img"
        aria-label={t("shopPunches.photoNone")}
        title={t("shopPunches.photoNone")}
        className="flex size-10 shrink-0 items-center justify-center rounded-md border border-dashed bg-muted/40 text-muted-foreground"
      >
        <CameraOff className="size-4" />
      </span>
    );
  }

  if (trangThai === "vo") {
    return (
      <span
        role="img"
        aria-label={t("shopPunches.photoBroken")}
        title={t("shopPunches.photoBroken")}
        className="flex size-10 shrink-0 items-center justify-center rounded-md border border-destructive/30 bg-destructive/10 text-destructive"
      >
        <TriangleAlert className="size-4" />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onMo}
      className="size-10 shrink-0 overflow-hidden rounded-md border hover:opacity-80"
    >
      {/* Link ký tạm, không đi qua trình tối ưu ảnh của Next — thẻ img thường
          tránh phải khai miền cho một đường dẫn sống đúng 1 giờ. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url ?? ""}
        alt={t("shopPunches.photoOf", { name: ten })}
        loading="lazy"
        onError={onHong}
        className="size-full object-cover"
      />
    </button>
  );
}

/** Cột "Vị trí": khoảng cách, cờ ngoài vùng, và điểm khớp mặt của lần chấm giúp. */
function ViTri({ punch, faceMatchMin }: { punch: Punch; faceMatchMin: number }) {
  const t = useTranslations("hr");
  const pct = punch.faceMatchScore != null ? Math.round(punch.faceMatchScore * 100) : null;

  return (
    <>
      <p className={punch.outOfRange ? "font-medium text-destructive" : "text-muted-foreground"}>
        {punch.outOfRange
          ? punch.distanceM != null
            ? t("shopPunches.distanceFlagged", { m: punch.distanceM })
            : t("shopPunches.noDistanceFlagged")
          : punch.distanceM != null
            ? t("shopPunches.distance", { m: punch.distanceM })
            : t("shopPunches.noDistance")}
      </p>
      {punch.isProxy &&
        (pct == null ? (
          <p className="text-amber-700 dark:text-amber-400">{t("punch.faceMatchNone")}</p>
        ) : pct < faceMatchMin ? (
          <p className="font-medium text-destructive">
            {t("punch.faceMatchLow", { pct, min: faceMatchMin })}
          </p>
        ) : (
          <p className="text-muted-foreground">{t("punch.faceMatchRow", { pct })}</p>
        ))}
    </>
  );
}

/**
 * Khung xem lớn — NẰM TRONG ỨNG DỤNG, không mở tab mới với ảnh trần.
 *
 * Bốn thứ bắt buộc đi cùng tấm ảnh: tên người · giờ · loại chấm · cảnh báo
 * ngoài vùng. Thiếu chúng thì tấm ảnh không chứng minh được gì, nó chỉ là một
 * khuôn mặt.
 */
function KhungXemAnh({
  punch,
  ten,
  hong,
  onHong,
  onThuLai,
  onDong,
}: {
  punch: Punch;
  ten: string;
  hong: boolean;
  onHong: () => void;
  onThuLai: () => void;
  onDong: () => void;
}) {
  const t = useTranslations("hr");
  const locale = useLocale() as Locale;

  return (
    <Dialog open onOpenChange={(mo) => !mo && onDong()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{ten}</DialogTitle>
          <DialogDescription>
            {t(`punch.kinds.${punch.kind}`)} · {formatDateTime(punch.punchedAt, locale)}
          </DialogDescription>
        </DialogHeader>

        {/* Một lớp nền trầm quanh ảnh: ảnh chụp đêm thả thẳng lên nền tối thì
            mắt không tách được mép ảnh khỏi nền màn. */}
        <div className="rounded-lg bg-muted p-2.5">
          {hong || !punch.selfieUrl ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <TriangleAlert className="size-7 text-destructive" />
              <p className="text-[13px] text-destructive">{t("shopPunches.photoBroken")}</p>
              <Button type="button" size="sm" variant="outline" onClick={onThuLai}>
                <RotateCw className="mr-1 size-3.5" />
                {t("shopPunches.photoRetry")}
              </Button>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={punch.selfieUrl}
              alt={t("shopPunches.photoOf", { name: ten })}
              loading="lazy"
              onError={onHong}
              className="max-h-[55svh] w-full rounded-md object-contain"
            />
          )}
        </div>

        {punch.outOfRange && (
          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2.5 text-[13px] text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              {punch.distanceM != null
                ? t("shopPunches.distanceFlagged", { m: punch.distanceM })
                : t("shopPunches.noDistanceFlagged")}
              {punch.reason ? ` — ${t("shopPunches.reason", { reason: punch.reason })}` : ""}
            </span>
          </div>
        )}

        <DialogFooter showCloseButton>
          {/* Giữ lối mở ảnh ở tab mới: có lúc cần phóng to hết cỡ, và trình
              duyệt làm việc đó tốt hơn bất cứ thứ gì ta tự dựng. KHÔNG gọi là
              "ảnh gốc" — ảnh đã được thu về cạnh dài 720px trước khi lưu
              (`selfie-capture.tsx`), nên đây không phải ảnh máy ảnh nguyên cỡ. */}
          {!hong && punch.selfieUrl && (
            <Button type="button" variant="outline" asChild>
              <a href={punch.selfieUrl} target="_blank" rel="noreferrer">
                {t("shopPunches.openInNewTab")}
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

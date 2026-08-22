"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ghiHenTra } from "./actions";

/**
 * GHI MỘT LẦN KHÁCH HẸN TRẢ NỢ (thẻ `man-hen-tra-no`).
 *
 * ⚠️ HAI Ô, KHÔNG HƠN: ngày hẹn và một câu ghi chú. Người đang cầm điện thoại
 *   nói chuyện với khách không gõ được form dài — mọi ô thêm vào là một ô bị bỏ
 *   trống, rồi thành một cột luôn rỗng trong bảng.
 *
 * ⚠️ NGÀY MẶC ĐỊNH LÀ NGÀY DO MÁY CHỦ ĐƯA XUỐNG, không phải `new Date()` ở đây.
 *   Đồng hồ máy người dùng có thể lệch, và đọc đồng hồ lúc dựng giao diện thì
 *   vấp luật `react-hooks/purity` — đã vấp một lần trong kho này rồi.
 */
export interface HenTra {
  ngay_hen: string;
  ghi_chu: string | null;
  tre_ngay: number;
  lan_that_hen: number;
}

export function OHenTra({
  contactId,
  ten,
  hen,
  homNay,
}: {
  contactId: string;
  ten: string;
  hen: HenTra | null;
  /** `YYYY-MM-DD` theo giờ Việt Nam, do máy chủ đưa xuống. */
  homNay: string;
}) {
  const t = useTranslations("congNo.henTra");
  const [mo, datMo] = useState(false);
  const [ngay, datNgay] = useState(homNay);
  const [ghiChu, datGhiChu] = useState("");
  const [pending, startTransition] = useTransition();

  const luu = () => {
    if (pending) return;
    startTransition(async () => {
      const res = await ghiHenTra({ contactId, ngayHen: ngay, ghiChu });
      if (res.error) {
        toast.error(t(res.error === "forbidden" ? "khongDuQuyen" : "chuaLuuDuoc"));
        return;
      }
      toast.success(t("daLuu", { ten }));
      datMo(false);
      datGhiChu("");
    });
  };

  if (!mo) {
    return (
      <button
        type="button"
        onClick={() => datMo(true)}
        // ⚠️ NHÃN CHO TRÌNH ĐỌC MÀN HÌNH PHẢI NÓI NÚT NÀY LÀM GÌ. Chữ hiện ra
        //   là "Chưa hẹn" — đó là TRẠNG THÁI, không phải hành động; nghe lên
        //   không ai biết bấm vào sẽ ra chuyện gì. Nó còn trùng chữ với chip
        //   lọc "Chưa hẹn" ở đầu danh sách, nên kể cả người nhìn bằng mắt cũng
        //   có hai thứ cùng tên trên một màn.
        aria-label={t("moGhiHen", { ten })}
        className={cn(
          "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold max-md:min-h-9",
          // Ba trạng thái, và MÀU KHÔNG PHẢI cách duy nhất phân biệt: mỗi trạng
          // thái có chữ riêng, đọc lên là hiểu (WCAG 1.4.1).
          hen === null
            ? "bg-muted text-muted-foreground"
            : hen.tre_ngay > 0
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary",
        )}
      >
        <CalendarClock className="size-3.5" aria-hidden />
        {hen === null
          ? t("chuaHen")
          : hen.tre_ngay > 0
            ? t("quaHen", { n: hen.tre_ngay })
            : t("hen", { ngay: ngayGon(hen.ngay_hen) })}
        {hen !== null && hen.lan_that_hen > 0 && (
          <span className="font-normal opacity-80">
            · {t("thatHen", { n: hen.lan_that_hen })}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border p-2.5">
      {hen !== null && hen.lan_that_hen > 0 && (
        <p className="text-[11px] font-semibold text-destructive">
          {t("daThatHen", { n: hen.lan_that_hen })}
        </p>
      )}
      <div className="space-y-1">
        <Label htmlFor={`hen-${contactId}`} className="text-[11px]">
          {t("ngayHen")}
        </Label>
        <Input
          id={`hen-${contactId}`}
          type="date"
          value={ngay}
          min={homNay}
          onChange={(e) => datNgay(e.target.value)}
          className="h-9 max-md:h-11"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`ghi-${contactId}`} className="text-[11px]">
          {t("ghiChu")}
        </Label>
        <Input
          id={`ghi-${contactId}`}
          value={ghiChu}
          onChange={(e) => datGhiChu(e.target.value)}
          maxLength={300}
          placeholder={t("ghiChuGoiY")}
          className="h-9 max-md:h-11"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => datMo(false)} disabled={pending}>
          {t("thoi")}
        </Button>
        <Button type="button" size="sm" onClick={luu} disabled={pending}>
          {pending ? t("dangLuu") : t("luuHen")}
        </Button>
      </div>
    </div>
  );
}

/** `2026-08-25` → `25/08`. Cắt chuỗi, KHÔNG qua `Date` — qua `Date` là lệch múi giờ. */
function ngayGon(iso: string): string {
  const [, thang, ngay] = iso.slice(0, 10).split("-");
  return `${ngay}/${thang}`;
}

"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDaysToDateKey, weekdayOfDateKey } from "@/lib/booking/schedule";

const THU_VN = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** Ô đầu tiên của lưới tháng chứa `dateKey` — luôn là một Thứ Hai. */
function oDauLuoi(thang: string): string {
  const mungMot = `${thang}-01`;
  // weekdayOfDateKey: 0=CN..6=T7 → lùi về Thứ Hai
  const w = weekdayOfDateKey(mungMot);
  const lui = w === 0 ? 6 : w - 1;
  return addDaysToDateKey(mungMot, -lui);
}

function thangKe(thang: string, buoc: number): string {
  const [y, m] = thang.split("-").map(Number);
  const tong = y * 12 + (m - 1) + buoc;
  return `${Math.floor(tong / 12)}-${String((tong % 12) + 1).padStart(2, "0")}`;
}

/**
 * LỊCH NHỎ để nhảy ngày.
 *
 * Trước đây đổi ngày chỉ có hai mũi tên đi từng ngày một — muốn xem thứ Tư tuần
 * sau là bấm mười lần. Đây là thứ Google Lịch đặt ở góc trên bên trái và người
 * ta dùng suốt.
 *
 * ⚠️ Tháng đang lật ở lịch nhỏ TÁCH khỏi ngày đang xem: lật tới tháng 10 để ngó
 *   rồi bỏ đi thì màn chính không được nhảy theo. Chỉ khi BẤM một ngày mới đổi.
 */
export function MiniCalendar({
  ngayDangXem,
  todayKey,
  onChonNgay,
}: {
  ngayDangXem: string;
  todayKey: string;
  onChonNgay: (dateKey: string) => void;
}) {
  const t = useTranslations("calendar");
  const [thang, datThang] = useState(ngayDangXem.slice(0, 7));

  const o = useMemo(() => {
    const dau = oDauLuoi(thang);
    return Array.from({ length: 42 }, (_, i) => addDaysToDateKey(dau, i));
  }, [thang]);

  const [nam, so] = thang.split("-");

  return (
    <div className="select-none">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[12px] font-semibold">
          {nam === todayKey.slice(0, 4)
            ? t("mini.titleShort", { month: Number(so) })
            : t("mini.title", { month: Number(so), year: nam })}
        </p>
        <div className="flex">
          <button
            type="button"
            onClick={() => datThang(thangKe(thang, -1))}
            aria-label={t("mini.prev")}
            className="flex size-7 items-center justify-center rounded hover:bg-muted"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => datThang(thangKe(thang, 1))}
            aria-label={t("mini.next")}
            className="flex size-7 items-center justify-center rounded hover:bg-muted"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px">
        {THU_VN.map((x) => (
          <div key={x} className="pb-0.5 text-center text-[9px] text-muted-foreground">
            {x}
          </div>
        ))}
        {o.map((k) => {
          const ngoai = !k.startsWith(thang);
          return (
            <button
              key={k}
              type="button"
              onClick={() => onChonNgay(k)}
              className={cn(
                "flex aspect-square items-center justify-center rounded-full text-[11px] leading-none hover:bg-muted",
                ngoai && "text-muted-foreground/50",
                k === todayKey && "font-semibold text-primary",
                k === ngayDangXem && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
              )}
            >
              {Number(k.slice(8, 10))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

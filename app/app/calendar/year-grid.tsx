"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { addDaysToDateKey, weekdayOfDateKey } from "@/lib/booking/schedule";
import { nhanAmNgan } from "@/lib/am-lich";

const THU_VN = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/**
 * CHẾ ĐỘ NĂM — mười hai tháng thu nhỏ, ngày nào đông thì đậm.
 *
 * Trả lời đúng một câu, nhưng là câu chủ tiệm hỏi mỗi khi lên kế hoạch: "tháng
 * nào đông, tháng nào vắng". Nhìn cả năm trong một màn thì mùa cao điểm hiện ra
 * thành từng mảng đậm, và những tuần trống hiện ra thành mảng nhạt.
 *
 * ⚠️ KHÔNG in tên khách hay giờ. Một ô ngày ở đây rộng chừng 18px — nhét chữ
 *   vào là không đọc được gì mà lại làm mất chính thứ chế độ này làm tốt: nhìn
 *   MẢNG chứ không nhìn dòng. Bấm vào ngày để xem chi tiết.
 *
 * ⚠️ Độ đậm tính theo NGÀY ĐÔNG NHẤT của chính năm đó, không theo một con số
 *   cố định. Tiệm nhỏ 3 ca/ngày và tiệm lớn 40 ca/ngày đều phải thấy được sự
 *   khác nhau giữa ngày đông và ngày vắng CỦA MÌNH.
 */
export function YearGrid({
  nam,
  demTheoNgay,
  todayKey,
  amLich,
  onChonNgay,
}: {
  nam: number;
  demTheoNgay: Map<string, number>;
  todayKey: string;
  amLich: boolean;
  onChonNgay: (dateKey: string) => void;
}) {
  const t = useTranslations("calendar");

  const dinh = useMemo(() => {
    let m = 0;
    for (const v of demTheoNgay.values()) m = Math.max(m, v);
    return m;
  }, [demTheoNgay]);

  const cacThang = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const thang = `${nam}-${String(i + 1).padStart(2, "0")}`;
        const mungMot = `${thang}-01`;
        const w = weekdayOfDateKey(mungMot);
        const dau = addDaysToDateKey(mungMot, -(w === 0 ? 6 : w - 1));
        return {
          thang,
          so: i + 1,
          o: Array.from({ length: 42 }, (_, j) => addDaysToDateKey(dau, j)),
        };
      }),
    [nam],
  );

  /** Bốn nấc đậm. Nhiều nấc hơn thì mắt không phân biệt được nữa. */
  function nacDam(soCa: number): string {
    if (soCa === 0) return "";
    if (dinh === 0) return "";
    const p = soCa / dinh;
    if (p > 0.66) return "bg-primary/70 text-primary-foreground font-semibold";
    if (p > 0.33) return "bg-primary/40";
    return "bg-primary/15";
  }

  const tongNam = useMemo(() => {
    let s = 0;
    for (const v of demTheoNgay.values()) s += v;
    return s;
  }, [demTheoNgay]);

  return (
    <div className="flex-1 overflow-auto p-3">
      <p className="mb-2 text-[12px] text-muted-foreground">
        {t("year.total", { count: tongNam, year: nam })}
        {dinh > 0 ? ` · ${t("year.peak", { count: dinh })}` : ""}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cacThang.map((th) => (
          <div key={th.thang} className="rounded-md border p-2">
            <p className="mb-1 text-[12px] font-semibold">{t("year.month", { month: th.so })}</p>
            <div className="grid grid-cols-7 gap-px">
              {THU_VN.map((x) => (
                <div key={x} className="pb-0.5 text-center text-[8px] text-muted-foreground">
                  {x}
                </div>
              ))}
              {th.o.map((k) => {
                const ngoai = !k.startsWith(th.thang);
                const soCa = demTheoNgay.get(k) ?? 0;
                if (ngoai) return <div key={k} />;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onChonNgay(k)}
                    title={`${Number(k.slice(8, 10))}/${Number(k.slice(5, 7))}${
                      amLich ? ` · âm ${nhanAmNgan(k)}` : ""
                    } — ${t("year.dayCount", { count: soCa })}`}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-[3px] text-[10px] leading-none hover:ring-2 hover:ring-ring",
                      nacDam(soCa),
                      k === todayKey && "ring-2 ring-primary",
                    )}
                  >
                    {Number(k.slice(8, 10))}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {t("year.legend")}
        {[
          ["", t("year.legendNone")],
          ["bg-primary/15", t("year.legendLow")],
          ["bg-primary/40", t("year.legendMid")],
          ["bg-primary/70", t("year.legendHigh")],
        ].map(([lop, nhan]) => (
          <span key={nhan} className="flex items-center gap-1">
            <span className={cn("size-3 rounded-[3px] border", lop)} />
            {nhan}
          </span>
        ))}
      </p>
    </div>
  );
}

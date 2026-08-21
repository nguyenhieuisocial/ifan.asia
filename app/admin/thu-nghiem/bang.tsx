"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { datThuNghiem } from "./actions";

/**
 * MÀN THỬ NGHIỆM A/B (#336, thẻ `man-quan-tri-thu-nghiem-ab`).
 *
 * ⚠️ MÀN NÀY PHẢI BIẾT NÓI KHÔNG. Công cụ A/B phổ biến hay tô xanh bên đang dẫn
 *   ngay từ ngày đầu; ở lưu lượng nhỏ của iFan thì chênh lệch ngày đầu gần như
 *   luôn là may rủi. Dấu ✓ và ô xanh CHỈ hiện khi cơ sở dữ liệu trả
 *   `ket_luan_duoc = true` — màn KHÔNG tự suy ra từ hai con số.
 *
 * ⚠️ Chưa đủ số thì phải nói CÒN THIẾU BAO NHIÊU. "Chưa đủ" mà không nói thiếu
 *   bao nhiêu thì người ta chờ mòn mỏi hoặc bỏ dở giữa chừng.
 */

const TRANG = ["/", "/bang-gia", "/tinh-nang", "/lo-trinh"] as const;

export interface KetQua {
  khoa: string;
  trang: string;
  cau_a: string;
  cau_b: string;
  dang_chay: boolean;
  so_ngay: number;
  xem_a: number;
  bam_a: number;
  ti_a: number;
  xem_b: number;
  bam_b: number;
  ti_b: number;
  du_ngay: boolean;
  du_luot: boolean;
  con_thieu: number;
  ket_luan_duoc: boolean;
  ben_hon: "a" | "b";
}

function HopTao({ dong }: { dong: () => void }) {
  const t = useTranslations("admin.abtest");
  const [pending, startTransition] = useTransition();
  const [khoa, datKhoa] = useState("");
  const [trang, datTrang] = useState<(typeof TRANG)[number]>("/");
  const [cauA, datCauA] = useState("");
  const [cauB, datCauB] = useState("");

  const luu = () =>
    startTransition(async () => {
      const r = await datThuNghiem({ khoa, trang, cauA, cauB, dangChay: true });
      if (r.error) {
        toast.error(t(`errors.${r.error}`));
        return;
      }
      toast.success(t("started"));
      dong();
    });

  return (
    <div className="mb-3 rounded-lg border bg-card p-3">
      <label className="mb-2 block">
        <span className="text-[11.5px] font-medium">{t("field.key")}</span>
        <input
          value={khoa}
          onChange={(e) => datKhoa(e.target.value)}
          placeholder="vi-du: nut-trang-chu-thang-8"
          className="mt-0.5 h-9 w-full rounded-md border px-2 font-mono text-[13px]"
        />
      </label>
      <p className="mb-1 text-[11.5px] font-medium">{t("field.page")}</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {TRANG.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => datTrang(x)}
            className={cn(
              "min-h-7 rounded-full border px-2.5 font-mono text-[11.5px]",
              x === trang
                ? "border-primary bg-primary font-semibold text-primary-foreground"
                : "hover:bg-muted",
            )}
          >
            {x}
          </button>
        ))}
      </div>
      <label className="mb-2 block">
        <span className="text-[11.5px] font-medium">{t("field.a")}</span>
        <input
          value={cauA}
          onChange={(e) => datCauA(e.target.value)}
          className="mt-0.5 h-9 w-full rounded-md border px-2 text-[13px]"
        />
      </label>
      <label className="mb-2 block">
        <span className="text-[11.5px] font-medium">{t("field.b")}</span>
        <input
          value={cauB}
          onChange={(e) => datCauB(e.target.value)}
          className="mt-0.5 h-9 w-full rounded-md border px-2 text-[13px]"
        />
      </label>
      <p className="mb-3 text-[11px] text-muted-foreground">{t("field.hint")}</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={luu}
          className="min-h-9 rounded-md bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          {t("start")}
        </button>
        <button type="button" onClick={dong} className="min-h-9 rounded-md border px-3 text-[13px]">
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}

function Cot({
  nhan,
  cau,
  ti,
  bam,
  xem,
  thang,
}: {
  nhan: string;
  cau: string;
  ti: number;
  bam: number;
  xem: number;
  thang: boolean;
}) {
  const t = useTranslations("admin.abtest");
  return (
    <div className="flex-1 p-3">
      <p className="flex items-center gap-1 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
        {nhan}
        {thang && <Check className="size-3.5 text-green-700" />}
      </p>
      <p className="mt-1 mb-2 text-[12px] leading-snug font-semibold">{cau}</p>
      <p className="text-xl font-bold tabular-nums">{ti}%</p>
      <p className="text-[10.5px] text-muted-foreground">
        {t("counts", { bam, xem })}
      </p>
    </div>
  );
}

export function BangThuNghiem({ ds }: { ds: KetQua[] }) {
  const t = useTranslations("admin.abtest");
  const [tao, datTao] = useState(false);
  const [pending, startTransition] = useTransition();

  const ngung = (k: KetQua) =>
    startTransition(async () => {
      const r = await datThuNghiem({
        khoa: k.khoa,
        trang: k.trang as (typeof TRANG)[number],
        cauA: k.cau_a,
        cauB: k.cau_b,
        dangChay: false,
      });
      if (r.error) toast.error(t(`errors.${r.error}`));
      else toast.success(t("stopped"));
    });

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => datTao((v) => !v)}
          className="inline-flex min-h-9 items-center gap-1 rounded-md bg-primary px-3 text-[13px] font-semibold text-primary-foreground"
        >
          <Plus className="size-4" />
          {t("add")}
        </button>
      </div>

      {tao && <HopTao dong={() => datTao(false)} />}

      {ds.length === 0 && !tao ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {ds.map((k) => (
            <li key={k.khoa} className="overflow-hidden rounded-lg border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                <span className="text-[12px] font-semibold">
                  <span className="font-mono">{k.trang}</span>
                  {" · "}
                  {k.dang_chay ? t("running", { n: k.so_ngay }) : t("ended")}
                </span>
                {k.dang_chay && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => ngung(k)}
                    className="min-h-8 rounded-md border px-2.5 text-[12px] hover:bg-muted disabled:opacity-50"
                  >
                    {t("stop")}
                  </button>
                )}
              </div>

              <div className="flex flex-col divide-y sm:flex-row sm:divide-x sm:divide-y-0">
                <Cot
                  nhan={t("colA")}
                  cau={k.cau_a}
                  ti={k.ti_a}
                  bam={k.bam_a}
                  xem={k.xem_a}
                  thang={k.ket_luan_duoc && k.ben_hon === "a"}
                />
                <Cot
                  nhan={t("colB")}
                  cau={k.cau_b}
                  ti={k.ti_b}
                  bam={k.bam_b}
                  xem={k.xem_b}
                  thang={k.ket_luan_duoc && k.ben_hon === "b"}
                />
              </div>

              {/* ⚠️ Ô kết luận đọc THẲNG `ket_luan_duoc` từ cơ sở dữ liệu.
                  KHÔNG được tự suy "bên nào số cao hơn thì thắng" ở đây — đó
                  đúng là cái bẫy mà cả mảng này sinh ra để tránh. */}
              <div
                className={cn(
                  "m-3 rounded-md border p-2.5 text-[11.5px] leading-relaxed",
                  k.ket_luan_duoc
                    ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
                    : "bg-muted/40 text-muted-foreground",
                )}
              >
                {k.ket_luan_duoc
                  ? t("verdictDone", {
                      ben: k.ben_hon === "b" ? t("colB") : t("colA"),
                    })
                  : !k.du_ngay
                    ? t("verdictNeedDays", { n: Math.max(0, 14 - k.so_ngay) })
                    : !k.du_luot
                      ? t("verdictNeedViews", { n: Math.ceil(k.con_thieu) })
                      : t("verdictTooClose")}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

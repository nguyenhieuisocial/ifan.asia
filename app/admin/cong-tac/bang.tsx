"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { datCongTac, tatCongTacNgay } from "./actions";

/**
 * BẢNG CÔNG TẮC — thẻ design `man-quan-tri-cong-tac-tinh-nang.html`.
 *
 * ⚠️ MÀU CÔNG TẮC LÀ THỨ ĐỌC ĐƯỢC TỪ XA: xanh = mọi tiệm · vàng = mở một phần
 *   · xám = tắt. Đừng đổi sang cùng một màu cho mọi trạng thái "đang bật":
 *   "bật cho 3 tiệm" và "bật cho tất cả" là hai chuyện rất khác nhau lúc đang
 *   dò một sự cố.
 */

export interface Tiem {
  id: string;
  ten: string;
}

export interface CongTac {
  khoa: string;
  ten: string;
  mo_ta: string | null;
  pham_vi: "tat" | "moi_tiem" | "vai_tiem" | "theo_vai";
  vai: string[];
  tiem: Tiem[];
  updated_at: string;
}

const VAI = ["owner", "admin", "manager", "staff", "viewer"] as const;
type Vai = (typeof VAI)[number];

function MauCongTac({ phamVi }: { phamVi: CongTac["pham_vi"] }) {
  const bat = phamVi !== "tat";
  const motPhan = phamVi === "vai_tiem" || phamVi === "theo_vai";
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors",
        !bat && "bg-muted-foreground/25",
        phamVi === "moi_tiem" && "bg-green-600",
        motPhan && "bg-amber-500",
      )}
    >
      <i
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-white shadow transition-all",
          !bat && "left-0.5",
          motPhan && "left-2.5",
          phamVi === "moi_tiem" && "left-[18px]",
        )}
      />
    </span>
  );
}

function HopSua({
  ban,
  tiemTatCa,
  dong,
}: {
  ban: CongTac | null;
  tiemTatCa: Tiem[];
  dong: () => void;
}) {
  const t = useTranslations("admin.flags");
  const [pending, startTransition] = useTransition();
  const moi = ban === null;
  const [khoa, datKhoa] = useState(ban?.khoa ?? "");
  const [ten, datTen] = useState(ban?.ten ?? "");
  const [moTa, datMoTa] = useState(ban?.mo_ta ?? "");
  const [phamVi, datPhamVi] = useState<CongTac["pham_vi"]>(ban?.pham_vi ?? "moi_tiem");
  const [tiemIds, datTiemIds] = useState<string[]>(ban?.tiem.map((x) => x.id) ?? []);
  const [vai, datVai] = useState<Vai[]>((ban?.vai ?? []).filter((v): v is Vai => (VAI as readonly string[]).includes(v)));

  const doi = <T,>(ds: T[], x: T): T[] => (ds.includes(x) ? ds.filter((y) => y !== x) : [...ds, x]);

  const luu = () =>
    startTransition(async () => {
      const r = await datCongTac({ khoa, ten, moTa, phamVi, tiemIds, vai });
      if (r.error) {
        toast.error(t(`errors.${r.error}`));
        return;
      }
      toast.success(t("saved"));
      dong();
    });

  return (
    <div className="mt-2 rounded-lg border bg-card p-3">
      {moi && (
        <label className="mb-2 block">
          <span className="text-[11.5px] font-medium">{t("field.key")}</span>
          <input
            value={khoa}
            onChange={(e) => datKhoa(e.target.value)}
            placeholder="vi-du: ai-tra-loi"
            className="mt-0.5 h-9 w-full rounded-md border px-2 font-mono text-[13px]"
          />
          <span className="text-[11px] text-muted-foreground">{t("field.keyHint")}</span>
        </label>
      )}
      <label className="mb-2 block">
        <span className="text-[11.5px] font-medium">{t("field.name")}</span>
        <input
          value={ten}
          onChange={(e) => datTen(e.target.value)}
          className="mt-0.5 h-9 w-full rounded-md border px-2 text-[13px]"
        />
      </label>
      <label className="mb-3 block">
        <span className="text-[11.5px] font-medium">{t("field.note")}</span>
        <input
          value={moTa}
          onChange={(e) => datMoTa(e.target.value)}
          className="mt-0.5 h-9 w-full rounded-md border px-2 text-[13px]"
        />
      </label>

      <p className="mb-1 text-[11.5px] font-medium">{t("field.scope")}</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["tat", "vai_tiem", "theo_vai", "moi_tiem"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => datPhamVi(p)}
            className={cn(
              "min-h-7 rounded-full border px-2.5 text-[11.5px]",
              p === phamVi
                ? "border-primary bg-primary font-semibold text-primary-foreground"
                : "hover:bg-muted",
            )}
          >
            {t(`scope.${p}`)}
          </button>
        ))}
      </div>

      {phamVi === "vai_tiem" && (
        <div className="mb-3">
          <p className="mb-1 text-[11.5px] font-medium">{t("field.shops")}</p>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {tiemTatCa.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => datTiemIds((d) => doi(d, x.id))}
                className={cn(
                  "min-h-7 rounded-full border px-2.5 text-[11.5px]",
                  tiemIds.includes(x.id)
                    ? "border-primary bg-primary font-semibold text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {x.ten}
              </button>
            ))}
          </div>
        </div>
      )}

      {phamVi === "theo_vai" && (
        <div className="mb-3">
          <p className="mb-1 text-[11.5px] font-medium">{t("field.roles")}</p>
          <div className="flex flex-wrap gap-1.5">
            {VAI.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => datVai((d) => doi(d, v))}
                className={cn(
                  "min-h-7 rounded-full border px-2.5 text-[11.5px]",
                  vai.includes(v)
                    ? "border-primary bg-primary font-semibold text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {t(`role.${v}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ⚠️ Ô CẢNH BÁO NÀY KHÔNG ĐƯỢC BỎ. Đây là hiểu lầm tốn kém nhất quanh
          công tắc, và chỗ duy nhất người ta chắc chắn đọc là ngay trước lúc bấm Lưu. */}
      <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[11.5px] leading-relaxed text-destructive">
        {t("notSecurity")}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={luu}
          className="min-h-9 rounded-md bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          {t("save")}
        </button>
        <button type="button" onClick={dong} className="min-h-9 rounded-md border px-3 text-[13px]">
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}

export function BangCongTac({ ds, tiemTatCa }: { ds: CongTac[]; tiemTatCa: Tiem[] }) {
  const t = useTranslations("admin.flags");
  const [dangSua, datDangSua] = useState<string | null>(null);
  const [themMoi, datThemMoi] = useState(false);
  const [pending, startTransition] = useTransition();

  const tatNgay = (khoa: string) =>
    startTransition(async () => {
      const r = await tatCongTacNgay(khoa);
      if (r.error) toast.error(t(`errors.${r.error}`));
      else toast.success(t("turnedOff"));
    });

  const noiMoChoAi = (c: CongTac): string => {
    switch (c.pham_vi) {
      case "tat":
        return t("scope.tat");
      case "moi_tiem":
        return t("scope.moi_tiem");
      case "theo_vai":
        return c.vai.map((v) => t(`role.${v}`)).join(", ");
      case "vai_tiem":
        return c.tiem.map((x) => x.ten).join(", ");
    }
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            datThemMoi((v) => !v);
            datDangSua(null);
          }}
          className="inline-flex min-h-9 items-center gap-1 rounded-md bg-primary px-3 text-[13px] font-semibold text-primary-foreground"
        >
          <Plus className="size-4" />
          {t("add")}
        </button>
      </div>

      {themMoi && <HopSua ban={null} tiemTatCa={tiemTatCa} dong={() => datThemMoi(false)} />}

      {ds.length === 0 && !themMoi ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="mt-3 divide-y rounded-lg border">
          {ds.map((c) => (
            <li key={c.khoa} className="p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">{c.ten}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{c.khoa}</p>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">{noiMoChoAi(c)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <MauCongTac phamVi={c.pham_vi} />
                  <button
                    type="button"
                    onClick={() => {
                      datDangSua((v) => (v === c.khoa ? null : c.khoa));
                      datThemMoi(false);
                    }}
                    className="min-h-9 rounded-md border px-2.5 text-[12px] hover:bg-muted"
                  >
                    {t("edit")}
                  </button>
                  {/* Một bấm, không hỏi lại — thao tác này lùi được, mà mỗi bấm
                      thêm lúc đang có sự cố là thêm thời gian khách gặp lỗi. */}
                  {c.pham_vi !== "tat" && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => tatNgay(c.khoa)}
                      className="min-h-9 rounded-md border border-destructive/40 px-2.5 text-[12px] font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"
                    >
                      {t("turnOffNow")}
                    </button>
                  )}
                </div>
              </div>
              {dangSua === c.khoa && (
                <HopSua ban={c} tiemTatCa={tiemTatCa} dong={() => datDangSua(null)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

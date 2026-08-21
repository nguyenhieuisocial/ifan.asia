import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * QUẢN TRỊ — KHÁCH VÀO RỒI RƠI Ở ĐÂU (thẻ `man-quan-tri-phieu-khach-vao`).
 *
 * Sáu bậc, từ lúc ghé một trang giới thiệu tới lúc lập xong tiệm.
 *
 * ⚠️ HAI BẬC CUỐI ĐỌC TỪ SỔ ĐÃ CÓ (tài khoản, tiệm) — không đếm gì thêm. Màn
 *   ghi rõ "có sẵn" ở hai bậc đó để người đọc biết chúng đáng tin hơn bốn bậc
 *   trên (bốn bậc trên phụ thuộc mã chạy được trong trình duyệt).
 *
 * ⚠️ CON SỐ ĐỎ LÀ SỐ NGƯỜI MẤT ĐI, không phải phần trăm. Phần trăm nhỏ nghe
 *   nhẹ; "872 người rời đi" thì không. Đây là màn để quyết định sửa gì trước,
 *   nên nó phải làm chỗ rơi lớn nhất đập vào mắt.
 *
 * ⚠️ Bậc ① là LƯỢT XEM, KHÔNG phải số người. iFan cố ý không nhận dạng người
 *   xem (xem migration #333), nên không đếm được người. Màn nói thẳng điều đó
 *   ở chân trang thay vì để người đọc tự hiểu nhầm thành số khách.
 */

interface TheoTrang {
  duong_dan: string;
  xem: number;
  bam: number;
}

interface Phieu {
  so_ngay: number;
  b1_ghe: number;
  b2_bang_gia: number;
  b3_bam_dang_ky: number;
  b4_mo_dang_ky: number;
  b5_tao_tai_khoan: number;
  b6_lap_tiem: number;
  theo_trang: TheoTrang[];
}

const KHOANG = [7, 30, 90] as const;

export default async function TrangKhachVao({
  searchParams,
}: {
  searchParams: Promise<{ ngay?: string }>;
}) {
  const { ngay } = await searchParams;
  const soNgay = KHOANG.includes(Number(ngay) as (typeof KHOANG)[number]) ? Number(ngay) : 7;

  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_phieu_khach_vao", { p_so_ngay: soNgay });
  const p = (data ?? {}) as Partial<Phieu>;

  const t = await getTranslations("admin.funnel");

  const bac = [
    { nhan: t("s1"), so: p.b1_ghe ?? 0, suy: false },
    { nhan: t("s2"), so: p.b2_bang_gia ?? 0, suy: false },
    { nhan: t("s3"), so: p.b3_bam_dang_ky ?? 0, suy: false },
    { nhan: t("s4"), so: p.b4_mo_dang_ky ?? 0, suy: false },
    { nhan: t("s5"), so: p.b5_tao_tai_khoan ?? 0, suy: true },
    { nhan: t("s6"), so: p.b6_lap_tiem ?? 0, suy: true },
  ];
  const dinh = bac[0].so;

  return (
    <div className="mx-auto w-full max-w-4xl overflow-y-auto p-4">
      <Link
        href="/admin"
        className="mb-3 inline-flex min-h-7 items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        {t("back")}
      </Link>
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <p className="mt-0.5 mb-4 text-sm text-muted-foreground">{t("subtitle")}</p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {KHOANG.map((k) => (
          <Link
            key={k}
            href={`/admin/khach-vao?ngay=${k}`}
            className={cn(
              "flex min-h-7 items-center rounded-full border px-2.5 text-[11.5px]",
              k === soNgay
                ? "border-primary bg-primary font-semibold text-primary-foreground"
                : "hover:bg-muted",
            )}
          >
            {t("days", { n: k })}
          </Link>
        ))}
      </div>

      {dinh === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {bac.map((b, i) => {
            const truoc = i === 0 ? null : bac[i - 1].so;
            const mat = truoc === null ? 0 : Math.max(0, truoc - b.so);
            const tiLeTruoc = truoc ? Math.round((b.so / truoc) * 100) : 100;
            return (
              <li key={b.nhan} className="p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12.5px] font-semibold">
                    {b.nhan}
                    {b.suy && (
                      <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                        {t("fromLedger")}
                      </span>
                    )}
                  </span>
                  <span className="text-[15px] font-bold tabular-nums">
                    {b.so.toLocaleString("vi-VN")}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, (b.so / dinh) * 100)}%` }}
                  />
                </div>
                {truoc !== null && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("ofPrevious", { pct: tiLeTruoc })}
                    {mat > 0 && (
                      <>
                        {" · "}
                        <span className="font-semibold text-destructive">
                          {t("lost", { n: mat.toLocaleString("vi-VN") })}
                        </span>
                      </>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mt-6 mb-2 text-[13px] font-semibold">{t("byPage")}</h2>
      {(p.theo_trang ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          <li className="flex px-3 py-1.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
            <span className="flex-1">{t("colPage")}</span>
            <span className="w-20 text-right">{t("colViews")}</span>
            <span className="w-24 text-right">{t("colClicks")}</span>
          </li>
          {(p.theo_trang ?? []).map((x) => (
            <li key={x.duong_dan} className="flex items-center px-3 py-2 text-[12px]">
              <span className="flex-1 truncate font-mono text-[11.5px]">{x.duong_dan}</span>
              <span className="w-20 text-right tabular-nums">{x.xem.toLocaleString("vi-VN")}</span>
              <span className="w-24 text-right tabular-nums">{x.bam.toLocaleString("vi-VN")}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{t("byPageNote")}</p>
      <p className="mt-4 rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        {t("privacyNote")}
      </p>
    </div>
  );
}

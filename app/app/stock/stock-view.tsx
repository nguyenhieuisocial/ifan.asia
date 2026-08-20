"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDownCircle, ArrowUpCircle, ClipboardList, PackageSearch, Truck, X } from "lucide-react";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { nhanLyDo, type DongSoKho, type MucTon } from "@/lib/stock/ledger";
import { layThemLichSuKho } from "./actions";
import { soLuong } from "./so-luong";

type BoLoc = "all" | "lowStock" | "negative";
type NhanTon = "negative" | "outOfStock" | "lowStock" | null;

const BO_LOC: BoLoc[] = ["all", "lowStock", "negative"];

/** Sáu lý do là bộ ĐÓNG đúng bằng 6 giá trị CSDL nhận (`stock_moves.reason`).
 *  Có nhãn dịch thì dùng nhãn dịch; mã lạ (CSDL mở thêm mà màn chưa kịp cập
 *  nhật) rơi về `nhanLyDo` của tầng dữ liệu thay vì hiện khoá dịch trống trơn. */
const LY_DO_CO_NHAN = new Set(["nhap", "ban", "hoan", "huy", "kiem_ke", "hao_hut"]);

/**
 * Ba nhãn — ba việc khác nhau phải làm (thẻ `man-kho.html`):
 * âm = đã bán mà chưa nhập sổ · 0 = còn bán là xuống âm · 1–5 = đặt hàng đi.
 */
function nhanTon(ton: number, nguong: number): NhanTon {
  if (ton < 0) return "negative";
  if (ton === 0) return "outOfStock";
  if (ton <= nguong) return "lowStock";
  return null;
}

const MAU_NHAN: Record<NonNullable<NhanTon>, string> = {
  negative: "bg-red-100 text-red-800",
  outOfStock: "bg-amber-100 text-amber-900",
  lowStock: "bg-amber-100 text-amber-900",
};

/** Lịch sử ra/vào của một mặt hàng — nạp theo yêu cầu khi người dùng bấm mở. */
function LichSuKho({ itemId }: { itemId: string }) {
  const t = useTranslations("stock");
  const locale = useLocale() as Locale;
  const [dong, setDong] = useState<DongSoKho[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [daTai, setDaTai] = useState(false);
  const [loi, setLoi] = useState(false);
  const [pending, startTransition] = useTransition();

  const tai = useCallback(
    (tiep?: string) => {
      startTransition(async () => {
        const kq = await layThemLichSuKho(itemId, tiep);
        setDaTai(true);
        // Tra cứu hỏng KHÁC "chưa có dòng nào" — giữ nguyên phần đã tải, chỉ
        // bật cờ lỗi để câu chữ dưới nói đúng chuyện đang xảy ra (việc #169).
        if (kq.error) {
          setLoi(true);
          return;
        }
        setLoi(false);
        setDong((cu) => (tiep ? [...cu, ...kq.dong] : kq.dong));
        setCursor(kq.cursorTiep);
      });
    },
    [itemId],
  );

  useEffect(() => {
    tai();
  }, [tai]);

  if (!daTai && pending) {
    return <p className="py-3 text-[12px] text-muted-foreground">{t("detail.loading")}</p>;
  }

  return (
    <div>
      {dong.length > 0 && (
        <div className="rounded-md border bg-background px-3">
          {dong.map((d) => (
            <div key={d.id} className="flex items-center gap-2.5 border-b py-2 text-[13px] last:border-b-0">
              {d.qty > 0 ? (
                <ArrowUpCircle className="size-4 shrink-0 text-green-600" />
              ) : (
                <ArrowDownCircle className="size-4 shrink-0 text-destructive" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate">
                  {LY_DO_CO_NHAN.has(d.lyDo) ? t(`reasons.${d.lyDo}`) : nhanLyDo(d.lyDo)}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {formatDateTime(d.taoLuc, locale)}
                  {/* Đường về chứng từ gốc — mối nối này nằm sẵn trong `stock_moves`
                      từ đầu (ref_type/ref_id) nhưng chưa màn nào đọc, nên đối chiếu
                      kho lệch phải mò tay. Chỉ hiện khi có đơn thật để mở. */}
                  {d.donHangId && (
                    <>
                      {" · "}
                      <Link
                        href={`/app/orders/${d.donHangId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {t("detail.viewOrder")}
                      </Link>
                    </>
                  )}
                </div>
              </div>
              <span className={`shrink-0 font-medium ${d.qty > 0 ? "text-green-700" : "text-destructive"}`}>
                {d.qty > 0 ? "+" : ""}
                {soLuong(d.qty, locale)}
              </span>
            </div>
          ))}
        </div>
      )}

      {loi ? (
        <p className="py-3 text-[12px] text-destructive">{t("detail.loadFailed")}</p>
      ) : dong.length === 0 ? (
        <p className="py-3 text-[12px] text-muted-foreground">{t("detail.empty")}</p>
      ) : null}

      {cursor && !loi && (
        <button
          type="button"
          onClick={() => tai(cursor)}
          disabled={pending}
          className="mt-2 w-full rounded-md border py-1.5 text-[12px] font-medium hover:bg-muted/60 disabled:opacity-60"
        >
          {pending ? t("detail.loading") : t("detail.more")}
        </button>
      )}
    </div>
  );
}

export function StockView({
  dsTon,
  tomTat,
  nguongSapHet,
  canManage,
  loadFailed,
}: {
  dsTon: MucTon[];
  tomTat: { soMatHang: number; sapHet: number; dangAm: number };
  nguongSapHet: number;
  canManage: boolean;
  loadFailed: boolean;
}) {
  const t = useTranslations("stock");
  const locale = useLocale() as Locale;
  const [boLoc, setBoLoc] = useState<BoLoc>("all");
  const [dangMo, setDangMo] = useState<string | null>(null);

  // Sắp theo MỨC THIẾU, không theo bảng chữ cái (thẻ design): món âm nằm trên
  // cùng vì đó là món phải đi nhập bù ngay.
  const hien = dsTon
    .filter((x) => (boLoc === "lowStock" ? x.ton > 0 && x.ton <= nguongSapHet : boLoc === "negative" ? x.ton < 0 : true))
    .slice()
    .sort((a, b) => a.ton - b.ton || a.ten.localeCompare(b.ten));

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Từ lg mới nới: bảng tồn kho liệt kê mọi món kèm mức tồn/ngưỡng sắp
            hết, khoá 672px thì tên món dài chèn lên cột số tồn. Dưới lg giữ
            nguyên. */}
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6 lg:max-w-5xl xl:max-w-7xl 2xl:max-w-[1600px]">
          <div>
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
          </div>

          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/app/stock/purchases"
                className="flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium hover:bg-muted/60"
              >
                <Truck className="size-4" />
                {t("nav.purchases")}
              </Link>
              <Link
                href="/app/stock/stocktake"
                className="flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium hover:bg-muted/60"
              >
                <ClipboardList className="size-4" />
                {t("nav.stocktake")}
              </Link>
            </div>
          )}

          {loadFailed ? (
            /* Tra cứu hỏng — KHÔNG hiện 3 số 0 kèm danh sách rỗng, vì như vậy
               chủ tiệm đọc ra "tiệm mất sạch hàng". */
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-5 text-center text-[13px] text-destructive">
              {t("loadFailed")}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-lg border p-3">
                  <div className="text-[12px] text-muted-foreground">{t("summary.items")}</div>
                  <div className="mt-1 text-[17px] font-semibold">{tomTat.soMatHang}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-[12px] text-muted-foreground">{t("summary.lowStock")}</div>
                  <div className="mt-1 text-[17px] font-semibold text-amber-900">{tomTat.sapHet}</div>
                </div>
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <div className="text-[12px] text-destructive">{t("summary.negative")}</div>
                  <div className="mt-1 text-[17px] font-semibold text-destructive">{tomTat.dangAm}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {BO_LOC.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setBoLoc(f)}
                    className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${
                      boLoc === f ? "bg-foreground text-background" : "border text-muted-foreground hover:bg-muted/60"
                    }`}
                  >
                    {t(`filters.${f}`)}
                  </button>
                ))}
              </div>

              {/* Rỗng vì CHƯA CÓ HÀNG HOÁ và rỗng vì CHƯA NHẬP KHO LẦN NÀO là
                  hai tình cảnh khác nhau — tiệm chỉ bán dịch vụ thì màn này
                  trống là ĐÚNG, đừng để họ tưởng mình cài sai. */}
              {dsTon.length > 0 && dsTon.every((x) => x.ton === 0) && (
                <p className="rounded-md bg-muted px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
                  {t("emptyNoMoves")}
                </p>
              )}

              {dsTon.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-8 text-center">
                  <PackageSearch className="size-8 text-muted-foreground/50" />
                  <p className="text-[13px] text-muted-foreground">{t("empty")}</p>
                </div>
              ) : hien.length === 0 ? (
                <p className="rounded-md border border-dashed p-5 text-center text-[13px] text-muted-foreground">
                  {t("emptyFiltered")}
                </p>
              ) : (
                <div className="divide-y rounded-md border">
                  {hien.map((x) => {
                    const nhan = nhanTon(x.ton, nguongSapHet);
                    const mo = dangMo === x.itemId;
                    return (
                      <div key={x.itemId}>
                        <button
                          type="button"
                          onClick={() => setDangMo(mo ? null : x.itemId)}
                          className="flex w-full items-center gap-2.5 p-2.5 text-left hover:bg-muted/40"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-[14px] font-medium">{x.ten}</span>
                              {nhan && (
                                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${MAU_NHAN[nhan]}`}>
                                  {t(`badges.${nhan}`)}
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                              {x.donVi ?? t("noUnit")}
                              {x.lanCuoi ? ` · ${t("lastMove", { at: formatDateTime(x.lanCuoi, locale) })}` : ""}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 text-[14px] font-semibold ${
                              x.ton < 0 ? "text-destructive" : x.ton <= nguongSapHet ? "text-amber-900" : ""
                            }`}
                          >
                            {soLuong(x.ton, locale)}
                            {x.donVi && <span className="ml-1 text-[11px] font-normal text-muted-foreground">{x.donVi}</span>}
                          </span>
                        </button>

                        {mo && (
                          /* Lịch sử mở NGAY dưới dòng đang bấm: nó chỉ có nghĩa
                             khi đứng cạnh con số tồn nó giải thích, và đóng lại
                             là về đúng chỗ vừa đứng trong danh sách. */
                          <div className="border-t bg-muted/20 p-3">
                            <div className="mb-2 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[13px] font-medium">{t("detail.historyTitle")}</div>
                                {x.giaVon !== null && (
                                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                                    {t("detail.cost", { amount: formatMoney(x.giaVon, locale) })} ·{" "}
                                    {t("detail.stockValue", { amount: formatMoney(Math.round(x.giaVon * x.ton), locale) })}
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => setDangMo(null)}
                                aria-label={t("detail.close")}
                                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
                              >
                                <X className="size-4" />
                              </button>
                            </div>
                            <LichSuKho itemId={x.itemId} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("lowStockHint", { threshold: nguongSapHet })} {t("negativeHint")}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

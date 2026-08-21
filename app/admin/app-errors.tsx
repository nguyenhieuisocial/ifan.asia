"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bug, ChevronDown } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { danhDauLoiDaXuLy } from "./actions";

export type AppErrorRow = {
  dau_van_tay: string;
  noi: string;
  loi: string;
  vet: string | null;
  duong_dan: string | null;
  so_lan: number;
  lan_dau: string;
  lan_cuoi: string;
};

/**
 * LỖI ỨNG DỤNG ĐANG XẢY RA VỚI NGƯỜI DÙNG THẬT.
 *
 * ⚠️ SẮP THEO LẦN CUỐI, KHÔNG THEO SỐ LẦN. Một lỗi cũ đã bắn mười nghìn lượt
 *   rồi thôi thì không còn quan trọng bằng một lỗi vừa xảy ra sáng nay. Sắp
 *   theo số lần là để lỗi chết chiếm mãi đầu danh sách.
 *
 * ⚠️ VẾT GỌI HÀM PHẢI GẤP LẠI. Mở sẵn thì ba lỗi đã đẩy mọi thứ khác của trang
 *   quản trị xuống dưới màn, và người đọc mất cái nhìn tổng thể — thứ họ vào
 *   trang này để lấy.
 */
export function AppErrorsSection({ rows }: { rows: AppErrorRow[] }) {
  const t = useTranslations("admin.appErrors");
  const locale = useLocale() as Locale;
  const [mo, datMo] = useState<string | null>(null);
  const [dangGhi, batDau] = useTransition();
  const [daAn, datDaAn] = useState<string[]>([]);

  const conLai = rows.filter((r) => !daAn.includes(r.dau_van_tay));
  if (conLai.length === 0) return null;

  return (
    <section className="rounded-lg border border-amber-500/40 bg-amber-50/60 p-4 dark:bg-amber-950/20">
      <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-amber-900 dark:text-amber-200">
        <Bug aria-hidden className="size-4" />
        {t("title", { n: conLai.length })}
      </h2>
      <ul className="mt-3 space-y-2">
        {conLai.map((r) => (
          <li key={r.dau_van_tay} className="rounded-md border bg-background px-3 py-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold break-words">{r.loi}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("line", {
                    n: r.so_lan,
                    noi: r.noi === "client" ? t("atBrowser") : t("atServer"),
                    date: formatDateTime(r.lan_cuoi, locale),
                  })}
                  {r.duong_dan ? ` · ${r.duong_dan}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {r.vet && (
                  <button
                    type="button"
                    onClick={() => datMo(mo === r.dau_van_tay ? null : r.dau_van_tay)}
                    aria-expanded={mo === r.dau_van_tay}
                    className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    {t("detail")}
                    <ChevronDown
                      className={`size-3 transition-transform ${mo === r.dau_van_tay ? "rotate-180" : ""}`}
                    />
                  </button>
                )}
                <button
                  type="button"
                  disabled={dangGhi}
                  onClick={() =>
                    batDau(async () => {
                      const kq = await danhDauLoiDaXuLy(r.dau_van_tay);
                      // ⚠️ CHỈ ẩn khi máy chủ xác nhận đã ghi. Ẩn trước rồi mới
                      //   gọi là nói dối người đọc khi lệnh ghi hỏng — đúng lớp
                      //   "báo đã lưu mà không lưu" mà kho này có cổng canh.
                      if (!kq?.error) datDaAn((c) => [...c, r.dau_van_tay]);
                    })
                  }
                  className="rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  {t("done")}
                </button>
              </div>
            </div>
            {mo === r.dau_van_tay && r.vet && (
              <pre className="mt-2 max-h-56 overflow-auto rounded bg-muted p-2 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap">
                {r.vet}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

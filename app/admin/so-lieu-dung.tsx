import { getTranslations } from "next-intl/server";
import { BarChart3 } from "lucide-react";

export type DongMan = { man: string; so_luot: number };

/**
 * SỐ LIỆU SỬ DỤNG trên bảng điều hành.
 *
 * ⚠️ CHỈ BA CON SỐ, và ba con số này chứ không phải ba con số khác:
 *   · MÀN NÀO ĐƯỢC DÙNG — trả lời "nên đầu tư vào đâu". Không có nó thì mọi
 *     quyết định ưu tiên đều dựa vào cảm giác, mà cảm giác về "tính năng nào
 *     quan trọng" gần như luôn lệch với thực tế dùng.
 *   · BAO NHIÊU NGƯỜI DÙNG HÔM NAY — mạch đập của sản phẩm.
 *   · TIỆM CÓ QUAY LẠI KHÔNG — thứ duy nhất nói được sản phẩm có dính hay không.
 *
 * ⚠️ KHÔNG bày "lượt xem trang" tổng cộng. Con số đó luôn tăng, luôn đẹp, và
 *   không dẫn tới quyết định nào — đúng loại chỉ số làm người ta yên tâm nhầm.
 *
 * ⚠️ Không có ĐƯỜNG ĐI của người dùng, và cố ý không có: dữ liệu gộp theo ngày
 *   (migration #329) không dựng lại được chuỗi màn A → màn B. Nói thẳng trên
 *   màn để người đọc không đi tìm thứ không tồn tại.
 */
export async function SoLieuDungSection({
  topMan,
  nguoiHomNay,
  tiemTuanNay,
  tiemQuayLai,
}: {
  topMan: DongMan[];
  nguoiHomNay: number;
  tiemTuanNay: number;
  tiemQuayLai: number;
}) {
  const t = await getTranslations("admin.usage");
  if (topMan.length === 0 && nguoiHomNay === 0) return null;

  const caoNhat = Math.max(1, ...topMan.map((x) => x.so_luot));

  return (
    <section className="rounded-lg border p-4">
      <h2 className="flex items-center gap-1.5 text-[14px] font-semibold">
        <BarChart3 aria-hidden className="size-4" />
        {t("title")}
      </h2>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <O nhan={t("activeToday")} giaTri={String(nguoiHomNay)} />
        <O nhan={t("shopsThisWeek")} giaTri={String(tiemTuanNay)} />
        <O
          nhan={t("returning")}
          giaTri={tiemTuanNay > 0 ? `${Math.round((tiemQuayLai / tiemTuanNay) * 100)}%` : "—"}
          phu={t("returningHint", { n: tiemQuayLai })}
        />
      </div>

      <p className="mt-4 mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {t("topScreens")}
      </p>
      <ul className="space-y-1">
        {topMan.map((m) => (
          <li key={m.man} className="flex items-center gap-2 text-[12px]">
            <span className="w-28 shrink-0 truncate">{m.man}</span>
            {/* Thanh vẽ bằng chiều rộng phần trăm — không kéo theo thư viện biểu
                đồ nào cho ba dòng số. */}
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${Math.round((m.so_luot / caoNhat) * 100)}%` }}
              />
            </span>
            <span className="w-12 shrink-0 text-right tabular-nums">{m.so_luot}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">{t("note")}</p>
    </section>
  );
}

function O({ nhan, giaTri, phu }: { nhan: string; giaTri: string; phu?: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{nhan}</p>
      <p className="text-lg font-semibold tabular-nums">{giaTri}</p>
      {phu && <p className="text-[11px] text-muted-foreground">{phu}</p>}
    </div>
  );
}

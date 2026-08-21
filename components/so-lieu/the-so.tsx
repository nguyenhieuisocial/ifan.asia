import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * THẺ MỘT CON SỐ, LUÔN KÈM MỐC SO SÁNH (thẻ `man-so-lieu-va-bieu-do`, #343).
 *
 * ⚠️ KHÔNG BAO GIỜ HIỆN MỘT CON SỐ TRẦN TRỤI. "12,4 triệu" tự nó không nói lên
 *   gì — chủ tiệm nhìn rồi bỏ qua. "12,4 triệu, hơn hôm qua 18%" thì mới ra
 *   được quyết định. Vì vậy `soSanh` là tham số BẮT BUỘC; muốn không có mốc thì
 *   phải truyền chuỗi giải thích, không được để trống cho tiện.
 *
 * ⚠️ MÀU KHÔNG PHẢI CÁCH DUY NHẤT ĐỂ BIẾT TỐT/XẤU. WCAG 1.4.1: 8% nam giới mù
 *   màu. Luôn kèm mũi tên ▲▼ và chữ, màu chỉ là lớp thứ ba.
 *
 * ⚠️ "Tốt" và "tăng" KHÔNG phải một. Doanh thu tăng là tốt; huỷ hẹn tăng là
 *   xấu. Nên hướng tốt/xấu do NƠI GỌI quyết (`tangLaTot`), không suy từ dấu.
 */

export function TheSo({
  nhan,
  so,
  soSanh,
  chieu,
  tangLaTot = true,
}: {
  nhan: string;
  /** Đã định dạng sẵn ở nơi gọi — thẻ này không biết đó là tiền hay số đếm. */
  so: string;
  /** Câu mốc đối chiếu. BẮT BUỘC. */
  soSanh: string;
  /** `len` · `xuong` · `deu` — hướng thay đổi, không phải tốt/xấu. */
  chieu: "len" | "xuong" | "deu";
  tangLaTot?: boolean;
}) {
  const t = useTranslations("soLieu");
  const tot = chieu === "deu" ? null : chieu === "len" ? tangLaTot : !tangLaTot;

  return (
    <div className="flex-1 p-3">
      <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">{nhan}</p>
      <p className="mt-0.5 text-xl leading-tight font-bold tabular-nums">{so}</p>
      <p
        className={cn(
          "mt-0.5 text-[10.5px] font-semibold",
          tot === null && "text-muted-foreground",
          tot === true && "text-green-700 dark:text-green-400",
          tot === false && "text-destructive",
        )}
      >
        <span aria-hidden className="mr-0.5">
          {chieu === "len" ? "▲" : chieu === "xuong" ? "▼" : "≈"}
        </span>
        <span className="sr-only">
          {chieu === "len" ? t("tang") : chieu === "xuong" ? t("giam") : t("deu")}{" "}
        </span>
        {soSanh}
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Paperclip } from "lucide-react";
import { kyChungTu } from "./actions";

/**
 * XEM ẢNH CHỨNG TỪ của một phiếu chi (thẻ `man-anh-chung-tu-phieu-chi`).
 *
 * ⚠️ CHỈ XIN ĐƯỜNG DẪN KHI NGƯỜI DÙNG BẤM. Danh sách sổ quỹ hiện tới 200 dòng;
 *   ký sẵn cho mọi dòng là hàng trăm đường dẫn có hạn giờ được tạo ra cho những
 *   tấm ảnh phần lớn không ai mở.
 *
 * ⚠️ KHO `tenant-files` LÀ KHO RIÊNG — không có đường dẫn công khai. Mỗi lần
 *   xem phải xin một đường dẫn có chữ ký, hạn 1 giờ. Cùng kho này đang chứa
 *   ảnh chấm công (mặt nhân viên) và tệp khách gửi trong Chat, nên mở kho ra
 *   công khai "cho tiện xem ảnh" là mở luôn hai thứ kia.
 */
export function XemChungTu({ chungTu }: { chungTu: { duong_dan: string; ten: string }[] }) {
  const t = useTranslations("cashbook.chungTu");
  const [mo, datMo] = useState(false);
  const [dan, datDan] = useState<{ duong_dan: string; url: string | null }[] | null>(null);
  const [dangXin, datDangXin] = useState(false);

  if (chungTu.length === 0) return null;

  async function bam() {
    if (mo) {
      datMo(false);
      return;
    }
    datMo(true);
    if (dan !== null || dangXin) return;
    datDangXin(true);
    try {
      datDan(await kyChungTu(chungTu.map((x) => x.duong_dan)));
    } finally {
      datDangXin(false);
    }
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => void bam()}
        aria-expanded={mo}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary max-md:min-h-11"
      >
        <Paperclip className="size-3.5" aria-hidden />
        {t("count", { n: chungTu.length })}
      </button>

      {mo && (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {dangXin && <span className="text-[11px] text-muted-foreground">{t("loading")}</span>}
          {(dan ?? []).map((a) =>
            a.url ? (
              <a
                key={a.duong_dan}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- ảnh nằm
                    ở đường dẫn ký hạn giờ, đổi mỗi lần xin; tối ưu ảnh của
                    Next cần một đường dẫn ổn định nên không dùng được ở đây. */}
                <img
                  src={a.url}
                  alt={t("one")}
                  className="size-20 rounded-md border object-cover"
                  loading="lazy"
                />
              </a>
            ) : (
              // ⚠️ Ký hỏng thì nói ra, KHÔNG lặng lẽ bỏ tấm đó khỏi danh sách:
              //   bỏ đi nghĩa là màn hình nói "phiếu này không có chứng từ"
              //   trong khi nó CÓ.
              <span
                key={a.duong_dan}
                className="flex size-20 items-center justify-center rounded-md border border-dashed p-1 text-center text-[10px] text-muted-foreground"
              >
                {t("cannotShow")}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}

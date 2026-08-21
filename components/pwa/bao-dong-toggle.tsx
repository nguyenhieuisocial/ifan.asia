"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  datBaoDongBatThuong,
  docBaoDongBatThuong,
} from "@/app/app/settings/notifications/push-actions";

/**
 * BẬT / TẮT báo động bất thường (thẻ `man-bao-dong-bat-thuong`, #348/#349).
 *
 * ⚠️ ĐỨNG RIÊNG, KHÔNG NẰM TRONG KHỐI BẢN TIN ZALO. Bản đầu đặt công tắc này
 *   chung với ba ô chọn nội dung bản tin Zalo — mà cả khối đó chỉ hiện khi
 *   tiệm ĐÃ NỐI BOT. Kết quả: tiệm không dùng Zalo (đúng tình cảnh tiệm demo)
 *   mở màn Cài đặt ra và KHÔNG THẤY công tắc ở đâu cả. Chỉ mở màn thật ra nhìn
 *   mới phát hiện; đọc mã nguồn thì thấy nó "đã có".
 *
 * ⚠️ CHỈ HIỆN CHO NGƯỜI ĐƯỢC NHẬN TIN. Nhân viên thường không nhận báo động
 *   (đây là số của cả tiệm) nên bày một công tắc cho họ là bày một cái nút
 *   không làm gì — họ sẽ bật lên rồi chờ một tin không bao giờ tới.
 *
 * ⚠️ MẶC ĐỊNH BẬT, ngược với email. Đây là tin CẢNH BÁO — thứ người ta muốn
 *   biết ngay cả khi chưa từng nghĩ tới việc đi bật nó — và nó hiếm (nhiều
 *   nhất một tin mỗi ngày) nên bật sẵn không gây phiền.
 */
export function BaoDongToggle() {
  const t = useTranslations("pwa.baoDong");
  const [dangLam, datDangLam] = useState(false);

  const q = useQuery({
    queryKey: ["bao-dong-bat-thuong"],
    queryFn: docBaoDongBatThuong,
    staleTime: 0,
  });

  async function doi(bat: boolean) {
    datDangLam(true);
    try {
      const res = await datBaoDongBatThuong({ bat });
      if (res.error) {
        toast.error(t("failed"));
        return;
      }
      await q.refetch();
      toast.success(bat ? t("turnedOn") : t("turnedOff"));
    } finally {
      datDangLam(false);
    }
  }

  const bat = q.data?.bat ?? true;

  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <TriangleAlert
            className={bat ? "size-4 text-destructive" : "size-4 text-muted-foreground"}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold">{t("title")}</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            {t("subtitle")}
          </p>

          <div className="mt-3">
            {q.isPending ? (
              <p className="text-[12px] text-muted-foreground">{t("checking")}</p>
            ) : bat ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2 py-1 text-[12px] font-medium text-primary">
                  {t("on")}
                </span>
                <Button size="sm" variant="outline" onClick={() => doi(false)} disabled={dangLam}>
                  {t("turnOff")}
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => doi(true)} disabled={dangLam} className="gap-1.5">
                <TriangleAlert className="size-4" />
                {t("turnOn")}
              </Button>
            )}
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{t("note")}</p>
        </div>
      </div>
    </section>
  );
}

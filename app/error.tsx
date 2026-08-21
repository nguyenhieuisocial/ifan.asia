"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { TilePlug } from "@/components/illustrations/tile-plug";
import { Button } from "@/components/ui/button";
import { baoLoiLenMayChu } from "@/components/bao-loi-len-may-chu";

/** Error boundary toàn app — client component, dịch qua namespace "errors". */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  /**
   * ⚠️ BÁO LỖI LÊN MÁY CHỦ. Trước bản này màn lỗi chỉ VẼ một lời xin lỗi rồi
   *   thôi — không ai được báo. Một màn hỏng với khách hàng thật có thể nằm im
   *   nhiều ngày cho tới khi có người chịu khó nhắn cho founder.
   *
   * ⚠️ Phụ thuộc theo `error` chứ không phải mảng rỗng: một lượt dựng lại với
   *   MỘT LỖI KHÁC phải gửi thêm một lời báo, nếu không thì mọi lỗi sau lỗi đầu
   *   tiên đều biến mất.
   */
  useEffect(() => {
    baoLoiLenMayChu(error);
  }, [error]);
  return (
    <main id="noi-dung-chinh" className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <TilePlug className="size-16" />
      <h1 className="text-2xl font-semibold">{t("errorTitle")}</h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        {t("errorBody")}
      </p>
      <Button variant="outline" onClick={reset}>
        {t("retry")}
      </Button>
    </main>
  );
}

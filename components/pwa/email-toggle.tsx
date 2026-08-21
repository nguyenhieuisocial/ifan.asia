"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  datEmailThongBao,
  docEmailThongBao,
} from "@/app/app/settings/notifications/push-actions";

/**
 * BẬT / TẮT nhận thông báo qua EMAIL.
 *
 * Đường báo thứ tư của iFan, cạnh chuông trong ứng dụng, đẩy lên điện thoại,
 * và nhóm Telegram. Email là đường người ở xa hay dùng nhất — chủ tiệm đi
 * công tác không mở app cả ngày vẫn đọc được thư.
 *
 * ⚠️ MẶC ĐỊNH TẮT, và nói rõ sẽ gửi tới địa chỉ nào. Bật sẵn nghĩa là tự tiện
 *   gửi thư cho người ta; và không nói địa chỉ thì người dùng không biết thư
 *   sẽ tới hộp nào để mà đi tìm.
 */
export function EmailToggle() {
  const t = useTranslations("pwa.email");
  const [dangLam, datDangLam] = useState(false);

  const q = useQuery({
    queryKey: ["email-thong-bao"],
    queryFn: docEmailThongBao,
    staleTime: 0,
  });

  async function doi(bat: boolean) {
    datDangLam(true);
    try {
      const res = await datEmailThongBao({ bat });
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

  const bat = q.data?.bat ?? false;
  const sanSang = q.data?.mayChuSanSang ?? false;

  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Mail className={bat ? "size-4 text-primary" : "size-4 text-muted-foreground"} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold">{t("title")}</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            {q.data?.email ? t("subtitleTo", { email: q.data.email }) : t("subtitle")}
          </p>

          <div className="mt-3">
            {q.isPending ? (
              <p className="text-[12px] text-muted-foreground">{t("checking")}</p>
            ) : !sanSang ? (
              /* ⚠️ Nói thẳng là bên mình chưa cấu hình, đừng bày một công tắc
                 bật lên rồi không có thư nào tới. */
              <p className="rounded-md border border-dashed p-2.5 text-[12px] leading-relaxed text-muted-foreground">
                {t("serverNotReady")}
              </p>
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
                <Mail className="size-4" />
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

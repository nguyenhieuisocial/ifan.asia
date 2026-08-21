"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Fingerprint } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useCoVanTay } from "./co-van-tay";

/**
 * ĐĂNG NHẬP BẰNG VÂN TAY / KHUÔN MẶT.
 *
 * Máy ở quầy là máy dùng chung. Hôm nay mỗi lần đổi ca là gõ lại mật khẩu
 * trước mặt khách và trước mặt đồng nghiệp — vừa chậm, vừa là cách mật khẩu bị
 * nhìn thấy.
 *
 * ⚠️ CHỈ HIỆN khi máy thật sự làm được. Bày một nút mà bấm vào chỉ báo lỗi thì
 *   tệ hơn không có nút — người dùng sẽ nghĩ tài khoản mình hỏng.
 *
 * ⚠️ Người dùng BẤM HUỶ ở hộp vân tay cũng ném lỗi. Đó KHÔNG phải hỏng — báo
 *   đỏ lúc đó là mắng người ta vì đã đổi ý.
 */
export function NutDangNhapVanTay({ tiep }: { tiep?: string }) {
  const t = useTranslations("passkey");
  const router = useRouter();
  const [dangLam, datDangLam] = useState(false);
  const coHoTro = useCoVanTay();

  async function vao() {
    datDangLam(true);
    try {
      const r = await fetch("/api/passkey/dang-nhap");
      if (!r.ok) {
        toast.error(t("notAvailable"));
        return;
      }
      const { tuyChon } = (await r.json()) as { tuyChon: Parameters<typeof startAuthentication>[0]["optionsJSON"] };

      let traLoi;
      try {
        traLoi = await startAuthentication({ optionsJSON: tuyChon });
      } catch (e) {
        // Bấm Huỷ, hoặc máy không có khoá nào cho trang này. Im lặng quay về.
        if ((e as Error)?.name === "NotAllowedError") return;
        toast.error(t("noDevice"));
        return;
      }

      const v = await fetch("/api/passkey/dang-nhap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(traLoi),
      });
      if (!v.ok) {
        const { error } = (await v.json().catch(() => ({}))) as { error?: string };
        toast.error(
          error === "unknownDevice"
            ? t("unknownDevice")
            : error === "tooMany"
              ? t("tooMany")
              : t("failed"),
        );
        return;
      }
      router.replace(tiep ?? "/app/today");
      router.refresh();
    } finally {
      datDangLam(false);
    }
  }

  if (!coHoTro) return null;

  return (
    <button
      type="button"
      onClick={vao}
      disabled={dangLam}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border text-[13px] font-medium hover:bg-muted disabled:opacity-60"
    >
      <Fingerprint className="size-4" />
      {dangLam ? t("signingIn") : t("signIn")}
    </button>
  );
}

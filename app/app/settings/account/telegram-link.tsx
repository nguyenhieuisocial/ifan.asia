"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createLinkCode } from "./actions";

/**
 * Nối tài khoản Telegram — nửa phía iFan (migration #96).
 *
 * Chỉ hiện mã; bước nối thật xảy ra khi người dùng nhắn `/lienket <mã>` cho
 * bot. Cố ý bắt phải sang Telegram gõ: đó là bằng chứng người đó THẬT SỰ cầm
 * tài khoản Telegram kia. Nếu cho gõ mã số Telegram thẳng vào đây thì ai cũng
 * gõ mã số của người khác rồi tự nhận là chủ dự án.
 */
export function TelegramLink({ linkedTo }: { linkedTo: string | null }) {
  const t = useTranslations("settings.account.telegram");
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <h2 className="font-medium">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">
          {linkedTo ? t("linkedAs", { name: linkedTo }) : t("description")}
        </p>
      </div>

      {code ? (
        <div className="space-y-2">
          <p className="text-center font-mono text-3xl tracking-[0.3em]">{code}</p>
          <p className="text-sm text-muted-foreground">{t("howTo", { code })}</p>
          <p className="text-xs text-muted-foreground">{t("expires")}</p>
        </div>
      ) : (
        <Button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setFailed(false);
            const res = await createLinkCode();
            // Hỏng thì nói thẳng, KHÔNG để nút im lặng không phản ứng —
            // người dùng sẽ bấm mãi mà tưởng máy treo.
            if (res.code) setCode(res.code);
            else setFailed(true);
            setBusy(false);
          }}
        >
          {linkedTo ? t("relink") : t("getCode")}
        </Button>
      )}

      {failed && (
        <p className="text-sm text-destructive">{t("failed")}</p>
      )}
    </section>
  );
}

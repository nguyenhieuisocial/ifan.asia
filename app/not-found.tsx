import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TileMessage } from "@/components/illustrations/tile-message";
import { Button } from "@/components/ui/button";

/** 404 toàn app — server component, dịch qua namespace "errors". */
export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main id="noi-dung-chinh" className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <TileMessage className="size-16" />
      <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        {t("notFoundBody")}
      </p>
      {/* Lối chính là VỀ APP, không phải về trang bán hàng: gõ nhầm một đường
          dẫn trong lúc đang làm việc mà bị đẩy ra trang giới thiệu thì phải
          đăng nhập lại từ đầu trong đầu người dùng. Trang chủ để làm lối phụ
          cho người chưa có tài khoản. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link href="/app/today">{t("backToApp")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">{t("backHome")}</Link>
        </Button>
      </div>
    </main>
  );
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BrandMark } from "@/components/brand-mark";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

export type LegalSection = { heading: string; body: string[] };

/**
 * Khung chung cho trang Điều khoản và Chính sách bảo mật.
 *
 * Nội dung KHÔNG nằm trong messages/*.json: hai trang này dài hàng nghìn chữ và
 * chỉ đọc một lần trong đời, nhét vào file ngôn ngữ chung là mọi màn khác phải
 * tải theo. Để riêng theo trang, chọn bản theo ngôn ngữ đang dùng.
 */
export async function LegalPage({
  title,
  updatedAt,
  intro,
  sections,
}: {
  title: string;
  updatedAt: string;
  intro: string;
  sections: LegalSection[];
}) {
  const t = await getTranslations("legal");

  return (
    <main className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-6">
          <Link href="/" className="shrink-0">
            <BrandMark />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LocaleSwitcher />
          </div>
        </div>
      </header>

      <article className="mx-auto w-full max-w-3xl px-6 py-12">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("updatedAt", { date: updatedAt })}
        </p>
        <p className="mt-6 leading-relaxed">{intro}</p>

        {sections.map((s, i) => (
          <section key={s.heading} className="mt-8">
            <h2 className="text-lg font-semibold">
              {i + 1}. {s.heading}
            </h2>
            {s.body.map((p) => (
              <p key={p} className="mt-3 leading-relaxed text-muted-foreground">
                {p}
              </p>
            ))}
          </section>
        ))}

        <p className="mt-10 border-t pt-6 text-sm text-muted-foreground">
          {t("contact")}{" "}
          <a
            href="mailto:hello@ifan.asia"
            className="text-foreground underline"
          >
            hello@ifan.asia
          </a>
        </p>
        <p className="mt-6">
          <Link href="/" className="text-sm text-foreground underline">
            {t("backHome")}
          </Link>
        </p>
      </article>
    </main>
  );
}

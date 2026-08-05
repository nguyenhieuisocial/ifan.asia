import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroTiles } from "@/components/illustrations/hero-tiles";

type Translate = Awaited<ReturnType<typeof getTranslations>>;

/** Mock hộp thư dựng thuần CSS/token — minh họa sản phẩm, không dùng ảnh chụp. */
function InboxMock({ t }: { t: Translate }) {
  const conversations = [
    {
      name: t("mock.conv1Name"),
      preview: t("mock.conv1Preview"),
      time: t("mock.conv1Time"),
      unread: true,
      selected: true,
    },
    {
      name: t("mock.conv2Name"),
      preview: t("mock.conv2Preview"),
      time: t("mock.conv2Time"),
      unread: false,
      selected: false,
    },
    {
      name: t("mock.conv3Name"),
      preview: t("mock.conv3Preview"),
      time: t("mock.conv3Time"),
      unread: false,
      selected: false,
    },
  ];
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md select-none pb-24 lg:mx-0">
      {/* Danh sách hội thoại */}
      <div className="rounded-xl border bg-card p-3 text-card-foreground">
        <div className="flex items-center justify-between px-2 pt-1 pb-3">
          <span className="text-sm font-semibold">{t("mock.title")}</span>
          <div className="flex gap-1.5 text-xs">
            <span className="rounded-full bg-primary-tint px-2.5 py-0.5 font-medium text-primary">
              {t("mock.tabAll")}
            </span>
            <span className="rounded-full px-2.5 py-0.5 text-muted-foreground">
              {t("mock.tabUnassigned")}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {conversations.map((c) => (
            <div
              key={c.name}
              className={`flex items-center gap-3 rounded-lg px-2 py-2.5 ${
                c.selected ? "bg-muted" : ""
              }`}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-sm font-semibold text-primary">
                {c.name.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`truncate text-sm ${
                      c.unread ? "font-semibold" : "font-medium"
                    }`}
                  >
                    {c.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {c.time}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] text-muted-foreground">
                    {c.preview}
                  </span>
                  {c.unread && (
                    <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                      2
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Khung chat nổi chồng lên */}
      <div className="absolute -bottom-2 right-0 w-[88%] rounded-xl border bg-card p-4 shadow-sm sm:-right-4">
        <div className="flex items-center gap-2 pb-3">
          <span className="text-sm font-semibold">{t("mock.conv1Name")}</span>
          <span className="rounded-full bg-tier-vip px-2 py-0.5 text-xs font-semibold text-tier-vip-foreground">
            {t("mock.tierVip")}
          </span>
          <span className="ml-auto rounded-full bg-status-open px-2 py-0.5 text-xs font-semibold text-status-open-foreground">
            {t("mock.statusOpen")}
          </span>
        </div>
        <div className="flex flex-col gap-2 text-[13px] leading-snug">
          <p className="max-w-[85%] self-start rounded-xl rounded-bl-sm bg-bubble-in px-3 py-2 text-bubble-in-foreground">
            {t("mock.bubbleIn")}
          </p>
          <p className="max-w-[85%] self-end rounded-xl rounded-br-sm bg-bubble-out px-3 py-2 text-bubble-out-foreground">
            {t("mock.bubbleOut")}
          </p>
          <p className="max-w-[85%] self-end rounded-xl bg-bubble-note px-3 py-2 text-bubble-note-foreground">
            {t("mock.note")}
          </p>
          <span className="mt-1 inline-flex items-center gap-1.5 self-end rounded-full bg-primary-tint px-2.5 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3" />
            {t("mock.aiChip")}
          </span>
        </div>
      </div>
    </div>
  );
}

export async function Hero() {
  const t = await getTranslations("landing.hero");
  return (
    <section className="border-b">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-16 sm:py-24 lg:grid-cols-2">
        {/* min-w-0: ô lưới mặc định KHÔNG co dưới độ rộng nội dung tối thiểu
            (min-width:auto). Thiếu nó thì ảnh minh họa hộp thư ép cả cột rộng
            409px trong khung 375px → trang chủ trôi ngang 58px trên điện thoại,
            đúng trang đầu tiên khách nhìn thấy. */}
        <div className="rise-in flex min-w-0 flex-col items-start gap-6">
          {/* Bộ gạch gốm — chất liệu thương hiệu (Phụ lục C luật thiết kế) */}
          <HeroTiles className="h-14 w-auto" />
          <p className="rounded-full border px-4 py-1 text-sm text-muted-foreground">
            {t("badge")}
          </p>
          <h1 className="max-w-xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {t.rich("headline", { em: (chunks) => <em>{chunks}</em> })}
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            {t("subheadline")}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" asChild className="hover-lift">
              <Link href="/signup">{t("ctaPrimary")}</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="hover-lift">
              <Link href="/login">{t("ctaSecondary")}</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t("ctaNote")}</p>
        </div>
        <div className="rise-in rise-in-late min-w-0">
          <InboxMock t={t} />
        </div>
      </div>
    </section>
  );
}

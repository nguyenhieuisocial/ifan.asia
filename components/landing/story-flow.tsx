import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  CalendarClock,
  ChartColumn,
  FileCheck,
  Kanban,
  MessageSquare,
  MessageSquareMore,
  QrCode,
  Repeat,
  SquareCheckBig,
  Sun,
  UserRound,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/landing/reveal";

/**
 * 3 luồng kể chuyện (thẻ landing-luong-ke-chuyen) — ngữ pháp hình khối dùng
 * chung: ô viền cam = nơi luồng bắt đầu, ô viền thường = một màn trong app,
 * ô nền xanh = kết quả đo được, mũi tên xám = việc app tự chuyển tiếp.
 * SVG chỉ chứa hình học thuần; mọi chữ nằm ngoài SVG bằng HTML.
 * Trên điện thoại chuỗi 4 bước tự gãy dòng theo flex-wrap — không cuộn ngang.
 */
const FLOWS: { id: "flow1" | "flow2" | "flow3"; icons: LucideIcon[] }[] = [
  { id: "flow1", icons: [MessageSquareMore, Kanban, FileCheck, Banknote] },
  { id: "flow2", icons: [QrCode, MessageSquare, UserRound, ChartColumn] },
  { id: "flow3", icons: [SquareCheckBig, CalendarClock, Sun, Repeat] },
];

/**
 * Mũi tên tự vẽ nét khi cuộn tới (flow-arrow + stroke-dashoffset, scroll-driven
 * trong globals.css). `order` = số thứ tự xen kẽ ô/mũi tên trong luồng (--fs)
 * để cả chuỗi sáng dần đúng nhịp trái → phải. Không hỗ trợ scroll-driven thì
 * mũi tên vẽ sẵn — không mất gì.
 */
function Arrow({ order }: { order: number }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 30 64"
      className="flow-arrow h-16 w-[30px] flex-none text-muted-foreground/70"
      style={{ "--fs": order } as CSSProperties}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 32h20" />
      <path d="m18 26 6 6-6 6" />
    </svg>
  );
}

export async function StoryFlow() {
  const t = await getTranslations("landing.story");
  return (
    <section className="border-b">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <Reveal>
          <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">
            {t("title")}
          </h2>
          <p className="mt-3 text-center text-muted-foreground">
            {t("subtitle")}
          </p>
        </Reveal>
        <div className="mx-auto mt-10 flex max-w-3xl flex-col gap-12">
          {FLOWS.map(({ id, icons }, flowIndex) => (
            <Reveal key={id} delay={flowIndex * 80}>
              <h3 className="text-base font-semibold">{t(`${id}.title`)}</h3>
              <div className="mt-5 flex flex-wrap items-start gap-1.5">
                {icons.map((Icon, i) => {
                  const step = (i + 1) as 1 | 2 | 3 | 4;
                  const isStart = i === 0;
                  const isResult = i === icons.length - 1;
                  return (
                    <div key={step} className="contents">
                      {i > 0 && <Arrow order={i * 2 - 1} />}
                      <div className="flex w-32 flex-col items-center gap-2 text-center">
                        {/* flow-step: ô sáng + nở dần theo thứ tự khi cuộn tới
                            (--fs xen kẽ với mũi tên); chữ bên dưới KHÔNG animate
                            — luôn đậm đủ đọc. Ô kết quả: icon "thở" nhẹ. */}
                        <div
                          className={`flow-step flex size-16 items-center justify-center rounded-xl border ${
                            isResult
                              ? "bg-status-closed"
                              : isStart
                                ? "border-primary/50 bg-card"
                                : "bg-card"
                          }`}
                          style={{ "--fs": i * 2 } as CSSProperties}
                        >
                          <Icon
                            aria-hidden
                            strokeWidth={1.8}
                            className={`size-7 ${
                              isResult
                                ? "flow-breathe text-status-closed-foreground"
                                : isStart
                                  ? "text-primary"
                                  : "text-muted-foreground"
                            }`}
                          />
                        </div>
                        <p className="text-sm font-semibold leading-tight">
                          {t(`${id}.s${step}Title`)}
                        </p>
                        <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">
                          {t(`${id}.s${step}Desc`)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

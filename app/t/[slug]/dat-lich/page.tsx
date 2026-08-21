import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { loadStorefront } from "../storefront-data";
import { BookingFlow, type BookingClosureRow, type BookingHourRow } from "./booking-flow";
import { mauCua } from "@/lib/thuong-hieu";

// Trang công khai, đổi theo giờ thật (giờ nào còn trống) — không cache tĩnh
// được, đúng nguyên tắc của chính mặt tiền `/t/[slug]`.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const r = await loadStorefront(slug);
  if (r.kind !== "ok" || !r.data.enabled) return {};
  const t = await getTranslations("storefront.public.booking");
  return {
    title: t("pageTitle", { shop: r.data.name ?? "" }),
    // Cùng luật với mặt tiền (ADR-0008 mục 4): đây là trang tiệm muốn khách
    // TÌM THẤY. Khác hẳn /k/[token] sau này — cái đó noindex.
    robots: { index: true, follow: true },
  };
}

/**
 * Khách TỰ ĐẶT LỊCH (#290) — thẻ design `man-khach-tu-dat-lich.html`.
 *
 * Trang RIÊNG chứ không nhét thêm khối vào mặt tiền: đây là luồng bốn bước có
 * trạng thái, còn mặt tiền là một trang đọc. Tách ra thì mặt tiền không phải
 * tải thêm mã của luồng này cho mọi khách chỉ ghé xem giờ mở cửa.
 *
 * Ba lớp chặn, KHÔNG lớp nào là "chưa cấu hình thì cho qua":
 *   1. tiệm không có / chưa bật mặt tiền  → 404 (CSDL trả cùng một lỗi, #209)
 *   2. tiệm chưa bật đặt lịch             → 404 (CSDL không trả `booking_items`)
 *   3. tiệm bật nhưng chưa có dịch vụ nào → 404 (không có gì để chọn)
 * Lớp cuối cùng và thật sự là CSDL: `storefront_slots`/`storefront_book` tự
 * kiểm lại công tắc, nên xoá trang này đi thì cửa vẫn khoá.
 */
export default async function BookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations("storefront.public");
  const r = await loadStorefront(slug);

  if (r.kind === "throttled") {
    return (
      <main id="noi-dung-chinh" className="flex min-h-dvh items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <p className="text-sm font-semibold">{t("throttled.title")}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {t("throttled.body")}
          </p>
        </div>
      </main>
    );
  }
  if (r.kind === "missing") notFound();

  const d = r.data;
  const items = d.booking_items ?? [];
  if (!d.enabled || !d.booking_enabled || items.length === 0) notFound();

  // Ngày HÔM NAY theo lịch của TIỆM. `now` do CSDL trả về dạng giờ-tường
  // (`now() at time zone tenants.timezone`), nên 10 ký tự đầu đã LÀ ngày của
  // tiệm — tầng web CẤM tự đổi múi giờ lần nữa (bài học #99 và #192).
  const todayKey = (d.now ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayKey)) notFound();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-background">
      <div className="border-b px-5 py-3">
        <Link href={`/t/${slug}`} className="text-[13px] text-muted-foreground">
          ← {d.name}
        </Link>
      </div>
      <div className="px-5 py-4 pb-10">
        <BookingFlow
          mauNen={mauCua(r.thuongHieu?.mau).dam}
          slug={slug}
          shopName={d.name ?? ""}
          todayKey={todayKey}
          items={items}
          hours={(d.hours ?? []) as BookingHourRow[]}
          closures={(d.closures ?? []) as BookingClosureRow[]}
          zaloUrl={d.zalo_contact_url ?? null}
        />
      </div>
    </main>
  );
}

import { getTranslations } from "next-intl/server";
import { stopSupportSession } from "@/app/app/support/actions";
import { formatTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import type { ActiveSupportSession } from "@/app/app/support/queries";

/**
 * Dải "iFan đang xem tiệm bạn để hỗ trợ" (ADR-0006 mục 6, thẻ design
 * man-ho-tro-chi-doc.html) — dính MỌI màn suốt phiên, KHÔNG dùng màu cảnh báo
 * (đây là chuyện đang-được-giúp, không phải sự cố). Nói đủ 3 điều: ai đang
 * xem · chỉ đọc · bao giờ hết. Nút "Dừng ngay" — người trả tiền cắt được
 * quyền xem bất cứ lúc nào, không phải đi xin.
 */
export async function SupportSessionBanner({
  session,
  locale,
}: {
  session: ActiveSupportSession;
  locale: Locale;
}) {
  const t = await getTranslations("support.banner");

  // Server action inline: form action đòi void|Promise<void>, còn
  // stopSupportSession trả {error} để dùng lại được ở nơi khác (nếu sau này
  // cần báo lỗi qua toast) — bọc một lớp bỏ giá trị trả về cho đúng kiểu.
  async function handleStop() {
    "use server";
    await stopSupportSession(session.id);
  }

  return (
    <div className="flex shrink-0 flex-wrap items-start gap-2.5 border-b border-[#d7eaff] bg-[#e0f1ff] px-4 py-2">
      <svg
        aria-hidden
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 shrink-0 text-[#124a7b]"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12h8" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-relaxed font-semibold text-[#124a7b]">
          {t("title")}
        </p>
        <p className="text-[12px] text-[#124a7b]/80">
          {t("expiresAt", { time: formatTime(session.expires_at, locale) })}
        </p>
      </div>
      <form action={handleStop}>
        <button
          type="submit"
          className="h-[26px] shrink-0 rounded-md border border-[#124a7b] bg-white px-3 text-[12.5px] font-semibold whitespace-nowrap text-[#124a7b] hover:bg-[#124a7b]/5"
        >
          {t("stopNow")}
        </button>
      </form>
    </div>
  );
}

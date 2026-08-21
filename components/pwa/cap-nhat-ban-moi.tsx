"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";

/**
 * CÓ BẢN MỚI — HỎI RỒI MỚI ĐỔI.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG TỰ ĐỔI NGAY — sự cố 19/08/2026 chép lại ở `public/sw.js`
 * ═══════════════════════════════════════════════════════════════════
 * Bản trước gọi `skipWaiting()` ngay lúc cài: bản mới của service worker
 * giành quyền NGAY, trong khi trang đang mở vẫn đang chạy mã cũ và vẫn đang
 * xin các tệp mã của bản cũ. Từ lúc đó trang đang mở nằm giữa hai bản — và
 * đúng đó là cách sinh ra loạt lỗi "máy chủ dựng một đằng, trình duyệt dựng
 * một nẻo" đã mất cả ngày để lần ra.
 *
 * Cách đúng, và là cách mọi ứng dụng nghiêm túc làm: bản mới **đợi**, người
 * dùng thấy một lời mời, bấm rồi mới đổi và tải lại. Đang dở một việc thì
 * không bị giật mất trang.
 *
 * ⚠️ KHÔNG tự tải lại sau N giây. Lễ tân đang gõ dở một buổi hẹn mà trang tự
 *   tải lại là mất việc họ vừa làm — và họ sẽ không biết vì sao.
 */

/** Bản mới đang đợi hay không. Kho ngoài React nên đọc bằng `useSyncExternalStore`. */
let dangDoi: ServiceWorker | null = null;
const nguoiNghe = new Set<() => void>();

function bao() {
  for (const f of nguoiNghe) f();
}

let daNoi = false;
function noiVoiServiceWorker() {
  if (daNoi || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  daNoi = true;

  void navigator.serviceWorker.getRegistration().then((dk) => {
    if (!dk) return;

    const xem = () => {
      if (dk.waiting && navigator.serviceWorker.controller) {
        // ⚠️ Điều kiện `controller` là bắt buộc. Lần cài ĐẦU TIÊN cũng có một
        //   bản "waiting" trong giây lát, nhưng lúc đó chưa có bản nào đang
        //   phục vụ — mời cập nhật ngay lần đầu vào app là vô nghĩa và làm
        //   người ta tưởng phần mềm hỏng.
        dangDoi = dk.waiting;
        bao();
      }
    };
    xem();
    dk.addEventListener("updatefound", () => {
      const moi = dk.installing;
      if (!moi) return;
      moi.addEventListener("statechange", xem);
    });

    // Kiểm bản mới mỗi khi người ta quay lại tab. Không đặt hẹn giờ định kỳ:
    // một tab mở cả ngày ở quầy mà cứ vài phút lại hỏi máy chủ là tốn pin và
    // tốn mạng cho việc gần như luôn trả lời "không có gì mới".
    window.addEventListener("focus", () => void dk.update());
  });
}

function theoDoi(f: () => void) {
  nguoiNghe.add(f);
  noiVoiServiceWorker();
  return () => {
    nguoiNghe.delete(f);
  };
}

export function CapNhatBanMoi() {
  const t = useTranslations("pwa.update");
  const co = useSyncExternalStore(
    theoDoi,
    () => dangDoi !== null,
    () => false,
  );

  const capNhat = useCallback(() => {
    const w = dangDoi;
    if (!w) return;
    // Bản mới đổi xong sẽ giành quyền; `controllerchange` là lúc chắc chắn nó
    // đã cầm lái, và chỉ khi đó tải lại mới ăn bản mới.
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.location.reload(),
      { once: true },
    );
    w.postMessage({ type: "DOI_BAN_MOI" });
  }, []);

  if (!co) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border bg-card p-3 shadow-lg md:left-auto md:right-4 md:mx-0"
    >
      <RefreshCw className="size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-[13px] leading-relaxed">{t("body")}</p>
      <button
        type="button"
        onClick={capNhat}
        className="shrink-0 rounded-md bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
      >
        {t("action")}
      </button>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { WifiOff } from "lucide-react";
import { formatVN } from "@/lib/datetime";

const LAST_ONLINE_KEY = "ifan_last_online_at";

/**
 * Dải báo mất mạng (task #50, PWA bước 2 — thẻ design man-pwa.html nhóm 2).
 *
 * CHỦ ĐÍCH THU HẸP so với thẻ design: chỉ báo trạng thái mạng + mốc "bản lưu
 * lúc mấy giờ" (nhờ service worker phục vụ HTML đã cache — xem public/sw.js).
 * KHÔNG có hàng chờ gửi lại việc làm lúc mất mạng ("2 việc chờ gửi" trong thẻ
 * design) — mục thiết kế xây trước, phần ghi-lúc-mất-mạng cần một lượt riêng
 * để làm đúng (idempotent, không mất/nhân đôi thao tác), ghi rõ còn thiếu chứ
 * không lặng lẽ bỏ qua. Xem docs/SU-THAT-SAN-PHAM.md.
 */
export function OfflineBanner() {
  const t = useTranslations("pwa.offlineBanner");
  const [offline, setOffline] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);
  const [lastOnlineLabel, setLastOnlineLabel] = useState("");
  // Đọc lại được ngay trong closure của addEventListener (không dính giá trị
  // cũ như state — effect chỉ chạy 1 lần lúc mount, đóng state ban đầu mãi mãi).
  const offlineRef = useRef(false);

  useEffect(() => {
    // Component này render được nghĩa là mạng đang sống lúc vào trang — đóng
    // dấu mốc để lần mất mạng kế tiếp biết "bản lưu" là của lúc nào.
    localStorage.setItem(LAST_ONLINE_KEY, String(Date.now()));

    const goOffline = () => {
      const ts = Number(localStorage.getItem(LAST_ONLINE_KEY) ?? Date.now());
      // Giờ đồng hồ dạng 24h cho cả 2 ngôn ngữ — cùng quy ước với today-view.tsx
      // (t("why.dueAt", { time: formatVN(item.at, "HH:mm") })), không rẽ nhánh locale.
      setLastOnlineLabel(formatVN(ts, "HH:mm"));
      offlineRef.current = true;
      setOffline(true);
    };
    const goOnline = () => {
      localStorage.setItem(LAST_ONLINE_KEY, String(Date.now()));
      const wasOffline = offlineRef.current;
      offlineRef.current = false;
      setOffline(false);
      if (wasOffline) {
        setJustReconnected(true);
        setTimeout(() => setJustReconnected(false), 3000);
      }
    };

    if (!navigator.onLine) goOffline();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (offline) {
    return (
      <div className="flex items-center justify-center gap-1.5 bg-muted-foreground px-3 py-1.5 text-center text-xs text-background">
        <WifiOff className="size-3.5 shrink-0" aria-hidden />
        {t("offline", { time: lastOnlineLabel })}
      </div>
    );
  }
  if (justReconnected) {
    return (
      <div className="flex items-center justify-center gap-1.5 bg-status-closed px-3 py-1.5 text-center text-xs text-status-closed-foreground">
        {t("backOnline")}
      </div>
    );
  }
  return null;
}

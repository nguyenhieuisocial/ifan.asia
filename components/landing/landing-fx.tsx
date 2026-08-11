"use client";

import { useEffect } from "react";

/**
 * Hai vi tương tác landing cần JS, đúng nguyên tắc "chỉ THÊM chuyển động lên
 * nội dung ĐÃ hiển thị" (không bao giờ ẩn gì chờ JS):
 * - [data-sparkle]: huy hiệu "Sẵn sàng" lóe sáng MỘT lần khi vào tầm nhìn
 *   (thêm class .sparkle-run, so le nhẹ giữa các huy hiệu cùng khung hình).
 * - [data-countup]: con số trong dải giá trị đếm chạy khi vào tầm nhìn —
 *   khóa min-width theo bản render cuối TRƯỚC khi đếm nên không xê dịch layout.
 * Không render gì; user tắt chuyển động → effect thoát sớm, trang tĩnh.
 */
export function LandingFx() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const sparkleIo = new IntersectionObserver(
      (entries) => {
        let order = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.style.setProperty("--sp-d", `${order * 110}ms`);
          el.classList.add("sparkle-run");
          sparkleIo.unobserve(el);
          order += 1;
        }
      },
      { threshold: 0.6 },
    );
    document
      .querySelectorAll("[data-sparkle]")
      .forEach((el) => sparkleIo.observe(el));

    function runCount(el: HTMLElement) {
      const final = el.textContent ?? "";
      const match = final.match(/\d[\d.,]*/);
      if (!match) return;
      const value = Number(match[0].replace(/\D/g, ""));
      if (!value) return; // 0đ đứng yên
      // Giữ đúng dấu phần nghìn của bản gốc (vi: "." — en: ",")
      const sep = match[0].includes(".") ? "." : match[0].includes(",") ? "," : "";
      const fmt = (n: number) =>
        sep
          ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep)
          : String(n);
      // Khóa bề rộng theo con số cuối để số ngắn lúc đếm không làm chữ xô đẩy
      el.style.display = "inline-block";
      el.style.minWidth = `${el.offsetWidth}px`;
      const t0 = performance.now();
      const dur = 900;
      const tick = (now: number) => {
        const p = Math.min((now - t0) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = final.replace(match[0], fmt(Math.round(value * eased)));
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = final;
      };
      requestAnimationFrame(tick);
    }

    const countIo = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          countIo.unobserve(entry.target);
          runCount(entry.target as HTMLElement);
        }
      },
      { threshold: 0.5 },
    );
    document
      .querySelectorAll<HTMLElement>("[data-countup]")
      .forEach((el) => countIo.observe(el));

    return () => {
      sparkleIo.disconnect();
      countIo.disconnect();
    };
  }, []);

  return null;
}

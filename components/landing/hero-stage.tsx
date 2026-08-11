"use client";

import { useEffect, useRef } from "react";

/**
 * Nghiêng 3D nhẹ khung app hero theo con trỏ (chỉ đạo 6b). Client mỏng: nội
 * dung con vẫn render server (LCP ảnh hero không đổi), JS chỉ đặt transform
 * lên phần tử [data-tilt] bên trong.
 *
 * Kỷ luật: chỉ chạy khi có chuột thật (hover:hover + pointer:fine) và user
 * không tắt chuyển động — mobile/reduced-motion đứng tĩnh, không lắng nghe gì.
 * rAF + lerp cho mượt; vòng lặp tự dừng khi đã về đích (không rAF chạy rỗng);
 * chỉ transform → không CLS.
 */
export function HeroStage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = ref.current;
    if (!stage) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches)
      return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = stage.querySelector<HTMLElement>("[data-tilt]");
    if (!target) return;

    let raf = 0;
    // Góc hiện tại (c*) đuổi theo góc đích (t*) — đơn vị độ
    let cx = 0;
    let cy = 0;
    let tx = 0;
    let ty = 0;

    const render = () => {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      if (Math.abs(tx - cx) < 0.02 && Math.abs(ty - cy) < 0.02) {
        cx = tx;
        cy = ty;
        raf = 0;
      } else {
        raf = requestAnimationFrame(render);
      }
      target.style.transform = `perspective(1100px) rotateX(${cy.toFixed(2)}deg) rotateY(${cx.toFixed(2)}deg)`;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(render);
    };

    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      tx = nx * 7; // rotateY tối đa ±3.5°
      ty = ny * -6; // rotateX tối đa ±3° (ngược chiều cho cảm giác tự nhiên)
      kick();
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
      kick();
    };

    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
      target.style.transform = "";
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

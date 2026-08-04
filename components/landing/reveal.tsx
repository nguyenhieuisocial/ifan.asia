"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Hiệu ứng vào nhẹ (fade + rise) cho landing: IntersectionObserver thêm class
 * khi phần tử vào khung nhìn. CSS ở globals.css nằm trong media
 * prefers-reduced-motion: no-preference → user tắt chuyển động thì hiện luôn.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("reveal-visible");
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -32px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("reveal", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

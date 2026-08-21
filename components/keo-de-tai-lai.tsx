"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * KÉO XUỐNG ĐỂ TẢI LẠI (thẻ design `man-thao-tac-kieu-app.html`).
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CẦN — ĐO ĐƯỢC 22/08
 * ═══════════════════════════════════════════════════════════════════
 * Nhân viên tiệm dùng iFan trên điện thoại cả ngày, và phần lớn đã cài lên màn
 * hình chính (iFan có lời mời cài sẵn). Ở dạng ĐÃ CÀI thì trình duyệt không còn
 * thanh địa chỉ, không còn nút tải lại — muốn xem có lịch mới chưa thì phải bấm
 * sang màn khác rồi bấm quay lại.
 *
 * ⚠️ MỘT BẢN DUY NHẤT Ở KHUNG, KHÔNG GẮN VÀO TỪNG MÀN. Mỗi màn có lớp cuộn
 *   riêng (`overflow-y-auto` nằm trong từng màn, `<main>` thì `overflow-hidden`),
 *   nên gắn tay vào từng màn là 40 chỗ phải nhớ, và chỗ nào quên thì người dùng
 *   thấy iFan "lúc có lúc không". Bản này nghe ở gốc trang rồi TỰ TÌM lớp cuộn
 *   gần nhất của chỗ ngón tay chạm.
 *
 * ⚠️ CHỈ KÉO ĐƯỢC KHI LỚP CUỘN ĐANG Ở TRÊN CÙNG. Đang cuộn giữa danh sách mà
 *   kéo xuống thì đó là CUỘN, không phải yêu cầu tải lại. Nhầm chỗ này là mỗi
 *   lần người ta cuộn lên xem lại là màn tự tải lại — phiền tới mức người dùng
 *   sẽ tránh cuộn.
 *
 * ⚠️ ĐANG MỞ HỘP THOẠI THÌ TẮT HẲN. Đang điền form đặt lịch mà lỡ kéo rồi màn
 *   tải lại là mất trắng những gì vừa gõ. Đây là chỗ một thao tác tiện biến
 *   thành một thao tác phá.
 *
 * ⚠️ CHỈ CẢM ỨNG, KHÔNG CHUỘT. Máy tính có nút và có phím tắt; thêm cử chỉ vào
 *   đó chỉ tạo ra chuyện lạ khi ai đó dùng màn hình cảm ứng.
 */

/** Kéo quá ngần này (px) thì buông tay là tải lại. */
const NGUONG = 72;
/** Kéo tối đa — kéo nữa cũng không nhích thêm, để người ta biết đã tới hạn. */
const TOI_DA = 110;
/** Ngón tay phải đi xuống rõ hơn đi ngang bằng ngần này lần, nếu không thì bỏ qua. */
const DOC_HON_NGANG = 1.5;

function lopCuonGanNhat(el: Element | null): HTMLElement | null {
  let n: Element | null = el;
  while (n && n !== document.body) {
    if (n instanceof HTMLElement) {
      const s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return n;
    }
    n = n.parentElement;
  }
  return null;
}

export function KeoDeTaiLai() {
  const t = useTranslations("common.pull");
  const router = useRouter();
  const [keo, datKeo] = useState(0);
  const [dangTai, datDangTai] = useState(false);
  // Dùng ref cho phần đọc trong bộ nghe: bộ nghe gắn MỘT lần, đọc state qua
  // closure sẽ luôn thấy giá trị cũ.
  const batDau = useRef<{ x: number; y: number; lop: HTMLElement | null } | null>(null);
  const dangTaiRef = useRef(false);
  /**
   * Quãng kéo mới nhất, cho bộ nghe đọc lúc buông tay.
   *
   * ⚠️ CHỈ GHI TRONG BỘ NGHE, KHÔNG GHI LÚC RENDER. Ghi lúc render thì React
   *   báo "Cannot update ref during render" — và lời báo đó đúng: lúc render có
   *   thể bị bỏ dở và chạy lại, nên giá trị ghi vào ref không đáng tin.
   */
  const keoRef = useRef(0);

  useEffect(() => {
    const batDauCham = (e: TouchEvent) => {
      if (dangTaiRef.current) return;
      // Đang mở hộp thoại ⇒ không nhận cử chỉ nào.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      if (e.touches.length !== 1) return;
      const c = e.touches[0];
      const lop = lopCuonGanNhat(document.elementFromPoint(c.clientX, c.clientY));
      // Không có lớp cuộn nào (màn ngắn) vẫn cho kéo — vẫn là một màn cần tải lại.
      if (lop && lop.scrollTop > 0) return;
      batDau.current = { x: c.clientX, y: c.clientY, lop };
    };

    const dangCham = (e: TouchEvent) => {
      const b = batDau.current;
      if (!b || dangTaiRef.current) return;
      const c = e.touches[0];
      const dy = c.clientY - b.y;
      const dx = Math.abs(c.clientX - b.x);
      if (dy <= 0) {
        // Đổi chiều thành kéo lên ⇒ đây là cuộn, bỏ cử chỉ.
        batDau.current = null;
        keoRef.current = 0;
        datKeo(0);
        return;
      }
      if (dy < dx * DOC_HON_NGANG) return;
      // Lớp cuộn nhích khỏi đỉnh giữa chừng ⇒ người dùng đang cuộn thật.
      if (b.lop && b.lop.scrollTop > 0) {
        batDau.current = null;
        keoRef.current = 0;
        datKeo(0);
        return;
      }
      // Kéo chậm dần: nửa quãng đường ngón tay, chặn ở TOI_DA.
      const q = Math.min(TOI_DA, dy / 2);
      keoRef.current = q;
      datKeo(q);
    };

    const hetCham = () => {
      const daKeo = keoRef.current;
      batDau.current = null;
      if (daKeo >= NGUONG && !dangTaiRef.current) {
        dangTaiRef.current = true;
        datDangTai(true);
        keoRef.current = NGUONG;
        datKeo(NGUONG);
        router.refresh();
        // `router.refresh()` không báo lúc xong. Giữ vòng quay một nhịp ngắn
        // rồi thu lại — kéo dài hơn thì người dùng tưởng treo, ngắn hơn thì họ
        // không kịp thấy là đã có chuyện xảy ra.
        setTimeout(() => {
          dangTaiRef.current = false;
          datDangTai(false);
          keoRef.current = 0;
          datKeo(0);
        }, 900);
      } else {
        keoRef.current = 0;
        datKeo(0);
      }
    };

    document.addEventListener("touchstart", batDauCham, { passive: true });
    document.addEventListener("touchmove", dangCham, { passive: true });
    document.addEventListener("touchend", hetCham, { passive: true });
    document.addEventListener("touchcancel", hetCham, { passive: true });
    return () => {
      document.removeEventListener("touchstart", batDauCham);
      document.removeEventListener("touchmove", dangCham);
      document.removeEventListener("touchend", hetCham);
      document.removeEventListener("touchcancel", hetCham);
    };
  }, [router]);

  if (keo === 0 && !dangTai) return null;

  const du = keo >= NGUONG;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center sm:hidden"
      style={{ transform: `translateY(${Math.max(8, keo - 20)}px)` }}
    >
      <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm">
        <RefreshCw
          className={cn("size-3.5", dangTai && "animate-spin", du && !dangTai && "text-primary")}
          style={!dangTai ? { transform: `rotate(${keo * 3}deg)` } : undefined}
        />
        {dangTai ? t("dangTai") : du ? t("thaRa") : t("keoXuong")}
      </div>
    </div>
  );
}

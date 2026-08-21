"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bell, BellOff, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VAPID_CONG_KHAI } from "@/lib/push/khoa";
import {
  guiThuDay,
  luuDangKyDay,
  mayChuSanSangDay,
  xoaDangKyDay,
} from "@/app/app/settings/notifications/push-actions";

/**
 * BẬT / TẮT THÔNG BÁO ĐẨY trên chính thiết bị này.
 *
 * Hôm nay chuông của ứng dụng chỉ kêu khi người ta ĐANG MỞ ứng dụng. Lễ tân
 * đóng tab đi làm việc khác thì mọi lời nhắc nằm im tới lần mở sau — tức là
 * mảng thông báo hiện có chỉ phục vụ người vốn đã đang nhìn màn hình.
 *
 * ⚠️ SÁU TÌNH HUỐNG, và mỗi cái phải nói MỘT CÂU KHÁC NHAU. Gộp chúng thành
 *   một câu "không bật được" là đẩy người dùng vào chỗ không biết làm gì tiếp:
 *     1. trình duyệt không hỗ trợ           → nói rõ, gợi ý trình duyệt khác
 *     2. iPhone CHƯA cài lên màn hình chính → Apple bắt buộc, chỉ 3 bước cài
 *     3. máy chủ chưa khai khoá             → lỗi của bên mình, không phải họ
 *     4. người dùng đã TỪ CHỐI trước đó     → không hỏi lại được, phải chỉ chỗ
 *                                             bật lại trong cài đặt trình duyệt
 *     5. chưa bật                           → nút bật
 *     6. đang bật                           → nút tắt
 */

type TinhTrang =
  | "dangDo"
  | "khongHoTro"
  | "iosChuaCai"
  | "mayChuChuaSan"
  | "daTuChoi"
  | "chuaBat"
  | "dangBat";

/** Khoá công khai dạng chuỗi → mảng byte, khuôn mà trình duyệt đòi. */
function khoaSangByte(chuoi: string): Uint8Array<ArrayBuffer> {
  const dem = "=".repeat((4 - (chuoi.length % 4)) % 4);
  const b64 = (chuoi + dem).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  // Cấp phát bộ đệm TƯỜNG MINH: `new Uint8Array(n)` mang kiểu `ArrayBufferLike`
  // còn trình duyệt đòi đúng `ArrayBuffer`. Khai rõ ở đây thay vì ép kiểu ở
  // chỗ dùng — ép kiểu là giấu đi việc mình chưa chắc.
  const bo = new ArrayBuffer(raw.length);
  const ra = new Uint8Array(bo);
  for (let i = 0; i < raw.length; i++) ra[i] = raw.charCodeAt(i);
  return ra;
}

function laIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

function daCaiLenManHinhChinh(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Dò tình trạng THẬT của thiết bị này. Hàm thuần đọc, đặt NGOÀI component và
 * không đụng trạng thái React.
 */
async function doTinhTrang(): Promise<TinhTrang> {
  if (typeof window === "undefined") return "dangDo";

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    // ⚠️ Trên iPhone chưa cài lên màn hình chính thì `PushManager` KHÔNG tồn
    //   tại — Apple chỉ mở nó cho ứng dụng đã cài. Phải phân biệt với "trình
    //   duyệt không hỗ trợ", vì cách xử lý khác hẳn nhau.
    return laIOS() && !daCaiLenManHinhChinh() ? "iosChuaCai" : "khongHoTro";
  }

  const { sanSang } = await mayChuSanSangDay();
  if (!sanSang) return "mayChuChuaSan";
  if (Notification.permission === "denied") return "daTuChoi";

  const dk = await navigator.serviceWorker.ready;
  const dangKy = await dk.pushManager.getSubscription();
  if (!dangKy) return "chuaBat";

  // ⚠️ ĐỒNG BỘ LẠI MỖI LẦN DÒ. Quầy lễ tân là máy dùng chung: chị A bật thông
  //   báo rồi đăng xuất, chị B đăng nhập — nếu không ghi đè chủ sở hữu thì chị
  //   B nhận thông báo RIÊNG của chị A trên đúng máy đó, gồm cả tin nhắn riêng.
  const j = dangKy.toJSON();
  if (j.keys?.p256dh && j.keys?.auth) {
    await luuDangKyDay({
      endpoint: dangKy.endpoint,
      p256dh: j.keys.p256dh,
      auth: j.keys.auth,
      ua: navigator.userAgent.slice(0, 300),
    });
  }
  return "dangBat";
}

export function PushToggle() {
  const t = useTranslations("pwa.push");
  const [dangLam, datDangLam] = useState(false);

  /**
   * Dò bằng `useQuery` chứ KHÔNG bằng `useEffect` + `setState`.
   *
   * Đây là một phép ĐỌC trạng thái bên ngoài (quyền của trình duyệt, đăng ký
   * hiện có, khoá của máy chủ) — đúng thứ `useQuery` sinh ra để làm, và là
   * khuôn kho này vẫn dùng ở mọi chỗ khác. Bản đầu viết bằng effect và luật
   * `react-hooks/set-state-in-effect` chặn đúng: đọc xong rồi setState trong
   * effect là hai lượt dựng nối nhau.
   */
  const q = useQuery({
    queryKey: ["push-tinh-trang"],
    queryFn: doTinhTrang,
    // Quyền thông báo đổi được ở cài đặt trình duyệt mà không báo cho trang
    // biết — dò lại mỗi lần người ta quay lại tab.
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const tinhTrang: TinhTrang = q.data ?? "dangDo";

  async function bat() {
    datDangLam(true);
    try {
      const quyen = await Notification.requestPermission();
      if (quyen !== "granted") {
        await q.refetch();
        return;
      }
      const dk = await navigator.serviceWorker.ready;
      const dangKy = await dk.pushManager.subscribe({
        // Bắt buộc `true`: cam kết mỗi lần đẩy đều hiện một thông báo cho người
        // dùng thấy. Trình duyệt từ chối đăng ký nếu không cam kết.
        userVisibleOnly: true,
        applicationServerKey: khoaSangByte(VAPID_CONG_KHAI),
      });
      const j = dangKy.toJSON();
      if (!j.keys?.p256dh || !j.keys?.auth) throw new Error("thieu_khoa");

      const res = await luuDangKyDay({
        endpoint: dangKy.endpoint,
        p256dh: j.keys.p256dh,
        auth: j.keys.auth,
        ua: navigator.userAgent.slice(0, 300),
      });
      if (res.error) throw new Error(res.error);

      await q.refetch();
      toast.success(t("turnedOn"));
    } catch {
      toast.error(t("failed"));
      await q.refetch();
    } finally {
      datDangLam(false);
    }
  }

  async function guiThu() {
    datDangLam(true);
    try {
      const res = await guiThuDay();
      if (res.error === "noDevice") toast.error(t("testNoDevice"));
      else if (res.error === "serverNotReady") toast.error(t("serverNotReady"));
      else if (res.error) toast.error(t("testFailed", { count: res.soThietBi }));
      else toast.success(t("testSent", { count: res.daGui }));
    } finally {
      datDangLam(false);
    }
  }

  async function tat() {
    datDangLam(true);
    try {
      const dk = await navigator.serviceWorker.ready;
      const dangKy = await dk.pushManager.getSubscription();
      if (dangKy) {
        // Xoá ở MÁY CHỦ TRƯỚC. Ngược lại thì nếu bước sau hỏng, máy chủ vẫn
        // gửi tới một đăng ký đã bị huỷ ở trình duyệt — gửi vào hư không mãi.
        await xoaDangKyDay({ endpoint: dangKy.endpoint });
        await dangKy.unsubscribe();
      }
      await q.refetch();
      toast.success(t("turnedOff"));
    } catch {
      toast.error(t("failed"));
      await q.refetch();
    } finally {
      datDangLam(false);
    }
  }

  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          {tinhTrang === "dangBat" ? (
            <Bell className="size-4 text-primary" />
          ) : (
            <BellOff className="size-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold">{t("title")}</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            {t("subtitle")}
          </p>

          <div className="mt-3">
            {tinhTrang === "dangDo" && (
              <p className="text-[12px] text-muted-foreground">{t("checking")}</p>
            )}

            {tinhTrang === "khongHoTro" && (
              <p className="text-[12px] text-muted-foreground">{t("unsupported")}</p>
            )}

            {tinhTrang === "iosChuaCai" && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-900 dark:bg-amber-950/40">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-900 dark:text-amber-200">
                  <Smartphone className="size-3.5" />
                  {t("iosTitle")}
                </p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[12px] leading-relaxed text-amber-900/90 dark:text-amber-200/90">
                  <li>{t("iosStep1")}</li>
                  <li>{t("iosStep2")}</li>
                  <li>{t("iosStep3")}</li>
                </ol>
              </div>
            )}

            {tinhTrang === "mayChuChuaSan" && (
              <p className="rounded-md border border-dashed p-2.5 text-[12px] leading-relaxed text-muted-foreground">
                {t("serverNotReady")}
              </p>
            )}

            {tinhTrang === "daTuChoi" && (
              <p className="rounded-md border border-dashed p-2.5 text-[12px] leading-relaxed text-muted-foreground">
                {t("blocked")}
              </p>
            )}

            {tinhTrang === "chuaBat" && (
              <Button size="sm" onClick={bat} disabled={dangLam} className="gap-1.5">
                <Bell className="size-4" />
                {t("turnOn")}
              </Button>
            )}

            {tinhTrang === "dangBat" && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2 py-1 text-[12px] font-medium text-primary">
                  {t("on")}
                </span>
                {/* ⚠️ Nút GỬI THỬ không phải cho vui: ba khâu cuối của đường
                    đẩy (máy chủ ký · dịch vụ của Google/Apple nhận · máy hiện
                    ra) không kiểm được từ máy người lập trình — hồ sơ trình
                    duyệt tự động không đăng ký được với dịch vụ đẩy. Đây là
                    cách duy nhất để biết cả đường có thông suốt hay không. */}
                <Button size="sm" variant="outline" onClick={guiThu} disabled={dangLam}>
                  {t("sendTest")}
                </Button>
                <Button size="sm" variant="outline" onClick={tat} disabled={dangLam}>
                  {t("turnOff")}
                </Button>
              </div>
            )}
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {t("perDevice")}
          </p>
        </div>
      </div>
    </section>
  );
}

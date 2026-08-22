"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Camera, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatVN } from "@/lib/datetime";
import { layDiaChiTuToaDo } from "./actions";
import { tinhDauMat } from "./face-utils";

type Coords = { lat: number; lng: number } | null;

/**
 * #219 — chụp selfie chấm công, TỰ CHÈN CHỮ lên ảnh (yêu cầu founder): tên
 * tiệm + thời gian + ĐỊA CHỈ. Vẽ chữ thẳng lên pixel bằng canvas rồi upload ảnh
 * đã-chèn vào bucket tenant-files ({tenant}/attendance/…). Trả ĐƯỜNG DẪN về cha
 * để gửi kèm khi chấm.
 *
 * ⚠️ Địa chỉ đổi từ toạ độ GPS qua dịch vụ MIỄN PHÍ (OpenStreetMap, gọi ở máy
 * chủ) — thường ra tới tên đường/phường, ÍT khi có số nhà. Lấy được thì ghi
 * địa chỉ; không thì ghi "chưa lấy được vị trí" và chấm công vẫn chạy.
 *
 * ⚠️ getUserMedia cần HTTPS + quyền camera — chỉ chạy trên máy thật; đây là
 * phần duy nhất phải test trên điện thoại.
 */
export function SelfieCapture({
  tenantId,
  employeeId,
  businessName,
  coords,
  onCaptured,
  onCleared,
  onFaceDescriptor,
}: {
  tenantId: string;
  /**
   * Ảnh này là ảnh CỦA AI — không phải ai bấm nút.
   *
   * ⚠️ Ở luồng "chấm công giúp", người bấm là đồng nghiệp còn mặt trong ảnh là
   *   người được chấm. Đường dẫn phải mang mã NGƯỜI ĐƯỢC CHẤM, nếu không chính
   *   họ lại không xem được ảnh của mình (chính sách đọc kho ảnh #363 soi mã này).
   */
  employeeId: string;
  businessName: string;
  coords: Coords;
  onCaptured: (path: string, contentType: string) => void;
  onCleared: () => void;
  /** #225 — nếu có: tính "dấu mặt" từ khung vừa chụp (chấm giúp). Null = không thấy mặt rõ. */
  onFaceDescriptor?: (descriptor: number[] | null) => void;
}) {
  const t = useTranslations("hr.selfie");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<"idle" | "live" | "uploading" | "done">("idle");
  const [preview, setPreview] = useState<string | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  };
  // Tắt camera khi rời màn — không để đèn camera sáng mãi.
  useEffect(() => () => stopStream(), []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      // CHỈ đổi trạng thái ở đây. Việc gắn luồng vào thẻ <video> nằm ở effect
      // ngay dưới — lý do ở đó.
      setPhase("live");
    } catch {
      toast.error(t("cameraDenied"));
    }
  }

  /**
   * GẮN LUỒNG CAMERA VÀO THẺ <video> SAU KHI THẺ ĐÃ CÓ TRONG DOM.
   *
   * ⚠️ LỖI CÓ THẬT, đo được 22/08 và là mắt xích thứ HAI làm tính năng này chưa
   *   từng chạy được lần nào (mắt thứ nhất là `Permissions-Policy: camera=()`).
   *
   *   Bản trước gắn `srcObject` NGAY TRONG `startCamera()`. Nhưng thẻ <video>
   *   chỉ được dựng khi `phase === "live"`, mà lúc đó `setPhase("live")` còn
   *   chưa chạy ⇒ `videoRef.current` là `null` ⇒ nhánh `if (videoRef.current)`
   *   im lặng bỏ qua, và luồng KHÔNG BAO GIỜ được gắn.
   *
   *   Hậu quả nhìn thấy: đèn camera sáng (đã xin được luồng), khung xem trước
   *   đen thui, bấm "Chụp" thì KHÔNG CÓ GÌ XẢY RA — vì `capture()` thoát ngay ở
   *   `if (!video || !video.videoWidth) return;`. Đo trên bản dựng thật:
   *   `srcObject = null`, `videoWidth = 0`, `readyState = 0`.
   *
   *   Không có gì kêu lên: `if` không có nhánh `else`, và không lỗi nào bị ném.
   *   Đây đúng loại hỏng mà mắt đọc mã lướt qua được — nên nó phải có cổng canh
   *   (`scripts/anh-cham-cong-smoke.mjs`), không chỉ có bản vá.
   */
  useEffect(() => {
    if (phase !== "live") return;
    const v = videoRef.current;
    const s = streamRef.current;
    if (!v || !s) return;
    v.srcObject = s;
    // `play()` bị trình duyệt từ chối là chuyện có thể xảy ra (đổi tab giữa
    // chừng chẳng hạn) — nuốt lỗi ở đây là đúng: người dùng bấm "Chụp lại" là
    // xong, không cần một thông báo lỗi cho việc đó.
    void v.play().catch(() => {});
  }, [phase]);

  /**
   * Founder chốt bố cục: KHÔNG NỀN, sát mép. Tên shop ở mép TRÊN, vị trí ở góc
   * TRÁI-DƯỚI, thời gian ở góc PHẢI-DƯỚI. Chữ trắng + viền tối để đọc được trên
   * mọi ảnh mà không cần hộp nền che mất ảnh.
   */
  function drawWatermark(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    parts: { shop: string; place: string; time: string },
  ) {
    const fontPx = Math.max(13, Math.round(w / 34));
    const margin = Math.round(fontPx * 0.85);
    ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
    ctx.lineWidth = Math.max(2, Math.round(fontPx / 6));
    ctx.strokeStyle = "rgba(0,0,0,0.62)";
    ctx.lineJoin = "round";
    ctx.fillStyle = "#ffffff";
    const ve = (text: string, x: number, y: number, align: CanvasTextAlign, baseline: CanvasTextBaseline) => {
      if (!text.trim()) return;
      ctx.textAlign = align;
      ctx.textBaseline = baseline;
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
    };
    /**
     * CẮT CHỮ CHO VỪA CHỖ — canvas KHÔNG tự xuống dòng và cũng không tự cắt.
     *
     * ⚠️ LỖI CÓ THẬT, thấy trên tấm ảnh đầu tiên chụp được (22/08, ngay sau khi
     *   luồng chạy được lần đầu): địa chỉ ở góc TRÁI-DƯỚI dài quá nửa ảnh nên
     *   chạy đè lên giờ ở góc PHẢI-DƯỚI. Ảnh mẫu đọc ra
     *   *"…Thành phố Hồ Chí19:13:41 22/8/2026"* — hai dòng chồng nhau, và cái bị
     *   che là GIỜ, tức thứ quan trọng nhất trên một tấm ảnh dùng để đối chất.
     *   Địa chỉ Việt Nam rất hay dài cỡ này ("số nhà, đường, phường, thành phố"),
     *   nên đây là trường hợp THƯỜNG chứ không phải hiếm.
     *
     * ⚠️ CẮT ĐỊA CHỈ, KHÔNG CẮT GIỜ: giờ ngắn, cố định, và không có nó thì tấm
     *   ảnh mất giá trị. Địa chỉ mất mấy chữ cuối (thường là tên thành phố) vẫn
     *   đủ để biết chỗ nào.
     */
    const catVua = (text: string, rongToiDa: number) => {
      if (rongToiDa <= 0) return "";
      if (ctx.measureText(text).width <= rongToiDa) return text;
      let s = text;
      while (s.length > 1 && ctx.measureText(s + "…").width > rongToiDa) s = s.slice(0, -1);
      return s + "…";
    };
    const rongGio = ctx.measureText(parts.time).width;
    ve(catVua(parts.shop, w - margin * 2), margin, margin, "left", "top"); // tên shop — mép trên
    // Chừa thêm một khoảng bằng cỡ chữ giữa địa chỉ và giờ, để hai dòng không
    // dính sát vào nhau khi địa chỉ vừa đúng bằng chỗ trống.
    ve(catVua(parts.place, w - margin * 2 - rongGio - fontPx), margin, h - margin, "left", "alphabetic"); // vị trí — trái-dưới
    ve(parts.time, w - margin, h - margin, "right", "alphabetic"); // giờ — phải-dưới
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    /**
     * THU ẢNH XUỐNG TRƯỚC KHI LƯU — cạnh dài tối đa 720px.
     *
     * ⚠️ Trước đây chụp ở ĐỘ PHÂN GIẢI GỐC của camera. Điện thoại nay quay
     *   1920×1080 trở lên, nên mỗi ảnh nặng cỡ nửa megabyte. Đo 22/08: đã có
     *   15.673 lượt chấm công; bật ảnh cho toàn hệ thống ở cỡ đó thì kho phồng
     *   khoảng nửa gigabyte mỗi tháng, mà gói lưu trữ đang dùng chỉ có một
     *   gigabyte — tức khoảng hai tháng là phải trả thêm tiền.
     *
     * ⚠️ 720px là đủ cho MỤC ĐÍCH THẬT của tấm ảnh: nhìn mặt để biết đúng người,
     *   và đọc chữ đóng dấu vị trí + giờ. Không phải để phóng to soi chi tiết.
     *   Chữ đóng dấu tự co theo chiều rộng (`w / 34`) nên vẫn cân đối.
     *
     * ⚠️ Ảnh nhỏ cũng gửi nhanh hơn — nhân viên chấm công ở tiệm thường dùng
     *   mạng di động, và lượt chấm nào cũng phải chờ tải xong.
     */
    const CANH_DAI_TOI_DA = 720;
    const tyLe = Math.min(1, CANH_DAI_TOI_DA / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * tyLe);
    const h = Math.round(video.videoHeight * tyLe);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // ĐÓNG BĂNG khoảnh khắc TRƯỚC khi đợi tra địa chỉ — không thì ảnh chụp lại
    // là khung vài giây sau. Giờ cũng chốt tại đây.
    ctx.drawImage(video, 0, 0, w, h);
    const luc = new Date().toLocaleString("vi-VN");
    stopStream();
    // Hiện ảnh THÔ ngay để người dùng thấy đã chụp, rồi mới chèn chữ khi có địa chỉ.
    setPreview(canvas.toDataURL("image/jpeg", 0.8));

    // #225 — chấm giúp: tính "dấu mặt" từ khung THÔ (trước khi chèn chữ, mặt sạch).
    // Không thấy mặt rõ → null (không chấm điểm khớp, chấm giúp vẫn chạy).
    if (onFaceDescriptor) {
      onFaceDescriptor(await tinhDauMat(canvas));
    }
    setPhase("uploading");

    // Đổi toạ độ → địa chỉ (máy chủ, miễn phí). Hỏng/không có toạ độ ⇒ ghi
    // "chưa lấy được vị trí"; chấm công KHÔNG phụ thuộc bước này.
    let viTri = t("noGps");
    if (coords) {
      const kq = await layDiaChiTuToaDo({ lat: coords.lat, lng: coords.lng });
      if (kq.address) viTri = kq.address;
    }
    drawWatermark(ctx, w, h, { shop: businessName, place: viTri, time: luc });
    setPreview(canvas.toDataURL("image/jpeg", 0.8));

    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.8));
    if (!blob) {
      toast.error(t("uploadFailed"));
      setPhase("idle");
      return;
    }
    // Ngày theo GIỜ VIỆT NAM, không phải giờ quốc tế: máy chạy ở UTC nên
    // toISOString() trả HÔM QUA suốt khung 00:00–06:59 sáng giờ VN. Nhân viên
    // chấm công 6h30 sáng sẽ có ảnh nằm trong thư mục ngày hôm trước — không
    // sai bảng công, nhưng ai đi tra ảnh theo ngày sẽ không tìm thấy.
    const day = formatVN(new Date(), "yyyy-MM-dd");
    // ⚠️ MÃ NHÂN VIÊN nằm ở đoạn thứ ba của đường dẫn — chính sách đọc kho ảnh
    //   (#363) soi đúng đoạn đó để chỉ cho chính người ấy và quản lý trở lên xem.
    //   ĐỔI THỨ TỰ ĐOẠN NÀY LÀ THÁO CHỐT, và tháo im lặng: ảnh vẫn tải lên bình
    //   thường, chỉ là ai trong tiệm cũng xem được ảnh của nhau.
    //
    //   Vì sao cần: kho ảnh cho LIỆT KÊ thư mục, nên mã ngẫu nhiên ở cuối tên
    //   tệp không bảo vệ được gì — người ta không phải đoán, chỉ cần liệt kê.
    const path = `${tenantId}/attendance/${employeeId}/${day}/${crypto.randomUUID()}.jpg`;
    const supabase = createClient();
    const { error } = await supabase.storage.from("tenant-files").upload(path, blob, {
      contentType: "image/jpeg",
      upsert: false,
    });
    if (error) {
      toast.error(t("uploadFailed"));
      setPhase("idle");
      return;
    }
    onCaptured(path, "image/jpeg");
    setPhase("done");
  }

  function retake() {
    setPreview(null);
    onCleared();
    void startCamera();
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed p-2.5">
      <p className="text-[12px] font-medium">{t("title")}</p>

      {phase === "idle" && (
        <Button type="button" variant="outline" size="sm" onClick={startCamera}>
          <Camera className="mr-1 size-3.5" />
          {t("open")}
        </Button>
      )}

      {phase === "live" && (
        <div className="space-y-2">
          {/* Tỉ lệ dọc cố định (selfie, camera trước) — giữ chỗ sẵn để khung
              không nhảy layout lúc camera bật và luồng ảnh về. */}
          <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full rounded-md bg-black object-cover" />
          <Button type="button" size="sm" onClick={capture}>
            <Camera className="mr-1 size-3.5" />
            {t("capture")}
          </Button>
        </div>
      )}

      {(phase === "uploading" || phase === "done") && preview && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="w-full rounded-md" />
          <div className="flex items-center gap-2">
            {phase === "done" ? (
              <span className="flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400">
                <Check className="size-3.5" />
                {t("done")}
              </span>
            ) : (
              <span className="text-[12px] text-muted-foreground">{t("uploading")}</span>
            )}
            <Button type="button" variant="outline" size="sm" onClick={retake} disabled={phase === "uploading"}>
              <RotateCcw className="mr-1 size-3.5" />
              {t("retake")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

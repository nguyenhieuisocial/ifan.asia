"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Camera, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { layDiaChiTuToaDo } from "./actions";

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
  businessName,
  coords,
  onCaptured,
  onCleared,
}: {
  tenantId: string;
  businessName: string;
  coords: Coords;
  onCaptured: (path: string, contentType: string) => void;
  onCleared: () => void;
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
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhase("live");
    } catch {
      toast.error(t("cameraDenied"));
    }
  }

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
    ve(parts.shop, margin, margin, "left", "top"); // tên shop — mép trên
    ve(parts.place, margin, h - margin, "left", "alphabetic"); // vị trí — trái-dưới
    ve(parts.time, w - margin, h - margin, "right", "alphabetic"); // giờ — phải-dưới
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
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
    const day = new Date().toISOString().slice(0, 10);
    const path = `${tenantId}/attendance/${day}/${crypto.randomUUID()}.jpg`;
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

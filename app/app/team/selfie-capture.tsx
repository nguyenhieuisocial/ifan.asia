"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Camera, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Coords = { lat: number; lng: number } | null;

/**
 * #219 — chụp selfie chấm công, TỰ CHÈN CHỮ lên ảnh (yêu cầu founder): tên
 * tiệm + thời gian + toạ độ GPS. Vẽ chữ thẳng lên pixel bằng canvas rồi upload
 * ảnh đã-chèn vào bucket tenant-files ({tenant}/attendance/…). Trả ĐƯỜNG DẪN về
 * cha để gửi kèm khi chấm.
 *
 * ⚠️ Toạ độ ghi là GPS (số), KHÔNG phải địa chỉ đường phố — app không có dịch
 * ngược toạ độ→địa chỉ, nói thẳng để không hứa cái không làm được.
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

  function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, lines: string[]) {
    const fontPx = Math.max(14, Math.round(w / 32));
    const pad = Math.round(fontPx * 0.6);
    const lineH = Math.round(fontPx * 1.35);
    const boxH = lineH * lines.length + pad * 2;
    // Nền tối mờ để chữ đọc được trên mọi ảnh.
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, h - boxH, w, boxH);
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
    ctx.textBaseline = "top";
    lines.forEach((ln, i) => ctx.fillText(ln, pad, h - boxH + pad + i * lineH));
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
    ctx.drawImage(video, 0, 0, w, h);
    drawWatermark(ctx, w, h, [
      businessName,
      new Date().toLocaleString("vi-VN"),
      coords ? `GPS ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : t("noGps"),
    ]);
    stopStream();
    setPreview(canvas.toDataURL("image/jpeg", 0.8));
    setPhase("uploading");

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
          <video ref={videoRef} playsInline muted className="w-full rounded-md bg-black" />
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

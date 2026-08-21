"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Mic, Square } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { MAX_CO_TEP, MAX_TEP_MOI_TIN, coDocDuoc, type TepDinhKem } from "./tep-dinh-kem";

/**
 * GHI ÂM MỘT LỜI NHẮN NGẮN.
 *
 * Ở tiệm, thợ đang làm cho khách thì tay ướt hoặc đeo găng — gõ chữ là không
 * gõ được. Một câu nói mười giây ("chị ơi phòng 2 hết dầu argan") nhanh hơn và
 * chính xác hơn hẳn việc lát nữa nhớ ra rồi nhắn.
 *
 * ⚠️ CÓ TRẦN THỜI GIAN, và dừng CỨNG khi hết. Một lời nhắn thoại năm phút thì
 *   không ai nghe, và nó phá luôn cái lợi của việc nhắn nhanh. Hai phút là đủ
 *   dài cho mọi việc ở tiệm.
 *
 * ⚠️ Xin quyền micro NGAY LÚC BẤM, không xin sẵn lúc mở màn. Xin sẵn thì trình
 *   duyệt hỏi ngay khi vào chat và phần lớn người ta bấm "Chặn" — sau đó
 *   không hỏi lại được nữa, và tính năng chết vĩnh viễn trên máy đó.
 *
 * ⚠️ Tệp ghi âm đi qua ĐÚNG đường của ảnh/tệp (`chat_attachments`) — không
 *   dựng thêm một đường riêng cho âm thanh. Một đường, một bộ luật.
 */
export function NutGhiAm({
  tenantId,
  daChon,
  datDaChon,
  tatCa,
}: {
  tenantId: string;
  daChon: TepDinhKem[];
  datDaChon: (v: TepDinhKem[]) => void;
  tatCa: boolean;
}) {
  const t = useTranslations("chatRieng.voice");
  const [dangGhi, datDangGhi] = useState(false);
  const [giay, datGiay] = useState(0);
  const [dangTai, datDangTai] = useState(false);
  const mayGhi = useRef<MediaRecorder | null>(null);
  const dem = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Trần thời gian một lời nhắn thoại, tính bằng giây. */
  const TRAN_GIAY = 120;

  async function batDauGhi() {
    if (daChon.length >= MAX_TEP_MOI_TIN) {
      toast.error(t("tooMany", { max: MAX_TEP_MOI_TIN }));
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error(t("unsupported"));
      return;
    }
    let dong: MediaStream;
    try {
      dong = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Người dùng từ chối, hoặc máy không có micro. Nói rõ thay vì im lặng.
      toast.error(t("denied"));
      return;
    }

    const manh: BlobPart[] = [];
    const may = new MediaRecorder(dong);
    mayGhi.current = may;
    may.ondataavailable = (e) => {
      if (e.data.size > 0) manh.push(e.data);
    };
    may.onstop = async () => {
      // Tắt micro NGAY. Không tắt thì đèn micro của máy sáng mãi và người dùng
      // (đúng lý) nghĩ là app đang nghe lén.
      for (const r of dong.getTracks()) r.stop();
      if (dem.current) clearInterval(dem.current);
      datDangGhi(false);
      datGiay(0);

      const blob = new Blob(manh, { type: may.mimeType || "audio/webm" });
      if (blob.size === 0) return;
      if (blob.size > MAX_CO_TEP) {
        toast.error(t("tooBig", { max: coDocDuoc(MAX_CO_TEP) }));
        return;
      }

      datDangTai(true);
      try {
        const duoi = (may.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
        const duongDan = `${tenantId}/chat/${crypto.randomUUID()}.${duoi}`;
        const supabase = createClient();
        const { error } = await supabase.storage
          .from("tenant-files")
          .upload(duongDan, blob, { contentType: blob.type, upsert: false });
        if (error) throw new Error(error.message);
        datDaChon([
          ...daChon,
          { duongDan, ten: t("fileName"), loai: blob.type, co: blob.size },
        ]);
      } catch {
        toast.error(t("uploadFailed"));
      } finally {
        datDangTai(false);
      }
    };

    may.start();
    datDangGhi(true);
    datGiay(0);
    dem.current = setInterval(() => {
      datGiay((n) => {
        // Hết giờ thì DỪNG CỨNG, không chỉ đổi màu chữ.
        if (n + 1 >= TRAN_GIAY) may.stop();
        return n + 1;
      });
    }, 1000);
  }

  function dungGhi() {
    mayGhi.current?.stop();
  }

  if (tatCa) return null;

  return (
    <button
      type="button"
      onClick={dangGhi ? dungGhi : batDauGhi}
      disabled={dangTai}
      aria-label={dangGhi ? t("stop") : t("start")}
      className={cn(
        "flex min-h-8 items-center gap-1.5 rounded-md border px-2 text-[12px] disabled:opacity-60 max-md:min-h-11",
        dangGhi
          ? "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      {dangGhi ? (
        <>
          <Square className="size-3 fill-current" />
          {`${Math.floor(giay / 60)}:${String(giay % 60).padStart(2, "0")}`}
        </>
      ) : (
        <>
          <Mic className="size-3.5" />
          {dangTai ? t("saving") : t("start")}
        </>
      )}
    </button>
  );
}

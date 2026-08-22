"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
  /**
   * ⚠️ PHẢI là bộ đặt trạng thái nhận HÀM cập nhật, không phải nhận giá trị.
   *   Lý do đầy đủ ở chỗ gọi trong `may.onstop` — tóm tắt: giữa lúc bấm ghi và
   *   lúc ghi xong, danh sách tệp có thể đã đổi.
   */
  datDaChon: Dispatch<SetStateAction<TepDinhKem[]>>;
  tatCa: boolean;
}) {
  const t = useTranslations("chatRieng.voice");
  const [dangGhi, datDangGhi] = useState(false);
  const [giay, datGiay] = useState(0);
  const [dangTai, datDangTai] = useState(false);
  const mayGhi = useRef<MediaRecorder | null>(null);
  const dem = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Luồng micro đang mở — giữ lại để còn TẮT được khi rời màn. */
  const dongMicro = useRef<MediaStream | null>(null);

  /** Trần thời gian một lời nhắn thoại, tính bằng giây. */
  const TRAN_GIAY = 120;

  /**
   * RỜI MÀN GIỮA CHỪNG ⇒ TẮT MICRO.
   *
   * ⚠️ ĐO ĐƯỢC 22/08 trên bản dựng thật, TRƯỚC khi có đoạn này: bấm ghi rồi bấm
   *   sang màn khác trong app, thẻ micro vẫn ở trạng thái `live`. Nút ghi âm đã
   *   biến mất cùng màn Chat, nên KHÔNG CÒN GÌ tắt nó được nữa — đèn micro của
   *   máy sáng cho tới khi đóng hẳn tab.
   *
   * ⚠️ VÌ SAO KHÔNG AI THẤY: không có lỗi, không có thông báo. Người dùng chỉ
   *   thấy một chấm đỏ trên thanh trình duyệt và kết luận app đang nghe lén —
   *   đúng nỗi lo mà chú thích ở `may.onstop` bên dưới đã viết ra, nhưng chỉ
   *   chặn được ở đường dừng-bằng-tay.
   *
   * ⚠️ Gỡ `onstop` TRƯỚC khi dừng: màn đã tháo rồi, chạy tiếp phần tải lên là
   *   ghi vào một cái không còn tồn tại.
   */
  useEffect(() => {
    return () => {
      if (dem.current) clearInterval(dem.current);
      const may = mayGhi.current;
      if (may) {
        may.onstop = null;
        may.ondataavailable = null;
        if (may.state !== "inactive") may.stop();
      }
      for (const r of dongMicro.current?.getTracks() ?? []) r.stop();
      dongMicro.current = null;
    };
  }, []);

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

    dongMicro.current = dong;
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
      dongMicro.current = null;
      if (dem.current) clearInterval(dem.current);
      datDangGhi(false);
      datGiay(0);

      const blob = new Blob(manh, { type: may.mimeType || "audio/webm" });
      // ⚠️ RỖNG THÌ PHẢI NÓI. Bấm ghi rồi bấm dừng gần như tức thì thì máy ghi
      //   chưa kịp cắt mảnh nào — đo 22/08: cùng một thao tác, lượt thì ra tệp
      //   1 KB, lượt thì KHÔNG RA GÌ. Trước đây chỗ này `return` không kèm lời
      //   nào: người dùng bấm hai nút, không có tệp nào hiện ra, và không có
      //   chữ nào giải thích — họ chỉ biết bấm lại.
      if (blob.size === 0) {
        toast.error(t("tooShort"));
        return;
      }
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
        /**
         * ⚠️ NỐI VÀO DANH SÁCH MỚI NHẤT, không nối vào bản chụp lúc bấm ghi.
         *
         *   `daChon` ở đây là giá trị của lúc hàm `batDauGhi` được dựng — tức
         *   lúc BẤM GHI. Ai đính thêm một tấm ảnh TRONG LÚC đang nói thì tấm
         *   đó nằm ngoài bản chụp, và câu `datDaChon([...daChon, moi])` cũ ghi
         *   đè cả danh sách ⇒ ảnh biến mất.
         *
         * ⚠️ ĐO ĐƯỢC 22/08 trên bản dựng thật: bấm ghi → đính `anh-thu.png`
         *   (khung soạn hiện đúng một chip `anh-thu.png`) → bấm dừng ⇒ khung
         *   soạn chỉ còn `Lời nhắn thoại`. Tấm ảnh ĐÃ tải lên kho rồi mới bị
         *   bỏ rơi, và không có thông báo nào.
         */
        datDaChon((truoc) => [
          ...truoc,
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

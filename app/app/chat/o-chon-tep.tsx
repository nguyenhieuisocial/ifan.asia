"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Paperclip, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  MAX_CO_TEP,
  MAX_TEP_MOI_TIN,
  coDocDuoc,
  duoiTep,
  thuNhoAnh,
  type TepDinhKem,
} from "./tep-dinh-kem";

/**
 * CHỌN VÀ TẢI LÊN ẢNH / TỆP cho một tin nhắn nội bộ.
 *
 * Thẻ design nói thẳng vì sao cần: *"Bảng công, ảnh sản phẩm, ảnh trước-sau.
 * Hiện phải gửi qua Zalo rồi quay lại đây nói 'em gửi Zalo rồi nha'."*
 *
 * ⚠️ TẢI LÊN NGAY LÚC CHỌN, không đợi bấm Gửi. Ảnh điện thoại vài MB trên mạng
 *   tiệm mất vài giây; nếu để tới lúc bấm Gửi thì người ta nhìn một nút đứng
 *   im và bấm lại — hai tin. Tải trước thì lúc bấm Gửi là xong ngay.
 *
 * ⚠️ THU NHỎ Ở MÁY NGƯỜI GỬI. Ảnh chụp điện thoại đời mới là 4000×3000 và nặng
 *   5–8 MB, trong khi màn chat hiện nó rộng chưa tới 600px. Gửi nguyên bản là
 *   bắt cả tiệm tải về gấp ba mươi lần thứ họ nhìn thấy.
 *
 * ⚠️ Cũng nhận KÉO–THẢ. Trên máy quầy, kéo một ảnh từ thư mục vào khung chat
 *   là thao tác tự nhiên nhất, và không có nó thì người ta không biết là gửi
 *   được ảnh.
 */
export function OChonTep({
  tenantId,
  daChon,
  datDaChon,
  tatCa,
}: {
  tenantId: string;
  daChon: TepDinhKem[];
  datDaChon: Dispatch<SetStateAction<TepDinhKem[]>>;
  /** Vai Chỉ xem không gửi được gì — tắt hẳn. */
  tatCa: boolean;
}) {
  const t = useTranslations("chatRieng.file");
  const oRef = useRef<HTMLInputElement>(null);
  const [dangTai, datDangTai] = useState(0);
  const [dangKeoVao, datDangKeoVao] = useState(false);

  async function nhanTep(ds: FileList | File[] | null) {
    if (!ds || tatCa) return;
    const con = MAX_TEP_MOI_TIN - daChon.length;
    if (con <= 0) {
      toast.error(t("tooMany", { max: MAX_TEP_MOI_TIN }));
      return;
    }
    const chon = Array.from(ds).slice(0, con);
    if (Array.from(ds).length > con) toast.warning(t("tooMany", { max: MAX_TEP_MOI_TIN }));

    const supabase = createClient();
    datDangTai((n) => n + chon.length);
    const them: TepDinhKem[] = [];

    for (const goc of chon) {
      try {
        const tep = await thuNhoAnh(goc);
        if (tep.size > MAX_CO_TEP) {
          toast.error(t("tooBig", { ten: goc.name, max: coDocDuoc(MAX_CO_TEP) }));
          continue;
        }
        // Tên trong kho là mã ngẫu nhiên — KHÔNG dùng tên gốc. Tên gốc có thể
        // mang dấu tiếng Việt, khoảng trắng, hoặc trùng nhau; và nó cũng là
        // một đường để đoán ra tệp của người khác.
        const duongDan = `${tenantId}/chat/${crypto.randomUUID()}.${duoiTep(tep.name)}`;
        const { error } = await supabase.storage
          .from("tenant-files")
          .upload(duongDan, tep, { contentType: tep.type, upsert: false });
        if (error) {
          toast.error(t("uploadFailed", { ten: goc.name }));
          continue;
        }
        them.push({ duongDan, ten: goc.name.slice(0, 200), loai: tep.type, co: tep.size });
      } catch {
        toast.error(t("uploadFailed", { ten: goc.name }));
      } finally {
        datDangTai((n) => Math.max(0, n - 1));
      }
    }

    // ⚠️ Cùng một lỗi với nút ghi âm, chiều ngược lại: `daChon` là bản chụp lúc
    //   BẮT ĐẦU chọn tệp, mà giữa đó có mấy lượt `await` tải lên. Ai bấm ghi âm
    //   trong lúc ảnh đang tải thì lời nhắn thoại rơi mất. Nối vào danh sách
    //   MỚI NHẤT thì cả hai đường cùng sống.
    if (them.length > 0) datDaChon((truoc) => [...truoc, ...them]);
  }

  function boMot(duongDan: string) {
    // ⚠️ CỐ Ý không xoá tệp khỏi kho ở đây. Người ta hay bỏ rồi chọn lại đúng
    //   tệp đó; xoá ngay thì lần chọn lại phải tải lên lần nữa. Tệp mồ côi chỉ
    //   tốn chỗ và sẽ dọn bằng một việc nền riêng.
    datDaChon(daChon.filter((x) => x.duongDan !== duongDan));
  }

  if (tatCa) return null;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        datDangKeoVao(true);
      }}
      onDragLeave={() => datDangKeoVao(false)}
      onDrop={(e) => {
        e.preventDefault();
        datDangKeoVao(false);
        void nhanTep(e.dataTransfer.files);
      }}
      className={cn(
        "rounded-md",
        dangKeoVao && "outline-2 outline-dashed outline-primary outline-offset-2",
      )}
    >
      {daChon.length > 0 && (
        <ul className="mb-1.5 flex flex-wrap gap-1.5">
          {daChon.map((x) => (
            <li
              key={x.duongDan}
              className="flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[11px]"
            >
              <Paperclip className="size-3 shrink-0 text-muted-foreground" />
              <span className="max-w-32 truncate">{x.ten}</span>
              <span className="shrink-0 text-muted-foreground">{coDocDuoc(x.co)}</span>
              <button
                type="button"
                onClick={() => boMot(x.duongDan)}
                aria-label={t("remove", { ten: x.ten })}
                className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted max-md:size-8"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={oRef}
        type="file"
        multiple
        // `image/*` kèm `capture` rỗng: điện thoại hiện CẢ máy ảnh lẫn thư
        // viện, để người ta chụp thẳng ảnh trước–sau mà không phải thoát app.
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          void nhanTep(e.target.files);
          // Xoá giá trị để chọn LẠI ĐÚNG tệp vừa bỏ vẫn kích hoạt được.
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => oRef.current?.click()}
        disabled={dangTai > 0 || daChon.length >= MAX_TEP_MOI_TIN}
        className="flex min-h-8 items-center gap-1.5 rounded-md border px-2 text-[12px] text-muted-foreground hover:bg-muted disabled:opacity-60 max-md:min-h-11"
      >
        {dangTai > 0 ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            {t("uploading", { count: dangTai })}
          </>
        ) : (
          <>
            <Paperclip className="size-3.5" />
            {t("add")}
          </>
        )}
      </button>
    </div>
  );
}

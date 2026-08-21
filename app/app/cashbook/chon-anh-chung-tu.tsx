"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { thuNhoAnh } from "@/app/app/chat/tep-dinh-kem";

/**
 * CHỌN ẢNH CHỨNG TỪ CHO PHIẾU CHI (thẻ `man-anh-chung-tu-phieu-chi`).
 *
 * ⚠️ TỰ THU NHỎ TRƯỚC KHI GỬI. Ảnh điện thoại nay 4–8 MB một tấm. Gửi nguyên cỡ
 *   nghĩa là tiệm dùng mạng di động ngồi chờ, và kho phình lên vì những tấm ảnh
 *   không ai phóng to. Dùng lại đúng bộ thu nhỏ mà Chat đang dùng — đừng viết
 *   bộ thứ hai để rồi hai nơi nén khác nhau.
 *
 * ⚠️ TRÊN ĐIỆN THOẠI, NÚT NÀY MỞ THẲNG MÁY ẢNH (`capture`). Người ghi sổ đang
 *   cầm tờ hoá đơn trên tay, không phải đi tìm tệp trong máy.
 *
 * ⚠️ ẢNH ĐƯỢC TẢI LÊN NGAY LÚC CHỌN, trước khi phiếu được lưu. Nếu người dùng
 *   bỏ ngang thì ảnh thành mồ côi trong kho. CỐ Ý chấp nhận: người ta hay bỏ
 *   rồi chọn lại đúng tấm đó, xoá ngay là bắt tải lên lần nữa. Đây là NỢ ĐÃ
 *   BIẾT, cùng loại với tệp mồ côi của Chat, và nên dọn bằng một việc nền
 *   CHUNG cho cả hai chứ không phải hai đường dọn riêng.
 */

export interface AnhChungTu {
  duong_dan: string;
  ten: string;
  co: number;
}

const TOI_DA = 3;
/** Sau khi thu nhỏ, một ảnh hoá đơn hiếm khi quá ngần này. */
const CO_TOI_DA = 3 * 1024 * 1024;

function duoiTep(ten: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(ten);
  return (m?.[1] ?? "jpg").toLowerCase();
}

export function ChonAnhChungTu({
  tenantId,
  daChon,
  datDaChon,
}: {
  tenantId: string;
  daChon: AnhChungTu[];
  datDaChon: (v: AnhChungTu[]) => void;
}) {
  const t = useTranslations("cashbook.chungTu");
  const oTep = useRef<HTMLInputElement>(null);
  const [dangTai, datDangTai] = useState(0);

  async function chonTep(ds: FileList | null) {
    if (!ds || ds.length === 0) return;
    const con = TOI_DA - daChon.length;
    if (con <= 0) {
      toast.warning(t("tooMany", { max: TOI_DA }));
      return;
    }
    const chon = Array.from(ds).slice(0, con);
    if (Array.from(ds).length > con) toast.warning(t("tooMany", { max: TOI_DA }));

    const supabase = createClient();
    datDangTai((n) => n + chon.length);
    const them: AnhChungTu[] = [];

    for (const goc of chon) {
      try {
        const tep = await thuNhoAnh(goc);
        if (tep.size > CO_TOI_DA) {
          toast.error(t("tooBig", { ten: goc.name }));
          continue;
        }
        // Tên trong kho là mã ngẫu nhiên — KHÔNG dùng tên gốc. Tên gốc mang dấu
        // tiếng Việt, khoảng trắng, có thể trùng nhau, và cũng là một đường để
        // đoán ra tệp của người khác.
        const duongDan = `${tenantId}/chung-tu/${crypto.randomUUID()}.${duoiTep(tep.name)}`;
        const { error } = await supabase.storage
          .from("tenant-files")
          .upload(duongDan, tep, { contentType: tep.type, upsert: false });
        if (error) {
          toast.error(t("uploadFailed", { ten: goc.name }));
          continue;
        }
        them.push({ duong_dan: duongDan, ten: goc.name.slice(0, 200), co: tep.size });
      } catch {
        toast.error(t("uploadFailed", { ten: goc.name }));
      } finally {
        datDangTai((n) => Math.max(0, n - 1));
      }
    }
    if (them.length > 0) datDaChon([...daChon, ...them]);
    if (oTep.current) oTep.current.value = "";
  }

  return (
    <div className="space-y-2">
      <input
        ref={oTep}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        onChange={(e) => void chonTep(e.target.files)}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full max-md:h-11"
        onClick={() => oTep.current?.click()}
        disabled={dangTai > 0 || daChon.length >= TOI_DA}
      >
        <Camera className="size-4" />
        {dangTai > 0 ? t("uploading") : t("add", { max: TOI_DA })}
      </Button>

      {daChon.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {daChon.map((a) => (
            <li key={a.duong_dan} className="relative">
              <span className="flex size-16 items-center justify-center rounded-md border bg-muted text-[10px] text-muted-foreground">
                {/* Không hiện ảnh thật ở đây: hiện được thì phải xin đường dẫn ký
                    hạn cho từng tấm ngay lúc đang nhập, tốn một vòng gọi cho một
                    thứ người dùng vừa tự chụp và đã biết là ảnh gì. */}
                {t("one")}
              </span>
              <button
                type="button"
                aria-label={t("remove", { ten: a.ten })}
                onClick={() => datDaChon(daChon.filter((x) => x.duong_dan !== a.duong_dan))}
                className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

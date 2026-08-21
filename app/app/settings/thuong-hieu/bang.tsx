"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { MA_MAU, MAU, chuVietTat, mauCua, type MaMau } from "@/lib/thuong-hieu";
import { datThuongHieu } from "./actions";

/**
 * MÀN THƯƠNG HIỆU TIỆM (#334, thẻ `man-thuong-hieu-tiem`).
 *
 * ⚠️ CHỈ HAI LỰA CHỌN: logo và màu. Đây là màn mỗi tiệm mở đúng một lần rồi
 *   thôi — nhồi thêm thứ để chỉnh là biến một việc năm phút thành một buổi
 *   chiều, và phần lớn tiệm sẽ bỏ dở giữa chừng.
 *
 * ⚠️ XEM THỬ ĐẶT NGAY BÊN CẠNH, không phải "lưu rồi mở tab khác xem". Người ta
 *   chọn màu bằng mắt, nên phải thấy kết quả ngay lúc chọn.
 */

const CO_TOI_DA = 1024 * 1024; // 1 MB
const LOAI_ANH = ["image/png", "image/jpeg", "image/webp"];

export function BangThuongHieu({
  tenantId,
  tenTiem,
  logoHienTai,
  mauSan,
}: {
  tenantId: string;
  tenTiem: string;
  /**
   * Đường dẫn logo đang lưu, hoặc `null` nếu chưa có.
   *
   * ⚠️ Màn này BIẾT đường dẫn, còn hàm công khai `thuong_hieu_cong_khai` thì
   *   CỐ Ý không trả nó (#334) — hai chỗ khác nhau, đừng gộp làm một. Ở đây
   *   người xem là chủ tiệm đang xem tiệm của chính mình; ở kia người xem là
   *   bất kỳ ai trên internet.
   */
  logoHienTai: string | null;
  mauSan: MaMau | null;
}) {
  const t = useTranslations("settings.brand");
  const [pending, startTransition] = useTransition();
  const [mau, datMau] = useState<MaMau | null>(mauSan);
  // Đường dẫn logo mới vừa tải lên (chưa lưu). `null` = chưa đụng tới,
  // `""` = người dùng vừa bấm Gỡ.
  const [logoMoi, datLogoMoi] = useState<string | null>(null);
  const [xemAnh, datXemAnh] = useState<string | null>(null);
  const [dangTai, datDangTai] = useState(false);

  const coLogo = logoMoi === null ? logoHienTai !== null : logoMoi !== "";
  const sacMau = useMemo(() => mauCua(mau), [mau]);
  const tat = chuVietTat(tenTiem);

  const chonAnh = async (f: File | undefined) => {
    if (!f) return;
    if (!LOAI_ANH.includes(f.type)) {
      toast.error(t("errors.loaiAnh"));
      return;
    }
    if (f.size > CO_TOI_DA) {
      toast.error(t("errors.anhQuaLon"));
      return;
    }
    datDangTai(true);
    try {
      const duoi = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
      // Tên tệp mới mỗi lần: đè lên tệp cũ thì trình duyệt của khách vẫn giữ
      // ảnh cũ trong bộ nhớ và tiệm tưởng là đổi không ăn.
      const duong = `${tenantId}/thuong-hieu/${crypto.randomUUID()}.${duoi}`;
      const supabase = createClient();
      const { error } = await supabase.storage
        .from("tenant-files")
        .upload(duong, f, { contentType: f.type, upsert: false });
      if (error) {
        toast.error(t("errors.taiHong"));
        return;
      }
      datLogoMoi(duong);
      datXemAnh(URL.createObjectURL(f));
    } finally {
      datDangTai(false);
    }
  };

  const luu = () =>
    startTransition(async () => {
      const r = await datThuongHieu({
        // Chưa đụng tới logo ⇒ gửi lại ĐÚNG cái đang có. Hàm ghi nhận `null` là
        // XOÁ, nên gửi `null` cho trường hợp "không đổi" là lặng lẽ xoá logo
        // của người ta chỉ vì họ vào đổi màu.
        duongDanLogo: logoMoi === null ? logoHienTai : logoMoi === "" ? null : logoMoi,
        mau,
      });
      if (r.error) {
        toast.error(t(`errors.${r.error}`));
        return;
      }
      toast.success(t("saved"));
    });

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
      <div className="space-y-4">
        <section className="rounded-lg border p-3">
          <p className="text-[12.5px] font-semibold">{t("logoTitle")}</p>
          <div className="mt-2 flex items-center gap-3">
            <div
              className={cn(
                "flex size-15 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white",
                !coLogo && "border border-dashed bg-muted text-[10px] font-normal text-muted-foreground",
              )}
              style={coLogo ? { backgroundColor: sacMau.dam } : undefined}
            >
              {coLogo && xemAnh ? (
                <Image
                  src={xemAnh}
                  alt=""
                  width={60}
                  height={60}
                  className="size-15 rounded-2xl object-cover"
                  unoptimized
                />
              ) : coLogo ? (
                tat
              ) : (
                t("noLogo")
              )}
            </div>
            <div className="min-w-0">
              <label className="inline-flex min-h-9 cursor-pointer items-center rounded-md border px-3 text-[12.5px] hover:bg-muted">
                {dangTai ? t("uploading") : t("pickImage")}
                <input
                  type="file"
                  accept={LOAI_ANH.join(",")}
                  className="sr-only"
                  disabled={dangTai}
                  onChange={(e) => void chonAnh(e.target.files?.[0])}
                />
              </label>
              {coLogo && (
                <button
                  type="button"
                  onClick={() => {
                    datLogoMoi("");
                    datXemAnh(null);
                  }}
                  className="ml-1.5 min-h-9 rounded-md border border-destructive/40 px-3 text-[12.5px] text-destructive hover:bg-destructive/5"
                >
                  {t("remove")}
                </button>
              )}
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {t("logoHint")}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border p-3">
          <p className="text-[12.5px] font-semibold">{t("colorTitle")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {MA_MAU.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => datMau(m)}
                aria-label={t(`colors.${m}`)}
                aria-pressed={m === mau}
                className={cn(
                  "size-9 rounded-xl border-2 transition-transform",
                  m === mau ? "border-foreground scale-105" : "border-transparent",
                )}
                style={{ backgroundColor: MAU[m].dam }}
              />
            ))}
          </div>
          {/* ⚠️ Câu này KHÔNG được bỏ. Người dùng sẽ hỏi "sao không cho tôi chọn
              màu của tôi" — trả lời sẵn ở đây thì không ai phải hỏi. */}
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {t("colorHint")}
          </p>
        </section>

        <button
          type="button"
          disabled={pending || dangTai}
          onClick={luu}
          className="min-h-10 rounded-md bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          {t("save")}
        </button>
      </div>

      {/* ── XEM THỬ ─────────────────────────────────────────────── */}
      <div>
        <p className="mb-2 text-[12.5px] font-semibold">{t("previewTitle")}</p>
        <div className="w-full max-w-[230px] overflow-hidden rounded-2xl border bg-card">
          <div className="h-11" style={{ backgroundColor: sacMau.nhat }} />
          <div className="px-3.5 pb-3.5">
            <div
              className="-mt-4.5 flex size-10.5 items-center justify-center rounded-xl border-2 border-card text-[15px] font-bold text-white"
              style={{ backgroundColor: sacMau.dam }}
            >
              {xemAnh ? (
                <Image
                  src={xemAnh}
                  alt=""
                  width={42}
                  height={42}
                  className="size-10.5 rounded-xl object-cover"
                  unoptimized
                />
              ) : (
                tat
              )}
            </div>
            <p className="mt-1.5 text-[13px] font-semibold">{tenTiem}</p>
            <p className="text-[10.5px] text-green-700">{t("previewOpen")}</p>
            <div
              className="mt-2.5 flex h-8 items-center justify-center rounded-lg text-[11.5px] font-semibold text-white"
              style={{ backgroundColor: sacMau.dam }}
            >
              {t("previewBook")}
            </div>
            <div className="mt-1.5 flex h-8 items-center justify-center rounded-lg border text-[11.5px] font-semibold">
              {t("previewZalo")}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {t("previewHint")}
        </p>
      </div>
    </div>
  );
}

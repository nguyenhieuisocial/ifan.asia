import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { HanhDongNguoiDung } from "./hanh-dong";

export const dynamic = "force-dynamic";

/**
 * QUẢN TRỊ — NGƯỜI DÙNG TOÀN NỀN TẢNG (thẻ `man-quan-tri-nguoi-dung`).
 *
 * Màn của CHỦ SAAS, không phải của chủ tiệm. Bảng điều hành đã thấy được TIỆM
 * nhưng chưa thấy NGƯỜI — khi ai đó nhắn "tôi không vào được" thì trước bản này
 * không có chỗ nào để tra, mà đó là câu hỏi hỗ trợ hay gặp nhất.
 *
 * ⚠️ Chốt quyền nằm ở HAI nơi và cả hai đều cần: `app/admin/layout.tsx` chặn
 *   người lạ vào màn, còn hàm `admin_users` tự kiểm `is_platform_admin()` vì nó
 *   gọi được thẳng qua API. Chốt ở màn là chốt ở phía người gọi — tức là không
 *   phải chốt.
 *
 * ⚠️ KHÔNG dùng thư viện bảng. Đã xét (22/08) và loại: danh sách cỡ trăm dòng,
 *   một người dùng duy nhất; mọi khung/theme trọn gói đều mang bộ màu-chữ riêng
 *   và đè lên hệ thống thẻ thiết kế đã chốt. Bảng HTML + Tailwind là đủ.
 */

type Tiem = { ten: string; vai: string };
type Hang = {
  user_id: string;
  ten: string;
  email: string;
  phone: string;
  tao_luc: string;
  dang_nhap_cuoi: string | null;
  da_xac_minh: boolean;
  tiem: Tiem[];
};

const LOC = ["tat-ca", "chua-xac-minh", "chua-dang-nhap", "chua-co-tiem", "nguoi-nguoi"] as const;
type Loc = (typeof LOC)[number];

export default async function TrangNguoiDung({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; loc?: string }>;
}) {
  const { q, loc } = await searchParams;
  const tuKhoa = (q ?? "").trim().slice(0, 80);
  const locHienTai: Loc = (LOC as readonly string[]).includes(loc ?? "") ? (loc as Loc) : "tat-ca";

  const supabase = await createClient();
  const [{ data: raw }, { data: demRaw }] = await Promise.all([
    supabase.rpc("admin_users", {
      p_tu_khoa: tuKhoa || null,
      p_loc: locHienTai,
      p_limit: 200,
      p_offset: 0,
    }),
    supabase.rpc("admin_users_dem"),
  ]);
  const hang = (raw ?? []) as Hang[];
  const dem = (demRaw ?? {}) as Record<string, number>;

  const t = await getTranslations("admin.users");
  const locale = (await getLocale()) as Locale;

  const chip: { ma: Loc; nhan: string; so: number | undefined }[] = [
    { ma: "tat-ca", nhan: t("all"), so: dem.tat_ca },
    { ma: "chua-xac-minh", nhan: t("unverified"), so: dem.chua_xac_minh },
    { ma: "chua-dang-nhap", nhan: t("neverSignedIn"), so: dem.chua_dang_nhap },
    { ma: "chua-co-tiem", nhan: t("noShop"), so: dem.chua_co_tiem },
    { ma: "nguoi-nguoi", nhan: t("cold"), so: dem.nguoi_nguoi },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      <Link
        href="/admin"
        className="mb-3 inline-flex min-h-7 items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        {t("back")}
      </Link>
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <p className="mt-0.5 mb-4 text-sm text-muted-foreground">{t("subtitle")}</p>

      {/* Ô tìm là FORM GET: đường dẫn mang theo từ khoá nên gửi được cho người
          khác và bấm F5 không mất kết quả. */}
      <form className="flex gap-2" action="/admin/nguoi-dung">
        <input type="hidden" name="loc" value={locHienTai} />
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={tuKhoa}
            placeholder={t("searchPlaceholder")}
            className="h-10 w-full rounded-md border pl-8 text-[13px]"
          />
        </div>
        <button type="submit" className="h-10 rounded-md border px-3 text-[13px] font-medium hover:bg-muted">
          {t("search")}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {chip.map((c) => (
          <Link
            key={c.ma}
            href={`/admin/nguoi-dung?loc=${c.ma}${tuKhoa ? `&q=${encodeURIComponent(tuKhoa)}` : ""}`}
            className={cn(
              "flex min-h-7 items-center gap-1 rounded-full border px-2.5 text-[11.5px]",
              c.ma === locHienTai ? "border-primary bg-primary font-semibold text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {c.nhan}
            {typeof c.so === "number" && <span className="tabular-nums opacity-80">{c.so}</span>}
          </Link>
        ))}
      </div>

      {/* ⚠️ MÀN PHẢI NÓI THẬT VỀ HUY HIỆU "ĐÃ XÁC MINH" (#339).
          Đo 22/08: 97/99 tài khoản được đánh dấu xác minh trong DƯỚI 2 GIÂY —
          tức là máy tự đánh dấu, không ai mở hộp thư. Dự án đang tắt bước xác
          minh email. Huy hiệu vì thế KHÔNG có nghĩa như tên nó, và người đọc
          màn này sẽ tin nhầm là 99 địa chỉ kia đã được chủ nhân xác nhận.
          Dải này chỉ hiện khi số liệu THẬT SỰ cho thấy vậy — hết tắt xác minh
          thì nó tự biến mất, không phải đi xoá tay. */}
      {(dem.xac_minh_tuc_thi ?? 0) > (dem.xac_minh_co_nguoi ?? 0) && (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {t("autoConfirmWarning", {
            tucThi: dem.xac_minh_tuc_thi ?? 0,
            coNguoi: dem.xac_minh_co_nguoi ?? 0,
          })}
        </p>
      )}

      {hang.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="mt-3 divide-y rounded-lg border">
          {hang.map((h) => (
            <li key={h.user_id} className="p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">{h.ten || t("noName")}</p>
                  <p className="text-[11.5px] break-all text-muted-foreground">
                    {h.email}
                    {h.phone ? ` · ${h.phone}` : ""}
                  </p>
                  {/* Một dòng một NGƯỜI: các tiệm gom vào đây, không tách dòng —
                      tách thì mọi phép đếm số người đều sai. */}
                  <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                    {h.tiem.length === 0 ? (
                      <span className="text-muted-foreground italic">{t("noShopYet")}</span>
                    ) : (
                      h.tiem.map((x, i) => (
                        <span key={i} className="rounded bg-muted px-1.5 py-0.5">
                          {x.ten} · {t(`role.${x.vai}`) || x.vai}
                        </span>
                      ))
                    )}
                  </p>
                </div>
                <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                  {!h.da_xac_minh && (
                    <span className="mb-1 block rounded bg-destructive/10 px-1.5 py-0.5 font-semibold text-destructive">
                      {t("unverifiedBadge")}
                    </span>
                  )}
                  <span className="block">
                    {h.dang_nhap_cuoi
                      ? t("lastSignIn", { date: formatDateTime(h.dang_nhap_cuoi, locale) })
                      : t("neverSignedInBadge")}
                  </span>
                  <span className="block opacity-70">
                    {t("createdAt", { date: formatDateTime(h.tao_luc, locale) })}
                  </span>
                </div>
              </div>
              <HanhDongNguoiDung email={h.email} daXacMinh={h.da_xac_minh} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-muted-foreground">{t("note")}</p>
    </div>
  );
}

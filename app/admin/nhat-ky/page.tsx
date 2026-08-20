import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ScrollText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import {
  CHI_TOAN_NEN_TANG,
  CO_TRANG,
  docTrangNhatKy,
  ghepTen,
  homNayVN,
  laNgay,
  mocVN,
  ngayLuiVN,
  quetKhoaLoc,
  traTen,
  type DongNhatKy,
} from "./queries";

export const dynamic = "force-dynamic";

/** Khoảng mặc định: 30 ngày gần nhất tính theo giờ VN. */
const SO_NGAY_MAC_DINH = 30;

/**
 * Nhãn tiếng Việt cho từng thao tác đã ghi sổ.
 *
 * Khoá i18n cố ý KHÔNG dùng dấu chấm của tên thao tác (`platform_overview.read`)
 * — next-intl hiểu dấu chấm là phân cấp, đặt thẳng vào khoá là tra hụt.
 *
 * Thao tác LẠ (hàm mới ghi sổ mà chưa ai thêm nhãn) hiện NGUYÊN tên kỹ thuật
 * chứ không hiện "—": thà xấu còn hơn giấu mất một dòng nhật ký.
 */
const NHAN_THAO_TAC: Record<string, string> = {
  "platform_overview.read": "platformOverviewRead",
  "tenant_health.read": "tenantHealthRead",
  "open_invoices.read": "openInvoicesRead",
  "help_requests.read": "helpRequestsRead",
  "payment.record": "paymentRecord",
};

/** Nhãn cho các khoá hay gặp trong `meta`; khoá lạ hiện nguyên tên. */
const NHAN_META: Record<string, string> = {
  invoice: "Hoá đơn",
  amount: "Số tiền",
  ref: "Mã giao dịch",
  result: "Kết quả",
  limit: "Số tiệm lấy về",
};

function rutGon(id: string): string {
  return id.slice(0, 8);
}

/** `meta` thành một dòng đọc được. Rỗng thì trả chuỗi rỗng (không hiện dòng). */
function docMeta(meta: Record<string, unknown>): string {
  return Object.entries(meta)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${NHAN_META[k] ?? k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

function duongDan(tham: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(tham)) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `/admin/nhat-ky?${s}` : "/admin/nhat-ky";
}

/**
 * Màn ĐỌC quyển nhật ký quản trị nền tảng (việc #207, thẻ design
 * `design-system/man-nhat-ky-quan-tri.html`).
 *
 * VÌ SAO CÓ MÀN NÀY: bảng `admin_audit_logs` đã ghi từ 04/08 nhưng bật RLS mà
 * có ĐÚNG 0 chính sách ⇒ mọi câu đọc ra 0 dòng, không ai đọc nổi một chữ.
 * Migration #216 mở đường ĐỌC cho vai quản trị nền tảng; màn này là phần còn
 * lại — thứ được ghi ra mà không ai đọc được thì bằng không ghi.
 *
 * QUYỀN: không tự kiểm — `app/admin/layout.tsx` đã chặn bằng RPC
 * `is_platform_admin()` và trả 404 nếu không đủ quyền (cố ý 404 chứ không
 * "cấm truy cập": không hé lộ là có khu này). Tầng thật nằm ở chính sách
 * `admin_audit_logs_select` của CSDL, nên chủ tiệm thường có gọi thẳng
 * PostgREST cũng chỉ ra 0 dòng.
 */
export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const doc = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  const homNay = homNayVN();
  const macDinhTu = ngayLuiVN(SO_NGAY_MAC_DINH - 1);
  const nhapTu = doc("tu");
  const nhapDen = doc("den");
  const tu = laNgay(nhapTu) ? nhapTu : macDinhTu;
  const den = laNgay(nhapDen) ? nhapDen : homNay;
  const nguoi = doc("nguoi") || null;
  const tiem = doc("tiem") || null;
  const trangXin = Math.max(1, Number.parseInt(doc("trang"), 10) || 1);

  // "Đến ngày" phải bao TRỌN ngày đó ⇒ mốc cuối là 00:00 của ngày kế tiếp.
  const tuIso = mocVN(tu);
  const denIso = mocVN(den, 1);

  const t = await getTranslations("admin.auditLog");
  const locale = (await getLocale()) as Locale;
  const supabase = await createClient();

  let dong: DongNhatKy[] = [];
  let tong = 0;
  // Trang THẬT SỰ đọc được — `docTrangNhatKy` kéo về khoảng hợp lệ khi ai đó
  // gõ tay `?trang=99`, nên màn phải bám số này chứ không bám số trên URL.
  let trangSo = trangXin;
  let chonNguoi: { id: string; ten: string }[] = [];
  let chonTiem: { id: string; ten: string }[] = [];
  let coDongToanNenTang = false;
  let loi: string | null = null;

  try {
    // Quét khoá lọc TRƯỚC: nó cũng cho luôn tập id cần tra tên của trang đang
    // xem (trang là tập con của cùng khoảng ngày), nên chỉ tra tên một lần.
    const khoa = await quetKhoaLoc(supabase, tuIso, denIso);
    const trang = await docTrangNhatKy(supabase, {
      nguoi,
      tiem,
      tuIso,
      denIso,
      trang: trangXin,
    });
    const ten = await traTen(supabase, khoa.nguoi, khoa.tiem);

    dong = ghepTen(trang.dong, ten);
    tong = trang.tong;
    trangSo = trang.trang;
    coDongToanNenTang = khoa.coDongToanNenTang;
    chonNguoi = khoa.nguoi
      .map((id) => ({ id, ten: ten.nguoi.get(id) ?? t("unknownPerson", { id: rutGon(id) }) }))
      .sort((a, b) => a.ten.localeCompare(b.ten, locale));
    chonTiem = khoa.tiem
      .map((id) => ({ id, ten: ten.tiem.get(id) ?? t("unknownShop", { id: rutGon(id) }) }))
      .sort((a, b) => a.ten.localeCompare(b.ten, locale));
  } catch (e) {
    // Đọc hỏng KHÁC HẲN sổ rỗng. Nuốt lỗi thành danh sách trống ở đây nghĩa là
    // người đọc kết luận "không ai đụng vào dữ liệu" trong khi thật ra là
    // không đọc được gì — sai lầm nguy hiểm nhất mà một quyển nhật ký kiểm
    // toán có thể gây ra.
    loi = e instanceof Error ? e.message : String(e);
  }

  const soTrang = Math.max(1, Math.ceil(tong / CO_TRANG));
  const dauTrang = tong === 0 ? 0 : (trangSo - 1) * CO_TRANG + 1;
  const cuoiTrang = Math.min(trangSo * CO_TRANG, tong);
  const thamChung = { nguoi: nguoi ?? "", tiem: tiem ?? "", tu, den };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <ScrollText aria-hidden className="size-4.5 shrink-0" />
            {t("title")}
          </h1>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {t("description")}
          </p>
        </div>

        {/* Bộ lọc đi bằng form GET: không cần JavaScript, và mỗi bộ lọc là một
            đường dẫn chia sẻ được cho người cùng có quyền. */}
        <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t("filter.person")}</span>
            <select
              name="nguoi"
              defaultValue={nguoi ?? ""}
              className="h-9 max-w-56 rounded-md border bg-background px-2 text-[13px]"
            >
              <option value="">{t("filter.all")}</option>
              {chonNguoi.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.ten}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t("filter.shop")}</span>
            <select
              name="tiem"
              defaultValue={tiem ?? ""}
              className="h-9 max-w-56 rounded-md border bg-background px-2 text-[13px]"
            >
              <option value="">{t("filter.all")}</option>
              {coDongToanNenTang && (
                <option value={CHI_TOAN_NEN_TANG}>{t("filter.platformOnly")}</option>
              )}
              {chonTiem.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ten}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t("filter.from")}</span>
            <input
              type="date"
              name="tu"
              defaultValue={tu}
              max={den}
              className="h-9 rounded-md border bg-background px-2 text-[13px]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t("filter.to")}</span>
            <input
              type="date"
              name="den"
              defaultValue={den}
              min={tu}
              className="h-9 rounded-md border bg-background px-2 text-[13px]"
            />
          </label>

          <button
            type="submit"
            className="h-9 rounded-md border bg-foreground px-3 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
          >
            {t("filter.apply")}
          </button>
          <Link
            href="/admin/nhat-ky"
            className="h-9 rounded-md px-2.5 text-[13px] leading-9 text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("filter.reset")}
          </Link>
        </form>

        {loi !== null ? (
          <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-[13px] font-semibold text-destructive">{t("error")}</p>
            {/* Thông điệp thô của Postgres/PostgREST: người kỹ thuật cần nó để
                biết hỏng ở đâu, và nó chứng minh màn KHÔNG im lặng nuốt lỗi. */}
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{loi}</p>
          </section>
        ) : dong.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-[13px] text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <>
            <ul className="divide-y rounded-lg border">
              {dong.map((d) => {
                const khoaNhan = NHAN_THAO_TAC[d.action];
                const chiTiet = docMeta(d.meta);
                return (
                  <li key={d.id} className="flex flex-wrap gap-x-3 gap-y-1.5 px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold">
                        {d.actorName ?? t("unknownPerson", { id: rutGon(d.actorId) })}
                        <span className="font-normal text-muted-foreground">
                          {" — "}
                          {khoaNhan ? t(`actions.${khoaNhan}`) : d.action}
                        </span>
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {/* Ô "Tiệm" KHÔNG BAO GIỜ để trống. Bốn trong năm hàm
                            ghi sổ là thao tác toàn nền tảng nên `tenant_id`
                            trống là ĐÚNG NGHĨA, không phải thiếu dữ liệu — để
                            trống trên màn thì người đọc tưởng màn hỏng. */}
                        {d.tenantId === null ? (
                          <span className="rounded bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
                            {t("platformWide")}
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                            {d.tenantName ?? t("unknownShop", { id: rutGon(d.tenantId) })}
                          </span>
                        )}
                        {chiTiet && (
                          <span className="min-w-0 text-[11px] break-all text-muted-foreground">
                            {chiTiet}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground">
                      {formatDateTime(d.createdAt, locale)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {t("range", { from: dauTrang, to: cuoiTrang, total: tong })}
              </p>
              <div className="flex items-center gap-1.5">
                {trangSo > 1 ? (
                  <Link
                    href={duongDan({ ...thamChung, trang: trangSo - 1 })}
                    className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-foreground/[0.04]"
                  >
                    {t("prev")}
                  </Link>
                ) : (
                  <span className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground/50">
                    {t("prev")}
                  </span>
                )}
                {trangSo < soTrang ? (
                  <Link
                    href={duongDan({ ...thamChung, trang: trangSo + 1 })}
                    className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-foreground/[0.04]"
                  >
                    {t("next")}
                  </Link>
                ) : (
                  <span className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground/50">
                    {t("next")}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

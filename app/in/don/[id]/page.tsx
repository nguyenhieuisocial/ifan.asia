import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getOrderDetail, maDon } from "@/lib/catalog/orders";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { ThanhIn } from "./tu-dong-in";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PHIẾU TÍNH TIỀN — trang in, NẰM NGOÀI vỏ ứng dụng.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO LÀ TRANG RIÊNG, KHÔNG PHẢI `@media print` TRÊN MÀN CHI TIẾT
 * ═══════════════════════════════════════════════════════════════════
 * Vỏ `/app` có thanh bên, thanh trên, ba dải thông báo (mất mạng / tiệm mẫu /
 * phiên hỗ trợ), thanh điều hướng đáy trên điện thoại, và khung ngoài cùng đặt
 * `h-svh overflow-hidden`. In đè lên đó phải: ẩn sáu khối ở một file bố cục
 * DÙNG CHUNG cho mọi màn, rồi vẫn kẹt vì `h-svh` cắt đúng một trang giấy — đơn
 * dài hơn là mất phần đuôi trong im lặng.
 * Trang riêng cũng cho phép mở ở màn thứ hai cạnh quầy, và dán được vào Zalo.
 *
 * ⚠️ TÊN GỌI LÀ "PHIẾU TÍNH TIỀN", KHÔNG PHẢI "HOÁ ĐƠN".
 *   iFan chưa nối nhà cung cấp hoá đơn điện tử (cần hợp đồng + chữ ký số của
 *   chủ tiệm). In ra tờ giấy đề chữ "Hoá đơn" khi nó không phải hoá đơn hợp lệ
 *   là để tiệm mang tiếng với thuế. Dòng cuối phiếu nói thẳng điều đó — KHÔNG
 *   được bỏ dòng ấy đi cho gọn.
 *
 * Quyền: không thêm gì mới. RLS `orders_select` quyết định ai đọc được đơn thì
 * người đó in được đơn — nhân viên vẫn chỉ thấy đơn của chính mình.
 */
export default async function TrangInDon({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: tenant }, order] = await Promise.all([
    supabase.from("tenants").select("id, name, tax_code, logo_url").maybeSingle(),
    getOrderDetail(supabase, id),
  ]);
  if (!tenant) redirect("/onboarding");
  if (!order) notFound();

  // Địa chỉ lấy từ trang mặt tiền — tiệm nào chưa khai thì BỎ DÒNG, không in
  // chỗ trống. Không có ô nào lưu SỐ ĐIỆN THOẠI TIỆM (đã ghi thành việc riêng).
  const { data: matTien } = await supabase
    .from("tenant_storefront")
    .select("address")
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  const t = await getTranslations("orders");
  const locale = (await getLocale()) as Locale;

  const tamTinh = order.lines.reduce((s, l) => s + l.qty * l.unitPriceVnd, 0);
  const tongGiam = order.lines.reduce((s, l) => s + l.discountVnd, 0);
  const vat = order.lines.reduce((s, l) => s + l.taxVnd, 0);
  const vatRate = order.lines.find((l) => l.taxVnd !== 0)?.taxRate ?? 0;
  const conThieu = order.totalVnd - order.paidVnd;
  const laPhieuHoan = order.kind === "return";

  return (
    <div className="min-h-svh bg-muted/40 p-4 print:bg-white print:p-0">
      <ThanhIn chuIn={t("print.printAgain")} chuDong={t("print.close")} />

      <div className="mx-auto max-w-[80mm] bg-white p-3 font-mono text-[11px] leading-[1.55] text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        {/* ── Đầu phiếu: in được gì thì in nấy ─────────────────────────── */}
        <div className="text-center">
          {tenant.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh của tiệm, đường dẫn tuỳ ý, không qua bộ tối ưu.
            <img src={tenant.logo_url} alt="" className="mx-auto mb-1 h-10 w-auto object-contain" />
          )}
          <div className="font-sans text-[14px] font-bold uppercase">{tenant.name}</div>
          {matTien?.address && <div className="text-[10px]">{matTien.address}</div>}
          {tenant.tax_code && <div className="text-[10px]">{t("print.taxCode", { code: tenant.tax_code })}</div>}
          <div className="mt-2 font-bold tracking-widest">
            {laPhieuHoan ? t("print.titleReturn") : t("print.title")}
          </div>
          <div className="tracking-wider">{maDon(order.id)}</div>
          <div className="text-[10px]">{formatDateTime(order.createdAt, locale)}</div>
        </div>

        <Ngan />

        <div>{t("print.customer", { name: order.contactName })}</div>
        {order.contactPhone && <div>{t("print.phone", { phone: order.contactPhone })}</div>}

        <Ngan />

        {/* ── Dòng hàng ────────────────────────────────────────────────────
            Hai dòng cho mỗi món: tên ở dòng trên (được xuống dòng thoải mái),
            "SL × đơn giá" và thành tiền ở dòng dưới. Ép bốn cột vào 80mm thì
            tên món dài bị cắt — mà tên món là thứ khách đối chiếu. */}
        {order.lines.map((l) => (
          <div key={l.id} className="mt-1 first:mt-0">
            <div className="break-words">
              {l.itemName}
              {l.variantLabel ? ` (${l.variantLabel})` : ""}
            </div>
            <div className="flex justify-between gap-2">
              <span>
                {"  "}
                {l.qty} × {formatMoney(l.unitPriceVnd, locale)}
              </span>
              <span className="tabular-nums">{formatMoney(l.qty * l.unitPriceVnd, locale)}</span>
            </div>
            {l.discountVnd > 0 && (
              <div className="flex justify-between gap-2">
                <span>{"  "}{t("addLine.discountLabel")}</span>
                <span className="tabular-nums">-{formatMoney(l.discountVnd, locale)}</span>
              </div>
            )}
          </div>
        ))}

        <Ngan />

        <Dong nhan={t("detail.subtotal")} tien={formatMoney(tamTinh, locale)} />
        {tongGiam > 0 && (
          <Dong nhan={t("addLine.discountLabel")} tien={`-${formatMoney(tongGiam, locale)}`} />
        )}
        <div className="mt-1 flex justify-between gap-2 text-[13px] font-bold">
          <span>{t("detail.total").toUpperCase()}</span>
          <span className="tabular-nums">{formatMoney(order.totalVnd, locale)}</span>
        </div>
        {vat !== 0 && (
          <Dong nhan={t("detail.vatIncluded", { rate: vatRate })} tien={formatMoney(vat, locale)} nho />
        )}

        {order.payments.map((p) => (
          <Dong
            key={p.id}
            nhan={t("print.paidVia", { method: t(`paymentDialog.methods.${p.method}`) })}
            tien={formatMoney(p.amountVnd, locale)}
          />
        ))}
        {!laPhieuHoan && conThieu > 0 && (
          <div className="flex justify-between gap-2 font-bold">
            <span>{t("detail.remaining")}</span>
            <span className="tabular-nums">{formatMoney(conThieu, locale)}</span>
          </div>
        )}

        <Ngan />

        <div className="text-center">{t("print.thanks")}</div>
        {/* ⚠️ KHÔNG BỎ DÒNG NÀY. Xem chú thích đầu file. */}
        <div className="mt-1 text-center text-[9px] leading-tight">{t("print.notAnInvoice")}</div>
      </div>
    </div>
  );
}

function Ngan() {
  return <div className="my-2 border-t border-dashed border-black/60" />;
}

function Dong({ nhan, tien, nho }: { nhan: string; tien: string; nho?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${nho ? "text-[10px]" : ""}`}>
      <span>{nhan}</span>
      <span className="tabular-nums">{tien}</span>
    </div>
  );
}

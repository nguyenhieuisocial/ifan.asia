"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronLeft, Lock, Plus, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { InternalChat } from "@/components/internal-chat/internal-chat";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import type { MucTon } from "@/lib/stock/ledger";
import { soLuong } from "../so-luong";
import { layThemPhieuNhap, taoPhieuNhap, themNhaCungCap } from "./actions";
import type { DongPhieuNhap } from "./queries";
import type { NhaCungCap } from "./queries";

const TOAST_KEYS = new Set([
  "saved",
  "invalidInput",
  "notAuthenticated",
  "forbidden",
  "notFound",
  "saveFailed",
  "loadFailed",
  "supplierRequired",
  "noLines",
  "qtyInvalid",
  "factorInvalid",
  "supplierNameRequired",
]);
const ERROR_TO_TOAST_KEY: Record<string, string> = {
  invalid_input: "invalidInput",
  not_authenticated: "notAuthenticated",
  forbidden: "forbidden",
  not_found: "notFound",
  load_failed: "loadFailed",
};
function toastKeyFor(error: string | null | undefined): string {
  const key = error ? (ERROR_TO_TOAST_KEY[error] ?? "") : "";
  return TOAST_KEYS.has(key) ? key : "saveFailed";
}

const chiSo = (v: string) => v.replace(/\D/g, "");
const soThapPhan = (v: string) => v.replace(/[^\d.,]/g, "").replace(",", ".");

type DongForm = { key: number; itemId: string; qty: string; heSo: string; gia: string };

let demKhoa = 0;
const dongTrong = (): DongForm => ({ key: ++demKhoa, itemId: "", qty: "", heSo: "1", gia: "" });

/** Ô thêm nhà cung cấp — mở ngay trong phiếu, đúng ba ô (tên · điện thoại · ghi chú). */
function FormNhaCungCap({ onXong, onDong }: { onXong: (ncc: NhaCungCap) => void; onDong: () => void }) {
  const t = useTranslations("stock.purchases");
  const [ten, setTen] = useState("");
  const [dienThoai, setDienThoai] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [pending, startTransition] = useTransition();

  const luu = () => {
    if (!ten.trim()) {
      toast.error(t("toasts.supplierNameRequired"));
      return;
    }
    startTransition(async () => {
      const res = await themNhaCungCap({ ten, dienThoai: dienThoai.trim() || null, ghiChu: ghiChu.trim() || null });
      if (res.error || !res.id) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      toast.success(t("toasts.supplierSaved"));
      onXong({ id: res.id, ten: ten.trim(), dienThoai: dienThoai.trim() || null, ghiChu: ghiChu.trim() || null });
    });
  };

  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <div>
        <Label className="text-[11px] text-muted-foreground">{t("supplierNameLabel")}</Label>
        <Input value={ten} onChange={(e) => setTen(e.target.value)} maxLength={120} className="h-9" autoFocus />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <Label className="text-[11px] text-muted-foreground">{t("supplierPhoneLabel")}</Label>
          <Input inputMode="tel" value={dienThoai} onChange={(e) => setDienThoai(e.target.value)} maxLength={30} className="h-9" />
        </div>
        <div className="flex-1">
          <Label className="text-[11px] text-muted-foreground">{t("supplierNoteLabel")}</Label>
          <Input value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} maxLength={500} className="h-9" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDong} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button size="sm" onClick={luu} disabled={pending}>
          {pending ? t("saving") : t("saveSupplier")}
        </Button>
      </div>
    </div>
  );
}

export function PurchasesView({
  canManage,
  loadFailed,
  hangHoa,
  nhaCungCap,
  phieu,
  cursorTiep,
  tenThanhVien,
  homNay,
  moTraoDoiId = null,
}: {
  canManage: boolean;
  loadFailed: boolean;
  hangHoa: MucTon[];
  nhaCungCap: NhaCungCap[];
  phieu: DongPhieuNhap[];
  cursorTiep: string | null;
  tenThanhVien: Record<string, string>;
  homNay: string;
  /**
   * Mã phiếu mà thông báo gọi tên vừa dẫn tới (`?d=`, migration #294). Phiếu đó
   * được bung sẵn khung trao đổi, tô nền hổ phách và cuộn tới nơi.
   */
  moTraoDoiId?: string | null;
}) {
  const t = useTranslations("stock.purchases");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [dsNcc, setDsNcc] = useState<NhaCungCap[]>(nhaCungCap);
  const [moForm, setMoForm] = useState(false);
  const [moNcc, setMoNcc] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [ngay, setNgay] = useState(homNay);
  const [dong, setDong] = useState<DongForm[]>([dongTrong()]);
  const [pending, startTransition] = useTransition();

  const [themPhieu, setThemPhieu] = useState<DongPhieuNhap[]>([]);
  const [cursor, setCursor] = useState<string | null>(cursorTiep);
  const [dangTaiThem, batDauTaiThem] = useTransition();

  // Máy chủ gửi dữ liệu mới (sau khi lưu phiếu / thêm nhà cung cấp) ⇒ dọn phần
  // người dùng đã tải thêm ở phía trình duyệt, nếu không danh sách có dòng lặp.
  //
  // ⚠️ KHÔNG làm việc này trong `useEffect`. Đặt lại state trong effect khiến
  // React vẽ MỘT LẦN bằng dữ liệu cũ rồi mới vẽ lại bằng dữ liệu mới — người
  // dùng thấy chớp một nhịp dữ liệu sai, và ESLint chặn (`set-state-in-effect`,
  // làm CI đỏ 3 lượt liên tiếp 18-19/08 mà không ai để ý vì Vercel dựng riêng).
  // Khuôn dưới đây là cách React khuyến nghị: so sánh prop cũ/mới NGAY TRONG
  // lúc vẽ, đổi state trước khi khung hình đầu tiên hiện ra.
  const [phieuTruoc, setPhieuTruoc] = useState(phieu);
  const [cursorTruoc, setCursorTruoc] = useState(cursorTiep);
  if (phieu !== phieuTruoc || cursorTiep !== cursorTruoc) {
    setPhieuTruoc(phieu);
    setCursorTruoc(cursorTiep);
    setThemPhieu([]);
    setCursor(cursorTiep);
  }

  const [nccTruoc, setNccTruoc] = useState(nhaCungCap);
  if (nhaCungCap !== nccTruoc) {
    setNccTruoc(nhaCungCap);
    setDsNcc(nhaCungCap);
  }

  // Cuộn tới đúng phiếu mà thông báo vừa dẫn tới. CHỈ ĐỌC DOM, không đặt lại
  // state — nên không phạm luật `set-state-in-effect` mà khối chú thích ngay
  // trên vừa nhắc. Chạy sau khi vẽ xong, lúc đó hàng phiếu đã có trong DOM.
  useEffect(() => {
    if (!moTraoDoiId) return;
    document.getElementById(`phieu-nhap-${moTraoDoiId}`)?.scrollIntoView({ block: "center" });
  }, [moTraoDoiId]);

  if (!canManage) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Lock className="size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t("noPermission.title")}</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">{t("noPermission.description")}</p>
      </div>
    );
  }

  const donVi = (itemId: string) => hangHoa.find((h) => h.itemId === itemId)?.donVi ?? "";
  const giaVonDangGiu = (itemId: string) => hangHoa.find((h) => h.itemId === itemId)?.giaVon ?? null;

  const tongTien = dong.reduce((s, d) => {
    const q = Number(d.qty);
    const g = Number(d.gia);
    return s + (Number.isFinite(q) && Number.isFinite(g) ? q * g : 0);
  }, 0);

  const doiDong = (key: number, vaSua: Partial<DongForm>) =>
    setDong((cu) => cu.map((d) => (d.key === key ? { ...d, ...vaSua } : d)));

  const luuPhieu = () => {
    if (!supplierId) {
      toast.error(t("toasts.supplierRequired"));
      return;
    }
    const coHang = dong.filter((d) => d.itemId);
    if (coHang.length === 0) {
      toast.error(t("toasts.noLines"));
      return;
    }
    const chuanBi = coHang.map((d) => ({
      itemId: d.itemId,
      qtyMua: Number(d.qty),
      heSo: Number(d.heSo),
      donGiaMua: Number(d.gia || "0"),
    }));
    if (chuanBi.some((d) => !Number.isFinite(d.qtyMua) || d.qtyMua <= 0)) {
      toast.error(t("toasts.qtyInvalid"));
      return;
    }
    if (chuanBi.some((d) => !Number.isFinite(d.heSo) || d.heSo <= 0)) {
      toast.error(t("toasts.factorInvalid"));
      return;
    }

    startTransition(async () => {
      const res = await taoPhieuNhap({ supplierId, ngayNhap: ngay, ghiChu: null, dong: chuanBi });
      if (res.error) {
        // Lưu hỏng thì CẢ PHIẾU CÒN NGUYÊN — bấm lại là xong, không phải gõ lại
        // mười dòng hàng. Đây là màn gõ lâu nhất mảng kho.
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      toast.success(t("toasts.saved"));
      setMoForm(false);
      setSupplierId("");
      setNgay(homNay);
      setDong([dongTrong()]);
      router.refresh();
    });
  };

  const taiThem = () => {
    if (!cursor) return;
    batDauTaiThem(async () => {
      const kq = await layThemPhieuNhap(cursor);
      if (kq.error) {
        toast.error(t(`toasts.${toastKeyFor(kq.error)}`));
        return;
      }
      setThemPhieu((cu) => [...cu, ...kq.phieu]);
      setCursor(kq.cursorTiep);
    });
  };

  const danhSach = [...phieu, ...themPhieu];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Nới từ mốc lg như mọi màn danh sách khác của kho (khuôn ở
            `orders-view`). Trước bản này màn khoá cứng 672px, nên trên màn
            2560px nó là một dải hẹp giữa hai vùng trống — mà đây đúng là loại
            màn càng nhiều dòng càng cần bề ngang. */}
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 pb-24 sm:p-6 lg:max-w-5xl xl:max-w-7xl 2xl:max-w-[1600px]">
          <Link href="/app/stock" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" />
            {t("backToStock")}
          </Link>

          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">{t("title")}</h1>
              <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
            </div>
            {!moForm && !loadFailed && (
              <Button size="sm" onClick={() => setMoForm(true)}>
                <Plus className="size-4" />
                {t("addNew")}
              </Button>
            )}
          </div>

          {loadFailed ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-5 text-center text-[13px] text-destructive">
              {t("loadFailed")}
            </p>
          ) : (
            <>
              {moForm && (
                <div className="space-y-3 rounded-lg border-2 border-primary/50 bg-muted/20 p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-40 flex-1">
                      <Label className="text-[11px] text-muted-foreground">{t("supplierLabel")}</Label>
                      <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-9">
                        <option value="">{t("supplierPlaceholder")}</option>
                        {dsNcc.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.ten}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="w-36">
                      <Label className="text-[11px] text-muted-foreground">{t("dateLabel")}</Label>
                      <Input type="date" value={ngay} onChange={(e) => setNgay(e.target.value)} className="h-9" />
                    </div>
                    {!moNcc && (
                      <Button variant="outline" size="sm" onClick={() => setMoNcc(true)}>
                        {t("addSupplier")}
                      </Button>
                    )}
                  </div>

                  {moNcc && (
                    <FormNhaCungCap
                      onDong={() => setMoNcc(false)}
                      onXong={(ncc) => {
                        setDsNcc((cu) => [...cu, ncc].sort((a, b) => a.ten.localeCompare(b.ten)));
                        setSupplierId(ncc.id);
                        setMoNcc(false);
                      }}
                    />
                  )}

                  <div className="space-y-3 rounded-md border bg-background p-3">
                    {dong.map((d) => {
                      const q = Number(d.qty);
                      const h = Number(d.heSo);
                      const g = Number(d.gia);
                      const hopLe = Number.isFinite(q) && q > 0 && Number.isFinite(h) && h > 0;
                      const dv = donVi(d.itemId);
                      const vonCu = giaVonDangGiu(d.itemId);
                      return (
                        <div key={d.key} className="border-b pb-3 last:border-b-0 last:pb-0">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <Label className="text-[11px] text-muted-foreground">{t("itemLabel")}</Label>
                              <Select value={d.itemId} onChange={(e) => doiDong(d.key, { itemId: e.target.value })} className="h-9">
                                <option value="">{t("itemPlaceholder")}</option>
                                {hangHoa.map((h2) => (
                                  <option key={h2.itemId} value={h2.itemId}>
                                    {h2.ten}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            {dong.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setDong((cu) => cu.filter((x) => x.key !== d.key))}
                                aria-label={t("removeLine")}
                                className="mt-4 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
                              >
                                <X className="size-4" />
                              </button>
                            )}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <div className="w-24">
                              <Label className="text-[11px] text-muted-foreground">{t("qtyLabel")}</Label>
                              <Input
                                inputMode="decimal"
                                value={d.qty}
                                onChange={(e) => doiDong(d.key, { qty: soThapPhan(e.target.value).slice(0, 12) })}
                                className="h-9"
                              />
                            </div>
                            <div className="w-24">
                              <Label className="text-[11px] text-muted-foreground">{t("factorLabel")}</Label>
                              <Input
                                inputMode="decimal"
                                value={d.heSo}
                                onChange={(e) => doiDong(d.key, { heSo: soThapPhan(e.target.value).slice(0, 12) })}
                                className="h-9"
                              />
                            </div>
                            <div className="min-w-32 flex-1">
                              <Label className="text-[11px] text-muted-foreground">{t("unitPriceLabel")}</Label>
                              <Input
                                inputMode="numeric"
                                value={d.gia}
                                onChange={(e) => doiDong(d.key, { gia: chiSo(e.target.value).slice(0, 12) })}
                                className="h-9"
                              />
                            </div>
                          </div>

                          {/* Câu người nhập cần đọc để biết mình gõ đúng chưa —
                              giữ nguyên ở mọi khổ màn. */}
                          {d.itemId && hopLe && (
                            <div className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                              {t("preview.toStock", { qty: soLuong(q * h, locale), unit: dv || t("unitFallback") })}
                              {Number.isFinite(g) && g > 0 && (
                                <>
                                  {" · "}
                                  {t("preview.newCost", {
                                    amount: formatMoney(Math.round(g / h), locale),
                                    unit: dv || t("unitFallback"),
                                  })}
                                  {vonCu !== null && vonCu !== Math.round(g / h) && (
                                    <> {t("preview.oldCost", { amount: formatMoney(vonCu, locale) })}</>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <Button variant="outline" size="sm" onClick={() => setDong((cu) => [...cu, dongTrong()])}>
                      <Plus className="size-4" />
                      {t("addLine")}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">{t("total")}</span>
                    <span className="text-[17px] font-semibold">{formatMoney(Math.round(tongTien), locale)}</span>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setMoForm(false)} disabled={pending}>
                      {t("cancel")}
                    </Button>
                    <Button size="sm" onClick={luuPhieu} disabled={pending}>
                      {pending ? t("saving") : t("save")}
                    </Button>
                  </div>

                  <p className="text-[11px] leading-relaxed text-muted-foreground">{t("noCashEntryHint")}</p>
                </div>
              )}

              {danhSach.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-8 text-center">
                  <Truck className="size-8 text-muted-foreground/50" />
                  <p className="text-[13px] text-muted-foreground">{t("empty")}</p>
                </div>
              ) : (
                <div className="divide-y rounded-md border">
                  {danhSach.map((p) => (
                    <div
                      key={p.id}
                      id={`phieu-nhap-${p.id}`}
                      className={cn(
                        "space-y-2 p-2.5",
                        // Nền hổ phách = "đây là phiếu thông báo vừa dẫn tới".
                        // Cùng họ màu với khung trao đổi nội bộ nên đọc ra ngay
                        // là một chuyện, không phải trạng thái mới của phiếu.
                        moTraoDoiId === p.id && "bg-amber-50/60 dark:bg-amber-950/20",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-medium">
                            {p.nhaCungCap ?? t("noSupplier")}
                            {p.trangThai !== "completed" && (
                              <span className="ml-1.5 rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-medium text-stone-700">
                                {t(`statuses.${p.trangThai === "cancelled" ? "cancelled" : "draft"}`)}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {formatDate(p.ngayNhap ?? p.taoLuc, locale)} · {t("lineCount", { count: p.soDong })} ·{" "}
                            {t("recordedBy", { name: (p.nguoiGhi && tenThanhVien[p.nguoiGhi]) || t("unknownMember") })}
                          </div>
                        </div>
                        <div className="shrink-0 text-[13px] font-medium">{formatMoney(Math.round(p.tongTien), locale)}</div>
                      </div>
                      {/* Trao đổi nội bộ về đúng phiếu nhập này (thẻ
                          man-chat-noi-bo, migration #169 — "phiếu kho" là một
                          trong bốn thứ thread được phép treo vào). */}
                      <InternalChat
                        entityType="stock_doc"
                        entityId={p.id}
                        defaultOpen={moTraoDoiId === p.id}
                      />
                    </div>
                  ))}
                </div>
              )}

              {cursor && (
                <button
                  type="button"
                  onClick={taiThem}
                  disabled={dangTaiThem}
                  className="w-full rounded-md border py-2 text-[13px] font-medium hover:bg-muted/60 disabled:opacity-60"
                >
                  {dangTaiThem ? t("loadingMore") : t("more")}
                </button>
              )}

              <p className="text-[11px] leading-relaxed text-muted-foreground">{t("immutableHint")}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

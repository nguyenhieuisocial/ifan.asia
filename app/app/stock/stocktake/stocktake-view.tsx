"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Boxes,
  ChevronLeft,
  ClipboardList,
  Lock,
  CheckCircle2,
  X,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { InternalChat } from "@/components/internal-chat/internal-chat";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { soLuong } from "../so-luong";
import {
  taoPhienKiemKe,
  capNhatDongKiemKe,
  chotPhienKiemKe,
  huyPhienKiemKe,
} from "./actions";
import {
  PHIEN_CU_LIMIT,
  type StocktakeInfo,
  type StocktakeLine,
  type PhienCu,
} from "./queries";

// Danh sách lý do hợp lệ theo DB constraint
const LY_DO_VALUES = ["vo_hong", "het_han", "mat", "ghi_nham"] as const;
type LyDo = (typeof LY_DO_VALUES)[number];

/** Parse số lượng, chấp nhận cả dấu phẩy và chấm thập phân. */
function parseQty(s: string): number {
  return parseFloat(s.replace(",", ".").replace(/\s/g, ""));
}

/** Trạng thái edit từng dòng — tách khỏi dữ liệu gốc từ server. */
type LineEdit = {
  demStr: string; // giá trị đang hiển thị trong ô input
  lyDo: string | null;
  saving: boolean;
};

function khoiTaoEditState(lines: StocktakeLine[]): Record<string, LineEdit> {
  const state: Record<string, LineEdit> = {};
  for (const l of lines) {
    state[l.id] = {
      demStr: String(l.demThucTe),
      lyDo: l.lyDo,
      saving: false,
    };
  }
  return state;
}

export function StocktakeView({
  canManage,
  loadFailed,
  phienHienTai,
  phienCu,
  moTraoDoiId = null,
}: {
  canManage: boolean;
  loadFailed: boolean;
  phienHienTai: StocktakeInfo | null;
  phienCu: PhienCu[];
  /**
   * Mã phiếu mà thông báo gọi tên vừa dẫn tới (`?d=`, migration #294). Phiếu đó
   * được bung sẵn khung trao đổi và cuộn tới nơi — thẻ hứa "bấm vào là mở
   * thẳng, không phải đi tìm", mà phiếu được nhắc thường nằm dưới màn hình.
   */
  moTraoDoiId?: string | null;
}) {
  const t = useTranslations("stock.stocktake");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [editState, setEditState] = useState<Record<string, LineEdit>>(() =>
    khoiTaoEditState(phienHienTai?.lines ?? []),
  );
  const [pendingStart, startStartTransition] = useTransition();
  const [pendingComplete, startCompleteTransition] = useTransition();
  const [pendingCancel, startCancelTransition] = useTransition();

  // Cuộn tới đúng phiếu mà thông báo vừa dẫn tới. KHÔNG gọi setState trong
  // thân effect (luật `react-hooks/set-state-in-effect` của kho), chỉ đọc DOM.
  useEffect(() => {
    if (!moTraoDoiId) return;
    document
      .getElementById(`phien-kiem-ke-${moTraoDoiId}`)
      ?.scrollIntoView({ block: "center" });
  }, [moTraoDoiId]);

  // Cập nhật state một dòng
  const setLineEdit = (lineId: string, patch: Partial<LineEdit>) => {
    setEditState((prev) => ({
      ...prev,
      [lineId]: { ...prev[lineId], ...patch },
    }));
  };

  // ───────────────────────────────────────────
  // Hành động phiên
  // ───────────────────────────────────────────

  const batDauKiemKe = () => {
    startStartTransition(async () => {
      const res = await taoPhienKiemKe();
      if (res.error === "already_active") {
        toast.error(t("toasts.alreadyActive"));
        router.refresh();
        return;
      }
      if (res.error || !res.stocktakeId) {
        toast.error(t("toasts.startFailed"));
        return;
      }
      toast.success(t("toasts.started"));
      router.refresh();
    });
  };

  /**
   * Hai việc dưới đây KHÔNG HOÀN TÁC ĐƯỢC nên phải hỏi lại trước khi chạy.
   *
   * ⚠️ Câu hỏi "Huỷ phiên kiểm kê này? Dữ liệu đã nhập sẽ bị xoá." đã nằm sẵn
   * trong bộ chữ từ lâu (`active.confirmCancel`) mà KHÔNG chỗ nào gọi tới —
   * tức bước xác nhận từng được thiết kế rồi bị gỡ, và không ai ghi lại vì
   * sao. Một câu chữ mồ côi kiểu đó là dấu vết của một quyết định bị mất.
   */
  const [hoi, setHoi] = useState<null | "chot" | "huy">(null);

  const chotPhien = (stocktakeId: string) => {
    startCompleteTransition(async () => {
      const res = await chotPhienKiemKe(stocktakeId);
      if (res.error) {
        toast.error(t("toasts.completeFailed"));
        return;
      }
      toast.success(t("toasts.completed"));
      router.refresh();
    });
  };

  const huyPhien = (stocktakeId: string) => {
    startCancelTransition(async () => {
      const res = await huyPhienKiemKe(stocktakeId);
      if (res.error) {
        toast.error(t("toasts.cancelFailed"));
        return;
      }
      toast.success(t("toasts.cancelled"));
      router.refresh();
    });
  };

  // ───────────────────────────────────────────
  // Lưu tự động từng dòng khi blur
  // ───────────────────────────────────────────

  const luuDong = async (line: StocktakeLine, demStr: string, lyDo: string | null) => {
    const parsed = parseQty(demStr);
    if (!Number.isFinite(parsed) || parsed < 0) {
      // Giá trị không hợp lệ — reset về giá trị đã lưu gần nhất
      setLineEdit(line.id, { demStr: String(line.demThucTe) });
      toast.error(t("toasts.saveFailed"));
      return;
    }

    // Khi dem = ton → tự xoá ly_do (không còn chênh lệch, không cần lý do)
    const lyDoLuu = parsed === line.tonTheoSo ? null : lyDo;

    setLineEdit(line.id, { saving: true });
    const res = await capNhatDongKiemKe({
      lineId: line.id,
      demThucTe: parsed,
      lyDo: lyDoLuu as LyDo | null,
    });
    setLineEdit(line.id, { saving: false, lyDo: lyDoLuu });
    if (res.error) {
      toast.error(t("toasts.saveFailed"));
    }
  };

  const luuLyDo = async (line: StocktakeLine, lyDo: string | null, demStr: string) => {
    const parsed = parseQty(demStr);
    if (!Number.isFinite(parsed) || parsed < 0) return; // chờ blur sửa dem trước

    setLineEdit(line.id, { saving: true, lyDo });
    const res = await capNhatDongKiemKe({
      lineId: line.id,
      demThucTe: parsed,
      lyDo: lyDo as LyDo | null,
    });
    setLineEdit(line.id, { saving: false });
    if (res.error) {
      toast.error(t("toasts.saveFailed"));
    }
  };

  // ───────────────────────────────────────────
  // Render: no permission
  // ───────────────────────────────────────────

  if (!canManage) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Lock className="size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t("noPermission.title")}</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">{t("noPermission.description")}</p>
      </div>
    );
  }

  // ───────────────────────────────────────────
  // Render chính
  // ───────────────────────────────────────────

  // Đếm số dòng đang chênh lệch theo state cục bộ
  const soChenhLech = phienHienTai
    ? phienHienTai.lines.filter((l) => {
        const edit = editState[l.id];
        const dem = edit ? parseQty(edit.demStr) : l.demThucTe;
        return Number.isFinite(dem) && dem !== l.tonTheoSo;
      }).length
    : 0;

  // ⚠️ HAI LỚP VÙNG CUỘN — bắt buộc. Khung /app đặt màn vào
  // `<div className="flex min-h-0 flex-1 flex-col overflow-hidden">`: hộp CAO
  // CỐ ĐỊNH, cắt phần thừa. Màn nào không tự có lớp cuộn thì phần dài quá màn
  // hình bị CẮT và không có cách nào với tới — máy tính ít lộ vì màn rộng,
  // điện thoại là hỏng hẳn (đo 19/08: hai màn khác mất >1.500px nội dung và
  // nút Lưu nằm ngoài màn hình). Khuôn chép từ Bảng lương/Dự án.
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
          {/* Breadcrumb */}
          <Link
            href="/app/stock"
            className="flex w-fit items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            {t("backToStock")}
          </Link>

          {/* Tiêu đề trang */}
          <div>
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
          </div>

          {/* Lỗi tra cứu */}
          {loadFailed && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-5 text-center text-[13px] text-destructive">
              {t("loadFailed")}
            </p>
          )}

          {/* Không có phiên đang mở — hiện nút Bắt đầu */}
          {!loadFailed && !phienHienTai && (
            <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-8 text-center">
              <ClipboardList className="size-9 text-muted-foreground/50" />
              <Button onClick={batDauKiemKe} disabled={pendingStart}>
                {pendingStart ? (
                  <RefreshCw className="mr-2 size-4 animate-spin" />
                ) : (
                  <Boxes className="mr-2 size-4" />
                )}
                {t("start")}
              </Button>
            </div>
          )}

          {/* Phiên đang mở */}
          {!loadFailed && phienHienTai && (
            <div className="space-y-3" id={`phien-kiem-ke-${phienHienTai.id}`}>
              {/* Header phiên */}
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5">
                <div>
                  <p className="text-[14px] font-medium">{t("active.title")}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatDate(phienHienTai.createdAt, locale)}
                    {soChenhLech > 0 && (
                      <>
                        {" · "}
                        <span className="text-amber-600 dark:text-amber-400">
                          {t("active.discrepancies", { count: soChenhLech })}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setHoi("huy")}
                    disabled={pendingComplete || pendingCancel}
                  >
                    {pendingCancel ? (
                      <RefreshCw className="mr-1 size-3.5 animate-spin" />
                    ) : (
                      <X className="mr-1 size-3.5" />
                    )}
                    {pendingCancel ? t("active.cancelling") : t("active.cancelBtn")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setHoi("chot")}
                    disabled={pendingComplete || pendingCancel}
                  >
                    {pendingComplete ? (
                      <RefreshCw className="mr-1 size-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-1 size-3.5" />
                    )}
                    {pendingComplete ? t("active.completing") : t("active.completeBtn")}
                  </Button>
                </div>
              </div>

              {/* Hộp hỏi lại cho HAI việc không hoàn tác được. Nút "Chốt" nói
                  rõ hậu quả (tồn kho ghi theo số vừa đếm, phiên khoá lại), nút
                  "Huỷ" nói rõ mất gì (dữ liệu đã nhập bị xoá) — không hỏi
                  "Bạn có chắc không?", vì câu đó không cho người ta thêm thông
                  tin nào để quyết. */}
              <Dialog open={hoi !== null} onOpenChange={(m) => !m && setHoi(null)}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {hoi === "huy"
                        ? t("active.confirmCancelTitle")
                        : t("active.confirmCompleteTitle")}
                    </DialogTitle>
                    <DialogDescription>
                      {hoi === "huy"
                        ? t("active.confirmCancel")
                        : t("active.confirmComplete")}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="ghost"
                      onClick={() => setHoi(null)}
                      disabled={pendingComplete || pendingCancel}
                    >
                      {tCommon("cancel")}
                    </Button>
                    <Button
                      variant={hoi === "huy" ? "destructive" : "default"}
                      disabled={pendingComplete || pendingCancel}
                      onClick={() => {
                        const id = phienHienTai.id;
                        const viec = hoi;
                        setHoi(null);
                        if (viec === "huy") huyPhien(id);
                        else chotPhien(id);
                      }}
                    >
                      {hoi === "huy" ? t("active.cancelBtn") : t("active.completeBtn")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Trao đổi nội bộ về đúng phiên kiểm kê này. CSDL cho phép
                  `stock_doc` trỏ vào CẢ `purchases` LẪN `stocktakes` ngay từ
                  migration #169, nhưng màn Kiểm kê chưa từng nhúng khung này —
                  chính thẻ design gọi đó là "có cửa mà không có cánh". #294 lắp
                  cánh, không mở thêm cửa nào. */}
              <InternalChat
                entityType="stock_doc"
                entityId={phienHienTai.id}
                defaultOpen={moTraoDoiId === phienHienTai.id}
              />

              {/* Bảng dòng hàng */}
              {phienHienTai.lines.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-6 text-center">
                  <Boxes className="size-7 text-muted-foreground/40" />
                  <p className="text-[13px] text-muted-foreground">{t("active.items", { count: 0 })}</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b bg-muted/40 text-[11px] text-muted-foreground">
                        <th className="px-3 py-2 text-left font-medium">{t("lines.item")}</th>
                        <th className="px-3 py-2 text-right font-medium">{t("lines.tonTheoSo")}</th>
                        <th className="w-28 px-3 py-2 text-right font-medium">{t("lines.demThucTe")}</th>
                        <th className="px-3 py-2 text-right font-medium">{t("lines.chenhLech")}</th>
                        <th className="px-3 py-2 text-left font-medium">{t("lines.lyDo")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {phienHienTai.lines.map((line) => {
                        const edit = editState[line.id] ?? {
                          demStr: String(line.demThucTe),
                          lyDo: line.lyDo,
                          saving: false,
                        };
                        const demParsed = parseQty(edit.demStr);
                        const chenhLech = Number.isFinite(demParsed)
                          ? demParsed - line.tonTheoSo
                          : null;
                        const coChenhLech = chenhLech !== null && chenhLech !== 0;

                        return (
                          <tr key={line.id} className="hover:bg-muted/20">
                            {/* Tên mặt hàng */}
                            <td className="px-3 py-2">
                              <span className="font-medium">{line.ten}</span>
                              {line.donVi && (
                                <span className="ml-1 text-muted-foreground">
                                  ({line.donVi})
                                </span>
                              )}
                            </td>

                            {/* Tồn theo sổ */}
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                              {soLuong(line.tonTheoSo, locale)}
                              {line.donVi && (
                                <span className="ml-0.5 text-[11px]">{line.donVi}</span>
                              )}
                            </td>

                            {/* Đếm thực tế — ô input */}
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1 justify-end">
                                {edit.saving && (
                                  <RefreshCw className="size-3 shrink-0 animate-spin text-muted-foreground" />
                                )}
                                <Input
                                  className="h-8 w-24 text-right text-[13px] tabular-nums"
                                  value={edit.demStr}
                                  inputMode="decimal"
                                  onChange={(e) =>
                                    setLineEdit(line.id, { demStr: e.target.value })
                                  }
                                  onBlur={() => luuDong(line, edit.demStr, edit.lyDo)}
                                  disabled={edit.saving}
                                />
                              </div>
                            </td>

                            {/* Chênh lệch */}
                            <td className="px-3 py-2 text-right tabular-nums">
                              {chenhLech !== null ? (
                                <span
                                  className={
                                    chenhLech === 0
                                      ? "text-muted-foreground"
                                      : chenhLech > 0
                                        ? "font-medium text-emerald-600 dark:text-emerald-400"
                                        : "font-medium text-destructive"
                                  }
                                >
                                  {chenhLech > 0 ? "+" : ""}
                                  {soLuong(chenhLech, locale)}
                                </span>
                              ) : (
                                <AlertTriangle className="ml-auto size-3.5 text-amber-500" />
                              )}
                            </td>

                            {/* Lý do — chỉ hiện khi có chênh lệch */}
                            <td className="px-2 py-1.5">
                              {coChenhLech ? (
                                <Select
                                  className="h-8 min-w-28 text-[13px]"
                                  value={edit.lyDo ?? ""}
                                  onChange={(e) => {
                                    const val = e.target.value || null;
                                    setLineEdit(line.id, { lyDo: val });
                                    luuLyDo(line, val, edit.demStr);
                                  }}
                                  disabled={edit.saving}
                                >
                                  <option value="">{t("lines.lyDoPlaceholder")}</option>
                                  {LY_DO_VALUES.map((v) => (
                                    <option key={v} value={v}>
                                      {t(`reasons.${v}`)}
                                    </option>
                                  ))}
                                </Select>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("active.items", { count: phienHienTai.lines.length })}
              </p>
            </div>
          )}

          {/* Lịch sử phiên cũ */}
          {!loadFailed && phienCu.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-[13px] font-medium text-muted-foreground">{t("history.title")}</h2>
              <div className="divide-y rounded-md border">
                {phienCu.map((p) => (
                  <div
                    key={p.id}
                    id={`phien-kiem-ke-${p.id}`}
                    className={cn(
                      "space-y-2 px-3 py-2.5",
                      // Nền hổ phách nhạt = "đây là phiếu thông báo vừa dẫn tới".
                      // Cùng họ màu với khung trao đổi nội bộ nên đọc ra ngay là
                      // một chuyện, không phải một trạng thái mới của phiếu.
                      moTraoDoiId === p.id && "bg-amber-50/60 dark:bg-amber-950/20",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {p.status === "da_chot" ? (
                          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <X className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="text-[13px] font-medium">
                          {p.status === "da_chot"
                            ? t("history.closed")
                            : t("history.cancelled")}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatDate(p.closedAt ?? p.createdAt, locale)}
                        {p.status === "da_chot" && p.soChenhLech > 0 && (
                          <>
                            {" · "}
                            {t("history.discrepancies", { count: p.soChenhLech })}
                          </>
                        )}
                      </p>
                    </div>
                    <InternalChat
                      entityType="stock_doc"
                      entityId={p.id}
                      defaultOpen={moTraoDoiId === p.id}
                    />
                  </div>
                ))}
              </div>
              {/* Chạm trần thì NÓI RA — không để đọc thành "tiệm chỉ từng kiểm kê bấy nhiêu lần". */}
              {phienCu.length >= PHIEN_CU_LIMIT && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t("history.limitNote", { n: phienCu.length })}
                </p>
              )}
            </div>
          )}

          {!loadFailed && phienCu.length === 0 && !phienHienTai && (
            <p className="text-center text-[13px] text-muted-foreground">{t("history.empty")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Khoá i18n cần thêm vào messages/vi.json và messages/en.json dưới "stock.stocktake":
//
// title                           — tiêu đề màn (vd: "Kiểm kê kho")
// description                     — mô tả ngắn
// backToStock                     — nút quay lại (vd: "Quay về Kho")
// noPermission.title              — "Không có quyền truy cập"
// noPermission.description        — giải thích vai nào được vào
// loadFailed                      — "Không tải được dữ liệu, vui lòng thử lại"
// start                           — nút "Bắt đầu kiểm kê"
//
// active.title                    — "Phiên kiểm kê đang mở"
// active.completeBtn              — "Chốt phiên"
// active.cancelBtn                — "Huỷ phiên"
// active.completing               — "Đang chốt..."
// active.cancelling               — "Đang huỷ..."
// active.items                    — "{count} mặt hàng"
// active.discrepancies            — "{count} mặt hàng chênh lệch"
//
// lines.item                      — cột "Mặt hàng"
// lines.tonTheoSo                 — cột "Số sổ"
// lines.demThucTe                 — cột "Đếm thực tế"
// lines.chenhLech                 — cột "Chênh lệch"
// lines.lyDo                      — cột "Lý do"
// lines.lyDoPlaceholder           — "Chọn lý do..."
//
// reasons.vo_hong                 — "Vỡ/hỏng"
// reasons.het_han                 — "Hết hạn"
// reasons.mat                     — "Mất/thất lạc"
// reasons.ghi_nham                — "Ghi nhầm"
//
// history.title                   — "Lịch sử kiểm kê"
// history.closed                  — "Đã chốt"
// history.cancelled               — "Đã huỷ"
// history.discrepancies           — "{count} mặt hàng chênh lệch"
// history.empty                   — "Chưa có phiên kiểm kê nào"
// history.limitNote               — "Đang xem {n} phiên gần nhất…" (chỉ hiện khi chạm trần)
//
// toasts.started                  — "Đã tạo phiên kiểm kê"
// toasts.completed                — "Đã chốt phiên kiểm kê"
// toasts.cancelled                — "Đã huỷ phiên kiểm kê"
// toasts.startFailed              — "Không tạo được phiên, thử lại"
// toasts.completeFailed           — "Không chốt được phiên, thử lại"
// toasts.cancelFailed             — "Không huỷ được phiên, thử lại"
// toasts.saveFailed               — "Lưu không thành công, thử lại"
// toasts.alreadyActive            — "Đã có phiên đang đếm, tải lại trang"
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Locale } from "@/i18n/config";
import { formatDate, formatMoney } from "@/lib/format";
import { doiTrangThaiVoucher, luuLuatTichDiem, suaVoucher, taoVoucher } from "./actions";
import {
  VOUCHER_LIMIT,
  type LoyaltyDebt,
  type LoyaltyRules,
  type VoucherRow,
} from "./types";

/**
 * Màn Ưu đãi & Tích điểm (thẻ design `man-voucher-tich-diem.html`).
 *
 * Hai điều thẻ design nhấn mạnh và màn này phải giữ:
 *  - Voucher có BA TRẦN bắt buộc (lượt · tiền giảm tối đa mỗi đơn · hạn). Trần
 *    và mức đã tiêu luôn nằm cạnh nhau, không phải bấm vào mới thấy.
 *  - Điểm là NỢ, không phải quà — nên tổng nợ điểm nằm trên cùng, trước cả luật
 *    tích, để chủ tiệm thấy con số TRƯỚC KHI quyết tăng tỉ lệ tích.
 */

/**
 * Khoá lỗi server action có bản dịch trong `loyalty.errors.*`.
 * Mã lạ (zod đổi thông báo, lỗi Postgres mới) rơi về `save_failed` — vẫn BÁO,
 * chỉ là báo chung chung; im lặng mới là lỗi.
 */
const ERROR_KEYS = new Set([
  "forbidden",
  "trung_ma",
  "save_failed",
  "invalid_input",
  "ma_qua_ngan",
  "ma_qua_dai",
  "ma_ky_tu_la",
  "thieu_tran_luot",
  "thieu_tran_tien",
  "thieu_han",
  "thieu_gia_tri_giam",
  "han_da_qua",
  "moc_tich_qua_nho",
  "han_qua_ngan",
  "han_qua_dai",
  "tran_luot_thap_hon_da_dung",
  "no_tenant",
  "not_authenticated",
]);

function maLoi(code: string): string {
  return ERROR_KEYS.has(code) ? code : "save_failed";
}

/** Ô nhập số chỉ nhận chữ số — chủ tiệm gõ "10.000" thì lấy 10000. */
function chiSo(value: string): string {
  return value.replace(/\D/g, "").slice(0, 12);
}

function soNguyen(value: string): number {
  return value === "" ? 0 : Number(value);
}

/** Số đang lưu → chuỗi cho ô nhập; `null` (không đặt) khác hẳn 0. */
function soChuoi(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * Mốc thời gian đang lưu → `yyyy-mm-dd` theo giờ ĐỊA PHƯƠNG, cho ô `type=date`.
 * Cắt 10 ký tự đầu của chuỗi ISO là lấy ngày theo giờ UTC — với mã hết hạn lúc
 * 23:59:59 giờ Việt Nam thì đó là ngày HÔM TRƯỚC, và mỗi lần mở cửa sổ sửa rồi
 * lưu lại là hạn tự lùi thêm một ngày.
 */
function ngayDiaPhuong(iso: string): string {
  const d = new Date(iso);
  const hai = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${hai(d.getMonth() + 1)}-${hai(d.getDate())}`;
}

/**
 * Ô số dùng chung cho cả luật tích điểm lẫn biểu mẫu tạo mã.
 * Không tự thêm dấu "bắt buộc": ba nhãn trần trong messages đã ghi sẵn "(bắt
 * buộc)", và `form.capsWarning` trỏ đúng vào chữ đó — thêm dấu riêng ở đây là
 * hai nguồn sự thật, sửa một bên là lệch.
 */
function ONhapSo({
  id,
  label,
  hint,
  value,
  onValue,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onValue: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        inputMode="numeric"
        disabled={disabled}
        onChange={(e) => onValue(chiSo(e.target.value))}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Một dòng "nhãn — giá trị" của bản CHỈ ĐỌC. */
function DongLuat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/** Tổng nợ điểm — con số chủ tiệm không bao giờ tự tính. */
function KhoiNoDiem({ debt }: { debt: LoyaltyDebt | null }) {
  const t = useTranslations("loyalty");
  const locale = useLocale() as Locale;

  return (
    <section className="rounded-xl border bg-card p-4">
      <p className="text-[13px] font-semibold">{t("debt.title")}</p>
      {debt === null ? (
        <p className="mt-2 text-[13px] text-muted-foreground">{t("debt.empty")}</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold">
            {formatMoney(debt.noVnd, locale)}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("debt.points", {
              points: debt.diemChuaTieu,
              customers: debt.soKhach,
            })}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("debt.expiring", { points: debt.diemSapHetHan })}
          </p>
        </>
      )}
    </section>
  );
}

/**
 * Luật tích điểm. Không có quyền sửa thì hiện CHỈ ĐỌC chứ không ẩn: nhân viên
 * đứng quầy vẫn phải nói được luật cho khách nghe.
 */
function LuatTichDiem({
  rules,
  canManage,
}: {
  rules: LoyaltyRules;
  canManage: boolean;
}) {
  const t = useTranslations("loyalty");
  const locale = useLocale() as Locale;
  const nf = new Intl.NumberFormat(locale);
  const [pending, startTransition] = useTransition();
  const [isActive, setIsActive] = useState(rules.isActive);
  const [draft, setDraft] = useState({
    vndPerPoint: String(rules.vndPerPoint),
    redeemPointsUnit: String(rules.redeemPointsUnit),
    redeemValueVnd: String(rules.redeemValueVnd),
    referralPoints: String(rules.referralPoints),
    expireMonths: String(rules.expireMonths),
  });

  const doi = (key: keyof typeof draft) => (v: string) =>
    setDraft((d) => ({ ...d, [key]: v }));

  const luu = () => {
    if (pending) return;
    startTransition(async () => {
      const res = await luuLuatTichDiem({
        isActive,
        vndPerPoint: soNguyen(draft.vndPerPoint),
        redeemPointsUnit: soNguyen(draft.redeemPointsUnit),
        redeemValueVnd: soNguyen(draft.redeemValueVnd),
        referralPoints: soNguyen(draft.referralPoints),
        expireMonths: soNguyen(draft.expireMonths),
      });
      if (res.error) {
        toast.error(t(`errors.${maLoi(res.error)}`));
        return;
      }
      toast.success(t("toasts.saved"));
    });
  };

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold">{t("rules.title")}</h2>
        {!canManage && (
          <Badge variant={rules.isActive ? "secondary" : "outline"}>
            {t(rules.isActive ? "vouchers.statusActive" : "vouchers.statusPaused")}
          </Badge>
        )}
      </div>

      {canManage ? (
        <>
          <Label htmlFor="loyalty-active">
            <Checkbox
              id="loyalty-active"
              checked={isActive}
              disabled={pending}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            {t("rules.active")}
          </Label>

          <div className="grid gap-3 sm:grid-cols-2">
            <ONhapSo
              id="loyalty-vnd-per-point"
              label={t("rules.vndPerPoint")}
              value={draft.vndPerPoint}
              onValue={doi("vndPerPoint")}
              disabled={pending}
            />
            <ONhapSo
              id="loyalty-redeem-unit"
              label={t("rules.redeemUnit")}
              value={draft.redeemPointsUnit}
              onValue={doi("redeemPointsUnit")}
              disabled={pending}
            />
            <ONhapSo
              id="loyalty-redeem-value"
              label={t("rules.redeemValue")}
              value={draft.redeemValueVnd}
              onValue={doi("redeemValueVnd")}
              disabled={pending}
            />
            <ONhapSo
              id="loyalty-referral"
              label={t("rules.referral")}
              value={draft.referralPoints}
              onValue={doi("referralPoints")}
              disabled={pending}
            />
            <ONhapSo
              id="loyalty-expire-months"
              label={t("rules.expireMonths")}
              value={draft.expireMonths}
              onValue={doi("expireMonths")}
              disabled={pending}
            />
          </div>

          {/* Điểm là NỢ, không phải quà — nói ngay cạnh chỗ chỉnh tỉ lệ tích. */}
          <p className="flex items-start gap-1.5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{t("rules.hint")}</span>
          </p>

          <div className="flex justify-end">
            <Button onClick={luu} disabled={pending}>
              {t("rules.save")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t("rules.readonly")}</p>
          <div className="space-y-1.5 text-[13px]">
            <DongLuat
              label={t("rules.vndPerPoint")}
              value={formatMoney(rules.vndPerPoint, locale)}
            />
            <DongLuat
              label={t("rules.redeemUnit")}
              value={nf.format(rules.redeemPointsUnit)}
            />
            <DongLuat
              label={t("rules.redeemValue")}
              value={formatMoney(rules.redeemValueVnd, locale)}
            />
            <DongLuat
              label={t("rules.referral")}
              value={nf.format(rules.referralPoints)}
            />
            <DongLuat
              label={t("rules.expireMonths")}
              value={nf.format(rules.expireMonths)}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("rules.hint")}</p>
        </>
      )}
    </section>
  );
}

/**
 * Tạo mã. Ba trần (lượt · tiền giảm tối đa · hạn) được gom thành một khối riêng,
 * mỗi ô ghi rõ BẮT BUỘC kèm lý do — mã "giảm 15%" không trần tiền gặp đơn 20
 * triệu là mất 3 triệu trong một lần bấm, và không ai biết cho tới cuối tháng.
 */
function MaDialog({
  initial,
  onClose,
}: {
  /** Có = đang SỬA mã này. Không có = đang tạo mã mới. Một biểu mẫu, hai việc. */
  initial?: VoucherRow;
  onClose: () => void;
}) {
  const t = useTranslations("loyalty");
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState(initial?.code ?? "");
  const [kind, setKind] = useState<"percent" | "amount">(initial?.kind ?? "percent");
  const [percentOff, setPercentOff] = useState(soChuoi(initial?.percentOff));
  const [amountOffVnd, setAmountOffVnd] = useState(soChuoi(initial?.amountOffVnd));
  const [maxUses, setMaxUses] = useState(soChuoi(initial?.maxUses));
  const [maxDiscountVnd, setMaxDiscountVnd] = useState(soChuoi(initial?.maxDiscountVnd));
  const [expiresAt, setExpiresAt] = useState(
    initial ? ngayDiaPhuong(initial.expiresAt) : "",
  );
  const [minOrderVnd, setMinOrderVnd] = useState(soChuoi(initial?.minOrderVnd));
  const [perCustomerLimit, setPerCustomerLimit] = useState(soChuoi(initial?.perCustomerLimit));
  const [newCustomerOnly, setNewCustomerOnly] = useState(initial?.newCustomerOnly ?? false);
  const [note, setNote] = useState(initial?.note ?? "");

  /**
   * Mã đã có người dùng ⇒ nhóm trường TÍNH TIỀN bị khoá (lý do đầy đủ ghi ở
   * `suaVoucher` trong `actions.ts`).
   *
   * Khoá bằng cách KHÔNG VẼ ô ra, không phải bằng `disabled`: ô `disabled` vẫn
   * nằm trong state và vẫn được gửi lên cùng biểu mẫu — nó chỉ ngăn người dùng
   * gõ, không ngăn giá trị sai đi tới CSDL. Chốt chặn thật nằm ở `suaVoucher`,
   * chỗ này chỉ để người dùng không phải đoán vì sao ô biến mất.
   */
  const daDung = (initial?.usedCount ?? 0) > 0;

  const thieuGiaTri = kind === "percent" ? percentOff === "" : amountOffVnd === "";
  const chuaDu =
    code.trim().length < 3 ||
    thieuGiaTri ||
    maxUses === "" ||
    maxDiscountVnd === "" ||
    expiresAt === "";

  const gui = () => {
    if (pending || chuaDu) return;
    startTransition(async () => {
      const duLieu = {
        code: code.trim().toUpperCase(),
        kind,
        percentOff: kind === "percent" ? soNguyen(percentOff) : null,
        amountOffVnd: kind === "amount" ? soNguyen(amountOffVnd) : null,
        maxUses: soNguyen(maxUses),
        maxDiscountVnd: soNguyen(maxDiscountVnd),
        // Hạn tính tới HẾT ngày được chọn: chọn 31/08 mà hết hiệu lực lúc 0h
        // sáng 31/08 là mã chết sớm một ngày so với điều khách được nghe.
        expiresAt: new Date(`${expiresAt}T23:59:59`).toISOString(),
        minOrderVnd: soNguyen(minOrderVnd),
        perCustomerLimit: perCustomerLimit === "" ? null : soNguyen(perCustomerLimit),
        newCustomerOnly,
        note: note.trim() === "" ? null : note.trim(),
      };
      const res = initial ? await suaVoucher(initial.id, duLieu) : await taoVoucher(duLieu);
      if (res.error) {
        toast.error(t(`errors.${maLoi(res.error)}`));
        return;
      }
      toast.success(t(initial ? "toasts.updated" : "toasts.created"));
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* Lời giải thích ba trần nằm ngay CẠNH ba ô, không phải ở đầu hộp thoại —
          trên điện thoại người dùng cuộn qua nó từ lâu mới tới ô cần điền. */}
      <DialogContent
        className="sm:max-h-[85svh] sm:overflow-y-auto"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{t(initial ? "vouchers.edit" : "vouchers.create")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {daDung && (
            <p className="flex items-start gap-1.5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{t("form.lockedNote", { used: initial?.usedCount ?? 0 })}</span>
            </p>
          )}

          {!daDung && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="voucher-code">{t("form.code")}</Label>
                <Input
                  id="voucher-code"
                  value={code}
                  disabled={pending}
                  autoFocus
                  onChange={(e) =>
                    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="voucher-kind">{t("form.kind")}</Label>
                <Select
                  id="voucher-kind"
                  value={kind}
                  disabled={pending}
                  onChange={(e) => setKind(e.target.value as "percent" | "amount")}
                >
                  <option value="percent">{t("form.percent")}</option>
                  <option value="amount">{t("form.amount")}</option>
                </Select>
              </div>

              {kind === "percent" ? (
                <ONhapSo
                  id="voucher-percent"
                  label={t("form.percentOff")}
                  value={percentOff}
                  onValue={(v) => setPercentOff(v.slice(0, 3))}
                  disabled={pending}
                />
              ) : (
                <ONhapSo
                  id="voucher-amount"
                  label={t("form.amountOff")}
                  value={amountOffVnd}
                  onValue={setAmountOffVnd}
                  disabled={pending}
                />
              )}
            </>
          )}

          {/* Ba trần bắt buộc — gom một khối để không ai bỏ sót ô nào. */}
          <div className="space-y-3 rounded-lg border p-3">
            {/* Câu này đếm ĐÚNG BA ô. Mã đã dùng thì trần tiền không vẽ ra nữa,
                nên để nguyên câu là nói sai số ô đang nhìn thấy — phần vì sao
                thiếu ô đã nằm ở dòng giải thích trên đầu hộp thoại. */}
            {!daDung && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{t("form.capsWarning")}</span>
              </p>
            )}
            <ONhapSo
              id="voucher-max-uses"
              label={t("form.maxUses")}
              hint={daDung ? t("form.maxUsesFloor", { used: initial?.usedCount ?? 0 }) : t("form.maxUsesHint")}
              value={maxUses}
              onValue={setMaxUses}
              disabled={pending}
            />
            {!daDung && (
              <ONhapSo
                id="voucher-max-discount"
                label={t("form.maxDiscount")}
                hint={t("form.maxDiscountHint")}
                value={maxDiscountVnd}
                onValue={setMaxDiscountVnd}
                disabled={pending}
              />
            )}
            <div className="space-y-1.5">
              <Label htmlFor="voucher-expires">{t("form.expiresAt")}</Label>
              <Input
                id="voucher-expires"
                type="date"
                value={expiresAt}
                disabled={pending}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("form.expiresAtHint")}</p>
            </div>
          </div>

          <ONhapSo
            id="voucher-min-order"
            label={t("form.minOrder")}
            value={minOrderVnd}
            onValue={setMinOrderVnd}
            disabled={pending}
          />
          <ONhapSo
            id="voucher-per-customer"
            label={t("form.perCustomerLimit")}
            value={perCustomerLimit}
            onValue={setPerCustomerLimit}
            disabled={pending}
          />

          <Label htmlFor="voucher-new-only">
            <Checkbox
              id="voucher-new-only"
              checked={newCustomerOnly}
              disabled={pending}
              onChange={(e) => setNewCustomerOnly(e.target.checked)}
            />
            {t("form.newCustomerOnly")}
          </Label>

          <div className="space-y-1.5">
            <Label htmlFor="voucher-note">{t("form.note")}</Label>
            <Textarea
              id="voucher-note"
              value={note}
              rows={2}
              disabled={pending}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("form.cancel")}
          </Button>
          <Button onClick={gui} disabled={pending || chuaDu}>
            {t(initial ? "form.submitEdit" : "form.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Một mã: trần và mức đã tiêu nằm cạnh nhau, đúng thẻ design. */
function DongVoucher({
  voucher,
  canManage,
  pending,
  onToggle,
  onEdit,
}: {
  voucher: VoucherRow;
  canManage: boolean;
  pending: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations("loyalty");
  const locale = useLocale() as Locale;
  const dangChay = voucher.status === "active";
  const phanTram = Math.min(
    100,
    Math.round((voucher.usedCount / Math.max(voucher.maxUses, 1)) * 100),
  );

  // Viết THÀNH LỜI, không dùng ký hiệu toán. Người đọc dòng này là chủ tiệm và
  // nhân viên bán hàng đang đứng với khách — "≤ 100.000đ" bắt họ dịch một ký
  // hiệu, "tối đa 100.000đ" thì đọc là hiểu.
  const moTa = [
    voucher.kind === "percent"
      ? t("vouchers.offPercent", { percent: voucher.percentOff ?? 0 })
      : t("vouchers.offAmount", { amount: formatMoney(voucher.amountOffVnd ?? 0, locale) }),
    t("vouchers.capAmount", { amount: formatMoney(voucher.maxDiscountVnd, locale) }),
    ...(voucher.minOrderVnd > 0
      ? [t("vouchers.minOrder", { amount: formatMoney(voucher.minOrderVnd, locale) })]
      : []),
    ...(voucher.newCustomerOnly ? [t("vouchers.newOnly")] : []),
    ...(voucher.perCustomerLimit !== null
      ? [t("vouchers.perCustomer", { n: voucher.perCustomerLimit })]
      : []),
  ].join(" · ");

  return (
    <li className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{voucher.code}</span>
            <Badge variant={dangChay ? "secondary" : "outline"}>
              {t(dangChay ? "vouchers.statusActive" : "vouchers.statusPaused")}
            </Badge>
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">{moTa}</p>
          {/* Ghi chú nội bộ: nhập được từ đầu nhưng tới 19/08 mới có đường hiện
              ra. Để trong ngoặc kép cho khỏi lẫn với phần mô tả ưu đãi ở trên. */}
          {voucher.note && (
            <p className="mt-1 text-xs italic text-muted-foreground">{voucher.note}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <span className="text-xs text-muted-foreground">
            {t("vouchers.until", { date: formatDate(voucher.expiresAt, locale) })}
          </span>
          {canManage && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={pending} onClick={onEdit}>
                {t("vouchers.edit")}
              </Button>
              <Button
                variant={dangChay ? "outline" : "default"}
                size="sm"
                disabled={pending}
                onClick={onToggle}
              >
                {t(dangChay ? "vouchers.pause" : "vouchers.resume")}
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2.5">
        <p className="text-xs text-muted-foreground">
          {t("vouchers.used", { used: voucher.usedCount, max: voucher.maxUses })}
        </p>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${phanTram}%` }} />
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-3 text-xs">
          <span className="text-muted-foreground">{t("vouchers.discounted")}</span>
          <span className="font-medium text-destructive">
            −{formatMoney(voucher.totalDiscountVnd, locale)}
          </span>
        </div>
      </div>
    </li>
  );
}

export function LoyaltyView({
  vouchers,
  rules,
  debt,
  canManageVouchers,
  canManageRules,
  loadFailed,
}: {
  vouchers: VoucherRow[];
  rules: LoyaltyRules;
  debt: LoyaltyDebt | null;
  canManageVouchers: boolean;
  canManageRules: boolean;
  loadFailed: boolean;
}) {
  const t = useTranslations("loyalty");
  const [pending, startTransition] = useTransition();
  const [dangTao, setDangTao] = useState(false);
  /** Mã đang mở cửa sổ sửa. `null` = không sửa cái nào. */
  const [dangSua, setDangSua] = useState<VoucherRow | null>(null);

  const doiTrangThai = (voucher: VoucherRow) => {
    if (pending) return;
    startTransition(async () => {
      const res = await doiTrangThaiVoucher(
        voucher.id,
        voucher.status === "active" ? "paused" : "active",
      );
      if (res.error) {
        toast.error(t(`errors.${maLoi(res.error)}`));
        return;
      }
      toast.success(t("toasts.statusChanged"));
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Từ lg mới nới: liệt kê nợ điểm từng khách cộng danh sách voucher,
          khoá 672px thì tên khách dài bị cắt dòng. Dưới lg giữ nguyên. */}
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6 lg:max-w-5xl xl:max-w-7xl 2xl:max-w-[1600px]">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
        </div>

        {/* Tải hỏng thì NÓI RA. Hiện danh sách rỗng là nói dối "tiệm chưa có mã". */}
        {loadFailed ? (
          <p className="flex items-start gap-1.5 rounded-xl border p-6 text-[13px] text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{t("loadFailed")}</span>
          </p>
        ) : (
          <>
            <KhoiNoDiem debt={debt} />

            <LuatTichDiem rules={rules} canManage={canManageRules} />

            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[13px] font-semibold">{t("vouchers.title")}</h2>
                {canManageVouchers && (
                  <Button size="sm" disabled={pending} onClick={() => setDangTao(true)}>
                    <Plus className="size-4" />
                    {t("vouchers.create")}
                  </Button>
                )}
              </div>

              {vouchers.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-center text-[13px] text-muted-foreground">
                  {t("vouchers.empty")}
                </p>
              ) : (
                <ul className="divide-y rounded-xl border bg-card">
                  {vouchers.map((v) => (
                    <DongVoucher
                      key={v.id}
                      voucher={v}
                      canManage={canManageVouchers}
                      pending={pending}
                      onToggle={() => doiTrangThai(v)}
                      onEdit={() => setDangSua(v)}
                    />
                  ))}
                </ul>
              )}

              {/* Chạm trần thì NÓI RA — trần ngầm là lỗi đã dính nhiều lần. */}
              {vouchers.length >= VOUCHER_LIMIT && (
                <p className="text-center text-xs text-muted-foreground">
                  {t("limitNote", { limit: VOUCHER_LIMIT })}
                </p>
              )}
            </section>
          </>
        )}
      </div>

      {dangTao && <MaDialog onClose={() => setDangTao(false)} />}
      {/* `key` bắt React dựng lại state từ đầu khi đổi sang mã khác — thiếu nó
          thì cửa sổ giữ nguyên số của mã mở trước đó. */}
      {dangSua && (
        <MaDialog key={dangSua.id} initial={dangSua} onClose={() => setDangSua(null)} />
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  Copy,
  Megaphone,
  Plus,
  Send,
  ShieldOff,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import {
  CAMPAIGN_LIMIT,
  CONTACT_PREVIEW_LIMIT,
  SEND_RECIPIENT_LIMIT,
  SEND_SCOPES,
  type Campaign,
  type CampaignSend,
  type CampaignSummary,
  type ContactConsent,
  type ConsentTally,
  type SendBreakdown,
  type SendScope,
  type VoucherLink,
} from "./types";
import {
  capNhatChiPhiQuangCao,
  doiTrangThaiChienDich,
  ganMaVaoChienDich,
  ghiNhanDongY,
  guiTin,
  suaChienDich,
  taoChienDich,
  taoTongKet,
  xemTruocGuiTin,
} from "./actions";

const digitsOnly = (v: string) => v.replace(/\D/g, "");

/**
 * Mốc thời gian đang lưu → `yyyy-MM-ddTHH:mm` theo giờ ĐỊA PHƯƠNG, cho ô
 * `datetime-local`. Cắt chuỗi ISO là lấy giờ UTC — với giờ Việt Nam thì mỗi lần
 * mở cửa sổ sửa rồi lưu lại là mốc tự lùi 7 tiếng.
 */
function gioDiaPhuong(iso: string): string {
  const d = new Date(iso);
  const hai = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${hai(d.getMonth() + 1)}-${hai(d.getDate())}T${hai(d.getHours())}:${hai(d.getMinutes())}`;
}

function useBaoLoi() {
  const t = useTranslations("events");
  // Trả về `void` có chủ đích: các nút dùng `return baoLoi(...)` bên trong
  // `startTransition`, mà hàm truyền cho `startTransition` không được trả giá trị.
  return (code: string): void => {
    toast.error(t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.chua_luu_duoc"));
  };
}

// ==================== TẠO CHIẾN DỊCH ====================

function CampaignForm({
  initial,
  daPhatSinh,
  onDone,
}: {
  /** Có = đang SỬA chiến dịch này. Không có = đang tạo mới. Một biểu mẫu, hai việc. */
  initial?: Campaign;
  /**
   * Đã rời nháp / đã có lượt dùng mã / đã gửi tin ⇒ khoá ngày bắt đầu (lý do đầy
   * đủ ghi ở `suaChienDich` trong `actions.ts`).
   *
   * Cờ này chỉ để VẼ màn hình. `suaChienDich` tự đo lại từ CSDL và tự bỏ cột bị
   * khoá ra khỏi câu ghi — màn hình nói dối cờ này cũng không ghi được gì thêm.
   */
  daPhatSinh?: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("events");
  const locale = useLocale() as Locale;
  const baoLoi = useBaoLoi();
  const router = useRouter();
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    startAt: initial ? gioDiaPhuong(initial.startAt) : "",
    endAt: initial ? gioDiaPhuong(initial.endAt) : "",
    cap: initial ? String(initial.maxDiscountTotalVnd) : "",
    adCost: initial ? String(initial.adCostVnd) : "",
    offerNote: initial?.offerNote ?? "",
  });
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    startTransition(async () => {
      const duLieu = {
        name: form.name.trim(),
        // `datetime-local` trả giờ địa phương → chuyển ISO trước khi gửi.
        startAt: form.startAt ? new Date(form.startAt).toISOString() : new Date().toISOString(),
        endAt: form.endAt ? new Date(form.endAt).toISOString() : "",
        maxDiscountTotalVnd: parseInt(digitsOnly(form.cap) || "0", 10),
        adCostVnd: parseInt(digitsOnly(form.adCost) || "0", 10),
        offerNote: form.offerNote.trim() || null,
      };
      const res = initial ? await suaChienDich(initial.id, duLieu) : await taoChienDich(duLieu);
      if (res.error) return baoLoi(res.error);
      toast.success(t(initial ? "campaigns.updated" : "campaigns.created"));
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">{t(initial ? "campaigns.editTitle" : "campaigns.newTitle")}</h3>
      <div className="space-y-1.5">
        <Label>{t("campaigns.name")}</Label>
        <Input value={form.name} onChange={(e) => set("name")(e.target.value)} required maxLength={160} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Khoá bằng cách KHÔNG VẼ ô ra, không phải bằng `disabled`: ô `disabled`
            vẫn gửi giá trị lên được, nó chỉ ngăn người dùng gõ. */}
        {initial && daPhatSinh ? (
          <div className="space-y-1.5">
            <Label>{t("campaigns.startAt")}</Label>
            <p className="text-[13px]">{formatDateTime(initial.startAt, locale)}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("campaigns.startAtLocked")}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>{t("campaigns.startAt")}</Label>
            <Input
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => set("startAt")(e.target.value)}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label>{t("campaigns.endAt")}</Label>
          <Input
            type="datetime-local"
            value={form.endAt}
            onChange={(e) => set("endAt")(e.target.value)}
            required
          />
          <p className="text-xs leading-relaxed text-muted-foreground">{t("campaigns.endAtHint")}</p>
        </div>
        <div className="space-y-1.5">
          <Label>{t("campaigns.cap")}</Label>
          <Input
            value={form.cap}
            onChange={(e) => set("cap")(e.target.value)}
            onBlur={(e) => set("cap")(digitsOnly(e.target.value))}
            inputMode="numeric"
            placeholder="0"
            required
          />
          <p className="text-xs leading-relaxed text-muted-foreground">{t("campaigns.capHint")}</p>
        </div>
        <div className="space-y-1.5">
          <Label>{t("campaigns.adCost")}</Label>
          <Input
            value={form.adCost}
            onChange={(e) => set("adCost")(e.target.value)}
            onBlur={(e) => set("adCost")(digitsOnly(e.target.value))}
            inputMode="numeric"
            placeholder="0"
          />
          <p className="text-xs leading-relaxed text-muted-foreground">{t("campaigns.adCostHint")}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t("campaigns.offerNote")}</Label>
        <Input
          value={form.offerNote}
          onChange={(e) => set("offerNote")(e.target.value)}
          maxLength={500}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending || !form.name.trim() || !form.endAt || !form.cap}>
          {pending ? t("saving") : t(initial ? "campaigns.saveEdit" : "campaigns.save")}
        </Button>
      </div>
    </form>
  );
}

// ==================== BẢNG TRỪ ====================

/**
 * ĐÚNG bốn dòng trừ của thẻ design. Con số "thật sự gửi" phải nằm ở đây, TRƯỚC
 * nút bấm — không có nút "gửi hết" để bỏ qua bảng này.
 */
function BreakdownTable({ bang, title }: { bang: SendBreakdown; title: string }) {
  const t = useTranslations("events");
  return (
    <div className="space-y-1 rounded-md border bg-muted/20 p-3 text-xs">
      <div className="font-medium">{title}</div>
      <div className="flex justify-between">
        <span>{t("send.chosen")}</span>
        <span className="font-medium">{t("send.people", { n: bang.tepChon })}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>{t("send.minusUnknown")}</span>
        <span>−{bang.truChuaDongY}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>{t("send.minusWithdrawn")}</span>
        <span>−{bang.truDaRut}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>{t("send.minusRecent")}</span>
        <span>−{bang.truGanDay}</span>
      </div>
      <div className="mt-1 flex justify-between border-t pt-1 text-[13px] font-semibold">
        <span>{t("send.actual")}</span>
        <span>{t("send.people", { n: bang.thatSuGui })}</span>
      </div>
      {bang.chamTran && (
        <p className="pt-1 leading-relaxed text-muted-foreground">
          {t("send.limitNote", { limit: SEND_RECIPIENT_LIMIT })}
        </p>
      )}
    </div>
  );
}

// ==================== GỬI TIN ====================

function SendPanel({ campaign }: { campaign: Campaign }) {
  const t = useTranslations("events");
  const baoLoi = useBaoLoi();
  const router = useRouter();
  const [scope, setScope] = useState<SendScope>("all");
  const [body, setBody] = useState("");
  const [xemTruoc, setXemTruoc] = useState<SendBreakdown | null>(null);
  const [ketQua, setKetQua] = useState<SendBreakdown | null>(null);
  /** Danh sách tên+số của đợt vừa chốt — để chủ tiệm CHÉP đi nhắn tay. */
  const [dsGui, setDsGui] = useState<{ name: string; phone: string | null }[]>([]);
  const [daChep, setDaChep] = useState<"" | "so" | "tin">("");
  const [pending, startTransition] = useTransition();

  /** Đổi tệp thì bảng cũ KHÔNG còn đúng — xoá đi, đừng để người ta bấm gửi theo
      một con số tính cho tệp khác. */
  const doiTep = (v: string) => {
    setScope(v as SendScope);
    setXemTruoc(null);
    setKetQua(null);
    setDsGui([]);
  };

  const xem = () =>
    startTransition(async () => {
      const res = await xemTruocGuiTin(scope);
      // `!== null` chứ không phải `if (res.error)`: kiểu trả về là hợp của hai
      // nhánh, mà chuỗi rỗng cũng falsy nên phép kiểm truthy KHÔNG tách được
      // nhánh nào đang cầm bảng trừ.
      if (res.error !== null) return baoLoi(res.error);
      setKetQua(null);
      setXemTruoc(res.bang);
    });

  const gui = () =>
    startTransition(async () => {
      const res = await guiTin({ campaignId: campaign.id, scope, body: body.trim() || null });
      if (res.error !== null) return baoLoi(res.error);
      setKetQua(res.bang);
      setDsGui(res.dsGui);
      setXemTruoc(null);
      toast.success(t("send.done", { n: res.bang.thatSuGui }));
      router.refresh();
    });

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <Send className="size-3.5" />
        {t("send.title")}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1">
          <Label className="text-xs">{t("send.scope")}</Label>
          <Select value={scope} onChange={(e) => doiTep(e.target.value)}>
            {SEND_SCOPES.map((s) => (
              <option key={s} value={s}>
                {t(`send.scopes.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-end">
          <Button size="sm" variant="outline" onClick={xem} disabled={pending}>
            {pending ? t("saving") : t("send.preview")}
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("send.body")}</Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder={t("send.bodyPlaceholder")}
        />
      </div>

      {xemTruoc && (
        <>
          <BreakdownTable bang={xemTruoc} title={t("send.previewTitle")} />
          <Button
            size="sm"
            onClick={gui}
            disabled={pending || xemTruoc.thatSuGui === 0}
            className="w-full"
          >
            {xemTruoc.thatSuGui === 0
              ? t("send.nobody")
              : t("send.confirm", { n: xemTruoc.thatSuGui })}
          </Button>
        </>
      )}

      {ketQua && <BreakdownTable bang={ketQua} title={t("send.resultTitle")} />}

      {/* Khối SỰ THẬT + lối ra. iFan KHÔNG nhắn hộ được (Zalo chưa duyệt cho
          phần mềm nhắn hàng loạt tới khách) — nói thẳng, rồi đưa đúng thứ chủ
          tiệm cần để tự làm: danh sách số đã lọc sạch người không được nhắn.
          Không có khối này thì màn hình chỉ còn là một lời hứa suông. */}
      {ketQua && dsGui.length > 0 && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-xs font-semibold">{t("send.chuaGuiTitle")}</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t("send.chuaGuiBody")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(
                  dsGui.map((r) => r.phone).filter(Boolean).join("\n"),
                );
                setDaChep("so");
              }}
            >
              <Copy className="size-3.5" />
              {daChep === "so" ? t("send.daChep") : t("send.chepSo")}
            </Button>
            {body.trim() !== "" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(body.trim());
                  setDaChep("tin");
                }}
              >
                <Copy className="size-3.5" />
                {daChep === "tin" ? t("send.daChep") : t("send.chepTin")}
              </Button>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t("send.khoa7Ngay", { n: dsGui.length })}
          </p>
        </div>
      )}

      {/* Ranh giới của thẻ design: 21h–8h là không gửi, KỂ CẢ khi chủ tiệm bấm.
          Nói trước để người ta không bấm rồi mới gặp lỗi lúc 11 giờ đêm. */}
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <Clock className="mt-0.5 size-3.5 shrink-0" />
        {t("send.hoursNote")}
      </p>
    </div>
  );
}

// ==================== TỔNG KẾT ====================

function SummaryBlock({
  campaignId,
  summary,
  canManage,
}: {
  campaignId: string;
  summary: CampaignSummary | undefined;
  canManage: boolean;
}) {
  const t = useTranslations("events");
  const locale = useLocale() as Locale;
  const baoLoi = useBaoLoi();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const tinh = () =>
    startTransition(async () => {
      const res = await taoTongKet(campaignId);
      if (res.error) return baoLoi(res.error);
      router.refresh();
    });

  // ⚠️ Từ #181, `campaign_summary` chỉ owner/admin/manager đọc được (nó chứa
  // giá vốn và doanh thu). Với nhân viên câu đọc trả về rỗng — nói "chưa có
  // tổng kết" với họ là NÓI SAI: bản tổng kết có thể đang tồn tại.
  if (!canManage) {
    return (
      <p className="rounded-md border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
        {t("summary.restricted")}
      </p>
    );
  }

  // Luật 2 của queries.ts: KHÔNG bịa bản tổng kết. Chưa có thì nói thẳng là chưa
  // có — kèm nút tính, vì từ #181 đã có đường tính thật.
  if (!summary) {
    return (
      <div className="space-y-2 rounded-md border border-dashed p-3">
        <p className="text-xs leading-relaxed text-muted-foreground">{t("summary.missing")}</p>
        <Button size="sm" variant="outline" onClick={tinh} disabled={pending}>
          {pending ? t("summary.generating") : t("summary.generate")}
        </Button>
      </div>
    );
  }

  const rows: [string, number, boolean][] = [
    [t("summary.revenue"), summary.revenueVnd, false],
    [t("summary.discount"), -summary.discountVnd, true],
    [t("summary.adCost"), -summary.adCostVnd, true],
    [t("summary.cogs"), -summary.cogsVnd, true],
  ];

  return (
    <div className="space-y-2 rounded-md border p-3 text-xs">
      <div className="font-medium">
        {t("summary.title", { date: formatDate(summary.generatedAt, locale) })}
      </div>
      {rows.map(([label, value, muted]) => (
        <div key={label} className={cn("flex justify-between", muted && "text-muted-foreground")}>
          <span>{label}</span>
          <span>{formatMoney(value, locale)}</span>
        </div>
      ))}
      <div className="flex justify-between border-t pt-1 text-[13px] font-semibold">
        {/* Giá vốn thiếu ⇒ "còn lại" phồng lên đúng chiều làm người đọc tưởng có
            lãi. Đổi luôn NHÃN chứ không chỉ thêm một dòng ghi chú bên dưới: nhãn
            là thứ người ta đọc, ghi chú là thứ người ta lướt qua. */}
        <span>{summary.cogsMissingLines > 0 ? t("summary.netUpperBound") : t("summary.net")}</span>
        <span>{formatMoney(summary.netVnd, locale)}</span>
      </div>
      {summary.cogsMissingLines > 0 && (
        <p className="flex items-start gap-1.5 rounded bg-amber-50 p-2 leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{t("summary.cogsMissing", { n: summary.cogsMissingLines })}</span>
        </p>
      )}
      <p className="leading-relaxed text-muted-foreground">{t("summary.completedOnly")}</p>
      <div className="space-y-0.5 border-t pt-1.5 text-muted-foreground">
        <div>{t("summary.uses", { n: summary.usesCount })}</div>
        <div>{t("summary.newCustomers", { n: summary.newCustomerCount })}</div>
        {/* Quyết định 2 của thẻ: phần THẬT SỰ tăng thêm so với nền. */}
        <div>{t("summary.incremental", { n: summary.incrementalCount })}</div>
      </div>
      {/* Quyết định 5: dòng ít ai muốn nhìn nhưng bắt buộc phải có. */}
      <div className="flex items-start gap-1.5 rounded bg-muted/40 p-2 leading-relaxed">
        <ShieldOff className="mt-0.5 size-3.5 shrink-0" />
        <span>{t("summary.optOut", { n: summary.optOutCount })}</span>
      </div>
      <p className="leading-relaxed text-muted-foreground">{t("summary.generatedNote")}</p>
      <Button size="sm" variant="outline" onClick={tinh} disabled={pending}>
        {pending ? t("summary.generating") : t("summary.regenerate")}
      </Button>
    </div>
  );
}

// ==================== THẺ CHIẾN DỊCH ====================

function CampaignCard({
  campaign,
  vouchers,
  sends,
  summary,
  canManage,
}: {
  campaign: Campaign;
  vouchers: VoucherLink[];
  sends: CampaignSend[];
  summary: CampaignSummary | undefined;
  canManage: boolean;
}) {
  const t = useTranslations("events");
  const locale = useLocale() as Locale;
  const baoLoi = useBaoLoi();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dangSua, setDangSua] = useState(false);
  const [adCost, setAdCost] = useState(String(campaign.adCostVnd));
  const [voucherToAttach, setVoucherToAttach] = useState("");
  const [pending, startTransition] = useTransition();

  // Ba vế, giống hệt phép đo bên `suaChienDich`: mã gắn vào chiến dịch còn nháp
  // vẫn dùng được và vẫn gửi tin được, nên "còn nháp" một mình không đủ kết luận
  // là chưa có gì xảy ra.
  const daPhatSinh =
    campaign.status !== "draft" || campaign.usesCount > 0 || sends.length > 0;

  const conLai = Math.max(0, campaign.maxDiscountTotalVnd - campaign.discountGivenVnd);
  const phanTram = Math.min(
    100,
    Math.round((campaign.discountGivenVnd / campaign.maxDiscountTotalVnd) * 100),
  );
  const daGan = vouchers.filter((v) => v.campaignId === campaign.id);
  const chuaGan = vouchers.filter((v) => v.campaignId === null);

  const doiTrangThai = (status: "running" | "ended") =>
    startTransition(async () => {
      const res = await doiTrangThaiChienDich(campaign.id, status);
      if (res.error) return baoLoi(res.error);
      toast.success(t("campaigns.statusChanged"));
      router.refresh();
    });

  const luuChiPhi = () =>
    startTransition(async () => {
      const res = await capNhatChiPhiQuangCao(campaign.id, parseInt(digitsOnly(adCost) || "0", 10));
      if (res.error) return baoLoi(res.error);
      toast.success(t("campaigns.adCostSaved"));
      router.refresh();
    });

  const gan = (voucherId: string, campaignId: string | null) =>
    startTransition(async () => {
      const res = await ganMaVaoChienDich(voucherId, campaignId);
      if (res.error) return baoLoi(res.error);
      toast.success(t("vouchers.linkChanged"));
      setVoucherToAttach("");
      router.refresh();
    });

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 p-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-medium">{campaign.name}</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px]",
                campaign.status === "running"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : campaign.status === "stopped"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {t(`campaigns.status.${campaign.status}`)}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {formatDate(campaign.startAt, locale)} – {formatDate(campaign.endAt, locale)}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>{t("campaigns.uses", { n: campaign.usesCount })}</span>
            <span>
              {t("campaigns.given")}: {formatMoney(campaign.discountGivenVnd, locale)} /{" "}
              {formatMoney(campaign.maxDiscountTotalVnd, locale)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full max-w-xs rounded-full bg-muted">
            <div
              className={cn(
                "h-1.5 rounded-full transition-all",
                phanTram >= 100 ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${phanTram}%` }}
            />
          </div>
        </div>
        <ChevronRight
          className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t p-3">
          {campaign.status === "stopped" && (
            <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 p-2.5 text-xs leading-relaxed text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {t("campaigns.stoppedNote", {
                  date: campaign.stoppedAt ? formatDateTime(campaign.stoppedAt, locale) : "",
                })}
              </span>
            </div>
          )}

          <div className="grid gap-x-3 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
            <div>
              {t("campaigns.remaining")}: {formatMoney(conLai, locale)}
            </div>
            <div>
              {t("campaigns.adCost")}: {formatMoney(campaign.adCostVnd, locale)}
            </div>
          </div>
          {campaign.offerNote && <p className="text-xs italic text-muted-foreground">{campaign.offerNote}</p>}

          {/* Ba cái chặn cứng — nói ra, vì đây là thứ giữ tiệm không bán dưới vốn. */}
          <p className="rounded-md bg-muted/30 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            {t("campaigns.hardLimits")}
          </p>

          {canManage && dangSua && (
            <CampaignForm
              initial={campaign}
              daPhatSinh={daPhatSinh}
              onDone={() => setDangSua(false)}
            />
          )}

          {canManage && (
            <div className="flex flex-wrap items-end gap-2">
              {/* Biểu mẫu sửa có nút Huỷ riêng — hiện thêm một nút Huỷ nữa ở đây
                  là hai đường làm cùng một việc. */}
              {!dangSua && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDangSua(true)}
                  disabled={pending}
                >
                  {t("campaigns.edit")}
                </Button>
              )}
              {campaign.status === "draft" && (
                <Button size="sm" onClick={() => doiTrangThai("running")} disabled={pending}>
                  {t("campaigns.start")}
                </Button>
              )}
              {campaign.status === "running" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => doiTrangThai("ended")}
                  disabled={pending}
                >
                  {t("campaigns.end")}
                </Button>
              )}
              <div className="space-y-1">
                <Label className="text-xs">{t("campaigns.adCost")}</Label>
                <div className="flex gap-2">
                  <Input
                    value={adCost}
                    onChange={(e) => setAdCost(e.target.value)}
                    onBlur={(e) => setAdCost(digitsOnly(e.target.value))}
                    inputMode="numeric"
                    className="w-36"
                  />
                  <Button size="sm" variant="outline" onClick={luuChiPhi} disabled={pending}>
                    {t("campaigns.saveAdCost")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Mã giảm giá gắn vào chiến dịch ── */}
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <Ticket className="size-3.5" />
              {t("vouchers.title")}
            </div>
            {daGan.length === 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground">{t("vouchers.empty")}</p>
            ) : (
              <ul className="space-y-1">
                {daGan.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 text-xs">
                    <span>
                      <code>{v.code}</code>
                      <span className="ml-1.5 text-muted-foreground">
                        {t(`vouchers.status.${v.status}`)}
                      </span>
                    </span>
                    {canManage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => gan(v.id, null)}
                        disabled={pending}
                      >
                        {t("vouchers.detach")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canManage && chuaGan.length > 0 && (
              <div className="flex gap-2">
                <Select
                  value={voucherToAttach}
                  onChange={(e) => setVoucherToAttach(e.target.value)}
                >
                  <option value="">{t("vouchers.pick")}</option>
                  {chuaGan.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.code}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => voucherToAttach && gan(voucherToAttach, campaign.id)}
                  disabled={pending || !voucherToAttach}
                  className="shrink-0"
                >
                  {t("vouchers.attach")}
                </Button>
              </div>
            )}
          </div>

          {/* ── Gửi tin ── */}
          {canManage && <SendPanel campaign={campaign} />}

          {sends.length > 0 && (
            <div className="space-y-1 rounded-md border p-3 text-xs">
              <div className="font-medium">{t("send.history")}</div>
              {sends.map((s) => (
                <div key={s.id} className="flex justify-between text-muted-foreground">
                  <span>{formatDateTime(s.sendAt, locale)}</span>
                  <span>{t("send.people", { n: s.recipientCount })}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Tổng kết ── */}
          <SummaryBlock campaignId={campaign.id} summary={summary} canManage={canManage} />
        </div>
      )}
    </div>
  );
}

// ==================== ĐỒNG Ý NHẬN TIN ====================

function ConsentPanel({
  tally,
  contacts,
}: {
  tally: ConsentTally;
  contacts: ContactConsent[];
}) {
  const t = useTranslations("events");
  const locale = useLocale() as Locale;
  const baoLoi = useBaoLoi();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const doi = (id: string, consent: "granted" | "withdrawn") =>
    startTransition(async () => {
      const res = await ghiNhanDongY(id, consent);
      if (res.error) return baoLoi(res.error);
      toast.success(t("consent.saved"));
      router.refresh();
    });

  return (
    <section className="space-y-2">
      <h2 className="text-[13px] font-semibold">{t("consent.title")}</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        {(["granted", "unknown", "withdrawn"] as const).map((k) => (
          <div key={k} className="rounded-lg border p-3">
            <div className="text-lg font-semibold">{tally[k]}</div>
            <div className="text-[11px] text-muted-foreground">{t(`consent.${k}`)}</div>
          </div>
        ))}
      </div>
      <p className="rounded-md bg-muted/30 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
        {t("consent.explain")}
      </p>

      {contacts.length === 0 ? (
        <p className="rounded-lg border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
          {t("consent.empty")}
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {contacts.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 p-2.5 text-xs">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{c.fullName}</div>
                <div className="text-[11px] text-muted-foreground">
                  {t(`consent.${c.consent}`)}
                  {c.lastSentAt
                    ? ` · ${t("consent.lastSent", { date: formatDate(c.lastSentAt, locale) })}`
                    : ""}
                </div>
              </div>
              {c.consent !== "granted" && (
                <Button size="sm" variant="outline" onClick={() => doi(c.id, "granted")} disabled={pending}>
                  {t("consent.markGranted")}
                </Button>
              )}
              {c.consent !== "withdrawn" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => doi(c.id, "withdrawn")}
                  disabled={pending}
                  className="text-destructive hover:text-destructive"
                >
                  {t("consent.markWithdrawn")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {contacts.length >= CONTACT_PREVIEW_LIMIT && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("consent.limitNote", { limit: CONTACT_PREVIEW_LIMIT })}
        </p>
      )}
    </section>
  );
}

// ==================== MÀN CHÍNH ====================

export default function EventsView({
  campaigns,
  vouchers,
  sends,
  summaries,
  contacts,
  consentTally,
  canManage,
  loadFailed,
}: {
  campaigns: Campaign[];
  vouchers: VoucherLink[];
  sends: CampaignSend[];
  summaries: CampaignSummary[];
  contacts: ContactConsent[];
  consentTally: ConsentTally;
  canManage: boolean;
  loadFailed: boolean;
}) {
  const t = useTranslations("events");
  const [showForm, setShowForm] = useState(false);

  // Cùng mốc bề ngang với thân màn bên dưới, để khi lỗi khung không nhảy chỗ.
  if (loadFailed) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-6 lg:max-w-5xl">
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {t("loadFailed")}
        </p>
      </div>
    );
  }

  // ⚠️ HAI LỚP VÙNG CUỘN — bắt buộc, không phải trang trí.
  // Khung /app cho màn một khung cha CAO CỐ ĐỊNH và cắt phần thừa. Màn nào trả
  // thẳng một khối nội dung (không có lớp cuộn) thì phần dài quá màn hình bị
  // CẮT MẤT và không có cách nào với tới — trên máy tính ít lộ vì màn rộng,
  // trên điện thoại là hỏng hẳn.
  // Đo trên bản thật 19/08, vai chủ tiệm, khổ 390px: hơn 1.500px nội dung bị cắt, cả trang không cuộn được, nút "Tạo chiến dịch" nằm ngoài màn hình ⇒ điền xong không lưu được.
  // Khuôn này chép từ các màn đang chạy đúng (Bảng lương, Dự án).
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Từ lg mới nới: màn này là hai danh sách dài (chiến dịch + khách đồng ý
            nhận tin), khoá 768px trên màn rộng thì phải cuộn dài gấp đôi mà hai
            bên vẫn bỏ trống. Dưới lg giữ nguyên. */}
        <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6 lg:max-w-5xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold">{t("title")}</h1>
              <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
            </div>
            {canManage && (
              <Button size="sm" onClick={() => setShowForm((v) => !v)}>
                <Plus className="size-3.5" />
                {t("campaigns.new")}
              </Button>
            )}
          </div>

          {showForm && <CampaignForm onDone={() => setShowForm(false)} />}

          <section className="space-y-2">
            <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
              <Megaphone className="size-3.5" />
              {t("campaigns.title")}
            </h2>
            {campaigns.length === 0 ? (
              <p className="rounded-lg border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
                {t("campaigns.empty")}
              </p>
            ) : (
              <div className="space-y-2">
                {campaigns.map((c) => (
                  <CampaignCard
                    key={c.id}
                    campaign={c}
                    vouchers={vouchers}
                    sends={sends.filter((s) => s.campaignId === c.id)}
                    summary={summaries.find((s) => s.campaignId === c.id)}
                    canManage={canManage}
                  />
                ))}
              </div>
            )}
            {campaigns.length >= CAMPAIGN_LIMIT && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("campaigns.limitNote", { limit: CAMPAIGN_LIMIT })}
              </p>
            )}
          </section>

          {canManage && <ConsentPanel tally={consentTally} contacts={contacts} />}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileSignature,
  PackageOpen,
  Plus,
  XCircle,
} from "lucide-react";
import { KhoiTrong } from "@/components/ui/khoi-trong";
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
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import {
  CONTACT_PICKER_LIMIT,
  CONTRACT_LIST_LIMIT,
  type Contract,
  type ContractSession,
  type ServicePackage,
  type ContactOption,
} from "./queries";
import {
  taoGoi,
  luuTruGoi,
  taoHopDong,
  huyHopDong,
  doiMotBuoi,
  layLichSuBuoiHopDong,
} from "./actions";

const digitsOnly = (v: string) => v.replace(/\D/g, "");

// ==================== FORM TẠO GÓI ====================

function NewPackageForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("contracts");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [sessions, setSessions] = useState("10");
  const [validity, setValidity] = useState("");
  const [price, setPrice] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const sessNum = parseInt(sessions || "1", 10);
    const priceNum = parseInt(price.replace(/\D/g, "") || "0", 10);
    if (!name.trim() || sessNum < 1) return;
    startTransition(async () => {
      const res = await taoGoi({
        name: name.trim(),
        description: desc.trim() || null,
        sessionsTotal: sessNum,
        validityDays: validity ? parseInt(validity, 10) : null,
        priceVnd: priceNum,
      });
      if (res.error) {
        toast.error(t(`errors.${res.error}`, { defaultValue: t("errors.save_failed") }));
      } else {
        toast.success(t("packages.created"));
        router.refresh();
        onDone();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-4">
      <h3 className="font-semibold">{t("packages.newTitle")}</h3>
      <div className="space-y-1.5">
        <Label>{t("packages.name")}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>{t("packages.sessions")}</Label>
          <Input
            type="number"
            min={1}
            max={9999}
            value={sessions}
            onChange={(e) => setSessions(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("packages.validity")}</Label>
          <Input
            type="number"
            min={1}
            max={3650}
            value={validity}
            onChange={(e) => setValidity(e.target.value)}
            placeholder={t("packages.validityPlaceholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("packages.price")}</Label>
          <Input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={(e) => setPrice(digitsOnly(e.target.value))}
            inputMode="numeric"
            placeholder="0"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t("packages.desc")}</Label>
        <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? t("saving") : t("packages.save")}
        </Button>
      </div>
    </form>
  );
}

function PackageCard({
  pkg,
  canManage,
}: {
  pkg: ServicePackage;
  canManage: boolean;
}) {
  const t = useTranslations("contracts");
  const locale = useLocale() as Locale;
  const [archiving, startTransition] = useTransition();
  const [hoiLuuTru, setHoiLuuTru] = useState(false);
  const tCommon = useTranslations("common");
  const router = useRouter();

  const archive = () => {
    startTransition(async () => {
      const res = await luuTruGoi(pkg.id);
      if (res.error) {
        toast.error(t(`errors.${res.error}`, { defaultValue: t("errors.save_failed") }));
      } else {
        toast.success(t("packages.archived"));
        router.refresh();
      }
    });
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        pkg.status === "archived" && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{pkg.name}</div>
          {pkg.description && (
            <div className="text-xs text-muted-foreground">{pkg.description}</div>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>{t("packages.sessionsCount", { n: pkg.sessionsTotal })}</span>
            {pkg.validityDays && (
              <span>{t("packages.validityDays", { n: pkg.validityDays })}</span>
            )}
            <span className="font-medium text-foreground">
              {formatMoney(pkg.priceVnd, locale)}
            </span>
          </div>
        </div>
        {/* Nút này TRƯỚC ĐÂY chỉ có biểu tượng, không nhãn, và bấm là chạy
            ngay. Ba chỗ sai cùng lúc: người dùng không biết nó làm gì, không
            biết hậu quả, và không có đường lùi — trong khi việc NHẸ HƠN nhiều
            (huỷ một hợp đồng) thì lại có hộp xác nhận đầy đủ. Nay có nhãn ẩn,
            có gợi ý khi rê chuột, và hỏi lại trước khi chạy. */}
        {canManage && pkg.status === "active" && (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-muted-foreground max-md:size-11"
            onClick={() => setHoiLuuTru(true)}
            disabled={archiving}
            aria-label={t("packages.archive")}
            title={t("packages.archive")}
          >
            <Archive className="size-3.5" />
          </Button>
        )}
      </div>

      <Dialog open={hoiLuuTru} onOpenChange={setHoiLuuTru}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("packages.archiveTitle")}</DialogTitle>
            <DialogDescription>
              {t("packages.archiveBody", { name: pkg.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setHoiLuuTru(false)} disabled={archiving}>
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={() => {
                setHoiLuuTru(false);
                archive();
              }}
              disabled={archiving}
            >
              {t("packages.archive")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== FORM TẠO HỢP ĐỒNG ====================

function NewContractForm({
  packages,
  contacts,
  onDone,
}: {
  packages: ServicePackage[];
  contacts: ContactOption[];
  onDone: () => void;
}) {
  const t = useTranslations("contracts");
  const locale = useLocale() as Locale;
  const [contactId, setContactId] = useState("");
  const [packageId, setPackageId] = useState(packages[0]?.id ?? "");
  const [price, setPrice] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer" | "qr">("cash");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const selectedPkg = packages.find((p) => p.id === packageId);

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!contactId || !packageId) return;
    const priceNum = parseInt(price.replace(/\D/g, "") || "0", 10);
    startTransition(async () => {
      const res = await taoHopDong({
        contactId,
        packageId,
        sessionsTotal: selectedPkg?.sessionsTotal ?? 1,
        validityDays: selectedPkg?.validityDays ?? null,
        pricePaidVnd: priceNum,
        paymentMethod: method,
        note: note.trim() || null,
      });
      if (res.error) {
        toast.error(t(`errors.${res.error}`, { defaultValue: t("errors.save_failed") }));
      } else {
        toast.success(t("contracts.created"));
        router.refresh();
        onDone();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-4">
      <h3 className="font-semibold">{t("contracts.newTitle")}</h3>
      <div className="space-y-1.5">
        <Label>{t("contracts.contact")}</Label>
        <Select value={contactId} onChange={(e) => setContactId(e.target.value)} required>
          <option value="">{t("contracts.contactPlaceholder")}</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.phone ? `— ${c.phone}` : ""}
            </option>
          ))}
        </Select>
        {/* Ô chọn không có tìm kiếm: chạm trần mà im lặng thì người dùng tưởng
            khách chưa có và tạo hồ sơ trùng — phải nói ra. */}
        {contacts.length >= CONTACT_PICKER_LIMIT && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("contracts.contactLimitNote", { n: contacts.length })}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>{t("contracts.package")}</Label>
        <Select
          value={packageId}
          onChange={(e) => {
            setPackageId(e.target.value);
            const pkg = packages.find((p) => p.id === e.target.value);
            if (pkg) setPrice(String(pkg.priceVnd));
          }}
          required
        >
          {packages
            .filter((p) => p.status === "active")
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.sessionsTotal} {t("contracts.sessionsUnit")}
              </option>
            ))}
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>
            {t("contracts.pricePaid")}
            {selectedPkg && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({t("contracts.listed")}: {formatMoney(selectedPkg.priceVnd, locale)})
              </span>
            )}
          </Label>
          <Input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={(e) => setPrice(digitsOnly(e.target.value))}
            inputMode="numeric"
            placeholder="0"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("contracts.payMethod")}</Label>
          <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            <option value="cash">{t("contracts.methods.cash")}</option>
            <option value="transfer">{t("contracts.methods.transfer")}</option>
            <option value="qr">{t("contracts.methods.qr")}</option>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t("contracts.note")}</Label>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("contracts.notePlaceholder")}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending || !contactId || !packageId}>
          {pending ? t("saving") : t("contracts.save")}
        </Button>
      </div>
    </form>
  );
}

// ==================== THẺ HỢP ĐỒNG ====================

function ContractCard({
  contract,
  canManage,
}: {
  contract: Contract;
  canManage: boolean;
}) {
  const t = useTranslations("contracts");
  const locale = useLocale() as Locale;
  const [redeeming, startRedeem] = useTransition();
  const [cancelling, startCancel] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [sessions, setSessions] = useState<ContractSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState(false);
  const [loadingSessions, startLoadSessions] = useTransition();
  const router = useRouter();

  const remaining = contract.sessionsTotal - contract.sessionsUsed;
  const isActive = contract.status === "active";
  const isExpired =
    contract.expiresAt != null && new Date(contract.expiresAt) < new Date();

  const loadSessions = () => {
    startLoadSessions(async () => {
      const res = await layLichSuBuoiHopDong(contract.id);
      if (res.error) {
        setSessionsError(true);
      } else {
        setSessionsError(false);
        setSessions(res.sessions);
      }
    });
  };

  const toggle = () => {
    const opening = !expanded;
    setExpanded(opening);
    // Nạp lịch sử buổi lần đầu khi MỞ thẻ — đọc theo yêu cầu, không tải sẵn cả
    // bảng buổi cho những hợp đồng chưa ai mở xem.
    if (opening && sessions === null && !loadingSessions) loadSessions();
  };

  const redeem = () => {
    startRedeem(async () => {
      const res = await doiMotBuoi({ contractId: contract.id, note: null });
      if (res.error) {
        toast.error(t(`errors.${res.error}`, { defaultValue: t("errors.save_failed") }));
      } else {
        toast.success(t("contracts.redeemed", { name: contract.contactName }));
        loadSessions(); // buổi vừa ghi phải hiện ngay trong lịch sử đang mở
        router.refresh();
      }
    });
  };

  const cancel = () => {
    if (!confirm(t("contracts.cancelConfirm"))) return;
    startCancel(async () => {
      const res = await huyHopDong(contract.id);
      if (res.error) {
        toast.error(t(`errors.${res.error}`, { defaultValue: t("errors.save_failed") }));
      } else {
        toast.success(t("contracts.cancelled"));
        router.refresh();
      }
    });
  };

  const statusIcon =
    contract.status === "completed" ? (
      <CheckCircle2 className="size-4 text-emerald-500" />
    ) : contract.status === "cancelled" ? (
      <XCircle className="size-4 text-destructive" />
    ) : isExpired ? (
      <Clock className="size-4 text-amber-500" />
    ) : (
      <PackageOpen className="size-4 text-primary" />
    );

  return (
    <div className="rounded-lg border">
      <button
        className="flex w-full items-center gap-3 p-3 text-left"
        onClick={toggle}
      >
        {statusIcon}
        {/* Tên khách và tên gói ĐƯỢC PHÉP XUỐNG DÒNG. Đo thật 21/08 trên điện
            thoại: bốn cột chen nhau trong 375px (biểu tượng · chữ · thanh tiến
            độ · mũi tên) bóp cột chữ hẹp tới mức TÊN NGƯỜI vỡ dọc từng chữ —
            "Đặng / Thuỳ / My" xếp thành ba hàng. Tên người vỡ như vậy vừa khó
            đọc vừa trông như phần mềm hỏng. */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{contract.contactName}</span>
            <span className="text-xs text-muted-foreground">{contract.packageName}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span>
              {contract.sessionsUsed}/{contract.sessionsTotal} {t("contracts.sessionsUsed")}
            </span>
            {/* Trên điện thoại thanh tiến độ ẩn đi, nên con số "còn lại" phải
                nói ra bằng chữ ở đây — ẩn cả hai là mất thông tin. */}
            <span className="sm:hidden">
              {remaining} {t("contracts.remaining")}
            </span>
            {contract.expiresAt && (
              <span>{t("contracts.expires")}: {formatDate(contract.expiresAt, locale)}</span>
            )}
          </div>
        </div>
        {/* Thanh tiến độ — chỉ từ 640px trở lên. Nó chiếm 64px cộng khoảng
            cách, tức gần một phần năm bề ngang điện thoại, cho một thứ mà dòng
            "1/10 buổi đã dùng" ngay bên cạnh đã nói rõ bằng số. */}
        <div className="hidden w-16 shrink-0 sm:block">
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className={cn(
                "h-1.5 rounded-full transition-all",
                contract.status === "completed"
                  ? "bg-emerald-500"
                  : contract.status === "cancelled"
                    ? "bg-destructive"
                    : "bg-primary",
              )}
              style={{
                width: `${Math.round((contract.sessionsUsed / contract.sessionsTotal) * 100)}%`,
              }}
            />
          </div>
          <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
            {remaining} {t("contracts.remaining")}
          </div>
        </div>
        <ChevronRight
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")}
        />
      </button>

      {expanded && (
        <div className="border-t px-3 pb-3 pt-2 space-y-2">
          <div className="text-xs text-muted-foreground">
            {t("contracts.paid")}: {formatMoney(contract.pricePaidVnd, locale)} •{" "}
            {t(`contracts.methods.${contract.paymentMethod}`)} •{" "}
            {t("contracts.since")}: {formatDate(contract.startsAt, locale)}
          </div>
          {contract.note && (
            <div className="text-xs text-muted-foreground italic">{contract.note}</div>
          )}
          {isActive && !isExpired && remaining > 0 && (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={redeem}
                disabled={redeeming}
              >
                {redeeming ? t("saving") : t("contracts.useSession")}
              </Button>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={cancel}
                  disabled={cancelling}
                  className="text-destructive hover:text-destructive"
                >
                  {t("contracts.cancel")}
                </Button>
              )}
            </div>
          )}

          {/* Lịch sử từng buổi đã dùng — đường ĐỌC cho contract_sessions. */}
          <div className="space-y-1.5 pt-1">
            <div className="text-xs font-medium text-foreground">
              {t("contracts.sessionHistory")}
            </div>
            {loadingSessions && sessions === null && (
              <div className="text-xs text-muted-foreground">{t("contracts.sessionsLoading")}</div>
            )}
            {sessionsError && (
              <div className="text-xs text-destructive">{t("contracts.sessionsError")}</div>
            )}
            {!sessionsError && sessions !== null && sessions.length === 0 && (
              <div className="text-xs text-muted-foreground">{t("contracts.noSessions")}</div>
            )}
            {!sessionsError && sessions !== null && sessions.length > 0 && (
              <ol className="space-y-1">
                {sessions.map((s, i) => (
                  <li
                    key={s.id}
                    className="rounded-md border bg-muted/20 px-2 py-1.5 text-xs"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {t("contracts.sessionNumber", { n: sessions.length - i })}
                      </span>
                      <span className="text-muted-foreground">
                        {formatDate(s.redeemedAt, locale)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-muted-foreground">
                      <span>{t("contracts.recordedBy", { name: s.recordedByName })}</span>
                      {s.appointmentStartAt && (
                        <span>
                          •{" "}
                          {t("contracts.fromAppointment", {
                            time: formatDateTime(s.appointmentStartAt, locale),
                          })}
                        </span>
                      )}
                    </div>
                    {s.note && (
                      <div className="mt-0.5 italic text-muted-foreground">{s.note}</div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== ROOT VIEW ====================

export default function ContractsView({
  contracts,
  packages,
  contacts,
  canManage,
  loadFailed,
}: {
  contracts: Contract[];
  packages: ServicePackage[];
  contacts: ContactOption[];
  canManage: boolean;
  loadFailed: boolean;
}) {
  const t = useTranslations("contracts");
  const [tab, setTab] = useState<"contracts" | "packages">("contracts");
  const [showContractForm, setShowContractForm] = useState(false);
  const [showPackageForm, setShowPackageForm] = useState(false);

  if (loadFailed) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">{t("loadFailed")}</div>
    );
  }

  const activeContracts = contracts.filter((c) => c.status === "active");
  const doneContracts = contracts.filter((c) => c.status !== "active");

  // ⚠️ HAI LỚP VÙNG CUỘN — bắt buộc. Khung /app đặt màn vào
  // `<div className="flex min-h-0 flex-1 flex-col overflow-hidden">`: hộp CAO
  // CỐ ĐỊNH, cắt phần thừa. Màn nào không tự có lớp cuộn thì phần dài quá màn
  // hình bị CẮT và không có cách nào với tới — máy tính ít lộ vì màn rộng,
  // điện thoại là hỏng hẳn (đo 19/08: hai màn khác mất >1.500px nội dung và
  // nút Lưu nằm ngoài màn hình). Khuôn chép từ Bảng lương/Dự án.
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Nới từ mốc lg như mọi màn danh sách khác của kho (khuôn ở
            `orders-view`). Trước bản này màn khoá cứng 672px, nên trên màn
            2560px nó là một dải hẹp giữa hai vùng trống — mà đây đúng là loại
            màn càng nhiều dòng càng cần bề ngang. */}
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 md:p-6 lg:max-w-5xl xl:max-w-7xl 2xl:max-w-[1600px]">
          <h1 className="text-xl font-bold">{t("title")}</h1>

          {/* Tab switcher */}
          <div className="flex gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
            {(["contracts", "packages"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "rounded px-3 py-1 text-sm font-medium transition-colors",
                  tab === key
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`tabs.${key}`)}
              </button>
            ))}
          </div>

          {/* Tab: hợp đồng */}
          {tab === "contracts" && (
            <div className="space-y-3">
              {canManage && !showContractForm && (
                <Button onClick={() => setShowContractForm(true)} disabled={packages.filter((p) => p.status === "active").length === 0}>
                  <Plus className="mr-1 size-4" />
                  {t("contracts.new")}
                </Button>
              )}
              {packages.filter((p) => p.status === "active").length === 0 && (
                <p className="text-sm text-amber-600">{t("contracts.noPackages")}</p>
              )}
              {showContractForm && (
                <NewContractForm
                  packages={packages}
                  contacts={contacts}
                  onDone={() => setShowContractForm(false)}
                />
              )}
              {activeContracts.length === 0 && !showContractForm && (
                <KhoiTrong
                  bieuTuong={<FileSignature />}
                  tieuDe={t("contracts.emptyTitle")}
                  moTa={t("contracts.empty")}
                  hanhDong={
                    canManage ? (
                      <Button size="sm" variant="outline" onClick={() => setShowContractForm(true)}>
                        {t("contracts.emptyCta")}
                      </Button>
                    ) : undefined
                  }
                />
              )}
              <div className="space-y-2">
                {activeContracts.map((c) => (
                  <ContractCard key={c.id} contract={c} canManage={canManage} />
                ))}
              </div>
              {doneContracts.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">{t("contracts.history")}</h3>
                  {doneContracts.map((c) => (
                    <ContractCard key={c.id} contract={c} canManage={canManage} />
                  ))}
                </div>
              )}
              {/* Chạm trần thì NÓI RA — không để người dùng tưởng đây là tất cả. */}
              {contracts.length >= CONTRACT_LIST_LIMIT && (
                <p className="text-center text-xs leading-relaxed text-muted-foreground">
                  {t("contracts.limitNote", { n: contracts.length })}
                </p>
              )}
            </div>
          )}

          {/* Tab: gói dịch vụ */}
          {tab === "packages" && (
            <div className="space-y-3">
              {canManage && !showPackageForm && (
                <Button onClick={() => setShowPackageForm(true)}>
                  <Plus className="mr-1 size-4" />
                  {t("packages.new")}
                </Button>
              )}
              {showPackageForm && (
                <NewPackageForm onDone={() => setShowPackageForm(false)} />
              )}
              {packages.length === 0 && !showPackageForm && (
                <KhoiTrong
                  bieuTuong={<Boxes />}
                  tieuDe={t("packages.emptyTitle")}
                  moTa={t("packages.empty")}
                  hanhDong={
                    canManage ? (
                      <Button size="sm" variant="outline" onClick={() => setShowPackageForm(true)}>
                        {t("packages.emptyCta")}
                      </Button>
                    ) : undefined
                  }
                />
              )}
              <div className="space-y-2">
                {packages.map((p) => (
                  <PackageCard key={p.id} pkg={p} canManage={canManage} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

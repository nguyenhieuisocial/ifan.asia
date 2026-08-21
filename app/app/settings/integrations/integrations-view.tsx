"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Copy, Lock, Pencil, Plus, ScrollText, Send } from "lucide-react";
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
import type { Locale } from "@/i18n/config";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import {
  docNhatKyGui,
  doiTrangThaiDuongBao,
  guiThuLai,
  guiThuMotTin,
  suaDuongBao,
  taoDuongBao,
  taoKhoa,
  thuHoiKhoa,
} from "./actions";
import {
  DUONG_BAO_LIMIT,
  KHOA_LIMIT,
  LOAI_SU_KIEN,
  NHAT_KY_LIMIT,
  type ApiKeyRow,
  type DeliveryRow,
  type WebhookRow,
} from "./types";

/**
 * Màn Cài đặt → Tích hợp (thẻ design `man-webhook-api.html`).
 *
 * Ba điều thẻ design nhấn mạnh và màn này phải giữ:
 *  - Khoá hiện ĐÚNG MỘT LẦN lúc tạo. Sau đó không có đường nào xem lại, kể cả
 *    cho chủ tiệm — nên hộp thoại tạo khoá phải nói rõ điều đó ngay tại chỗ.
 *  - "Dùng lần cuối" là cột quan trọng nhất: khoá không ai dùng mà vẫn sống là
 *    cửa mở bỏ quên. Máy tự gắn nhãn nghi ngờ, không đợi người nhớ đi dọn.
 *  - Thu hồi cảnh báo bằng SỐ ĐO THẬT ("đang được gọi 1.240 lượt"), không hỏi
 *    "Bạn có chắc không?" — câu đó ai cũng bấm Có mà không đọc.
 */

/**
 * Khoá lỗi server action có bản dịch trong `integrations.errors.*`.
 * Mã lạ (zod đổi thông báo, lỗi Postgres mới) rơi về `save_failed` — vẫn BÁO,
 * chỉ là báo chung chung; im lặng mới là lỗi.
 */
const ERROR_KEYS = new Set([
  "forbidden",
  "save_failed",
  "invalid_input",
  "trung_khoa",
  "thieu_ten",
  "ten_qua_dai",
  "thieu_quyen",
  "thieu_su_kien",
  "url_khong_hop_le",
  "url_khong_https",
  "url_qua_dai",
  "no_tenant",
  "not_authenticated",
  // `khong_tim_thay` ĐÃ có bản dịch từ 19/08 nhưng thiếu ở đây, nên lỗi "không
  // tìm thấy đường báo" của nút Thử lại rơi về câu chung chung "lưu không được"
  // — sai hẳn nguyên nhân. Thêm vào cùng lượt vì `guiThuMotTin` trả cùng mã.
  "khong_tim_thay",
  "rate_limited",
  "gui_that_bai",
  "doc_that_bai",
]);

function maLoi(code: string): string {
  return ERROR_KEYS.has(code) ? code : "save_failed";
}

/** `order.created` / `read:orders` → khoá i18n hợp lệ (dấu chấm là cấp lồng nhau). */
function khoaAn(value: string): string {
  return value.replace(/[.:]/g, "_");
}

const LOAI_BIET = new Set<string>(LOAI_SU_KIEN);

/**
 * Mã lỗi `lib/integrations/webhook-send.ts` ghi vào phiếu. `may_chu_tra_NNN`
 * KHÔNG nằm đây vì nó mang theo mã trạng thái — tách riêng ở `LoiGui`.
 */
const LOI_GUI_BIET = new Set([
  "het_gio_cho",
  "khong_goi_duoc",
  "bi_chuyen_huong",
  "dia_chi_khong_doc_duoc",
  "chi_nhan_https",
  "tro_vao_may_chu_noi_bo",
  "tro_vao_mang_noi_bo",
  "khong_tra_duoc_ten_mien",
  "khong_ro",
]);

/**
 * Mã lỗi thô → câu người đọc hiểu ("het_gio_cho" → "Bên nhận không trả lời
 * trong 10 giây").
 *
 * Mã LẠ hiện NGUYÊN VĂN, không nuốt và không thay bằng "lỗi không xác định":
 * người đang đi tìm chỗ hỏng cần đúng cái chuỗi đó để tra, mà worker có thể
 * sinh mã mới bất cứ lúc nào. Nhật ký giấu lỗi thì bằng không có nhật ký.
 */
function moTaLoiGui(t: ReturnType<typeof useTranslations>, code: string): string {
  const ma = /^may_chu_tra_(\d{3})$/.exec(code);
  if (ma) return t("deliveryErrors.httpStatus", { status: ma[1] });
  return LOI_GUI_BIET.has(code) ? t(`deliveryErrors.${code}`) : code;
}

/** Bản JSX của `moTaLoiGui` — dùng trong nhật ký. */
function LoiGui({ code }: { code: string }) {
  const t = useTranslations("integrations");
  return <>{moTaLoiGui(t, code)}</>;
}

// ════════════════════════════════════════════════════════════════════
// KHOÁ API
// ════════════════════════════════════════════════════════════════════

/**
 * Tạo khoá — hai chặng trong CÙNG một hộp thoại: điền tên/quyền, rồi hiện khoá
 * gốc. Không tách thành hai hộp thoại vì bản gốc chỉ tồn tại trong khoảnh khắc
 * này; đóng hộp là mất, mà chuyển hộp thoại là thêm một nhịp để người dùng bấm
 * nhầm nút đóng.
 */
function TaoKhoaDialog({
  quyenCoThe,
  onClose,
}: {
  quyenCoThe: string[];
  onClose: () => void;
}) {
  const t = useTranslations("integrations");
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  // Mặc định KHÔNG tick cái nào (quyết định 2). Không có nút "cho tất cả":
  // khoá lỡ lộ mà chỉ đọc một mảng thì thiệt hại khác hẳn khoá đọc được hết.
  const [scopes, setScopes] = useState<string[]>([]);
  const [khoaGoc, setKhoaGoc] = useState<string | null>(null);

  const chuaDu = name.trim() === "" || scopes.length === 0;

  const bat = (quyen: string, tick: boolean) =>
    setScopes((cu) => (tick ? [...cu, quyen] : cu.filter((q) => q !== quyen)));

  const gui = () => {
    if (pending || chuaDu) return;
    startTransition(async () => {
      const res = await taoKhoa(name.trim(), scopes);
      if (res.error || !res.khoaGoc) {
        toast.error(t(`errors.${maLoi(res.error ?? "save_failed")}`));
        return;
      }
      setKhoaGoc(res.khoaGoc);
      toast.success(t("toasts.keyCreated"));
    });
  };

  const saoChep = async () => {
    if (!khoaGoc) return;
    try {
      await navigator.clipboard.writeText(khoaGoc);
      toast.success(t("toasts.copied"));
    } catch {
      // Trình duyệt từ chối (không phải HTTPS, người dùng chặn quyền) — phải
      // BÁO, không thì người dùng đóng hộp thoại tưởng đã chép được và mất khoá.
      toast.error(t("errors.copyFailed"));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-h-[85svh] sm:overflow-y-auto"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{khoaGoc ? t("createKey.doneTitle") : t("createKey.title")}</DialogTitle>
        </DialogHeader>

        {khoaGoc ? (
          <div className="space-y-3">
            <div className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3">
              <p className="flex items-start gap-1.5 text-xs font-medium text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{t("createKey.showOnce")}</span>
              </p>
              <p className="rounded-md border bg-card px-3 py-2 font-mono text-xs leading-relaxed break-all">
                {khoaGoc}
              </p>
              <Button size="sm" onClick={saoChep}>
                <Copy className="size-4" />
                {t("createKey.copy")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("createKey.doneHint")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="key-name">{t("createKey.name")}</Label>
              <Input
                id="key-name"
                value={name}
                disabled={pending}
                autoFocus
                onChange={(e) => setName(e.target.value.slice(0, 100))}
              />
              <p className="text-xs text-muted-foreground">{t("createKey.nameHint")}</p>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-[13px] font-medium">{t("createKey.scopes")}</p>
              {quyenCoThe.map((quyen) => (
                <Label key={quyen} htmlFor={`scope-${khoaAn(quyen)}`}>
                  <Checkbox
                    id={`scope-${khoaAn(quyen)}`}
                    checked={scopes.includes(quyen)}
                    disabled={pending}
                    onChange={(e) => bat(quyen, e.target.checked)}
                  />
                  {t(`scopes.${khoaAn(quyen)}`)}
                </Label>
              ))}
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{t("createKey.scopesHint")}</span>
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {khoaGoc ? (
            <Button onClick={onClose}>{t("createKey.close")}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={pending}>
                {t("common.cancel")}
              </Button>
              <Button onClick={gui} disabled={pending || chuaDu}>
                {t("createKey.submit")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Thu hồi — nói trước HẬU QUẢ bằng số đo thật, không hỏi "Bạn có chắc không?"
 * (quyết định 4 của thẻ design).
 */
function ThuHoiDialog({ khoa, onClose }: { khoa: ApiKeyRow; onClose: () => void }) {
  const t = useTranslations("integrations");
  const [pending, startTransition] = useTransition();

  const lam = () => {
    if (pending) return;
    startTransition(async () => {
      const res = await thuHoiKhoa(khoa.id);
      if (res.error) {
        toast.error(t(`errors.${maLoi(res.error)}`));
        return;
      }
      toast.success(t("toasts.keyRevoked"));
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("revoke.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-[13px] text-destructive">
            {khoa.callCount > 0
              ? t("revoke.impact", { name: khoa.name, count: khoa.callCount })
              : t("revoke.impactUnused", { name: khoa.name })}
          </p>
          <p className="text-[13px] text-muted-foreground">{t("revoke.effect")}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={lam} disabled={pending}>
            {t("revoke.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DongKhoa({
  khoa,
  quyenCoThe,
  pending,
  onRevoke,
}: {
  khoa: ApiKeyRow;
  quyenCoThe: string[];
  pending: boolean;
  onRevoke: () => void;
}) {
  const t = useTranslations("integrations");
  const tTime = useTranslations("time");
  const locale = useLocale() as Locale;

  const quyen =
    khoa.scopes.length === 0
      ? t("keys.noScopes")
      : khoa.scopes
          .map((s) => (quyenCoThe.includes(s) ? t(`scopes.${khoaAn(s)}`) : s))
          .join(" · ");

  // Viết THÀNH LỜI trên một dòng, đúng thẻ design: người đọc quét dòng này để
  // tìm khoá nào lâu rồi không ai đụng tới.
  const moTa = [
    t("keys.created", { date: formatDate(khoa.createdAt, locale) }),
    khoa.lastUsedAt === null
      ? t("keys.neverUsed")
      : t("keys.lastUsed", { when: formatRelative(khoa.lastUsedAt, locale, tTime) }),
    t("keys.calls", { count: khoa.callCount }),
  ].join(" · ");

  return (
    <li className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{khoa.name}</span>
            {khoa.boQuen && (
              <Badge variant="outline" className="border-destructive/40 text-destructive">
                {t("keys.forgotten")}
              </Badge>
            )}
          </div>
          <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
            {khoa.keyPrefix}…{khoa.keySuffix}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">{quyen}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={pending}
          onClick={onRevoke}
        >
          {t("keys.revoke")}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{moTa}</p>
    </li>
  );
}

// ════════════════════════════════════════════════════════════════════
// ĐƯỜNG BÁO RA
// ════════════════════════════════════════════════════════════════════

/**
 * Thêm / SỬA đường báo — MỘT hộp thoại làm cả hai việc.
 *
 * Không tách thành hai hộp gần giống nhau: đó là cách chắc chắn nhất để luật
 * kiểm hai bên trôi khỏi nhau. Thêm một loại sự kiện mà chỉ sửa bên "tạo" thì
 * không ai thấy sai, cho tới ngày có người mở một đường báo cũ ra sửa.
 */
function DuongBaoDialog({ hook, onClose }: { hook?: WebhookRow; onClose: () => void }) {
  const t = useTranslations("integrations");
  const [pending, startTransition] = useTransition();
  const dangSua = hook !== undefined;

  /**
   * Đường báo có thể đang mang loại sự kiện KHÔNG còn trong danh sách (khai
   * thẳng bằng SQL, hoặc danh sách rút gọn về sau). Ô tick chỉ vẽ được loại
   * đang biết ⇒ bấm Lưu là những loại kia BIẾN MẤT. Phải nói ra TRƯỚC khi lưu,
   * không được lặng lẽ cắt — mất một loại sự kiện là mất một dòng dữ liệu chảy
   * sang hệ thống khác mà chẳng ai được báo.
   */
  const loaiLa = (hook?.eventTypes ?? []).filter((x) => !LOAI_BIET.has(x));

  const [name, setName] = useState(hook?.name ?? "");
  const [url, setUrl] = useState(hook?.url ?? "");
  const [loai, setLoai] = useState<string[]>(
    (hook?.eventTypes ?? []).filter((x) => LOAI_BIET.has(x)),
  );

  const chuaDu = name.trim() === "" || url.trim() === "" || loai.length === 0;

  const bat = (ma: string, tick: boolean) =>
    setLoai((cu) => (tick ? [...cu, ma] : cu.filter((x) => x !== ma)));

  const gui = () => {
    if (pending || chuaDu) return;
    startTransition(async () => {
      const res = hook
        ? await suaDuongBao(hook.id, name.trim(), url.trim(), loai)
        : await taoDuongBao(name.trim(), url.trim(), loai);
      if (res.error) {
        toast.error(t(`errors.${maLoi(res.error)}`));
        return;
      }
      toast.success(t(dangSua ? "toasts.hookUpdated" : "toasts.hookCreated"));
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-h-[85svh] sm:overflow-y-auto"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{t(dangSua ? "editHook.title" : "createHook.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="hook-name">{t("createHook.name")}</Label>
            <Input
              id="hook-name"
              value={name}
              disabled={pending}
              autoFocus
              onChange={(e) => setName(e.target.value.slice(0, 100))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hook-url">{t("createHook.url")}</Label>
            <Input
              id="hook-url"
              value={url}
              inputMode="url"
              placeholder="https://"
              disabled={pending}
              onChange={(e) => setUrl(e.target.value.slice(0, 500))}
            />
            <p className="text-xs text-muted-foreground">{t("createHook.urlHint")}</p>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-[13px] font-medium">{t("createHook.events")}</p>
            {LOAI_SU_KIEN.map((ma) => (
              <Label key={ma} htmlFor={`event-${khoaAn(ma)}`}>
                <Checkbox
                  id={`event-${khoaAn(ma)}`}
                  checked={loai.includes(ma)}
                  disabled={pending}
                  onChange={(e) => bat(ma, e.target.checked)}
                />
                {t(`events.${khoaAn(ma)}`)}
              </Label>
            ))}
            <p className="text-xs text-muted-foreground">{t("createHook.eventsHint")}</p>
          </div>

          {loaiLa.length > 0 && (
            <p className="flex items-start gap-1.5 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{t("editHook.unknownEvents", { list: loaiLa.join(", ") })}</span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={gui} disabled={pending || chuaDu}>
            {t(dangSua ? "editHook.submit" : "createHook.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Nhật ký gửi gần đây — THỨ LÀM TÍNH NĂNG NÀY DÙNG ĐƯỢC THẬT.
 *
 * Không có nó thì "Đang hỏng · 19 lần" là ngõ cụt: chủ tiệm biết đường báo chết
 * nhưng không biết chết vì gì, nên chỉ còn nước đi hỏi. Có nhật ký thì họ đọc
 * được "bên nhận trả mã 500" hay "hết giờ chờ" và tự đi sửa bên mình.
 *
 * Đọc lúc MỞ hộp thoại chứ không nạp sẵn cùng trang: tiệm 50 đường báo mà nạp
 * trước cả 50 nhật ký là 50 lượt đọc cho thứ hiếm khi được mở.
 */
function NhatKyDialog({ hook, onClose }: { hook: WebhookRow; onClose: () => void }) {
  const t = useTranslations("integrations");
  const tTime = useTranslations("time");
  const locale = useLocale() as Locale;
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  const [nhatKy, setNhatKy] = useState<DeliveryRow[]>([]);

  useEffect(() => {
    let conMo = true;
    void (async () => {
      const res = await docNhatKyGui(hook.id);
      // Hộp thoại đóng trước khi đọc xong thì bỏ kết quả — đặt state lên một
      // thành phần đã gỡ là cảnh báo React, và không ai còn nhìn nữa.
      if (!conMo) return;
      setLoi(res.error);
      setNhatKy(res.nhatKy);
      setDangTai(false);
    })();
    return () => {
      conMo = false;
    };
  }, [hook.id]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-h-[85svh] sm:overflow-y-auto"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{t("log.title")}</DialogTitle>
        </DialogHeader>

        <p className="font-mono text-xs break-all text-muted-foreground">{hook.url}</p>

        {dangTai ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">{t("log.loading")}</p>
        ) : loi ? (
          /* Đọc hỏng thì NÓI RA. Hiện danh sách rỗng ở đây là nói dối "đường này
             chưa gửi tin nào" — đúng câu sai nhất với người đang tìm chỗ hỏng. */
          <p className="flex items-start gap-1.5 py-4 text-[13px] text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{t(`errors.${maLoi(loi)}`)}</span>
          </p>
        ) : nhatKy.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">{t("log.empty")}</p>
        ) : (
          <>
            <ul className="divide-y">
              {nhatKy.map((d) => (
                <DongNhatKy key={d.id} phieu={d} locale={locale} tTime={tTime} />
              ))}
            </ul>
            {nhatKy.length >= NHAT_KY_LIMIT && (
              <p className="text-center text-xs text-muted-foreground">
                {t("log.limitNote", { limit: NHAT_KY_LIMIT })}
              </p>
            )}
          </>
        )}

        <DialogFooter>
          <Button onClick={onClose}>{t("common.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Một phiếu trong nhật ký: gửi lúc nào · thử mấy lần · hỏng vì gì. */
function DongNhatKy({
  phieu,
  locale,
  tTime,
}: {
  phieu: DeliveryRow;
  locale: Locale;
  tTime: ReturnType<typeof useTranslations>;
}) {
  const t = useTranslations("integrations");

  const moc = [t("log.queuedAt", { when: formatRelative(phieu.createdAt, locale, tTime) })];
  if (phieu.status === "sent" && phieu.sentAt) {
    moc.push(t("log.sentAt", { when: formatRelative(phieu.sentAt, locale, tTime) }));
  } else if (phieu.status === "pending" && phieu.nextAttemptAt) {
    // Lần thử KẾ TIẾP nằm ở TƯƠNG LAI — `formatRelative` tính theo chiều quá
    // khứ nên sẽ đọc thành "vừa xong". Mốc tuyệt đối mới nói đúng.
    moc.push(t("log.nextAt", { when: formatDateTime(phieu.nextAttemptAt, locale) }));
  }
  moc.push(t("log.attempts", { count: phieu.attempts }));

  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={
            phieu.status === "sent"
              ? "secondary"
              : phieu.status === "dead"
                ? "destructive"
                : "outline"
          }
        >
          {t(`log.status_${phieu.status}`)}
        </Badge>
        <span className="text-[13px] font-medium">
          {LOAI_BIET.has(phieu.eventType)
            ? t(`events.${khoaAn(phieu.eventType)}`)
            : phieu.eventType}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{moc.join(" · ")}</p>
      {phieu.lastError && (
        <p className="mt-1 text-xs text-destructive">
          <LoiGui code={phieu.lastError} />
        </p>
      )}
    </li>
  );
}

function DongDuongBao({
  hook,
  pending,
  onToggle,
  onRetry,
  onEdit,
  onTest,
  onLog,
}: {
  hook: WebhookRow;
  pending: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onEdit: () => void;
  onTest: () => void;
  onLog: () => void;
}) {
  const t = useTranslations("integrations");
  const tTime = useTranslations("time");
  const locale = useLocale() as Locale;
  const dangChay = hook.status === "active";
  const dangHong = hook.consecutiveFailures > 0;

  return (
    <li className="p-3 sm:p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold">{hook.name}</span>
          <Badge variant={dangHong ? "destructive" : "secondary"}>
            {t(dangHong ? "hooks.failing" : "hooks.healthy")}
          </Badge>
          {!dangChay && <Badge variant="outline">{t("hooks.statusPaused")}</Badge>}
        </div>
        <p className="mt-1 font-mono text-xs break-all text-muted-foreground">{hook.url}</p>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {hook.eventTypes.map((ma) => (
          <Badge key={ma} variant="outline">
            {LOAI_BIET.has(ma) ? t(`events.${khoaAn(ma)}`) : ma}
          </Badge>
        ))}
      </div>

      {/* Hỏng thì nói RÕ hỏng mấy lần và lỗi cuối là gì — "đang hỏng" trống
          không thì chủ tiệm chẳng biết gọi ai, và luật 3 của thẻ design coi
          đường báo chết im lặng là thứ tệ nhất. */}
      {dangHong ? (
        <p className="mt-2 text-xs text-destructive">
          {t("hooks.failingDetail", {
            count: hook.consecutiveFailures,
            // Mã thô (`may_chu_tra_500`) dịch ngay tại đây: dòng này là chỗ
            // NHIỀU NGƯỜI ĐỌC NHẤT, để nguyên mã máy thì họ vẫn phải đi hỏi.
            error: hook.lastError
              ? moTaLoiGui(t, hook.lastError)
              : t("hooks.unknownError"),
          })}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {hook.lastSuccessAt === null
            ? t("hooks.noSuccessYet")
            : t("hooks.lastSuccess", {
                when: formatRelative(hook.lastSuccessAt, locale, tTime),
              })}
        </p>
      )}

      {/* Hàng thao tác ĐỨNG RIÊNG một dòng. Nhét năm nút chung hàng với tên +
          địa chỉ thì trên điện thoại chúng dồn thành cột hẹp và bấm nhầm nhau.
          `max-md:h-11` = 44px, khai TẠI CHỖ đúng như `components/ui/button.tsx`
          dặn (cỡ `sm` cố ý không tự nâng vì còn dùng ở hàng nút dày đặc khác). */}
      <div className="mt-3 flex flex-wrap gap-2">
        {dangHong && (
          <Button size="sm" className="max-md:h-11" disabled={pending} onClick={onRetry}>
            {t("hooks.retry")}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="max-md:h-11"
          disabled={pending}
          onClick={onTest}
        >
          <Send className="size-4" />
          {t("hooks.test")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="max-md:h-11"
          disabled={pending}
          onClick={onLog}
        >
          <ScrollText className="size-4" />
          {t("hooks.log")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="max-md:h-11"
          disabled={pending}
          onClick={onEdit}
        >
          <Pencil className="size-4" />
          {t("hooks.edit")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="max-md:h-11"
          disabled={pending}
          onClick={onToggle}
        >
          {t(dangChay ? "hooks.pause" : "hooks.resume")}
        </Button>
      </div>
    </li>
  );
}

/** Ba luật của đường báo ra — chép ý từ thẻ design để lúc code không bỏ nhánh nào. */
function BaLuat() {
  const t = useTranslations("integrations");
  const luat = ["one", "two", "three"] as const;

  return (
    <section className="space-y-2 rounded-xl border bg-card p-4">
      <h3 className="text-[13px] font-semibold">{t("rules.title")}</h3>
      {luat.map((k) => (
        <div key={k} className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed">
          <p className="font-medium text-foreground">{t(`rules.${k}`)}</p>
          <p className="mt-0.5 text-muted-foreground">{t(`rules.${k}Body`)}</p>
        </div>
      ))}
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════

export function IntegrationsView({
  canManage,
  apiKeys,
  webhooks,
  quyenCoThe,
  loadFailed,
}: {
  canManage: boolean;
  apiKeys: ApiKeyRow[];
  webhooks: WebhookRow[];
  quyenCoThe: string[];
  loadFailed: boolean;
}) {
  const t = useTranslations("integrations");
  const [pending, startTransition] = useTransition();
  const [dangTaoKhoa, setDangTaoKhoa] = useState(false);
  const [dangThuHoi, setDangThuHoi] = useState<ApiKeyRow | null>(null);
  const [dangTaoDuongBao, setDangTaoDuongBao] = useState(false);
  const [dangSuaDuongBao, setDangSuaDuongBao] = useState<WebhookRow | null>(null);
  const [dangXemNhatKy, setDangXemNhatKy] = useState<WebhookRow | null>(null);

  const doiTrangThai = (hook: WebhookRow) => {
    if (pending) return;
    startTransition(async () => {
      const res = await doiTrangThaiDuongBao(
        hook.id,
        hook.status === "active" ? "paused" : "active",
      );
      if (res.error) {
        toast.error(t(`errors.${maLoi(res.error)}`));
        return;
      }
      toast.success(t("toasts.hookStatusChanged"));
    });
  };

  const thuLai = (hook: WebhookRow) => {
    if (pending) return;
    startTransition(async () => {
      const res = await guiThuLai(hook.id);
      if (res.error) {
        toast.error(t(`errors.${maLoi(res.error)}`));
        return;
      }
      toast.success(t("toasts.retryQueued"));
    });
  };

  /**
   * Gửi thử — kết quả nói ra NGAY và nói CỤ THỂ.
   *
   * "Gửi thử không được" là câu vô dụng: người dùng vẫn phải đi đoán. Cả hai
   * nhánh ở đây đều mang theo số đo thật — mã trạng thái lúc thông, hoặc đúng
   * nguyên nhân lúc tắc.
   */
  const guiThu = (hook: WebhookRow) => {
    if (pending) return;
    startTransition(async () => {
      const res = await guiThuMotTin(hook.id);
      if (res.error === "gui_that_bai") {
        toast.error(
          t("toasts.testFailed", {
            reason: moTaLoiGui(t, res.loiGui ?? "khong_ro"),
          }),
        );
        return;
      }
      if (res.error) {
        toast.error(t(`errors.${maLoi(res.error)}`));
        return;
      }
      toast.success(t("toasts.testSent", { status: res.maTrangThai ?? 200 }));
    });
  };

  if (!canManage) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Lock className="mx-auto size-5 text-muted-foreground" />
            <h1 className="mt-3 text-[15px] font-semibold">{t("noPermission.title")}</h1>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted-foreground">
              {t("noPermission.description")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
        </div>

        {/* Tải hỏng thì NÓI RA. Hiện danh sách rỗng là nói dối "tiệm chưa nối gì". */}
        {loadFailed ? (
          <p className="flex items-start gap-1.5 rounded-xl border p-6 text-[13px] text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{t("loadFailed")}</span>
          </p>
        ) : (
          <>
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-[13px] font-semibold">{t("keys.title")}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("keys.subtitle")}</p>
                </div>
                <Button size="sm" disabled={pending} onClick={() => setDangTaoKhoa(true)}>
                  <Plus className="size-4" />
                  {t("keys.create")}
                </Button>
              </div>

              {apiKeys.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-center text-[13px] text-muted-foreground">
                  {t("keys.empty")}
                </p>
              ) : (
                <ul className="divide-y rounded-xl border bg-card">
                  {apiKeys.map((k) => (
                    <DongKhoa
                      key={k.id}
                      khoa={k}
                      quyenCoThe={quyenCoThe}
                      pending={pending}
                      onRevoke={() => setDangThuHoi(k)}
                    />
                  ))}
                </ul>
              )}

              {/* Chạm trần thì NÓI RA — trần ngầm là lỗi đã dính nhiều lần. */}
              {apiKeys.length >= KHOA_LIMIT && (
                <p className="text-center text-xs text-muted-foreground">
                  {t("keys.limitNote", { limit: KHOA_LIMIT })}
                </p>
              )}

              <p className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                {t("keys.hint")}
              </p>
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-[13px] font-semibold">{t("hooks.title")}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("hooks.subtitle")}</p>
                </div>
                <Button size="sm" disabled={pending} onClick={() => setDangTaoDuongBao(true)}>
                  <Plus className="size-4" />
                  {t("hooks.create")}
                </Button>
              </div>

              {webhooks.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-center text-[13px] text-muted-foreground">
                  {t("hooks.empty")}
                </p>
              ) : (
                <ul className="divide-y rounded-xl border bg-card">
                  {webhooks.map((w) => (
                    <DongDuongBao
                      key={w.id}
                      hook={w}
                      pending={pending}
                      onToggle={() => doiTrangThai(w)}
                      onRetry={() => thuLai(w)}
                      onEdit={() => setDangSuaDuongBao(w)}
                      onTest={() => guiThu(w)}
                      onLog={() => setDangXemNhatKy(w)}
                    />
                  ))}
                </ul>
              )}

              {webhooks.length >= DUONG_BAO_LIMIT && (
                <p className="text-center text-xs text-muted-foreground">
                  {t("hooks.limitNote", { limit: DUONG_BAO_LIMIT })}
                </p>
              )}
            </section>

            <BaLuat />
          </>
        )}
      </div>

      {dangTaoKhoa && (
        <TaoKhoaDialog quyenCoThe={quyenCoThe} onClose={() => setDangTaoKhoa(false)} />
      )}
      {dangThuHoi && (
        <ThuHoiDialog khoa={dangThuHoi} onClose={() => setDangThuHoi(null)} />
      )}
      {dangTaoDuongBao && <DuongBaoDialog onClose={() => setDangTaoDuongBao(false)} />}
      {dangSuaDuongBao && (
        <DuongBaoDialog
          // `key` ép React dựng lại hộp thoại khi đổi sang đường báo khác —
          // không có nó thì ô nhập giữ nguyên giá trị của đường báo trước đó
          // (state khởi tạo chỉ chạy lần đầu) và người dùng lưu đè nhầm.
          key={dangSuaDuongBao.id}
          hook={dangSuaDuongBao}
          onClose={() => setDangSuaDuongBao(null)}
        />
      )}
      {dangXemNhatKy && (
        <NhatKyDialog hook={dangXemNhatKy} onClose={() => setDangXemNhatKy(null)} />
      )}
    </div>
  );
}

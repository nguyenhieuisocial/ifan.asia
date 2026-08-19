"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Copy, Lock, Plus } from "lucide-react";
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
import { formatDate, formatRelative } from "@/lib/format";
import {
  doiTrangThaiDuongBao,
  guiThuLai,
  taoDuongBao,
  taoKhoa,
  thuHoiKhoa,
} from "./actions";
import {
  DUONG_BAO_LIMIT,
  KHOA_LIMIT,
  LOAI_SU_KIEN,
  type ApiKeyRow,
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
]);

function maLoi(code: string): string {
  return ERROR_KEYS.has(code) ? code : "save_failed";
}

/** `order.created` / `read:orders` → khoá i18n hợp lệ (dấu chấm là cấp lồng nhau). */
function khoaAn(value: string): string {
  return value.replace(/[.:]/g, "_");
}

const LOAI_BIET = new Set<string>(LOAI_SU_KIEN);

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

function TaoDuongBaoDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("integrations");
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [loai, setLoai] = useState<string[]>([]);

  const chuaDu = name.trim() === "" || url.trim() === "" || loai.length === 0;

  const bat = (ma: string, tick: boolean) =>
    setLoai((cu) => (tick ? [...cu, ma] : cu.filter((x) => x !== ma)));

  const gui = () => {
    if (pending || chuaDu) return;
    startTransition(async () => {
      const res = await taoDuongBao(name.trim(), url.trim(), loai);
      if (res.error) {
        toast.error(t(`errors.${maLoi(res.error)}`));
        return;
      }
      toast.success(t("toasts.hookCreated"));
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
          <DialogTitle>{t("createHook.title")}</DialogTitle>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={gui} disabled={pending || chuaDu}>
            {t("createHook.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DongDuongBao({
  hook,
  pending,
  onToggle,
  onRetry,
}: {
  hook: WebhookRow;
  pending: boolean;
  onToggle: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations("integrations");
  const tTime = useTranslations("time");
  const locale = useLocale() as Locale;
  const dangChay = hook.status === "active";
  const dangHong = hook.consecutiveFailures > 0;

  return (
    <li className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{hook.name}</span>
            <Badge variant={dangHong ? "destructive" : "secondary"}>
              {t(dangHong ? "hooks.failing" : "hooks.healthy")}
            </Badge>
            {!dangChay && <Badge variant="outline">{t("hooks.statusPaused")}</Badge>}
          </div>
          <p className="mt-1 font-mono text-xs break-all text-muted-foreground">{hook.url}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {dangHong && (
            <Button size="sm" disabled={pending} onClick={onRetry}>
              {t("hooks.retry")}
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={pending} onClick={onToggle}>
            {t(dangChay ? "hooks.pause" : "hooks.resume")}
          </Button>
        </div>
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
            error: hook.lastError ?? t("hooks.unknownError"),
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
      {dangTaoDuongBao && <TaoDuongBaoDialog onClose={() => setDangTaoDuongBao(false)} />}
    </div>
  );
}

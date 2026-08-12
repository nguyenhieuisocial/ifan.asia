"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Lock, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  RESOURCE_KINDS,
  RESOURCE_NAME_MAX,
  SERVICE_DURATION_MAX,
  SERVICE_DURATION_MIN,
  SERVICE_NAME_MAX,
  SERVICE_PRICE_MAX,
  type Resource,
  type ResourceKind,
  type Service,
} from "@/lib/booking/services";
import { saveResources, saveServices, seedServicesFromPack } from "./actions";

export type ServicesSettings = {
  services: Service[];
  resources: Resource[];
  /** Khoá pack đang dùng — chỉ để gọi TÊN ngành trên nút nạp mẫu. */
  industryKey: string | null;
  /** >0 = pack đang dùng CÓ dịch vụ mẫu để nạp. */
  packServiceCount: number;
};

/** Dòng đang sửa trên màn. `id === null` = dòng mới chưa từng lưu (xoá được).
 *  Số để dạng CHUỖI vì ô nhập trống ("") không phải là 0 — ép sang số sớm là
 *  cách nhanh nhất để gõ dở một chữ số thành ra 0đ mà không ai thấy. */
type ServiceDraft = {
  key: string;
  id: string | null;
  name: string;
  duration: string;
  price: string;
  isActive: boolean;
};
type ResourceDraft = {
  key: string;
  id: string | null;
  name: string;
  kind: ResourceKind;
  isActive: boolean;
};

const TOAST_KEYS = new Set([
  "notAuthenticated",
  "forbidden",
  "notFound",
  "invalidInput",
  "duplicateName",
  "packEmpty",
  "saveFailed",
]);
const ERROR_TO_TOAST_KEY: Record<string, string> = {
  not_authenticated: "notAuthenticated",
  forbidden: "forbidden",
  not_found: "notFound",
  invalid_input: "invalidInput",
  duplicate_name: "duplicateName",
  pack_empty: "packEmpty",
};
function toastKeyFor(error: string | null | undefined): string {
  const key = error ? (ERROR_TO_TOAST_KEY[error] ?? "") : "";
  return TOAST_KEYS.has(key) ? key : "saveFailed";
}

let seq = 0;
const nextKey = () => `new-${seq++}`;

function toServiceDrafts(rows: Service[]): ServiceDraft[] {
  return rows.map((s) => ({
    key: s.id,
    id: s.id,
    name: s.name,
    duration: String(s.durationMinutes),
    price: String(s.priceVnd),
    isActive: s.isActive,
  }));
}
function toResourceDrafts(rows: Resource[]): ResourceDraft[] {
  return rows.map((r) => ({ key: r.id, id: r.id, name: r.name, kind: r.kind, isActive: r.isActive }));
}

/** Chữ ký so sánh — chỉ để biết "có đổi so với bản đã lưu không", không lưu xuống DB. */
function servicesSignature(rows: ServiceDraft[]): string {
  return JSON.stringify(
    rows.map((r) => [r.id, r.name.trim(), r.duration.trim(), r.price.trim(), r.isActive]),
  );
}
function resourcesSignature(rows: ResourceDraft[]): string {
  return JSON.stringify(rows.map((r) => [r.id, r.name.trim(), r.kind, r.isActive]));
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/** Chỉ nhận chữ số — `type="number"` vẫn cho gõ 'e', '+', '-' ở phần lớn trình duyệt. */
const digitsOnly = (v: string) => v.replace(/\D/g, "");

export function ServicesView({
  canManage,
  initial,
}: {
  canManage: boolean;
  initial: ServicesSettings;
}) {
  const t = useTranslations("settings.services");
  const tIndustries = useTranslations("common.industries");

  const [services, setServices] = useState<ServiceDraft[]>(() => toServiceDrafts(initial.services));
  const [resources, setResources] = useState<ResourceDraft[]>(() =>
    toResourceDrafts(initial.resources),
  );
  // Bản ĐÃ LƯU — thanh Lưu so với bản này, KHÔNG so với `initial`. Hai lý do:
  // (1) sau khi lưu xong mà vẫn so với initial thì thanh Lưu không bao giờ tắt;
  // (2) nút "nạp dịch vụ mẫu" ghi thẳng vào CSDL, `initial` từ lần tải trang
  //     trở thành bản CŨ ngay lúc đó — "Bỏ thay đổi" mà quay về đó là xoá sạch
  //     danh sách vừa nạp khỏi màn hình dù CSDL vẫn còn.
  const [savedServices, setSavedServices] = useState<ServiceDraft[]>(() =>
    toServiceDrafts(initial.services),
  );
  const [savedResources, setSavedResources] = useState<ResourceDraft[]>(() =>
    toResourceDrafts(initial.resources),
  );
  const [savePending, startSaveTransition] = useTransition();
  const [seedPending, startSeedTransition] = useTransition();

  const servicesDirty = servicesSignature(services) !== servicesSignature(savedServices);
  const resourcesDirty = resourcesSignature(resources) !== resourcesSignature(savedResources);
  const dirty = servicesDirty || resourcesDirty;

  if (!canManage) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Lock className="size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t("noPermission.title")}</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">{t("noPermission.description")}</p>
      </div>
    );
  }

  const industryLabel = initial.industryKey ? tIndustries(`${initial.industryKey}.label`) : "";

  // ---------- Dịch vụ ----------

  const patchService = (key: string, p: Partial<ServiceDraft>) =>
    setServices((prev) => prev.map((s) => (s.key === key ? { ...s, ...p } : s)));
  const addService = () =>
    setServices((prev) => [
      ...prev,
      { key: nextKey(), id: null, name: "", duration: "60", price: "0", isActive: true },
    ]);
  const removeDraftService = (key: string) =>
    setServices((prev) => prev.filter((s) => s.key !== key));

  // ---------- Tài nguyên ----------

  const patchResource = (key: string, p: Partial<ResourceDraft>) =>
    setResources((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const addResource = () =>
    setResources((prev) => [
      ...prev,
      { key: nextKey(), id: null, name: "", kind: "bed", isActive: true },
    ]);
  const removeDraftResource = (key: string) =>
    setResources((prev) => prev.filter((r) => r.key !== key));

  const discard = () => {
    setServices(savedServices);
    setResources(savedResources);
  };

  /**
   * MỘT nút Lưu cho cả màn (khuôn màn Mặt tiền): chủ tiệm sửa giá dịch vụ VÀ
   * đổi tên giường rồi bấm một nút thì phải lưu CẢ HAI. Lưu từng khối rồi báo
   * trung thực: khối nào hỏng nói đúng khối đó, khối đã lưu được vẫn ghi nhận.
   */
  const save = () => {
    if (savePending || !dirty) return;

    // Chặn TRƯỚC khi gửi: ô trống là lỗi hay gặp nhất (bấm "+ Thêm" rồi bỏ dở),
    // để CSDL trả lời thì chủ tiệm chỉ nhận được một câu chung chung.
    if (servicesDirty && services.some((s) => !s.name.trim())) {
      toast.error(t("toasts.emptyServiceName"));
      return;
    }
    if (
      servicesDirty &&
      services.some((s) => {
        const n = Number(s.duration);
        return !Number.isInteger(n) || n < SERVICE_DURATION_MIN || n > SERVICE_DURATION_MAX;
      })
    ) {
      toast.error(t("toasts.badDuration", { min: SERVICE_DURATION_MIN, max: SERVICE_DURATION_MAX }));
      return;
    }
    if (resourcesDirty && resources.some((r) => !r.name.trim())) {
      toast.error(t("toasts.emptyResourceName"));
      return;
    }

    startSaveTransition(async () => {
      let servicesOk = !servicesDirty;
      let resourcesOk = !resourcesDirty;
      let firstError: string | null = null;

      if (servicesDirty) {
        const res = await saveServices(
          services.map((s) => ({
            id: s.id,
            name: s.name.trim(),
            durationMinutes: Number(s.duration),
            priceVnd: Number(s.price || "0"),
            isActive: s.isActive,
          })),
        );
        servicesOk = !res.error;
        if (res.error) firstError = res.error;
        else if (res.services) {
          const drafts = toServiceDrafts(res.services);
          setServices(drafts);
          setSavedServices(drafts);
        }
      }

      if (resourcesDirty) {
        const res = await saveResources(
          resources.map((r) => ({
            id: r.id,
            name: r.name.trim(),
            kind: r.kind,
            isActive: r.isActive,
          })),
        );
        resourcesOk = !res.error;
        if (res.error && !firstError) firstError = res.error;
        else if (res.resources) {
          const drafts = toResourceDrafts(res.resources);
          setResources(drafts);
          setSavedResources(drafts);
        }
      }

      if (servicesOk && resourcesOk) {
        toast.success(t("toasts.saved"));
        return;
      }
      // Một phần hỏng → nói ĐÚNG phần nào hỏng, không báo chung chung "lưu thất bại"
      // (phần kia đã lưu thật, báo sai thì chủ tiệm gõ lại lần nữa vô ích).
      const failedPart = !servicesOk ? t("unsaved.services") : t("unsaved.resources");
      toast.error(
        t("toasts.partFailed", { part: failedPart, reason: t(`toasts.${toastKeyFor(firstError)}`) }),
      );
    });
  };

  /** Nạp dịch vụ mẫu — GHI NGAY (không qua thanh Lưu chung): nút chỉ hiện khi
   *  danh sách RỖNG nên không có thay đổi nào đang chờ để mất. Bấm hai lần
   *  không tạo trùng (ON CONFLICT DO NOTHING ở actions.ts). */
  const seed = () =>
    startSeedTransition(async () => {
      const res = await seedServicesFromPack();
      if (res.error || !res.services) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      const drafts = toServiceDrafts(res.services);
      setServices(drafts);
      setSavedServices(drafts);
      toast.success(
        res.inserted ? t("toasts.seeded", { n: res.inserted }) : t("toasts.seededNothingNew"),
      );
    });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
          <div>
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
          </div>

          {/* ---------- Dịch vụ ---------- */}
          <Section title={t("catalog.title")} description={t("catalog.description")}>
            {services.length === 0 ? (
              <div className="rounded-md border border-dashed p-5 text-center">
                <p className="text-[13px] text-muted-foreground">{t("catalog.empty.body")}</p>
                {initial.packServiceCount > 0 ? (
                  // `h-auto whitespace-normal`: nhãn có TÊN NGÀNH ghép vào nên dài
                  // ngắn tuỳ ngành — "Lấy danh sách mẫu ngành Spa / Salon / Nail"
                  // rộng 327px trong khung 323px ở điện thoại hẹp, mà Button mặc
                  // định `whitespace-nowrap` nên chữ bị cắt cụt giữa chừng.
                  <Button
                    size="sm"
                    className="mt-3 h-auto max-w-full py-2 whitespace-normal"
                    onClick={seed}
                    disabled={seedPending}
                  >
                    {seedPending
                      ? t("catalog.empty.seeding")
                      : t("catalog.empty.seed", { industry: industryLabel })}
                  </Button>
                ) : (
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    {initial.industryKey
                      ? t("catalog.empty.noSample", { industry: industryLabel })
                      : t("catalog.empty.noIndustry")}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {services.map((s) => (
                  <div key={s.key} className="space-y-2 rounded-md border p-2.5">
                    <div className="flex items-center gap-2">
                      <Input
                        value={s.name}
                        maxLength={SERVICE_NAME_MAX}
                        onChange={(e) => patchService(s.key, { name: e.target.value })}
                        placeholder={t("catalog.namePlaceholder")}
                        aria-label={t("catalog.nameLabel")}
                        className="h-9 min-w-0 flex-1"
                      />
                      {s.id === null && (
                        <button
                          type="button"
                          onClick={() => removeDraftService(s.key)}
                          className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                          aria-label={t("catalog.removeDraft")}
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                      <div>
                        {/* Thời lượng đứng TRƯỚC giá và có nhãn riêng: đây là con số
                            quyết định máy tính ra giờ trống, giá chỉ để ghi vào lịch. */}
                        <Label
                          htmlFor={`svc-dur-${s.key}`}
                          className="text-[11px] text-muted-foreground"
                        >
                          {t("catalog.durationLabel")}
                        </Label>
                        <Input
                          id={`svc-dur-${s.key}`}
                          inputMode="numeric"
                          value={s.duration}
                          onChange={(e) =>
                            patchService(s.key, { duration: digitsOnly(e.target.value).slice(0, 4) })
                          }
                          className="h-8 w-20 font-semibold"
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor={`svc-price-${s.key}`}
                          className="text-[11px] text-muted-foreground"
                        >
                          {t("catalog.priceLabel")}
                        </Label>
                        <Input
                          id={`svc-price-${s.key}`}
                          inputMode="numeric"
                          value={s.price}
                          onChange={(e) =>
                            patchService(s.key, {
                              price: digitsOnly(e.target.value).slice(
                                0,
                                String(SERVICE_PRICE_MAX).length,
                              ),
                            })
                          }
                          className="h-8 w-32"
                        />
                      </div>
                      <Label className="flex h-8 cursor-pointer items-center gap-1.5 text-[13px]">
                        <Checkbox
                          checked={s.isActive}
                          onChange={(e) => patchService(s.key, { isActive: e.target.checked })}
                        />
                        {s.isActive ? t("catalog.active") : t("catalog.inactive")}
                      </Label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button variant="outline" size="sm" onClick={addService}>
              <Plus className="size-4" />
              {t("catalog.add")}
            </Button>
            <p className="text-[11px] text-muted-foreground">{t("catalog.offHint")}</p>
          </Section>

          {/* ---------- Giường · phòng · máy ---------- */}
          <Section title={t("resources.title")} description={t("resources.description")}>
            {resources.length === 0 ? (
              <p className="rounded-md bg-muted/50 p-3 text-[13px] text-muted-foreground">
                {t("resources.emptyHint")}
              </p>
            ) : (
              <div className="space-y-2">
                {/* Cùng khuôn xếp dòng với dịch vụ: TÊN chiếm trọn một dòng, phần
                    chọn loại + bật/tắt xuống dòng dưới. Bản đầu nhét cả ba thứ
                    lên một dòng `flex-wrap` — ở 375px ô tên co lại còn ~80px,
                    chủ tiệm chỉ đọc được "Giư" của "Giường 1". */}
                {resources.map((r) => (
                  <div key={r.key} className="space-y-2 rounded-md border p-2.5">
                    <div className="flex items-center gap-2">
                      <Input
                        value={r.name}
                        maxLength={RESOURCE_NAME_MAX}
                        onChange={(e) => patchResource(r.key, { name: e.target.value })}
                        placeholder={t("resources.namePlaceholder")}
                        aria-label={t("resources.nameLabel")}
                        className="h-9 min-w-0 flex-1"
                      />
                      {r.id === null && (
                        <button
                          type="button"
                          onClick={() => removeDraftResource(r.key)}
                          className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                          aria-label={t("resources.removeDraft")}
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <Select
                        value={r.kind}
                        onChange={(e) =>
                          patchResource(r.key, { kind: e.target.value as ResourceKind })
                        }
                        aria-label={t("resources.kindLabel")}
                        className="h-8 w-32"
                      >
                        {RESOURCE_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {t(`resources.kinds.${k}`)}
                          </option>
                        ))}
                      </Select>
                      <Label className="flex h-8 cursor-pointer items-center gap-1.5 text-[13px]">
                        <Checkbox
                          checked={r.isActive}
                          onChange={(e) => patchResource(r.key, { isActive: e.target.checked })}
                        />
                        {r.isActive ? t("resources.active") : t("resources.inactive")}
                      </Label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button variant="outline" size="sm" onClick={addResource}>
              <Plus className="size-4" />
              {t("resources.add")}
            </Button>
          </Section>
        </div>
      </div>

      {/* MỘT thanh Lưu cho cả màn, dính đáy, chỉ hiện khi có thay đổi chưa lưu.
          Nêu TÊN KHỐI đang chờ lưu (không nêu con số) — trên điện thoại khối kia
          thường đã cuộn khuất, "còn 3 thay đổi" không giúp tìm ra chúng ở đâu. */}
      {dirty && (
        <div className="border-t bg-background shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          <div className="mx-auto flex w-full max-w-2xl items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            <p className="min-w-0 flex-1 text-[12px] leading-snug text-muted-foreground">
              {t("unsaved.label")}{" "}
              <span className="font-medium text-foreground">
                {[servicesDirty ? t("unsaved.services") : null, resourcesDirty ? t("unsaved.resources") : null]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </p>
            <Button variant="outline" size="sm" onClick={discard} disabled={savePending}>
              {t("unsaved.discard")}
            </Button>
            <Button size="sm" onClick={save} disabled={savePending}>
              {savePending ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

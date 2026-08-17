"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Lock, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  ITEM_DURATION_MAX,
  ITEM_DURATION_MIN,
  ITEM_GROUP_MAX,
  ITEM_KINDS,
  ITEM_NAME_MAX,
  ITEM_PRICE_MAX,
  ITEM_STATUSES,
  ITEM_UNIT_MAX,
  type Item,
  type ItemKind,
  type ItemStatus,
  type ItemVariant,
} from "@/lib/catalog/items";
import { deleteVariant, saveItem, saveVariant } from "./actions";

const TOAST_KEYS = new Set([
  "notAuthenticated",
  "forbidden",
  "notFound",
  "invalidInput",
  "duplicateName",
  "kindFieldsInvalid",
  "variantNeedsProduct",
  "variantInUse",
  "saveFailed",
]);
const ERROR_TO_TOAST_KEY: Record<string, string> = {
  not_authenticated: "notAuthenticated",
  forbidden: "forbidden",
  not_found: "notFound",
  invalid_input: "invalidInput",
  duplicate_name: "duplicateName",
  kind_fields_invalid: "kindFieldsInvalid",
  variant_needs_product: "variantNeedsProduct",
  variant_in_use: "variantInUse",
};
function toastKeyFor(error: string | null | undefined): string {
  const key = error ? (ERROR_TO_TOAST_KEY[error] ?? "") : "";
  return TOAST_KEYS.has(key) ? key : "saveFailed";
}

const digitsOnly = (v: string) => v.replace(/\D/g, "");

/** Ô nhập item mới — thanh Lưu RIÊNG cho từng item (khác khuôn services vì
 *  mỗi item còn kéo theo cả một danh sách biến thể, gộp chung một thanh Lưu
 *  cho cả trang sẽ khiến sửa biến thể của item A vô tình lưu luôn item B
 *  đang gõ dở. */
type ItemDraft = {
  kind: ItemKind;
  name: string;
  groupName: string;
  unit: string;
  duration: string;
  price: string;
  cost: string;
  status: ItemStatus;
};

function toDraft(item: Item): ItemDraft {
  return {
    kind: item.kind,
    name: item.name,
    groupName: item.groupName ?? "",
    unit: item.unit ?? "",
    duration: item.durationMinutes ? String(item.durationMinutes) : "",
    price: String(item.priceVnd),
    cost: item.costVnd === null ? "" : String(item.costVnd),
    status: item.status,
  };
}
const emptyDraft = (kind: ItemKind): ItemDraft => ({
  kind,
  name: "",
  groupName: "",
  unit: "",
  duration: kind === "service" ? "60" : "",
  price: "0",
  cost: "",
  status: "active",
});

function ItemRow({
  item,
  canSeeCost,
  onSaved,
}: {
  item: Item;
  canSeeCost: boolean;
  onSaved: (items: Item[]) => void;
}) {
  const t = useTranslations("items");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ItemDraft>(() => toDraft(item));
  const [pending, startTransition] = useTransition();
  const [addingVariant, setAddingVariant] = useState(false);
  const [variantLabel, setVariantLabel] = useState("");
  const [variantSku, setVariantSku] = useState("");
  const [variantPrice, setVariantPrice] = useState("");
  const [variantPending, startVariantTransition] = useTransition();

  const patch = (p: Partial<ItemDraft>) => setDraft((d) => ({ ...d, ...p }));

  const save = () => {
    if (!draft.name.trim()) {
      toast.error(t("toasts.emptyName"));
      return;
    }
    if (draft.kind === "service") {
      const n = Number(draft.duration);
      if (!Number.isInteger(n) || n < ITEM_DURATION_MIN || n > ITEM_DURATION_MAX) {
        toast.error(t("toasts.badDuration", { min: ITEM_DURATION_MIN, max: ITEM_DURATION_MAX }));
        return;
      }
    } else if (!draft.unit.trim()) {
      toast.error(t("toasts.unitRequired"));
      return;
    }
    startTransition(async () => {
      const res = await saveItem({
        id: item.id,
        kind: draft.kind,
        name: draft.name.trim(),
        groupName: draft.groupName.trim() || null,
        unit: draft.kind === "product" ? draft.unit.trim() : null,
        durationMinutes: draft.kind === "service" ? Number(draft.duration) : null,
        priceVnd: Number(draft.price || "0"),
        costVnd: draft.cost.trim() === "" ? null : Number(draft.cost),
        status: draft.status,
      });
      if (res.error || !res.items) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      onSaved(res.items);
      setEditing(false);
      toast.success(t("toasts.saved"));
    });
  };

  const addVariant = () => {
    if (!variantLabel.trim()) return;
    startVariantTransition(async () => {
      const res = await saveVariant({
        id: null,
        itemId: item.id,
        label: variantLabel.trim(),
        priceVnd: variantPrice.trim() === "" ? null : Number(variantPrice),
        sku: variantSku.trim() || null,
      });
      if (res.error || !res.items) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      onSaved(res.items);
      setVariantLabel("");
      setVariantSku("");
      setVariantPrice("");
      setAddingVariant(false);
    });
  };

  const removeVariant = (v: ItemVariant) => {
    startVariantTransition(async () => {
      const res = await deleteVariant(v.id);
      if (res.error || !res.items) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      onSaved(res.items);
    });
  };

  if (!editing) {
    return (
      <div className="rounded-md border p-2.5">
        <button
          type="button"
          onClick={() => {
            setDraft(toDraft(item));
            setEditing(true);
          }}
          className="flex w-full items-start justify-between gap-2 text-left"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[14px] font-medium">{item.name}</span>
              <StatusBadge status={item.status} t={t} />
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {t(`kinds.${item.kind}`)}
              {item.groupName ? ` · ${item.groupName}` : ""}
              {item.kind === "service" && item.durationMinutes ? ` · ${item.durationMinutes} ${t("minutes")}` : ""}
              {item.kind === "product" && item.unit ? ` · ${item.unit}` : ""}
            </div>
          </div>
          <div className="shrink-0 text-right text-[13px] font-medium">
            {item.priceVnd.toLocaleString("vi-VN")}đ
          </div>
        </button>

        {item.kind === "product" && item.variants.length > 0 && (
          <div className="mt-2 ml-3 space-y-1 border-l-2 pl-3">
            {item.variants.map((v) => (
              <div key={v.id} className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">
                  {v.label}
                  {v.sku ? ` · ${v.sku}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  {v.priceVnd !== null && <span>{v.priceVnd.toLocaleString("vi-VN")}đ</span>}
                  <button
                    type="button"
                    onClick={() => removeVariant(v)}
                    disabled={variantPending}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={t("variants.remove")}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 rounded-md border border-primary/40 bg-muted/20 p-2.5">
      <Input
        value={draft.name}
        maxLength={ITEM_NAME_MAX}
        onChange={(e) => patch({ name: e.target.value })}
        placeholder={t("namePlaceholder")}
        aria-label={t("nameLabel")}
        className="h-9"
      />
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div>
          <Label className="text-[11px] text-muted-foreground">{t("groupLabel")}</Label>
          <Input
            value={draft.groupName}
            maxLength={ITEM_GROUP_MAX}
            onChange={(e) => patch({ groupName: e.target.value })}
            className="h-8 w-36"
          />
        </div>
        {draft.kind === "service" ? (
          <div>
            <Label className="text-[11px] text-muted-foreground">{t("durationLabel")}</Label>
            <Input
              inputMode="numeric"
              value={draft.duration}
              onChange={(e) => patch({ duration: digitsOnly(e.target.value).slice(0, 4) })}
              className="h-8 w-20"
            />
          </div>
        ) : (
          <div>
            <Label className="text-[11px] text-muted-foreground">{t("unitLabel")}</Label>
            <Input
              value={draft.unit}
              maxLength={ITEM_UNIT_MAX}
              onChange={(e) => patch({ unit: e.target.value })}
              className="h-8 w-24"
            />
          </div>
        )}
        <div>
          <Label className="text-[11px] text-muted-foreground">{t("priceLabel")}</Label>
          <Input
            inputMode="numeric"
            value={draft.price}
            onChange={(e) => patch({ price: digitsOnly(e.target.value).slice(0, String(ITEM_PRICE_MAX).length) })}
            className="h-8 w-32"
          />
        </div>
        {canSeeCost && (
          <div>
            <Label className="text-[11px] text-muted-foreground">{t("costLabel")}</Label>
            <Input
              inputMode="numeric"
              value={draft.cost}
              onChange={(e) => patch({ cost: digitsOnly(e.target.value).slice(0, String(ITEM_PRICE_MAX).length) })}
              placeholder={t("costPlaceholder")}
              className="h-8 w-32"
            />
          </div>
        )}
        <div>
          <Label className="text-[11px] text-muted-foreground">{t("statusLabel")}</Label>
          <Select
            value={draft.status}
            onChange={(e) => patch({ status: e.target.value as ItemStatus })}
            className="h-8 w-32"
          >
            {ITEM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`statuses.${s}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {draft.kind === "product" && (
        <div className="rounded-md border bg-background p-2">
          <div className="text-[11px] font-medium text-muted-foreground">{t("variants.title")}</div>
          <div className="mt-1.5 space-y-1">
            {item.variants.map((v) => (
              <div key={v.id} className="flex items-center justify-between text-[12px]">
                <span>
                  {v.label}
                  {v.sku ? ` · ${v.sku}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => removeVariant(v)}
                  disabled={variantPending}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          {addingVariant ? (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <Input
                value={variantLabel}
                onChange={(e) => setVariantLabel(e.target.value)}
                placeholder={t("variants.labelPlaceholder")}
                className="h-8 w-28"
                autoFocus
              />
              <Input
                value={variantSku}
                onChange={(e) => setVariantSku(e.target.value)}
                placeholder={t("variants.skuPlaceholder")}
                className="h-8 w-24"
              />
              <Input
                inputMode="numeric"
                value={variantPrice}
                onChange={(e) => setVariantPrice(digitsOnly(e.target.value))}
                placeholder={t("variants.pricePlaceholder")}
                className="h-8 w-28"
              />
              <Button size="sm" className="h-8" onClick={addVariant} disabled={variantPending}>
                {t("variants.add")}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="mt-2 h-7" onClick={() => setAddingVariant(true)}>
              <Plus className="size-3.5" />
              {t("variants.addNew")}
            </Button>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ status, t }: { status: ItemStatus; t: ReturnType<typeof useTranslations> }) {
  const cls =
    status === "active"
      ? "bg-green-100 text-green-800"
      : status === "draft"
        ? "bg-amber-100 text-amber-800"
        : "bg-stone-200 text-stone-600";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{t(`statuses.${status}`)}</span>
  );
}

export function ItemsView({
  canManage,
  canSeeCost,
  initial,
}: {
  canManage: boolean;
  canSeeCost: boolean;
  initial: Item[];
}) {
  const t = useTranslations("items");
  const [items, setItems] = useState<Item[]>(initial);
  const [creating, setCreating] = useState(false);
  const [newDraft, setNewDraft] = useState<ItemDraft>(() => emptyDraft("service"));
  const [createPending, startCreateTransition] = useTransition();

  if (!canManage) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Lock className="size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t("noPermission.title")}</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">{t("noPermission.description")}</p>
      </div>
    );
  }

  const createItem = () => {
    if (!newDraft.name.trim()) {
      toast.error(t("toasts.emptyName"));
      return;
    }
    if (newDraft.kind === "service") {
      const n = Number(newDraft.duration);
      if (!Number.isInteger(n) || n < ITEM_DURATION_MIN || n > ITEM_DURATION_MAX) {
        toast.error(t("toasts.badDuration", { min: ITEM_DURATION_MIN, max: ITEM_DURATION_MAX }));
        return;
      }
    } else if (!newDraft.unit.trim()) {
      toast.error(t("toasts.unitRequired"));
      return;
    }
    startCreateTransition(async () => {
      const res = await saveItem({
        id: null,
        kind: newDraft.kind,
        name: newDraft.name.trim(),
        groupName: newDraft.groupName.trim() || null,
        unit: newDraft.kind === "product" ? newDraft.unit.trim() : null,
        durationMinutes: newDraft.kind === "service" ? Number(newDraft.duration) : null,
        priceVnd: Number(newDraft.price || "0"),
        costVnd: newDraft.cost.trim() === "" ? null : Number(newDraft.cost),
        status: "active",
      });
      if (res.error || !res.items) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      setItems(res.items);
      setCreating(false);
      setNewDraft(emptyDraft("service"));
      toast.success(t("toasts.created"));
    });
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">{t("title")}</h1>
              <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
            </div>
            {!creating && (
              <Button size="sm" onClick={() => setCreating(true)} className="shrink-0">
                <Plus className="size-4" />
                {t("addNew")}
              </Button>
            )}
          </div>

          {creating && (
            <div className="space-y-2.5 rounded-lg border-2 border-primary/50 bg-muted/20 p-3">
              <div className="flex gap-2">
                {ITEM_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      setNewDraft((d) => ({
                        ...emptyDraft(k),
                        name: d.name,
                        groupName: d.groupName,
                        price: d.price,
                      }))
                    }
                    className={`flex-1 rounded-md py-2 text-[13px] font-medium ${
                      newDraft.kind === k ? "bg-primary text-primary-foreground" : "border text-foreground"
                    }`}
                  >
                    {t(`kinds.${k}`)}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">{t("kindHint")}</p>
              <Input
                value={newDraft.name}
                maxLength={ITEM_NAME_MAX}
                onChange={(e) => setNewDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder={t("namePlaceholder")}
                className="h-9"
                autoFocus
              />
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                <div>
                  <Label className="text-[11px] text-muted-foreground">{t("groupLabel")}</Label>
                  <Input
                    value={newDraft.groupName}
                    maxLength={ITEM_GROUP_MAX}
                    onChange={(e) => setNewDraft((d) => ({ ...d, groupName: e.target.value }))}
                    className="h-8 w-36"
                  />
                </div>
                {newDraft.kind === "service" ? (
                  <div>
                    <Label className="text-[11px] text-muted-foreground">{t("durationLabel")}</Label>
                    <Input
                      inputMode="numeric"
                      value={newDraft.duration}
                      onChange={(e) => setNewDraft((d) => ({ ...d, duration: digitsOnly(e.target.value).slice(0, 4) }))}
                      className="h-8 w-20"
                    />
                  </div>
                ) : (
                  <div>
                    <Label className="text-[11px] text-muted-foreground">{t("unitLabel")}</Label>
                    <Input
                      value={newDraft.unit}
                      maxLength={ITEM_UNIT_MAX}
                      onChange={(e) => setNewDraft((d) => ({ ...d, unit: e.target.value }))}
                      className="h-8 w-24"
                    />
                  </div>
                )}
                <div>
                  <Label className="text-[11px] text-muted-foreground">{t("priceLabel")}</Label>
                  <Input
                    inputMode="numeric"
                    value={newDraft.price}
                    onChange={(e) =>
                      setNewDraft((d) => ({
                        ...d,
                        price: digitsOnly(e.target.value).slice(0, String(ITEM_PRICE_MAX).length),
                      }))
                    }
                    className="h-8 w-32"
                  />
                </div>
                {canSeeCost && (
                  <div>
                    <Label className="text-[11px] text-muted-foreground">{t("costLabel")}</Label>
                    <Input
                      inputMode="numeric"
                      value={newDraft.cost}
                      onChange={(e) =>
                        setNewDraft((d) => ({
                          ...d,
                          cost: digitsOnly(e.target.value).slice(0, String(ITEM_PRICE_MAX).length),
                        }))
                      }
                      placeholder={t("costPlaceholder")}
                      className="h-8 w-32"
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCreating(false);
                    setNewDraft(emptyDraft("service"));
                  }}
                  disabled={createPending}
                >
                  {t("cancel")}
                </Button>
                <Button size="sm" onClick={createItem} disabled={createPending}>
                  {createPending ? t("saving") : t("save")}
                </Button>
              </div>
            </div>
          )}

          {items.length === 0 && !creating ? (
            <p className="rounded-md border border-dashed p-5 text-center text-[13px] text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <ItemRow key={item.id} item={item} canSeeCost={canSeeCost} onSaved={setItems} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

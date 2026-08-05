"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FieldInput } from "../field-input";
import { deleteForm, saveForm, setFormStatus } from "../actions";
import {
  FIELD_TYPES,
  HAS_OPTIONS,
  MAX_FIELDS,
  slugKey,
  type ApprovalLevel,
  type FieldType,
  type FieldValue,
  type FormField,
} from "../types";

export type EditorMember = { userId: string; name: string; role: string };

const TOAST_KEYS = ["forbidden", "invalid_input", "no_fields"];

export function FormEditor({
  formId,
  initialName,
  initialDescription,
  status,
  initialFields,
  initialLevels,
  members,
  submissionCount,
}: {
  formId: string;
  initialName: string;
  initialDescription: string;
  status: "draft" | "published" | "archived";
  initialFields: FormField[];
  initialLevels: ApprovalLevel[];
  members: EditorMember[];
  submissionCount: number;
}) {
  const t = useTranslations("forms");
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [fields, setFields] = useState<FormField[]>(initialFields);
  const [levels, setLevels] = useState<ApprovalLevel[]>(initialLevels);
  const [preview, setPreview] = useState<Record<string, FieldValue>>({});
  const [pending, startTransition] = useTransition();

  const toastError = (key: string | null) =>
    toast.error(t(`toasts.${key && TOAST_KEYS.includes(key) ? key : "failed"}`));

  const setField = (i: number, patch: Partial<FormField>) =>
    setFields((prev) => prev.map((f, n) => (n === i ? { ...f, ...patch } : f)));

  const addField = () => {
    if (fields.length >= MAX_FIELDS) {
      toast.error(t("editor.maxFields", { n: MAX_FIELDS }));
      return;
    }
    setFields((prev) => [
      ...prev,
      {
        key: slugKey(`o ${prev.length + 1}`, prev.map((f) => f.key)),
        label: "",
        type: "text",
        required: false,
      },
    ]);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    setFields((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  /** Nhãn đổi → sinh lại mã ô nếu ô đó CHƯA có phiếu nào nộp (mã đã nộp phải giữ nguyên). */
  const onLabelChange = (i: number, label: string) => {
    if (submissionCount > 0) {
      setField(i, { label });
      return;
    }
    const taken = fields.filter((_, n) => n !== i).map((f) => f.key);
    setField(i, { label, key: slugKey(label || `o ${i + 1}`, taken) });
  };

  /** Ô nào chưa hợp lệ → chặn Lưu và tô đỏ, để không phải chờ lỗi từ máy chủ. */
  const problems = useMemo(() => {
    const bad = new Set<number>();
    fields.forEach((f, i) => {
      if (f.label.trim() === "" || /[<>]/.test(f.label)) bad.add(i);
      if (HAS_OPTIONS.includes(f.type)) {
        const o = f.options ?? [];
        if (o.length === 0 || o.some((x) => /[<>]/.test(x)) || new Set(o).size !== o.length) {
          bad.add(i);
        }
      }
    });
    return bad;
  }, [fields]);

  const nameInvalid = name.trim() === "" || /[<>]/.test(name);
  const canSave = !pending && !nameInvalid && problems.size === 0;

  const payload = () => ({
    formId,
    name: name.trim(),
    description: description.trim() === "" ? null : description.trim(),
    fields: fields.map((f) => ({
      key: f.key,
      label: f.label.trim(),
      type: f.type,
      required: f.required === true,
      ...(HAS_OPTIONS.includes(f.type) ? { options: f.options ?? [] } : {}),
    })),
    approvalLevels: levels,
  });

  const save = (then?: () => void) => {
    if (!canSave) return;
    startTransition(async () => {
      const res = await saveForm(payload());
      if (res.error) {
        toastError(res.error);
        return;
      }
      if (then) then();
      else toast.success(t("toasts.saved"));
      router.refresh();
    });
  };

  const publish = () =>
    save(() =>
      startTransition(async () => {
        const res = await setFormStatus(formId, "published");
        if (res.error) {
          toastError(res.error);
          return;
        }
        toast.success(t("toasts.published"));
        router.refresh();
      }),
    );

  const unpublish = () =>
    startTransition(async () => {
      const res = await setFormStatus(formId, "draft");
      if (res.error) {
        toastError(res.error);
        return;
      }
      toast.success(t("toasts.unpublished"));
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      const res = await deleteForm(formId);
      if (res.error) {
        toastError(res.error);
        return;
      }
      toast.success(t("toasts.deleted"));
      router.push("/app/settings/forms");
    });

  const levelCount = levels.length;
  const setLevelCount = (n: number) =>
    setLevels((prev) => {
      const next = [...prev];
      while (next.length < n) next.push({ to: "role:owner" });
      return next.slice(0, n);
    });

  const validPreviewFields = fields.filter((f, i) => !problems.has(i));

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
        <Link
          href="/app/settings/forms"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("editor.back")}
        </Link>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-4">
            {/* ---- Tên biểu mẫu ---- */}
            <section className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[15px] font-semibold">{t("editor.title")}</h1>
                <Badge variant={status === "published" ? "secondary" : "outline"}>
                  {t(`status.${status}`)}
                </Badge>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fe-name">{t("editor.nameLabel")}</Label>
                <Input
                  id="fe-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  aria-invalid={nameInvalid || undefined}
                  className={cn(nameInvalid && "border-destructive")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fe-desc">{t("editor.descLabel")}</Label>
                <Input
                  id="fe-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  placeholder={t("editor.descPlaceholder")}
                />
              </div>
            </section>

            {/* ---- Các ô cần điền ---- */}
            <section className="space-y-3 rounded-lg border p-4">
              <div>
                <h2 className="text-[13px] font-semibold">{t("editor.fieldsTitle")}</h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {t("editor.fieldsHint")}
                </p>
              </div>

              {fields.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-[13px] text-muted-foreground">
                  {t("editor.noFields")}
                </p>
              ) : (
                <ul className="space-y-3">
                  {fields.map((f, i) => (
                    <li
                      key={f.key}
                      className={cn(
                        "space-y-2.5 rounded-lg border p-3",
                        problems.has(i) && "border-destructive/50",
                      )}
                    >
                      {/* basis-56: ở 375px ô tên không đủ chỗ cạnh ô kiểu → xuống dòng
                          thay vì bị bóp còn một nhúm chữ */}
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-0 flex-1 basis-56 space-y-1.5">
                          <Label
                            htmlFor={`fl-${f.key}`}
                            className="text-xs text-muted-foreground"
                          >
                            {t("editor.fieldLabel")}
                          </Label>
                          <Input
                            id={`fl-${f.key}`}
                            value={f.label}
                            onChange={(e) => onLabelChange(i, e.target.value)}
                            maxLength={120}
                            placeholder={t("editor.fieldLabelPlaceholder")}
                            aria-invalid={problems.has(i) || undefined}
                          />
                        </div>
                        <div className="w-40 shrink-0 space-y-1.5">
                          <Label
                            htmlFor={`ft-${f.key}`}
                            className="text-xs text-muted-foreground"
                          >
                            {t("editor.fieldType")}
                          </Label>
                          <Select
                            id={`ft-${f.key}`}
                            value={f.type}
                            onChange={(e) =>
                              setField(i, {
                                type: e.target.value as FieldType,
                                options: HAS_OPTIONS.includes(e.target.value as FieldType)
                                  ? (f.options ?? [])
                                  : undefined,
                              })
                            }
                          >
                            {FIELD_TYPES.map((ty) => (
                              <option key={ty} value={ty}>
                                {t(`fieldTypes.${ty}`)}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>

                      {HAS_OPTIONS.includes(f.type) && (
                        <div className="space-y-1.5">
                          <Label
                            htmlFor={`fo-${f.key}`}
                            className="text-xs text-muted-foreground"
                          >
                            {t("editor.optionsLabel")}
                          </Label>
                          <Textarea
                            id={`fo-${f.key}`}
                            rows={3}
                            value={(f.options ?? []).join("\n")}
                            onChange={(e) =>
                              setField(i, {
                                options: e.target.value
                                  .split("\n")
                                  .map((x) => x.trim())
                                  .filter((x) => x !== ""),
                              })
                            }
                            placeholder={t("editor.optionsPlaceholder")}
                          />
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label className="cursor-pointer">
                          <Checkbox
                            checked={f.required === true}
                            onChange={(e) => setField(i, { required: e.target.checked })}
                          />
                          {t("editor.required")}
                        </Label>
                        <div className="flex items-center gap-1">
                          {/* Icon LUÔN đi kèm chữ — không để người dùng phải đoán ý
                              nghĩa hình vẽ (cùng quy ước với huy hiệu loại thông báo) */}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={i === 0}
                            onClick={() => move(i, -1)}
                          >
                            <ArrowUp className="size-4" />
                            {t("editor.moveUp")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={i === fields.length - 1}
                            onClick={() => move(i, 1)}
                          >
                            <ArrowDown className="size-4" />
                            {t("editor.moveDown")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setFields((p) => p.filter((_, n) => n !== i))}
                          >
                            <Trash2 className="size-4" />
                            {t("editor.removeField")}
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <Button variant="outline" size="sm" onClick={addField}>
                <Plus className="size-4" />
                {t("editor.addField")}
              </Button>
            </section>

            {/* ---- Ai duyệt ---- */}
            <section className="space-y-3 rounded-lg border p-4">
              <div>
                <h2 className="text-[13px] font-semibold">{t("editor.approvalTitle")}</h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {t("editor.approvalHint")}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fe-levels">{t("editor.levelCountLabel")}</Label>
                <Select
                  id="fe-levels"
                  value={levelCount}
                  onChange={(e) => setLevelCount(Number(e.target.value))}
                >
                  <option value={0}>{t("editor.levels0")}</option>
                  <option value={1}>{t("editor.levels1")}</option>
                  <option value={2}>{t("editor.levels2")}</option>
                </Select>
              </div>
              {levels.map((lv, i) => (
                <div key={i} className="space-y-1.5">
                  <Label htmlFor={`fe-lv-${i}`}>
                    {levelCount === 1
                      ? t("editor.approverSingle")
                      : t("editor.approverAtLevel", { n: i + 1 })}
                  </Label>
                  <Select
                    id={`fe-lv-${i}`}
                    value={lv.to}
                    onChange={(e) =>
                      setLevels((prev) =>
                        prev.map((x, n) => (n === i ? { to: e.target.value } : x)),
                      )
                    }
                  >
                    <option value="role:owner">{t("editor.approverOwner")}</option>
                    <option value="role:admin">{t("editor.approverAdmin")}</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </section>

            {/* ---- Nút hành động ---- */}
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => save()} disabled={!canSave}>
                {t("editor.save")}
              </Button>
              {status === "published" ? (
                <Button variant="outline" onClick={unpublish} disabled={pending}>
                  {t("editor.unpublish")}
                </Button>
              ) : (
                <Button variant="outline" onClick={publish} disabled={!canSave}>
                  {t("editor.publish")}
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={remove}
                disabled={pending}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
                {t("editor.delete")}
              </Button>
            </div>
            <p className="text-[13px] text-muted-foreground">
              {status === "published" ? t("editor.publishedHint") : t("editor.draftHint")}
            </p>
          </div>

          {/* ---- Xem thử ---- */}
          <aside className="min-w-0 space-y-3 self-start rounded-lg border bg-muted/30 p-4">
            <div>
              <h2 className="text-[13px] font-semibold">{t("editor.previewTitle")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("editor.previewHint")}
              </p>
            </div>
            <div className="space-y-3 rounded-lg border bg-background p-3">
              <p className="text-[13px] font-semibold">{name || t("editor.untitled")}</p>
              {description && (
                <p className="text-[13px] text-muted-foreground">{description}</p>
              )}
              {validPreviewFields.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">{t("editor.previewEmpty")}</p>
              ) : (
                validPreviewFields.map((f) => (
                  <FieldInput
                    key={f.key}
                    field={f}
                    idPrefix="pv"
                    value={preview[f.key]}
                    onChange={(v) => setPreview((p) => ({ ...p, [f.key]: v }))}
                  />
                ))
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

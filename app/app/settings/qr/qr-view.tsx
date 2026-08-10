"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
// uqr: sinh mã QR ngay trong máy, 0 phụ thuộc, KHÔNG gọi dịch vụ tạo QR bên ngoài.
import { encode as encodeQr } from "uqr";
import { Download, Pencil, Plus, Power, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { createLeadSource, deleteQrCode, saveQrCode, setQrCodeActive } from "./actions";

export type QrCodeRow = {
  id: string;
  code: string;
  name: string;
  source_id: string;
  source_name: string;
  target_url: string;
  is_active: boolean;
  scans_total: number;
  scans_7d: number;
  last_scan_at: string | null;
  created_at: string;
};

export type LeadSourceOption = { id: string; name: string };

const TOAST_KEYS = new Set([
  "name_taken",
  "forbidden",
  "bad_url",
  "invalid_input",
  "not_authenticated",
]);

/** Vẽ mã QR bằng canvas — sinh tại chỗ, không gọi dịch vụ ngoài. */
const QUIET_ZONE = 4; // số ô trắng viền quanh, theo chuẩn QR
const EXPORT_PX = 1024; // ảnh tải về đủ nét để in

function drawQr(canvas: HTMLCanvasElement, value: string, sizePx: number) {
  // ecc 'M': mã in ra vẫn quét được khi bị bẩn/mờ ~15%.
  const qr = encodeQr(value, { ecc: "M", border: QUIET_ZONE });
  const cell = Math.max(1, Math.floor(sizePx / qr.size));
  const full = cell * qr.size;
  canvas.width = full;
  canvas.height = full;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  // Mã QR phải đen trên nền trắng để máy quét đọc được — không theo màu giao diện.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, full, full);
  ctx.fillStyle = "#000000";
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (qr.data[row][col]) ctx.fillRect(col * cell, row * cell, cell, cell);
    }
  }
}

function QrImage({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawQr(ref.current, value, 320);
  }, [value]);
  return <canvas ref={ref} className={className} aria-hidden />;
}

/** Tải ảnh PNG về máy để mang đi in. */
function downloadQr(value: string, fileName: string) {
  const canvas = document.createElement("canvas");
  drawQr(canvas, value, EXPORT_PX);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${fileName}.png`;
  a.click();
}

type FormValues = { id: string | null; name: string; sourceId: string; targetUrl: string };

function QrForm({
  initial,
  sources,
  onSourceCreated,
  onDone,
}: {
  initial: FormValues;
  sources: LeadSourceOption[];
  onSourceCreated: (source: LeadSourceOption) => void;
  onDone: () => void;
}) {
  const t = useTranslations("settings.qr");
  const tCommon = useTranslations("common");
  const [values, setValues] = useState<FormValues>(initial);
  const [pending, startTransition] = useTransition();
  // Nguồn khách mặc định chỉ có Zalo/Facebook/Giới thiệu/Khác — mã dán ở quầy
  // hay tờ rơi không có ô nào đúng. Cho đặt tên nguồn ngay tại đây.
  const [newSource, setNewSource] = useState<string | null>(null);

  const addSource = () => {
    const name = (newSource ?? "").trim();
    if (pending || name === "") return;
    startTransition(async () => {
      const res = await createLeadSource(name);
      if (res.error || !res.source) {
        toast.error(t(`toasts.${TOAST_KEYS.has(res.error ?? "") ? res.error : "failed"}`));
        return;
      }
      onSourceCreated(res.source);
      setValues((v) => ({ ...v, sourceId: res.source!.id }));
      setNewSource(null);
      toast.success(t("toasts.sourceAdded"));
    });
  };

  const submit = () => {
    if (pending) return;
    startTransition(async () => {
      const res = await saveQrCode(values);
      if (res.error) {
        toast.error(t(`toasts.${TOAST_KEYS.has(res.error) ? res.error : "failed"}`));
        return;
      }
      toast.success(t("toasts.saved"));
      onDone();
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="qrc-name">{t("form.nameLabel")}</Label>
        <Input
          id="qrc-name"
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          placeholder={t("form.namePlaceholder")}
          maxLength={80}
          required
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="qrc-source">{t("form.sourceLabel")}</Label>
        <Select
          id="qrc-source"
          value={values.sourceId}
          onChange={(e) => setValues((v) => ({ ...v, sourceId: e.target.value }))}
          required
        >
          <option value="">{t("form.sourcePlaceholder")}</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        {newSource === null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setNewSource("")}
          >
            <Plus className="size-3.5" />
            {t("form.newSource")}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Input
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSource();
                }
              }}
              placeholder={t("form.newSourcePlaceholder")}
              maxLength={80}
              aria-label={t("form.newSource")}
              autoFocus
            />
            <Button
              type="button"
              size="sm"
              disabled={pending || newSource.trim() === ""}
              onClick={addSource}
            >
              {tCommon("save")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setNewSource(null)}
            >
              {tCommon("cancel")}
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t("form.sourceHint")}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="qrc-target">{t("form.targetLabel")}</Label>
        <Input
          id="qrc-target"
          type="url"
          inputMode="url"
          value={values.targetUrl}
          onChange={(e) => setValues((v) => ({ ...v, targetUrl: e.target.value }))}
          placeholder="https://zalo.me/..."
          maxLength={2000}
          required
        />
        <p className="text-xs text-muted-foreground">{t("form.targetHint")}</p>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          {tCommon("cancel")}
        </Button>
        <Button
          type="submit"
          disabled={pending || !values.name.trim() || !values.sourceId || !values.targetUrl.trim()}
        >
          {tCommon("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function QrView({
  canManage,
  baseUrl,
  codes,
  sources,
}: {
  canManage: boolean;
  baseUrl: string;
  codes: QrCodeRow[];
  sources: LeadSourceOption[];
}) {
  const t = useTranslations("settings.qr");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const [editing, setEditing] = useState<FormValues | null>(null);
  const [deleting, setDeleting] = useState<QrCodeRow | null>(null);
  const [pending, startTransition] = useTransition();
  // Nguồn vừa tạo trong hộp thoại — hiện ngay, không đợi trang tải lại
  const [addedSources, setAddedSources] = useState<LeadSourceOption[]>([]);
  const allSources = [...sources, ...addedSources];

  const publicUrl = (code: string) => `${baseUrl}/q/${code}`;

  const toggle = (row: QrCodeRow) => {
    if (pending) return;
    startTransition(async () => {
      const res = await setQrCodeActive(row.id, !row.is_active);
      if (res.error) {
        toast.error(t(`toasts.${TOAST_KEYS.has(res.error) ? res.error : "failed"}`));
        return;
      }
      toast.success(t(row.is_active ? "toasts.turnedOff" : "toasts.turnedOn"));
    });
  };

  const remove = () => {
    if (!deleting || pending) return;
    startTransition(async () => {
      const res = await deleteQrCode(deleting.id);
      if (res.error) {
        toast.error(t(`toasts.${TOAST_KEYS.has(res.error) ? res.error : "failed"}`));
        return;
      }
      toast.success(t("toasts.deleted"));
      setDeleting(null);
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
        {/* <sm: nút xuống hàng riêng cho đỡ chật; ≥sm: nằm bên phải tiêu đề */}
        <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {canManage ? t("description") : t("readOnlyHint")}
            </p>
          </div>
          {canManage && (
            <Button
              className="shrink-0"
              onClick={() =>
                setEditing({ id: null, name: "", sourceId: allSources[0]?.id ?? "", targetUrl: "" })
              }
            >
              <Plus className="size-4" />
              {t("add")}
            </Button>
          )}
        </div>

        {codes.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-[13px] text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <ul className="space-y-3">
            {codes.map((row) => (
              <li key={row.id} className="rounded-lg border p-3">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="shrink-0 self-center rounded-md bg-white p-2 sm:self-start">
                    <QrImage value={publicUrl(row.code)} className="size-24" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold break-words">{row.name}</p>
                      <Badge variant="secondary">{row.source_name}</Badge>
                      {!row.is_active && <Badge variant="outline">{t("inactive")}</Badge>}
                    </div>
                    <p className="text-[13px] break-all text-muted-foreground">
                      {publicUrl(row.code)}
                    </p>
                    <p className="text-[13px] break-all text-muted-foreground">
                      {t("goesTo")} {row.target_url}
                    </p>
                    <p className="text-[13px]">
                      <span className="font-medium">
                        {t("scansTotal", { count: Number(row.scans_total) })}
                      </span>
                      <span className="text-muted-foreground">
                        {" · "}
                        {t("scans7d", { count: Number(row.scans_7d) })}
                        {row.last_scan_at
                          ? ` · ${t("lastScan", {
                              at: formatDateTime(row.last_scan_at, locale),
                            })}`
                          : ` · ${t("neverScanned")}`}
                      </span>
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadQr(publicUrl(row.code), row.code)}
                      >
                        <Download className="size-4" />
                        {t("download")}
                      </Button>
                      {/* Nối chéo: mã gắn nguồn nào thì mở thẳng danh sách khách
                          của nguồn đó (?source= trên URL màn Khách hàng). */}
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/app/contacts?source=${row.source_id}`}>
                          <Users className="size-4" />
                          {t("viewContacts")}
                        </Link>
                      </Button>
                      {canManage && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              setEditing({
                                id: row.id,
                                name: row.name,
                                sourceId: row.source_id,
                                targetUrl: row.target_url,
                              })
                            }
                          >
                            <Pencil className="size-4" />
                            {t("edit")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() => toggle(row)}
                          >
                            <Power className="size-4" />
                            {row.is_active ? t("turnOff") : t("turnOn")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => setDeleting(row)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                            {t("delete.button")}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Dialog
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        >
          <DialogContent className="max-h-[85svh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing?.id ? t("form.editTitle") : t("form.addTitle")}</DialogTitle>
              <DialogDescription>{t("form.description")}</DialogDescription>
            </DialogHeader>
            {editing && (
              <QrForm
                initial={editing}
                sources={allSources}
                onSourceCreated={(s) => setAddedSources((prev) => [...prev, s])}
                onDone={() => setEditing(null)}
              />
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={deleting !== null}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("delete.title")}</DialogTitle>
              <DialogDescription>
                {t("delete.body", { name: deleting?.name ?? "" })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleting(null)} disabled={pending}>
                {tCommon("cancel")}
              </Button>
              <Button variant="destructive" onClick={remove} disabled={pending}>
                {t("delete.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

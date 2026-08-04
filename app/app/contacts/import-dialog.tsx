"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  downloadImportTemplate,
  previewContactsImport,
  runContactsImport,
  type ImportPreview,
} from "./import-export-actions";
import {
  EMPTY_MAPPING,
  IMPORT_FIELDS,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  type ColumnMapping,
  type ImportField,
} from "./types";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Tải file do server sinh (base64) về máy — server action không đặt được Content-Disposition. */
export function downloadBase64File(base64: string, fileName: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** File → base64 theo cụm: spread cả mảng 2MB vào String.fromCharCode sẽ tràn stack. */
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

type Step = "upload" | "mapping" | "preview";

function ImportFlow({
  onDone,
  onSuccess,
}: {
  onDone: () => void;
  onSuccess: () => void;
}) {
  const t = useTranslations("contacts.importExport");
  const tCommon = useTranslations("common");
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<{ base64: string; name: string } | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pending, startTransition] = useTransition();

  const pickFile = (picked: File | undefined) => {
    if (!picked) return;
    if (!/\.(xlsx|csv)$/i.test(picked.name)) {
      toast.error(t("errors.unsupportedFile"));
      return;
    }
    if (picked.size > IMPORT_MAX_FILE_BYTES) {
      toast.error(t("errors.fileTooLarge"));
      return;
    }
    startTransition(async () => {
      const base64 = await fileToBase64(picked);
      const res = await previewContactsImport({
        fileBase64: base64,
        fileName: picked.name,
        mapping: null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setFile({ base64, name: picked.name });
      setHeaders(res.headers ?? []);
      setMapping(res.mapping ?? EMPTY_MAPPING);
      setPreview(res);
      setStep("mapping");
    });
  };

  const runPreview = () => {
    if (!file) return;
    startTransition(async () => {
      const res = await previewContactsImport({
        fileBase64: file.base64,
        fileName: file.name,
        mapping,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setPreview(res);
      setStep("preview");
    });
  };

  const confirmImport = () => {
    if (!file) return;
    startTransition(async () => {
      const res = await runContactsImport({
        fileBase64: file.base64,
        fileName: file.name,
        mapping,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        t("toastDone", {
          created: res.created ?? 0,
          skipped: res.skipped ?? 0,
          failed: res.failed ?? 0,
        }),
      );
      onDone();
      onSuccess();
    });
  };

  const downloadTemplate = () => {
    startTransition(async () => {
      const res = await downloadImportTemplate();
      if (res.error || !res.fileBase64 || !res.fileName) {
        toast.error(res.error ?? t("errors.exportFailed"));
        return;
      }
      downloadBase64File(res.fileBase64, res.fileName);
    });
  };

  if (step === "upload") {
    return (
      <div className="space-y-4">
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.csv"
          className="sr-only"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => fileInput.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors hover:bg-muted/50 disabled:opacity-60"
        >
          <FileSpreadsheet className="size-8 text-muted-foreground" />
          <span className="text-sm font-medium">
            {pending ? tCommon("loading") : t("pickFile")}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("uploadHint", { max: IMPORT_MAX_ROWS })}
          </span>
        </button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={pending}
          onClick={downloadTemplate}
        >
          <Download className="size-4" />
          {t("template")}
        </Button>
      </div>
    );
  }

  if (step === "mapping") {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {t("mappingHint", { rows: preview?.totalRows ?? 0 })}
        </p>
        <div className="max-h-72 space-y-3 overflow-y-auto">
          {IMPORT_FIELDS.map((field) => (
            <div key={field} className="space-y-1.5">
              <label htmlFor={`map-${field}`} className="text-[13px] font-medium">
                {t(`fields.${field}`)}
                {field === "fullName" && (
                  <span className="text-destructive"> *</span>
                )}
              </label>
              <select
                id={`map-${field}`}
                value={mapping[field]}
                onChange={(e) =>
                  setMapping((m) => ({
                    ...m,
                    [field as ImportField]: Number(e.target.value),
                  }))
                }
                className={SELECT_CLASS}
              >
                <option value={-1}>{t("columnNone")}</option>
                {headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header || t("columnFallback", { index: index + 1 })}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setStep("upload")}>
            {tCommon("back")}
          </Button>
          <Button
            type="button"
            disabled={pending || mapping.fullName === -1}
            onClick={runPreview}
          >
            {pending ? tCommon("loading") : t("checkFile")}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  const problems = preview?.problems ?? [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border p-3 text-center">
          <div className="text-lg font-semibold">{preview?.toCreate ?? 0}</div>
          <div className="text-xs text-muted-foreground">{t("statCreate")}</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-lg font-semibold">{preview?.duplicates ?? 0}</div>
          <div className="text-xs text-muted-foreground">{t("statDuplicate")}</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-lg font-semibold text-destructive">
            {preview?.failed ?? 0}
          </div>
          <div className="text-xs text-muted-foreground">{t("statFailed")}</div>
        </div>
      </div>

      {problems.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium">{t("problemsTitle")}</p>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2 text-xs">
            {problems.map((p) => (
              <li key={p.rowNumber} className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground">
                  {t("problemRow", { row: p.rowNumber })}
                </span>
                <span className="min-w-0 truncate font-medium">{p.label}</span>
                <span className="text-destructive">{t(`reason.${p.reason}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => setStep("mapping")}>
          {tCommon("back")}
        </Button>
        <Button
          type="button"
          disabled={pending || (preview?.toCreate ?? 0) === 0}
          onClick={confirmImport}
        >
          {pending
            ? tCommon("loading")
            : t("confirmImport", { count: preview?.toCreate ?? 0 })}
        </Button>
      </DialogFooter>
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

/** Wizard nhập khách từ Excel/CSV: tải file → chọn cột → chạy thử → xác nhận. */
export function ImportDialog({ open, onOpenChange, onSuccess }: Props) {
  const t = useTranslations("contacts.importExport");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-4" />
            {t("importTitle")}
          </DialogTitle>
          <DialogDescription>{t("importDescription")}</DialogDescription>
        </DialogHeader>
        {/* Nội dung unmount khi đóng → state wizard tự reset */}
        <ImportFlow onDone={() => onOpenChange(false)} onSuccess={onSuccess} />
      </DialogContent>
    </Dialog>
  );
}

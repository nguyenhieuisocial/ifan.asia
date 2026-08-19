"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Search } from "lucide-react";
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
import { createClient } from "@/lib/supabase/client";
import { createDeal, updateDeal } from "./actions";
import { searchContactOptions } from "./queries";
import type { ContactOption, MemberOption, PipelineStage } from "./types";

export type DealFormValues = {
  title: string;
  contactId: string;
  /** Tên khách để HIỆN SẴN lúc mở sửa. Thiếu nó thì ô khách rơi xuống ô tìm
   *  kiếm với danh sách bung sẵn — mời người dùng bấm nhầm sang khách khác.
   *  KHÔNG bắt buộc: luồng TẠO MỚI chưa có khách nào để mà đặt tên. */
  contactName?: string;
  /** Nhập tay dạng chuỗi số để ô trống không nhảy về 0. */
  value: string;
  expectedCloseDate: string;
  stageId: string;
  ownerId: string;
  nextActionDate: string;
  nextActionNote: string;
};

/** Ngày mai theo giờ VN (UTC+7 cố định) — mặc định hạn việc kế tiếp. */
export function tomorrowVN(): string {
  const vn = new Date(Date.now() + 7 * 3_600_000 + 86_400_000);
  return vn.toISOString().slice(0, 10);
}

/** Chỉ giữ chữ số — ô tiền nhập tay, hiển thị nhóm nghìn khi blur là đợt sau. */
function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 12);
}

/** Ô chọn khách có tìm kiếm không dấu (debounce 300ms như màn Khách hàng). */
function ContactPicker({
  value,
  lockedName,
  initialName,
  onChange,
}: {
  value: string;
  lockedName?: string;
  /** Tên khách ĐANG gắn (lúc sửa). Xem chú thích ở `selectedName` bên dưới. */
  initialName?: string;
  onChange: (id: string, name: string) => void;
}) {
  const t = useTranslations("deals.form");
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  // ⚠️ PHẢI mồi bằng `initialName` khi mở SỬA. Ô này chỉ hiện tên khi CẢ `value`
  // LẪN `selectedName` cùng có; lúc sửa thì `value` có (mã khách) còn tên thì
  // rỗng ⇒ rơi xuống ô tìm kiếm với danh sách khách BUNG SẴN, trông như ô bắt
  // buộc bị bỏ trống. Nút Lưu vẫn chặn được (`contactId !== ""`) nên không mất
  // liên kết — nguy hiểm thật là danh sách mở sẵn MỜI người dùng bấm, và bấm
  // nhầm là cơ hội đổi sang khách khác. Đo trên bản thật 19/08: 4/4 cơ hội đều
  // hiện trống.
  const [selectedName, setSelectedName] = useState(lockedName ?? initialName ?? "");

  // Debounce 300ms: gõ xong mới query (như màn Khách hàng)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  const optionsQuery = useQuery({
    queryKey: ["deal-contact-options", debouncedQ],
    queryFn: () => searchContactOptions(supabase, debouncedQ),
    enabled: !lockedName,
  });
  const options: ContactOption[] = optionsQuery.data ?? [];
  const loading = optionsQuery.isPending;

  if (lockedName) {
    return (
      <p className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm">
        {lockedName}
      </p>
    );
  }

  if (value && selectedName) {
    return (
      <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input px-3 text-sm max-md:h-11">
        <span className="truncate">{selectedName}</span>
        {/* Chữ "Đổi" là NÚT — cao bằng cả ô để ngón tay với tới (44px). */}
        <button
          type="button"
          className="shrink-0 text-xs font-medium text-primary hover:underline max-md:flex max-md:h-11 max-md:items-center"
          onClick={() => {
            setSelectedName("");
            onChange("", "");
          }}
        >
          {t("contactChange")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("contactSearchPlaceholder")}
          className="pl-8"
          autoFocus
        />
      </div>
      <ul className="max-h-40 divide-y overflow-y-auto rounded-md border">
        {/* Nhánh isError phải đứng TRƯỚC nhánh rỗng: hàm tìm ném lỗi → data
            undefined → options rỗng → nếu không tách thì hiện y hệt câu "không
            tìm thấy", người dùng tưởng tiệm chưa có khách đó. Cùng lớp lỗi im
            lặng với việc #166. */}
        {loading && options.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">{t("contactLoading")}</li>
        ) : optionsQuery.isError ? (
          <li className="px-3 py-2 text-xs text-destructive">{t("contactSearchFailed")}</li>
        ) : options.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">{t("contactEmpty")}</li>
        ) : (
          options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedName(o.full_name);
                  onChange(o.id, o.full_name);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 max-md:min-h-11"
              >
                <span className="truncate">{o.full_name}</span>
                {o.phone && (
                  <span className="shrink-0 text-xs text-muted-foreground">{o.phone}</span>
                )}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

type FormProps = {
  mode: "create" | "edit";
  dealId?: string;
  initialValues: DealFormValues;
  /** Chỉ các cột MỞ — Thắng/Thua đi qua luồng riêng (chốt giá trị / lý do thua). */
  openStages: PipelineStage[];
  members: MemberOption[];
  canAssignOthers: boolean;
  /** Khóa khách khi tạo từ hồ sơ 360. */
  lockedContactName?: string;
  /** Cơ hội đã thắng/thua: không cho đổi cột trong form. */
  stageLocked?: boolean;
  onDone: () => void;
  onSuccess?: () => void;
};

function DealForm({
  mode,
  dealId,
  initialValues,
  openStages,
  members,
  canAssignOthers,
  lockedContactName,
  stageLocked,
  onDone,
  onSuccess,
}: FormProps) {
  const t = useTranslations("deals.form");
  const tToasts = useTranslations("deals.toasts");
  const tCommon = useTranslations("common");
  const [values, setValues] = useState<DealFormValues>(initialValues);
  const [pending, startTransition] = useTransition();

  const set = (patch: Partial<DealFormValues>) =>
    setValues((v) => ({ ...v, ...patch }));

  const valid =
    values.title.trim() !== "" &&
    values.contactId !== "" &&
    values.stageId !== "" &&
    values.nextActionDate !== "";

  const submit = () => {
    if (pending || !valid) return;
    const payload = {
      title: values.title.trim(),
      contactId: values.contactId,
      valueVnd: Number(values.value || "0"),
      expectedCloseDate: values.expectedCloseDate || null,
      stageId: values.stageId,
      ownerId: values.ownerId,
      nextActionDate: values.nextActionDate,
      nextActionNote: values.nextActionNote.trim() || null,
    };
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createDeal(payload)
          : await updateDeal(dealId as string, payload);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(mode === "create" ? tToasts("created") : tToasts("updated"));
      onDone();
      onSuccess?.();
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
        <Label htmlFor="df-title">
          {t("titleLabel")} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="df-title"
          value={values.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder={t("titlePlaceholder")}
          required
          autoFocus={!!lockedContactName || mode === "edit"}
        />
      </div>

      <div className="space-y-1.5">
        <span className="block text-[13px] font-medium">
          {t("contactLabel")} <span className="text-destructive">*</span>
        </span>
        <ContactPicker
          initialName={values.contactName}
          value={values.contactId}
          lockedName={lockedContactName}
          onChange={(id) => set({ contactId: id })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="df-value">{t("valueLabel")}</Label>
          <Input
            id="df-value"
            value={values.value}
            onChange={(e) => set({ value: digitsOnly(e.target.value) })}
            placeholder={t("valuePlaceholder")}
            inputMode="numeric"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="df-close">{t("expectedCloseLabel")}</Label>
          <Input
            id="df-close"
            type="date"
            value={values.expectedCloseDate}
            onChange={(e) => set({ expectedCloseDate: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="df-stage">{t("stageLabel")}</Label>
          {/* Cơ hội ĐÃ CHỐT: KHÔNG render ô chọn. `disabled` là chưa đủ — ô vẫn
              phải hiện MỘT giá trị, mà bước đã chốt không nằm trong `openStages`
              nên nó rơi về mục đầu ("Mới"). Người dùng đọc ra một bước SAI, và
              trước bản vá này `editValues` còn gửi đúng cái id sai đó đi ⇒ bấm
              Lưu là cơ hội đã chốt bị kéo ngược về "Mới", rớt khỏi cột Đã chốt,
              doanh thu đã chốt hụt đi. Đo trên bản thật 19/08: 2/2 cơ hội đã
              chốt đều hiện "Mới". */}
          {stageLocked ? (
            <p className="text-xs text-muted-foreground">{t("stageLockedHint")}</p>
          ) : (
            <Select
              id="df-stage"
              value={values.stageId}
              onChange={(e) => set({ stageId: e.target.value })}
            >
              {openStages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="df-owner">{t("ownerLabel")}</Label>
          <Select
            id="df-owner"
            value={values.ownerId}
            disabled={!canAssignOthers}
            onChange={(e) => set({ ownerId: e.target.value })}
          >
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="df-next-date">
            {t("nextActionDateLabel")} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="df-next-date"
            type="date"
            value={values.nextActionDate}
            onChange={(e) => set({ nextActionDate: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="df-next-note">{t("nextActionNoteLabel")}</Label>
          <Input
            id="df-next-note"
            value={values.nextActionNote}
            onChange={(e) => set({ nextActionNote: e.target.value })}
            placeholder={t("nextActionNotePlaceholder")}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("nextActionHint")}</p>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={pending || !valid}>
          {tCommon("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

type Props = Omit<FormProps, "onDone"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Dialog Tạo / Sửa cơ hội — thân form unmount khi đóng nên state tự reset. */
export function DealFormDialog({ open, onOpenChange, ...formProps }: Props) {
  const t = useTranslations("deals.form");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {formProps.mode === "create" ? t("createTitle") : t("editTitle")}
          </DialogTitle>
          <DialogDescription>
            {formProps.mode === "create"
              ? t("createDescription")
              : t("editDescription")}
          </DialogDescription>
        </DialogHeader>
        <DealForm {...formProps} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

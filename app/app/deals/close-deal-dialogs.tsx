"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LostReason } from "./types";

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 12);
}

/** Ngày mặc định hẹn chăm lại sau khi thắng: +7 ngày theo giờ VN (khớp playbook). */
function plus7DaysVN(): string {
  const vn = new Date(Date.now() + 7 * 3_600_000 + 7 * 86_400_000);
  return vn.toISOString().slice(0, 10);
}

/** Thả vào cột Thắng → xác nhận giá trị cuối rồi mới chốt (spec CRM §4.4). */
export function WinDealDialog({
  open,
  dealTitle,
  initialValue,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  dealTitle: string;
  initialValue: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (valueVnd: number) => void;
}) {
  const t = useTranslations("deals.win");
  const tCommon = useTranslations("common");
  const [value, setValue] = useState(String(initialValue));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { deal: dealTitle })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="win-value">{t("valueLabel")}</Label>
          <Input
            id="win-value"
            value={value}
            onChange={(e) => setValue(digitsOnly(e.target.value))}
            inputMode="numeric"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={() => onConfirm(Number(value || "0"))} disabled={pending}>
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Bước 2 sau khi chốt thắng (B11): "Hẹn chăm lại ngày nào?" — đặt một việc
 * hỏi thăm khách, mặc định +7 ngày, có nút Bỏ qua.
 *
 * CHỐNG TRÙNG với playbook "Hỏi thăm sau khi chốt" (migration #50): bước này
 * CHỈ được mở khi playbook đó đang TẮT (cha đã gác bằng winFollowupManual).
 * Playbook đang bật thì engine tự tạo việc sau 7 ngày — mở thêm bước này sẽ
 * ra hai việc trùng nhau trên cùng một khách.
 */
export function WinFollowupDialog({
  open,
  dealTitle,
  pending,
  onSkip,
  onConfirm,
}: {
  open: boolean;
  dealTitle: string;
  pending: boolean;
  onSkip: () => void;
  onConfirm: (dueDate: string) => void;
}) {
  const t = useTranslations("deals.winFollowup");
  const [date, setDate] = useState(plus7DaysVN);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onSkip()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { deal: dealTitle })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="followup-date">{t("dateLabel")}</Label>
          <Input
            id="followup-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onSkip} disabled={pending}>
            {t("skip")}
          </Button>
          <Button onClick={() => onConfirm(date)} disabled={pending || date === ""}>
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Thả vào cột Thua → BẮT BUỘC chọn lý do thua mới lưu được
 * (spec CRM §8 tiêu chí 8: thả vào Thua không chọn lý do → không cho lưu).
 */
export function LoseDealDialog({
  open,
  dealTitle,
  lostReasons,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  dealTitle: string;
  lostReasons: LostReason[];
  pending: boolean;
  onCancel: () => void;
  onConfirm: (lostReasonId: string, note: string) => void;
}) {
  const t = useTranslations("deals.lose");
  const tCommon = useTranslations("common");
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { deal: dealTitle })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lose-reason">
              {t("reasonLabel")} <span className="text-destructive">*</span>
            </Label>
            <Select
              id="lose-reason"
              value={reasonId}
              onChange={(e) => setReasonId(e.target.value)}
              autoFocus
            >
              <option value="">{t("reasonPlaceholder")}</option>
              {lostReasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
            {lostReasons.length === 0 && (
              <p className="text-xs text-destructive">{t("noReasons")}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lose-note">{t("noteLabel")}</Label>
            <Textarea
              id="lose-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={t("notePlaceholder")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {tCommon("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reasonId, note.trim())}
            disabled={pending || reasonId === ""}
          >
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

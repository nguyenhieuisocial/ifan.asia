"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/lib/format";
import { timSuKien, type PhepSo, type TruongDieuKien } from "./catalog";

/**
 * Bộ ĐỌC-THÀNH-CÂU dùng chung cho cả thẻ quy trình và ô "xem trước" của trình
 * dựng. Một chỗ duy nhất, cố ý: nếu trình dựng tự viết câu riêng thì câu người
 * ta đọc TRƯỚC khi lưu và câu hiện ra SAU khi lưu có thể khác nhau — mà cả hai
 * đều đang mô tả cùng một quy trình. Người dùng không có cách nào biết bên nào
 * đúng.
 *
 * Luật của thẻ thiết kế `man-tu-dong.html`: không câu nào ở đây được để lọt tên
 * sự kiện (`order.created`), đường dẫn trường (`aggregate.value_vnd`), mã hạng
 * (`vip`) hay uuid ra màn hình.
 */

export type NguoiTrongTiem = { userId: string; name: string };
export type CotCoHoi = { id: string; name: string };

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

/** Phép so suy ngược từ hình dạng jsonb đã lưu (migration #163). */
function docPhepSo(value: unknown): { op: PhepSo; raw: unknown } {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    if ("exists" in o) return { op: o.exists === false ? "notExists" : "exists", raw: null };
    for (const op of ["neq", "gt", "gte", "lt", "lte", "in", "contains"] as const) {
      if (op in o) return { op, raw: o[op] };
    }
  }
  return { op: "eq", raw: value };
}

export function useWorkflowLabels(members: NguoiTrongTiem[], stages: CotCoHoi[]) {
  const t = useTranslations("settings.workflows");
  const locale = useLocale() as Locale;

  const tenNguoi = (id: string) =>
    members.find((m) => m.userId === id)?.name ?? t("assignee.specific");
  const tenCot = (id: string) => stages.find((s) => s.id === id)?.name ?? t("stage.unknown");

  const triggerLabel = (event: string) => {
    const s = timSuKien(event);
    // Quy trình cũ trỏ vào sự kiện đã rút khỏi danh mục vẫn phải đọc được thành
    // câu — hiện `event_type` thô ra là đúng thứ thẻ thiết kế cấm.
    return s ? t(`triggers.${s.nhan}`) : t("triggers.other");
  };

  const runStatusLabel = (status: string) =>
    ["pending", "running", "waiting", "done", "failed", "dead", "rejected"].includes(status)
      ? t(`runStatus.${status}`)
      : t("runStatus.other");

  /** "2 hours" / "3 days" → câu tiếng Việt tự nhiên; không khớp thì đọc nguyên văn. */
  const dueLabel = (raw: string | null) => {
    if (!raw) return t("due.now");
    const m = /^(\d+)\s*(minute|hour|day)s?$/.exec(raw.trim());
    if (!m) return t("due.raw", { raw });
    const n = Number(m[1]);
    if (n === 0) return t("due.now");
    return t(`due.${m[2]}s`, { n });
  };

  const assigneeLabel = (spec: string | null) => {
    if (!spec || spec === "owner") return t("assignee.owner");
    return tenNguoi(spec);
  };

  const approverLabel = (levels: unknown) => {
    const first = Array.isArray(levels) ? (levels[0] as Record<string, unknown> | undefined) : undefined;
    const spec = str(first?.to) ?? "role:owner";
    const role = spec.startsWith("role:") ? spec.slice(5) : "";
    return ["owner", "admin", "manager"].includes(role)
      ? t(`approver.${role}`)
      : t("approver.other");
  };

  const fieldLabel = (truong: TruongDieuKien | undefined) =>
    truong ? t(`fields.${truong.nhan}`) : t("fields.other");

  /** Giá trị thô → chữ người đọc được, theo KIỂU của trường. */
  const valueLabel = (truong: TruongDieuKien | undefined, raw: unknown): string => {
    if (Array.isArray(raw)) {
      return raw.map((v) => valueLabel(truong, v)).join(", ");
    }
    const s = raw === null || raw === undefined ? "" : String(raw);
    if (!truong) return s;
    if (truong.kieu === "number") {
      const n = Number(s);
      if (!Number.isFinite(n)) return s;
      return truong.tien ? formatMoney(n, locale) : new Intl.NumberFormat(locale).format(n);
    }
    if (truong.kieu === "choice" && truong.nhomChon) {
      return (truong.chon ?? []).includes(s) ? t(`choices.${truong.nhomChon}.${s}`) : s;
    }
    if (truong.kieu === "member") return tenNguoi(s);
    if (truong.kieu === "stage") return tenCot(s);
    return s;
  };

  const opLabel = (op: PhepSo) => t(`ops.${op}`);

  /** Một dòng "chỉ chạy khi" → một câu. */
  const conditionLine = (event: string, path: string, value: unknown) => {
    const truong = timSuKien(event)?.truong.find((f) => f.path === path);
    const { op, raw } = docPhepSo(value);
    const field = fieldLabel(truong);
    if (op === "exists" || op === "notExists") {
      return t("conditionRow.lineNoValue", { field, op: opLabel(op) });
    }
    return t("conditionRow.line", {
      field,
      op: opLabel(op),
      value: valueLabel(truong, raw),
    });
  };

  const conditionLabels = (event: string, conditions: Record<string, unknown>) =>
    Object.entries(conditions ?? {}).map(([path, value]) => conditionLine(event, path, value));

  /** Một hành động jsonb → một câu người thường đọc được. */
  const actionLabel = (action: Record<string, unknown>) => {
    const type = str(action.type);
    if (type === "create_task") {
      return t("actions.createTask", {
        subject: str(action.subject) ?? "",
        due: dueLabel(str(action.due_in)),
        assignee: assigneeLabel(str(action.assign_to)),
      });
    }
    if (type === "notify") {
      return t("actions.notify", {
        assignee: assigneeLabel(str(action.to)),
        title: str(action.title) ?? "",
      });
    }
    if (type === "set_tier") {
      // Không dựng mới được (xem đầu `catalog.ts`) nhưng playbook cũ có thể còn
      // dùng — vẫn phải đọc ra được thành câu.
      const tier = str(action.tier);
      return t("actions.setTier", {
        tier:
          tier && ["new", "regular", "vip", "dormant"].includes(tier)
            ? t(`choices.tier.${tier}`)
            : (tier ?? ""),
      });
    }
    if (type === "assign_owner") {
      return t("actions.assignOwner", { assignee: assigneeLabel(str(action.to)) });
    }
    if (type === "approval") {
      const levels = Array.isArray(action.levels) ? action.levels.length : 1;
      return levels > 1
        ? t("actions.approvalLevels", { levels })
        : t("actions.approval", { approver: approverLabel(action.levels) });
    }
    return t("actions.other");
  };

  return {
    triggerLabel,
    runStatusLabel,
    dueLabel,
    assigneeLabel,
    fieldLabel,
    valueLabel,
    opLabel,
    conditionLabels,
    actionLabel,
  };
}

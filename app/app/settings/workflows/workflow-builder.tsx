"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  MOC_HAN,
  SU_KIEN,
  TRAN_DIEU_KIEN,
  TRAN_HANH_DONG,
  VAI_DUYET,
  dungDieuKien,
  dungHanhDong,
  hanhDongChoGoc,
  phepSoChoKieu,
  timSuKien,
  type DongDieuKien,
  type DongHanhDong,
  type LoaiHanhDong,
  type MocHan,
  type PhepSo,
  type VaiDuyet,
} from "./catalog";
import { taoQuyTrinh, suaQuyTrinh } from "./actions";
import { useWorkflowLabels, type CotCoHoi, type NguoiTrongTiem } from "./workflow-labels";

type DongDK = DongDieuKien & { rid: string };
type DongHD = DongHanhDong & { rid: string };

/** Quy trình đang có trong CSDL, ở dạng trình dựng đọc lại được. */
export type QuyTrinhDangSua = {
  id: string;
  name: string;
  description: string | null;
  triggerEvent: string;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>[];
};

const rid = () => Math.random().toString(36).slice(2, 10);

/**
 * Mã lỗi CÓ CÂU GIẢI THÍCH. Bất kỳ mã nào ngoài danh sách (vd. thông báo mặc
 * định của zod cho một ràng buộc chưa đặt tên) phải rơi về câu chung — gọi
 * `t()` với khoá không tồn tại thì next-intl ném lỗi và người dùng nhận màn
 * trắng thay vì lời báo lỗi.
 */
const MA_LOI = new Set([
  "invalid_input",
  "not_authenticated",
  "forbidden",
  "no_tenant",
  "khong_thay",
  "he_thong",
  "trung_khoa",
  "save_failed",
  "thieu_ten",
  "ten_qua_dai",
  "thieu_su_kien",
  "sai_su_kien",
  "thieu_hanh_dong",
  "qua_nhieu_dieu_kien",
  "qua_nhieu_hanh_dong",
  "sai_truong",
  "trung_truong",
  "sai_phep_so",
  "thieu_gia_tri",
  "sai_so",
  "sai_gia_tri",
  "hanh_dong_khong_chay_duoc",
  "thieu_ten_viec",
  "sai_nguoi",
  "thieu_tieu_de",
  "thieu_nguoi_nhan",
]);
const maLoi = (code: string) => (MA_LOI.has(code) ? code : "save_failed");
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

/**
 * ĐỌC NGƯỢC một quy trình đã lưu về các dòng của trình dựng.
 *
 * Trả `null` khi có bất kỳ mảnh nào trình dựng không diễn đạt lại được — mẫu
 * chuỗi `{{...}}`, phê duyệt nhiều cấp, loại hành động đã rút khỏi danh mục.
 * KHÔNG cố "sửa được bao nhiêu hay bấy nhiêu": mở form với một phần nội dung rồi
 * bấm Lưu là ghi đè mất phần còn lại, mà người dùng không hề thấy nó biến mất.
 */
export function docNguocQuyTrinh(w: QuyTrinhDangSua): {
  conditions: DongDK[];
  actions: DongHD[];
} | null {
  const suKien = timSuKien(w.triggerEvent);
  if (!suKien) return null;

  const coMauChuoi = (s: string | null) => s !== null && s.includes("{{");

  const conditions: DongDK[] = [];
  for (const [path, value] of Object.entries(w.conditions ?? {})) {
    const truong = suKien.truong.find((f) => f.path === path);
    if (!truong) return null;

    let op: PhepSo = "eq";
    let raw: unknown = value;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const o = value as Record<string, unknown>;
      if ("exists" in o) {
        op = o.exists === false ? "notExists" : "exists";
        raw = null;
      } else {
        const found = (["neq", "gt", "gte", "lt", "lte", "in", "contains"] as const).find(
          (k) => k in o,
        );
        if (!found) return null;
        op = found;
        raw = o[found];
      }
    }
    if (!phepSoChoKieu(truong.kieu).includes(op)) return null;
    conditions.push({
      rid: rid(),
      field: path,
      op,
      value: Array.isArray(raw)
        ? raw.map((v) => String(v)).join(", ")
        : raw === null || raw === undefined
          ? ""
          : String(raw),
    });
  }

  const choPhep = hanhDongChoGoc(suKien.goc);
  const actions: DongHD[] = [];
  for (const a of w.actions ?? []) {
    const type = str(a.type) as LoaiHanhDong | null;
    if (!type || !choPhep.includes(type)) return null;
    const body = str(a.body);
    if (coMauChuoi(body)) return null;

    if (type === "create_task") {
      const subject = str(a.subject);
      const dueIn = str(a.due_in) ?? "0 minutes";
      if (coMauChuoi(subject) || !subject) return null;
      if (!(MOC_HAN as readonly string[]).includes(dueIn)) return null;
      actions.push({
        rid: rid(),
        type,
        subject,
        body: body ?? "",
        dueIn: dueIn as MocHan,
        assignTo: str(a.assign_to) ?? "owner",
      });
      continue;
    }
    if (type === "notify") {
      const title = str(a.title);
      if (!title || coMauChuoi(title) || coMauChuoi(str(a.link))) return null;
      // `link` do playbook cài sẵn đặt; trình dựng không có ô đó nên không giữ
      // lại được — thà không cho sửa còn hơn lưu xong mất đường dẫn.
      if (str(a.link)) return null;
      actions.push({ rid: rid(), type, title, body: body ?? "", to: str(a.to) ?? "owner" });
      continue;
    }
    if (type === "assign_owner") {
      const to = str(a.to);
      if (!to || to === "owner") return null;
      actions.push({ rid: rid(), type, to });
      continue;
    }
    const title = str(a.title);
    if (!title || coMauChuoi(title)) return null;
    const levels = Array.isArray(a.levels) ? a.levels : [];
    if (levels.length > 1) return null;
    const spec = str((levels[0] as Record<string, unknown> | undefined)?.to) ?? "role:owner";
    const vai = spec.startsWith("role:") ? spec.slice(5) : "";
    if (!(VAI_DUYET as readonly string[]).includes(vai)) return null;
    actions.push({
      rid: rid(),
      type,
      title,
      body: body ?? "",
      approverRole: vai as VaiDuyet,
    });
  }
  return { conditions, actions };
}

function hanhDongMoi(loai: LoaiHanhDong): DongHD {
  if (loai === "create_task") {
    return { rid: rid(), type: loai, subject: "", body: "", dueIn: "0 minutes", assignTo: "owner" };
  }
  if (loai === "notify") return { rid: rid(), type: loai, title: "", body: "", to: "owner" };
  if (loai === "assign_owner") return { rid: rid(), type: loai, to: "" };
  return { rid: rid(), type: loai, title: "", body: "", approverRole: "owner" };
}

export function TrinhDungQuyTrinh({
  quyTrinh,
  members,
  stages,
  onClose,
}: {
  quyTrinh: (QuyTrinhDangSua & { rows: { conditions: DongDK[]; actions: DongHD[] } }) | null;
  members: NguoiTrongTiem[];
  stages: CotCoHoi[];
  onClose: () => void;
}) {
  const t = useTranslations("settings.workflows");
  const nhan = useWorkflowLabels(members, stages);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(quyTrinh?.name ?? "");
  const [description, setDescription] = useState(quyTrinh?.description ?? "");
  const [event, setEvent] = useState(quyTrinh?.triggerEvent ?? SU_KIEN[0].event);
  const [dieuKien, setDieuKien] = useState<DongDK[]>(quyTrinh?.rows.conditions ?? []);
  const [hanhDong, setHanhDong] = useState<DongHD[]>(
    quyTrinh?.rows.actions ?? [hanhDongMoi("create_task")],
  );

  const suKien = timSuKien(event);
  const truongConLai = (hienTai: string) =>
    (suKien?.truong ?? []).filter(
      (f) => f.path === hienTai || !dieuKien.some((d) => d.field === f.path),
    );
  const loaiChoPhep = suKien ? hanhDongChoGoc(suKien.goc) : [];

  /**
   * Đổi sự kiện là đổi cả bộ trường VÀ bộ hành động chạy được, nên các dòng cũ
   * không còn nghĩa. Dọn ngay trong tay người bấm — không phải trong `useEffect`
   * (quy tắc `react-hooks/set-state-in-effect` của kho).
   */
  const doiSuKien = (ev: string) => {
    setEvent(ev);
    setDieuKien([]);
    const s = timSuKien(ev);
    const cho = s ? hanhDongChoGoc(s.goc) : [];
    setHanhDong((cu) => {
      const giu = cu.filter((h) => cho.includes(h.type));
      return giu.length > 0 ? giu : [hanhDongMoi(cho[0] ?? "notify")];
    });
  };

  const suaDieuKien = (id: string, patch: Partial<DongDK>) =>
    setDieuKien((rows) => rows.map((r) => (r.rid === id ? { ...r, ...patch } : r)));
  const suaHanhDong = (id: string, patch: Partial<DongHD>) =>
    setHanhDong((rows) => rows.map((r) => (r.rid === id ? { ...r, ...patch } : r)));

  const themDieuKien = () => {
    const conLai = (suKien?.truong ?? []).filter(
      (f) => !dieuKien.some((d) => d.field === f.path),
    );
    const dau = conLai[0];
    if (!dau) return;
    setDieuKien((rows) => [
      ...rows,
      { rid: rid(), field: dau.path, op: phepSoChoKieu(dau.kieu)[0], value: "" },
    ]);
  };

  // Xem trước dùng ĐÚNG hàm dựng jsonb mà server dùng để ghi (xem `catalog.ts`).
  const dk = dungDieuKien(event, dieuKien);
  const hd = dungHanhDong(event, hanhDong);
  const duDe =
    name.trim() !== "" && dk.ok && hd.ok && hanhDong.length > 0;

  const gui = () => {
    if (pending || !duDe) return;
    const input = {
      name: name.trim(),
      description: description.trim() === "" ? null : description.trim(),
      triggerEvent: event,
      conditions: dieuKien.map(({ field, op, value }) => ({ field, op, value })),
      actions: hanhDong.map((r) => ({
        type: r.type,
        subject: r.subject,
        dueIn: r.dueIn,
        assignTo: r.assignTo,
        title: r.title,
        body: r.body,
        to: r.to,
        approverRole: r.approverRole,
      })),
    };
    startTransition(async () => {
      const res = quyTrinh
        ? await suaQuyTrinh(quyTrinh.id, input)
        : await taoQuyTrinh(input);
      if (res.error) {
        toast.error(t(`formErrors.${maLoi(res.error)}`));
        return;
      }
      toast.success(t(quyTrinh ? "toasts.saved" : "toasts.created"));
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-h-[85svh] sm:max-w-lg sm:overflow-y-auto"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{t(quyTrinh ? "builder.editTitle" : "builder.createTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wf-name">{t("builder.name")}</Label>
            <Input
              id="wf-name"
              value={name}
              autoFocus
              disabled={pending}
              onChange={(e) => setName(e.target.value.slice(0, 100))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wf-desc">{t("builder.description")}</Label>
            <Textarea
              id="wf-desc"
              rows={2}
              value={description}
              disabled={pending}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            />
          </div>

          {/* ---------- KHI NÀO CHẠY ---------- */}
          <section className="space-y-1.5 rounded-lg border p-3">
            <p className="text-xs font-semibold text-muted-foreground">{t("card.when")}</p>
            <Select
              aria-label={t("card.when")}
              value={event}
              disabled={pending}
              onChange={(e) => doiSuKien(e.target.value)}
            >
              {SU_KIEN.map((s) => (
                <option key={s.event} value={s.event}>
                  {t(`triggers.${s.nhan}`)}
                </option>
              ))}
            </Select>
          </section>

          {/* ---------- CHỈ CHẠY KHI ---------- */}
          <section className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-semibold text-muted-foreground">
              {t("card.conditions")}
            </p>
            <p className="text-xs text-muted-foreground">{t("builder.conditionsHint")}</p>

            {dieuKien.map((row) => {
              const truong = suKien?.truong.find((f) => f.path === row.field);
              const phep = truong ? phepSoChoKieu(truong.kieu) : [];
              const canGiaTri = row.op !== "exists" && row.op !== "notExists";
              return (
                <div key={row.rid} className="space-y-2 rounded-md border p-2">
                  <div className="flex gap-2">
                    <Select
                      aria-label={t("builder.field")}
                      className="flex-1"
                      value={row.field}
                      disabled={pending}
                      onChange={(e) => {
                        const moi = suKien?.truong.find((f) => f.path === e.target.value);
                        suaDieuKien(row.rid, {
                          field: e.target.value,
                          op: moi ? phepSoChoKieu(moi.kieu)[0] : "eq",
                          value: "",
                        });
                      }}
                    >
                      {truongConLai(row.field).map((f) => (
                        <option key={f.path} value={f.path}>
                          {t(`fields.${f.nhan}`)}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      disabled={pending}
                      aria-label={t("builder.removeRow")}
                      onClick={() =>
                        setDieuKien((rows) => rows.filter((r) => r.rid !== row.rid))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Select
                      aria-label={t("builder.operator")}
                      className="flex-1"
                      value={row.op}
                      disabled={pending}
                      onChange={(e) =>
                        suaDieuKien(row.rid, { op: e.target.value as PhepSo, value: "" })
                      }
                    >
                      {phep.map((op) => (
                        <option key={op} value={op}>
                          {t(`ops.${op}`)}
                        </option>
                      ))}
                    </Select>
                    {canGiaTri && truong && (
                      <div className="min-w-[9rem] flex-1">
                        {truong.kieu === "choice" ? (
                          <Select
                            aria-label={t("builder.value")}
                            value={row.value}
                            disabled={pending}
                            onChange={(e) => suaDieuKien(row.rid, { value: e.target.value })}
                          >
                            <option value="">{t("builder.pick")}</option>
                            {(truong.chon ?? []).map((c) => (
                              <option key={c} value={c}>
                                {t(`choices.${truong.nhomChon}.${c}`)}
                              </option>
                            ))}
                          </Select>
                        ) : truong.kieu === "member" ? (
                          <Select
                            aria-label={t("builder.value")}
                            value={row.value}
                            disabled={pending}
                            onChange={(e) => suaDieuKien(row.rid, { value: e.target.value })}
                          >
                            <option value="">{t("builder.pick")}</option>
                            {members.map((m) => (
                              <option key={m.userId} value={m.userId}>
                                {m.name}
                              </option>
                            ))}
                          </Select>
                        ) : truong.kieu === "stage" ? (
                          <Select
                            aria-label={t("builder.value")}
                            value={row.value}
                            disabled={pending}
                            onChange={(e) => suaDieuKien(row.rid, { value: e.target.value })}
                          >
                            <option value="">{t("builder.pick")}</option>
                            {stages.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <Input
                            aria-label={t("builder.value")}
                            inputMode={truong.kieu === "number" ? "numeric" : undefined}
                            value={row.value}
                            disabled={pending}
                            onChange={(e) =>
                              suaDieuKien(row.rid, { value: e.target.value.slice(0, 200) })
                            }
                          />
                        )}
                      </div>
                    )}
                  </div>
                  {row.op === "in" && (
                    <p className="text-xs text-muted-foreground">{t("builder.inHint")}</p>
                  )}
                </div>
              );
            })}

            {dieuKien.length >= TRAN_DIEU_KIEN ? (
              <p className="text-xs text-muted-foreground">
                {t("builder.conditionsFull", { max: TRAN_DIEU_KIEN })}
              </p>
            ) : (suKien?.truong.length ?? 0) > dieuKien.length ? (
              <Button variant="outline" size="sm" disabled={pending} onClick={themDieuKien}>
                <Plus className="size-4" />
                {t("builder.addCondition")}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">{t("builder.noMoreFields")}</p>
            )}
          </section>

          {/* ---------- SẼ LÀM GÌ ---------- */}
          <section className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-semibold text-muted-foreground">{t("card.then")}</p>
            {loaiChoPhep.length < 4 && (
              <p className="text-xs text-muted-foreground">{t("builder.limitedActions")}</p>
            )}

            {hanhDong.map((row) => (
              <div key={row.rid} className="space-y-2 rounded-md border p-2">
                <div className="flex gap-2">
                  <Select
                    aria-label={t("builder.actionType")}
                    className="flex-1"
                    value={row.type}
                    disabled={pending}
                    onChange={(e) =>
                      setHanhDong((rows) =>
                        rows.map((r) =>
                          r.rid === row.rid
                            ? { ...hanhDongMoi(e.target.value as LoaiHanhDong), rid: r.rid }
                            : r,
                        ),
                      )
                    }
                  >
                    {loaiChoPhep.map((l) => (
                      <option key={l} value={l}>
                        {t(`actionTypes.${l}`)}
                      </option>
                    ))}
                  </Select>
                  {hanhDong.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      disabled={pending}
                      aria-label={t("builder.removeRow")}
                      onClick={() =>
                        setHanhDong((rows) => rows.filter((r) => r.rid !== row.rid))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>

                {row.type === "create_task" && (
                  <>
                    <Input
                      aria-label={t("builder.taskSubject")}
                      placeholder={t("builder.taskSubject")}
                      value={row.subject ?? ""}
                      disabled={pending}
                      onChange={(e) =>
                        suaHanhDong(row.rid, { subject: e.target.value.slice(0, 200) })
                      }
                    />
                    <div className="flex flex-wrap gap-2">
                      <Select
                        aria-label={t("builder.due")}
                        className="flex-1"
                        value={row.dueIn ?? "0 minutes"}
                        disabled={pending}
                        onChange={(e) => suaHanhDong(row.rid, { dueIn: e.target.value as MocHan })}
                      >
                        {MOC_HAN.map((m) => (
                          <option key={m} value={m}>
                            {nhan.dueLabel(m)}
                          </option>
                        ))}
                      </Select>
                      <Select
                        aria-label={t("builder.assignTo")}
                        className="flex-1"
                        value={row.assignTo ?? "owner"}
                        disabled={pending}
                        onChange={(e) => suaHanhDong(row.rid, { assignTo: e.target.value })}
                      >
                        <option value="owner">{t("assignee.owner")}</option>
                        {members.map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </>
                )}

                {row.type === "notify" && (
                  <>
                    <Input
                      aria-label={t("builder.notifyTitle")}
                      placeholder={t("builder.notifyTitle")}
                      value={row.title ?? ""}
                      disabled={pending}
                      onChange={(e) =>
                        suaHanhDong(row.rid, { title: e.target.value.slice(0, 200) })
                      }
                    />
                    <Select
                      aria-label={t("builder.notifyTo")}
                      value={row.to ?? "owner"}
                      disabled={pending}
                      onChange={(e) => suaHanhDong(row.rid, { to: e.target.value })}
                    >
                      <option value="owner">{t("assignee.owner")}</option>
                      {members.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                  </>
                )}

                {row.type === "assign_owner" && (
                  <Select
                    aria-label={t("builder.assignOwnerTo")}
                    value={row.to ?? ""}
                    disabled={pending}
                    onChange={(e) => suaHanhDong(row.rid, { to: e.target.value })}
                  >
                    <option value="">{t("builder.pickPerson")}</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                )}

                {row.type === "approval" && (
                  <>
                    <Input
                      aria-label={t("builder.approvalTitle")}
                      placeholder={t("builder.approvalTitle")}
                      value={row.title ?? ""}
                      disabled={pending}
                      onChange={(e) =>
                        suaHanhDong(row.rid, { title: e.target.value.slice(0, 200) })
                      }
                    />
                    <Select
                      aria-label={t("builder.approver")}
                      value={row.approverRole ?? "owner"}
                      disabled={pending}
                      onChange={(e) =>
                        suaHanhDong(row.rid, { approverRole: e.target.value as VaiDuyet })
                      }
                    >
                      {VAI_DUYET.map((v) => (
                        <option key={v} value={v}>
                          {t(`approver.${v}`)}
                        </option>
                      ))}
                    </Select>
                  </>
                )}

                {row.type !== "assign_owner" && (
                  <Textarea
                    aria-label={t("builder.body")}
                    placeholder={t("builder.body")}
                    rows={2}
                    value={row.body ?? ""}
                    disabled={pending}
                    onChange={(e) =>
                      suaHanhDong(row.rid, { body: e.target.value.slice(0, 1000) })
                    }
                  />
                )}
              </div>
            ))}

            {hanhDong.length >= TRAN_HANH_DONG ? (
              <p className="text-xs text-muted-foreground">
                {t("builder.actionsFull", { max: TRAN_HANH_DONG })}
              </p>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  setHanhDong((rows) => [...rows, hanhDongMoi(loaiChoPhep[0] ?? "notify")])
                }
              >
                <Plus className="size-4" />
                {t("builder.addAction")}
              </Button>
            )}
          </section>

          {/* ---------- XEM TRƯỚC BẰNG LỜI ---------- */}
          <section className="space-y-2 rounded-lg border border-dashed bg-muted/40 p-3 text-[13px]">
            <p className="text-xs font-semibold text-muted-foreground">
              {t("builder.preview")}
            </p>
            <p>
              <span className="text-muted-foreground">{t("builder.previewWhen")} </span>
              {nhan.triggerLabel(event)}
            </p>
            {dk.ok ? (
              Object.keys(dk.value).length > 0 && (
                <div>
                  <span className="text-muted-foreground">{t("builder.previewOnlyIf")}</span>
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
                    {nhan.conditionLabels(event, dk.value).map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )
            ) : (
              <p className="text-muted-foreground">{t(`formErrors.${maLoi(dk.error)}`)}</p>
            )}
            {hd.ok ? (
              <div>
                <span className="text-muted-foreground">{t("builder.previewThen")}</span>
                <ol className="mt-0.5 list-decimal space-y-0.5 pl-5">
                  {hd.value.map((a, i) => (
                    <li key={i}>{nhan.actionLabel(a)}</li>
                  ))}
                </ol>
              </div>
            ) : (
              <p className="text-muted-foreground">{t(`formErrors.${maLoi(hd.error)}`)}</p>
            )}
            {!quyTrinh && (
              <p className="text-xs text-muted-foreground">{t("builder.createsOff")}</p>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("builder.cancel")}
          </Button>
          <Button onClick={gui} disabled={pending || !duDe}>
            {t("builder.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

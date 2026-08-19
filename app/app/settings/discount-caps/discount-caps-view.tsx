"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Lock, Percent, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveDiscountCaps } from "./actions";

export type CapsRow = {
  staffMaxPct: number;
  managerMaxPct: number;
  adminMaxPct: number;
};

/** Ba vai có trần, theo đúng thứ tự thấp → cao của ràng buộc trong CSDL. */
const VAI = [
  { key: "staff" as const, field: "staffMaxPct" as const },
  { key: "manager" as const, field: "managerMaxPct" as const },
  { key: "admin" as const, field: "adminMaxPct" as const },
];

export function DiscountCapsView({
  canManage,
  chuaAiChon,
  caps,
}: {
  canManage: boolean;
  /** Tiệm CHƯA có dòng nào trong `discount_caps` ⇒ ba số đang hiện là mặc định. */
  chuaAiChon: boolean;
  caps: CapsRow;
}) {
  const t = useTranslations("settings.discountCaps");
  const [form, setForm] = useState<CapsRow>(caps);
  const [dangLuu, batDauLuu] = useTransition();

  const nguoc =
    form.staffMaxPct > form.managerMaxPct || form.managerMaxPct > form.adminMaxPct;

  function luu() {
    batDauLuu(async () => {
      const r = await saveDiscountCaps(form);
      if (r.error) {
        toast.error(t(`errors.${r.error}`));
        return;
      }
      toast.success(t("saved"));
    });
  }

  // ⚠️ HAI LỚP VÙNG CUỘN — bắt buộc. Khung /app đặt màn vào
  // `<main className="flex min-h-0 flex-1 flex-col overflow-hidden">`: hộp CAO
  // CỐ ĐỊNH, cắt phần thừa. Màn nào không tự có lớp cuộn thì phần dài quá màn
  // hình bị CẮT và không có cách nào với tới — máy tính ít lộ vì màn rộng,
  // điện thoại là hỏng hẳn (đo 19/08: hai màn khác mất >1.500px nội dung và
  // nút Lưu nằm ngoài màn hình). Khuôn chép từ Bảng lương/Dự án.
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-5">
          <h1 className="flex items-center gap-1.5 text-[15px] font-semibold">
            <Percent className="size-4" />
            {t("title")}
          </h1>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            {t("intro")}
          </p>

          {/* Ba số máy điền sẵn KHÔNG được hiện như thể chủ tiệm đã chọn. Cùng bài
              học với tỉ lệ hoa hồng: một mặc định im lặng về tiền là quả bom hẹn giờ. */}
          {chuaAiChon && (
            <p className="mt-3 flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[12px] leading-relaxed text-amber-900 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{t("chuaAiChon")}</span>
            </p>
          )}

          <section className="mt-4 divide-y rounded-lg border">
            {VAI.map(({ key, field }) => (
              <div key={key} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{t(`roles.${key}.name`)}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {t(`roles.${key}.hint`)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    inputMode="numeric"
                    aria-label={t(`roles.${key}.name`)}
                    disabled={!canManage || dangLuu}
                    value={form[field]}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [field]: Number(e.target.value) }))
                    }
                    className="h-8 w-20 text-right"
                  />
                  <span className="text-[12px] text-muted-foreground">%</span>
                </div>
              </div>
            ))}
          </section>

          {/* Trần vai cao thấp hơn vai thấp là cấu hình vô nghĩa — CSDL cũng chặn,
              nhưng chặn ở đây thì người dùng đọc được câu tiếng Việt thay vì lỗi thô. */}
          {nguoc && (
            <p className="mt-2 text-[12px] leading-relaxed text-destructive">{t("nguocThuTu")}</p>
          )}

          <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
            {t("vuotTranThiSao")}
          </p>

          {canManage ? (
            <Button className="mt-4" disabled={dangLuu || nguoc} onClick={luu}>
              {dangLuu ? t("saving") : t("save")}
            </Button>
          ) : (
            <p className="mt-4 flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Lock className="size-3.5" aria-hidden />
              {t("chiChuTiemSua")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

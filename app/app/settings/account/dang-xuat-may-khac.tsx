"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { dangXuatMoiThietBiKhac } from "./actions";

/**
 * NÚT "ĐĂNG XUẤT KHỎI MỌI THIẾT BỊ KHÁC".
 *
 * ⚠️ HỎI XÁC NHẬN. Đây là việc KHÔNG hoàn tác được, và người đang làm dở ở máy
 *   kia sẽ mất chỗ. Kho này cố ý hạn chế hộp xác nhận, nhưng đúng ba điều kiện
 *   "không hoàn tác được · ảnh hưởng người khác · bấm nhầm được" thì hỏi là đúng.
 *
 * ⚠️ BÁO XONG BẰNG MỘT DÒNG THẤY ĐƯỢC. Việc này không làm gì đổi trên màn đang
 *   nhìn (theo đúng thiết kế — máy hiện tại KHÔNG bị đăng xuất), nên im lặng
 *   nghĩa là người dùng không biết nó đã chạy hay chưa và sẽ bấm lại.
 */
export function DangXuatMayKhac() {
  const t = useTranslations("settings.account.signOutOthers");
  const [dangLam, batDau] = useTransition();
  const [xong, datXong] = useState(false);

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-medium">
          <LogOut className="size-4" />
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {xong && (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {t("done")}
        </p>
      )}

      <button
        type="button"
        disabled={dangLam}
        onClick={() => {
          if (!window.confirm(t("confirm"))) return;
          batDau(async () => {
            const r = await dangXuatMoiThietBiKhac();
            if (r.error) {
              toast.error(r.error === "tooMany" ? t("tooMany") : t("failed"));
              return;
            }
            datXong(true);
          });
        }}
        className="min-h-11 rounded-md border px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-60"
      >
        {dangLam ? t("working") : t("action")}
      </button>
    </section>
  );
}

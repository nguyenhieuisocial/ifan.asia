"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { guiLaiThuXacMinh, guiThuDatLaiMatKhau } from "./actions";

/**
 * HAI HÀNH ĐỘNG HỖ TRỢ trên một dòng người dùng.
 *
 * ⚠️ CHỈ HAI, và cố ý chỉ hai. Chúng giải quyết gần hết các ca "tôi không vào
 *   được": chưa nhận được thư xác minh, hoặc quên mật khẩu. Mọi thứ mạnh hơn
 *   (đổi mật khẩu hộ, đăng nhập thay người khác) đều là đường vòng qua chính
 *   người chủ tài khoản.
 *
 * ⚠️ KHÔNG có nút xoá người dùng. Xoá một tài khoản kéo theo dữ liệu gắn với
 *   người đó ở MỌI tiệm họ từng làm, và không hoàn tác được. Cần gỡ ai khỏi một
 *   tiệm thì làm trong màn Nhân sự của tiệm đó — đúng phạm vi, có người chịu
 *   trách nhiệm.
 *
 * ⚠️ Cả hai đều GỬI THƯ THẬT cho một người thật, nên phải HỎI XÁC NHẬN. Bấm
 *   nhầm ở đây là một lá thư lạ vào hộp thư khách hàng.
 */
export function HanhDongNguoiDung({ email, daXacMinh }: { email: string; daXacMinh: boolean }) {
  const t = useTranslations("admin.users");
  const [dangLam, batDau] = useTransition();
  const [xong, datXong] = useState<string | null>(null);

  const chay = (viec: "xac-minh" | "dat-lai") =>
    batDau(async () => {
      const r = viec === "xac-minh" ? await guiLaiThuXacMinh(email) : await guiThuDatLaiMatKhau(email);
      if (r.error) {
        toast.error(r.error === "tooMany" ? t("tooMany") : t("sendFailed"));
        return;
      }
      datXong(viec);
      toast.success(t("sent"));
    });

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {!daXacMinh && (
        <button
          type="button"
          disabled={dangLam || xong === "xac-minh"}
          onClick={() => {
            if (window.confirm(t("confirmVerify", { email }))) chay("xac-minh");
          }}
          className="min-h-7 rounded-md border px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          {xong === "xac-minh" ? t("sentShort") : t("resendVerify")}
        </button>
      )}
      <button
        type="button"
        disabled={dangLam || xong === "dat-lai"}
        onClick={() => {
          if (window.confirm(t("confirmReset", { email }))) chay("dat-lai");
        }}
        className="min-h-7 rounded-md border px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
      >
        {xong === "dat-lai" ? t("sentShort") : t("sendReset")}
      </button>
    </div>
  );
}

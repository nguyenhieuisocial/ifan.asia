"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { signIn, signInDemo, type LoginState } from "@/app/auth/actions";
import { DEMO_VIEWER_EMAIL, DEMO_VIEWER_PASSWORD } from "@/lib/demo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";
import { NutDangNhapVanTay } from "@/components/passkey/nut-dang-nhap-van-tay";

/**
 * MỘT ô danh tính cho mọi loại tài khoản (chỉ đạo founder 11/08).
 *
 * Trước đây màn này bắt người dùng tự chọn "Email" hay "Nhân viên" TRƯỚC KHI
 * hệ thống nói cho họ biết mình thuộc loại nào, rồi nhân viên còn phải gõ
 * thêm "Mã tiệm". Giờ gõ email hay SĐT vào cùng một ô — phần còn lại là việc
 * của hệ thống (xem signIn ở app/auth/actions.ts).
 *
 * Ô nhập là CONTROLLED có chủ đích: React 19 tự xoá form sau mỗi lần chạy
 * action, mà ở bước "chọn tiệm" người dùng phải giữ nguyên mật khẩu vừa gõ —
 * không lẽ bắt gõ lại.
 */
/** Nút chữ của form demo — tách riêng để dùng được useFormStatus của chính form đó. */
function DemoButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-sm font-medium text-primary underline underline-offset-2 disabled:opacity-50"
    >
      {label}
    </button>
  );
}

export function LoginForm({
  urlError,
  quayLai,
}: {
  urlError?: string | null;
  quayLai?: string | null;
}) {
  const t = useTranslations("auth.login");
  const tErrors = useTranslations("auth.errors");
  const [state, formAction] = useActionState<LoginState, FormData>(signIn, {});
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  // Lỗi từ action đè lỗi cũ trên URL (?error= do chỗ khác đá về đây).
  const errorKey = state.error ?? urlError ?? null;
  const errorText = errorKey
    ? tErrors.has(errorKey)
      ? tErrors(errorKey)
      : tErrors("generic")
    : null;
  const pickShops = state.pickShops;

  return (
    <>
      {errorText && !pickShops && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorText}
        </p>
      )}

      <form action={formAction} className="space-y-4">
        {/* Chỗ đang đứng lúc phiên hết hạn. Action LỌC lại giá trị này trước khi
            dùng (noiQuayLai) — ô ẩn nào cũng sửa được từ trình duyệt. */}
        {quayLai && <input type="hidden" name="next" value={quayLai} />}
        <div className="space-y-1.5">
          <Label htmlFor="identifier">{t("identifierLabel")}</Label>
          {/* autoComplete="username" cho cả email lẫn SĐT — đây là ô định danh
              mà trình quản lý mật khẩu ghép cặp với current-password bên dưới. */}
          <Input
            id="identifier"
            name="identifier"
            type="text"
            required
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">{t("passwordPlaceholder")}</Label>
          <PasswordInput
            id="password"
            name="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {pickShops ? (
          /* Chỉ tới đây khi mật khẩu ĐÃ đúng ở nhiều tiệm — lộ tên tiệm lúc này
             là an toàn, và người dùng chỉ còn đúng một việc: chọn chỗ muốn vào. */
          <div className="space-y-2 rounded-md border bg-muted/40 p-3">
            <p className="text-sm font-medium">{t("pickShopTitle")}</p>
            <div className="space-y-1.5">
              {pickShops.map((shop) => (
                <button
                  key={shop.slug}
                  type="submit"
                  name="tenantSlug"
                  value={shop.slug}
                  className="flex w-full items-center gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 truncate">{shop.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <SubmitButton className="w-full">{t("submit")}</SubmitButton>
        )}
      </form>

      {/* Đăng nhập bằng vân tay. Tự ẩn khi máy không làm được, nên không có
          gạch ngăn "hoặc" ở đây: gạch sẽ trơ lại một mình trên máy cũ. */}
      {!pickShops && (
        <div className="mt-3">
          <NutDangNhapVanTay tiep={quayLai ?? undefined} />
        </div>
      )}

      {!pickShops && (
        <div className="mt-4 space-y-1.5 rounded-md border border-dashed p-3 text-center">
          {/* Form RIÊNG, đặt ngoài form đăng nhập (không lồng form được) — bấm là
              chạy signInDemo: đăng nhập tài khoản xem thử rồi vào thẳng tiệm mẫu
              với vai chỉ-đọc. Không điền sẵn vào 2 ô trên nữa: làm vậy thì khách
              vào bằng vai CHỦ TIỆM và xoá được dữ liệu mẫu của mọi người sau. */}
          <form action={signInDemo}>
            <DemoButton label={t("demoButton")} />
          </form>
          <p className="text-xs text-muted-foreground">
            {t("demoCaption", { email: DEMO_VIEWER_EMAIL, password: DEMO_VIEWER_PASSWORD })}
          </p>
        </div>
      )}

      {!pickShops && (
        <p className="mt-4 text-center text-sm">
          <Link
            href="/forgot-password"
            className="text-muted-foreground underline hover:text-foreground"
          >
            {t("forgotLink")}
          </Link>
        </p>
      )}
    </>
  );
}

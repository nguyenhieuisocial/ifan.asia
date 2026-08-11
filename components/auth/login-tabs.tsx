"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";

type Tab = "email" | "staff";

/**
 * Gộp /login (email) + /login/staff (SĐT, 31.29) vào MỘT khối — bấm tab đổi
 * form tại chỗ, không chuyển trang. Trước đây 2 màn riêng bắt người mới bấm
 * thêm 1 bước mới thấy được cách đăng nhập đúng với tài khoản của mình.
 *
 * Vẫn còn 2 route thật (/login, /login/staff): signIn/signInStaffByPhone
 * redirect lỗi về đúng path riêng của từng action (xem app/auth/actions.ts).
 * defaultTab chỉ quyết định tab nào hiện trước — nội dung 2 route giống hệt.
 *
 * `strings` nhận CHUỖI ĐÃ DỊCH SẴN (không nhận hàm t()/getTranslations trực
 * tiếp) — component client không nhận được hàm thường từ component server
 * qua props, chỉ nhận được Server Action (đã có "use server").
 */
export function LoginTabs({
  defaultTab,
  emailAction,
  staffAction,
  strings,
}: {
  defaultTab: Tab;
  emailAction: (formData: FormData) => void;
  staffAction: (formData: FormData) => void;
  strings: {
    tabEmail: string;
    tabStaff: string;
    emailPlaceholder: string;
    passwordPlaceholder: string;
    submit: string;
    forgotLink: string;
    staffPhoneLabel: string;
    staffSlugLabel: string;
    staffPasswordLabel: string;
    staffSubmit: string;
    staffHint: string;
  };
}) {
  const [tab, setTab] = useState<Tab>(defaultTab);

  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mb-5">
        <TabsList className="w-full">
          <TabsTrigger value="email" className="flex-1">
            {strings.tabEmail}
          </TabsTrigger>
          <TabsTrigger value="staff" className="flex-1">
            {strings.tabStaff}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "email" ? (
        <form action={emailAction} className="space-y-4">
          {/* autoComplete chuẩn để trình quản lý mật khẩu tự điền được:
              username + current-password là cặp trình duyệt nhận diện lúc đăng nhập */}
          <div className="space-y-1.5">
            <Label htmlFor="email">{strings.emailPlaceholder}</Label>
            <Input id="email" name="email" type="email" required autoComplete="username" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{strings.passwordPlaceholder}</Label>
            <PasswordInput
              id="password"
              name="password"
              required
              autoComplete="current-password"
            />
          </div>
          <SubmitButton className="w-full">{strings.submit}</SubmitButton>
        </form>
      ) : (
        <form action={staffAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="phone">{strings.staffPhoneLabel}</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              required
              autoComplete="username"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenantSlug">{strings.staffSlugLabel}</Label>
            <Input id="tenantSlug" name="tenantSlug" type="text" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{strings.staffPasswordLabel}</Label>
            <PasswordInput
              id="password"
              name="password"
              required
              autoComplete="current-password"
            />
          </div>
          <SubmitButton className="w-full">{strings.staffSubmit}</SubmitButton>
        </form>
      )}

      {tab === "email" ? (
        <p className="mt-4 text-center text-sm">
          <Link
            href="/forgot-password"
            className="text-muted-foreground underline hover:text-foreground"
          >
            {strings.forgotLink}
          </Link>
        </p>
      ) : (
        <p className="mt-4 text-center text-sm text-muted-foreground">{strings.staffHint}</p>
      )}
    </>
  );
}

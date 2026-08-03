import Link from "next/link";
import { signUp } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Dùng thử iFan miễn phí</h1>
          <p className="text-sm text-muted-foreground">30 ngày, không cần thẻ</p>
        </div>
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {sent ? (
          <p className="rounded-md border px-3 py-2 text-sm">
            Đã gửi email xác nhận — mở hộp thư và bấm link để tiếp tục.
          </p>
        ) : (
          <form action={signUp} className="space-y-4">
            <Input
              name="email"
              type="email"
              required
              placeholder="Email công việc"
            />
            <Input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Mật khẩu (tối thiểu 8 ký tự)"
            />
            <Button type="submit" className="w-full">
              Tạo tài khoản
            </Button>
          </form>
        )}
        <p className="text-center text-sm text-muted-foreground">
          Đã có tài khoản?{" "}
          <Link href="/login" className="text-foreground underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </main>
  );
}

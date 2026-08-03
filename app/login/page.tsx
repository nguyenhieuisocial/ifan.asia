import Link from "next/link";
import { signIn } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Đăng nhập iFan</h1>
          <p className="text-sm text-muted-foreground">
            Quản trị doanh nghiệp của bạn
          </p>
        </div>
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <form action={signIn} className="space-y-4">
          <Input name="email" type="email" required placeholder="Email" />
          <Input
            name="password"
            type="password"
            required
            placeholder="Mật khẩu"
          />
          <Button type="submit" className="w-full">
            Đăng nhập
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Chưa có tài khoản?{" "}
          <Link href="/signup" className="text-foreground underline">
            Đăng ký miễn phí
          </Link>
        </p>
      </div>
    </main>
  );
}

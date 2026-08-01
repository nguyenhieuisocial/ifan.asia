import Link from "next/link";
import { signIn } from "@/app/auth/actions";

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
          <p className="text-sm opacity-70">Quản trị doanh nghiệp của bạn</p>
        </div>
        {error && (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
        <form action={signIn} className="space-y-4">
          <input
            name="email"
            type="email"
            required
            placeholder="Email"
            className="w-full rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-current/50"
          />
          <input
            name="password"
            type="password"
            required
            placeholder="Mật khẩu"
            className="w-full rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-current/50"
          />
          <button
            type="submit"
            className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Đăng nhập
          </button>
        </form>
        <p className="text-center text-sm opacity-70">
          Chưa có tài khoản?{" "}
          <Link href="/signup" className="underline">
            Đăng ký miễn phí
          </Link>
        </p>
      </div>
    </main>
  );
}

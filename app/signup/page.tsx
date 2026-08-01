import Link from "next/link";
import { signUp } from "@/app/auth/actions";

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
          <p className="text-sm opacity-70">30 ngày, không cần thẻ</p>
        </div>
        {error && (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
        {sent ? (
          <p className="rounded-md border border-current/20 px-3 py-2 text-sm">
            Đã gửi email xác nhận — mở hộp thư và bấm link để tiếp tục.
          </p>
        ) : (
          <form action={signUp} className="space-y-4">
            <input
              name="email"
              type="email"
              required
              placeholder="Email công việc"
              className="w-full rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-current/50"
            />
            <input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Mật khẩu (tối thiểu 8 ký tự)"
              className="w-full rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-current/50"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              Tạo tài khoản
            </button>
          </form>
        )}
        <p className="text-center text-sm opacity-70">
          Đã có tài khoản?{" "}
          <Link href="/login" className="underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </main>
  );
}

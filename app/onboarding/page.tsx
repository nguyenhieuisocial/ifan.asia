import { createWorkspace } from "@/app/auth/actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Tạo không gian làm việc</h1>
          <p className="text-sm opacity-70">
            Mỗi doanh nghiệp một không gian riêng, dữ liệu tách biệt tuyệt đối
          </p>
        </div>
        {error && (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
        <form action={createWorkspace} className="space-y-4">
          <input
            name="name"
            required
            maxLength={120}
            placeholder="Tên doanh nghiệp (VD: Spa Xinh)"
            className="w-full rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-current/50"
          />
          <input
            name="slug"
            required
            pattern="[a-z0-9][a-z0-9-]{1,28}[a-z0-9]"
            placeholder="Địa chỉ rút gọn, không dấu (VD: spa-xinh)"
            className="w-full rounded-md border border-current/20 bg-transparent px-3 py-2 text-sm lowercase outline-none focus:border-current/50"
          />
          <button
            type="submit"
            className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Bắt đầu
          </button>
        </form>
      </div>
    </main>
  );
}

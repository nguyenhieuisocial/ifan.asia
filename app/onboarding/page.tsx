import { createWorkspace } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
          <p className="text-sm text-muted-foreground">
            Mỗi doanh nghiệp một không gian riêng, dữ liệu tách biệt tuyệt đối
          </p>
        </div>
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <form action={createWorkspace} className="space-y-4">
          <Input
            name="name"
            required
            maxLength={120}
            placeholder="Tên doanh nghiệp (VD: Spa Xinh)"
          />
          <Input
            name="slug"
            required
            pattern="[a-z0-9][a-z0-9-]{1,28}[a-z0-9]"
            placeholder="Địa chỉ rút gọn, không dấu (VD: spa-xinh)"
            className="lowercase"
          />
          <Button type="submit" className="w-full">
            Bắt đầu
          </Button>
        </form>
      </div>
    </main>
  );
}

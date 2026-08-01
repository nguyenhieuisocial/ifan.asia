import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

export const dynamic = "force-dynamic";

export default async function AppHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, slug, trial_ends_at")
    .maybeSingle();
  if (!tenant) redirect("/onboarding");

  return (
    <main className="flex flex-1 flex-col px-6 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">{tenant.name}</h1>
            <p className="text-sm opacity-60">{tenant.slug}.ifan.asia</p>
          </div>
          <form action={signOut}>
            <button className="text-sm underline opacity-70 hover:opacity-100">
              Đăng xuất
            </button>
          </form>
        </header>
        <section className="rounded-lg border border-current/15 p-6">
          <h2 className="font-medium">Không gian làm việc đã sẵn sàng 🎉</h2>
          <p className="mt-2 text-sm leading-relaxed opacity-75">
            Đây là bản nền móng. Các module sẽ xuất hiện tại đây theo lộ trình:
            Hộp thư Zalo → CRM khách hàng → AI trợ lý → Công việc, Kho, Tài
            chính...
          </p>
        </section>
      </div>
    </main>
  );
}

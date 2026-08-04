import { SettingsNav } from "./settings-nav";

/** Khung khu Cài đặt: sub-nav trên cùng, nội dung từng mục tự cuộn bên dưới. */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SettingsNav />
      {children}
    </div>
  );
}

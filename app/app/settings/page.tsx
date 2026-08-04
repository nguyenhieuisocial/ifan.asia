import { redirect } from "next/navigation";

/** /app/settings mặc định vào Kênh kết nối (mục đầu của sub-nav Cài đặt). */
export default function SettingsPage() {
  redirect("/app/settings/channels");
}

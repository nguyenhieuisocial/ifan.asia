import { redirect } from "next/navigation";

/** Đợt 1 khu Cài đặt chỉ có mục Kênh kết nối → chuyển thẳng. */
export default function SettingsPage() {
  redirect("/app/settings/channels");
}

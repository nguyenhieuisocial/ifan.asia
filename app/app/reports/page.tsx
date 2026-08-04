import { redirect } from "next/navigation";

/**
 * Khu Báo cáo. Đợt này mới có tab "Nguồn nào ra tiền" — vào /app/reports thì
 * đi thẳng vào đó. Các tab còn lại của spec CRM §4.6 (Doanh thu, Phễu, Nhân
 * viên) sẽ thêm cạnh nó.
 */
export default function ReportsPage() {
  redirect("/app/reports/sources");
}

import { redirect } from "next/navigation";

/**
 * Khu Báo cáo. Có 2 màn: "Nguồn nào ra tiền" (mặc định) và "Vì sao thua" —
 * chuyển qua lại bằng ReportNav trong từng màn. Các tab còn lại của spec CRM
 * §4.6 (Doanh thu, Phễu, Nhân viên) sẽ thêm cạnh đó.
 */
export default function ReportsPage() {
  redirect("/app/reports/sources");
}

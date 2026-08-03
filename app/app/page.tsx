import { redirect } from "next/navigation";

/** /app → màn hình sống của sản phẩm là Hộp thư. */
export default function AppHome() {
  redirect("/app/inbox");
}

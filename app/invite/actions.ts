"use server";

import { redirect } from "next/navigation";
import { rememberPendingInvite } from "./pending";

/**
 * Nhớ mã lời mời rồi đưa sang màn đăng ký / đăng nhập.
 *
 * Mã đi qua tham số ĐÃ RÀNG BUỘC của server action (Next mã hoá phần đóng gói
 * này trước khi nhúng vào HTML) chứ không phải ô input ẩn — mã không hiện trong
 * mã nguồn trang, không lên thanh địa chỉ.
 */
export async function rememberInvite(token: string, dest: "login" | "signup") {
  await rememberPendingInvite(token);
  redirect(dest === "login" ? "/login" : "/signup");
}

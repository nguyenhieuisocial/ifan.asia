import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MAX_CO_TEP, MAX_TEP_MOI_TIN, duoiTep } from "@/app/app/chat/tep-dinh-kem";

/**
 * NHẬN NỘI DUNG NGƯỜI DÙNG CHIA SẺ TỪ APP KHÁC.
 *
 * Đây là đích của `share_target` khai trong `app/manifest.ts`. Đang ở album
 * ảnh, chọn ảnh trước–sau của khách, bấm Chia sẻ — iFan hiện ra trong danh
 * sách như Zalo hay Messenger, và ảnh đi thẳng vào đây.
 *
 * ┌─ VÌ SAO TÁCH RA `/api/` ──────────────────────────────────────────
 * Cùng một thư mục không thể vừa có `route.ts` (nhận POST) vừa có `page.tsx`
 * (vẽ màn chọn). Nên: POST vào đây, tải tệp lên, rồi chuyển hướng sang
 * `/app/share` để người dùng chọn gửi đi đâu.
 *
 * ⚠️ TẢI TỆP LÊN NGAY Ở ĐÂY, không chuyển tệp qua đường dẫn. Nội dung chia sẻ
 *   chỉ tồn tại trong đúng lần gửi này; chuyển hướng xong là mất. Không tải
 *   ngay thì người dùng chia sẻ một tấm ảnh và màn tiếp theo trống trơn.
 *
 * ⚠️ Chưa đăng nhập thì đưa về trang đăng nhập KÈM đường quay lại. Chia sẻ
 *   xong mà rơi vào màn đăng nhập rồi mất luôn tấm ảnh là cách nhanh nhất để
 *   người ta không bao giờ dùng lại tính năng này.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fapp%2Fshare");

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) redirect("/onboarding");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    redirect("/app/share?loi=doc");
  }

  const chu = [form.get("tieuDe"), form.get("noiDung"), form.get("duongDan")]
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .join(" — ")
    .slice(0, 1000);

  const tepGui = form
    .getAll("tep")
    .filter((x): x is File => x instanceof File && x.size > 0)
    .slice(0, MAX_TEP_MOI_TIN);

  const daLen: string[] = [];
  for (const tep of tepGui) {
    // Quá cỡ thì BỎ QUA tệp đó và đi tiếp, không huỷ cả lượt chia sẻ. Màn sau
    // sẽ nói rõ đã nhận được mấy tệp.
    if (tep.size > MAX_CO_TEP) continue;
    const duongDan = `${tenant.id}/chat/${crypto.randomUUID()}.${duoiTep(tep.name)}`;
    const { error } = await supabase.storage
      .from("tenant-files")
      .upload(duongDan, tep, { contentType: tep.type || "application/octet-stream" });
    if (!error) daLen.push(`${duongDan}|${tep.name.slice(0, 120)}|${tep.type}|${tep.size}`);
  }

  const p = new URLSearchParams();
  if (chu) p.set("chu", chu);
  if (daLen.length > 0) p.set("tep", daLen.join("~"));
  if (tepGui.length > daLen.length) p.set("bo", String(tepGui.length - daLen.length));

  redirect(`/app/share?${p.toString()}`);
}

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { layKenhVaThanhVien } from "../chat/queries";
import { ManNhanChiaSe } from "./man-nhan-chia-se";

export const dynamic = "force-dynamic";

/**
 * MÀN NHẬN NỘI DUNG CHIA SẺ từ app khác.
 *
 * `/api/share-target` đã tải tệp lên và chuyển hướng tới đây kèm danh sách
 * đường dẫn. Việc còn lại: cho người dùng chọn gửi vào kênh nào.
 *
 * ⚠️ Người dùng ĐANG DỞ MỘT VIỆC KHÁC (họ vừa ở album ảnh). Màn này phải làm
 *   xong trong MỘT lần bấm: thấy ngay thứ mình vừa chia sẻ, chọn kênh, gửi.
 *   Bắt họ đi tìm khách rồi tìm kênh rồi mới gửi được là làm hỏng đúng cái
 *   tiện mà tính năng này sinh ra.
 */
export default async function ShareTargetPage({
  searchParams,
}: {
  searchParams: Promise<{ chu?: string; tep?: string; bo?: string; loi?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fapp%2Fshare");

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) redirect("/onboarding");

  const membership = await getCurrentMembership(supabase, user.id);
  const t = await getTranslations("share");

  // Vai Chỉ xem không gửi được gì — nói thẳng thay vì bày một màn không dùng được.
  if (membership === null || membership.role === "viewer") {
    return (
      <div className="mx-auto w-full max-w-md p-6">
        <p className="rounded-lg border border-dashed p-6 text-center text-[13px] text-muted-foreground">
          {t("readOnly")}
        </p>
      </div>
    );
  }

  const bundle = await layKenhVaThanhVien(supabase, user.id);

  /**
   * Đường dẫn tệp đi qua thanh địa chỉ, nên PHẢI kiểm lại là chúng nằm trong
   * thư mục của TIỆM NÀY. Không kiểm thì ai đó sửa thanh địa chỉ là màn hình
   * đi xin đường dẫn có chữ ký cho tệp của tiệm khác.
   */
  const tienTo = `${tenant.id}/`;
  const tep = (sp.tep ?? "")
    .split("~")
    .filter(Boolean)
    .map((x) => {
      const [duongDan, ten, loai, co] = x.split("|");
      return { duongDan, ten: ten ?? "", loai: loai ?? "", co: Number(co ?? 0) };
    })
    .filter((x) => x.duongDan?.startsWith(tienTo) && Number.isFinite(x.co));

  const xem =
    tep.length > 0
      ? ((
          await supabase.storage
            .from("tenant-files")
            .createSignedUrls(
              tep.map((x) => x.duongDan),
              3600,
            )
        ).data ?? [])
      : [];
  const kySan = new Map(
    (xem as { path: string | null; signedUrl: string | null }[]).map((x) => [
      x.path ?? "",
      x.signedUrl,
    ]),
  );

  return (
    <ManNhanChiaSe
      chu={(sp.chu ?? "").slice(0, 1000)}
      soBo={Number(sp.bo ?? 0) || 0}
      coLoiDoc={sp.loi === "doc"}
      tep={tep.map((x) => ({ ...x, xemTai: kySan.get(x.duongDan) ?? null }))}
      kenh={bundle.kenh}
      thanhVien={bundle.thanhVien}
      currentUserId={user.id}
    />
  );
}

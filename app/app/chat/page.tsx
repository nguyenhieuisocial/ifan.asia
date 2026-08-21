import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { layKenhVaThanhVien } from "./queries";
import { ChatView } from "./chat-view";
import type { ChatBundle } from "./queries";

export const dynamic = "force-dynamic";

/**
 * Màn Chat nội bộ RIÊNG (migration #298, thẻ `man-chat-noi-bo.html`).
 *
 * MỌI VAI ĐỀU VÀO ĐƯỢC — kể cả `viewer`. Chat là chỗ cả tiệm nói chuyện; giấu
 * mục khỏi một vai là cắt họ khỏi tiệm. Vai Chỉ xem ĐỌC được nhưng không nhắn
 * và không mở được kênh riêng — chốt thật ở RLS (`chat_messages_insert`,
 * `chat_channels_insert` đều loại `viewer`), đây chỉ là mặt tiền cho khớp.
 *
 * KHÔNG NUỐT LỖI: tra cứu hỏng bật `loadFailed` với câu chữ khác hẳn "chưa có
 * tin nào" — hai chuyện đó không được đọc ra giống nhau.
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string | string[] }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) redirect("/onboarding");

  // `?c=<mã kênh>` — thông báo gọi tên dẫn thẳng vào đúng cuộc trò chuyện.
  // Chỉ nhận đúng khuôn uuid: tham số rác thì bỏ qua chứ không chảy xuống DOM.
  const rawC = typeof sp.c === "string" ? sp.c : null;
  const kenhBanDau =
    rawC && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawC)
      ? rawC
      : null;

  const membership = await getCurrentMembership(supabase, user.id);

  let bundle: ChatBundle = { kenh: [], thanhVien: [] };
  let loadFailed = false;
  try {
    bundle = await layKenhVaThanhVien(supabase, user.id);
  } catch {
    loadFailed = true;
  }

  return (
    <ChatView
      loadFailed={loadFailed}
      kenh={bundle.kenh}
      thanhVien={bundle.thanhVien}
      currentUserId={user.id}
      // Khớp RLS: mọi vai TRỪ viewer mới ghi được.
      canWrite={membership !== null && membership.role !== "viewer"}
      kenhBanDau={kenhBanDau}
    />
  );
}

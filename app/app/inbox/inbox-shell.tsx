"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";
import { TilePlug } from "@/components/illustrations/tile-plug";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  fetchConversations,
  fetchInboxCounts,
  fetchMessages,
  markConversationRead,
} from "./queries";
import {
  INBOX_PAGE_SIZE,
  type ConversationRow,
  type InboxCounts,
  type InboxFilter,
  type Member,
  type MemberNames,
  type MessageRow,
} from "./types";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { ContactPanel } from "./contact-panel";

type Props = {
  currentUserId: string;
  hasChannels: boolean;
  /** Kênh Live Chat đang bật nhưng chưa có tin nào từ website thật (còn bước dán mã). */
  livechatAwaitingSnippet: boolean;
  members: Member[];
  memberNames: MemberNames;
  initialFilter: InboxFilter;
  initialConversations: ConversationRow[];
  /** Tổng hội thoại khớp bộ lọc lúc dựng trang — để nút "Xem thêm" không hứa suông. */
  initialConversationsTotal: number;
  initialCounts: InboxCounts;
  initialSelectedId: string | null;
  initialMessages: MessageRow[] | null;
};

export function InboxShell({
  currentUserId,
  hasChannels,
  livechatAwaitingSnippet,
  members,
  memberNames,
  initialFilter,
  initialConversations,
  initialConversationsTotal,
  initialCounts,
  initialSelectedId,
  initialMessages,
}: Props) {
  const t = useTranslations("inbox");
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [filter, setFilter] = useState<InboxFilter>(initialFilter);
  const [limit, setLimit] = useState(INBOX_PAGE_SIZE);
  // Hội thoại mở qua link ?c= có thể nằm ngoài bộ lọc / ngoài trang đang tải —
  // giữ nó lại qua mọi lần refetch để cửa sổ chat không tự biến mất.
  const [pinnedId] = useState<string | null>(initialSelectedId);
  // Ô tìm khách. Hoãn 300ms để mỗi phím gõ không thành một lượt hỏi CSDL.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Realtime Hộp thư KHÔNG đăng ký ở đây nữa: kênh 'tenant:{id}:inbox' đăng ký
  // ĐÚNG MỘT nơi ở MobileNav (app shell, luôn sống) để badge nav cập nhật cả
  // khi đứng màn khác — hook đó vẫn cập nhật cache ['conversations']/['messages']
  // /['inbox-counts'] chung queryClient nên màn này nhận tin mới y như cũ.
  const conversationsQuery = useQuery({
    queryKey: ["conversations", filter, limit, pinnedId, debouncedSearch],
    queryFn: () =>
      fetchConversations(supabase, {
        filter,
        currentUserId,
        limit,
        // Đang tìm thì KHÔNG ghim hội thoại mở sẵn nữa: ghim lại thì nó vẫn nằm
        // đầu danh sách dù không khớp từ khoá, người dùng tưởng đó là kết quả.
        pinnedId: debouncedSearch ? null : pinnedId,
        search: debouncedSearch,
      }),
    initialData:
      filter === initialFilter && limit === INBOX_PAGE_SIZE && !debouncedSearch
        ? { rows: initialConversations, total: initialConversationsTotal }
        : undefined,
  });

  // Số trên tab đếm bằng COUNT trong CSDL — KHÔNG đếm độ dài danh sách đã tải,
  // vì danh sách chỉ là một trang.
  const countsQuery = useQuery({
    queryKey: ["inbox-counts"],
    queryFn: () => fetchInboxCounts(supabase),
    initialData: initialCounts,
  });

  /**
   * Hội thoại ĐANG HIỆN trong khung chat — khác với hội thoại người dùng đã
   * BẤM CHỌN.
   *
   * Mở Hộp thư trên máy tính mà chưa bấm gì thì 2/3 màn hình là khoảng trắng,
   * và hai chỗ trống lại nhắc cùng một câu. Hội thoại đầu danh sách đã tải sẵn
   * dữ liệu rồi — hiện luôn nó.
   *
   * Tách hai khái niệm ra là để CSS lo phần điện thoại, không cần đo bề rộng
   * bằng JavaScript (đo bằng JS thì lúc dựng trang chưa biết, sinh lệch nội
   * dung): khung chat vốn đã `hidden md:flex` khi chưa bấm chọn, nên trên điện
   * thoại nó vẫn ẩn và người dùng thấy đúng danh sách vừa vào.
   */
  const displayedId = selectedId ?? conversationsQuery.data?.rows?.[0]?.id ?? null;

  const messagesQuery = useQuery({
    queryKey: ["messages", displayedId],
    queryFn: () => fetchMessages(supabase, displayedId as string),
    enabled: displayedId !== null,
    initialData:
      displayedId !== null && displayedId === initialSelectedId
        ? (initialMessages ?? undefined)
        : undefined,
  });

  // Số chưa đọc của hội thoại ĐANG mở — đặt ngoài effect để tin mới về đúng hội
  // thoại đang xem cũng được đánh dấu đã đọc, không đọng lại thành badge mới.
  const selectedUnread =
    conversationsQuery.data?.rows?.find((c) => c.id === selectedId)?.unread_count ?? 0;

  // Mở hội thoại = đã đọc, và phải GHI XUỐNG CSDL (migration #43). Trước đây chỉ
  // xóa badge trong cache nên tải lại trang là con số cam cũ hiện lại y nguyên —
  // chủ tiệm không bao giờ dọn sạch được hộp thư. Đặt ở effect chứ không ở
  // select() để hội thoại mở bằng đường dẫn ?c= cũng được đánh dấu.
  useEffect(() => {
    if (!selectedId || selectedUnread === 0) return;
    // Danh sách có nhiều cache theo bộ lọc/số dòng — xóa badge ở MỌI cache khớp
    // tiền tố, giống cách use-inbox-realtime cập nhật tin mới.
    queryClient.setQueriesData<ConversationRow[]>(
      { queryKey: ["conversations"] },
      (old) => old?.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c)),
    );
    void markConversationRead(supabase, selectedId);
  }, [selectedId, selectedUnread, queryClient, supabase]);

  // Vuốt-cạnh/nút back trên điện thoại phải quay về DANH SÁCH chứ không thoát
  // app: lúc mở hội thoại từ danh sách (select bên dưới) ta THÊM một mục lịch
  // sử; back → popstate → đọc ?c= trên URL vừa quay về để đóng/mở đúng khung
  // chat (đi tới lại cũng đúng). Handler chỉ setState, không đụng history —
  // không thể tạo vòng lặp.
  useEffect(() => {
    const onPop = () => {
      setSelectedId(new URLSearchParams(window.location.search).get("c"));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Chọn hội thoại: đổi state + sync URL không re-render server (tốc độ là tính năng)
  const select = (id: string | null) => {
    setSelectedId(id);
    // Dưới md (đúng ngưỡng CSS đang ẩn/hiện hai khung) khung chat chiếm TRỌN
    // màn hình → push kèm cờ inboxThread để back quay về danh sách. Desktop giữ
    // nguyên replaceState: khung chat nằm CẠNH danh sách (displayed pattern),
    // back phải rời trang như mọi khi. Chỉ push lúc chuyển danh-sách→chat
    // (selectedId đang null) để bấm lần lượt nhiều hội thoại không chất chồng
    // lịch sử.
    if (
      id !== null &&
      selectedId === null &&
      !window.matchMedia("(min-width: 768px)").matches
    ) {
      window.history.pushState({ inboxThread: true }, "", conversationHref(filter, id));
      return;
    }
    // Giữ nguyên history.state (thay vì null) để không xoá cờ inboxThread lẫn
    // state nội bộ của Next trên mục lịch sử hiện tại.
    window.history.replaceState(window.history.state, "", conversationHref(filter, id));
  };

  const changeFilter = (next: InboxFilter) => {
    setFilter(next);
    setLimit(INBOX_PAGE_SIZE);
    window.history.replaceState(null, "", conversationHref(next, selectedId));
  };

  if (!hasChannels) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <TilePlug className="size-20" />
        <h2 className="text-lg font-semibold">{t("notConnected.title")}</h2>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          {t("notConnected.description")}
        </p>
        {/* CTA dẫn thẳng vào cắm Live Chat: chạy ngay, không cần giấy phép —
            không trỏ sang Zalo OA "sắp có" rồi bắt người ta chờ giấy tờ. */}
        <Button asChild>
          <Link href="/app/settings/channels/livechat">{t("notConnected.cta")}</Link>
        </Button>
      </div>
    );
  }

  const conversations = conversationsQuery.data?.rows ?? [];
  // Tổng KHỚP truy vấn đang chạy (đã tính cả từ khoá) — khác `counts[filter]`
  // vốn mù từ khoá. Đây là con số nói được "còn bao nhiêu nữa".
  const matchedTotal = conversationsQuery.data?.total ?? conversations.length;
  const counts = countsQuery.data ?? initialCounts;
  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  // Hiện trong khung chat: cái đã bấm chọn, không thì hội thoại đầu danh sách.
  const displayed = selected ?? conversations[0] ?? null;

  // Banner "còn bước dán mã" chỉ hiện cho người sửa được cài đặt kênh
  // (owner/admin) — nhân viên thường bấm vào chỉ gặp màn không-có-quyền.
  const showLivechatBanner =
    livechatAwaitingSnippet &&
    members.some(
      (m) =>
        m.user_id === currentUserId && (m.role === "owner" || m.role === "admin"),
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Kênh Live Chat đã bật nhưng chưa có tin nào từ website thật: nhắc ngay
          tại nơi chủ tiệm ngồi chờ tin — không có banner này họ tưởng đã xong
          và ngồi chờ một hộp thư không bao giờ reo. */}
      {showLivechatBanner && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-status-pending px-4 py-2.5 text-[13px] text-status-pending-foreground">
          <TriangleAlert className="size-4 shrink-0" />
          <span className="min-w-0">{t("livechatPending.text")}</span>
          <Link
            href="/app/settings/channels/livechat"
            className="font-medium underline underline-offset-2"
          >
            {t("livechatPending.cta")}
          </Link>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <ConversationList
          className={selected ? "hidden md:flex" : "flex"}
          conversations={conversations}
          counts={counts}
          filter={filter}
          onFilterChange={changeFilter}
          search={search}
          onSearchChange={setSearch}
          // Trước đây đang tìm là TẮT HẲN "Xem thêm" — tiệm có 80 khách tên
          // "Vân" thì thấy 50 và không dòng nào nói còn 30 nữa. Nay dùng tổng
          // KHỚP của chính truy vấn đang chạy, nên nút đúng cho cả hai trường
          // hợp và `matchedTotal` nói thẳng số bị cắt.
          hasMore={matchedTotal > conversations.length}
          matchedTotal={matchedTotal}
          shownCount={conversations.length}
          loadingMore={conversationsQuery.isFetching}
          onLoadMore={() => setLimit((n) => n + INBOX_PAGE_SIZE)}
          loadFailed={conversationsQuery.isError}
          selectedId={selectedId}
          onSelect={select}
        />
        <MessageThread
          className={selected ? "flex" : "hidden md:flex"}
          conversation={displayed}
          messages={displayed ? (messagesQuery.data ?? []) : []}
          loading={displayed !== null && messagesQuery.isPending}
          loadFailed={displayed !== null && messagesQuery.isError}
          members={members}
          memberNames={memberNames}
          currentUserId={currentUserId}
          onBack={() => {
            // Nút ← trong khung chat: nếu lúc mở đã push lịch sử (mobile) thì lùi
            // đúng một nhịp cho khớp vuốt-cạnh — popstate ở trên sẽ đóng khung
            // chat. Mở thẳng qua ?c= thì không có mục nào để lùi → đóng bằng state.
            if (window.history.state?.inboxThread) window.history.back();
            else select(null);
          }}
        />
        {/* Panel khách theo displayed (không phải selected): khung chat đang hiện
            hội thoại đầu danh sách khi chưa bấm chọn — panel phải nói về ĐÚNG
            hội thoại đó, không được đứng ở "Chọn hội thoại…" lệch pha. */}
        <ContactPanel
          className="hidden xl:flex"
          conversation={displayed}
          currentUserId={currentUserId}
          members={members}
          memberNames={memberNames}
        />
      </div>
    </div>
  );
}

/** URL luôn mang theo bộ lọc để refresh / chia sẻ link ra đúng danh sách. */
function conversationHref(filter: InboxFilter, id: string | null): string {
  const params = new URLSearchParams();
  params.set("filter", filter);
  if (id) params.set("c", id);
  return `/app/inbox?${params.toString()}`;
}

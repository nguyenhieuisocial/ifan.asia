"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { AtSign, Bookmark, Hash, Search, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { taiDeDocSau, taiNhacToi, timTinChat } from "./actions";
import type { ChatTinTimThay } from "./types";

export type LoaiHop = "nhac" | "luu" | "tim";

/**
 * BA HỘP GOM TIN vắt qua mọi kênh: Nhắc tới tôi · Để đọc sau · Tìm trong tin.
 *
 * "Nhắc tới tôi" là chỗ người ta mở đầu tiên mỗi sáng — "có ai gọi mình
 * không". Bảng `chat_mentions` đã có từ lâu nhưng chưa màn nào bày ra, nên câu
 * hỏi đó vẫn phải trả lời bằng cách bấm vào từng kênh.
 *
 * ⚠️ Ba hộp DÙNG CHUNG một khung, cố ý. Chúng khác nhau đúng ở nguồn dữ liệu;
 *   ba khung riêng là ba chỗ để về sau lệch nhau về cách hiện, cách báo lỗi,
 *   và cách xử lý trạng thái rỗng.
 *
 * ⚠️ Bấm một dòng thì NHẢY VÀO KÊNH chứa nó, không mở một khung đọc riêng.
 *   Một tin tách khỏi mạch trò chuyện thường không đủ nghĩa — người ta cần
 *   thấy câu trước và câu sau.
 */
export function HopGomTin({
  loai,
  tuKhoa,
  locale,
  tenCuaNguoi,
  tenKenhCua,
  onChonKenh,
  onDong,
}: {
  loai: LoaiHop;
  /** Chỉ dùng với `tim`. */
  tuKhoa: string;
  locale: Locale;
  tenCuaNguoi: (userId: string) => string;
  tenKenhCua: (t: ChatTinTimThay) => string;
  onChonKenh: (channelId: string) => void;
  onDong: () => void;
}) {
  const t = useTranslations("chatRieng");

  const query = useQuery({
    queryKey: ["chat-hop", loai, tuKhoa],
    queryFn: () =>
      loai === "nhac"
        ? taiNhacToi()
        : loai === "luu"
          ? taiDeDocSau()
          : timTinChat({ q: tuKhoa }),
    // Ô tìm chưa đủ hai ký tự thì đừng gọi máy chủ cho mỗi phím gõ.
    enabled: loai !== "tim" || tuKhoa.trim().length >= 2,
  });

  const Bieu = loai === "nhac" ? AtSign : loai === "luu" ? Bookmark : Search;
  const tieuDe =
    loai === "nhac" ? t("box.mentions") : loai === "luu" ? t("box.saved") : t("box.search");

  const tins = query.data?.tins ?? [];

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <Bieu className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">{tieuDe}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {loai === "tim" && tuKhoa.trim().length < 2
              ? t("box.searchHint")
              : query.isPending
                ? t("loading")
                : t("box.count", { count: tins.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={onDong}
          aria-label={t("box.close")}
          className="flex size-9 items-center justify-center rounded-md hover:bg-muted max-md:size-11"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {query.data?.error ? (
          <p className="p-3 text-[12px] text-muted-foreground">
            {t(`errors.${query.data.error}`)}
          </p>
        ) : tins.length === 0 && !query.isPending ? (
          <p className="p-3 text-[12px] text-muted-foreground">
            {loai === "nhac"
              ? t("box.emptyMentions")
              : loai === "luu"
                ? t("box.emptySaved")
                : t("box.emptySearch", { q: tuKhoa })}
          </p>
        ) : (
          <ul className="divide-y">
            {tins.map((tin) => (
              <li key={tin.id}>
                <button
                  type="button"
                  onClick={() => onChonKenh(tin.channelId)}
                  className="w-full px-3 py-2 text-left hover:bg-muted/50"
                >
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {tin.kenhKind === "dm" ? (
                      <User className="size-3 shrink-0" />
                    ) : (
                      <Hash className="size-3 shrink-0" />
                    )}
                    <span className="truncate font-medium text-foreground">{tenKenhCua(tin)}</span>
                    <span className="shrink-0">·</span>
                    <span className="truncate">{tenCuaNguoi(tin.senderUserId)}</span>
                    <span className="ml-auto shrink-0">
                      {formatDateTime(tin.createdAt, locale)}
                    </span>
                  </p>
                  <p className={cn("mt-0.5 line-clamp-3 text-[13px] leading-relaxed break-words")}>
                    {tin.body}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

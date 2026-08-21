"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AtSign, ChevronLeft, Hash, Lock, MessageSquarePlus, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useChatRealtime } from "@/lib/realtime/use-chat-realtime";
import { formatDateTime, formatTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import {
  danhDauDaDoc,
  guiTinChat,
  moKenhRieng,
  suaTinChat,
  taiTinKenh,
  xoaTinChat,
} from "./actions";
import {
  BADGE_MAX,
  EDIT_WINDOW_MS,
  MAX_BODY_LENGTH,
  MESSAGE_LIMIT,
  xepKenh,
  type ChatKenh,
  type ChatMember,
  type ChatTin,
} from "./types";

/**
 * Màn Chat nội bộ RIÊNG (migration #298).
 *
 * ⚠️ KHÁC HẲN khung "Trao đổi nội bộ" màu hổ phách nhúng trong đơn/khách/lịch:
 * cái đó là GHI CHÚ GẮN VÀO VIỆC (#169), không đếm chưa đọc, quyền thừa hưởng
 * từ việc. Màn này là chỗ nhắn nhau, quyền theo tư cách thành viên. Hai mảng
 * riêng — KHÔNG có đường nào chuyển tin qua lại, y như hai đường chat khách và
 * chat nội bộ không có nút chuyển.
 */
export function ChatView({
  loadFailed,
  kenh,
  thanhVien,
  currentUserId,
  tenantId,
  canWrite,
  kenhBanDau,
}: {
  loadFailed: boolean;
  kenh: ChatKenh[];
  thanhVien: ChatMember[];
  currentUserId: string;
  /** Để nghe kênh tin tức tức thời `tenant:{id}:chat` (#303). */
  tenantId: string;
  /** Khớp RLS — mọi vai TRỪ viewer. */
  canWrite: boolean;
  kenhBanDau: string | null;
}) {
  // Nghe kênh riêng của tiệm — tin tới là tải lại đúng cuộc đang mở (#303).
  useChatRealtime(tenantId);

  const t = useTranslations("chatRieng");
  const locale = useLocale() as Locale;

  const dsKenh = useMemo(() => xepKenh(kenh), [kenh]);
  const kenhMacDinh = kenhBanDau ?? dsKenh[0]?.id ?? null;

  const [dangChon, datDangChon] = useState<string | null>(kenhMacDinh);
  // Trên điện thoại chỉ đủ chỗ cho MỘT cột. Vào thẳng từ thông báo (`?c=`) thì
  // mở luôn cuộc đó; còn lại mở danh sách trước để người dùng thấy toàn cảnh.
  const [hienDanhSach, datHienDanhSach] = useState(kenhBanDau === null);

  /**
   * Kênh đã xem trong phiên này ⇒ badge chưa đọc về 0 NGAY, không chờ máy chủ.
   *
   * Tính bằng `useState` khởi tạo (không phải `useEffect`): đặt lại state trong
   * thân effect khiến React vẽ một nhịp bằng số cũ rồi mới vẽ lại — người dùng
   * thấy badge nhấp nháy, và ESLint của kho chặn (`set-state-in-effect`).
   */
  const [daXem, datDaXem] = useState<Set<string>>(
    () => new Set(kenhMacDinh ? [kenhMacDinh] : []),
  );

  const [nhap, datNhap] = useState("");
  const [dangSuaId, datDangSuaId] = useState<string | null>(null);
  const [nhapSua, datNhapSua] = useState("");
  const [pending, batDau] = useTransition();
  // Nhịp đếm để nút "Sửa" TỰ BIẾN MẤT khi hết 15 phút, không phải bấm rồi mới báo lỗi.
  const [nowMs, datNowMs] = useState(() => Date.now());

  const query = useQuery({
    queryKey: ["chat-rieng", dangChon],
    queryFn: () => taiTinKenh({ channelId: dangChon as string }),
    enabled: dangChon !== null,
    // ⚠️ ĐÃ BỎ nhịp hỏi lại 20 giây (#303). Bản đầu tự hỏi lại vì chưa có
    // đường tin tức tức thời; nay có rồi — `useChatRealtime` bên dưới nghe
    // kênh riêng của tiệm và tải lại đúng lúc có tin. Một chỗ nhắn nhau mà
    // chậm tới 20 giây thì người ta quay về Zalo, đúng thứ màn này sinh ra
    // để thay thế.
    //
    // Vẫn giữ một nhịp CHẬM làm lưới an toàn: nếu kênh rớt mà không kịp báo,
    // 2 phút sau vẫn có tin. Rẻ hơn hẳn 20 giây, và không để màn chết câm.
    refetchInterval: 120_000,
  });
  const load = query.data ?? null;

  const cuoiDanhSach = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => datNowMs(Date.now()), 20_000);
    return () => clearInterval(timer);
  }, []);

  // Ghi mốc "đã đọc tới đây" xuống CSDL. CHỈ gọi máy chủ, KHÔNG đặt state ở đây
  // (state đã lo ở `datDaXem` lúc bấm / lúc khởi tạo).
  useEffect(() => {
    if (dangChon === null) return;
    let huy = false;
    void danhDauDaDoc({ channelId: dangChon }).then((res) => {
      // Hỏng thì NÓI RA. Nuốt ở đây nghĩa là badge chưa đọc không bao giờ tắt
      // thật — tải lại trang là con số cũ hiện y nguyên mà không ai hiểu vì sao.
      if (!huy && res.error) toast.error(t(`errors.${res.error}`));
    });
    return () => {
      huy = true;
    };
  }, [dangChon, t]);

  // Cuộn xuống tin mới nhất. Chỉ đọc/gọi DOM, không đặt state.
  useEffect(() => {
    cuoiDanhSach.current?.scrollIntoView({ block: "end" });
  }, [load?.messages.length, dangChon]);

  const tenCuaNguoi = (userId: string) =>
    thanhVien.find((m) => m.userId === userId)?.displayName ??
    t("unknownMember", { id: userId.slice(0, 8) });

  const tenKenh = (c: ChatKenh) =>
    c.kind === "team" ? t("teamChannel") : (c.doiPhuongTen ?? t("unknownChannel"));

  const soChuaDoc = (c: ChatKenh) => (daXem.has(c.id) ? 0 : c.soChuaDoc);

  const kenhDangChon = dsKenh.find((c) => c.id === dangChon) ?? null;

  /** Người chưa có kênh riêng nào với mình — nội dung ô "Nhắn riêng với…". */
  const nguoiChuaCoKenh = useMemo(() => {
    const daCo = new Set(dsKenh.filter((c) => c.kind === "dm").map((c) => c.doiPhuongUserId));
    return thanhVien.filter((m) => m.userId !== currentUserId && !daCo.has(m.userId));
  }, [dsKenh, thanhVien, currentUserId]);

  function chonKenh(id: string) {
    datDangChon(id);
    datDaXem((truoc) => new Set(truoc).add(id));
    datHienDanhSach(false);
    datDangSuaId(null);
    datNhap("");
    // Giữ đường dẫn khớp cuộc đang mở để tải lại trang / gửi link vẫn đúng chỗ.
    // Dùng `replaceState` chứ không điều hướng: đổi cuộc không đáng một lượt
    // dựng lại cả trang ở máy chủ.
    window.history.replaceState(null, "", `/app/chat?c=${id}`);
  }

  function moRiengVoi(userId: string) {
    batDau(async () => {
      const res = await moKenhRieng({ userId });
      if (res.error || !res.channelId) {
        toast.error(t(`errors.${res.error ?? "saveFailed"}`));
        return;
      }
      // Kênh vừa tạo chưa có trong danh sách của máy chủ ⇒ chọn thẳng rồi để
      // lần dựng trang sau bổ sung. Không gọi refresh: người dùng đang muốn gõ.
      chonKenh(res.channelId);
    });
  }

  function gui() {
    const body = nhap.trim();
    if (!body || dangChon === null) return;
    batDau(async () => {
      const res = await guiTinChat({ channelId: dangChon, body });
      // `mentionFailed` nghĩa là TIN ĐÃ GHI, chỉ khâu gọi tên hỏng. Xử như lỗi
      // gửi (giữ nguyên ô soạn) thì người dùng bấm gửi lần nữa ⇒ hai tin.
      if (res.error && res.error !== "mentionFailed") {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      datNhap("");
      await query.refetch();
      if (res.error === "mentionFailed") toast.error(t("errors.mentionFailed"));
    });
  }

  function luuSua(messageId: string) {
    const body = nhapSua.trim();
    if (!body) {
      toast.error(t("errors.empty"));
      return;
    }
    batDau(async () => {
      const res = await suaTinChat({ messageId, body });
      if (res.error) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      datDangSuaId(null);
      await query.refetch();
    });
  }

  function xoa(messageId: string) {
    batDau(async () => {
      const res = await xoaTinChat({ messageId });
      if (res.error) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      await query.refetch();
    });
  }

  if (loadFailed) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Lock className="size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t("loadFailed.title")}</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">{t("loadFailed.description")}</p>
      </div>
    );
  }

  return (
    // ⚠️ HAI LỚP VÙNG CUỘN — khung /app đặt màn vào một hộp CAO CỐ ĐỊNH và cắt
    // phần thừa. Màn nào không tự có lớp cuộn thì phần dài quá màn hình bị cắt
    // và không có cách nào với tới (đo 19/08: hai màn khác mất >1.500px nội dung).
    <div className="flex flex-1 overflow-hidden">
      {/* ── Cột trái: danh sách cuộc trò chuyện ───────────────────────── */}
      <aside
        className={cn(
          "w-full shrink-0 flex-col overflow-y-auto border-r md:flex md:w-72",
          hienDanhSach ? "flex" : "hidden",
        )}
      >
        <div className="border-b px-3 py-2.5">
          <h1 className="text-[14px] font-semibold">{t("title")}</h1>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        <ul className="divide-y">
          {dsKenh.map((c) => {
            const chuaDoc = soChuaDoc(c);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => chonKenh(c.id)}
                  aria-label={
                    chuaDoc > 0 ? t("unreadAria", { name: tenKenh(c), count: chuaDoc }) : undefined
                  }
                  className={cn(
                    // 44px là ngưỡng vùng bấm trên điện thoại.
                    "flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/60",
                    dangChon === c.id && "bg-muted",
                  )}
                >
                  {c.kind === "team" ? (
                    <Hash className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <User className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {tenKenh(c)}
                  </span>
                  {chuaDoc > 0 && (
                    <span
                      aria-hidden
                      className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white"
                    >
                      {chuaDoc > BADGE_MAX ? `${BADGE_MAX}+` : chuaDoc}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Mở kênh riêng — vai Chỉ xem không có ô này (RLS cũng chặn). */}
        {canWrite && nguoiChuaCoKenh.length > 0 && (
          <div className="border-t px-3 py-2.5">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <MessageSquarePlus className="size-3.5" />
              {t("startDm")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {nguoiChuaCoKenh.map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  disabled={pending}
                  onClick={() => moRiengVoi(m.userId)}
                  className="flex min-h-11 items-center rounded-full border px-3 text-[12px] hover:bg-muted/60 disabled:opacity-60 md:min-h-0 md:py-1"
                >
                  {m.displayName}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ── Cột phải: khung tin ────────────────────────────────────────── */}
      <section
        className={cn(
          "min-w-0 flex-1 flex-col overflow-hidden md:flex",
          hienDanhSach ? "hidden" : "flex",
        )}
      >
        {kenhDangChon === null ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center">
            <p className="text-[13px] text-muted-foreground">{t("noChannel")}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b px-3 py-2.5">
              <button
                type="button"
                onClick={() => datHienDanhSach(true)}
                aria-label={t("backToList")}
                className="flex size-11 items-center justify-center rounded-md hover:bg-muted/60 md:hidden"
              >
                <ChevronLeft className="size-5" />
              </button>
              {kenhDangChon.kind === "team" ? (
                <Hash className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <User className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                {tenKenh(kenhDangChon)}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {t("customerCannotSee")}
              </span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2.5">
              {/* Hỏng đường truyền thì PHẢI nói ra — để nguyên "Đang tải…" là
                  nuốt lỗi thành một khung quay mãi mà không ai biết vì sao. */}
              {query.isError ? (
                <p className="rounded-md border border-dashed p-2.5 text-[12px] text-muted-foreground">
                  {t("errors.loadFailed")}
                </p>
              ) : load === null ? (
                <p className="text-[12px] text-muted-foreground">{t("loading")}</p>
              ) : load.error ? (
                <p className="rounded-md border border-dashed p-2.5 text-[12px] text-muted-foreground">
                  {t(`errors.${load.error}`)}
                </p>
              ) : (
                <>
                  {load.atLimit && (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {t("limitNote", { n: MESSAGE_LIMIT })}
                    </p>
                  )}
                  {load.messages.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground">{t("empty")}</p>
                  ) : (
                    <ul className="space-y-2">
                      {load.messages.map((tin) => (
                        <li key={tin.id} className="flex gap-2">
                          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                            {(tenCuaNguoi(tin.senderUserId)[0] ?? "?").toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] text-muted-foreground">
                              <span className="font-medium text-foreground">
                                {tenCuaNguoi(tin.senderUserId)}
                              </span>
                              {" · "}
                              <span title={formatDateTime(tin.createdAt, locale)}>
                                {formatTime(tin.createdAt, locale)}
                              </span>
                              {tin.editedAt && !tin.deletedAt && (
                                <span className="ml-1 italic">{t("edited")}</span>
                              )}
                            </p>

                            {tin.deletedAt ? (
                              <p className="text-[12px] italic text-muted-foreground">
                                {t("deletedTrace", {
                                  time: formatTime(tin.deletedAt, locale),
                                })}
                              </p>
                            ) : dangSuaId === tin.id ? (
                              <div className="space-y-1.5 pt-1">
                                <Textarea
                                  value={nhapSua}
                                  onChange={(e) => datNhapSua(e.target.value)}
                                  maxLength={MAX_BODY_LENGTH}
                                  rows={2}
                                />
                                <div className="flex gap-1.5">
                                  <Button size="sm" disabled={pending} onClick={() => luuSua(tin.id)}>
                                    {t("saveEdit")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={pending}
                                    onClick={() => datDangSuaId(null)}
                                  >
                                    {t("cancelEdit")}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-[13px] leading-relaxed break-words whitespace-pre-wrap">
                                {tin.body}
                              </p>
                            )}

                            {dangSuaId !== tin.id && (
                              <NutTin
                                tin={tin}
                                cuaToi={tin.senderUserId === currentUserId}
                                nowMs={nowMs}
                                pending={pending}
                                onSua={() => {
                                  datDangSuaId(tin.id);
                                  datNhapSua(tin.body);
                                }}
                                onXoa={() => xoa(tin.id)}
                              />
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              <div ref={cuoiDanhSach} />
            </div>

            {canWrite ? (
              <div className="space-y-1.5 border-t px-3 py-2.5">
                <Textarea
                  value={nhap}
                  onChange={(e) => datNhap(e.target.value)}
                  placeholder={t("placeholder")}
                  maxLength={MAX_BODY_LENGTH}
                  rows={2}
                />
                {thanhVien.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <AtSign className="size-3 text-muted-foreground" />
                    {thanhVien
                      .filter((m) => m.userId !== currentUserId)
                      .map((m) => (
                        <button
                          key={m.userId}
                          type="button"
                          onClick={() =>
                            datNhap((cur) =>
                              cur.includes(`@${m.displayName}`)
                                ? cur
                                : `${cur}${cur && !cur.endsWith(" ") ? " " : ""}@${m.displayName} `,
                            )
                          }
                          className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted/60"
                        >
                          {m.displayName}
                        </button>
                      ))}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t("mentionNote")}
                  </p>
                  <Button
                    size="sm"
                    disabled={pending || !nhap.trim()}
                    onClick={gui}
                    className="max-md:min-h-11"
                  >
                    <Send className="size-4" />
                    {pending ? t("sending") : t("send")}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="border-t px-3 py-2.5 text-[11px] text-muted-foreground">
                {t("readOnly")}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/**
 * Nút Sửa/Xoá. "Sửa" chỉ hiện với TIN CỦA CHÍNH MÌNH và còn trong 15 phút.
 * Chủ tiệm cũng không sửa/xoá được tin người khác — chat là bằng chứng ai bảo
 * làm gì. Chốt thật nằm ở policy `chat_messages_update_own`; đây là mặt tiền.
 */
function NutTin({
  tin,
  cuaToi,
  nowMs,
  pending,
  onSua,
  onXoa,
}: {
  tin: ChatTin;
  cuaToi: boolean;
  nowMs: number;
  pending: boolean;
  onSua: () => void;
  onXoa: () => void;
}) {
  const t = useTranslations("chatRieng");
  if (!cuaToi || tin.deletedAt) return null;
  const conSuaDuoc = nowMs - new Date(tin.createdAt).getTime() < EDIT_WINDOW_MS;
  return (
    <div className="flex gap-2 pt-0.5">
      {conSuaDuoc && (
        <button
          type="button"
          disabled={pending}
          onClick={onSua}
          className="text-[11px] text-muted-foreground hover:text-foreground hover:underline disabled:opacity-60"
        >
          {t("edit")}
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={onXoa}
        className="text-[11px] text-muted-foreground hover:text-destructive hover:underline disabled:opacity-60"
      >
        {t("delete")}
      </button>
    </div>
  );
}

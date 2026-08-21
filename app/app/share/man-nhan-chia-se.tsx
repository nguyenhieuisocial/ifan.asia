"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Hash, Paperclip, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { guiTinChat } from "../chat/actions";
import { xepKenh } from "../chat/types";
import type { ChatKenh, ChatMember } from "../chat/types";
import { coDocDuoc, laAnh } from "../chat/tep-dinh-kem";

type TepChiaSe = {
  duongDan: string;
  ten: string;
  loai: string;
  co: number;
  xemTai: string | null;
};

/**
 * MÀN NHẬN NỘI DUNG CHIA SẺ — chọn kênh rồi gửi.
 *
 * ⚠️ Người dùng ĐANG DỞ MỘT VIỆC KHÁC (họ vừa ở album ảnh, hoặc vừa copy một
 *   đoạn chữ ở Zalo). Màn này phải xong trong MỘT lần bấm.
 *
 * ⚠️ Chọn sẵn kênh CẢ TIỆM. Phần lớn lượt chia sẻ là "cho mọi người xem cái
 *   này"; bắt chọn kênh mỗi lần là thêm một bước cho việc thường gặp nhất.
 */
export function ManNhanChiaSe({
  chu,
  soBo,
  coLoiDoc,
  tep,
  kenh,
  thanhVien,
  currentUserId,
}: {
  chu: string;
  soBo: number;
  coLoiDoc: boolean;
  tep: TepChiaSe[];
  kenh: ChatKenh[];
  thanhVien: ChatMember[];
  currentUserId: string;
}) {
  const t = useTranslations("share");
  const tChat = useTranslations("chatRieng");
  const router = useRouter();
  const [pending, batDau] = useTransition();

  const dsKenh = useMemo(() => xepKenh(kenh), [kenh]);
  const [chonKenh, datChonKenh] = useState<string | null>(
    dsKenh.find((c) => c.kind === "team")?.id ?? dsKenh[0]?.id ?? null,
  );
  const [loi, datLoi] = useState(chu);

  const tenNguoi = useMemo(
    () => new Map(thanhVien.map((m) => [m.userId, m.displayName])),
    [thanhVien],
  );

  function tenKenh(c: ChatKenh): string {
    if (c.kind === "team") return tChat("teamChannel");
    if (c.kind === "topic") return c.ten ?? tChat("unknownChannel");
    return c.doiPhuongTen ?? tenNguoi.get(c.doiPhuongUserId ?? "") ?? tChat("unknownChannel");
  }

  function gui() {
    if (!chonKenh) return;
    const body = loi.trim();
    if (!body && tep.length === 0) return;
    batDau(async () => {
      const res = await guiTinChat({
        channelId: chonKenh,
        body,
        tep: tep.length > 0 ? tep.map(({ duongDan, ten, loai, co }) => ({ duongDan, ten, loai, co })) : undefined,
      });
      if (res.error && res.error !== "mentionFailed") {
        toast.error(t("failed"));
        return;
      }
      toast.success(t("sent"));
      router.replace(`/app/chat?c=${chonKenh}`);
    });
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-[16px] font-semibold">{t("title")}</h1>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {coLoiDoc && (
        <p className="rounded-md border border-dashed p-3 text-[12px] text-muted-foreground">
          {t("readError")}
        </p>
      )}

      {/* Thấy NGAY thứ mình vừa chia sẻ. Không thấy thì người ta không chắc là
          app đã nhận được và sẽ chia sẻ lại lần nữa. */}
      {tep.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {tep.map((x) => (
            <li key={x.duongDan}>
              {laAnh(x.loai) && x.xemTai ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={x.xemTai}
                  alt={x.ten}
                  className="max-h-40 rounded-md border object-cover"
                />
              ) : (
                <span className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[12px]">
                  <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="max-w-40 truncate">{x.ten}</span>
                  <span className="shrink-0 text-muted-foreground">{coDocDuoc(x.co)}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {soBo > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-[12px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {t("skipped", { count: soBo })}
        </p>
      )}

      <div className="space-y-1.5">
        <label className="text-[12px] font-medium" htmlFor="loi-chia-se">
          {t("noteLabel")}
        </label>
        <Textarea
          id="loi-chia-se"
          value={loi}
          onChange={(e) => datLoi(e.target.value)}
          placeholder={t("notePlaceholder")}
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-[12px] font-medium">{t("channelLabel")}</p>
        <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border p-1">
          {dsKenh.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => datChonKenh(c.id)}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2 rounded px-2 text-left text-[13px] max-md:min-h-11",
                  chonKenh === c.id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {c.kind === "dm" ? (
                  <User className="size-3.5 shrink-0 opacity-70" />
                ) : (
                  <Hash className="size-3.5 shrink-0 opacity-70" />
                )}
                <span className="min-w-0 flex-1 truncate">{tenKenh(c)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Button
        onClick={gui}
        disabled={pending || !chonKenh || (!loi.trim() && tep.length === 0)}
        className="w-full gap-1.5 max-md:min-h-12"
      >
        <Send className="size-4" />
        {pending ? t("sending") : t("send")}
      </Button>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t("note", { ai: tenNguoi.get(currentUserId) ?? "" })}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Search, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

type Props = {
  value: string | null;
  /** Tên người giới thiệu đang gắn (mode sửa) — để khỏi query lại chỉ để hiện tên. */
  selectedName?: string;
  /** Khách đang sửa — không cho tự chọn chính mình. */
  excludeId?: string | null;
  onChange: (contactId: string | null, name: string) => void;
};

/**
 * Ô chọn NGƯỜI GIỚI THIỆU cho form khách.
 *
 * Cùng khuôn với `company-picker.tsx`, KHÁC một điểm cố ý: **không có nút tạo
 * nhanh**. Người giới thiệu phải là khách đã có trong tiệm — cho tạo nhanh ở
 * đây nghĩa là mở đường bịa một cái tên rồi tự nhận thưởng.
 *
 * ⚠️ **Đã cân nhắc gộp ba ô chọn làm một, và quyết định KHÔNG** (21/08).
 * Kho có ba ô chọn cùng khuôn: ô này, `company-picker.tsx`, và `ContactPicker`
 * trong hộp đặt lịch. Chúng giống nhau ở phần khung (ô tìm · chờ 300ms · danh
 * sách · chọn) nhưng khác nhau ở đúng những chỗ quan trọng:
 *   · ô công ty CÓ nút tạo nhanh — ô này CỐ Ý không (xem ngay trên)
 *   · ô này loại trừ chính khách đang sửa, hai ô kia không cần
 *   · ba ô trả về ba hình dữ liệu khác nhau
 * Gộp lại sẽ ra một component nhận bốn năm tuỳ chọn để bật/tắt từng khác biệt
 * — khó đọc hơn hẳn ba bản ngắn, và mỗi lần thêm chỗ dùng thứ tư lại thêm một
 * tuỳ chọn nữa. Ba bản ngắn mà rõ tốt hơn một bản chung mà rối.
 *
 * Cái giá đã biết và chấp nhận: sửa khung ở một chỗ thì hai chỗ kia không theo.
 * Nếu ngày nào phải sửa cùng một thứ ở cả ba lần thứ hai, hãy gộp lúc đó — khi
 * đã biết CHÍNH XÁC phần chung là gì, thay vì đoán trước.
 *
 * Chốt thật vẫn nằm ở cơ sở dữ liệu (ràng buộc không tự giới thiệu chính mình,
 * và mỗi khách mới chỉ sinh thưởng đúng một lần — migration #300). Ô này chỉ
 * là phép lịch sự với người dùng.
 */
/** Số người hiện ra trong danh sách gợi ý. Gõ thêm chữ để thu hẹp. */
const TRAN_HIEN = 20;

export function ReferrerPicker({ value, selectedName, excludeId, onChange }: Props) {
  const t = useTranslations("contacts.form");
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  const optionsQuery = useQuery({
    queryKey: ["referrer-options", debouncedQ],
    queryFn: async () => {
      let req = supabase
        .from("contacts")
        .select("id, full_name, phone")
        .is("deleted_at", null)
        .order("full_name")
        // ⚠️ Xin DƯ MỘT dòng so với số hiện ra. Chỉ có cách đó mới biết được
        //   "đúng 20" hay "còn nữa" — cổng API cắt im lặng, không báo gì.
        .limit(TRAN_HIEN + 1);
      if (debouncedQ.trim()) req = req.ilike("full_name", `%${debouncedQ.trim()}%`);
      const { data, error } = await req;
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; full_name: string | null; phone: string | null }[];
    },
    enabled: !value,
  });
  const tatCa = (optionsQuery.data ?? []).filter((o) => o.id !== excludeId);
  const conNua = tatCa.length > TRAN_HIEN;
  const options = tatCa.slice(0, TRAN_HIEN);

  if (value) {
    return (
      <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input px-3 text-sm max-md:h-11">
        <span className="flex min-w-0 items-center gap-2">
          <UserRound className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{selectedName || t("referrerUnnamed")}</span>
        </span>
        {/* Chữ "Đổi" là NÚT — cao bằng cả ô để ngón tay với tới (44px). */}
        <button
          type="button"
          className="shrink-0 text-xs font-medium text-primary hover:underline max-md:flex max-md:h-11 max-md:items-center"
          onClick={() => onChange(null, "")}
        >
          {t("referrerChange")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("referrerSearchPlaceholder")}
          className="pl-8"
        />
      </div>
      <ul className="max-h-36 divide-y overflow-y-auto rounded-md border">
        {optionsQuery.isPending ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">{t("referrerLoading")}</li>
        ) : options.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">{t("referrerEmpty")}</li>
        ) : (
          options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onChange(o.id, o.full_name ?? "")}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 max-md:min-h-11"
              >
                <span className="truncate">{o.full_name || t("referrerUnnamed")}</span>
                {o.phone && <span className="shrink-0 text-xs text-muted-foreground">{o.phone}</span>}
              </button>
            </li>
          ))
        )}
      </ul>
      {/* ⚠️ Nói ra khi danh sách bị cắt. Không nói thì người ta cuộn tới cuối,
          không thấy tên cần tìm, và kết luận "khách đó chưa có trong hệ
          thống" — rồi tạo trùng một hồ sơ khách. */}
      {conNua && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t("referrerMore", { count: TRAN_HIEN })}
        </p>
      )}
    </div>
  );
}

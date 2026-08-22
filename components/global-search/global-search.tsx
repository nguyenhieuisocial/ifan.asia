"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Handshake,
  Inbox,
  Plus,
  Search,
  Settings2,
  SquarePen,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useBoiCanhBangLenh } from "./boi-canh";
import { ghiVuaDung, locLenh, useBoLenh, type Lenh } from "./lenh";
import {
  fetchGlobalSearch,
  type GlobalSearchEntityType,
  type GlobalSearchRow,
} from "./queries";

/**
 * BẢNG LỆNH (Ctrl K) — thẻ design `man-bang-lenh.html`.
 *
 * Trước 22/08 đây chỉ là một Ô TÌM: gõ ra khách, hội thoại, cơ hội — hết. Muốn
 * sang màn Lịch, muốn tạo đơn, muốn đổi nền tối thì vẫn phải rời bàn phím đi
 * tìm menu. Và ngay trong ô đó cũng không bấm được mũi tên lên xuống: thấy kết
 * quả rồi vẫn phải với tay ra chuột. Giờ nó vừa tìm dữ liệu, vừa đi tới màn,
 * vừa làm được vài việc — trọn vòng bằng bàn phím.
 *
 * ⚠️ MỌI DÒNG HIỆN RA ĐỀU NẰM TRONG MỘT DANH SÁCH PHẲNG `dongs`, kể cả khi màn
 *   hình chia thành nhiều nhóm. Đây là chỗ dễ làm hỏng nhất: nếu vẽ theo nhóm
 *   rồi đếm chỉ số theo nhóm, mũi tên xuống tới cuối nhóm sẽ nhảy sai chỗ hoặc
 *   đứng lại. Một danh sách phẳng ⇒ một chỉ số ⇒ không có chỗ để lệch.
 */

const GROUP_ORDER: GlobalSearchEntityType[] = ["contact", "conversation", "deal"];

const GROUP_ICON: Record<GlobalSearchEntityType, typeof Users> = {
  contact: Users,
  conversation: Inbox,
  deal: Handshake,
};

/** Tối đa mỗi nhóm lệnh khi đang gõ — để phần dữ liệu thật không bị đẩy khỏi tầm mắt. */
const TOI_DA_MOI_NHOM_LENH = 5;

function rowHref(row: GlobalSearchRow): string {
  switch (row.entity_type) {
    case "contact":
      return `/app/contacts/${row.entity_id}`;
    case "conversation":
      return `/app/inbox?c=${row.entity_id}`;
    case "deal":
      return `/app/deals/${row.entity_id}`;
  }
}

/** "Xem tất cả" — hội thoại chưa có bộ lọc ?q= trên URL nên dẫn thẳng vào hộp thư, không kèm query. */
function viewAllHref(type: GlobalSearchEntityType, query: string): string {
  switch (type) {
    case "contact":
      return `/app/contacts?q=${encodeURIComponent(query)}`;
    case "conversation":
      return "/app/inbox";
    case "deal":
      return `/app/deals?q=${encodeURIComponent(query)}`;
  }
}

/** Một dòng bấm được trong bảng — nhóm chỉ để VẼ, không dùng để đếm chỉ số. */
interface Dong {
  key: string;
  nhomNhan: string;
  Icon: typeof Users;
  nhan: string;
  phu?: string;
  chay: () => void;
}

function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("search");
  const router = useRouter();
  const { role, pack, coBan } = useBoiCanhBangLenh();
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [chon, datChon] = useState(0);
  const dsRef = useRef<HTMLDivElement>(null);

  const boLenh = useBoLenh(role, pack, coBan ?? true);

  // Dialog đóng thì xóa sạch — mở lại lần sau không còn thấy câu tìm cũ. Tính
  // trong lúc render (mẫu React "Adjusting state when a prop changes"), không
  // dùng effect để khỏi cascading render.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setQ("");
      setDebouncedQ("");
      datChon(0);
    }
  }

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  const trimmed = debouncedQ.trim();
  const resultsQuery = useQuery({
    queryKey: ["global-search", trimmed],
    queryFn: () => fetchGlobalSearch(supabase, trimmed),
    enabled: trimmed !== "",
  });
  const rows = resultsQuery.data ?? [];

  const chayLenh = (l: Lenh) => {
    ghiVuaDung(l.id);
    onOpenChange(false);
    if (l.href) router.push(l.href);
    else l.chay?.();
  };

  const dongLenh = (l: Lenh, nhomNhan: string): Dong => ({
    key: l.id,
    nhomNhan,
    Icon: l.loai === "man" ? ArrowRight : l.loai === "viec" ? SquarePen : Settings2,
    nhan: l.nhan,
    chay: () => chayLenh(l),
  });

  /**
   * DANH SÁCH PHẲNG — thứ tự đúng thứ tự mắt đọc từ trên xuống.
   *
   * Chưa gõ gì: Vừa dùng → Việc thường làm.
   * Đang gõ  : Lệnh → Đi tới màn → Khách → Hội thoại → Cơ hội.
   *
   * Lệnh và tên màn xếp TRÊN dữ liệu vì gõ ngắn thường là muốn đi đâu đó, chứ
   * không phải tra một cái tên. Gõ dài thì phần dữ liệu tự nhiều lên và đẩy
   * mình xuống — không cần luật riêng.
   */
  const dongs = useMemo((): Dong[] => {
    if (trimmed === "") {
      return [
        ...boLenh.vuaDung.map((l) => dongLenh(l, t("lenh.nhomVuaDung"))),
        ...boLenh.viecThuongLam.map((l) => dongLenh(l, t("lenh.nhomThuongLam"))),
      ];
    }
    const khop = locLenh(boLenh.tatCa, trimmed);
    const lenhChung = khop.filter((l) => l.loai !== "man").slice(0, TOI_DA_MOI_NHOM_LENH);
    const lenhMan = khop.filter((l) => l.loai === "man").slice(0, TOI_DA_MOI_NHOM_LENH);
    return [
      ...lenhChung.map((l) => dongLenh(l, t("lenh.nhomLenh"))),
      ...lenhMan.map((l) => dongLenh(l, t("lenh.nhomDiToi"))),
      ...GROUP_ORDER.flatMap((type) =>
        rows
          .filter((r) => r.entity_type === type)
          .map((r) => ({
            key: `${type}:${r.entity_id}`,
            nhomNhan: t(`groups.${type}`),
            Icon: GROUP_ICON[type],
            nhan: r.title,
            phu: r.subtitle ?? undefined,
            chay: () => {
              onOpenChange(false);
              router.push(rowHref(r));
            },
          })),
      ),
    ];
    // `chayLenh`/`dongLenh` dựng mới mỗi lần render nhưng chỉ đọc router + boLenh
    // — liệt kê chúng vào đây sẽ làm useMemo vô tác dụng.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, rows, boLenh, t]);

  // Danh sách đổi (gõ thêm chữ, kết quả về) thì con trỏ về đầu — giữ chỉ số cũ
  // sẽ trỏ vào một dòng khác hẳn, và Enter mở nhầm thứ.
  //
  // Chỉnh NGAY TRONG LÚC RENDER (mẫu React "Adjusting state when a prop
  // changes"), không dùng effect: đặt trong effect thì React vẽ xong một lượt
  // với dòng chọn CŨ rồi mới vẽ lại — nháy một cái, và trong khoảnh khắc đó
  // bấm Enter là mở nhầm.
  const soDong = dongs.length;
  const dauMoi = `${trimmed}|${soDong}`;
  const [dauCu, datDauCu] = useState(dauMoi);
  if (dauCu !== dauMoi) {
    datDauCu(dauMoi);
    datChon(0);
  }

  // Kéo dòng đang chọn vào tầm nhìn — đi bằng mũi tên tới dòng thứ 12 mà nó nằm
  // dưới mép hộp thì người dùng thấy như bảng bị treo.
  useEffect(() => {
    dsRef.current
      ?.querySelector(`[data-chi-so="${chon}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [chon]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (soDong === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      datChon((i) => (i + 1) % soDong);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      datChon((i) => (i - 1 + soDong) % soDong);
    } else if (e.key === "Enter") {
      e.preventDefault();
      dongs[chon]?.chay();
    }
  };

  const dangCho = trimmed !== "" && resultsQuery.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("placeholder")}
            className="pl-8"
            // Trình đọc màn hình đọc theo dòng ĐANG CHỌN chứ không theo con trỏ
            // chuột — thiếu ba thuộc tính này thì người mù bấm mũi tên mà không
            // nghe thấy gì đổi.
            role="combobox"
            aria-expanded={soDong > 0}
            aria-controls="bang-lenh-ds"
            aria-activedescendant={soDong > 0 ? `bang-lenh-d-${chon}` : undefined}
          />
        </div>
        <div ref={dsRef} id="bang-lenh-ds" role="listbox" className="max-h-[55vh] overflow-y-auto">
          {dangCho && soDong === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : soDong === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                {trimmed === "" ? t("hint") : t("empty", { query: trimmed })}
              </p>
              {trimmed !== "" && (
                <Button
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    router.push(`/app/contacts?new=${encodeURIComponent(trimmed)}`);
                  }}
                >
                  <Plus className="size-4" />
                  {t("emptyCta", { query: trimmed })}
                </Button>
              )}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {dongs.map((d, i) => (
                <li key={d.key}>
                  {/* Tiêu đề nhóm in ra Ở TRONG danh sách phẳng, ngay trước dòng
                      đầu của nhóm — vẽ theo nhóm lồng nhau sẽ phải đếm chỉ số
                      hai tầng, đúng chỗ dễ lệch nhất. */}
                  {(i === 0 || dongs[i - 1].nhomNhan !== d.nhomNhan) && (
                    <p className="px-1 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                      {d.nhomNhan}
                    </p>
                  )}
                  <button
                    type="button"
                    id={`bang-lenh-d-${i}`}
                    data-chi-so={i}
                    role="option"
                    aria-selected={i === chon}
                    onClick={d.chay}
                    onMouseMove={() => datChon(i)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                      i === chon && "bg-muted",
                    )}
                  >
                    <d.Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">{d.nhan}</span>
                    {d.phu && (
                      <span className="shrink-0 text-xs text-muted-foreground">{d.phu}</span>
                    )}
                  </button>
                </li>
              ))}
              {/* Cắt ở 5 dòng/loại (RPC đã LIMIT 5) — không biết chính xác còn
                  bao nhiêu nữa nên dẫn thẳng vào màn danh sách, không đoán số. */}
              {GROUP_ORDER.filter(
                (type) => rows.filter((r) => r.entity_type === type).length === 5,
              ).map((type) => (
                <li key={`all:${type}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      router.push(viewAllHref(type, trimmed));
                    }}
                    className="px-2 py-1 text-xs font-medium text-primary hover:underline"
                  >
                    {t("viewAll")} · {t(`groups.${type}`)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* Gợi ý phím — chỉ máy tính. Điện thoại không có bàn phím rời, in ra
            chỉ chiếm chỗ của đúng thứ người ta đang tìm. */}
        <p className="hidden gap-3 border-t pt-2 text-[11px] text-muted-foreground sm:flex">
          <span>
            <kbd className="rounded border px-1">↑</kbd>
            <kbd className="ml-0.5 rounded border px-1">↓</kbd> {t("lenh.phimChon")}
          </span>
          <span>
            <kbd className="rounded border px-1">↵</kbd> {t("lenh.phimMo")}
          </span>
          <span>
            <kbd className="rounded border px-1">esc</kbd> {t("lenh.phimDong")}
          </span>
        </p>
      </DialogContent>
    </Dialog>
  );
}

/** Nút mở tìm kiếm ở thanh trên cùng (mục 36.8-4) — desktop nút rộng có gợi ý
 *  phím tắt, mobile chỉ một icon nhỏ (không nhồi thêm ô vào thanh đã chật). */
export function GlobalSearchHeaderTrigger() {
  const t = useTranslations("search");
  const { bat } = useBoiCanhBangLenh();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Công tắc tắt thì GỠ LUÔN phím tắt, không chỉ giấu nút. Giấu nút mà Ctrl K
    // vẫn mở được là tắt nửa vời — và nửa còn lại đúng là nửa đang gây lỗi.
    if (!bat) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [bat]);

  if (!bat) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden w-56 justify-start gap-2 text-muted-foreground sm:flex"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate text-left">{t("placeholder")}</span>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
          Ctrl K
        </kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={t("title")}
        className="sm:hidden"
      >
        <Search className="size-4" />
      </Button>
      <GlobalSearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Ô tìm đầy đủ trong nội dung màn "Hôm nay" (mục 36.8-4) — chỉ hiện trên
 *  điện thoại, nơi thanh trên cùng không đủ chỗ cho một ô tìm thật sự. */
export function GlobalSearchInlineBox() {
  const t = useTranslations("search");
  const { bat } = useBoiCanhBangLenh();
  const [open, setOpen] = useState(false);

  if (!bat) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-left text-sm text-muted-foreground shadow-xs sm:hidden"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">{t("placeholder")}</span>
      </button>
      <GlobalSearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

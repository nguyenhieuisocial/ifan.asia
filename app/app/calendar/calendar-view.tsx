"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Calendar,
  ChevronLeft,
  Eye,
  ChevronRight,
  Inbox,
  Minus,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InternalChat } from "@/components/internal-chat/internal-chat";
import { cn } from "@/lib/utils";
import { WEEKDAY_SHORT_VN } from "@/lib/format";
import {
  addDaysToDateKey,
  buildZonedIso,
  formatMinuteLabel,
  minutesOfDayInTimeZone,
} from "@/lib/booking/schedule";
import { freeBlocksOfDay } from "./queries";
import type { Appointment, CalendarBundle, CalendarDay, CheDoXem, ChonOTrong } from "./types";
import { CHE_DO_XEM, MAU_DA_HUY, mauCuaTho } from "./types";
import { markArrived, markDone, markNoShow, rescheduleAppointment } from "./actions";
import { ARRIVABLE_STATUSES, COMPLETABLE_STATUSES, EDITABLE_STATUSES, toastKeyFor } from "./types";
import { AppointmentDialog } from "./appointment-dialog";
import { useVuotDoiNgay } from "./vuot-doi-ngay";
import { CancelDialog } from "./cancel-dialog";
import { TimeGrid } from "./time-grid";
import { MonthGrid } from "./month-grid";
import { StaffGrid } from "./staff-grid";
import { YearGrid } from "./year-grid";
import { MiniCalendar } from "./mini-calendar";
import { useCaiDatHienThi, useCaoGio, useTapAn } from "./nho-tren-may";
import { BANG_PHIM, usePhimTat } from "./phim-tat";

/**
 * Nút thu nhỏ / phóng to lưới giờ.
 *
 * ⚠️ PHẢI CÓ CẢ TRÊN ĐIỆN THOẠI. Bản trước nằm trong nhóm `hidden md:flex` nên
 *   điện thoại KHÔNG thu phóng được bằng bất kỳ cách nào — mà điện thoại mới là
 *   nơi màn hẹp nhất và cần thu phóng nhất. Chụm hai ngón đã có, nhưng thợ đeo
 *   găng hoặc tay ướt thì chụm không ăn, lúc đó nút là đường duy nhất.
 */
function NutThuPhong({
  cheDo,
  caoGio,
  dienThoai = false,
}: {
  cheDo: CheDoXem;
  caoGio: { doiMuc: (b: 1 | -1) => void; conToDuoc: boolean; conNhoDuoc: boolean };
  dienThoai?: boolean;
}) {
  const t = useTranslations("calendar");
  // Chỉ các chế độ CÓ lưới giờ mới thu phóng được.
  if (cheDo !== "ngay" && cheDo !== "tuan" && cheDo !== "tho" && cheDo !== "phong") return null;
  const oNut = dienThoai
    ? "flex size-9 items-center justify-center rounded text-muted-foreground disabled:opacity-40"
    : "flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40";
  return (
    <div className={cn("flex shrink-0 rounded-md border p-0.5", dienThoai && "h-10")}>
      <button
        type="button"
        onClick={() => caoGio.doiMuc(-1)}
        disabled={!caoGio.conNhoDuoc}
        aria-label={t("zoom.out")}
        title={t("zoom.out")}
        className={oNut}
      >
        <Minus className={dienThoai ? "size-4" : "size-3.5"} />
      </button>
      <button
        type="button"
        onClick={() => caoGio.doiMuc(1)}
        disabled={!caoGio.conToDuoc}
        aria-label={t("zoom.in")}
        title={t("zoom.in")}
        className={oNut}
      >
        <Plus className={dienThoai ? "size-4" : "size-3.5"} />
      </button>
    </div>
  );
}

function dateLabel(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${Number(d)}/${Number(m)}`;
}

/** Bước nhảy của hai mũi tên, theo chế độ đang xem. */
function buocNhay(cheDo: CheDoXem): number {
  if (cheDo === "tuan") return 7;
  if (cheDo === "thang") return 30;
  if (cheDo === "nam") return 365;
  if (cheDo === "ds") return 30;
  return 1;
}

export function CalendarView({
  bundle,
  focusDateKey,
  todayKey,
  cheDo,
  tuKhoa,
  ketQuaTim,
  demNam,
  currentUserId,
  canAssignOthers,
  canManageAll,
  canWrite,
  moTraoDoiId = null,
}: {
  bundle: CalendarBundle;
  focusDateKey: string;
  todayKey: string;
  cheDo: CheDoXem;
  tuKhoa: string;
  /**
   * Kết quả tìm trên TOÀN BỘ lịch sử — `null` khi không đang tìm.
   * `daCat` = còn kết quả nữa nhưng đã cắt bớt; màn hình PHẢI nói ra, nếu
   * không người ta tin là tiệm chỉ có đúng ngần đó buổi.
   */
  ketQuaTim: { daCat: boolean; ketQua: Appointment[] } | null;
  /**
   * Số ca theo từng ngày của cả năm — CHỈ có ở chế độ Năm.
   * Truyền dạng mảng cặp chứ không phải `Map`: dữ liệu đi từ máy chủ sang trình
   * duyệt phải chuyển được thành JSON, mà `Map` thì không.
   */
  demNam: [string, number][] | null;
  currentUserId: string;
  canAssignOthers: boolean;
  canManageAll: boolean;
  /** Khớp RLS appointments_insert — mọi vai TRỪ viewer. */
  canWrite: boolean;
  /**
   * Mã buổi hẹn mà thông báo gọi tên vừa dẫn tới (`?a=`, migration #294). Buổi
   * đó được mở sẵn bảng chi tiết cùng khung trao đổi — thẻ man-chat-noi-bo hứa
   * "bấm vào là mở thẳng, không phải đi tìm".
   */
  moTraoDoiId?: string | null;
}) {
  const t = useTranslations("calendar");
  const tError = useTranslations("calendar.error");
  const tCommon = useTranslations("common");
  const router = useRouter();

  /**
   * `?tao=1` mo san hop Dat lich.
   *
   * Loi vao tu BANG LENH (Ctrl K, the design man-bang-lenh.html): lenh "Dat
   * lich cho khach" phai mo ra o dien, chu khong phai tha nguoi dung xuong man
   * Lich roi de ho tu di tim nut. Doc MOT LAN luc dung (lazy initializer) chu
   * khong theo doi tiep — dong hop roi ma van con ?tao=1 tren thanh dia chi thi
   * moi lan render lai se bat hop mo lai.
   */
  const spDauVao = useSearchParams();
  const [addOpen, setAddOpen] = useState(() => spDauVao.get("tao") === "1");
  const [gioDienSan, datGioDienSan] = useState<{
    dateKey: string;
    time: string;
    /** Kéo một khoảng thì độ dài lấy đúng khoảng đó, không lấy mặc định 30′. */
    phut?: number;
    /** Bấm ô trống trong cột của một thợ ⇒ chọn sẵn đúng thợ đó. */
    employeeId?: string;
  } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Appointment | null>(null);
  /**
   * Buổi hẹn đang được NHÂN BẢN — điền sẵn mọi trường nhưng lưu ra một buổi
   * MỚI. Cũng là đường "đặt lại" cho một ca đã huỷ: giữ nguyên bản ghi huỷ
   * (cùng lý do huỷ, vốn chảy vào báo cáo) và tạo một buổi mới bên cạnh.
   */
  const [nhanBan, datNhanBan] = useState<Appointment | null>(null);
  const [chonCaId, datChonCaId] = useState<string | null>(moTraoDoiId);
  const [oTim, datOTim] = useState(tuKhoa);
  const [hienLoc, datHienLoc] = useState(false);
  /** Ô tìm trên điện thoại chiếm chỗ của dải chế độ — bật thì dải ẩn đi. */
  const [hienTim, datHienTim] = useState(tuKhoa.length > 0);
  const [hopToiNgay, datHopToiNgay] = useState(false);
  const [hopPhim, datHopPhim] = useState(false);
  const [hopHienThi, datHopHienThi] = useState(false);
  /**
   * Việc dời giờ gần nhất — để bấm `z` hoặc nút "Hoàn tác" là trả lại như cũ.
   *
   * ⚠️ CHỈ hoàn tác được việc DỜI GIỜ, cố ý. Các phép đổi trạng thái (khách đã
   *   tới · xong · không tới · huỷ) là ĐƯỜNG MỘT CHIỀU trong máy trạng thái, và
   *   phải giữ nguyên như vậy: nút "Xong" còn phát phiếu đánh giá gửi khách,
   *   nên "hoàn tác Xong" nghĩa là đã hỏi một người "hài lòng chứ" rồi rút lại.
   *   Nới máy trạng thái ra chỉ để có nút hoàn tác là đổi một thứ đúng lấy một
   *   thứ tiện.
   */
  const [vuaDoiGio, datVuaDoiGio] = useState<{
    caId: string;
    startAt: string;
    endAt: string;
  } | null>(null);
  /** Mã thợ / phòng đang TẮT — tắt là ẩn ca của họ khỏi lưới. */
  const { an, batTat, chiHien, hienHet } = useTapAn();
  const caoGio = useCaoGio();

  /**
   * Ô TRỐNG ĐANG ĐƯỢC CHỌN — bước đệm giữa "bấm vào lưới" và "mở hộp thoại".
   *
   * ⚠️ Trước đây một cú bấm mở thẳng hộp thoại "Thêm lịch". Người dùng bấm vào
   *   lưới hàng trăm lần một ngày CHỈ ĐỂ NHÌN, và mỗi lần bấm nhầm là một hộp
   *   thoại che kín màn phải đóng đi mới xem tiếp được. Founder gọi đúng tên:
   *   sai UX vì bất tiện.
   *
   * Nay: bấm một lần chỉ CHỌN và hiện một bong bóng nhỏ. Muốn tạo thì bấm nút
   * trong bong bóng, hoặc Enter, hoặc bấm hai lần. Kéo để tạo vẫn giữ nguyên —
   * kéo là ý định rõ ràng, không ai kéo nhầm.
   */
  const [oTrongDangChon, datOTrongDangChon] = useState<ChonOTrong | null>(null);

  const moThemLich = useCallback(
    (o: { dateKey: string; phut: number; employeeId?: string | null }) => {
      datGioDienSan({
        dateKey: o.dateKey,
        time: formatMinuteLabel(o.phut),
        employeeId: o.employeeId ?? undefined,
      });
      setAddOpen(true);
      datOTrongDangChon(null);
    },
    [],
  );

  const bamOTrong = useCallback(
    (o: ChonOTrong) => {
      if (o.moNgay) moThemLich(o);
      else datOTrongDangChon(o);
    },
    [moThemLich],
  );

  // Esc bỏ chọn, Enter tạo lịch ở ô đang chọn.
  useEffect(() => {
    if (!oTrongDangChon) return;
    const nghe = (e: KeyboardEvent) => {
      if (e.key === "Escape") datOTrongDangChon(null);
      else if (e.key === "Enter") {
        e.preventDefault();
        moThemLich(oTrongDangChon);
      }
    };
    window.addEventListener("keydown", nghe);
    return () => window.removeEventListener("keydown", nghe);
  }, [oTrongDangChon, moThemLich]);
  const { caiDat, doi: doiCaiDat } = useCaiDatHienThi();

  const thuTuTho = useMemo(
    () => new Map(bundle.staff.map((s, i) => [s.employeeId, i])),
    [bundle.staff],
  );
  const tenTho = useMemo(
    () => new Map(bundle.staff.map((s) => [s.employeeId, s.displayName])),
    [bundle.staff],
  );

  /**
   * Ngày đã lọc — MỘT chỗ duy nhất, để mọi chế độ xem cùng thấy một tập.
   *
   * ⚠️ Ẩn ngày cuối tuần chỉ áp ở chế độ TUẦN và THÁNG. Ở chế độ Ngày mà người
   *   ta bấm thẳng vào Chủ nhật thì phải thấy Chủ nhật — ẩn đi là màn trắng
   *   không lý do.
   */
  const days: CalendarDay[] = useMemo(() => {
    let ds = bundle.days;
    if (!caiDat.cuoiTuan && (cheDo === "tuan" || cheDo === "thang")) {
      ds = ds.filter((d) => d.weekday !== 0 && d.weekday !== 6);
    }
    if (an.size > 0 || !caiDat.hienDaHuy) {
      ds = ds.map((d) => ({
        ...d,
        appointments: d.appointments.filter(
          (a) =>
            !(a.staffEmployeeId && an.has(a.staffEmployeeId)) &&
            !(a.resourceId && an.has(a.resourceId)) &&
            (caiDat.hienDaHuy || (a.status !== "cancelled" && a.status !== "no_show")),
        ),
      }));
    }
    return ds;
  }, [bundle.days, an, caiDat.cuoiTuan, caiDat.hienDaHuy, cheDo]);

  const day = days.find((d) => d.dateKey === focusDateKey) ?? days[0];

  /** Ca đang mở bảng chi tiết — tìm cả trong kết quả tìm kiếm. */
  const chonCa = useMemo(() => {
    if (!chonCaId) return null;
    for (const d of days) {
      const x = d.appointments.find((a) => a.id === chonCaId);
      if (x) return x;
    }
    return ketQuaTim?.ketQua.find((a) => a.id === chonCaId) ?? null;
  }, [chonCaId, days, ketQuaTim]);

  function diTo(sua: Record<string, string | null>) {
    const p = new URLSearchParams();
    p.set("date", sua.date ?? focusDateKey);
    p.set("v", sua.v ?? cheDo);
    const q = sua.q === undefined ? tuKhoa : sua.q;
    if (q) p.set("q", q);
    router.push(`/app/calendar?${p.toString()}`);
  }

  /**
   * Thả một ca xuống giờ mới (hoặc kéo mép đổi độ dài).
   *
   * ⚠️ KHÔNG tự kiểm trùng giờ ở đây. Hai ràng buộc EXCLUDE trong cơ sở dữ liệu
   *   (#83) là chốt thật, và `rescheduleAppointment` còn lọc theo tập trạng
   *   thái còn-sửa-được. Thả nhầm chỗ thì máy chủ từ chối và câu báo nói rõ là
   *   trùng người hay trùng phòng — đúng thứ người dùng cần biết.
   */
  async function doiGioBangKeo(
    caId: string,
    dateKey: string,
    phutDau: number,
    phutCuoi: number,
  ) {
    // Ghi lại giờ CŨ TRƯỚC khi đổi — sau khi đổi thì không còn chỗ nào đọc ra
    // được nữa, và lúc đó nút Hoàn tác chỉ là một cái nút không làm gì.
    const truoc = timCa(caId);
    const res = await rescheduleAppointment({
      id: caId,
      startAt: buildZonedIso(dateKey, formatMinuteLabel(phutDau), bundle.timezone),
      endAt: buildZonedIso(dateKey, formatMinuteLabel(phutCuoi), bundle.timezone),
    });
    if (res.error) {
      toast.error(tError(toastKeyFor(res.error)));
      return;
    }
    if (truoc) datVuaDoiGio({ caId, startAt: truoc.startAt, endAt: truoc.endAt });
    toast.success(t("moved", { time: formatMinuteLabel(phutDau) }), {
      action: truoc
        ? { label: t("undo"), onClick: () => hoanTacDoiGio(caId, truoc.startAt, truoc.endAt) }
        : undefined,
    });
    router.refresh();
  }

  function timCa(caId: string): Appointment | null {
    for (const d of days) {
      const x = d.appointments.find((a) => a.id === caId);
      if (x) return x;
    }
    return null;
  }

  async function hoanTacDoiGio(caId: string, startAt: string, endAt: string) {
    const res = await rescheduleAppointment({ id: caId, startAt, endAt });
    if (res.error) {
      toast.error(tError(toastKeyFor(res.error)));
      return;
    }
    datVuaDoiGio(null);
    toast.success(t("undone"));
    router.refresh();
  }

  async function handleStatus(id: string, action: "arrived" | "done" | "no_show") {
    const fn = action === "arrived" ? markArrived : action === "done" ? markDone : markNoShow;
    const res = await fn(id);
    if (res.error) {
      toast.error(tError(toastKeyFor(res.error)));
      return;
    }
    toast.success(t("statusUpdated"));
  }

  // ⚠️ Tắt phím tắt khi có hộp thoại đang mở: lúc đó `Esc` phải đóng hộp chứ
  //   không phải đóng bảng chi tiết, và `c` phải gõ được vào ô nhập.
  /**
   * VUỐT NGANG ĐỔI NGÀY (thẻ `man-thao-tac-kieu-app`) — dùng LẠI đúng hai việc
   * của phím `j`/`k` ngay dưới đây, không viết luật thứ hai. Chỉ bật ở chế độ
   * xem theo NGÀY và THỢ/PHÒNG: ở chế độ tháng và năm, "ngày sau" không phải
   * thứ người dùng đang nghĩ tới khi vuốt.
   */
  const vungLuoiRef = useRef<HTMLDivElement | null>(null);
  useVuotDoiNgay(
    vungLuoiRef,
    useMemo(
      () => ({
        toi: () => diTo({ date: addDaysToDateKey(focusDateKey, buocNhay(cheDo)) }),
        lui: () => diTo({ date: addDaysToDateKey(focusDateKey, -buocNhay(cheDo)) }),
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [focusDateKey, cheDo],
    ),
    cheDo !== "nam" && cheDo !== "thang" && !addOpen && editTarget === null,
  );

  usePhimTat(
    {
      doiCheDo: (v) => diTo({ v }),
      homNay: () => diTo({ date: todayKey }),
      toi: () => diTo({ date: addDaysToDateKey(focusDateKey, buocNhay(cheDo)) }),
      lui: () => diTo({ date: addDaysToDateKey(focusDateKey, -buocNhay(cheDo)) }),
      toiNgay: () => datHopToiNgay(true),
      oTim: () => {
        datHienTim(true);
        // Ô tìm của bản máy tính luôn có mặt; của điện thoại vừa được bật lên.
        requestAnimationFrame(() => {
          document.querySelector<HTMLInputElement>('input[data-o-tim="1"]')?.focus();
        });
      },
      taoMoi: () => {
        if (!canWrite) return;
        datGioDienSan(null);
        setAddOpen(true);
      },
      suaCaDangChon: () => {
        if (chonCa && canWrite && EDITABLE_STATUSES.includes(chonCa.status)) setEditTarget(chonCa);
      },
      hoanTac: () => {
        if (vuaDoiGio) void hoanTacDoiGio(vuaDoiGio.caId, vuaDoiGio.startAt, vuaDoiGio.endAt);
        else toast.info(t("nothingToUndo"));
      },
      moBangPhim: () => datHopPhim(true),
      dong: () => {
        if (hopPhim) datHopPhim(false);
        else if (hopToiNgay) datHopToiNgay(false);
        else if (chonCaId) datChonCaId(null);
        else if (hienLoc) datHienLoc(false);
      },
    },
    !addOpen && editTarget === null && cancelTarget === null,
  );

  if (!day) return null;

  const dangTim = ketQuaTim !== null;
  // Cùng năm với hôm nay thì BỎ NĂM — cùng luật gọn của `formatDate`, và cùng
  // lý do: bốn ký tự thừa trên một thanh công cụ vốn đã chật ở khổ điện thoại.
  const namNay = focusDateKey.slice(0, 4) === todayKey.slice(0, 4);
  const nhanDai =
    cheDo === "nam"
      ? focusDateKey.slice(0, 4)
      : cheDo === "thang"
      ? namNay
        ? t("range.monthShort", { month: Number(focusDateKey.slice(5, 7)) })
        : t("range.month", { month: Number(focusDateKey.slice(5, 7)), year: focusDateKey.slice(0, 4) })
      : cheDo === "tuan"
        ? t("range.week", { from: dateLabel(days[0].dateKey), to: dateLabel(days[days.length - 1].dateKey) })
        : cheDo === "ds"
          ? t("range.list", { from: dateLabel(days[0].dateKey), to: dateLabel(days[days.length - 1].dateKey) })
          : focusDateKey === todayKey
            ? t("today")
            : `${WEEKDAY_SHORT_VN[day.weekday]} ${dateLabel(day.dateKey)}`;

  return (
    <div className="flex h-full flex-col">
      {/* ── Thanh trên ────────────────────────────────────────────────
          MỘT hàng trên máy tính, HAI hàng trên điện thoại.
          ⚠️ Nhồi một hàng ở 375px cho ra 501px nội dung — đo được trên bản
            chạy 21/08: nút "Thêm lịch" và "Xuất CSV" bị đẩy hẳn ra ngoài màn,
            không ai bấm được và cũng không có dấu hiệu gì là chúng tồn tại.
            Đây là loại lỗi chỉ lộ ra khi ĐO, không lộ khi đọc code. */}
      <div className="border-b">
        <div className="flex items-center gap-1.5 px-3 py-2 md:px-4">
          <Calendar className="size-4 shrink-0 text-muted-foreground" />
          <h1 className="mr-1 text-[14px] font-semibold">{t("title")}</h1>

          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 px-2.5 text-[12px] max-md:min-h-10"
            onClick={() => diTo({ date: todayKey })}
          >
            {t("today")}
          </Button>
          <div className="flex shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 max-md:size-10"
              onClick={() => diTo({ date: addDaysToDateKey(focusDateKey, -buocNhay(cheDo)) })}
              aria-label={t("nav.prev")}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 max-md:size-10"
              onClick={() => diTo({ date: addDaysToDateKey(focusDateKey, buocNhay(cheDo)) })}
              aria-label={t("nav.next")}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <span className="min-w-0 truncate text-[13px] font-medium max-md:ml-auto">
            {nhanDai}
          </span>

          {/* Nhóm bên phải — chỉ máy tính. Điện thoại đẩy xuống hàng hai. */}
          <div className="ml-auto hidden items-center gap-1.5 md:flex">
            {/* Phóng to / thu nhỏ lưới giờ. Không phải trang trí: thu nhỏ để
                nhìn cả ngày trong một màn ("hôm nay kín hay trống"), phóng to
                để xếp ca sát nhau mà không nhìn nhầm mốc 15 phút. Mức người
                dùng chọn được nhớ trên máy họ. */}
            <NutThuPhong cheDo={cheDo} caoGio={caoGio} />
            <DoiCheDo cheDo={cheDo} onDoi={(v) => diTo({ v })} coPhong={bundle.resources.length > 0} />
            <OTim
              oTim={oTim}
              datOTim={datOTim}
              onTim={(q) => diTo({ q })}
              className="w-36 focus:w-52 md:transition-[width]"
            />
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => datHopHienThi(true)}
              aria-label={t("show.title")}
              title={t("show.title")}
            >
              <Eye className="size-4" />
            </Button>
            <a
              href="/api/export/appointments"
              className="flex h-8 items-center rounded-md border px-2.5 text-[12px] font-medium text-muted-foreground hover:bg-muted/60"
            >
              {t("exportCsv")}
            </a>
            {canWrite && (
              <Button
                size="sm"
                className="h-8 gap-1 px-2.5 text-[12px]"
                onClick={() => {
                  datGioDienSan(null);
                  setAddOpen(true);
                }}
              >
                <Plus className="size-4" />
                {t("addAppointment")}
              </Button>
            )}
          </div>
        </div>

        {/* Hàng hai — CHỈ điện thoại. Bốn ô chế độ chia đều bề ngang, rồi hai
            nút biểu tượng. "Xuất CSV" vào menu ⋯: việc hiếm, và không ai xuất
            báo cáo bằng điện thoại. */}
        <div className="flex items-center gap-1.5 border-t px-3 py-1.5 md:hidden">
          {hienTim ? (
            <OTim
              oTim={oTim}
              datOTim={datOTim}
              onTim={(q) => diTo({ q })}
              tuMoRong
              className="flex-1"
            />
          ) : (
            <DoiCheDo
              cheDo={cheDo}
              onDoi={(v) => diTo({ v })}
              coPhong={bundle.resources.length > 0}
              className="flex-1"
            />
          )}
          {/* ⚠️ NÚT LỌC PHẢI NHÌN THẤY ĐƯỢC. Trước đây nó nằm trong menu "⋯" —
              hai lần bấm, và founder đã đi tìm "lọc chỉ Người / chỉ Phòng" rồi
              kết luận iFan CHƯA CÓ, trong khi nó có. Một tính năng không tìm ra
              được thì không khác gì chưa làm.
              Con số trên nút không phải trang trí: đang lọc mà không nói ra là
              cái bẫy tệ nhất của màn lịch — người ta thấy ngày trống rồi nhận
              thêm khách vào giờ đã kín. */}
          <Button
            variant="outline"
            size="icon"
            className="relative size-10 shrink-0"
            onClick={() => datHienLoc(true)}
            aria-label={t("rail.toggle")}
          >
            <SlidersHorizontal className="size-4" />
            {an.size > 0 && (
              <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground tabular-nums">
                {an.size}
              </span>
            )}
          </Button>
          <NutThuPhong cheDo={cheDo} caoGio={caoGio} dienThoai />
          <Button
            variant="outline"
            size="icon"
            className="size-10 shrink-0"
            onClick={() => datHienTim((v) => !v)}
            aria-label={hienTim ? t("search.clear") : t("search.placeholder")}
          >
            {hienTim ? <X className="size-4" /> : <Search className="size-4" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-10 shrink-0"
                aria-label={t("actionMore")}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => datHienLoc(true)}>
                <SlidersHorizontal className="size-4" />
                {t("rail.toggle")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => datHopHienThi(true)}>
                <Eye className="size-4" />
                {t("show.title")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => datHopPhim(true)}>
                {t("keys.title")}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/api/export/appointments">{t("exportCsv")}</a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div ref={vungLuoiRef} className="flex min-h-0 flex-1">
        {/* ── Cột trái: lịch nhỏ + dãy bật/tắt ───────────────────────── */}
        <aside
          className={cn(
            "w-56 shrink-0 space-y-3 overflow-y-auto border-r p-3",
            "max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-30 max-md:w-64 max-md:bg-background max-md:shadow-lg",
            hienLoc ? "block" : "hidden md:block",
          )}
        >
          {hienLoc && (
            <button
              type="button"
              onClick={() => datHienLoc(false)}
              className="flex w-full items-center justify-end gap-1 text-[12px] text-muted-foreground md:hidden"
            >
              <X className="size-3.5" />
              {t("rail.close")}
            </button>
          )}
          <MiniCalendar
            ngayDangXem={focusDateKey}
            todayKey={todayKey}
            onChonNgay={(k) => {
              diTo({ date: k });
              datHienLoc(false);
            }}
          />

          <NhomBatTat
            tieuDe={t("rail.staff")}
            muc={bundle.staff.map((s) => ({
              ma: s.employeeId,
              ten: s.displayName,
              cham: mauCuaTho(s.employeeId, thuTuTho).cham,
            }))}
            an={an}
            onBatTat={batTat}
            onChiHien={chiHien}
          />
          {bundle.resources.length > 0 && (
            <NhomBatTat
              tieuDe={t("rail.resources")}
              muc={bundle.resources.map((r) => ({ ma: r.id, ten: r.name, cham: null }))}
              an={an}
              onBatTat={batTat}
              onChiHien={chiHien}
            />
          )}
        </aside>

        {/* ── Giữa: lưới / tháng / danh sách / kết quả tìm ────────────── */}
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* ⚠️ Dải này KHÔNG được bỏ. Một bộ lọc đang bật mà không nói ra là
              cái bẫy tệ nhất của màn lịch: người ta thấy ngày trống rồi nhận
              thêm khách vào giờ đã có ca. Nó phải nói CÓ BAO NHIÊU mục đang bị
              giấu và cho gỡ bằng đúng một lần bấm. */}
          {an.size > 0 && (
            <div className="flex items-center gap-2 border-b bg-amber-50 px-3 py-1.5 text-[12px] text-amber-900 md:px-4 dark:bg-amber-950/40 dark:text-amber-200">
              <SlidersHorizontal className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t("rail.filtering", { count: an.size })}</span>
              <button
                type="button"
                onClick={hienHet}
                className="shrink-0 font-semibold underline underline-offset-2"
              >
                {t("rail.showAll")}
              </button>
            </div>
          )}
          {dangTim ? (
            <KetQuaTim
              ketQua={ketQuaTim?.ketQua ?? []}
              daCat={ketQuaTim?.daCat ?? false}
              tuKhoa={tuKhoa}
              timezone={bundle.timezone}
              tenTho={tenTho}
              thuTuTho={thuTuTho}
              onChon={(a) => datChonCaId(a.id)}
              onXoaTim={() => {
                datOTim("");
                diTo({ q: "" });
              }}
            />
          ) : cheDo === "nam" ? (
            <YearGrid
              nam={Number(focusDateKey.slice(0, 4))}
              demTheoNgay={new Map(demNam ?? [])}
              todayKey={todayKey}
              amLich={caiDat.amLich}
              onChonNgay={(k) => diTo({ date: k, v: "ngay" })}
            />
          ) : cheDo === "thang" ? (
            <MonthGrid
              days={days}
              thangDangXem={focusDateKey.slice(0, 7)}
              timezone={bundle.timezone}
              todayKey={todayKey}
              thuTuTho={thuTuTho}
              onChonCa={(a) => datChonCaId(a.id)}
              onChonNgay={(k) => diTo({ date: k, v: "ngay" })}
              amLich={caiDat.amLich}
            />
          ) : cheDo === "tho" || cheDo === "phong" ? (
            <StaffGrid
              day={day}
              theo={cheDo === "phong" ? "phong" : "tho"}
              staff={bundle.staff.filter((x) => !an.has(x.employeeId))}
              resources={bundle.resources.filter((x) => !an.has(x.id))}
              timezone={bundle.timezone}
              thuTuTho={thuTuTho}
              caoMotGio={caoGio.cao}
              doiMucCao={caoGio.doiMuc}
              todayKey={todayKey}
              onChiHien={(ma) =>
                chiHien(
                  ma,
                  cheDo === "phong"
                    ? bundle.resources.map((x) => x.id)
                    : bundle.staff.map((x) => x.employeeId),
                )
              }
              onChonCa={(a) => datChonCaId(a.id)}
              onChonOTrong={canWrite ? bamOTrong : null}
            />
          ) : cheDo === "ds" ? (
            <DanhSachNgay
              days={days}
              timezone={bundle.timezone}
              todayKey={todayKey}
              thuTuTho={thuTuTho}
              onChon={(a) => datChonCaId(a.id)}
            />
          ) : bundle.hasBusinessHours ||
            days.some((d) => d.appointments.length > 0) ? (
            <TimeGrid
              days={days}
              timezone={bundle.timezone}
              todayKey={todayKey}
              thuTuTho={thuTuTho}
              caoMotGio={caoGio.cao}
              doiMucCao={caoGio.doiMuc}
              amLich={caiDat.amLich}
              moCaCu={caiDat.moCaCu}
              onChonNgay={(k) => diTo({ date: k, v: "ngay" })}
              onChonCa={(a) => datChonCaId(a.id)}
              onKeoXong={canWrite ? doiGioBangKeo : null}
              onKeoTao={
                canWrite
                  ? (dateKey, phutDau, phutCuoi) => {
                      datGioDienSan({
                        dateKey,
                        time: formatMinuteLabel(phutDau),
                        phut: phutCuoi - phutDau,
                      });
                      setAddOpen(true);
                    }
                  : null
              }
              onChonOTrong={canWrite ? bamOTrong : null}
            />
          ) : (
            <div className="flex-1 overflow-y-auto">
              <NoHoursState />
            </div>
          )}

          {/* Bong bóng của ô trống đang chọn.
              ⚠️ Đặt `fixed` theo toạ độ lúc bấm, KHÔNG đặt trong lưới: lưới
              cuộn được cả hai chiều, gắn vào trong thì bong bóng trôi theo và
              chỉ tay vào chỗ khác. Cuộn hay đổi chế độ thì bỏ chọn luôn. */}
          {oTrongDangChon && (
            <>
              <div
                className="fixed inset-0 z-30"
                onPointerDown={() => datOTrongDangChon(null)}
                aria-hidden
              />
              <div
                /* `group` chứ KHÔNG phải `dialog`: bong bóng này không khoá tiêu
                   điểm và không chặn phần còn lại của màn, nên khai là hộp thoại
                   là nói dối trình đọc màn hình — và làm chính phép đo tự động
                   không phân biệt được nó với hộp "Thêm lịch" thật. */
                role="group"
                aria-label={t("addAppointment")}
                data-o-trong-dang-chon
                className="fixed z-40 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-foreground px-2.5 py-1.5 text-[12px] text-background shadow-lg"
                style={{
                  left: Math.min(Math.max(oTrongDangChon.x, 92), window.innerWidth - 92),
                  top: Math.min(oTrongDangChon.y + 12, window.innerHeight - 56),
                }}
              >
                <span className="font-semibold tabular-nums">
                  {formatMinuteLabel(oTrongDangChon.phut)}
                </span>
                <button
                  type="button"
                  onClick={() => moThemLich(oTrongDangChon)}
                  className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground"
                >
                  {t("addAppointment")}
                </button>
                <kbd className="opacity-60 max-md:hidden">Enter</kbd>
              </div>
            </>
          )}

          {/* Nút tròn nổi — CHỈ điện thoại. Đây là việc bấm nhiều nhất của cả
              màn, và góc dưới phải là chỗ ngón cái với tới dễ nhất. Đồng thời
              trả lại chỗ trên thanh, vốn đã tràn. */}
          {canWrite && (
            <button
              type="button"
              onClick={() => {
                datGioDienSan(null);
                setAddOpen(true);
              }}
              aria-label={t("addAppointment")}
              className="absolute right-4 bottom-4 z-20 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 md:hidden"
            >
              <Plus className="size-5" />
            </button>
          )}
        </div>

        {/* ── Cột phải: bảng chi tiết một buổi hẹn ────────────────────── */}
        {chonCa && (
          <BangChiTiet
            ca={chonCa}
            timezone={bundle.timezone}
            tenTho={tenTho}
            thuTuTho={thuTuTho}
            canManageAll={canManageAll}
            canWrite={canWrite}
            currentUserId={currentUserId}
            moTraoDoi={moTraoDoiId === chonCa.id}
            onDong={() => datChonCaId(null)}
            onStatus={handleStatus}
            onCancel={setCancelTarget}
            onEdit={setEditTarget}
            onNhanBan={(a) => {
              datChonCaId(null);
              datNhanBan(a);
            }}
          />
        )}
      </div>

      {/* NHÂN BẢN — hộp riêng, dùng lại đúng `AppointmentDialog`. */}
      <AppointmentDialog
        open={nhanBan !== null}
        onOpenChange={(v) => !v && datNhanBan(null)}
        bundle={bundle}
        defaultDateKey={nhanBan ? nhanBan.startAt.slice(0, 10) : focusDateKey}
        currentUserId={currentUserId}
        canAssignOthers={canAssignOthers}
        mau={nhanBan}
      />

      <AppointmentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        bundle={bundle}
        defaultDateKey={gioDienSan?.dateKey ?? focusDateKey}
        defaultTime={gioDienSan?.time}
        defaultDurationMinutes={gioDienSan?.phut}
        defaultStaffEmployeeId={gioDienSan?.employeeId}
        currentUserId={currentUserId}
        canAssignOthers={canAssignOthers}
      />
      {/* Chế độ SỬA dùng LẠI đúng `AppointmentDialog` ở trên, chỉ thêm `initial`
          — không có form thứ hai để về sau lệch nhau. */}
      <AppointmentDialog
        open={editTarget !== null}
        onOpenChange={(v) => !v && setEditTarget(null)}
        bundle={bundle}
        defaultDateKey={focusDateKey}
        currentUserId={currentUserId}
        canAssignOthers={canAssignOthers}
        initial={editTarget}
      />
      {/* ── Hộp "TỚI NGÀY…" (phím g) ─────────────────────────────────
          Hai mũi tên chỉ đi từng bước. Muốn xem thứ Tư tuần sau nữa thì phải
          bấm mười mấy lần — hộp này là một lần gõ. */}
      <Dialog open={hopToiNgay} onOpenChange={datHopToiNgay}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{t("goTo.title")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = new FormData(e.currentTarget).get("ngay");
              if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
                datHopToiNgay(false);
                diTo({ date: v });
              }
            }}
            className="space-y-3"
          >
            <Input name="ngay" type="date" defaultValue={focusDateKey} autoFocus />
            <DialogFooter>
              <Button variant="ghost" type="button" onClick={() => datHopToiNgay(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit">{t("goTo.submit")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Hộp TUỲ CHỌN HIỂN THỊ ────────────────────────────────── */}
      <Dialog open={hopHienThi} onOpenChange={datHopHienThi}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("show.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {(
              [
                ["amLich", t("show.lunar"), t("show.lunarNote")],
                ["cuoiTuan", t("show.weekend"), null],
                ["moCaCu", t("show.dimPast"), null],
                ["hienDaHuy", t("show.cancelled"), null],
              ] as const
            ).map(([khoa, nhan, ghi]) => (
              <label
                key={khoa}
                className="flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-2 text-[13px] hover:bg-muted/60"
              >
                <input
                  type="checkbox"
                  checked={caiDat[khoa]}
                  onChange={(e) => doiCaiDat(khoa, e.target.checked)}
                  className="mt-0.5 size-4 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  {nhan}
                  {ghi && (
                    <span className="block text-[11px] leading-relaxed text-muted-foreground">
                      {ghi}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t("show.note")}</p>
        </DialogContent>
      </Dialog>

      {/* ── Bảng PHÍM TẮT (phím ?) ───────────────────────────────────
          Không có bảng này thì phím tắt chỉ người viết code biết — tức là
          không tồn tại với người dùng. */}
      <Dialog open={hopPhim} onOpenChange={datHopPhim}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("keys.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(["xem", "diLai", "viec"] as const).map((nhom) => (
              <div key={nhom}>
                <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {t(`keys.${nhom}`)}
                </p>
                <ul className="space-y-0.5">
                  {BANG_PHIM.filter((x) => x.nhom === nhom).map((x) => (
                    <li key={x.phim} className="flex items-baseline gap-2 text-[12px]">
                      <kbd className="min-w-14 shrink-0 rounded border bg-muted px-1.5 py-0.5 text-center font-mono text-[11px]">
                        {x.phim}
                      </kbd>
                      <span>{x.viec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="text-[11px] leading-relaxed text-muted-foreground">{t("keys.note")}</p>
          </div>
        </DialogContent>
      </Dialog>

      <CancelDialog
        open={cancelTarget !== null}
        onOpenChange={(v) => !v && setCancelTarget(null)}
        appointmentId={cancelTarget}
        chuoi={(() => {
          const ca = cancelTarget ? timCa(cancelTarget) : null;
          return ca?.seriesId && ca.seriesIndex && ca.seriesTotal
            ? { index: ca.seriesIndex, total: ca.seriesTotal }
            : null;
        })()}
      />
    </div>
  );
}

/**
 * Dải đổi chế độ xem — MỘT bản dùng cho cả máy tính lẫn điện thoại.
 *
 * Tách ra thành thành phần riêng chứ không chép hai lần: thanh trên gập hai
 * hàng ở khổ điện thoại, và nếu chép thì hai bản chắc chắn lệch nhau ở lượt
 * sửa sau. Đây đúng cái bẫy D2 mà kho vẫn nhắc.
 */
function DoiCheDo({
  cheDo,
  onDoi,
  coPhong,
  className,
}: {
  cheDo: CheDoXem;
  onDoi: (v: CheDoXem) => void;
  /** Tiệm có khai phòng/giường không — không có thì giấu hẳn chế độ đó. */
  coPhong: boolean;
  className?: string;
}) {
  const t = useTranslations("calendar");
  return (
    <div className={cn("flex rounded-md border p-0.5", className)}>
      {CHE_DO_XEM.filter((v) => v !== "phong" || coPhong).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onDoi(v)}
          className={cn(
            "rounded px-2 py-1 text-[12px] leading-none font-medium max-md:min-h-9 max-md:flex-1",
            v === cheDo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {/* Chữ NGẮN trên điện thoại: bốn ô chia đều 375px, để nguyên
              "Danh sách" thì ô đó xuống hai dòng và cả dải cao gấp đôi. */}
          <span className="md:hidden">{t(`view.${v}.short`)}</span>
          <span className="max-md:hidden">{t(`view.${v}.long`)}</span>
        </button>
      ))}
    </div>
  );
}

/** Ô tìm buổi hẹn — dùng chung cho thanh máy tính và hàng hai trên điện thoại. */
function OTim({
  oTim,
  datOTim,
  onTim,
  className,
  tuMoRong = false,
}: {
  oTim: string;
  datOTim: (v: string) => void;
  onTim: (q: string) => void;
  className?: string;
  /** Tự đưa con trỏ vào ô — dùng khi ô vừa được bật lên bằng nút kính lúp. */
  tuMoRong?: boolean;
}) {
  const t = useTranslations("calendar");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onTim(oTim.trim());
      }}
      className={cn("relative", className)}
    >
      <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={oTim}
        data-o-tim="1"
        autoFocus={tuMoRong}
        onChange={(e) => datOTim(e.target.value)}
        placeholder={t("search.placeholder")}
        aria-label={t("search.placeholder")}
        className="h-8 w-full pl-7 text-[12px] max-md:h-10"
      />
      {oTim.length > 0 && (
        <button
          type="button"
          onClick={() => {
            datOTim("");
            onTim("");
          }}
          aria-label={t("search.clear")}
          className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded hover:bg-muted max-md:size-8"
        >
          <X className="size-3.5" />
        </button>
      )}
    </form>
  );
}

/**
 * Một nhóm bật/tắt ở cột trái (thợ, hoặc phòng/giường).
 *
 * HAI thao tác trên mỗi dòng, vì hai câu hỏi khác nhau:
 *   · bấm vào dòng   = "giấu người này đi"  (bớt dần)
 *   · bấm nút "Chỉ"  = "CHỈ xem người này"  (chọn thẳng)
 * Chỉ có cách một thì muốn xem riêng một thợ trong tiệm 12 người phải bấm 11
 * lần — đó là lý do founder nói màn này "thiếu filter để chọn ngay".
 */
function NhomBatTat({
  tieuDe,
  muc,
  an,
  onBatTat,
  onChiHien,
}: {
  tieuDe: string;
  muc: { ma: string; ten: string; cham: string | null }[];
  an: Set<string>;
  onBatTat: (ma: string) => void;
  onChiHien: (ma: string, caNhom: string[]) => void;
}) {
  const t = useTranslations("calendar");
  if (muc.length === 0) return null;
  const caNhom = muc.map((m) => m.ma);
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {tieuDe}
      </p>
      <ul>
        {muc.map((m) => {
          const tat = an.has(m.ma);
          return (
            <li key={m.ma} className="group/muc flex items-center">
              <button
                type="button"
                onClick={() => onBatTat(m.ma)}
                aria-pressed={!tat}
                className={cn(
                  "flex min-h-7 flex-1 items-center gap-1.5 rounded px-1 text-left text-[12px] hover:bg-muted max-md:min-h-10",
                  tat && "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "size-2.5 shrink-0 rounded-[3px] border",
                    m.cham && !tat ? `${m.cham} border-transparent` : "border-muted-foreground/50",
                    !m.cham && !tat && "bg-muted-foreground/60 border-transparent",
                  )}
                />
                <span className={cn("truncate", tat && "line-through decoration-1")}>{m.ten}</span>
              </button>
              {/* Hiện khi rê chuột trên máy tính; trên điện thoại luôn hiện —
                  ngăn kéo có chỗ, và điện thoại không có chuột để rê. */}
              <button
                type="button"
                onClick={() => onChiHien(m.ma, caNhom)}
                className="shrink-0 rounded px-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground max-md:min-h-10 md:invisible md:group-hover/muc:visible"
              >
                {t("rail.only")}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Chế độ DANH SÁCH — 30 ngày tới, gộp theo ngày, bỏ qua ngày trống. */
function DanhSachNgay({
  days,
  timezone,
  todayKey,
  thuTuTho,
  onChon,
}: {
  days: CalendarDay[];
  timezone: string;
  todayKey: string;
  thuTuTho: Map<string, number>;
  onChon: (a: Appointment) => void;
}) {
  const t = useTranslations("calendar");
  const coCa = days.filter((d) => d.appointments.length > 0);

  if (coCa.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <EmptyDayState />
      </div>
    );
  }

  return (
    <div className="flex-1 divide-y overflow-y-auto">
      {coCa.map((d) => (
        <section key={d.dateKey}>
          <h2 className="sticky top-0 z-10 flex items-baseline gap-2 border-b bg-background/95 px-3 py-1.5 backdrop-blur md:px-4">
            <span className="text-[13px] font-semibold">
              {WEEKDAY_SHORT_VN[d.weekday]} {dateLabel(d.dateKey)}
            </span>
            {d.dateKey === todayKey && (
              <span className="rounded bg-primary px-1.5 py-px text-[10px] font-medium text-primary-foreground">
                {t("today")}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">
              {t("list.count", { count: d.appointments.length })}
            </span>
            {d.closureReason && (
              <span className="truncate text-[11px] text-muted-foreground">· {d.closureReason}</span>
            )}
          </h2>
          <ul className="divide-y">
            {d.appointments.map((a) => (
              <li key={a.id}>
                <DongCa a={a} timezone={timezone} thuTuTho={thuTuTho} onChon={onChon} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Một dòng buổi hẹn — dùng chung cho chế độ Danh sách và bảng kết quả tìm. */
function DongCa({
  a,
  timezone,
  thuTuTho,
  hienNgay = false,
  tenTho,
  onChon,
}: {
  a: Appointment;
  timezone: string;
  thuTuTho: Map<string, number>;
  hienNgay?: boolean;
  tenTho?: Map<string, string>;
  onChon: (a: Appointment) => void;
}) {
  const t = useTranslations("calendar");
  const daHuy = a.status === "cancelled" || a.status === "no_show";
  const mau = daHuy ? MAU_DA_HUY : mauCuaTho(a.staffEmployeeId, thuTuTho);
  const ten =
    a.staffName !== "—"
      ? a.staffName
      : ((a.staffEmployeeId && tenTho?.get(a.staffEmployeeId)) ?? null);
  return (
    <button
      type="button"
      onClick={() => onChon(a)}
      className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted/50 md:px-4"
    >
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", mau.cham)} />
      <span className="w-24 shrink-0 text-[12px] tabular-nums text-muted-foreground">
        {hienNgay && <span className="mr-1">{dateLabel(a.startAt.slice(0, 10))}</span>}
        {formatMinuteLabel(minutesOfDayInTimeZone(a.startAt, timezone))}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[13px] font-medium",
            daHuy && "text-muted-foreground line-through decoration-1",
          )}
        >
          {a.contactName}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {a.serviceName ?? t("noService")}
          {ten ? ` · ${ten}` : ""}
          {a.resourceName ? ` · ${a.resourceName}` : ""}
        </span>
      </span>
    </button>
  );
}

/** Kết quả tìm trên toàn bộ lịch sử. */
function KetQuaTim({
  ketQua,
  daCat,
  tuKhoa,
  timezone,
  tenTho,
  thuTuTho,
  onChon,
  onXoaTim,
}: {
  ketQua: Appointment[];
  daCat: boolean;
  tuKhoa: string;
  timezone: string;
  tenTho: Map<string, string>;
  thuTuTho: Map<string, number>;
  onChon: (a: Appointment) => void;
  onXoaTim: () => void;
}) {
  const t = useTranslations("calendar");
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 md:px-4">
        <p className="text-[13px]">
          {ketQua.length === 0
            ? t("search.none", { q: tuKhoa })
            : t("search.results", { count: ketQua.length, q: tuKhoa })}
        </p>
        <button
          type="button"
          onClick={onXoaTim}
          className="text-[12px] font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          {t("search.back")}
        </button>
      </div>
      {/* Nói thẳng phạm vi tìm. Người dùng gõ tên thợ mà không ra gì rồi tin là
          "không có ca nào" thì tệ hơn hẳn việc thiếu một nhánh tìm. */}
      <p className="px-3 py-1.5 text-[11px] text-muted-foreground md:px-4">{t("search.scope")}</p>
      {/* ⚠️ Nói ra khi bị cắt. Không nói thì người ta gõ "Lan" ra 50 kết quả
          rồi tin là tiệm có đúng 50 buổi cho chị Lan. */}
      {daCat && (
        <p className="px-3 pb-1.5 text-[11px] font-medium text-amber-700 md:px-4 dark:text-amber-400">
          {t("search.truncated", { count: ketQua.length })}
        </p>
      )}
      <ul className="divide-y">
        {ketQua.map((a) => (
          <li key={a.id}>
            <DongCa
              a={a}
              timezone={timezone}
              thuTuTho={thuTuTho}
              tenTho={tenTho}
              hienNgay
              onChon={onChon}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * BẢNG CHI TIẾT bên phải — mọi thông tin và mọi việc làm được với một buổi hẹn.
 *
 * Trước đây các nút này nằm ngay trong dòng thời gian, nên mỗi buổi hẹn cao
 * ~215px và một màn điện thoại chỉ hiện được hai lịch rưỡi trong khi ngày đó có
 * 14 lịch. Đưa vào bảng bên phải: lưới gọn lại, mà không mất việc nào.
 */
function BangChiTiet({
  ca,
  timezone,
  tenTho,
  thuTuTho,
  canManageAll,
  canWrite,
  currentUserId,
  moTraoDoi,
  onDong,
  onStatus,
  onCancel,
  onEdit,
  onNhanBan,
}: {
  ca: Appointment;
  timezone: string;
  tenTho: Map<string, string>;
  thuTuTho: Map<string, number>;
  canManageAll: boolean;
  canWrite: boolean;
  currentUserId: string;
  moTraoDoi: boolean;
  onDong: () => void;
  onStatus: (id: string, action: "arrived" | "done" | "no_show") => void;
  onCancel: (id: string) => void;
  onEdit: (a: Appointment) => void;
  onNhanBan: (a: Appointment) => void;
}) {
  const t = useTranslations("calendar");
  const daHuy = ca.status === "cancelled" || ca.status === "no_show";
  const mau = daHuy ? MAU_DA_HUY : mauCuaTho(ca.staffEmployeeId, thuTuTho);
  const ten =
    ca.staffName !== "—"
      ? ca.staffName
      : ((ca.staffEmployeeId && tenTho.get(ca.staffEmployeeId)) ?? null);

  const coDenNoi = ARRIVABLE_STATUSES.includes(ca.status);
  const coXong = COMPLETABLE_STATUSES.includes(ca.status);
  const coSua = canWrite && EDITABLE_STATUSES.includes(ca.status);
  const coTaoDon = ca.status === "done";
  const duocLam = canManageAll || ca.staffUserId === currentUserId;

  const dong = (nhan: string, gtri: React.ReactNode) =>
    gtri ? (
      <div className="flex gap-2 py-0.5">
        <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{nhan}</span>
        <span className="min-w-0 flex-1 text-[12px]">{gtri}</span>
      </div>
    ) : null;

  return (
    // Trên điện thoại là TẤM TRƯỢT TỪ DƯỚI LÊN, không phủ kín màn: vẫn thấy
    // lưới phía sau nên không mất phương hướng khi đóng lại.
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:max-h-[78%] max-md:w-full max-md:rounded-t-2xl max-md:border max-md:bg-background max-md:shadow-2xl">
      <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-muted-foreground/30 md:hidden" />
      <div className="flex items-start gap-2 border-b px-3 py-2.5">
        <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", mau.cham)} />
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-[14px] font-semibold", daHuy && "line-through decoration-1")}>
            {ca.contactName}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {dateLabel(ca.startAt.slice(0, 10))} ·{" "}
            {formatMinuteLabel(minutesOfDayInTimeZone(ca.startAt, timezone))}–
            {formatMinuteLabel(minutesOfDayInTimeZone(ca.endAt, timezone))}
          </p>
        </div>
        <button
          type="button"
          onClick={onDong}
          aria-label={t("detail.close")}
          className="flex size-8 items-center justify-center rounded hover:bg-muted max-md:size-11"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="border-b px-3 py-2">
        {dong(t("detail.status"), t(`status.${ca.status}`))}
        {dong(t("detail.service"), ca.serviceName ?? t("noService"))}
        {dong(t("detail.staff"), ten)}
        {dong(t("detail.resource"), ca.resourceName)}
        {dong(t("detail.price"), ca.priceVnd > 0 ? ca.priceVnd.toLocaleString("vi-VN") + " ₫" : null)}
        {dong(
          t("detail.series"),
          ca.seriesId && ca.seriesIndex && ca.seriesTotal
            ? t("detail.seriesValue", { index: ca.seriesIndex, total: ca.seriesTotal })
            : null,
        )}
        {dong(t("detail.note"), ca.note)}
        {dong(t("detail.cancelReason"), ca.cancelReason)}
        <Link
          href={`/app/contacts/${ca.contactId}`}
          className="mt-1 inline-block text-[12px] font-medium text-primary hover:underline"
        >
          {t("detail.openContact")}
        </Link>
      </div>

      {duocLam && (coDenNoi || coXong || coTaoDon || coSua || canWrite) && (
        <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
          {coDenNoi && (
            <Button size="sm" className="h-8 text-[12px] max-md:min-h-11" onClick={() => onStatus(ca.id, "arrived")}>
              {t("actionArrived")}
            </Button>
          )}
          {coXong && (
            <Button size="sm" className="h-8 text-[12px] max-md:min-h-11" onClick={() => onStatus(ca.id, "done")}>
              {t("actionDone")}
            </Button>
          )}
          {coTaoDon && (
            // Cửa vào "từ lịch hẹn" (ADR-0019 mục 8 việc 4) — chỉ hiện khi đã
            // Xong: đơn hàng ghi lại CÁI ĐÃ LÀM, không phải cái sắp làm.
            <Button size="sm" asChild className="h-8 text-[12px] max-md:min-h-11">
              <Link href={`/app/orders/new?contactId=${ca.contactId}&appointmentId=${ca.id}`}>
                {t("actionCreateOrder")}
              </Link>
            </Button>
          )}
          {(coDenNoi || coSua || canWrite) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 max-md:size-11"
                  aria-label={t("actionMore")}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {coDenNoi && (
                  <DropdownMenuItem onSelect={() => onStatus(ca.id, "no_show")}>
                    {t("actionNoShow")}
                  </DropdownMenuItem>
                )}
                {coSua && (
                  <DropdownMenuItem onSelect={() => onEdit(ca)}>{t("actionEdit")}</DropdownMenuItem>
                )}
                {canWrite && (
                  <DropdownMenuItem onSelect={() => onNhanBan(ca)}>
                    {daHuy ? t("actionRebook") : t("actionDuplicate")}
                  </DropdownMenuItem>
                )}
                {coDenNoi && (
                  <DropdownMenuItem variant="destructive" onSelect={() => onCancel(ca.id)}>
                    {t("actionCancel")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {/* Trao đổi nội bộ về buổi hẹn này (thẻ man-chat-noi-bo, migration #169). */}
      <div className="px-3 py-2">
        <InternalChat entityType="appointment" entityId={ca.id} defaultOpen={moTraoDoi} />
      </div>
    </aside>
  );
}

function NoHoursState() {
  const t = useTranslations("calendar");
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="max-w-sm rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{t("noHoursTitle")}</p>
        <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-200/80">{t("noHoursBody")}</p>
        <Button asChild size="sm" className="mt-3">
          <Link href="/app/settings/channels/storefront">{t("noHoursCta")}</Link>
        </Button>
      </div>
      <p className="max-w-sm text-xs text-muted-foreground">{t("noHoursNote")}</p>
    </div>
  );
}

function EmptyDayState() {
  const t = useTranslations("calendar");
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Calendar className="size-5" />
      </div>
      <p className="text-sm font-semibold">{t("emptyTitle")}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{t("emptyBody")}</p>
      <Button variant="outline" size="sm" asChild className="mt-1 gap-1.5">
        <Link href="/app/inbox">
          <Inbox className="size-4" />
          {t("emptyCta")}
        </Link>
      </Button>
    </div>
  );
}

// `freeBlocksOfDay` vẫn dùng ở chỗ khác của kho (thống kê ngày) — giữ nguyên
// đường nhập để không phải sửa lan sang file khác.
export { freeBlocksOfDay };

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatMinuteLabel, minutesOfDayInTimeZone } from "@/lib/booking/schedule";
import { xepChong } from "./xep-chong";
import { MAU_DA_HUY, WEEKDAY_SHORT_VN, mauCuaTho } from "./types";
import type { Appointment, CalendarDay } from "./types";

/**
 * Bề ngang TỐI THIỂU của một cột ngày trên điện thoại.
 *
 * Chia đều 7 cột vào màn 375px ra 45px mỗi cột — đo trên bản chạy 21/08: tên
 * khách bị cắt còn `1… G.`, tức là lưới vẫn vẽ nhưng không đọc được gì. Ghim
 * 104px rồi CHO CUỘN NGANG thì vẫn đủ bảy ngày mà mỗi ca đọc được tên khách và
 * giờ. Trên máy tính (`md:`) bỏ ghim, để bảy cột chia đều như cũ.
 *
 * ⚠️ Viết THẲNG số vào tên lớp, không đi qua biến CSS. Bản đầu dùng
 *   `min-w-[--rong-cot]` kèm `style={{"--rong-cot": ...}}`: Tailwind không sinh
 *   ra luật nào cho tên lớp đó, nên bề ngang tối thiểu KHÔNG có tác dụng —
 *   trang vẫn dựng, không lỗi gì, chỉ là cột vẫn hẹp y như cũ. Đo bằng ảnh chụp
 *   mới thấy. Tailwind quét tên lớp bằng chuỗi tĩnh; ghép động là không có.
 */
const COT_NGAY = "min-w-[104px] md:min-w-0";

/**
 * Quá bấy nhiêu ca trùng giờ thì thôi chia đều — xếp BẬC THANG.
 *
 * Chia đều 20 ca vào một cột cho ra những sợi rộng 4px: lưới vẫn "đúng" mà
 * không ai bấm được vào ca nào, và cũng chẳng đọc được chữ gì. Đo trên bản
 * chạy 21/08 ở khổ máy tính — thấy ngay bằng ảnh chụp, không thấy bằng cách
 * đọc code.
 *
 * Từ nấc này trở lên, các ca lùi dần sang phải và chồng lên nhau: mỗi ca vẫn
 * chừa một dải bên trái đủ để bấm, và ca ngoài cùng hiện đầy đủ. Đây đúng là
 * cách Google Lịch xử lý, vì cùng một lý do.
 */
const NGUONG_BAC_THANG = 4;
/** Bề ngang của một ca khi đã xếp bậc thang, tính theo % bề ngang cột ngày. */
const RONG_KHI_BAC_THANG = 42;
/** Bấm vào ô trống thì làm tròn xuống mốc 15 phút gần nhất. */
const BUOC_PHUT = 15;
/** Không có giờ mở cửa nào thì vẫn phải vẽ được lưới — lấy khung này. */
const KHUNG_MAC_DINH = { dau: 7 * 60, cuoi: 21 * 60 };

/** Cú kéo đang diễn ra. Ba kiểu, ba câu trả lời khác nhau lúc nhả tay. */
type TrangThaiKeo =
  | {
      kieu: "di";
      caId: string;
      dateKey: string;
      ngayGoc: string;
      phutDau: number;
      phutDauGoc: number;
      dai: number;
      /** Cầm vào giữa khối thì thả xuống cũng phải giữ đúng chỗ cầm đó. */
      lechCam: number;
    }
  | { kieu: "dai"; caId: string; dateKey: string; phutDau: number; phutCuoi: number; phutCuoiGoc: number }
  | { kieu: "tao"; dateKey: string; phutA: number; phutB: number };

type Props = {
  days: CalendarDay[];
  timezone: string;
  todayKey: string;
  /** Thứ tự thợ trong danh sách — quyết định màu. */
  thuTuTho: Map<string, number>;
  onChonCa: (a: Appointment) => void;
  /** Bấm ô trống: mở hộp tạo lịch với ngày+giờ điền sẵn. */
  onChonOTrong: ((dateKey: string, phut: number) => void) | null;
  /** Bấm SỐ NGÀY trên đầu cột: nhảy sang xem riêng ngày đó. */
  onChonNgay: (dateKey: string) => void;
  /**
   * Kéo xong: dời một ca sang giờ/ngày khác, hoặc đổi độ dài của nó.
   * `null` = không được sửa (vai Chỉ xem) ⇒ tắt hẳn kéo-thả.
   */
  onKeoXong: ((caId: string, dateKey: string, phutDau: number, phutCuoi: number) => void) | null;
  /** Kéo trên khoảng trống xong: mở hộp tạo lịch với đúng khoảng vừa kéo. */
  onKeoTao: ((dateKey: string, phutDau: number, phutCuoi: number) => void) | null;
  /**
   * Chiều cao MỘT GIỜ tính bằng pixel — người dùng tự chỉnh bằng nút phóng to
   * / thu nhỏ, và lựa chọn được nhớ trên máy họ.
   */
  caoMotGio: number;
};

/**
 * LƯỚI THỜI GIAN — cột giờ dọc bên trái, mỗi ngày một cột.
 *
 * Đây là thứ khiến một màn lịch trở thành LỊCH chứ không phải danh sách có sắp
 * xếp: nhìn vào là thấy ngay 14h–16h trống, ca này dài gấp đôi ca kia, và ba ca
 * cùng 9h thì đứng cạnh nhau. Bản trước chỉ liệt kê ca nối đuôi, nên "hôm nay
 * bận không" phải đọc từng dòng mới trả lời được.
 *
 * ⚠️ Khung giờ vẽ ra KHÔNG chỉ là giờ mở cửa. Một ca lỡ đặt ngoài giờ (nhận
 *   khách quen lúc 6h sáng) mà lưới cắt mất thì nó biến mất khỏi màn hình — và
 *   biến mất im lặng là thứ tệ nhất một màn lịch có thể làm. Khung luôn nới ra
 *   đủ ôm mọi ca có thật trong dải.
 */
export function TimeGrid({
  days,
  timezone,
  todayKey,
  thuTuTho,
  onChonCa,
  onChonOTrong,
  onChonNgay,
  onKeoXong,
  onKeoTao,
  caoMotGio,
}: Props) {
  const t = useTranslations("calendar");
  const khungRef = useRef<HTMLDivElement>(null);
  const [bayGioPhut, datBayGioPhut] = useState<number | null>(null);

  // Đường "bây giờ" phải tự đi xuống, không đứng im ở lúc mở trang.
  useEffect(() => {
    const dat = () => datBayGioPhut(minutesOfDayInTimeZone(new Date().toISOString(), timezone));
    dat();
    const h = setInterval(dat, 60_000);
    return () => clearInterval(h);
  }, [timezone]);

  const khung = useMemo(() => {
    let dau = Infinity;
    let cuoi = -Infinity;
    for (const d of days) {
      for (const r of d.openRanges) {
        dau = Math.min(dau, r.startMin);
        cuoi = Math.max(cuoi, r.endMin);
      }
      for (const a of d.appointments) {
        dau = Math.min(dau, minutesOfDayInTimeZone(a.startAt, timezone));
        cuoi = Math.max(cuoi, minutesOfDayInTimeZone(a.endAt, timezone));
      }
    }
    if (!Number.isFinite(dau) || !Number.isFinite(cuoi) || cuoi <= dau) {
      dau = KHUNG_MAC_DINH.dau;
      cuoi = KHUNG_MAC_DINH.cuoi;
    }
    // Bo tròn ra giờ chẵn và chừa nửa giờ mỗi đầu cho dễ thở.
    return {
      dau: Math.max(0, Math.floor((dau - 30) / 60) * 60),
      cuoi: Math.min(24 * 60, Math.ceil((cuoi + 30) / 60) * 60),
    };
  }, [days, timezone]);

  const gio = useMemo(() => {
    const ra: number[] = [];
    for (let m = khung.dau; m < khung.cuoi; m += 60) ra.push(m);
    return ra;
  }, [khung]);

  const caoTong = ((khung.cuoi - khung.dau) / 60) * caoMotGio;
  const toaDo = useMemo(
    () => (phut: number) => ((phut - khung.dau) / 60) * caoMotGio,
    [khung.dau, caoMotGio],
  );

  // Mở ra là nhìn thấy khung giờ đang chạy, không phải cuộn đi tìm.
  const daCan = useRef(false);
  useEffect(() => {
    const el = khungRef.current;
    if (!el || bayGioPhut === null || daCan.current) return;
    daCan.current = true;
    // Chỉ căn MỘT LẦN: căn lại mỗi phút sẽ giật màn khi người ta đang cuộn xem
    // giờ khác.
    el.scrollTop = Math.max(0, toaDo(bayGioPhut) - el.clientHeight / 3);
  }, [bayGioPhut, toaDo]);

  /**
   * KÉO-THẢ — dời giờ, đổi độ dài, và kéo khoảng trống để tạo ca mới.
   *
   * ⚠️ CHỈ BẰNG CHUỘT, cố ý. Trên màn cảm ứng, "kéo" và "cuộn trang" là cùng
   *   một cử chỉ: bật kéo-thả cho ngón tay thì mỗi lần cuộn xem giờ khác sẽ
   *   dời nhầm lịch của khách. Google Lịch trên điện thoại cũng bắt GIỮ LÂU
   *   rồi mới cho kéo, và giữ-lâu trên một lưới dày ca thì rất dễ trúng nhầm
   *   ca bên cạnh. Trên điện thoại: chạm để mở bảng chi tiết rồi sửa giờ ở đó
   *   — chậm hơn vài giây nhưng không bao giờ sai.
   *
   * ⚠️ KHÔNG tự kiểm trùng giờ ở đây. Hai ràng buộc EXCLUDE trong cơ sở dữ
   *   liệu (#83) là chốt thật; thả xuống chỗ đã có ca thì máy chủ từ chối và
   *   màn báo lại. Kiểm ở đây nữa là dựng bộ luật thứ hai để về sau lệch nhau.
   */
  const [keo, datKeo] = useState<TrangThaiKeo | null>(null);
  // Bản mới nhất của cú kéo, để lúc NHẢ TAY đọc được giá trị cuối cùng.
  // ⚠️ Gán trong effect chứ KHÔNG gán thẳng trong thân hàm dựng: sửa một ref
  //   giữa lượt dựng là thứ React không hứa gì cả, và luật `react-hooks/refs`
  //   của kho chặn đúng.
  const keoRef = useRef<TrangThaiKeo | null>(null);
  useEffect(() => {
    keoRef.current = keo;
  }, [keo]);

  /** Toạ độ con trỏ → (ngày, phút) đã làm tròn về mốc 15 phút. */
  function doViTri(e: PointerEvent | React.PointerEvent): { dateKey: string; phut: number } | null {
    const duoi = document.elementsFromPoint(e.clientX, e.clientY);
    const cot = duoi.find((el) => el instanceof HTMLElement && el.dataset.ngay) as
      | HTMLElement
      | undefined;
    if (!cot) return null;
    const hop = cot.getBoundingClientRect();
    const phut = khung.dau + ((e.clientY - hop.top) / caoMotGio) * 60;
    return {
      dateKey: cot.dataset.ngay as string,
      phut: Math.max(khung.dau, Math.min(khung.cuoi, Math.round(phut / BUOC_PHUT) * BUOC_PHUT)),
    };
  }

  useEffect(() => {
    if (keo === null) return;

    const diChuyen = (e: PointerEvent) => {
      const v = doViTri(e);
      if (!v) return;
      datKeo((truoc) => {
        if (!truoc) return truoc;
        if (truoc.kieu === "dai") {
          // Đổi độ dài: giữ nguyên giờ bắt đầu, kéo mép dưới. Tối thiểu 15 phút
          // — ca dài 0 phút là ca tàng hình.
          return { ...truoc, phutCuoi: Math.max(truoc.phutDau + BUOC_PHUT, v.phut) };
        }
        if (truoc.kieu === "tao") return { ...truoc, phutB: v.phut, dateKey: truoc.dateKey };
        // Dời: giữ nguyên độ dài, và giữ nguyên chỗ cầm trong khối.
        return { ...truoc, dateKey: v.dateKey, phutDau: v.phut - truoc.lechCam };
      });
    };

    const nhaTay = () => {
      const t = keoRef.current;
      datKeo(null);
      if (!t) return;
      if (t.kieu === "tao") {
        const a = Math.min(t.phutA, t.phutB);
        const b = Math.max(t.phutA, t.phutB);
        // Kéo chưa tới một nấc thì đó là một CÚ BẤM, không phải cú kéo — để
        // `onClick` của ô trống lo, đừng mở hộp với khoảng 0 phút.
        if (b - a >= BUOC_PHUT) onKeoTao?.(t.dateKey, a, b);
        return;
      }
      if (t.kieu === "dai") {
        if (t.phutCuoi !== t.phutCuoiGoc) onKeoXong?.(t.caId, t.dateKey, t.phutDau, t.phutCuoi);
        return;
      }
      if (t.phutDau !== t.phutDauGoc || t.dateKey !== t.ngayGoc) {
        onKeoXong?.(t.caId, t.dateKey, t.phutDau, t.phutDau + t.dai);
      }
    };

    window.addEventListener("pointermove", diChuyen);
    window.addEventListener("pointerup", nhaTay);
    window.addEventListener("pointercancel", nhaTay);
    return () => {
      window.removeEventListener("pointermove", diChuyen);
      window.removeEventListener("pointerup", nhaTay);
      window.removeEventListener("pointercancel", nhaTay);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keo !== null, caoMotGio, khung.dau, khung.cuoi]);

  /**
   * Bấm ô trống để tạo lịch — CHỈ BẰNG CHUỘT.
   *
   * ⚠️ Trên màn cảm ứng thì KHÔNG. Founder báo 21/08: "click khoảng trống lịch
   *   thì nó tạo lịch — sai UX, bất tiện cho user mobile". Đúng: trên điện
   *   thoại ngón tay chạm vào lưới suốt trong lúc cuộn, và mỗi lần chạm hụt là
   *   một hộp đặt lịch bật ra. Google Lịch trên điện thoại cũng không tạo bằng
   *   một chạm vào lưới — có nút tròn nổi ở góc dưới phải để làm việc đó, và
   *   iFan đã có nút đó.
   *
   *   Đo bằng `pointer: coarse` (ngón tay) chứ không đoán theo bề ngang màn:
   *   máy tính bảng có màn rộng mà vẫn dùng ngón tay, còn cửa sổ trình duyệt
   *   thu hẹp trên máy tính thì vẫn có chuột.
   */
  function bamOTrong(e: React.MouseEvent<HTMLDivElement>, dateKey: string) {
    if (!onChonOTrong) return;
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    const hop = e.currentTarget.getBoundingClientRect();
    const phut = khung.dau + ((e.clientY - hop.top) / caoMotGio) * 60;
    onChonOTrong(dateKey, Math.max(0, Math.floor(phut / BUOC_PHUT) * BUOC_PHUT));
  }

  return (
    <div ref={khungRef} className="relative flex-1 overflow-auto">
      {/* Dải đầu cột: thứ + ngày. Dính trên khi cuộn — cuộn tới 16h mà không
          biết đang xem thứ mấy là mất phương hướng ngay. */}
      <div className="sticky top-0 z-20 flex w-max min-w-full border-b bg-background">
        <div className="sticky left-0 z-10 w-12 shrink-0 border-r bg-background" />
        {days.map((d) => {
          const homNay = d.dateKey === todayKey;
          return (
            <div
              key={d.dateKey}
              className={cn(
                "flex-1 border-r px-1 py-1.5 text-center last:border-r-0",
                COT_NGAY,
                homNay && "bg-primary/5",
              )}
            >
              <p className="text-[10px] leading-tight text-muted-foreground">
                {WEEKDAY_SHORT_VN[d.weekday]}
              </p>
              {/* Bấm SỐ NGÀY để xem riêng ngày đó — đúng lối Google Lịch.
                  Không có nó thì ở chế độ Tuần muốn xem kỹ một ngày phải đổi
                  chế độ rồi bấm mũi tên tới đúng ngày, ba thao tác cho một
                  việc. */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChonNgay(d.dateKey);
                }}
                aria-label={t("grid.openDay")}
                className={cn(
                  "mx-auto flex size-6 items-center justify-center rounded-full text-[13px] leading-tight font-semibold hover:bg-muted max-md:size-8",
                  homNay && "bg-primary text-primary-foreground hover:bg-primary",
                )}
              >
                {Number(d.dateKey.slice(8, 10))}
              </button>
            </div>
          );
        })}
      </div>

      {/* Hàng CẢ NGÀY — ngày nghỉ của tiệm. Tách khỏi lưới giờ vì nó không
          thuộc giờ nào cả; nhét vào lưới thì phải bịa ra một khung giờ. */}
      {days.some((d) => d.closureReason) && (
        <div className="flex w-max min-w-full border-b bg-muted/30">
          <div className="sticky left-0 z-10 w-12 shrink-0 border-r bg-muted px-1 py-1 text-[9px] leading-tight text-muted-foreground">
            {t("grid.allDay")}
          </div>
          {days.map((d) => (
            <div
              key={d.dateKey}
              className={cn("flex-1 border-r p-1 last:border-r-0", COT_NGAY)}
            >
              {d.closureReason && (
                <p
                  className="truncate rounded bg-muted-foreground/15 px-1 py-0.5 text-[10px] leading-tight"
                  title={d.closureReason}
                >
                  {d.closureReason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex w-max min-w-full" style={{ height: caoTong }}>
        {/* Cột nhãn giờ — DÍNH bên trái khi cuộn ngang, nếu không thì cuộn tới
            thứ Sáu là mất hẳn mốc giờ và lưới thành vô nghĩa. */}
        <div className="sticky left-0 z-10 w-12 shrink-0 border-r bg-background">
          {gio.map((m) => (
            <div key={m} className="relative" style={{ height: caoMotGio }}>
              <span className="absolute -top-1.5 right-1 text-[10px] tabular-nums text-muted-foreground">
                {formatMinuteLabel(m)}
              </span>
            </div>
          ))}
        </div>

        {days.map((d) => (
          <CotNgay
            key={d.dateKey}
            day={d}
            timezone={timezone}
            khung={khung}
            gio={gio}
            toaDo={toaDo}
            caoMotGio={caoMotGio}
            thuTuTho={thuTuTho}
            laHomNay={d.dateKey === todayKey}
            bayGioPhut={bayGioPhut}
            onChonCa={onChonCa}
            onBamTrong={onChonOTrong ? (e) => bamOTrong(e, d.dateKey) : null}
            keo={keo}
            datKeo={datKeo}
            choPhepKeo={onKeoXong !== null}
            choPhepKeoTao={onKeoTao !== null}
            doViTri={doViTri}
          />
        ))}
      </div>
    </div>
  );
}

function CotNgay({
  day,
  timezone,
  khung,
  gio,
  toaDo,
  caoMotGio,
  thuTuTho,
  laHomNay,
  bayGioPhut,
  onChonCa,
  onBamTrong,
  keo,
  datKeo,
  choPhepKeo,
  choPhepKeoTao,
  doViTri,
}: {
  day: CalendarDay;
  timezone: string;
  khung: { dau: number; cuoi: number };
  gio: number[];
  toaDo: (phut: number) => number;
  caoMotGio: number;
  thuTuTho: Map<string, number>;
  laHomNay: boolean;
  bayGioPhut: number | null;
  onChonCa: (a: Appointment) => void;
  onBamTrong: ((e: React.MouseEvent<HTMLDivElement>) => void) | null;
  keo: TrangThaiKeo | null;
  datKeo: (v: TrangThaiKeo | null) => void;
  choPhepKeo: boolean;
  choPhepKeoTao: boolean;
  doViTri: (e: React.PointerEvent) => { dateKey: string; phut: number } | null;
}) {
  const t = useTranslations("calendar");

  const cacCa = useMemo(
    () =>
      day.appointments.map((a) => ({
        ca: a,
        startMin: minutesOfDayInTimeZone(a.startAt, timezone),
        endMin: minutesOfDayInTimeZone(a.endAt, timezone),
      })),
    [day.appointments, timezone],
  );
  const cho = useMemo(() => xepChong(cacCa), [cacCa]);
  const ngoaiGio = useMemo(() => layNgoaiGio(day.openRanges, khung), [day.openRanges, khung]);

  return (
    <div
      data-ngay={day.dateKey}
      className={cn(
        "relative flex-1 border-r last:border-r-0",
        COT_NGAY,
        laHomNay && "bg-primary/5",
      )}
      onClick={onBamTrong ?? undefined}
      onPointerDown={(e) => {
        // Chỉ CHUỘT — xem ghi chú về kéo-thả ở đầu file.
        if (!choPhepKeoTao || e.pointerType !== "mouse" || e.button !== 0) return;
        const v = doViTri(e);
        if (!v) return;
        datKeo({ kieu: "tao", dateKey: v.dateKey, phutA: v.phut, phutB: v.phut });
      }}
      role={onBamTrong ? "button" : undefined}
      tabIndex={onBamTrong ? -1 : undefined}
      aria-label={onBamTrong ? t("grid.tapEmpty") : undefined}
    >
      {/* Vạch giờ + vạch nửa giờ nhạt hơn */}
      {gio.map((m) => (
        <div key={m} className="absolute inset-x-0 border-t" style={{ top: toaDo(m) }}>
          <div
            className="absolute inset-x-0 border-t border-dashed border-border/40"
            style={{ top: caoMotGio / 2 }}
          />
        </div>
      ))}

      {/* Ngoài giờ mở cửa: tô xám. Cho biết ngay chỗ nào tiệm đóng, thay vì để
          ô trống trông y hệt ô rảnh. */}
      {ngoaiGio.map((r, i) => (
        <div
          key={i}
          className="pointer-events-none absolute inset-x-0 bg-muted/40"
          style={{ top: toaDo(r.startMin), height: toaDo(r.endMin) - toaDo(r.startMin) }}
        />
      ))}

      {/* Vệt mờ theo tay khi đang kéo một khoảng trống — cho thấy sẽ đặt từ
          mấy giờ tới mấy giờ TRƯỚC KHI hộp tạo lịch mở ra. */}
      {keo?.kieu === "tao" && keo.dateKey === day.dateKey && (
        <div
          className="pointer-events-none absolute inset-x-1 z-10 rounded-[3px] border-2 border-dashed border-primary bg-primary/10"
          style={{
            top: toaDo(Math.min(keo.phutA, keo.phutB)),
            height: Math.max(
              2,
              toaDo(Math.max(keo.phutA, keo.phutB)) - toaDo(Math.min(keo.phutA, keo.phutB)),
            ),
          }}
        >
          <span className="absolute top-0.5 left-1 text-[10px] font-semibold text-primary">
            {formatMinuteLabel(Math.min(keo.phutA, keo.phutB))}–
            {formatMinuteLabel(Math.max(keo.phutA, keo.phutB))}
          </span>
        </div>
      )}

      {cacCa.map((x) => {
        const o = cho.get(x);
        if (!o) return null;
        const daHuy = x.ca.status === "cancelled" || x.ca.status === "no_show";
        const mau = daHuy ? MAU_DA_HUY : mauCuaTho(x.ca.staffEmployeeId, thuTuTho);

        // Đang kéo chính ca này thì VẼ THEO TAY, không vẽ theo dữ liệu — người
        // ta phải thấy nó đi theo con trỏ, nếu không thì không biết mình đang
        // thả vào đâu.
        const dangKeo =
          (keo?.kieu === "di" || keo?.kieu === "dai") && keo.caId === x.ca.id ? keo : null;
        const keoSangCotKhac = dangKeo?.kieu === "di" && dangKeo.dateKey !== day.dateKey;
        const batDau = dangKeo ? dangKeo.phutDau : x.startMin;
        const ketThuc = dangKeo
          ? dangKeo.kieu === "dai"
            ? dangKeo.phutCuoi
            : dangKeo.phutDau + dangKeo.dai
          : x.endMin;

        const cao = Math.max(18, toaDo(ketThuc) - toaDo(batDau));
        // Quá đông ca trùng giờ thì xếp bậc thang thay vì chia đều — xem
        // NGUONG_BAC_THANG ở đầu file.
        const bacThang = !dangKeo && o.soCot > NGUONG_BAC_THANG;
        const hep = o.soCot > 2 || cao < 34;
        // Ca đang được kéo sang cột khác thì cột này không vẽ nó nữa — cột kia
        // sẽ vẽ. Không có luật này thì khối bị nhân đôi khi kéo qua ngày.
        if (keoSangCotKhac) return null;
        const coKeo = choPhepKeo && !daHuy;
        return (
          <button
            key={x.ca.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              // Vừa kéo xong thì cú `click` kết thúc cũng nổ ra — mở bảng chi
              // tiết lúc đó là không ai muốn.
              if (keo !== null) return;
              onChonCa(x.ca);
            }}
            title={`${formatMinuteLabel(x.startMin)}–${formatMinuteLabel(x.endMin)} · ${x.ca.contactName}${
              x.ca.staffName !== "—" ? ` · ${x.ca.staffName}` : ""
            }`}
            className={cn(
              "group/ca absolute overflow-hidden rounded-[3px] border-l-[3px] px-1 py-0.5 text-left",
              dangKeo && "z-20 opacity-90 shadow-lg ring-2 ring-primary",
              mau.vien,
              mau.nen,
              mau.chu,
              daHuy && "line-through decoration-1",
              "hover:z-10 hover:shadow-md focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring",
            )}
            onPointerDown={(e) => {
              if (!coKeo || e.pointerType !== "mouse" || e.button !== 0) return;
              const v = doViTri(e);
              if (!v) return;
              e.stopPropagation();
              const hop = (e.currentTarget as HTMLElement).getBoundingClientRect();
              // Cầm vào 8px cuối = ĐỔI ĐỘ DÀI. Cầm chỗ khác = DỜI.
              if (hop.bottom - e.clientY <= 8) {
                datKeo({
                  kieu: "dai",
                  caId: x.ca.id,
                  dateKey: day.dateKey,
                  phutDau: x.startMin,
                  phutCuoi: x.endMin,
                  phutCuoiGoc: x.endMin,
                });
              } else {
                datKeo({
                  kieu: "di",
                  caId: x.ca.id,
                  dateKey: day.dateKey,
                  ngayGoc: day.dateKey,
                  phutDau: x.startMin,
                  phutDauGoc: x.startMin,
                  dai: Math.max(BUOC_PHUT, x.endMin - x.startMin),
                  lechCam: v.phut - x.startMin,
                });
              }
            }}
            style={{
              top: toaDo(batDau),
              height: cao,
              left: dangKeo
                ? "2px"
                : bacThang
                  ? `${(o.cot / (o.soCot - 1)) * (100 - RONG_KHI_BAC_THANG)}%`
                  : `calc(${(o.cot / o.soCot) * 100}% + 1px)`,
              right: dangKeo ? "2px" : undefined,
              width: dangKeo
                ? undefined
                : bacThang
                  ? `${RONG_KHI_BAC_THANG}%`
                  : `calc(${100 / o.soCot}% - 2px)`,
              // Ca sau đè lên ca trước, nên dải bên trái của mỗi ca luôn lộ ra
              // và bấm được. Rê chuột vào thì nó nhảy lên trên cùng.
              zIndex: dangKeo ? 20 : bacThang ? o.cot + 1 : undefined,
              cursor: coKeo ? (dangKeo ? "grabbing" : "grab") : undefined,
            }}
          >
            <p className="truncate text-[10px] leading-tight font-semibold">
              {formatMinuteLabel(batDau)} {x.ca.contactName}
            </p>
            {!hep && (
              <p className="truncate text-[10px] leading-tight opacity-80">
                {dangKeo
                  ? `→ ${formatMinuteLabel(batDau)}–${formatMinuteLabel(ketThuc)}`
                  : (x.ca.serviceName ?? t("grid.noService"))}
              </p>
            )}
            {/* Tay cầm mép dưới để đổi độ dài. Chỉ hiện khi rê chuột tới —
                lúc nào cũng hiện thì lưới đầy vạch. */}
            {coKeo && (
              <span className="absolute inset-x-0 bottom-0 hidden h-2 cursor-ns-resize items-center justify-center group-hover/ca:flex">
                <span className="h-0.5 w-4 rounded-full bg-current opacity-40" />
              </span>
            )}
          </button>
        );
      })}

      {/* Đường BÂY GIỜ — chỉ vẽ trên cột hôm nay, và chỉ khi giờ hiện tại nằm
          trong khung đang vẽ. Vẽ ở mọi cột thì bảy vạch đỏ vô nghĩa. */}
      {laHomNay && bayGioPhut !== null && bayGioPhut >= khung.dau && bayGioPhut <= khung.cuoi && (
        <div
          className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500"
          style={{ top: toaDo(bayGioPhut) }}
        >
          <span className="absolute -top-[5px] -left-[3px] size-2 rounded-full bg-red-500" />
        </div>
      )}
    </div>
  );
}

/** Các quãng NGOÀI giờ mở cửa trong khung đang vẽ. */
function layNgoaiGio(
  openRanges: { startMin: number; endMin: number }[],
  khung: { dau: number; cuoi: number },
) {
  if (openRanges.length === 0) return [{ startMin: khung.dau, endMin: khung.cuoi }];
  const xep = [...openRanges].sort((a, b) => a.startMin - b.startMin);
  const ra: { startMin: number; endMin: number }[] = [];
  let moc = khung.dau;
  for (const r of xep) {
    if (r.startMin > moc) ra.push({ startMin: moc, endMin: Math.min(r.startMin, khung.cuoi) });
    moc = Math.max(moc, r.endMin);
  }
  if (moc < khung.cuoi) ra.push({ startMin: moc, endMin: khung.cuoi });
  return ra.filter((r) => r.endMin > r.startMin);
}

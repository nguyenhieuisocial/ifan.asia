"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AtSign,
  Bell,
  BellOff,
  Bookmark,
  ChevronLeft,
  Hash,
  Lock,
  MessageSquarePlus,
  Plus,
  MessageSquare,
  Paperclip,
  Pencil,
  Pin,
  Search,
  Send,
  Trash2,
  X,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { HopGomTin, type LoaiHop } from "./hop-gom-tin";
import { OChonTep } from "./o-chon-tep";
import { coDocDuoc, laAnh, type TepDinhKem } from "./tep-dinh-kem";
import { WEEKDAY_SHORT_VN } from "@/lib/format";
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
  taiLuong,
  taoKenhChuDe,
  thaCamXuc,
  ghimTin,
  luuTin,
  datMucBao,
} from "./actions";
import {
  BADGE_MAX,
  CAM_XUC_NHANH,
  EDIT_WINDOW_MS,
  MAX_BODY_LENGTH,
  MAX_TEN_KENH,
  MESSAGE_LIMIT,
  ngayCuaTin,
  type MucBao,
  chuanHoaTenKenh,
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
  timezone,
  todayKey,
  canWrite,
  canManageChannels,
  kenhBanDau,
}: {
  loadFailed: boolean;
  kenh: ChatKenh[];
  thanhVien: ChatMember[];
  currentUserId: string;
  /** Để nghe kênh tin tức tức thời `tenant:{id}:chat` (#303). */
  tenantId: string;
  /** Múi giờ tiệm — mốc ngày phải theo giờ TIỆM, không theo giờ máy chủ. */
  timezone: string;
  todayKey: string;
  /** Khớp RLS — mọi vai TRỪ viewer. */
  canWrite: boolean;
  /** Chỉ chủ/quản trị/quản lý tạo được kênh chủ đề — khớp chính sách `chat_channels_insert`. */
  canManageChannels: boolean;
  kenhBanDau: string | null;
}) {
  // Nghe kênh riêng của tiệm — tin tới là tải lại đúng cuộc đang mở (#303).
  useChatRealtime(tenantId);

  const t = useTranslations("chatRieng");
  const tCommon = useTranslations("common");
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
  /** Ảnh/tệp đã tải lên xong, đang chờ bấm Gửi. */
  const [tepDaChon, datTepDaChon] = useState<TepDinhKem[]>([]);
  const [dangSuaId, datDangSuaId] = useState<string | null>(null);
  const [nhapSua, datNhapSua] = useState("");
  const [pending, batDau] = useTransition();
  // Nhịp đếm để nút "Sửa" TỰ BIẾN MẤT khi hết 15 phút, không phải bấm rồi mới báo lỗi.
  const router = useRouter();
  const [nowMs, datNowMs] = useState(() => Date.now());
  /** Tin gốc đang mở luồng — null nghĩa là bảng luồng đóng. */
  const [luongCua, datLuongCua] = useState<string | null>(null);
  const [nhapLuong, datNhapLuong] = useState("");

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

  /** Câu trả lời của luồng đang mở. Tách khỏi truy vấn chính có chủ đích —
   *  dòng kênh không kéo theo mọi câu trả lời của mọi luồng. */
  const luongQuery = useQuery({
    queryKey: ["chat-luong", luongCua],
    queryFn: () => taiLuong({ parentId: luongCua as string }),
    enabled: luongCua !== null,
    refetchInterval: 120_000,
  });

  const baoLoi = (ma: string) => toast.error(t(`errors.${ma}`));
  const taiLai = () => query.refetch().then(() => undefined);
  const taiLaiLuong = () => luongQuery.refetch().then(() => undefined);
  const lamMoiKenh = () => router.refresh();

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

  /**
   * ⚠️ Ba nhánh, KHÔNG phải hai. Bản trước chỉ biết 'team' và 'dm', nên mọi kênh
   *   chủ đề rơi xuống nhánh cuối và hiện chữ chung "Cuộc trò chuyện" — năm kênh
   *   khác nhau trông y hệt nhau, không cách nào phân biệt.
   *   Tốn ba lượt sửa nhầm mới tìm ra, vì phép thử chỉ nói "không thấy tên kênh"
   *   và tôi đọc thành "danh sách chưa làm mới". Bài học: khi phép thử báo KHÔNG
   *   THẤY một chữ, hãy in ra thứ ĐANG hiện ở đó trước khi đoán vì sao.
   */
  const tenKenh = (c: ChatKenh) =>
    c.kind === "team"
      ? t("teamChannel")
      : c.kind === "topic"
        ? (c.ten ?? t("unknownChannel"))
        : (c.doiPhuongTen ?? t("unknownChannel"));

  const soChuaDoc = (c: ChatKenh) => (daXem.has(c.id) ? 0 : c.soChuaDoc);

  const kenhDangChon = dsKenh.find((c) => c.id === dangChon) ?? null;

  /** Người chưa có kênh riêng nào với mình. */
  const nguoiChuaCoKenh = useMemo(() => {
    const daCo = new Set(dsKenh.filter((c) => c.kind === "dm").map((c) => c.doiPhuongUserId));
    return thanhVien.filter((m) => m.userId !== currentUserId && !daCo.has(m.userId));
  }, [dsKenh, thanhVien, currentUserId]);

  /**
   * GOI Y @TEN - chi hien khi nguoi ta dang go mot tu bat dau bang @.
   *
   * Doc phan chu TRUOC con tro chu khong doc ca o soan: go "@bich" o giua cau
   * van phai ra goi y, va da chon xong roi thi goi y phai TAT di.
   */
  const [viTriCon, datViTriCon] = useState(0);
  const goiY = useMemo(() => {
    const truoc = nhap.slice(0, viTriCon);
    const m = /@([\p{L}\p{N} ]{0,30})$/u.exec(truoc);
    if (!m) return [];
    const tu = m[1].trim().toLowerCase();
    const nguoi = thanhVien
      .filter((x) => x.userId !== currentUserId)
      .filter((x) => tu.length === 0 || x.displayName.toLowerCase().includes(tu))
      .slice(0, 6);
    // "Cả tiệm" đứng ĐẦU danh sách và chỉ hiện với chủ/quản trị/quản lý —
    // đúng tập vai mà máy chủ chấp nhận. Giấu nút ở đây chỉ là mặt tiền cho
    // khớp; chốt thật nằm ở `guiTinChat`.
    const caTiem =
      canManageChannels && ("cả-tiệm".includes(tu) || "ca tiem".includes(tu) || tu.length === 0)
        ? [{ userId: "__ca-tiem__", displayName: "cả-tiệm" }]
        : [];
    return [...caTiem, ...nguoi];
  }, [nhap, viTriCon, thanhVien, currentUserId, canManageChannels]);

  function chonGoiY(ten: string) {
    const truoc = nhap.slice(0, viTriCon);
    const sau = nhap.slice(viTriCon);
    const m = /@([\p{L}\p{N} ]{0,30})$/u.exec(truoc);
    if (!m) return;
    const dauAt = truoc.length - m[0].length;
    const moi = `${nhap.slice(0, dauAt)}@${ten} ${sau}`;
    datNhap(moi);
    datViTriCon(dauAt + ten.length + 2);
  }

  const [timKenh, datTimKenh] = useState("");
  /** Tin đã ghim của kênh đang mở — dựng từ chính danh sách tin đang tải. */
  const cacTinGhim = useMemo(
    () => (query.data?.messages ?? []).filter((x) => x.ghimLuc && !x.deletedAt),
    [query.data],
  );

  /** Hộp gom tin đang mở (nếu có) — thay chỗ khung tin của kênh. */
  const [hop, datHop] = useState<LoaiHop | null>(null);

  const [taoKenhMo, datTaoKenhMo] = useState(false);
  const [tenKenhMoi, datTenKenhMoi] = useState("");
  const [moTaKenhMoi, datMoTaKenhMoi] = useState("");
  const [hanCheMoi, datHanCheMoi] = useState(false);

  const khop = (chu: string) =>
    timKenh.trim().length === 0 ||
    chu.toLowerCase().includes(timKenh.trim().toLowerCase());

  /** Ba nhóm, đúng thứ tự Slack bày: kênh cả tiệm · kênh chủ đề · nhắn riêng. */
  const NHOM = ["team", "topic", "dm"] as const;
  const kenhTheoNhom = useMemo(() => {
    const ra: Record<(typeof NHOM)[number], typeof dsKenh> = { team: [], topic: [], dm: [] };
    for (const c of dsKenh) {
      const ten = c.kind === "team" ? t("teamChannel") : (c.ten ?? c.doiPhuongTen ?? "");
      if (khop(ten)) ra[c.kind].push(c);
    }
    return ra;
    // `khop` đọc `timKenh`; liệt kê thẳng nó để không phải bọc `khop` bằng
    // useCallback chỉ để làm vừa lòng quy tắc phụ thuộc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dsKenh, timKenh, t]);

  /** Người chưa có kênh riêng — CHỈ hiện khi đang gõ tìm. */
  const nguoiHopTim = useMemo(
    () =>
      timKenh.trim().length === 0
        ? []
        : nguoiChuaCoKenh.filter((m) => khop(m.displayName)).slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nguoiChuaCoKenh, timKenh],
  );

  function taoKenh() {
    const ten = tenKenhMoi.trim();
    if (ten.length === 0) return;
    batDau(async () => {
      const res = await taoKenhChuDe({
        ten,
        moTa: moTaKenhMoi.trim() || null,
        hanChe: hanCheMoi,
      });
      if (res.error) {
        baoLoi(res.error);
        return;
      }
      toast.success(t("createChannel.created"));
      datTaoKenhMo(false);
      datTenKenhMoi("");
      datMoTaKenhMoi("");
      datHanCheMoi(false);
      // Đặt kênh đang chọn TRƯỚC rồi mới làm mới, để lúc danh sách mới về thì
      // kênh vừa tạo đã nằm sẵn trong trạng thái và màn khớp ngay.
      if (res.channelId) {
        datDangChon(res.channelId);
        datDaXem((truoc) => new Set(truoc).add(res.channelId as string));
        datHienDanhSach(false);
        window.history.replaceState(null, "", `/app/chat?c=${res.channelId}`);
      }
      lamMoiKenh();
    });
  }

  /** Ghim hoặc gỡ ghim — cho CẢ KÊNH. */
  function doiGhim(messageId: string, ghim: boolean) {
    batDau(async () => {
      const res = await ghimTin({ messageId, ghim });
      if (res.error) {
        baoLoi(res.error);
        return;
      }
      toast.success(ghim ? t("pin.done") : t("pin.undone"));
      void query.refetch();
    });
  }

  /**
   * Để đọc sau — RIÊNG mình.
   *
   * Khác hẳn ghim: ghim là cho cả kênh, cái này chỉ mình thấy (chủ tiệm cũng
   * không đọc được, chốt ở RLS). Nhân viên đang bận với khách thì đánh dấu,
   * tối xem lại.
   */
  function doiLuu(messageId: string, luu: boolean) {
    batDau(async () => {
      const res = await luuTin({ messageId, luu });
      if (res.error) {
        baoLoi(res.error);
        return;
      }
      toast.success(luu ? t("save.done") : t("save.undone"));
      void query.refetch();
    });
  }

  /** Đổi mức thông báo của MÌNH cho một kênh. */
  function doiMucBao(channelId: string, muc: MucBao) {
    batDau(async () => {
      const res = await datMucBao({ channelId, muc });
      if (res.error) {
        baoLoi(res.error);
        return;
      }
      toast.success(t(`notify.saved.${muc}`));
      lamMoiKenh();
    });
  }

  function doiCamXuc(messageId: string, emoji: string) {
    batDau(async () => {
      const res = await thaCamXuc({ messageId, emoji });
      if (res.error) {
        baoLoi(res.error);
        return;
      }
      await taiLai();
      if (luongCua) await taiLaiLuong();
    });
  }

  function guiTraLoi() {
    const body = nhapLuong.trim();
    if (body.length === 0 || luongCua === null || dangChon === null) return;
    batDau(async () => {
      const res = await guiTinChat({ channelId: dangChon, body, parentId: luongCua });
      if (res.error) {
        baoLoi(res.error);
        return;
      }
      datNhapLuong("");
      await Promise.all([taiLai(), taiLaiLuong()]);
    });
  }

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
    // Có tệp thì lời nhắn được phép rỗng — bắt gõ chữ mới gửi được ảnh là bắt
    // người ta gõ "đây" hoặc "ảnh nè".
    if ((!body && tepDaChon.length === 0) || dangChon === null) return;
    batDau(async () => {
      const res = await guiTinChat({
        channelId: dangChon,
        body,
        tep: tepDaChon.length > 0 ? tepDaChon : undefined,
      });
      // `mentionFailed` nghĩa là TIN ĐÃ GHI, chỉ khâu gọi tên hỏng. Xử như lỗi
      // gửi (giữ nguyên ô soạn) thì người dùng bấm gửi lần nữa ⇒ hai tin.
      if (res.error && res.error !== "mentionFailed") {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      datNhap("");
      datTepDaChon([]);
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

        {/* Ba HỘP GOM TIN vắt qua mọi kênh. "Nhắc tới tôi" là chỗ người ta mở
            đầu tiên mỗi sáng — bảng dữ liệu đã có từ lâu nhưng chưa màn nào
            bày ra, nên câu hỏi "có ai gọi mình không" vẫn phải trả lời bằng
            cách bấm vào từng kênh. */}
        <div className="flex gap-1 border-b px-3 py-2">
          {(
            [
              ["nhac", AtSign, t("box.mentions")],
              ["luu", Bookmark, t("box.saved")],
            ] as const
          ).map(([ma, Bieu, nhan]) => (
            <button
              key={ma}
              type="button"
              onClick={() => {
                datHop(hop === ma ? null : ma);
                datHienDanhSach(false);
              }}
              className={cn(
                "flex min-h-8 flex-1 items-center justify-center gap-1 rounded-md border text-[12px] font-medium max-md:min-h-11",
                hop === ma ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              <Bieu className="size-3.5" />
              <span className="truncate">{nhan}</span>
            </button>
          ))}
        </div>

        {/* Ô TÌM thay cho bảng chip. Bản trước bày MỌI người của tiệm thành
            chip ở cột trái: 20 người là ba hàng chip, 60 người thì không dùng
            nổi. Slack không bày ai cả — gõ tên thì hiện ra. */}
        <div className="border-b px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={timKenh}
              onChange={(e) => datTimKenh(e.target.value)}
              onKeyDown={(e) => {
                // Gõ để LỌC KÊNH; bấm Enter để TÌM TRONG TIN NHẮN. Hai việc
                // khác nhau nhưng cùng một ô: người ta gõ tên rồi mới quyết
                // định mình đang tìm kênh hay tìm câu nói.
                if (e.key === "Enter" && timKenh.trim().length >= 2) {
                  datHop("tim");
                  datHienDanhSach(false);
                }
              }}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="h-8 pl-8 text-[12px] max-md:h-11"
            />
          </div>
          {timKenh.trim().length >= 2 && (
            <button
              type="button"
              onClick={() => {
                datHop("tim");
                datHienDanhSach(false);
              }}
              className="mt-1 w-full rounded-md border border-dashed py-1.5 text-[11px] text-muted-foreground hover:bg-muted max-md:min-h-11"
            >
              {t("box.searchFor", { q: timKenh.trim() })}
            </button>
          )}
        </div>

        {NHOM.map((nhom) => {
          const trong = kenhTheoNhom[nhom];
          const nguoiThem = nhom === "dm" ? nguoiHopTim : [];
          // Nhóm "Kênh" LUÔN hiện với người có quyền tạo — kể cả khi tiệm chưa
          // có kênh chủ đề nào. Nút "+" nằm trong tiêu đề nhóm, nên ẩn nhóm
          // rỗng đi là chôn luôn đường tạo kênh đầu tiên.
          // Đây đúng loại lỗi chỉ lộ khi mở màn thật ra nhìn: mọi cổng đều
          // xanh, mà tính năng vừa làm thì không có cách nào dùng tới.
          const luonHien = nhom === "topic" && canManageChannels;
          if (trong.length === 0 && nguoiThem.length === 0 && !luonHien) return null;
          return (
            <div key={nhom}>
              <p className="flex items-center gap-1.5 px-3 pt-3 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t(`group.${nhom}`)}
                {nhom === "topic" && canManageChannels && (
                  <button
                    type="button"
                    onClick={() => datTaoKenhMo(true)}
                    className="ml-auto flex size-5 items-center justify-center rounded hover:bg-muted max-md:size-8"
                    aria-label={t("createChannel.open")}
                    title={t("createChannel.open")}
                  >
                    <Plus className="size-3.5" />
                  </button>
                )}
              </p>
              <ul>
                {trong.map((c) => {
                  const chuaDoc = soChuaDoc(c);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => chonKenh(c.id)}
                        aria-label={
                          chuaDoc > 0
                            ? t("unreadAria", { name: tenKenh(c), count: chuaDoc })
                            : undefined
                        }
                        className={cn(
                          // 44px là ngưỡng vùng bấm trên điện thoại.
                          "flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/60 md:min-h-8",
                          dangChon === c.id && "bg-primary text-primary-foreground",
                        )}
                      >
                        {c.kind === "dm" ? (
                          <User className="size-3.5 shrink-0 opacity-70" />
                        ) : c.hanChe ? (
                          <Lock className="size-3.5 shrink-0 opacity-70" />
                        ) : (
                          <Hash className="size-3.5 shrink-0 opacity-70" />
                        )}
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-[13px]",
                            chuaDoc > 0 ? "font-bold" : "font-medium",
                          )}
                        >
                          {tenKenh(c)}
                        </span>
                        {chuaDoc > 0 && (
                          <span
                            aria-hidden
                            className={cn(
                              "flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold",
                              dangChon === c.id
                                ? "bg-primary-foreground text-primary"
                                : "bg-destructive text-white",
                            )}
                          >
                            {chuaDoc > BADGE_MAX ? `${BADGE_MAX}+` : chuaDoc}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}

                {nhom === "topic" && trong.length === 0 && (
                  <li className="px-3 pb-1 text-[11px] leading-relaxed text-muted-foreground">
                    {t("group.topicEmpty")}
                  </li>
                )}
                {/* Người CHƯA có kênh riêng — chỉ hiện khi đang gõ tìm. Không gõ
                    gì thì danh sách đứng yên, đúng lối Slack. */}
                {nguoiThem.map((m) => (
                  <li key={m.userId}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => moRiengVoi(m.userId)}
                      className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left text-muted-foreground hover:bg-muted/60 disabled:opacity-60 md:min-h-8"
                    >
                      <MessageSquarePlus className="size-3.5 shrink-0 opacity-70" />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{m.displayName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </aside>

      {/* ── Cột phải: HỘP GOM TIN, nếu đang mở ───────────────────────── */}
      {hop !== null && (
        <div
          className={cn(
            "min-w-0 flex-1 flex-col overflow-hidden md:flex",
            hienDanhSach ? "hidden" : "flex",
          )}
        >
          <HopGomTin
            loai={hop}
            tuKhoa={timKenh.trim()}
            locale={locale}
            tenCuaNguoi={tenCuaNguoi}
            tenKenhCua={(x) =>
              x.kenhKind === "team"
                ? t("teamChannel")
                : x.kenhKind === "topic"
                  ? (x.tenKenh ?? t("unknownChannel"))
                  : (tenCuaNguoi(x.doiPhuongUserId ?? "") ?? t("unknownChannel"))
            }
            onChonKenh={(id) => {
              datHop(null);
              chonKenh(id);
            }}
            onDong={() => datHop(null)}
          />
        </div>
      )}

      {/* ── Cột phải: khung tin ────────────────────────────────────────── */}
      <section
        className={cn(
          "min-w-0 flex-1 flex-col overflow-hidden",
          hop !== null ? "hidden" : hienDanhSach ? "hidden md:flex" : "flex md:flex",
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
              {kenhDangChon.kind === "dm" ? (
                <User className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <Hash className="size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{tenKenh(kenhDangChon)}</p>
                {kenhDangChon.moTa && (
                  <p className="truncate text-[11px] text-muted-foreground">{kenhDangChon.moTa}</p>
                )}
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground max-sm:hidden">
                {t("customerCannotSee")}
              </span>

              {/* MỨC THÔNG BÁO của kênh này — riêng từng người.
                  ⚠️ Không có nó thì người bị một kênh ồn làm phiền sẽ tắt thông
                  báo CẢ ứng dụng, và lúc đó lời nhắc lịch hẹn chết theo. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("notify.title")}
                    title={t(`notify.${kenhDangChon.mucBao}`)}
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-muted max-md:size-11",
                      kenhDangChon.mucBao === "all" ? "text-muted-foreground" : "text-primary",
                    )}
                  >
                    {kenhDangChon.mucBao === "off" ? (
                      <BellOff className="size-4" />
                    ) : (
                      <Bell className="size-4" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{t("notify.title")}</DropdownMenuLabel>
                  {/* ⚠️ CHỈ HAI lựa chọn, cố ý. Cơ sở dữ liệu nhận ba mức,
                      nhưng hôm nay thông báo CHỈ sinh ra khi có người gọi tên
                      — tin thường không báo cho ai. Nên "mọi tin nhắn" và
                      "chỉ khi bị gọi tên" sẽ hành xử y hệt nhau, và bày cả
                      hai ra là bày một lựa chọn không có thật.
                      Không làm cho "mọi tin nhắn" báo thật: một kênh cả tiệm
                      nhắn cả ngày mà tin nào cũng đẩy thông báo thì trong hai
                      ngày mọi người tắt thông báo hệ thống, và lời nhắc lịch
                      hẹn chết theo. */}
                  {(["mentions", "off"] as const).map((m) => {
                    // Bản cũ có thể đã ghi "all"; đọc nó như "mentions".
                    const dangChonMuc = kenhDangChon.mucBao === "off" ? "off" : "mentions";
                    return (
                      <DropdownMenuItem
                        key={m}
                        onSelect={() => doiMucBao(kenhDangChon.id, m)}
                        className={cn(dangChonMuc === m && "font-semibold")}
                      >
                        {dangChonMuc === m ? "● " : "○ "}
                        {t(`notify.${m}`)}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
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
                  {/* Dải GHIM — việc quan trọng của kênh nằm ở trên cùng,
                      không trôi mất. "Số điện thoại thợ trực cuối tuần", "mã
                      wifi", "khách VIP cần lưu ý" — những thứ hỏi lại mỗi
                      tuần. */}
                  {cacTinGhim.length > 0 && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950/40">
                      <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-wide text-amber-900 uppercase dark:text-amber-200">
                        <Pin className="size-3" />
                        {t("pin.title", { count: cacTinGhim.length })}
                      </p>
                      <ul className="space-y-1">
                        {cacTinGhim.map((tin) => (
                          <li key={tin.id} className="flex items-start gap-2">
                            <p className="min-w-0 flex-1 text-[12px] leading-relaxed break-words">
                              <span className="font-medium">{tenCuaNguoi(tin.senderUserId)}</span>
                              {" \u00b7 "}
                              <span>{tin.body}</span>
                            </p>
                            {canWrite && (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => doiGhim(tin.id, false)}
                                aria-label={t("pin.remove")}
                                title={t("pin.remove")}
                                className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-amber-100 max-md:size-9 dark:hover:bg-amber-900/50"
                              >
                                <X className="size-3.5" />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {load.atLimit && (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {t("limitNote", { n: MESSAGE_LIMIT })}
                    </p>
                  )}
                  {load.messages.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground">{t("empty")}</p>
                  ) : (
                    <ul className="space-y-2">
                      {load.messages.map((tin, i) => (
                        <Fragment key={tin.id}>
                          {/* MỐC NGÀY. Trước đây mỗi tin chỉ có giờ, nên hai
                              tin cách nhau ba ngày trông như liền nhau — đọc
                              lại một cuộc trao đổi cũ thì không biết chuyện gì
                              xảy ra hôm nào. */}
                          {(i === 0 ||
                            ngayCuaTin(load.messages[i - 1].createdAt, timezone) !==
                              ngayCuaTin(tin.createdAt, timezone)) && (
                            <li className="flex items-center gap-2 pt-1.5" aria-hidden={false}>
                              <span className="h-px flex-1 bg-border" />
                              <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                                {nhanNgay(tin.createdAt, timezone, todayKey, t)}
                              </span>
                              <span className="h-px flex-1 bg-border" />
                            </li>
                          )}
                          {/* `group/tin` là chỗ neo cho nhóm nút ẩn — nó chỉ
                              hiện khi con trỏ vào ĐÚNG dòng tin này. */}
                          <li key={tin.id} className="group/tin flex gap-2">
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

                            {/* CẢM XÚC đã thả — 👍 thay cho một câu "đã đọc",
                                ✅ thay cho "em làm rồi". Bấm lại lên cái mình
                                đã thả là gỡ. */}
                            {/* ẢNH / TỆP ĐÍNH KÈM.
                                ⚠️ Ảnh hiện thẳng, tệp khác hiện thành một dòng
                                bấm được. Bắt bấm mới xem được ảnh là mất hẳn
                                cái lợi của việc gửi ảnh trong chat. */}
                            {tin.tep.length > 0 && !tin.deletedAt && (
                              <ul className="flex flex-wrap gap-1.5 pt-1">
                                {tin.tep.map((tp) => (
                                  <li key={tp.id}>
                                    {tp.duongDan === null ? (
                                      /* Ký đường dẫn hỏng — NÓI RA. Ẩn đi thì
                                         người gửi thấy ảnh của mình biến mất. */
                                      <span className="flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 text-[11px] text-muted-foreground">
                                        <Paperclip className="size-3" />
                                        {t("file.cannotOpen", { ten: tp.ten })}
                                      </span>
                                    ) : laAnh(tp.loai) ? (
                                      <a
                                        href={tp.duongDan}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block overflow-hidden rounded-md border"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={tp.duongDan}
                                          alt={tp.ten}
                                          loading="lazy"
                                          className="max-h-56 max-w-full object-cover"
                                        />
                                      </a>
                                    ) : (
                                      <a
                                        href={tp.duongDan}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex min-h-8 items-center gap-1.5 rounded-md border px-2 text-[11px] hover:bg-muted max-md:min-h-11"
                                      >
                                        <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                                        <span className="max-w-40 truncate">{tp.ten}</span>
                                        <span className="shrink-0 text-muted-foreground">
                                          {coDocDuoc(tp.co)}
                                        </span>
                                      </a>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}

                            {tin.camXuc.length > 0 && !tin.deletedAt && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {tin.camXuc.map((cx) => (
                                  <button
                                    key={cx.emoji}
                                    type="button"
                                    disabled={!canWrite || pending}
                                    onClick={() => doiCamXuc(tin.id, cx.emoji)}
                                    aria-label={t("reaction.aria", {
                                      emoji: cx.emoji,
                                      count: cx.soNguoi,
                                    })}
                                    className={cn(
                                      "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none max-md:min-h-8 max-md:px-2.5",
                                      cx.toiDaTha
                                        ? "border-primary bg-primary/10 font-semibold text-primary"
                                        : "text-muted-foreground hover:bg-muted/60",
                                    )}
                                  >
                                    <span aria-hidden>{cx.emoji}</span>
                                    <span className="tabular-nums">{cx.soNguoi}</span>
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* LUỒNG TRẢ LỜI — nếu tin đã có trả lời thì hiện số
                                đếm; chưa có thì nút nằm trong nhóm nút bên dưới. */}
                            {tin.soTraLoi > 0 && !tin.deletedAt && (
                              <button
                                type="button"
                                onClick={() => datLuongCua(tin.id)}
                                className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline max-md:min-h-8"
                              >
                                <MessageSquare className="size-3.5" />
                                {t("thread.count", { count: tin.soTraLoi })}
                                {tin.traLoiCuoiLuc && (
                                  <span className="font-normal text-muted-foreground">
                                    · {t("thread.lastAt", { time: formatTime(tin.traLoiCuoiLuc, locale) })}
                                  </span>
                                )}
                              </button>
                            )}

                            {dangSuaId !== tin.id && (
                              <NutTin
                                onGhim={() => doiGhim(tin.id, !tin.ghimLuc)}
                                onLuu={() => doiLuu(tin.id, !tin.daLuu)}
                                tin={tin}
                                cuaToi={tin.senderUserId === currentUserId}
                                nowMs={nowMs}
                                pending={pending}
                                canWrite={canWrite}
                                onSua={() => {
                                  datDangSuaId(tin.id);
                                  datNhapSua(tin.body);
                                }}
                                onXoa={() => xoa(tin.id)}
                                onTraLoi={() => datLuongCua(tin.id)}
                                onCamXuc={(emoji) => doiCamXuc(tin.id, emoji)}
                              />
                            )}
                          </div>
                        </li>
                        </Fragment>
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
                  onChange={(e) => {
                    datNhap(e.target.value);
                    datViTriCon(e.target.selectionStart ?? e.target.value.length);
                  }}
                  onKeyUp={(e) => datViTriCon(e.currentTarget.selectionStart ?? 0)}
                  onClick={(e) => datViTriCon(e.currentTarget.selectionStart ?? 0)}
                  placeholder={t("placeholder")}
                  maxLength={MAX_BODY_LENGTH}
                  rows={2}
                />
                {/* GO @ de goi ten - khong bay san bang chip.
                    Ban truoc in MOI nguoi cua tiem thanh chip ngay duoi o soan:
                    20 nguoi la ba hang chip, 60 nguoi thi khong dung noi. Slack
                    khong bay ai ca; go @ thi danh sach hien ra, va no LOC theo
                    chu dang go nen chon nhanh hon han viec do mat tim trong mot
                    bang day ten. */}
                {goiY.length > 0 && (
                  <ul className="max-h-40 overflow-y-auto rounded-md border bg-card py-1">
                    {goiY.map((m) => (
                      <li key={m.userId}>
                        <button
                          type="button"
                          onClick={() => chonGoiY(m.displayName)}
                          className="flex min-h-11 w-full items-center gap-2 px-2.5 text-left text-[13px] hover:bg-muted md:min-h-8"
                        >
                          <AtSign
                            className={cn(
                              "size-3.5 shrink-0",
                              m.userId === "__ca-tiem__" ? "text-primary" : "text-muted-foreground",
                            )}
                          />
                          <span className="truncate">{m.displayName}</span>
                          {m.userId === "__ca-tiem__" && (
                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                              {t("mentionAll.hint")}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <OChonTep
                  tenantId={tenantId}
                  daChon={tepDaChon}
                  datDaChon={datTepDaChon}
                  tatCa={!canWrite}
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t("mentionNote")}
                  </p>
                  <Button
                    size="sm"
                    disabled={pending || (!nhap.trim() && tepDaChon.length === 0)}
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

      {/* -- Cot thu ba: LUONG TRA LOI --
          Chi mo khi bam vao mot tin. Tren dien thoai no CHIEM CA MAN thay vi
          nam canh - ba cot trong 375px la khong doc noi, va luong la thu nguoi
          ta dang tap trung vao luc do. */}
      {luongCua !== null && (
        <aside className="fixed inset-0 z-30 flex flex-col border-l bg-background md:static md:z-auto md:w-80 md:shrink-0">
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{t("thread.title")}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {kenhDangChon ? tenKenh(kenhDangChon) : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                datLuongCua(null);
                datNhapLuong("");
              }}
              aria-label={t("thread.close")}
              className="flex size-9 items-center justify-center rounded-md hover:bg-muted max-md:size-11"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2.5">
            {luongQuery.data?.error ? (
              <p className="rounded-md border border-dashed p-2.5 text-[12px] text-muted-foreground">
                {t(`errors.${luongQuery.data.error}`)}
              </p>
            ) : luongQuery.data === undefined ? (
              <p className="text-[12px] text-muted-foreground">{t("loading")}</p>
            ) : luongQuery.data.messages.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">{t("thread.empty")}</p>
            ) : (
              <ul className="space-y-2">
                {luongQuery.data.messages.map((tin) => (
                  <li key={tin.id} className="flex gap-2">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                      {(tenCuaNguoi(tin.senderUserId)[0] ?? "?").toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {tenCuaNguoi(tin.senderUserId)}
                        </span>
                        {" \u00b7 "}
                        <span title={formatDateTime(tin.createdAt, locale)}>
                          {formatTime(tin.createdAt, locale)}
                        </span>
                      </p>
                      {tin.deletedAt ? (
                        <p className="text-[12px] text-muted-foreground italic">
                          {t("deletedTrace", { time: formatTime(tin.deletedAt, locale) })}
                        </p>
                      ) : (
                        <p className="text-[13px] leading-relaxed break-words whitespace-pre-wrap">
                          {tin.body}
                        </p>
                      )}
                      {tin.camXuc.length > 0 && !tin.deletedAt && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {tin.camXuc.map((cx) => (
                            <button
                              key={cx.emoji}
                              type="button"
                              disabled={!canWrite || pending}
                              onClick={() => doiCamXuc(tin.id, cx.emoji)}
                              aria-label={t("reaction.aria", { emoji: cx.emoji, count: cx.soNguoi })}
                              className={cn(
                                "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none max-md:min-h-8 max-md:px-2.5",
                                cx.toiDaTha
                                  ? "border-primary bg-primary/10 font-semibold text-primary"
                                  : "text-muted-foreground hover:bg-muted/60",
                              )}
                            >
                              <span aria-hidden>{cx.emoji}</span>
                              <span className="tabular-nums">{cx.soNguoi}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canWrite && (
            <div className="space-y-1.5 border-t px-3 py-2.5">
              <Textarea
                value={nhapLuong}
                onChange={(e) => datNhapLuong(e.target.value)}
                placeholder={t("thread.placeholder")}
                maxLength={MAX_BODY_LENGTH}
                rows={2}
              />
              <Button
                size="sm"
                className="w-full max-md:min-h-11"
                disabled={pending || nhapLuong.trim().length === 0}
                onClick={guiTraLoi}
              >
                <Send className="size-3.5" />
                {t("send")}
              </Button>
            </div>
          )}
        </aside>
      )}

      {/* -- Hop TAO KENH -- */}
      <Dialog open={taoKenhMo} onOpenChange={datTaoKenhMo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createChannel.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ten-kenh">{t("createChannel.nameLabel")}</Label>
              <div className="flex items-center gap-1.5">
                <Hash className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  id="ten-kenh"
                  value={tenKenhMoi}
                  onChange={(e) => datTenKenhMoi(chuanHoaTenKenh(e.target.value))}
                  placeholder={t("createChannel.namePlaceholder")}
                  maxLength={MAX_TEN_KENH}
                />
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("createChannel.nameHint")}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="mo-ta-kenh">{t("createChannel.descLabel")}</Label>
              <Input
                id="mo-ta-kenh"
                value={moTaKenhMoi}
                onChange={(e) => datMoTaKenhMoi(e.target.value)}
                placeholder={t("createChannel.descPlaceholder")}
                maxLength={200}
              />
            </div>
            <label className="flex items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={hanCheMoi}
                onChange={(e) => datHanCheMoi(e.target.checked)}
                className="mt-0.5 size-4 shrink-0"
              />
              <span>{t("createChannel.restrictedLabel")}</span>
            </label>
            {/* Cau nay hien NGAY LUC TAO, khong giau vao dau ca. Goi mot cho la
                "rieng tu" trong khi chu tiem doc duoc la noi doi nguoi dung -
                tha noi thang va de ho tu quyet co dung hay khong. */}
            {hanCheMoi && (
              <p className="rounded-md bg-amber-50 p-2.5 text-[12px] leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {t("createChannel.restrictedNote")}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => datTaoKenhMo(false)} disabled={pending}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={taoKenh} disabled={pending || tenKenhMoi.trim().length === 0}>
              {t("createChannel.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Nút Sửa/Xoá. "Sửa" chỉ hiện với TIN CỦA CHÍNH MÌNH và còn trong 15 phút.
 * Chủ tiệm cũng không sửa/xoá được tin người khác — chat là bằng chứng ai bảo
 * làm gì. Chốt thật nằm ở policy `chat_messages_update_own`; đây là mặt tiền.
 */
/**
 * Nhóm nút của một tin — ẨN, chỉ hiện khi rê chuột hoặc khi bàn phím tới.
 *
 * ⚠️ Bản trước để nút "Xoá" LỘ THIÊN dưới mỗi câu. Một nút xoá nằm sẵn dưới
 * từng dòng vừa ồn vừa mời bấm nhầm — và nó chiếm chỗ của thứ đáng hiện hơn.
 * Slack ẩn cả nhóm và hiện ở góc phải khi rê tới; nhờ vậy còn chỗ cho thả cảm
 * xúc và trả lời, hai việc dùng nhiều hơn hẳn xoá.
 *
 * Trên ĐIỆN THOẠI không có "rê chuột", nên nhóm nút luôn hiện — nhưng ở dạng
 * biểu tượng nhỏ, vùng bấm vẫn 44px.
 */
/**
 * Nhãn của mốc ngày giữa dòng tin: "Hôm nay" · "Hôm qua" · "T4 · 19/8".
 *
 * ⚠️ So bằng KHOÁ NGÀY THEO GIỜ TIỆM, không trừ mốc thời gian. Trừ mốc rồi
 *   chia 86400 sẽ cho ra "hôm qua" với một tin lúc 23h50 tối qua nhìn từ 0h10
 *   sáng nay — đúng, nhưng cũng cho ra "hôm nay" với một tin lúc 0h10 sáng nay
 *   nhìn từ 23h50 tối nay, và sai hẳn ở những mốc gần nửa đêm.
 */
function nhanNgay(
  iso: string,
  timeZone: string,
  todayKey: string,
  t: (k: string, v?: Record<string, string | number>) => string,
): string {
  const khoa = ngayCuaTin(iso, timeZone);
  if (khoa === todayKey) return t("day.today");
  const homQua = new Date(Date.parse(`${todayKey}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (khoa === homQua) return t("day.yesterday");
  const thu = WEEKDAY_SHORT_VN[new Date(`${khoa}T00:00:00Z`).getUTCDay()];
  return `${thu} · ${Number(khoa.slice(8, 10))}/${Number(khoa.slice(5, 7))}`;
}

function NutTin({
  tin,
  cuaToi,
  nowMs,
  pending,
  canWrite,
  onSua,
  onXoa,
  onTraLoi,
  onCamXuc,
  onGhim,
  onLuu,
}: {
  tin: ChatTin;
  cuaToi: boolean;
  nowMs: number;
  pending: boolean;
  canWrite: boolean;
  onSua: () => void;
  onXoa: () => void;
  onTraLoi: () => void;
  onCamXuc: (emoji: string) => void;
  onGhim: () => void;
  onLuu: () => void;
}) {
  const t = useTranslations("chatRieng");
  if (tin.deletedAt || !canWrite) return null;
  const conSuaDuoc = cuaToi && nowMs - new Date(tin.createdAt).getTime() < EDIT_WINDOW_MS;

  return (
    <div
      className={cn(
        "mt-1 flex flex-wrap items-center gap-0.5 rounded-lg border bg-card p-0.5",
        // Máy tính: ẩn cho tới khi rê vào dòng tin (`group/tin` đặt ở <li>).
        // Điện thoại: luôn hiện — không có chuột thì không có "rê tới".
        "md:invisible md:opacity-0 md:transition-opacity md:group-hover/tin:visible md:group-hover/tin:opacity-100 md:focus-within:visible md:focus-within:opacity-100",
      )}
    >
      {CAM_XUC_NHANH.map((e) => (
        <button
          key={e}
          type="button"
          disabled={pending}
          onClick={() => onCamXuc(e)}
          aria-label={`${t("reaction.add")} ${e}`}
          title={t("reaction.add")}
          className="flex size-7 items-center justify-center rounded text-[13px] hover:bg-muted max-md:size-11 disabled:opacity-60"
        >
          <span aria-hidden>{e}</span>
        </button>
      ))}
      <button
        type="button"
        disabled={pending}
        onClick={onTraLoi}
        aria-label={t("thread.open")}
        title={t("thread.open")}
        className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-11 disabled:opacity-60"
      >
        <MessageSquare className="size-3.5" />
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onGhim}
        aria-label={tin.ghimLuc ? t("pin.remove") : t("pin.add")}
        title={tin.ghimLuc ? t("pin.remove") : t("pin.add")}
        className={cn(
          "flex size-7 items-center justify-center rounded hover:bg-muted max-md:size-11 disabled:opacity-60",
          tin.ghimLuc ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Pin className="size-3.5" />
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onLuu}
        aria-label={tin.daLuu ? t("save.remove") : t("save.add")}
        title={tin.daLuu ? t("save.remove") : t("save.add")}
        className={cn(
          "flex size-7 items-center justify-center rounded hover:bg-muted max-md:size-11 disabled:opacity-60",
          tin.daLuu ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Bookmark className="size-3.5" />
      </button>
      {conSuaDuoc && (
        <button
          type="button"
          disabled={pending}
          onClick={onSua}
          aria-label={t("edit")}
          title={t("edit")}
          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-11 disabled:opacity-60"
        >
          <Pencil className="size-3.5" />
        </button>
      )}
      {cuaToi && (
        <button
          type="button"
          disabled={pending}
          onClick={onXoa}
          aria-label={t("delete")}
          title={t("delete")}
          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive max-md:size-11 disabled:opacity-60"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}

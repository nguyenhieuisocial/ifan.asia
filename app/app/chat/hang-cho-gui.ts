"use client";

import { useSyncExternalStore } from "react";
import type { TepDinhKem } from "./tep-dinh-kem";

/**
 * HÀNG CHỜ GỬI — giữ lại tin nhắn khi mất mạng, tự gửi lại khi có mạng.
 *
 * Ở tiệm, sóng trong phòng trị liệu thường yếu. Nhân viên gõ xong, bấm Gửi,
 * màn báo hỏng, và chữ họ vừa gõ biến mất — đó là cách nhanh nhất để người ta
 * quay lại dùng Zalo.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG DÙNG "Background Sync" CỦA SERVICE WORKER
 * ═══════════════════════════════════════════════════════════════════
 * Background Sync cho phép gửi lại KỂ CẢ KHI ĐÃ ĐÓNG app. Nghe hay hơn, nhưng
 * nó đòi một đường HTTP riêng để service worker gọi — trong khi việc gửi tin
 * hiện đi qua server action, nơi có sẵn kiểm tra dữ liệu, chốt vai, dò @gọi
 * tên, và ghi tệp đính kèm.
 *
 * Dựng thêm một đường HTTP nghĩa là **hai chỗ làm một việc**, và chỗ thứ hai
 * CHẮC CHẮN sẽ lệch: lần sau ai đó thêm một luật vào server action mà quên
 * đường kia, thì tin gửi qua hàng chờ sẽ bỏ qua luật đó — im lặng.
 *
 * Đổi lại, cái mất là gì? Chỉ là "gửi lại khi app đã đóng hẳn". Với chat nội
 * bộ thì gần như không ai cần: đóng app rồi thì cũng không vội. Cái người ta
 * THẬT SỰ cần là **không mất chữ vừa gõ** — và hàng chờ này giữ được điều đó
 * qua cả việc đóng tab, vì nó ghi xuống kho của trình duyệt.
 *
 * ⚠️ Nếu sau này thật sự cần gửi-khi-đóng-app, cách đúng là tách phần lõi của
 *   `guiTinChat` ra một hàm dùng chung rồi để CẢ server action LẪN đường HTTP
 *   cùng gọi nó — một chỗ làm việc, hai cửa vào. Đừng chép.
 */

const KHOA = "ifan.chat.hangcho";
/** Giữ tối đa ngần này tin. Nhiều hơn thì gần như chắc chắn là lỗi, không phải mất mạng. */
const TRAN = 20;

export type TinChoGui = {
  /** Mã tạm để nhận ra tin trong hàng chờ; không phải mã của tin thật. */
  ma: string;
  channelId: string;
  body: string;
  tep: TepDinhKem[];
  luc: number;
};

function doc(): TinChoGui[] {
  try {
    const raw = localStorage.getItem(KHOA);
    if (!raw) return [];
    const v = JSON.parse(raw) as TinChoGui[];
    return Array.isArray(v) ? v.slice(0, TRAN) : [];
  } catch {
    return [];
  }
}

function ghi(ds: TinChoGui[]) {
  try {
    localStorage.setItem(KHOA, JSON.stringify(ds.slice(0, TRAN)));
    baoDoi();
  } catch {
    // Kho đầy hoặc bị chặn — không có gì cứu được ở đây, và làm gãy màn hình
    // vì một hàng chờ là đổi thứ chính lấy thứ phụ.
  }
}

export function themVaoHangCho(tin: Omit<TinChoGui, "ma" | "luc">): TinChoGui {
  const moi: TinChoGui = { ...tin, ma: crypto.randomUUID(), luc: Date.now() };
  ghi([...doc(), moi]);
  return moi;
}

export function boKhoiHangCho(ma: string) {
  ghi(doc().filter((x) => x.ma !== ma));
}

export function doHangCho(channelId?: string): TinChoGui[] {
  const ds = doc();
  return channelId ? ds.filter((x) => x.channelId === channelId) : ds;
}

export function xoaSachHangCho() {
  ghi([]);
}

/**
 * Lỗi này có phải do MẤT MẠNG không.
 *
 * ⚠️ Chỉ xếp vào hàng chờ khi ĐÚNG là mất mạng. Lỗi nghiệp vụ (vai Chỉ xem,
 *   kênh không còn, chữ quá dài) mà cho vào hàng chờ thì nó sẽ thử lại mãi và
 *   hỏng mãi — người dùng thấy một tin "đang chờ gửi" không bao giờ đi.
 */
export function laLoiMatMang(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const s = String((e as Error)?.message ?? e ?? "").toLowerCase();
  return (
    s.includes("failed to fetch") ||
    s.includes("networkerror") ||
    s.includes("load failed") ||
    s.includes("err_internet") ||
    s.includes("err_network")
  );
}

/**
 * Đọc hàng chờ trong React — bằng `useSyncExternalStore`.
 *
 * ⚠️ KHÔNG dùng effect + setState. Hàng chờ là một kho NGOÀI React (kho của
 *   trình duyệt), và đọc kho rồi setState trong effect là hai lượt dựng nối
 *   nhau — luật `react-hooks/set-state-in-effect` của kho chặn đúng.
 */
const RONG: TinChoGui[] = [];
let banHienTai: TinChoGui[] | null = null;
const nguoiNghe = new Set<() => void>();

function layBan(): TinChoGui[] {
  if (banHienTai === null) banHienTai = doc();
  return banHienTai;
}

function baoDoi() {
  banHienTai = null;
  for (const f of nguoiNghe) f();
}

export function useHangCho(): TinChoGui[] {
  return useSyncExternalStore(
    (bao) => {
      nguoiNghe.add(bao);
      return () => {
        nguoiNghe.delete(bao);
      };
    },
    layBan,
    () => RONG,
  );
}

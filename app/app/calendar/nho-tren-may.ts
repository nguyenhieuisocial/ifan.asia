"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * NHỚ LỰA CHỌN CỦA NGƯỜI DÙNG TRÊN MÁY HỌ — và đồng bộ giữa các tab.
 *
 * Đọc bằng `useSyncExternalStore` chứ KHÔNG bằng effect: đọc kho rồi gọi
 * setState trong effect là hai lượt dựng nối nhau, và luật của kho cấm
 * (`react-hooks/set-state-in-effect`). Cách này còn được thêm một thứ miễn
 * phí — mở hai tab thì đổi ở tab này, tab kia theo ngay.
 *
 * ⚠️ Nguồn thật là biến trong bộ nhớ, KHÔNG phải localStorage. Trình duyệt chế
 *   độ riêng tư chặn ghi, và nếu đọc thẳng kho mỗi lần thì mọi nút bấm sẽ IM
 *   LẶNG KHÔNG LÀM GÌ ở những máy đó — không lỗi, không dấu hiệu, chỉ là không
 *   có tác dụng.
 *
 * ⚠️ Mỗi kho dựng MỘT LẦN ở cấp mô-đun, không dựng trong lượt vẽ. Bản đầu dựng
 *   trong hook rồi sửa đổi nó trong `useCallback` — luật `react-hooks/
 *   immutability` chặn đúng: sửa một đối tượng bắt được từ lượt dựng là cách
 *   sinh ra lỗi "màn không cập nhật" mà không ai lần ra được.
 *
 * ⚠️ Chỉ dùng cho lựa chọn HIỂN THỊ. Đừng bao giờ để dữ liệu thật hay quyền hạn
 *   ở đây: người dùng xoá kho trình duyệt là mất, và mỗi máy một bản khác nhau.
 */
type Kho<T> = {
  doc: () => T;
  docMayChu: () => T;
  dat: (v: T) => void;
  theoDoi: (bao: () => void) => () => void;
};

function taoKho<T>(
  khoa: string,
  macDinh: T,
  phanTich: (raw: string) => T,
  ghiRa: (v: T) => string,
): Kho<T> {
  let gia: T | null = null;
  const nguoiNghe = new Set<() => void>();

  const doc = (): T => {
    if (gia === null) {
      try {
        const raw = localStorage.getItem(khoa);
        gia = raw === null ? macDinh : phanTich(raw);
      } catch {
        gia = macDinh;
      }
    }
    return gia;
  };

  return {
    doc,
    // Máy chủ chưa có localStorage — phải trả về một giá trị ỔN ĐỊNH, nếu
    // không React dựng lại vô hạn.
    docMayChu: () => macDinh,
    dat: (v: T) => {
      gia = v;
      try {
        localStorage.setItem(khoa, ghiRa(v));
      } catch {
        // Trình duyệt chặn lưu — vẫn đúng trong phiên này.
      }
      for (const bao of nguoiNghe) bao();
    },
    theoDoi: (bao) => {
      nguoiNghe.add(bao);
      const tabKhac = (e: StorageEvent) => {
        if (e.key !== null && e.key !== khoa) return;
        gia = null; // buộc đọc lại từ kho
        bao();
      };
      window.addEventListener("storage", tabKhac);
      return () => {
        nguoiNghe.delete(bao);
        window.removeEventListener("storage", tabKhac);
      };
    },
  };
}

function useKho<T>(kho: Kho<T>): T {
  return useSyncExternalStore(kho.theoDoi, kho.doc, kho.docMayChu);
}

// ────────────────────────────────────────────────────────────────────

const khoAn = taoKho<Set<string>>(
  "ifan.lich.an",
  new Set(),
  (raw) => new Set(JSON.parse(raw) as string[]),
  (v) => JSON.stringify([...v]),
);

/** Mã thợ / phòng đang TẮT — tắt là ẩn ca của họ khỏi mọi chế độ xem. */
export function useTapAn() {
  const an = useKho(khoAn);

  const batTat = useCallback((ma: string) => {
    const sau = new Set(khoAn.doc());
    if (sau.has(ma)) sau.delete(ma);
    else sau.add(ma);
    khoAn.dat(sau);
  }, []);

  /**
   * CHỈ HIỆN một mục — tắt hết những mục còn lại trong cùng nhóm.
   *
   * Có nó thì "xem riêng lịch của chị Thảo" là MỘT lần bấm. Không có thì trong
   * tiệm 12 người phải bấm tắt 11 lần — chính là chỗ founder nói màn này
   * "thiếu filter để chọn ngay".
   */
  const chiHien = useCallback((ma: string, caNhom: string[]) => {
    const sau = new Set(khoAn.doc());
    for (const x of caNhom) sau.add(x);
    sau.delete(ma);
    khoAn.dat(sau);
  }, []);

  const hienHet = useCallback(() => khoAn.dat(new Set()), []);

  return { an, batTat, chiHien, hienHet } as const;
}

// ────────────────────────────────────────────────────────────────────

/**
 * Các mức phóng to của lưới giờ, tính bằng pixel cho MỘT GIỜ.
 *
 * 32px = nhìn cả ngày trong một màn, hợp lúc muốn biết "hôm nay kín hay trống".
 * 96px = mỗi 15 phút thành một dải rõ, hợp lúc xếp ca sát nhau.
 * Bốn nấc chứ không phải một thanh trượt: bốn nấc là đủ, mà thanh trượt trên
 * điện thoại thì rất khó chạm trúng.
 */
export const MUC_CAO_GIO = [32, 52, 72, 96] as const;
export const CAO_GIO_MAC_DINH = 52;

const khoCao = taoKho<number>(
  "ifan.lich.caogio",
  CAO_GIO_MAC_DINH,
  (raw) => {
    const n = Number(raw);
    // Giá trị lạ trong kho (người dùng sửa tay, hoặc bản cũ) thì về mặc định —
    // KHÔNG để một con số vô lý làm lưới cao 5000px.
    return (MUC_CAO_GIO as readonly number[]).includes(n) ? n : CAO_GIO_MAC_DINH;
  },
  (v) => String(v),
);

export function useCaoGio() {
  const cao = useKho(khoCao);

  const doiMuc = useCallback((buoc: 1 | -1) => {
    const hienTai = khoCao.doc();
    const i = MUC_CAO_GIO.indexOf(hienTai as (typeof MUC_CAO_GIO)[number]);
    const j = Math.min(MUC_CAO_GIO.length - 1, Math.max(0, (i < 0 ? 1 : i) + buoc));
    khoCao.dat(MUC_CAO_GIO[j]);
  }, []);

  return {
    cao,
    doiMuc,
    conToDuoc: cao !== MUC_CAO_GIO[MUC_CAO_GIO.length - 1],
    conNhoDuoc: cao !== MUC_CAO_GIO[0],
  } as const;
}

// ────────────────────────────────────────────────────────────────────

/**
 * Các tuỳ chọn HIỂN THỊ của màn Lịch — nhớ trên máy từng người.
 *
 * ⚠️ "Tuần bắt đầu Thứ 2 hay Chủ nhật" CỐ Ý KHÔNG CÓ. Google có vì phục vụ cả
 *   thế giới; ở Việt Nam tuần luôn bắt đầu Thứ Hai, không ai hỏi khác. Thêm nó
 *   thì dải ngày phải tính lại ở máy chủ và mở ra cả một họ lỗi lệch-một-ngày,
 *   đổi lấy con số không lợi ích. Ghi ra đây để lần sau không ai mở lại.
 */
export type CaiDatHienThi = {
  /** Hiện ngày âm cạnh ngày dương. */
  amLich: boolean;
  /** Hiện Thứ 7 và Chủ nhật ở chế độ Tuần và Tháng. */
  cuoiTuan: boolean;
  /** Làm mờ ca đã qua — mắt tự bỏ qua phần đã xong, dồn vào phần sắp tới. */
  moCaCu: boolean;
  /** Hiện ca đã huỷ / khách không tới. */
  hienDaHuy: boolean;
};

const MAC_DINH_HIEN_THI: CaiDatHienThi = {
  // Âm lịch BẬT SẴN: ở tiệm Việt Nam đây là thông tin dùng hằng ngày, không
  // phải tuỳ chọn cho người thích.
  amLich: true,
  cuoiTuan: true,
  moCaCu: true,
  hienDaHuy: true,
};

const khoHienThi = taoKho<CaiDatHienThi>(
  "ifan.lich.hienthi",
  MAC_DINH_HIEN_THI,
  (raw) => {
    const v = JSON.parse(raw) as Partial<CaiDatHienThi>;
    // Gộp với mặc định: bản cũ trong kho thiếu khoá mới thì lấy mặc định, chứ
    // KHÔNG để `undefined` chảy xuống giao diện.
    return { ...MAC_DINH_HIEN_THI, ...v };
  },
  (v) => JSON.stringify(v),
);

export function useCaiDatHienThi() {
  const caiDat = useKho(khoHienThi);
  const doi = useCallback(<K extends keyof CaiDatHienThi>(khoa: K, gtri: CaiDatHienThi[K]) => {
    khoHienThi.dat({ ...khoHienThi.doc(), [khoa]: gtri });
  }, []);
  return { caiDat, doi } as const;
}

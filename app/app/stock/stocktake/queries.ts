import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tra cứu dữ liệu màn Kiểm kê (ADR-0021 V4).
 *
 * KHÔNG nuốt lỗi (bài học việc #169): ném để page.tsx bắt và bật loadFailed.
 * Phân biệt rõ "tra cứu hỏng" với "chưa có phiên nào" / "danh sách rỗng".
 */

export type StocktakeLine = {
  id: string;
  itemId: string;
  ten: string;
  donVi: string | null;
  tonTheoSo: number;
  demThucTe: number;
  lyDo: string | null;
};

export type StocktakeInfo = {
  id: string;
  status: string;
  createdAt: string;
  lines: StocktakeLine[];
};

export type PhienCu = {
  id: string;
  status: string;
  createdAt: string;
  closedAt: string | null;
  soChenhLech: number;
};

// Supabase JS có thể trả FK join là object hoặc mảng — xử lý cả hai.
type HangDong = {
  id: string;
  item_id: string;
  ton_theo_so: number | string;
  dem_thuc_te: number | string;
  ly_do: string | null;
  items: { name: string; unit: string | null } | { name: string; unit: string | null }[] | null;
};

function layTenItem(items: HangDong["items"]): { name: string; unit: string | null } {
  if (!items) return { name: "", unit: null };
  const mot = Array.isArray(items) ? items[0] : items;
  return { name: mot?.name ?? "", unit: mot?.unit ?? null };
}

/**
 * Lấy phiên kiểm kê đang mở (status = 'dang_dem') cùng toàn bộ dòng hàng.
 * Trả { phien: null } nếu không có phiên nào đang mở — KHÔNG phải lỗi.
 */
export async function layPhienHienTai(
  supabase: SupabaseClient,
): Promise<{ phien: StocktakeInfo | null }> {
  const { data: phieu, error: loiPhieu } = await supabase
    .from("stocktakes")
    .select("id, status, created_at")
    .eq("status", "dang_dem")
    .maybeSingle();
  if (loiPhieu) throw loiPhieu;
  if (!phieu) return { phien: null };

  const { data: dongKe, error: loiDong } = await supabase
    .from("stocktake_lines")
    .select("id, item_id, ton_theo_so, dem_thuc_te, ly_do, items(name, unit)")
    .eq("stocktake_id", phieu.id as string);
  if (loiDong) throw loiDong;

  const rows = (dongKe ?? []) as unknown as HangDong[];

  // Sắp xếp theo tên mặt hàng phía client — dễ hơn order by FK trong Supabase JS.
  rows.sort((a, b) => {
    const nameA = layTenItem(a.items).name;
    const nameB = layTenItem(b.items).name;
    return nameA.localeCompare(nameB, "vi");
  });

  return {
    phien: {
      id: phieu.id as string,
      status: phieu.status as string,
      createdAt: phieu.created_at as string,
      lines: rows.map((r) => {
        const { name, unit } = layTenItem(r.items);
        return {
          id: r.id,
          itemId: r.item_id,
          ten: name,
          donVi: unit,
          tonTheoSo: Number(r.ton_theo_so),
          demThucTe: Number(r.dem_thuc_te),
          lyDo: r.ly_do,
        };
      }),
    },
  };
}

type HangPhienCu = {
  id: string;
  status: string;
  created_at: string;
  closed_at: string | null;
  stocktake_lines: { ton_theo_so: number | string; dem_thuc_te: number | string }[] | null;
};

/**
 * Lấy danh sách phiên đã đóng (chốt hoặc huỷ), mới nhất trước.
 * Giới hạn 20 phiên — màn lịch sử không cần phân trang.
 */
export async function layCacPhienCu(
  supabase: SupabaseClient,
): Promise<{ phien: PhienCu[] }> {
  const { data, error } = await supabase
    .from("stocktakes")
    .select("id, status, created_at, closed_at, stocktake_lines(ton_theo_so, dem_thuc_te)")
    .in("status", ["da_chot", "da_huy"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;

  const rows = (data ?? []) as unknown as HangPhienCu[];
  return {
    phien: rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.created_at,
      closedAt: r.closed_at,
      soChenhLech: (r.stocktake_lines ?? []).filter(
        (l) => Number(l.dem_thuc_te) !== Number(l.ton_theo_so),
      ).length,
    })),
  };
}

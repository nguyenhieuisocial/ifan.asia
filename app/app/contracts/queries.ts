import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Hợp đồng & Gói định kỳ (ADR-0022 V5).
 */

// ==================== GÓI DỊCH VỤ ====================

export type ServicePackage = {
  id: string;
  name: string;
  description: string | null;
  sessionsTotal: number;
  validityDays: number | null;
  priceVnd: number;
  status: "active" | "archived";
  createdAt: string;
};

export async function layDanhSachGoi(supabase: SupabaseClient): Promise<ServicePackage[]> {
  const { data, error } = await supabase
    .from("service_packages")
    .select("id, name, description, sessions_total, validity_days, price_vnd, status, created_at")
    .order("status") // active trước (a < z)
    .order("created_at", { ascending: false });

  // Rà 20/08: ném lỗi thay vì nuốt-thành-rỗng (khuôn `lib/catalog/orders.ts`).
  if (error) throw new Error(error.message);
  if (!data) return [];
  return data.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: r.description as string | null,
    sessionsTotal: Number(r.sessions_total),
    validityDays: r.validity_days != null ? Number(r.validity_days) : null,
    priceVnd: Number(r.price_vnd ?? 0),
    status: r.status as "active" | "archived",
    createdAt: r.created_at as string,
  }));
}

// ==================== HỢP ĐỒNG ====================

export type Contract = {
  id: string;
  contactId: string;
  contactName: string;
  packageId: string;
  packageName: string;
  sessionsTotal: number;
  sessionsUsed: number;
  startsAt: string;
  expiresAt: string | null;
  pricePaidVnd: number;
  paymentMethod: string;
  status: "active" | "completed" | "cancelled";
  note: string | null;
  createdAt: string;
};

/** Trần danh sách hợp đồng tải 1 lần — cũng là ngưỡng hiện dòng "đang xem N mới nhất" ở view. */
export const CONTRACT_LIST_LIMIT = 100;

export async function layDanhSachHopDong(
  supabase: SupabaseClient,
  statusFilter?: "active" | "completed" | "cancelled",
): Promise<Contract[]> {
  let query = supabase
    .from("contracts")
    .select(
      `id, contact_id, package_id, sessions_total, sessions_used,
       starts_at, expires_at, price_paid_vnd, payment_method,
       status, note, created_at,
       contacts!contact_id(full_name),
       service_packages!package_id(name)`,
    )
    .order("status") // active first
    .order("created_at", { ascending: false })
    .limit(CONTRACT_LIST_LIMIT);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  // Rà 20/08: ném lỗi thay vì nuốt-thành-rỗng (khuôn `lib/catalog/orders.ts`).
  if (error) throw new Error(error.message);
  if (!data) return [];

  return data.map((r) => ({
    id: r.id as string,
    contactId: r.contact_id as string,
    contactName: (r.contacts as unknown as { full_name: string } | null)?.full_name ?? "—",
    packageId: r.package_id as string,
    packageName: (r.service_packages as unknown as { name: string } | null)?.name ?? "—",
    sessionsTotal: Number(r.sessions_total),
    sessionsUsed: Number(r.sessions_used ?? 0),
    startsAt: r.starts_at as string,
    expiresAt: r.expires_at as string | null,
    pricePaidVnd: Number(r.price_paid_vnd ?? 0),
    paymentMethod: r.payment_method as string,
    status: r.status as "active" | "completed" | "cancelled",
    note: r.note as string | null,
    createdAt: r.created_at as string,
  }));
}

// ==================== KHÁCH HÀNG (để chọn khi tạo hợp đồng) ====================

export type ContactOption = { id: string; name: string; phone: string | null };

/**
 * Trần khách đổ vào ô chọn của form tạo hợp đồng. Ô chọn KHÔNG có tìm kiếm, nên
 * khách xếp sau mức này không chọn được — view bắt buộc nói ra khi chạm trần,
 * nếu không người dùng tưởng khách chưa có rồi tạo trùng hồ sơ.
 */
export const CONTACT_PICKER_LIMIT = 500;

export async function layDanhSachKhach(supabase: SupabaseClient): Promise<ContactOption[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select("id, full_name, phone")
    .eq("status", "active")
    .order("full_name")
    .limit(CONTACT_PICKER_LIMIT);
  // Rà 20/08: ném lỗi thay vì nuốt — ô chọn khách rỗng câm khiến người dùng
  // tưởng chưa có khách rồi tạo trùng hồ sơ.
  if (error) throw new Error(error.message);

  return (data ?? []).map((c) => ({
    id: c.id as string,
    name: c.full_name as string,
    phone: c.phone as string | null,
  }));
}

/** Kiểu dùng chung cho màn Nhân viên (migration #28). */

/** Kết quả RPC `tenant_seats()` — `limit = null` nghĩa là gói không giới hạn. */
export type SeatInfo = {
  members: number;
  pending: number;
  used: number;
  limit: number | null;
  over_limit: boolean;
};

export type MemberRow = {
  user_id: string;
  role: string;
  display_name: string;
  joined_at: string | null;
  /** Có giá trị = tài khoản tạo không cần email (31.29) — hiện thay cho ngày tham gia. */
  phone: string | null;
};

export type InviteRow = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
};

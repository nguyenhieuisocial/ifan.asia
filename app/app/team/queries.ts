import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Nhân sự · Chấm công · Bảng công · Xếp ca · Nghỉ phép (V7, migration #166).
 * Thẻ design: design-system/man-nhan-su-cham-cong.html.
 *
 * ⚠️ QUYỀN ĐỌC TÊN — điểm phải biết trước khi sửa màn này:
 * `employees_self_or_admin` (migration #166) chỉ cho owner/admin đọc hồ sơ
 * người khác; hồ sơ chứa LƯƠNG CỨNG + ngày sinh + số điện thoại nên siết vậy
 * là đúng. Hệ quả từng có: QUẢN LÝ đọc được `timesheets` cả tiệm (đúng việc
 * của họ) nhưng KHÔNG đọc được tên người trong bảng đó — duyệt bảng công mà
 * không biết đang duyệt cho ai.
 *
 * ĐÃ VÁ (migration #177): hàm `employees_ten()` mở một khe HẸP — chỉ id + tên
 * + user_id, cho owner/admin/manager. KHÔNG nới `employees_self_or_admin` vì
 * RLS chặn theo DÒNG chứ không theo CỘT, nới ở đó là mở luôn lương cứng. Cũng
 * KHÔNG lách bằng service-role ở tầng web (bất biến: chặn ở CSDL, không chặn
 * ở giao diện).
 *
 * ⇒ Cần tên người khác thì gọi `layTenNhanSu()` dưới đây. Thêm cột vào hàm đó
 * là mở rộng lỗ — cân nhắc kỹ, và sửa cả chú thích trong migration #177.
 */

/** Trần danh sách — chạm trần thì view hiện dòng "đang xem N …". */
export const EMPLOYEE_LIST_LIMIT = 100;
export const PUNCH_LIST_LIMIT = 60;
export const LEAVE_LIST_LIMIT = 50;

/** Bán kính MẶC ĐỊNH khi tiệm chưa cấu hình — khớp default của attendance_settings.radius_m (#232). */
export const WORK_RADIUS_M = 300;

export const SHIFT_KINDS = ["morning", "afternoon", "full", "off"] as const;
export type ShiftKind = (typeof SHIFT_KINDS)[number];

export const LEAVE_KINDS = ["paid", "unpaid", "sick"] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];

// ==================== HỒ SƠ NHÂN SỰ ====================

export type Employee = {
  id: string;
  userId: string | null;
  fullName: string;
  phone: string | null;
  startedOn: string;
  endedOn: string | null;
  baseSalaryVnd: number;
  overtimeRateVnd: number;
  annualLeaveDays: number;
  note: string | null;
  /**
   * #284 — cách trả lương cứng. `monthly` giữ nguyên nếp cũ (luôn ghi đủ lương
   * tháng); `daily` nhân đơn giá ngày với số công; `hourly` nhân đơn giá giờ
   * với số giờ làm thật. Trả khoán thì để lương cứng 0 và dùng hoa hồng —
   * không dựng kiểu riêng cho nó (xem migration #284).
   */
  payType: "monthly" | "daily" | "hourly";
  dailyRateVnd: number;
  /** Đơn giá một giờ LÀM. Khác `overtimeRateVnd` (đơn giá giờ TĂNG CA). */
  hourlyRateVnd: number;
};

/**
 * RLS tự lọc: owner/admin thấy cả tiệm, vai khác chỉ thấy ĐÚNG hồ sơ của mình.
 * Không tự siết thêm ở đây — siết hai nơi là hai sự thật sẽ lệch nhau.
 */
export async function layDanhSachNhanSu(
  supabase: SupabaseClient,
  limit = EMPLOYEE_LIST_LIMIT,
): Promise<Employee[]> {
  const { data, error } = await supabase
    .from("employees")
    .select(
      "id, user_id, full_name, phone, started_on, ended_on, base_salary_vnd, overtime_rate_vnd, annual_leave_days, note, pay_type, daily_rate_vnd, hourly_rate_vnd",
    )
    .order("ended_on", { ascending: true, nullsFirst: true })
    .order("started_on", { ascending: false })
    .limit(limit);

  // ĐỌC HỎNG thì kêu lên. Gộp `error` với `!data` rồi trả rỗng là biến một
  // lần đọc hỏng thành câu "chưa có gì" — người dùng tin và đi làm việc sai.
  if (error) throw new Error(`Không đọc được lay danh sach nhan su: ${error.message}`);
  if (!data) return [];
  return data.map((r) => ({
    id: r.id as string,
    userId: (r.user_id as string | null) ?? null,
    fullName: r.full_name as string,
    phone: (r.phone as string | null) ?? null,
    startedOn: r.started_on as string,
    endedOn: (r.ended_on as string | null) ?? null,
    baseSalaryVnd: Number(r.base_salary_vnd ?? 0),
    overtimeRateVnd: Number(r.overtime_rate_vnd ?? 0),
    payType: ((r.pay_type as string | null) ?? "monthly") as "monthly" | "daily" | "hourly",
    dailyRateVnd: Number(r.daily_rate_vnd ?? 0),
    hourlyRateVnd: Number(r.hourly_rate_vnd ?? 0),
    annualLeaveDays: Number(r.annual_leave_days ?? 0),
    note: (r.note as string | null) ?? null,
  }));
}

/**
 * Chỉ TÊN của người trong tiệm — dùng khi người đang xem là `manager`, vốn không
 * đọc được hồ sơ nhân sự đầy đủ. Đi qua `employees_ten()` (migration #177), hàm
 * này CỐ Ý chỉ trả id + tên + user_id.
 *
 * Trả map để chỗ gọi tra thẳng theo id, không phải quét mảng. Lỗi thì trả map
 * RỖNG — màn hình đã có dòng giải thích sẵn cho trường hợp thiếu tên, và ở đây
 * "không tra được tên" không phải lý do để chặn cả màn duyệt bảng công.
 */
export async function layTenNhanSu(
  supabase: SupabaseClient,
): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc("employees_ten");
  // ĐỌC HỎNG thì kêu lên. Gộp `error` với `!data` rồi trả rỗng là biến một
  // lần đọc hỏng thành câu "chưa có gì" — người dùng tin và đi làm việc sai.
  if (error) throw new Error(`Không đọc được lay ten nhan su: ${error.message}`);
  if (!data) return {};
  return Object.fromEntries(
    (data as { id: string; full_name: string }[]).map((r) => [r.id, r.full_name]),
  );
}

/** Hồ sơ của CHÍNH người đang đăng nhập — không có thì chưa chấm công được. */
export async function layHoSoCuaToi(
  supabase: SupabaseClient,
  userId: string,
): Promise<Employee | null> {
  const { data } = await supabase
    .from("employees")
    .select(
      "id, user_id, full_name, phone, started_on, ended_on, base_salary_vnd, overtime_rate_vnd, annual_leave_days, note, pay_type, daily_rate_vnd, hourly_rate_vnd",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id as string,
    userId: (data.user_id as string | null) ?? null,
    fullName: data.full_name as string,
    phone: (data.phone as string | null) ?? null,
    startedOn: data.started_on as string,
    endedOn: (data.ended_on as string | null) ?? null,
    baseSalaryVnd: Number(data.base_salary_vnd ?? 0),
    overtimeRateVnd: Number(data.overtime_rate_vnd ?? 0),
    payType: ((data.pay_type as string | null) ?? "monthly") as "monthly" | "daily" | "hourly",
    dailyRateVnd: Number(data.daily_rate_vnd ?? 0),
    hourlyRateVnd: Number(data.hourly_rate_vnd ?? 0),
    annualLeaveDays: Number(data.annual_leave_days ?? 0),
    note: (data.note as string | null) ?? null,
  };
}

// ==================== CHẤM CÔNG ====================

export type Punch = {
  id: string;
  employeeId: string;
  punchedAt: string;
  kind: "in" | "out";
  distanceM: number | null;
  outOfRange: boolean;
  reason: string | null;
  /** #219 — link tạm (1 giờ) tới ảnh selfie đã chèn chữ. Null nếu lần chấm không có ảnh. */
  selfieUrl: string | null;
  /** #225 — lần này có phải "chấm giúp" (đồng nghiệp chấm hộ) không. */
  isProxy: boolean;
  /** #225 — điểm khớp khuôn mặt 0..1 (chỉ có ở lần chấm giúp có nạp mặt). Null = không chấm được điểm. */
  faceMatchScore: number | null;
};

/** Lần chấm trong một khoảng — dùng cho "tuần này" và cho việc tính lại bảng công. */
export async function layLanCham(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string,
  employeeId?: string,
  limit = PUNCH_LIST_LIMIT,
): Promise<Punch[]> {
  let q = supabase
    .from("attendance_punches")
    .select("id, employee_id, punched_at, kind, distance_m, out_of_range, reason, selfie_path")
    .gte("punched_at", fromIso)
    .lt("punched_at", toIso)
    .order("punched_at", { ascending: false })
    .limit(limit);
  if (employeeId) q = q.eq("employee_id", employeeId);

  const { data, error } = await q;
  // ĐỌC HỎNG thì kêu lên. Gộp `error` với `!data` rồi trả rỗng là biến một
  // lần đọc hỏng thành câu "chưa có gì" — người dùng tin và đi làm việc sai.
  if (error) throw new Error(`Không đọc được lay lan cham: ${error.message}`);
  if (!data) return [];

  // Bucket tenant-files là PRIVATE — ký link tạm cho từng ảnh trong MỘT lượt
  // gọi (createSignedUrls số nhiều) thay vì mỗi ảnh một round-trip.
  const paths = data
    .map((r) => r.selfie_path as string | null)
    .filter((p): p is string => !!p);
  const urlByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("tenant-files")
      .createSignedUrls(paths, 3600);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    }
  }

  // #225 — lần chấm nào là "chấm giúp" (và điểm khớp mặt bao nhiêu). Chỉ những
  // lần có trong attendance_proxy_punches; RLS ở bảng đó tự lọc: quản lý thấy cả
  // tiệm, nhân viên chỉ thấy lần của MÌNH. Bảng thường rỗng nên bỏ nếu không có id.
  const proxyByPunch = new Map<string, number | null>();
  const ids = data.map((r) => r.id as string);
  if (ids.length > 0) {
    const { data: proxies } = await supabase
      .from("attendance_proxy_punches")
      .select("punch_id, face_match_score")
      .in("punch_id", ids);
    for (const p of proxies ?? []) {
      proxyByPunch.set(
        p.punch_id as string,
        p.face_match_score != null ? Number(p.face_match_score) : null,
      );
    }
  }

  return data.map((r) => {
    const path = r.selfie_path as string | null;
    const id = r.id as string;
    return {
      id,
      employeeId: r.employee_id as string,
      punchedAt: r.punched_at as string,
      kind: r.kind as "in" | "out",
      distanceM: r.distance_m != null ? Number(r.distance_m) : null,
      outOfRange: r.out_of_range === true,
      reason: (r.reason as string | null) ?? null,
      selfieUrl: path ? (urlByPath.get(path) ?? null) : null,
      isProxy: proxyByPunch.has(id),
      faceMatchScore: proxyByPunch.get(id) ?? null,
    };
  });
}

// ==================== BẢNG CÔNG ====================

export type Timesheet = {
  id: string;
  employeeId: string;
  period: string;
  workDays: number;
  overtimeHours: number;
  lateCount: number;
  flagCount: number;
  /** #251 — TỔNG phút đi muộn. Khác `lateCount` (số LẦN): muộn 45' và muộn 2' đều ra 1 lần. */
  lateMinutes: number;
  /** #251 — TỔNG phút về sớm. Mặt còn lại của tăng ca. */
  earlyLeaveMinutes: number;
  /** #250 — ngày nghỉ CÓ LƯƠNG đã duyệt trong kỳ. ĐÃ nằm trong `workDays`. */
  paidLeaveDays: number;
  /** #250 — ngày nghỉ KHÔNG LƯƠNG đã duyệt. KHÔNG nằm trong `workDays`. */
  unpaidLeaveDays: number;
  status: "draft" | "closed";
  closedAt: string | null;
  unlockReason: string | null;
};

/** `period` là 'yyyy-MM-01' — cùng quy ước khoá tháng của lib/kpi.ts. */
export async function layBangCong(
  supabase: SupabaseClient,
  period: string,
): Promise<Timesheet[]> {
  const { data, error } = await supabase
    .from("timesheets")
    .select(
      "id, employee_id, period, work_days, overtime_hours, late_count, late_minutes, early_leave_minutes, paid_leave_days, unpaid_leave_days, flag_count, status, closed_at, unlock_reason",
    )
    .eq("period", period)
    .limit(EMPLOYEE_LIST_LIMIT);

  // ĐỌC HỎNG thì kêu lên. Gộp `error` với `!data` rồi trả rỗng là biến một
  // lần đọc hỏng thành câu "chưa có gì" — người dùng tin và đi làm việc sai.
  if (error) throw new Error(`Không đọc được lay bang cong: ${error.message}`);
  if (!data) return [];
  return data.map((r) => ({
    id: r.id as string,
    employeeId: r.employee_id as string,
    period: r.period as string,
    workDays: Number(r.work_days ?? 0),
    overtimeHours: Number(r.overtime_hours ?? 0),
    lateCount: Number(r.late_count ?? 0),
    lateMinutes: Number(r.late_minutes ?? 0),
    earlyLeaveMinutes: Number(r.early_leave_minutes ?? 0),
    paidLeaveDays: Number(r.paid_leave_days ?? 0),
    unpaidLeaveDays: Number(r.unpaid_leave_days ?? 0),
    flagCount: Number(r.flag_count ?? 0),
    status: r.status as "draft" | "closed",
    closedAt: (r.closed_at as string | null) ?? null,
    unlockReason: (r.unlock_reason as string | null) ?? null,
  }));
}

// ==================== XẾP CA ====================

export type Shift = {
  id: string;
  employeeId: string;
  workDate: string;
  kind: ShiftKind;
  /** #251 — giờ RIÊNG của ô ca này ('HH:mm'). Null = dùng giờ chuẩn của tiệm theo `kind`. */
  startTime: string | null;
  endTime: string | null;
};

/** Postgres trả `time` là 'HH:mm:ss'; màn hình và ô <input type="time"> dùng 'HH:mm'. */
function gioNgan(v: unknown): string | null {
  return typeof v === "string" && v.length >= 5 ? v.slice(0, 5) : null;
}

export async function layCa(
  supabase: SupabaseClient,
  fromDate: string,
  toDate: string,
  employeeId?: string,
): Promise<Shift[]> {
  let q = supabase
    .from("shifts")
    .select("id, employee_id, work_date, kind, start_time, end_time")
    .gte("work_date", fromDate)
    .lte("work_date", toDate)
    .limit(EMPLOYEE_LIST_LIMIT * 7);
  // Tính lại bảng công chỉ cần ca của MỘT người trong MỘT tháng (≤31 dòng) —
  // không kéo cả tiệm về rồi lọc ở máy chủ web.
  if (employeeId) q = q.eq("employee_id", employeeId);

  const { data, error } = await q;
  // ĐỌC HỎNG thì kêu lên. Gộp `error` với `!data` rồi trả rỗng là biến một
  // lần đọc hỏng thành câu "chưa có gì" — người dùng tin và đi làm việc sai.
  if (error) throw new Error(`Không đọc được lay ca: ${error.message}`);
  if (!data) return [];
  return data.map((r) => ({
    id: r.id as string,
    employeeId: r.employee_id as string,
    workDate: r.work_date as string,
    kind: r.kind as ShiftKind,
    startTime: gioNgan(r.start_time),
    endTime: gioNgan(r.end_time),
  }));
}

/**
 * Số lịch hẹn đã đặt theo NGÀY trong tuần đang xem — quyết định 3 của thẻ:
 * báo thiếu người TRƯỚC, không đợi đến hôm đó mới vỡ. Chỉ đếm ca còn hiệu lực
 * ('booked'/'arrived'); ca huỷ / không đến không phải việc phải bố trí người.
 */
export async function demLichHenTheoNgay(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("appointments")
    .select("start_at, status")
    .gte("start_at", fromIso)
    .lt("start_at", toIso)
    .in("status", ["booked", "arrived"])
    .limit(1000);

  // ĐỌC HỎNG thì kêu lên. Gộp `error` với `!data` rồi trả rỗng là biến một
  // lần đọc hỏng thành câu "chưa có gì" — người dùng tin và đi làm việc sai.
  if (error) throw new Error(`Không đọc được dem lich hen theo ngay: ${error.message}`);
  if (!data) return {};
  const dem: Record<string, number> = {};
  for (const r of data) {
    // Ngày theo giờ VN (UTC+7) — cùng quy ước với monthKeyToRangeVN.
    const ngay = new Date(new Date(r.start_at as string).getTime() + 7 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    dem[ngay] = (dem[ngay] ?? 0) + 1;
  }
  return dem;
}

// ==================== NGHỈ PHÉP ====================

export type LeaveRequest = {
  id: string;
  employeeId: string;
  fromDate: string;
  toDate: string;
  kind: LeaveKind;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  decidedAt: string | null;
  createdAt: string;
  /**
   * #250 — số ngày công đơn này chiếm, ĐÓNG BĂNG bởi trigger `leave_dat_so_ngay`
   * lúc ghi và lúc quyết (đã trừ ngày được xếp ca "Nghỉ"). KHÔNG tính lại ở đây:
   * tính lúc đọc thì đổi lịch ca tháng trước làm số phép đã duyệt tự nhảy.
   */
  daysCount: number;
};

export async function layDonNghi(
  supabase: SupabaseClient,
  limit = LEAVE_LIST_LIMIT,
): Promise<LeaveRequest[]> {
  const { data, error } = await supabase
    .from("leave_requests")
    .select(
      "id, employee_id, from_date, to_date, kind, reason, status, decided_at, created_at, days_count",
    )
    .order("status", { ascending: true }) // approved < pending < rejected: đơn chờ không bị đẩy xuống cuối
    .order("from_date", { ascending: false })
    .limit(limit);

  // ĐỌC HỎNG thì kêu lên. Gộp `error` với `!data` rồi trả rỗng là biến một
  // lần đọc hỏng thành câu "chưa có gì" — người dùng tin và đi làm việc sai.
  if (error) throw new Error(`Không đọc được lay don nghi: ${error.message}`);
  if (!data) return [];
  return data.map((r) => ({
    id: r.id as string,
    employeeId: r.employee_id as string,
    fromDate: r.from_date as string,
    toDate: r.to_date as string,
    kind: r.kind as LeaveKind,
    reason: (r.reason as string | null) ?? null,
    status: r.status as "pending" | "approved" | "rejected",
    decidedAt: (r.decided_at as string | null) ?? null,
    createdAt: r.created_at as string,
    daysCount: Number(r.days_count ?? 0),
  }));
}

/**
 * #250 — số ngày phép NĂM đã dùng trong năm, theo từng người.
 *
 * Đi qua hàm `phep_da_dung()` (migration #250) thay vì cộng tay từ danh sách
 * `layDonNghi()`: danh sách đó chặn ở 50 đơn GẦN NHẤT và không lọc theo năm, nên
 * cộng từ nó ra một con số ĐÚNG-GẦN-ĐÚNG — mà số dư phép sai thì sai ở chỗ
 * người ta đem đi cãi nhau.
 *
 * Hàm là SECURITY INVOKER: RLS `leave_select` tự lọc (nhân viên ra đúng của
 * mình, quản lý trở lên ra cả tiệm). Lỗi thì trả map RỖNG và màn hình nói rõ là
 * chưa tra được — KHÔNG rơi về 0, vì "còn 0 ngày" và "chưa biết" là hai chuyện
 * khác nhau, mà cái đầu thì chặn người ta xin nghỉ.
 */
export async function layPhepDaDung(
  supabase: SupabaseClient,
  year: number,
): Promise<Record<string, number> | null> {
  const { data, error } = await supabase.rpc("phep_da_dung", { p_year: year });
  // ĐỌC HỎNG thì kêu lên. Gộp `error` với `!data` rồi trả rỗng là biến một
  // lần đọc hỏng thành câu "chưa có gì" — người dùng tin và đi làm việc sai.
  if (error) throw new Error(`Không đọc được lay phep da dung: ${error.message}`);
  if (!data) return null;
  return Object.fromEntries(
    (data as { employee_id: string; days: number | string }[]).map((r) => [
      r.employee_id,
      Number(r.days ?? 0),
    ]),
  );
}

/**
 * #250 — đơn nghỉ ĐÃ DUYỆT chạm vào một kỳ, để `tinhLaiBangCong()` cộng ngày
 * phép vào công. Tách khỏi `layDonNghi()` vì cái kia giới hạn theo SỐ ĐƠN gần
 * nhất, còn ở đây phải lấy ĐỦ mọi đơn chạm kỳ — thiếu một đơn là thiếu công của
 * một người trong tháng đó.
 */
export async function layDonNghiDaDuyetTrongKy(
  supabase: SupabaseClient,
  employeeId: string,
  fromDate: string,
  toDate: string,
): Promise<Pick<LeaveRequest, "fromDate" | "toDate" | "kind">[]> {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("from_date, to_date, kind")
    .eq("employee_id", employeeId)
    .eq("status", "approved")
    .lte("from_date", toDate)
    .gte("to_date", fromDate)
    .limit(200);

  // ĐỌC HỎNG thì kêu lên. Gộp `error` với `!data` rồi trả rỗng là biến một
  // lần đọc hỏng thành câu "chưa có gì" — người dùng tin và đi làm việc sai.
  if (error) throw new Error(`Không đọc được lay don nghi da duyet trong ky: ${error.message}`);
  if (!data) return [];
  return data.map((r) => ({
    fromDate: r.from_date as string,
    toDate: r.to_date as string,
    kind: r.kind as LeaveKind,
  }));
}

/**
 * Quyết định 4 của thẻ: duyệt nghỉ phải hiện HẬU QUẢ lên lịch hẹn — "hôm đó đã
 * có 3 lịch khách chỉ định". Duyệt mà không nhắc là đẩy cái vỡ sang cho khách.
 *
 * Trả về map `leaveId → số lịch hẹn` cho các đơn ĐANG CHỜ. Một truy vấn cho cả
 * danh sách (không phải mỗi đơn một truy vấn).
 *
 * ⚠️ Chỉ đếm được cho người mà NGƯỜI ĐANG XEM đọc được `employees.user_id` —
 * tức owner/admin. Với quản lý, `employeeUserId` rỗng nên map trống và màn hình
 * nói rõ là chưa đối chiếu được (xem ghi chú QUYỀN ĐỌC TÊN ở đầu file).
 */
export async function demLichHenChoDonNghi(
  supabase: SupabaseClient,
  donCho: LeaveRequest[],
  employeeUserId: Map<string, string>,
): Promise<Record<string, number>> {
  const canDem = donCho.filter((d) => employeeUserId.has(d.employeeId));
  if (canDem.length === 0) return {};

  const fromDate = canDem.reduce((m, d) => (d.fromDate < m ? d.fromDate : m), canDem[0].fromDate);
  const toDate = canDem.reduce((m, d) => (d.toDate > m ? d.toDate : m), canDem[0].toDate);
  const fromIso = new Date(`${fromDate}T00:00:00+07:00`).toISOString();
  const toIso = new Date(new Date(`${toDate}T00:00:00+07:00`).getTime() + 86_400_000).toISOString();

  const { data } = await supabase
    .from("appointments")
    .select("staff_user_id, start_at")
    .gte("start_at", fromIso)
    .lt("start_at", toIso)
    .in("status", ["booked", "arrived"])
    .limit(2000);

  const ra: Record<string, number> = {};
  for (const d of canDem) {
    const uid = employeeUserId.get(d.employeeId)!;
    ra[d.id] = (data ?? []).filter((a) => {
      if (a.staff_user_id !== uid) return false;
      const ngay = new Date(new Date(a.start_at as string).getTime() + 7 * 3600 * 1000)
        .toISOString()
        .slice(0, 10);
      return ngay >= d.fromDate && ngay <= d.toDate;
    }).length;
  }
  return ra;
}

// ==================== VỊ TRÍ TIỆM ====================

export type WorkLocation = { lat: number; lng: number };

/**
 * Toạ độ tiệm — nguồn để tính `distance_m` của mỗi lần chấm.
 *
 * VÌ SAO NẰM Ở `tenants.settings`: cả kho KHÔNG có chỗ nào lưu toạ độ tiệm
 * (`storefront.address` chỉ là chữ). Mà không có gốc để đo thì `distance_m`
 * luôn null ⇒ trigger `attendance_set_flag()` gắn cờ MỌI lần chấm ⇒ cái cờ
 * mất hết ý nghĩa. Dùng ô `settings` jsonb có sẵn từ migration #1 (đang trống,
 * chưa mảng nào dùng) thay vì thêm cột — không có migration nào trong đợt này.
 */
/** Cấu hình chấm công theo tiệm (#232): toạ độ + bán kính + có bắt selfie không. */
export type AttendanceConfig = {
  lat: number | null;
  lng: number | null;
  radiusM: number;
  requireSelfie: boolean;
  /** #225 — % khớp mặt tối thiểu khi chấm giúp; dưới ngưỡng thì đánh dấu đỏ. */
  faceMatchMin: number;
  /**
   * #251 — bộ giờ CHUẨN của tiệm ('HH:mm'). Ô ca chỉ mang giờ riêng khi khác bộ
   * này. Ca `full` KHÔNG có cặp giờ riêng: nó là morningStart → afternoonEnd
   * (điểm chốt 2 của migration #251 — hai cặp giờ cho cùng một chuyện sẽ lệch).
   */
  morningStart: string;
  morningEnd: string;
  afternoonStart: string;
  afternoonEnd: string;
  /** #251 — ân hạn đi muộn (phút). Vào trễ trong khoảng này không tính là muộn. */
  lateGraceMin: number;
  /** #251 — ngưỡng tối thiểu để một ngày được tính tăng ca (phút). */
  overtimeMinMinutes: number;
  /**
   * #283 — số ngày công chuẩn một tháng của tiệm. Màn Bảng lương dùng nó làm
   * mốc HỎI "lương cứng đủ tháng mà thiếu công", không phải để trừ tiền.
   */
  congChuanThang: number;
};

/** Giờ ca mặc định khi tiệm chưa khai — khớp default của migration #251. */
export const GIO_CA_MAC_DINH = {
  morningStart: "08:30",
  morningEnd: "13:00",
  afternoonStart: "13:00",
  afternoonEnd: "21:30",
  lateGraceMin: 5,
  overtimeMinMinutes: 30,
  congChuanThang: 24,
} as const;

/**
 * #232 — đọc từ bảng attendance_settings (thay ô tenants.settings.workLocation
 * cũ; migration đã di trú toạ độ sang). Chưa cấu hình → toạ độ null + bán kính
 * mặc định 300 (khớp trigger attendance_set_flag). `maybeSingle` vì RLS chỉ trả
 * đúng dòng của tiệm đang mở (nhiều nhất 1).
 */
export async function layCauHinhChamCong(supabase: SupabaseClient): Promise<AttendanceConfig> {
  const { data } = await supabase
    .from("attendance_settings")
    .select(
      "lat, lng, radius_m, require_selfie, face_match_min, shift_morning_start, shift_morning_end, shift_afternoon_start, shift_afternoon_end, late_grace_min, overtime_min_minutes, cong_chuan_thang",
    )
    .maybeSingle();
  const toSo = (v: unknown): number | null => (v == null ? null : Number(v));
  return {
    lat: toSo(data?.lat),
    lng: toSo(data?.lng),
    radiusM: data?.radius_m != null ? Number(data.radius_m) : WORK_RADIUS_M,
    requireSelfie: data?.require_selfie === true,
    faceMatchMin: data?.face_match_min != null ? Number(data.face_match_min) : 80,
    morningStart: gioNgan(data?.shift_morning_start) ?? GIO_CA_MAC_DINH.morningStart,
    morningEnd: gioNgan(data?.shift_morning_end) ?? GIO_CA_MAC_DINH.morningEnd,
    afternoonStart: gioNgan(data?.shift_afternoon_start) ?? GIO_CA_MAC_DINH.afternoonStart,
    afternoonEnd: gioNgan(data?.shift_afternoon_end) ?? GIO_CA_MAC_DINH.afternoonEnd,
    lateGraceMin:
      data?.late_grace_min != null ? Number(data.late_grace_min) : GIO_CA_MAC_DINH.lateGraceMin,
    overtimeMinMinutes:
      data?.overtime_min_minutes != null
        ? Number(data.overtime_min_minutes)
        : GIO_CA_MAC_DINH.overtimeMinMinutes,
    congChuanThang:
      data?.cong_chuan_thang != null
        ? Number(data.cong_chuan_thang)
        : GIO_CA_MAC_DINH.congChuanThang,
  };
}

/**
 * #251 — cặp giờ áp cho MỘT ô ca. Giờ riêng của ô thắng; không có thì lấy bộ
 * chuẩn của tiệm theo loại ca. Ca "Nghỉ" trả null — không có mốc nào để so.
 *
 * Dùng chung cho cả việc tính bảng công (máy chủ) lẫn việc hiện giờ trên lưới
 * xếp ca (trình duyệt): hai nơi tự suy ra giờ theo hai cách là hai sự thật.
 */
export function gioCuaCa(
  ca: Pick<Shift, "kind" | "startTime" | "endTime">,
  cfg: Pick<
    AttendanceConfig,
    "morningStart" | "morningEnd" | "afternoonStart" | "afternoonEnd"
  >,
): { start: string; end: string } | null {
  if (ca.startTime && ca.endTime) return { start: ca.startTime, end: ca.endTime };
  switch (ca.kind) {
    case "morning":
      return { start: cfg.morningStart, end: cfg.morningEnd };
    case "afternoon":
      return { start: cfg.afternoonStart, end: cfg.afternoonEnd };
    case "full":
      return { start: cfg.morningStart, end: cfg.afternoonEnd };
    case "off":
      return null;
  }
}

/** 'HH:mm' → số phút từ nửa đêm. Chỉ dùng cho giờ trong ngày (không có ca qua đêm). */
export function phutTrongNgay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Toạ độ tiệm (từ cấu hình), hoặc null nếu chưa đặt. */
export async function layViTriTiem(supabase: SupabaseClient): Promise<WorkLocation | null> {
  const cfg = await layCauHinhChamCong(supabase);
  return cfg.lat != null && cfg.lng != null ? { lat: cfg.lat, lng: cfg.lng } : null;
}

/** Khoảng cách hai toạ độ (mét) — haversine, đủ chính xác ở cỡ vài km. */
export function khoangCachM(a: WorkLocation, b: WorkLocation): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

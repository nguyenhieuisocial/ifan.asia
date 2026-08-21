/**
 * Danh mục dùng chung của TRÌNH DỰNG QUY TRÌNH — server action và giao diện đọc
 * CÙNG một bảng này, nên không có đường nào để hai bên lệch nhau.
 *
 * Ba điều được chốt cứng ở đây, mỗi điều đều đối chiếu với CSDL thật:
 *
 * 1. SỰ KIỆN: chỉ những `event_type` thật sự CÓ TRIGGER PHÁT
 *    (docs/EVENT_CATALOG.md). Cho chọn một sự kiện không ai phát ra là dựng
 *    một quy trình vĩnh viễn không chạy mà không có gì báo.
 *
 *    ⚠️ ĐỪNG kiểm luật này bằng `select distinct event_type from domain_events`.
 *    Phép đó BÁO ĐỘNG NHẦM, và đã nhầm thật (đo 21/08): `deal.won` · `deal.lost`
 *    · `appointment.cancelled` · `appointment.no_show` có **0 dòng** trong
 *    `domain_events` — nhưng cả bốn đều phát đúng. Bảng rỗng vì CSDL đó toàn dữ
 *    liệu gieo mẫu, vốn INSERT thẳng bản ghi ở trạng thái cuối; còn bốn sự kiện
 *    này là sự kiện ĐỔI TRẠNG THÁI nên chỉ sinh ra ở nhánh UPDATE. "Chưa ai từng
 *    chốt thắng cơ hội nào" trông y hệt "trigger hỏng". Tin nhầm phép đo này là
 *    xoá mất `win_followup` — quy trình cài sẵn đang bật ở cả 5 tiệm.
 *
 *    Cách kiểm ĐÚNG: mở giao dịch, ĐỔI TRẠNG THÁI THẬT một bản ghi, đếm
 *    `domain_events` trước/sau, rồi `rollback`. Bảng đo đầy đủ nằm ở phần A của
 *    `supabase/migrations/20260821000297_bon_su_kien_khong_bao_gio_phat.sql`.
 *
 * 2. TRƯỜNG ĐIỀU KIỆN: `wf_aggregate()` (migration #15) CHỈ tra được bản ghi gốc
 *    của contact | deal | company. Với lịch hẹn, đơn hàng, thanh toán thì nó trả
 *    `{}` — nghĩa là mọi trường `aggregate.*` đều rỗng và điều kiện dựa vào chúng
 *    sẽ KHÔNG BAO GIỜ khớp. Vì thế ba nhóm sự kiện đó chỉ có trường `payload.*`.
 *
 * 3. LOẠI HÀNH ĐỘNG: `wf_exec_action()` lấy đích từ `aggregate_type` của sự kiện.
 *    Không phải contact/deal thì cả `v_contact` lẫn `v_deal` đều null, và hàm
 *    `raise exception 'wf_task_needs_target'` / `'wf_assign_needs_target'`. Nên
 *    "tạo việc" và "đổi người phụ trách" CHỈ hiện với sự kiện của khách và cơ hội
 *    — chứ không hiện ra rồi để mỗi lần chạy đều rơi vào "Dừng sau 3 lần thử".
 *
 * KHÔNG có `set_tier` trong trình dựng dù engine chạy được: từ migration #19,
 * nơi DUY NHẤT ghi `contacts.tier` là máy phân hạng `recompute_contact_tier()`
 * (trigger trên deals/contacts + cron 02:00 hằng đêm). Một quy trình đặt hạng tay
 * sẽ bị tính lại đè lên trong vòng một ngày — người dùng thấy "đã chạy: Xong"
 * nhưng hạng vẫn về chỗ cũ. Đó đúng là hỏng im lặng, nên không mở cửa vào.
 */

/** Phép so — đúng bộ mà `wf_match_conditions` hiểu (migration #163). */
export const PHEP_SO = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "contains",
  "exists",
  "notExists",
] as const;
export type PhepSo = (typeof PHEP_SO)[number];

/**
 * Kiểu trường quyết định ĐƯỢC DÙNG PHÉP SO NÀO — không phải để đẹp form mà vì
 * `wf_match_conditions` từ chối thẳng khi kiểu lệch: so số trên trường chữ trả
 * `false`, `contains` trên trường số cũng trả `false`.
 *
 * `choice` | `member` | `stage` đều lưu giá trị thô (mã hạng, uuid) nhưng người
 * dùng CHỈ thấy nhãn tiếng Việt / tên người / tên cột — luật của thẻ thiết kế.
 * `ref` là khoá ngoại không có danh sách để chọn, nên chỉ hỏi có/không có.
 */
export type KieuTruong = "text" | "number" | "choice" | "member" | "stage" | "ref";

const PHEP_SO_THEO_KIEU: Record<KieuTruong, PhepSo[]> = {
  text: ["eq", "neq", "contains", "in", "exists", "notExists"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "exists", "notExists"],
  choice: ["eq", "neq", "exists", "notExists"],
  member: ["eq", "neq", "exists", "notExists"],
  stage: ["eq", "neq", "exists", "notExists"],
  ref: ["exists", "notExists"],
};

export function phepSoChoKieu(kieu: KieuTruong): PhepSo[] {
  return PHEP_SO_THEO_KIEU[kieu];
}

export type TruongDieuKien = {
  /** Đường dẫn THẬT cho `wf_field` — không bao giờ hiện ra màn hình. */
  path: string;
  /** Khoá i18n dưới `settings.workflows.fields`. */
  nhan: string;
  kieu: KieuTruong;
  /** Với `choice`: các mã thật; nhãn lấy từ `settings.workflows.choices.<nhomChon>`. */
  chon?: readonly string[];
  nhomChon?: string;
  /** Trường tiền: đọc lại thành "5.000.000 ₫" thay vì một dãy số trần. */
  tien?: boolean;
};

/** Nhóm bản ghi gốc — quyết định trường nào tra được và hành động nào chạy được. */
export type NhomGoc = "contact" | "deal" | "company" | "appointment" | "order" | "payment";

export type SuKien = {
  /** `event_type` thật trong `domain_events`. */
  event: string;
  /** Khoá i18n dưới `settings.workflows.triggers`. */
  nhan: string;
  goc: NhomGoc;
  truong: readonly TruongDieuKien[];
};

const TIER = ["new", "regular", "vip", "dormant"] as const;

/** Trường của hồ sơ khách — `wf_aggregate('contact')` trả nguyên hàng `contacts`. */
const TRUONG_KHACH: readonly TruongDieuKien[] = [
  { path: "aggregate.tier", nhan: "contactTier", kieu: "choice", chon: TIER, nhomChon: "tier" },
  {
    path: "aggregate.lifecycle",
    nhan: "contactLifecycle",
    kieu: "choice",
    chon: ["lead", "customer"],
    nhomChon: "lifecycle",
  },
  { path: "aggregate.province", nhan: "contactProvince", kieu: "text" },
  { path: "aggregate.total_revenue", nhan: "contactRevenue", kieu: "number", tien: true },
  { path: "aggregate.lead_score", nhan: "contactScore", kieu: "number" },
  { path: "aggregate.phone", nhan: "contactPhone", kieu: "text" },
  { path: "aggregate.email", nhan: "contactEmail", kieu: "text" },
  { path: "aggregate.owner_id", nhan: "contactOwner", kieu: "member" },
  { path: "aggregate.company_id", nhan: "contactCompany", kieu: "ref" },
];

/** Trường của cơ hội — `wf_aggregate('deal')` trả nguyên hàng `deals`. */
const TRUONG_COHOI: readonly TruongDieuKien[] = [
  { path: "aggregate.value_vnd", nhan: "dealValue", kieu: "number", tien: true },
  { path: "aggregate.title", nhan: "dealTitle", kieu: "text" },
  {
    path: "aggregate.status",
    nhan: "dealStatus",
    kieu: "choice",
    chon: ["open", "won", "lost"],
    nhomChon: "dealStatus",
  },
  { path: "aggregate.stage_id", nhan: "dealStage", kieu: "stage" },
  { path: "aggregate.owner_id", nhan: "dealOwner", kieu: "member" },
  { path: "aggregate.contact_id", nhan: "dealContact", kieu: "ref" },
];

const TRUONG_CONGTY: readonly TruongDieuKien[] = [
  { path: "aggregate.name", nhan: "companyName", kieu: "text" },
  { path: "aggregate.email_domain", nhan: "companyDomain", kieu: "text" },
  { path: "aggregate.tax_code", nhan: "companyTax", kieu: "text" },
];

/**
 * Lịch hẹn / đơn / thanh toán: CHỈ `payload.*`. Xem lý do 2 ở đầu file — thêm
 * một trường `aggregate.*` vào đây là thêm một điều kiện không bao giờ khớp.
 */
const TRUONG_LICHHEN: readonly TruongDieuKien[] = [
  { path: "payload.price_vnd", nhan: "apptPrice", kieu: "number", tien: true },
  {
    path: "payload.source",
    nhan: "apptSource",
    kieu: "choice",
    chon: ["chat", "calendar"],
    nhomChon: "apptSource",
  },
  { path: "payload.staff_user_id", nhan: "apptStaff", kieu: "member" },
  { path: "payload.contact_id", nhan: "apptContact", kieu: "ref" },
];

const TRUONG_DON: readonly TruongDieuKien[] = [
  {
    path: "payload.kind",
    nhan: "orderKind",
    kieu: "choice",
    chon: ["order", "return"],
    nhomChon: "orderKind",
  },
  { path: "payload.created_by", nhan: "orderCreatedBy", kieu: "member" },
  { path: "payload.contact_id", nhan: "orderContact", kieu: "ref" },
];

const TRUONG_THANHTOAN: readonly TruongDieuKien[] = [
  { path: "payload.amount_vnd", nhan: "payAmount", kieu: "number", tien: true },
  {
    path: "payload.method",
    nhan: "payMethod",
    kieu: "choice",
    // 4 cách trả, khớp `order_payments_method_check`. `points` vào từ migration
    // #194 — thiếu nó thì không ai đặt được luật cho đơn khách trả bằng điểm.
    chon: ["cash", "bank_transfer", "vietqr", "points"],
    nhomChon: "payMethod",
  },
  { path: "payload.received_by", nhan: "payReceivedBy", kieu: "member" },
];

/**
 * Danh sách sự kiện cho chọn. `sla.warning`/`sla.breached` CỐ Ý không có mặt:
 * `aggregate_type` của chúng đổi theo từng chính sách (deal | conversation |
 * activity), nên không thể nói trước hành động nào chạy được — mà đoán sai ở
 * đây thì mỗi lần chạy đều chết. Cảnh báo SLA đã có đường thông báo riêng của
 * `process_sla_timers()`.
 */
export const SU_KIEN: readonly SuKien[] = [
  { event: "contact.created", nhan: "contactCreated", goc: "contact", truong: TRUONG_KHACH },
  { event: "contact.updated", nhan: "contactUpdated", goc: "contact", truong: TRUONG_KHACH },
  {
    event: "contact.tier_changed",
    nhan: "contactTierChanged",
    goc: "contact",
    truong: [
      {
        path: "payload.new_tier",
        nhan: "newTier",
        kieu: "choice",
        chon: TIER,
        nhomChon: "tier",
      },
      {
        path: "payload.old_tier",
        nhan: "oldTier",
        kieu: "choice",
        chon: TIER,
        nhomChon: "tier",
      },
      ...TRUONG_KHACH,
    ],
  },
  {
    event: "contact.company_linked",
    nhan: "contactCompanyLinked",
    goc: "contact",
    truong: TRUONG_KHACH,
  },
  {
    event: "contact.owner_changed",
    nhan: "contactOwnerChanged",
    goc: "contact",
    truong: [
      { path: "payload.new_owner_id", nhan: "newOwner", kieu: "member" },
      { path: "payload.old_owner_id", nhan: "oldOwner", kieu: "member" },
      ...TRUONG_KHACH,
    ],
  },
  { event: "deal.created", nhan: "dealCreated", goc: "deal", truong: TRUONG_COHOI },
  {
    event: "deal.stage_changed",
    nhan: "dealStageChanged",
    goc: "deal",
    truong: [
      { path: "payload.new_stage_id", nhan: "newStage", kieu: "stage" },
      { path: "payload.old_stage_id", nhan: "oldStage", kieu: "stage" },
      ...TRUONG_COHOI,
    ],
  },
  { event: "deal.won", nhan: "dealWon", goc: "deal", truong: TRUONG_COHOI },
  {
    event: "deal.lost",
    nhan: "dealLost",
    goc: "deal",
    truong: [
      { path: "payload.reason", nhan: "lostReason", kieu: "text" },
      ...TRUONG_COHOI,
    ],
  },
  { event: "company.created", nhan: "companyCreated", goc: "company", truong: TRUONG_CONGTY },
  { event: "company.updated", nhan: "companyUpdated", goc: "company", truong: TRUONG_CONGTY },
  {
    event: "appointment.booked",
    nhan: "apptBooked",
    goc: "appointment",
    truong: TRUONG_LICHHEN,
  },
  {
    event: "appointment.arrived",
    nhan: "apptArrived",
    goc: "appointment",
    truong: TRUONG_LICHHEN,
  },
  { event: "appointment.done", nhan: "apptDone", goc: "appointment", truong: TRUONG_LICHHEN },
  {
    event: "appointment.cancelled",
    nhan: "apptCancelled",
    goc: "appointment",
    truong: [
      { path: "payload.cancel_reason", nhan: "cancelReason", kieu: "text" },
      ...TRUONG_LICHHEN,
    ],
  },
  {
    event: "appointment.no_show",
    nhan: "apptNoShow",
    goc: "appointment",
    truong: TRUONG_LICHHEN,
  },
  { event: "order.created", nhan: "orderCreated", goc: "order", truong: TRUONG_DON },
  { event: "order.confirmed", nhan: "orderConfirmed", goc: "order", truong: TRUONG_DON },
  { event: "order.completed", nhan: "orderCompleted", goc: "order", truong: TRUONG_DON },
  {
    event: "order.cancelled",
    nhan: "orderCancelled",
    goc: "order",
    truong: [
      { path: "payload.cancel_reason", nhan: "cancelReason", kieu: "text" },
      ...TRUONG_DON,
    ],
  },
  {
    event: "payment.received",
    nhan: "paymentReceived",
    goc: "payment",
    truong: TRUONG_THANHTOAN,
  },
];

export function timSuKien(event: string): SuKien | undefined {
  return SU_KIEN.find((s) => s.event === event);
}

/** Loại hành động — đúng bộ mà engine chạy được, xem lý do 3 ở đầu file. */
export const LOAI_HANH_DONG = ["create_task", "notify", "assign_owner", "approval"] as const;
export type LoaiHanhDong = (typeof LOAI_HANH_DONG)[number];

/** Chỉ contact/deal mới có đích để gắn việc / đổi người phụ trách. */
const CO_DICH: readonly NhomGoc[] = ["contact", "deal"];

export function hanhDongChoGoc(goc: NhomGoc): LoaiHanhDong[] {
  return CO_DICH.includes(goc)
    ? ["create_task", "notify", "assign_owner", "approval"]
    : ["notify", "approval"];
}

/**
 * Mốc hạn của việc — chuỗi phải ép được sang `interval` của Postgres
 * (`wf_exec_action` ép trực tiếp, sai là `wf_bad_due_in`) và phải khớp mẫu
 * đọc-thành-câu ở `workflow-labels.ts`.
 */
export const MOC_HAN = [
  "0 minutes",
  "30 minutes",
  "2 hours",
  "4 hours",
  "1 day",
  "3 days",
  "7 days",
] as const;
export type MocHan = (typeof MOC_HAN)[number];

/** Vai được giao duyệt — `wf_resolve_approvers` nhận dạng `role:<vai>`. */
export const VAI_DUYET = ["owner", "admin", "manager"] as const;
export type VaiDuyet = (typeof VAI_DUYET)[number];

/**
 * TRẦN của một quy trình. Không phải giới hạn kỹ thuật mà là giới hạn ĐỌC ĐƯỢC:
 * quá chừng này thì câu "Khi nào · Chỉ khi · Sẽ làm gì" không còn đọc như một
 * câu tiếng Việt nữa, và người dựng không còn tự kiểm được nó làm gì.
 */
export const TRAN_DIEU_KIEN = 5;
export const TRAN_HANH_DONG = 5;

/** Một dòng "chỉ chạy khi" mà giao diện gửi lên — server tự dựng jsonb từ đây. */
export type DongDieuKien = {
  field: string;
  op: PhepSo;
  value: string;
};

/** Một dòng "sẽ làm gì" mà giao diện gửi lên. */
export type DongHanhDong = {
  type: LoaiHanhDong;
  /** create_task */
  subject?: string;
  dueIn?: MocHan;
  assignTo?: string;
  /** notify | approval */
  title?: string;
  /** dùng chung: nội dung việc / thông báo / phiếu duyệt */
  body?: string;
  /** notify | assign_owner: "owner" hoặc uuid của một người trong tiệm */
  to?: string;
  /** approval */
  approverRole?: VaiDuyet;
};

// ============================================================
// DỰNG JSONB — một bản cài đặt duy nhất cho CẢ server và ô xem trước
// ============================================================
//
// Vì sao không để server tự dựng còn giao diện tự đoán: ô "xem trước bằng lời"
// tồn tại để người dùng đọc kiểm TRƯỚC khi lưu. Nếu nó đoán theo một đường khác
// với đường server thật sự ghi xuống, thì nó đang trấn an về một quy trình khác
// với quy trình sắp chạy — tệ hơn hẳn việc không có ô xem trước.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type KetQuaDung<T> = { ok: true; value: T } | { ok: false; error: string };

/** "owner" (người phụ trách bản ghi) hoặc uuid một người cụ thể — `wf_resolve_user`. */
function nguoiNhan(spec: string | undefined): string | null {
  const v = (spec ?? "owner").trim();
  if (v === "owner") return "owner";
  return UUID.test(v) ? v : null;
}

/**
 * Dựng `conditions` jsonb ĐÚNG hình dạng `wf_match_conditions` (migration #163).
 *
 * Hai điều bắt buộc phải làm ở ĐÂY chứ không phải ở ô nhập:
 *  - Ép KIỂU theo danh mục. Trường số mà nhận chuỗi "5000000" thì
 *    `wf_match_conditions` trả false ở mọi lần chạy (nó thoát ngay ở
 *    `jsonb_typeof(f) <> 'number'`) — một luật im lặng không chạy.
 *  - Chặn TRÙNG TRƯỜNG. `conditions` là object khoá theo đường dẫn, nên hai dòng
 *    cùng trường thì dòng sau đè dòng trước: người dùng mất một điều kiện mà màn
 *    hình vẫn báo đã lưu.
 */
export function dungDieuKien(
  event: string,
  rows: DongDieuKien[],
): KetQuaDung<Record<string, unknown>> {
  const suKien = timSuKien(event);
  if (!suKien) return { ok: false, error: "sai_su_kien" };

  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const truong = suKien.truong.find((f) => f.path === row.field);
    if (!truong) return { ok: false, error: "sai_truong" };
    if (row.field in out) return { ok: false, error: "trung_truong" };
    if (!phepSoChoKieu(truong.kieu).includes(row.op)) {
      return { ok: false, error: "sai_phep_so" };
    }

    if (row.op === "exists" || row.op === "notExists") {
      out[row.field] = { exists: row.op === "exists" };
      continue;
    }

    const raw = row.value.trim();
    if (raw === "") return { ok: false, error: "thieu_gia_tri" };

    if (truong.kieu === "number") {
      const n = Number(raw);
      if (!Number.isFinite(n)) return { ok: false, error: "sai_so" };
      out[row.field] = row.op === "eq" ? n : { [row.op]: n };
      continue;
    }

    if ((truong.kieu === "member" || truong.kieu === "stage") && !UUID.test(raw)) {
      return { ok: false, error: "sai_gia_tri" };
    }
    if (truong.kieu === "choice" && !(truong.chon ?? []).includes(raw)) {
      return { ok: false, error: "sai_gia_tri" };
    }

    if (row.op === "in") {
      const list = raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "");
      if (list.length === 0) return { ok: false, error: "thieu_gia_tri" };
      out[row.field] = { in: list.slice(0, 20) };
      continue;
    }
    out[row.field] = row.op === "eq" ? raw : { [row.op]: raw };
  }
  return { ok: true, value: out };
}

/**
 * Dựng `actions` jsonb. Chỉ nhận loại hành động mà `wf_exec_action()` /
 * `execute_workflow_run()` THẬT SỰ chạy được VỚI ĐÚNG nhóm bản ghi gốc của sự
 * kiện — xem lý do 3 ở đầu file.
 */
export function dungHanhDong(
  event: string,
  rows: DongHanhDong[],
): KetQuaDung<Record<string, unknown>[]> {
  const suKien = timSuKien(event);
  if (!suKien) return { ok: false, error: "sai_su_kien" };
  const choPhep = hanhDongChoGoc(suKien.goc);

  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    if (!choPhep.includes(row.type)) return { ok: false, error: "hanh_dong_khong_chay_duoc" };
    const body = row.body?.trim() ? row.body.trim() : null;

    if (row.type === "create_task") {
      const subject = row.subject?.trim() ?? "";
      if (subject === "") return { ok: false, error: "thieu_ten_viec" };
      const to = nguoiNhan(row.assignTo);
      if (!to) return { ok: false, error: "sai_nguoi" };
      out.push({
        type: "create_task",
        subject,
        body,
        due_in: (MOC_HAN as readonly string[]).includes(row.dueIn ?? "")
          ? row.dueIn
          : "0 minutes",
        assign_to: to,
      });
      continue;
    }

    if (row.type === "notify") {
      const title = row.title?.trim() ?? "";
      if (title === "") return { ok: false, error: "thieu_tieu_de" };
      const to = nguoiNhan(row.to);
      if (!to) return { ok: false, error: "sai_nguoi" };
      out.push({ type: "notify", to, title, body });
      continue;
    }

    if (row.type === "assign_owner") {
      // "owner" ở đây nghĩa là giao lại cho CHÍNH người đang phụ trách — một
      // hành động không làm gì cả. Bắt buộc chọn người cụ thể.
      const to = row.to?.trim() ?? "";
      if (!UUID.test(to)) return { ok: false, error: "thieu_nguoi_nhan" };
      out.push({ type: "assign_owner", to });
      continue;
    }

    const title = row.title?.trim() ?? "";
    if (title === "") return { ok: false, error: "thieu_tieu_de" };
    const vai = (VAI_DUYET as readonly string[]).includes(row.approverRole ?? "")
      ? row.approverRole
      : "owner";
    out.push({ type: "approval", title, body, levels: [{ to: `role:${vai}` }] });
  }
  return { ok: true, value: out };
}

#!/usr/bin/env node
/**
 * Gieo dữ liệu VẬN HÀNH TIỆM cho tiệm mẫu `demo-spa-huong-sen`.
 *
 * VÌ SAO CẦN: tiệm demo đã có người (21 hồ sơ), có hàng (8 mặt hàng), có đơn
 * (87 đơn) — nhưng toàn bộ mảng ĐIỀU HÀNH thì trắng: không dự án, không việc,
 * không chỉ tiêu, không giường/phòng, không kho tri thức, không trần giảm giá,
 * không ngày nghỉ. Mở các màn đó ra chỉ thấy khung rỗng. Đúng bệnh việc #161 đã
 * gặp với mảng Bán hàng: màn đã dựng mà không có dữ liệu thì coi như chưa có.
 *
 * VÌ SAO ĐI ĐƯỜNG NÀY (chứ không chèn thẳng cho nhanh):
 *   • Kiểm kho — chỉ ghi phiếu + dòng đếm rồi CHUYỂN TRẠNG THÁI sang `da_chot`.
 *     Trigger `stocktakes_sinh_dong_kho` tự đẻ dòng kho từ chênh lệch. Tự tay
 *     chèn `stock_moves` là làm số đá nhau — lớp bệnh nặng nhất kho này từng có.
 *   • Giảm giá — gọi RPC `discount_request` / `discount_decide`, không ghi thẳng
 *     `discount_approvals`. RPC mới là chỗ tính tỷ lệ, so trần theo vai, chặn
 *     tự-duyệt, và áp ngược vào dòng hàng. Ghi tay thì phiếu có mà luật không chạy.
 *   • Chỉ tiêu — gọi RPC `kpi_set_target`, vì nó kiểm người nhận có đang làm ở
 *     tiệm không (khoá ngoại sang `auth.users` không kiểm được điều đó).
 *   • Ngày xong của dự án — KHÔNG gửi lên. `projects_chot_ngay_xong` luôn tính
 *     lại từ việc thật; gửi lên chỉ là gửi thừa rồi bị ghi đè.
 *
 * VÌ SAO PHẢI MƯỢN DANH NGƯỜI DÙNG: các RPC và trigger canh cửa ở trên đọc
 * `auth.uid()` / `app_role()`. Nối thẳng bằng `pg` thì hai hàm đó rỗng ⇒ kho tri
 * thức không đăng được, RPC báo `forbidden`. Nên trước mỗi bước cần danh tính,
 * script đặt `request.jwt.claims` đúng người THẬT đã có trong tiệm — không tạo
 * tài khoản mới, không nới quyền, và gỡ danh ngay sau khi xong.
 *
 * CHẠY LẠI KHÔNG NHÂN ĐÔI: mọi thứ neo vào khoá cố định (tên tài nguyên, tên dự
 * án, tiêu đề việc, câu hỏi, mốc ghi chú trên phiếu, ngày nghỉ). Chạy hai lần ra
 * cùng một kết quả — đây là điều kiện nghiệm thu, không phải lời hứa suông.
 *
 * CHỈ ĐỤNG TIỆM `is_sample = true`. Chốt kiểm ở ngay đầu, sai thì dừng.
 *
 * Chạy:  node --env-file=.env.local scripts/seed-van-hanh-demo.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";

const SLUG = "demo-spa-huong-sen";
const MOC = "[seed-van-hanh-demo]"; // dấu nhận diện để chạy lại không nhân đôi

const DB = process.env.SUPABASE_DB_URL;
if (!DB) { console.error("Thiếu SUPABASE_DB_URL"); process.exit(1); }

const c = new pg.Client({
  connectionString: DB,
  ssl: { ca: readFileSync("supabase/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
});
await c.connect();
await c.query("set lock_timeout = '10s'");

// Các bảng đếm trước/sau để tự chứng minh, không nói suông.
const BANG = [
  "resources", "projects", "activities", "task_blocks", "kpi_targets",
  "stocktakes", "stocktake_lines", "stock_moves", "kb_entries",
  "discount_caps", "discount_approvals", "business_closures",
  "supplier_payments", "help_requests",
];

async function dem(tenantId) {
  const out = {};
  for (const b of BANG) {
    const { rows: [r] } = await c.query(
      `select count(*)::int n from public.${b} where tenant_id = $1`, [tenantId]);
    out[b] = r.n;
  }
  return out;
}

// Mượn danh một người thật trong tiệm để trigger/RPC nhìn thấy `auth.uid()`.
// `set_config(..., true)` = chỉ sống trong giao dịch này, thoát ra là hết.
async function nhuVai(uid, vai, tenantId) {
  await c.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: uid, role: "authenticated", app_metadata: { role: vai, tenant_id: tenantId } }),
  ]);
}
async function boDanh() {
  await c.query("select set_config('request.jwt.claims', '', true)");
}

try {
  // ══ CHỐT KIỂM: chỉ ghi vào tiệm mẫu ═══════════════════════════════════════
  const { rows: [tiem] } = await c.query(
    `select id, slug, name, is_sample from public.tenants where slug = $1 and deleted_at is null`, [SLUG]);
  if (!tiem) { console.error(`Không tìm thấy tiệm "${SLUG}" — dừng, không ghi gì.`); process.exit(1); }
  if (tiem.is_sample !== true) {
    console.error(`CHỐT KIỂM CHẶN: "${SLUG}" KHÔNG phải tiệm mẫu (is_sample = ${tiem.is_sample}). Dừng, không ghi gì.`);
    process.exit(1);
  }
  const T = tiem.id;
  console.log(`Tiệm mẫu: ${tiem.name} (${tiem.slug})\n`);

  // Tra người theo TÊN, không ghim uuid vào mã — kho khác nạp lại vẫn chạy.
  const { rows: nguoi } = await c.query(
    `select e.full_name, e.user_id, tm.role
       from public.employees e
       join public.tenant_members tm on tm.user_id = e.user_id and tm.tenant_id = e.tenant_id
      where e.tenant_id = $1 and tm.status = 'active'`, [T]);
  const uid = (ten) => {
    const r = nguoi.find((n) => n.full_name === ten);
    if (!r) throw new Error(`Không thấy nhân sự "${ten}" đang làm ở tiệm mẫu`);
    return r.user_id;
  };
  const CHU_TIEM = uid("Chủ tiệm Demo");
  const QUAN_LY = uid("Nguyễn Thị Bích Ngọc");          // vai admin
  const KTV_TRUONG_DA = uid("Phạm Thị Hồng Nhung");     // vai manager
  const KTV_TRUONG_MASSAGE = uid("Võ Thị Thanh Trúc");  // vai manager
  const THU_NGAN = uid("Lê Thị Mỹ Duyên");
  const TAP_VU = uid("Nguyễn Văn Tài");

  const truoc = await dem(T);

  await c.query("begin");
  await c.query("set local lock_timeout = '10s'");

  // ══ 1. TÀI NGUYÊN: giường / phòng / máy ═══════════════════════════════════
  // `resources` sẵn có UNIQUE (tenant_id, name) ⇒ neo thẳng vào đó.
  const TAI_NGUYEN = [
    ["Giường massage 1", "bed", true],
    ["Giường massage 2", "bed", true],
    ["Giường massage 3", "bed", true],
    ["Giường gội dưỡng sinh 1", "bed", true],
    ["Giường gội dưỡng sinh 2", "bed", true],
    ["Phòng chăm sóc da VIP", "room", true],
    ["Phòng chăm sóc da 2", "room", true],
    ["Phòng triệt lông", "room", true],
    ["Máy triệt lông Diode", "machine", true],
    ["Máy chăm sóc da đa năng", "machine", false], // đang gửi bảo hành
  ];
  for (const [ten, loai, dung] of TAI_NGUYEN) {
    await c.query(
      `insert into public.resources (tenant_id, name, kind, is_active) values ($1, $2, $3, $4)
       on conflict (tenant_id, name) do nothing`, [T, ten, loai, dung]);
  }

  // ══ 2. DỰ ÁN + VIỆC ══════════════════════════════════════════════════════
  async function duAn({ ten, mo_ta, bat_dau, ngan_sach, trang_thai }) {
    const { rows: co } = await c.query(
      `select id from public.projects where tenant_id = $1 and name = $2`, [T, ten]);
    if (co.length) return co[0].id;
    const { rows: [m] } = await c.query(
      `insert into public.projects (tenant_id, name, description, started_on, budget_vnd, status, created_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [T, ten, mo_ta, bat_dau, ngan_sach, trang_thai, CHU_TIEM]);
    return m.id;
  }

  async function viec(duAnId, { loai = "task", tieu_de, noi_dung = null, chu, han,
                                bat_dau = null, xong = null, ket_qua = null }) {
    const { rows: co } = await c.query(
      `select id from public.activities where tenant_id = $1 and project_id = $2 and subject = $3`,
      [T, duAnId, tieu_de]);
    if (co.length) return co[0].id;
    const { rows: [m] } = await c.query(
      `insert into public.activities
         (tenant_id, type, subject, body, project_id, owner_id, due_at, started_at, done_at, outcome)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [T, loai, tieu_de, noi_dung, duAnId, chu, han, bat_dau, xong, ket_qua]);
    return m.id;
  }

  const DU_AN = [
    {
      ten: "Khai trương chi nhánh 2 — Quận 7",
      mo_ta: "Mở thêm một tiệm ở Quận 7, dự kiến đón khách từ cuối tháng 9. Ngân sách gồm mặt bằng 3 tháng đầu, nội thất, thiết bị và chi phí khai trương.",
      bat_dau: "2026-07-01", ngan_sach: 350000000, trang_thai: "active",
      viec: [
        { tieu_de: "Chốt mặt bằng và ký hợp đồng thuê", chu: CHU_TIEM,
          han: "2026-07-15T17:00:00+07", xong: "2026-07-14T11:20:00+07",
          ket_qua: "Đã ký 3 năm, giá thuê 42 triệu/tháng, miễn tiền tháng đầu để sửa chữa." },
        { tieu_de: "Xin giấy phép kinh doanh chi nhánh", chu: QUAN_LY,
          han: "2026-08-10T17:00:00+07", xong: "2026-08-08T15:40:00+07",
          ket_qua: "Đã nhận giấy phép, bản gốc cất ở tủ hồ sơ tiệm chính." },
        { tieu_de: "Đặt 3 giường massage và 1 máy triệt lông",
          noi_dung: "Lấy cùng nhà cung cấp thiết bị của tiệm chính để hưởng giá cũ và bảo hành chung.",
          chu: QUAN_LY, han: "2026-08-25T17:00:00+07", bat_dau: "2026-08-12T09:00:00+07" },
        { tieu_de: "Tuyển 4 kỹ thuật viên cho chi nhánh 2",
          noi_dung: "2 chăm sóc da, 2 massage. Ưu tiên người đã có nghề, tiệm đào tạo lại theo quy trình chuẩn.",
          chu: QUAN_LY, han: "2026-09-05T17:00:00+07" },
        { tieu_de: "Thi công nội thất và biển hiệu", chu: TAP_VU,
          han: "2026-09-10T17:00:00+07", bat_dau: "2026-08-18T08:00:00+07" },
        { tieu_de: "Chạy chương trình khai trương giảm 30%", chu: uid("Vũ Thị Hoài Thương"),
          han: "2026-09-20T17:00:00+07" },
      ],
    },
    {
      ten: "Chuẩn hoá quy trình chăm sóc da",
      mo_ta: "Mỗi kỹ thuật viên đang làm một kiểu, khách quay lại thấy khác nhau. Viết một quy trình chung, quay video, rồi đào tạo lại cả tổ.",
      bat_dau: "2026-06-15", ngan_sach: 12000000, trang_thai: "active",
      viec: [
        { tieu_de: "Viết quy trình 8 bước chăm sóc da cơ bản", chu: KTV_TRUONG_DA,
          han: "2026-07-10T17:00:00+07", xong: "2026-07-09T16:10:00+07",
          ket_qua: "Bản in đã dán trong hai phòng chăm sóc da." },
        { tieu_de: "Quay video hướng dẫn cho kỹ thuật viên mới", chu: KTV_TRUONG_DA,
          han: "2026-08-22T17:00:00+07", bat_dau: "2026-08-15T14:00:00+07" },
        { tieu_de: "Đào tạo lại 4 kỹ thuật viên theo quy trình mới", chu: uid("Đặng Thị Ngọc Hà"),
          han: "2026-08-30T17:00:00+07" },
        { tieu_de: "Soạn phiếu chấm điểm chất lượng buổi chăm sóc", chu: uid("Mai Thị Quỳnh Như"),
          han: "2026-09-05T17:00:00+07" },
        { loai: "meeting", tieu_de: "Họp rà soát quy trình cùng tổ chăm sóc da",
          noi_dung: "Họp 30 phút đầu ca chiều, nghe kỹ thuật viên phản hồi chỗ nào khó làm theo.",
          chu: KTV_TRUONG_DA, han: "2026-08-21T14:00:00+07" },
      ],
    },
    {
      ten: "Đào tạo kỹ thuật viên triệt lông đợt 3",
      mo_ta: "Chuẩn bị người cho chi nhánh 2 và để thay ca khi tiệm chính đông. Có chuyên gia của hãng máy về dạy.",
      bat_dau: "2026-08-01", ngan_sach: 25000000, trang_thai: "active",
      viec: [
        { tieu_de: "Mời chuyên gia hãng máy về đào tạo 2 buổi", chu: uid("Đỗ Thị Phương Thảo"),
          han: "2026-08-14T17:00:00+07", xong: "2026-08-14T18:30:00+07",
          ket_qua: "Đã dạy 2 buổi tối, 5 kỹ thuật viên dự đủ." },
        { tieu_de: "Thi thực hành trên mẫu — 3 kỹ thuật viên", chu: uid("Đỗ Thị Phương Thảo"),
          han: "2026-08-28T17:00:00+07", bat_dau: "2026-08-19T10:00:00+07" },
        { tieu_de: "Cấp chứng nhận nội bộ và cập nhật hồ sơ", chu: QUAN_LY,
          han: "2026-09-02T17:00:00+07" },
      ],
    },
    {
      ten: "Bảo trì – kiểm định thiết bị định kỳ",
      mo_ta: "Máy triệt lông và giường massage chạy liên tục từ Tết tới giờ chưa kiểm. Làm một đợt cho gọn rồi lên lịch định kỳ.",
      bat_dau: "2026-08-05", ngan_sach: 8000000, trang_thai: "active",
      viec: [
        { tieu_de: "Kiểm định máy triệt lông Diode", chu: TAP_VU,
          han: "2026-08-26T17:00:00+07", bat_dau: "2026-08-19T08:30:00+07" },
        { tieu_de: "Thay bọc giường massage 1 và 2", chu: TAP_VU, han: "2026-09-01T17:00:00+07" },
        { tieu_de: "Vệ sinh hệ thống xông hơi phòng VIP", chu: uid("Huỳnh Thị Diễm My"),
          han: "2026-08-24T17:00:00+07" },
        { tieu_de: "Lập lịch bảo trì định kỳ 6 tháng/lần", chu: QUAN_LY, han: "2026-09-15T17:00:00+07" },
      ],
    },
    {
      ten: "Chuyển sổ sách giấy sang phần mềm",
      mo_ta: "Trước đây ghi sổ tay, mất khách cũ và không biết tồn kho. Đã chuyển xong toàn bộ lên phần mềm.",
      bat_dau: "2026-05-02", ngan_sach: 5000000, trang_thai: "done",
      viec: [
        { tieu_de: "Nhập danh sách khách cũ từ sổ tay", chu: uid("Trần Thị Kim Anh"),
          han: "2026-05-20T17:00:00+07", xong: "2026-05-19T17:30:00+07",
          ket_qua: "Nhập được 480 khách, bỏ 60 số điện thoại trùng." },
        { tieu_de: "Nhập tồn kho đầu kỳ", chu: THU_NGAN,
          han: "2026-05-25T17:00:00+07", xong: "2026-05-24T16:00:00+07" },
        { tieu_de: "Tập huấn dùng phần mềm cho toàn tiệm", chu: QUAN_LY,
          han: "2026-06-05T17:00:00+07", xong: "2026-06-05T19:00:00+07",
          ket_qua: "Cả tiệm tự lên đơn được; lễ tân tự đặt lịch được." },
      ],
    },
  ];

  const idViec = new Map(); // "tên dự án ▸ tiêu đề việc" -> id
  for (const d of DU_AN) {
    const pid = await duAn(d);
    for (const v of d.viec) idViec.set(`${d.ten} ▸ ${v.tieu_de}`, await viec(pid, v));
  }

  // ══ 3. VIỆC CHẶN VIỆC ════════════════════════════════════════════════════
  // Trigger `task_blocks_mot_tang` chỉ cho MỘT tầng: một việc không thể vừa bị
  // chặn vừa đi chặn việc khác. Nên các cặp dưới đây rời nhau hoàn toàn.
  const CHAN = [
    ["Khai trương chi nhánh 2 — Quận 7 ▸ Xin giấy phép kinh doanh chi nhánh",
     "Khai trương chi nhánh 2 — Quận 7 ▸ Thi công nội thất và biển hiệu"],
    ["Chuẩn hoá quy trình chăm sóc da ▸ Viết quy trình 8 bước chăm sóc da cơ bản",
     "Chuẩn hoá quy trình chăm sóc da ▸ Đào tạo lại 4 kỹ thuật viên theo quy trình mới"],
    ["Đào tạo kỹ thuật viên triệt lông đợt 3 ▸ Thi thực hành trên mẫu — 3 kỹ thuật viên",
     "Đào tạo kỹ thuật viên triệt lông đợt 3 ▸ Cấp chứng nhận nội bộ và cập nhật hồ sơ"],
  ];
  for (const [a, b] of CHAN) {
    await c.query(
      `insert into public.task_blocks (tenant_id, blocker_id, blocked_id, created_by)
       values ($1, $2, $3, $4) on conflict (blocker_id, blocked_id) do nothing`,
      [T, idViec.get(a), idViec.get(b), CHU_TIEM]);
  }

  // ══ 4. CHỈ TIÊU THÁNG ════════════════════════════════════════════════════
  // Đi qua RPC `kpi_set_target`: nó tự upsert (chạy lại không nhân đôi) và tự
  // chặn gán chỉ tiêu cho người không còn làm ở tiệm.
  await nhuVai(CHU_TIEM, "owner", T);
  const CHI_TIEU = [
    [null, "2026-08-01", "revenue_won", 180000000],   // cả tiệm
    [null, "2026-08-01", "new_contacts", 60],
    [null, "2026-09-01", "revenue_won", 200000000],
    [KTV_TRUONG_DA, "2026-08-01", "revenue_won", 35000000],
    [KTV_TRUONG_MASSAGE, "2026-08-01", "revenue_won", 40000000],
    [uid("Đỗ Thị Phương Thảo"), "2026-08-01", "revenue_won", 28000000],
    [uid("Trần Thị Kim Anh"), "2026-08-01", "new_contacts", 25],
    [uid("Vũ Thị Hoài Thương"), "2026-08-01", "new_contacts", 30],
    [QUAN_LY, "2026-08-01", "tasks_done", 40],
    [uid("Bạn Thảo (lễ tân)"), "2026-08-01", "tasks_done", 25],
    [KTV_TRUONG_DA, "2026-09-01", "revenue_won", 38000000],
  ];
  for (const [u, thang, chi_so, muc] of CHI_TIEU) {
    await c.query("select public.kpi_set_target($1, $2, $3, $4)", [u, thang, chi_so, muc]);
  }
  await boDanh();

  // ══ 5. KIỂM KHO ══════════════════════════════════════════════════════════
  // Ghi phiếu + dòng đếm, rồi CHUYỂN TRẠNG THÁI. Dòng kho do trigger đẻ ra.
  // Tồn theo sổ lấy tại lúc mở phiếu ⇒ phải làm tuần tự theo ngày, vì phiếu chốt
  // trước làm đổi tồn của phiếu sau — đúng như tiệm thật.
  const { rows: hang } = await c.query(
    `select id, name from public.items where tenant_id = $1 and kind = 'product' and status = 'active'`, [T]);
  const maHang = Object.fromEntries(hang.map((h) => [h.name, h.id]));
  const tonTheoSo = async (itemId) => {
    const { rows: [r] } = await c.query(
      `select coalesce(sum(qty), 0)::numeric n from public.stock_moves where tenant_id = $1 and item_id = $2`,
      [T, itemId]);
    return Number(r.n);
  };

  // Số đếm ghi TUYỆT ĐỐI (trên kệ đếm được bao nhiêu), KHÔNG ghi theo chênh lệch.
  // Hai lý do, cả hai đều đã trả giá để biết:
  //   • Sổ kho tiệm demo trôi liên tục vì lịch sử đơn và phiếu nhập được bù vào
  //     ở những thời điểm khác nhau — có lúc âm, có lúc dương to. Ghi theo chênh
  //     lệch thì số đếm phụ thuộc sổ, mà `dem_thuc_te >= 0` là điều CSDL không
  //     nhân nhượng: sổ âm là script gãy giữa chừng (đã gãy một lần đúng ở đây).
  //   • Đời thật cũng đếm như vậy: người đếm kho đếm cái đang có, không đếm cái lệch.
  // Chênh lệch để CSDL tự trừ ra — và đó cũng là số mà trigger dùng để sinh dòng kho.
  const PHIEU = [
    {
      ghi_chu: `${MOC} kiểm giữa ca 17/08 — đếm nhầm ca, huỷ mở lại`,
      mo: "2026-08-17T15:10:00+07", chot: null, ket: "da_huy",
      nguoi: THU_NGAN, vai: "staff",
      dem: [["Dầu gội dược liệu", 17, null], ["Mặt nạ giấy cấp ẩm", 20, null]],
    },
    {
      // Lần đếm đầu tiên tử tế sau khi chuyển sổ sách: sổ đã trôi khỏi thực tế.
      // Lý do ghi "ghi nhầm" ⇒ trigger sinh dòng kho lý do `kiem_ke` (chốt lại sổ),
      // khác với hao hụt thật. Chênh lệch lớn hay nhỏ, âm hay dương, là tuỳ sổ
      // đang lệch thế nào lúc chốt — số đếm bên dưới là số trên kệ, không đổi.
      ghi_chu: `${MOC} kiểm kho cuối tuần 19/08 — đếm đủ 4 mặt hàng, chốt lại sổ`,
      mo: "2026-08-19T20:15:00+07", chot: "2026-08-19T21:40:00+07", ket: "da_chot",
      nguoi: THU_NGAN, vai: "staff",
      dem: [
        ["Dầu gội dược liệu", 18, "ghi_nham"],
        ["Kem chống nắng SPF50", 15, "ghi_nham"],
        ["Mặt nạ giấy cấp ẩm", 22, "ghi_nham"],
        ["Serum dưỡng ẩm HA", 9, "ghi_nham"],
      ],
    },
    {
      // Sau phiếu trên, sổ đúng bằng số vừa đếm. Phiếu này để thấy CẢ HAI ca:
      // một dòng khớp sổ (không sinh dòng kho) và một dòng lệch thật (có sinh).
      ghi_chu: `${MOC} kiểm nhanh 20/08 — chỉ 2 mặt hàng hay lệch`,
      mo: "2026-08-20T09:05:00+07", chot: "2026-08-20T09:35:00+07", ket: "da_chot",
      nguoi: QUAN_LY, vai: "admin",
      dem: [
        ["Kem chống nắng SPF50", 15, null],      // khớp sổ
        ["Mặt nạ giấy cấp ẩm", 21, "het_han"],   // 1 gói quá hạn, bỏ đi
      ],
    },
  ];

  const khoTruoc = (await c.query(
    `select count(*)::int n from public.stock_moves where tenant_id = $1`, [T])).rows[0].n;

  for (const p of PHIEU) {
    const { rows: co } = await c.query(
      `select id from public.stocktakes where tenant_id = $1 and note = $2`, [T, p.ghi_chu]);
    if (co.length) continue; // chạy lại: phiếu đã có thì không mở phiếu mới
    await nhuVai(p.nguoi, p.vai, T); // để trigger ghi đúng người vào dòng kho
    const { rows: [ph] } = await c.query(
      `insert into public.stocktakes (tenant_id, status, note, created_by, created_at)
       values ($1, 'dang_dem', $2, $3, $4) returning id`, [T, p.ghi_chu, p.nguoi, p.mo]);
    for (const [ten, demDuoc, ly_do] of p.dem) {
      const itemId = maHang[ten];
      if (!itemId) throw new Error(`Không thấy mặt hàng "${ten}" trong tiệm mẫu`);
      const so = await tonTheoSo(itemId); // tồn theo sổ ngay lúc mở phiếu
      await c.query(
        `insert into public.stocktake_lines
           (tenant_id, stocktake_id, item_id, ton_theo_so, dem_thuc_te, ly_do, created_at)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [T, ph.id, itemId, so, demDuoc, ly_do ?? null, p.mo]);
    }
    // Chuyển trạng thái = đường chính thức, dòng kho tự sinh từ đây. Đặt luôn
    // `closed_at` trong CÙNG câu lệnh để giờ chốt là giờ thật của phiếu; trigger
    // chỉ điền khi còn trống nên thấy đã có thì không ghi đè.
    if (p.ket === "da_chot") {
      await c.query(`update public.stocktakes set status = 'da_chot', closed_at = $2 where id = $1`,
        [ph.id, p.chot]);
    } else {
      await c.query(`update public.stocktakes set status = 'da_huy' where id = $1`, [ph.id]);
    }
    await boDanh();
  }

  const khoSau = (await c.query(
    `select count(*)::int n from public.stock_moves where tenant_id = $1`, [T])).rows[0].n;

  // ══ 6. KHO TRI THỨC ══════════════════════════════════════════════════════
  // `kb_entries_guard` chỉ cho chủ tiệm / quản trị ĐĂNG mục ⇒ mượn danh chủ tiệm.
  const KB = [
    ["published", "Tiệm có những dịch vụ nào và giá bao nhiêu?",
      "Tiệm Hương Sen hiện có 4 dịch vụ chính:\n• Gội đầu dưỡng sinh — 150.000đ (khoảng 45 phút)\n• Chăm sóc da cơ bản — 350.000đ (khoảng 60 phút)\n• Massage trị liệu — 450.000đ (khoảng 75 phút)\n• Triệt lông 1 vùng — 500.000đ (khoảng 30 phút)\nMua liệu trình nhiều buổi sẽ có giá tốt hơn. Chị/anh nhắn tiệm để được báo giá cụ thể theo vùng và số buổi."],
    ["published", "Tiệm mở cửa mấy giờ, có làm chủ nhật không?",
      "Tiệm mở cửa 9h00–20h00 tất cả các ngày trong tuần, kể cả thứ Bảy và Chủ nhật. Ngày lễ Tết tiệm nghỉ theo lịch báo trước trên trang tiệm và trên Zalo.\nKhung 18h–20h các ngày trong tuần thường kín, chị/anh nên đặt lịch trước ít nhất 1 ngày."],
    ["published", "Huỷ hoặc dời lịch hẹn thì cần báo trước bao lâu?",
      "Xin chị/anh báo trước ít nhất 2 tiếng để tiệm còn xếp khách khác. Dời lịch thì báo càng sớm càng tốt, tiệm giữ nguyên giá và ưu đãi đang có.\nNếu đã đặt cọc mà huỷ sát giờ (dưới 2 tiếng) hoặc không đến mà không báo, tiệm giữ lại tiền cọc để bù buổi trống của kỹ thuật viên. Trường hợp bất khả kháng (ốm, kẹt việc gấp) chị/anh cứ nói với lễ tân, tiệm linh động."],
    ["published", "Sau khi triệt lông cần kiêng gì?",
      "Trong 24–48 tiếng đầu:\n• Không tắm nước nóng, không xông hơi, không đi bơi.\n• Không chà xát, không tẩy tế bào chết vùng vừa triệt.\n• Không dùng mỹ phẩm có cồn hoặc hương liệu mạnh lên vùng đó.\n• Tránh nắng trực tiếp; ra đường nên che chắn và bôi kem chống nắng.\nDa hơi ửng đỏ và rát nhẹ vài tiếng là bình thường. Nếu sau 2 ngày vẫn đỏ nhiều, nổi mụn nước hoặc đau tăng lên, chị/anh chụp ảnh gửi tiệm ngay để tiệm xử lý."],
    ["published", "Triệt lông cần làm bao nhiêu buổi mới hết?",
      "Thông thường 6–8 buổi, mỗi buổi cách nhau 4–6 tuần tuỳ vùng. Lý do là máy chỉ tác động được lên sợi lông đang ở giai đoạn phát triển, mà tại một thời điểm chỉ khoảng 20–30% số lông nằm ở giai đoạn đó.\nSau liệu trình vẫn có thể còn lông tơ mảnh; mỗi năm dặm 1–2 buổi là đủ. Vùng nách và bikini thường thấy kết quả nhanh hơn vùng chân và tay."],
    ["published", "Chăm sóc da cơ bản gồm những bước nào?",
      "Buổi chăm sóc da cơ bản của tiệm đi theo 8 bước:\n1. Tẩy trang và làm sạch\n2. Tẩy tế bào chết nhẹ\n3. Xông hơi làm mềm da\n4. Lấy nhân mụn (nếu da cần và khách đồng ý)\n5. Massage mặt thư giãn\n6. Đắp mặt nạ theo tình trạng da\n7. Cân bằng và cấp ẩm\n8. Chống nắng (nếu khách ra ngoài ngay)\nTổng khoảng 60 phút. Kỹ thuật viên soi da và tư vấn trước khi bắt đầu."],
    ["published", "Đang mang thai có massage được không?",
      "Có, nhưng phải báo trước để tiệm xếp kỹ thuật viên và tư thế phù hợp.\n• 3 tháng đầu: tiệm không nhận massage toàn thân, chỉ gội đầu dưỡng sinh nhẹ.\n• Từ tháng thứ 4 trở đi: massage được, nằm nghiêng có gối kê, tránh vùng bụng, thắt lưng và một số huyệt.\n• Không xông hơi, không dùng tinh dầu nồng.\nNếu có tiền sử doạ sảy, cao huyết áp hoặc bác sĩ đã dặn kiêng, xin chị đừng làm và hỏi ý kiến bác sĩ trước."],
    ["published", "Tiệm nhận thanh toán bằng những cách nào?",
      "Tiệm nhận tiền mặt, chuyển khoản (quét mã QR tại quầy) và thẻ. Hoá đơn gửi qua Zalo hoặc in tại quầy tuỳ chị/anh chọn.\nVới liệu trình nhiều buổi, tiệm nhận trả trước toàn bộ, hoặc cọc 50% rồi trả nốt ở buổi thứ hai."],
    ["published", "Mua liệu trình rồi mà bận, có bảo lưu buổi được không?",
      "Được. Liệu trình có hạn dùng 12 tháng kể từ buổi đầu tiên. Trong thời gian đó chị/anh nghỉ bao lâu cũng được, buổi chưa dùng vẫn còn nguyên.\nLiệu trình cũng chuyển nhượng được cho người thân — chỉ cần báo lễ tân tên và số điện thoại người nhận. Tiệm không hoàn tiền mặt cho buổi chưa dùng, nhưng có thể đổi sang dịch vụ khác cùng giá trị."],
    ["published", "Da đang bị mụn viêm có làm chăm sóc da được không?",
      "Da có mụn viêm nhẹ vẫn làm được: kỹ thuật viên sẽ bỏ bước tẩy tế bào chết và massage mạnh, chỉ làm sạch dịu rồi đắp mặt nạ kháng viêm.\nNhưng nếu đang có mụn mủ lan rộng, mụn bọc sưng đau, da đang bong tróc do thuốc bôi (tretinoin, isotretinoin), hoặc vừa peel/laser dưới 2 tuần, tiệm sẽ hẹn lại và khuyên chị/anh đi khám da liễu trước. Làm ép trong lúc da đang viêm chỉ làm nặng thêm."],
    ["published", "Massage trị liệu khác gì massage thư giãn?",
      "Massage thư giãn tập trung vào cảm giác dễ chịu, lực vừa phải, đi khắp cơ thể.\nMassage trị liệu của tiệm nhắm vào vùng đang đau — vai gáy, thắt lưng, bắp chân — lực sâu hơn, có day ấn huyệt và kéo giãn cơ. Người ngồi máy tính nhiều, lái xe nhiều hoặc đứng cả ngày thường hợp với loại này.\nSau buổi đầu có thể hơi ê nhẹ 1 ngày, giống như sau khi tập — đó là bình thường."],
    ["published", "Trẻ em và người lớn tuổi có làm dịch vụ ở tiệm được không?",
      "• Dưới 16 tuổi: tiệm chỉ nhận gội đầu dưỡng sinh, và phải có cha mẹ đi cùng. Không triệt lông, không chăm sóc da lấy nhân mụn.\n• Người lớn tuổi: massage được, nhưng kỹ thuật viên sẽ giảm lực và bỏ động tác vặn cột sống. Nếu có loãng xương, đặt máy tạo nhịp tim, huyết áp cao chưa ổn định hoặc mới phẫu thuật, xin báo trước để tiệm tư vấn — có trường hợp tiệm sẽ từ chối để an toàn cho khách."],
    ["draft", "Khách đến trễ 15 phút thì lễ tân xử lý thế nào?",
      "(Hướng dẫn nội bộ — chưa đăng)\n• Trễ dưới 15 phút: vẫn nhận, rút ngắn phần massage thư giãn để không đẩy giờ khách sau.\n• Trễ 15–30 phút: hỏi khách kế tiếp còn trống không. Nếu kín, mời khách đổi sang dịch vụ ngắn hơn hoặc dời sang khung khác trong ngày.\n• Trễ trên 30 phút mà không báo: tính là lỡ hẹn, mời đặt lại.\nLuôn nói bằng giọng nhẹ, không trách khách."],
    ["draft", "Có chương trình giới thiệu bạn bè không?",
      "(Đang chốt với chủ tiệm — chưa đăng)\nDự kiến: khách cũ giới thiệu người mới, cả hai cùng được giảm 10% cho buổi kế tiếp. Người mới phải là khách chưa từng đến tiệm và phải nhắc tên người giới thiệu ngay khi đặt lịch."],
  ];
  await nhuVai(CHU_TIEM, "owner", T);
  for (const [tt, hoi, dap] of KB) {
    await c.query(
      `insert into public.kb_entries (tenant_id, question, answer, status)
       select $1, $2, $3, $4
        where not exists (select 1 from public.kb_entries where tenant_id = $1 and question = $2)`,
      [T, hoi, dap, tt]);
  }
  await boDanh();

  // ══ 7. TRẦN GIẢM GIÁ + PHIẾU XIN DUYỆT ═══════════════════════════════════
  // Trần: lễ tân/thu ngân 10%, kỹ thuật viên trưởng 20%, quản lý tiệm 50%.
  // Chủ tiệm không có trần — luật đó nằm trong RPC, không nằm ở bảng này.
  await c.query(
    `insert into public.discount_caps (tenant_id, staff_max_pct, manager_max_pct, admin_max_pct)
     values ($1, 10, 20, 50)
     on conflict (tenant_id) do update set staff_max_pct = 10, manager_max_pct = 20, admin_max_pct = 50`,
    [T]);

  // Phiếu xin duyệt phải đi qua RPC `discount_request` — đó mới là chỗ tính tỷ lệ
  // và so trần. Chỉ xin được trên dòng của đơn còn sửa được (draft/confirmed).
  const { rows: dongDon } = await c.query(
    `select ol.id, ol.qty, ol.unit_price_vnd, i.name, o.status
       from public.order_lines ol
       join public.orders o on o.id = ol.order_id
       join public.items i on i.id = ol.item_id
      where ol.tenant_id = $1 and o.status in ('draft', 'confirmed') and o.kind = 'order'
        and ol.qty > 0 and ol.unit_price_vnd > 0
      order by o.created_at`, [T]);

  const XIN = [
    { nguoi: uid("Trần Thị Kim Anh"), vai: "staff", pct: 0.20,
      ly_do: "Khách quen dẫn thêm 2 người bạn mới, xin giảm để giữ cả nhóm.",
      duyet: { boi: KTV_TRUONG_MASSAGE, vai: "manager", dong_y: true,
               ghi_chu: "Đồng ý — nhóm 3 người, bù lại bằng doanh thu buổi sau." } },
    { nguoi: THU_NGAN, vai: "staff", pct: 0.30,
      ly_do: "Khách phàn nàn buổi trước kỹ thuật viên làm vội, xin giảm để giữ khách.",
      duyet: null }, // để nguyên trạng thái chờ duyệt
  ];

  let soXin = 0;
  for (let i = 0; i < XIN.length && i < dongDon.length; i++) {
    const dong = dongDon[i];
    const x = XIN[i];
    // Chạy lại: dòng nào đã có phiếu thì bỏ qua hẳn. Nếu gọi lại RPC, phiếu cũ đã
    // 'approved' KHÔNG rơi vào ON CONFLICT của RPC (chỉ số chống trùng chỉ phủ
    // phiếu 'pending') ⇒ sẽ đẻ thêm một phiếu nữa. Chặn ở đây, không ở đó.
    const { rows: daCo } = await c.query(
      `select id from public.discount_approvals where order_line_id = $1`, [dong.id]);
    if (daCo.length) continue;

    const goc = Number(dong.qty) * Number(dong.unit_price_vnd);
    const giam = Math.round((goc * x.pct) / 1000) * 1000;
    await nhuVai(x.nguoi, x.vai, T);
    const { rows: [kq] } = await c.query(`select public.discount_request($1, $2, $3) r`,
      [dong.id, giam, x.ly_do]);
    await boDanh();
    soXin++;

    if (x.duyet && kq.r && kq.r.ket_qua === "cho_duyet") {
      const { rows: [ph] } = await c.query(
        `select id from public.discount_approvals where order_line_id = $1 and status = 'pending'`,
        [dong.id]);
      await nhuVai(x.duyet.boi, x.duyet.vai, T);
      await c.query(`select public.discount_decide($1, $2, $3)`, [ph.id, x.duyet.dong_y, x.duyet.ghi_chu]);
      await boDanh();
    }
  }

  // ══ 8. NGÀY NGHỈ ═════════════════════════════════════════════════════════
  const NGHI = [
    ["2027-02-05", "2027-02-11", "Nghỉ Tết Nguyên Đán", true, null, null],
    ["2027-04-30", "2027-05-03", "Nghỉ lễ 30/4 – 1/5", true, null, null],
    ["2026-09-02", "2026-09-02", "Nghỉ lễ Quốc khánh 2/9", true, null, null],
    ["2026-09-15", "2026-09-15", "Bảo trì máy triệt lông — nghỉ cả ngày", true, null, null],
    ["2026-10-10", "2026-10-10", "Sáng họp toàn tiệm — chiều mở cửa bình thường", false, "13:00", "20:00"],
  ];
  for (const [tu, den, ly_do, ca_ngay, mo, dong] of NGHI) {
    await c.query(
      `insert into public.business_closures
         (tenant_id, date_from, date_to, reason, is_full_day, open_time, close_time)
       select $1, $2::date, $3::date, $4, $5, $6::time, $7::time
        where not exists (select 1 from public.business_closures
                           where tenant_id = $1 and date_from = $2::date and reason = $4)`,
      [T, tu, den, ly_do, ca_ngay, mo, dong]);
  }

  // ══ 9. TRẢ TIỀN NHÀ CUNG CẤP ═════════════════════════════════════════════
  // Bảng vận hành còn trống, gắn thẳng vào phiếu nhập kho đã có: tiệm nhập hàng
  // thì phải có lúc trả tiền, không thì màn công nợ nhà cung cấp trắng trơn.
  const { rows: [nhap] } = await c.query(
    `select p.id, p.supplier_id,
            (select coalesce(sum(pl.qty_mua * pl.don_gia_mua), 0)::bigint
               from public.purchase_lines pl where pl.purchase_id = p.id) tong
       from public.purchases p where p.tenant_id = $1 order by p.created_at limit 1`, [T]);
  if (nhap) {
    const tong = Number(nhap.tong);
    const dot1 = Math.round((tong * 0.6) / 1000) * 1000;
    const dot2 = tong - dot1;
    const TRA = [
      [dot1, "transfer", "2026-08-18T16:30:00+07", `${MOC} chuyển khoản 60% khi nhận hàng`],
      [dot2, "cash", "2026-08-19T18:00:00+07", `${MOC} trả nốt phần còn lại bằng tiền mặt`],
    ];
    for (const [tien, cach, luc, ghi_chu] of TRA) {
      if (tien <= 0) continue;
      await c.query(
        `insert into public.supplier_payments
           (tenant_id, supplier_id, purchase_id, amount_vnd, payment_method, paid_at, note, recorded_by)
         select $1, $2, $3, $4, $5, $6, $7, $8
          where not exists (select 1 from public.supplier_payments where tenant_id = $1 and note = $7)`,
        [T, nhap.supplier_id, nhap.id, tien, cach, luc, ghi_chu, QUAN_LY]);
    }
  }

  // ══ 10. YÊU CẦU TRỢ GIÚP ═════════════════════════════════════════════════
  const TRO_GIUP = [
    [uid("Bạn Thảo (lễ tân)"),
      "Máy in hoá đơn ở quầy không ăn lệnh, khách đang đứng chờ lấy hoá đơn. Nhờ hỗ trợ gấp.",
      true, "open", "2026-08-20T10:12:00+07", null],
    [THU_NGAN,
      "Em lỡ chốt nhầm một đơn sang tên khách khác, nhờ bên mình hướng dẫn sửa lại.",
      false, "closed", "2026-08-14T15:20:00+07", "2026-08-14T16:05:00+07"],
  ];
  for (const [ai, loi_nhan, cho_xem, tt, luc, dong_luc] of TRO_GIUP) {
    await c.query(
      `insert into public.help_requests
         (tenant_id, created_by, message, allow_screen_view, status, created_at, closed_at)
       select $1, $2, $3, $4, $5, $6, $7
        where not exists (select 1 from public.help_requests where tenant_id = $1 and message = $3)`,
      [T, ai, loi_nhan, cho_xem, tt, luc, dong_luc]);
  }

  await c.query("commit");

  // ══ NGHIỆM THU ═══════════════════════════════════════════════════════════
  const sau = await dem(T);
  console.log("SỐ DÒNG TRƯỚC → SAU (tiệm mẫu)");
  for (const b of BANG) {
    const d = sau[b] - truoc[b];
    console.log(`  ${b.padEnd(20)} ${String(truoc[b]).padStart(5)} → ${String(sau[b]).padStart(5)}   ` +
      (d > 0 ? `+${d}` : d === 0 ? "(không đổi)" : `${d}`));
  }

  console.log(`\nĐỐI CHỨNG kiểm kho: stock_moves ${khoTruoc} → ${khoSau} (+${khoSau - khoTruoc}).`);
  const { rows: doChung } = await c.query(
    `select sm.reason, count(*)::int n
       from public.stock_moves sm
       join public.stocktake_lines sl on sl.id = sm.ref_id and sm.ref_type = 'stocktake_line'
       join public.stocktakes st on st.id = sl.stocktake_id
      where sm.tenant_id = $1 and st.note like $2
      group by 1 order by 1`, [T, `${MOC}%`]);
  console.log(`  Dòng kho gắn với phiếu của lần gieo này: ${doChung.map((r) => `${r.reason}=${r.n}`).join(", ") || "(chưa có)"}`);
  console.log("  Script KHÔNG có câu insert nào vào stock_moves — tự tra: grep -n \"stock_moves\" scripts/seed-van-hanh-demo.mjs");

  // ── ĐỐI CHỨNG trần giảm giá: cố ghi vượt trần rồi rollback ────────────────
  console.log("\nĐỐI CHỨNG trần giảm giá — cố ghi thẳng một khoản giảm vượt trần (sẽ rollback):");
  const { rows: [thu] } = await c.query(
    `select ol.id, ol.qty, ol.unit_price_vnd
       from public.order_lines ol join public.orders o on o.id = ol.order_id
      where ol.tenant_id = $1 and o.status in ('draft','confirmed') and o.kind = 'order'
        and ol.qty > 0 and ol.unit_price_vnd > 0
        and not exists (select 1 from public.discount_approvals a
                         where a.order_line_id = ol.id and a.status = 'approved')
      order by o.created_at desc limit 1`, [T]);
  if (!thu) {
    console.log("  KHÔNG THỬ ĐƯỢC: không còn dòng đơn nào chưa có phiếu đã duyệt để thử.");
  } else {
    const gocThu = Number(thu.qty) * Number(thu.unit_price_vnd);
    const giamThu = Math.round(gocThu * 0.67); // ~67% — vượt cả trần quản lý tiệm (50%)
    await c.query("begin");
    try {
      // Rời vai chủ bảng: trigger có cửa thoát cho `postgres` (hàm hệ tự kiểm
      // luật). Không đổi vai thì phép thử này chỉ là tự lừa mình.
      await c.query("set local role authenticated");
      await nhuVai(QUAN_LY, "admin", T);
      const r = await c.query(`update public.order_lines set discount_vnd = $2 where id = $1`,
        [thu.id, giamThu]);
      console.log(`  ⚠ CSDL KHÔNG TỪ CHỐI (sửa được ${r.rowCount} dòng, giảm ${giamThu}đ trên ${gocThu}đ ≈ 67%).`);
      console.log("  ⚠ ĐÂY LÀ LỖ THẬT: trần giảm giá không giữ được khi ghi thẳng vào bảng.");
    } catch (e) {
      console.log(`  CSDL TỪ CHỐI đúng như mong đợi: ${String(e.message).split("\n")[0].slice(0, 200)}`);
    }
    await c.query("rollback");
    const { rows: [ktra] } = await c.query(
      `select discount_vnd from public.order_lines where id = $1`, [thu.id]);
    console.log(`  Sau rollback, dòng đó vẫn giảm ${ktra.discount_vnd}đ — phép thử không để lại dấu vết.`);
  }

  console.log(`\nSố phiếu xin giảm giá gửi mới trong lần chạy này: ${soXin}`);
} catch (e) {
  try { await c.query("rollback"); } catch { /* đã rollback rồi */ }
  console.error("HỎNG, đã rollback:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}

#!/usr/bin/env node
/**
 * Seed tiệm demo "Spa Hương Sen (Demo)" trên DB THẬT — phục vụ demo bán hàng
 * (kịch bản demo 5 phút) + chụp ảnh sản phẩm cho landing.
 *
 * IDEMPOTENT: chạy lại an toàn — mọi bản ghi neo theo khóa cố định
 * (email user, slug tenant, external_id kênh/hội thoại/tin nhắn, SĐT khách).
 *
 * Cần env:
 *   SUPABASE_DB_URL            — kết nối Postgres (convention như rls-smoke.mjs)
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — tạo auth user (tự đọc .env.local nếu thiếu)
 * KHÔNG in secret ra console.
 */
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ---------- env: bổ sung từ .env.local nếu process.env thiếu ----------
const envPath = new URL("../.env.local", import.meta.url);
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
const DB_URL = process.env.SUPABASE_DB_URL;
const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DB_URL || !SB_URL || !SERVICE) {
  console.error("Thiếu SUPABASE_DB_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const DEMO_EMAIL = "demo.ifan.2026@gmail.com";
const DEMO_PASSWORD = "DemoIfan#2026";
const DEMO_NAME = "Chủ tiệm Demo";
const TENANT_NAME = "Spa Hương Sen (Demo)";
const TENANT_SLUG = "demo-spa-huong-sen";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const now = Date.now();
const ago = (ms) => new Date(now - ms).toISOString();

// ---------- 1) Auth user qua admin API (trigger profiles tự chạy) ----------
const admin = createClient(SB_URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
let userId;
{
  const { data, error } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: DEMO_NAME },
  });
  if (error) {
    if (!/already|registered|exists/i.test(error.message)) throw error;
  } else {
    userId = data.user.id;
  }
}

// ---------- 2) Postgres (TLS verify-full, CA ghim như rls-smoke) ----------
const caPath = new URL("../supabase/supabase-ca.crt", import.meta.url);
const c = new pg.Client({
  connectionString: DB_URL,
  ssl: { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true },
});
await c.connect();

if (!userId) {
  const r = await c.query(`select id from auth.users where email = $1`, [DEMO_EMAIL]);
  if (!r.rowCount) throw new Error("User demo tồn tại nhưng không tìm thấy trong auth.users");
  userId = r.rows[0].id;
  // đảm bảo mật khẩu demo luôn đăng nhập được khi chạy lại
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
}

await c.query("begin");
// helper: chạy 1 câu dưới danh nghĩa demo user (mô phỏng JWT như rls-smoke).
// `actorId` cho phép đóng vai người khác trong tiệm (nhân viên bàn giao khách) —
// mặc định vẫn là chủ tiệm nên mọi lời gọi cũ giữ nguyên hành vi.
async function asUser(claims, sql, params = [], actorId = userId) {
  await c.query(
    `select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)`,
    [JSON.stringify({ sub: actorId, role: "authenticated", app_metadata: claims })],
  );
  const r = await c.query(sql, params);
  await c.query(`select set_config('role', 'postgres', true)`);
  return r;
}

// tên hiển thị (trigger đặt theo prefix email — sửa lại cho đẹp)
await c.query(
  `insert into public.profiles (user_id, display_name) values ($2, $1)
   on conflict (user_id) do update set display_name = excluded.display_name`,
  [DEMO_NAME, userId],
);

// ---------- 3) Tenant + template ngành spa ----------
let tenantId;
{
  const r = await c.query(`select id from public.tenants where slug = $1`, [TENANT_SLUG]);
  if (r.rowCount) {
    tenantId = r.rows[0].id;
  } else {
    const cr = await asUser({}, `select public.create_tenant($1, $2) as id`, [
      TENANT_NAME,
      TENANT_SLUG,
    ]);
    tenantId = cr.rows[0].id;
  }
}
// seed_industry_template() bị xoá ở migration industry-pack-engine (V1a, task #58) —
// apply_industry_pack() làm mọi việc nó từng làm CỘNG pack engine; khoá pack cũng đổi
// 'spa_clinic' → 'spa' cùng đợt (xem supabase/migrations/20260811000060_industry_pack_engine.sql).
await asUser(
  { tenant_id: tenantId, role: "owner" },
  `select public.apply_industry_pack('spa')`,
);

// ---------- 4) Kênh demo (rõ ràng là demo, KHÔNG kết nối thật) ----------
await c.query(
  `insert into public.channels (tenant_id, type, external_id, display_name, status)
   values ($1, 'zalo_oa', 'demo-oa-000', 'Zalo OA Spa Hương Sen', 'pending_platform')
   on conflict (tenant_id, type, external_id) do nothing`,
  [tenantId],
);
const channelId = (
  await c.query(
    `select id from public.channels where tenant_id = $1 and type = 'zalo_oa' and external_id = 'demo-oa-000'`,
    [tenantId],
  )
).rows[0].id;

// Hộp chat website: BẬT THẬT qua chính RPC mà giao diện dùng — khóa nhúng chỉ
// hàm definer đặt được (migration #23), insert tay sẽ bị trigger chặn.
// livechat_setup là UPSERT nên chạy lại không sinh kênh thứ hai.
await asUser(
  { tenant_id: tenantId, role: "owner" },
  `select public.livechat_setup(true, $1, $2::text[])`,
  [
    "Dạ Spa Hương Sen xin chào! Chị cần tư vấn dịch vụ nào ạ?",
    ["https://spahuongsen.vn", "https://www.spahuongsen.vn"],
  ],
);
const livechatChannelId = (
  await c.query(`select id from public.channels where tenant_id = $1 and type = 'livechat'`, [
    tenantId,
  ])
).rows[0].id;

// Hai nguồn khách ngoài bộ hệ thống — cần cho đúng hai tính năng mới:
//   Website  → khách tự nhắn từ hộp chat trên web
//   Tại tiệm → khách quét mã QR dán ở quầy / tờ rơi (mã QR BẮT BUỘC gắn nguồn)
// Không có hai nguồn này thì cả hai kênh đều rơi vào "Khác" và báo cáo
// "Nguồn nào ra tiền" không nói được gì.
await c.query(
  `insert into public.lead_sources (tenant_id, name, channel_type, quality_score)
   values ($1, 'Website', 'website', 60), ($1, 'Tại tiệm', 'direct', 70)
   on conflict (tenant_id, name) do nothing`,
  [tenantId],
);

// nguồn khách hệ thống (create_tenant seed sẵn: Zalo · Facebook · Giới thiệu · Khác).
// Khớp theo channel_type TRƯỚC rồi mới tới tên: nguồn "Giới thiệu" mang channel_type
// 'referral' nên khớp theo tên sẽ trượt và rơi vào nguồn đầu danh sách — sai nguồn
// thì báo cáo quy kết cũng sai theo.
const sources = (
  await c.query(`select id, name, channel_type from public.lead_sources where tenant_id = $1`, [
    tenantId,
  ])
).rows;
const src = (kw) =>
  sources.find((s) => s.channel_type === kw || s.name.toLowerCase().includes(kw))?.id ??
  sources[0]?.id ??
  null;

// ---------- 4b) Công ty khách doanh nghiệp (neo theo tên miền email) ----------
// Nội dung tiếng Việt là DỮ LIỆU của tenant demo (shop Việt), KHÔNG phải chuỗi
// giao diện — luật i18n vi+en parity chỉ áp cho UI strings.
// tax_code lưu dạng SỐ THUẦN đúng chuẩn app (10 số, hoặc 13 số cho chi nhánh).
const COMPANIES = [
  {
    name: "Công ty CP Mỹ phẩm Hương Việt",
    domain: "huongviet.vn",
    taxCode: "0101243150",
    address: "18 Nguyễn Huệ, Q.1, TP. Hồ Chí Minh",
    phone: "02838221199",
  },
  {
    name: "Công ty TNHH Nội thất An Phú",
    domain: "anphu.com.vn",
    taxCode: "0312456789",
    address: "245 Điện Biên Phủ, Bình Thạnh",
    phone: "02839112244",
  },
  {
    // 13 số = chi nhánh (10 số đơn vị chính + 3 số chi nhánh)
    name: "Trung tâm Anh ngữ Sao Mai",
    domain: "saomai.edu.vn",
    taxCode: "0107654321001",
    address: "72 Trần Duy Hưng, Cầu Giấy, Hà Nội",
    phone: "02473001188",
  },
];
const companyId = {};
for (const co of COMPANIES) {
  const found = await c.query(
    `select id from public.companies where tenant_id = $1 and email_domain = $2 and deleted_at is null`,
    [tenantId, co.domain],
  );
  if (found.rowCount) {
    companyId[co.domain] = found.rows[0].id;
    await c.query(
      `update public.companies set name = $2, tax_code = $3, address = $4, phone = $5 where id = $1`,
      [found.rows[0].id, co.name, co.taxCode, co.address, co.phone],
    );
  } else {
    const ins = await c.query(
      `insert into public.companies
         (tenant_id, name, email_domain, tax_code, address, phone, owner_id, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$7) returning id`,
      [tenantId, co.name, co.domain, co.taxCode, co.address, co.phone, userId],
    );
    companyId[co.domain] = ins.rows[0].id;
  }
}

// ---------- 5) ~12 khách hàng (neo theo SĐT) ----------
// createdDays: tuổi hồ sơ (ngày) — rải 60 ngày. interactedH: tương tác cuối (giờ trước, null = chưa)
const CONTACTS = [
  // 3 khách doanh nghiệp: email công việc → gắn công ty (minh họa "tự động nối theo tên miền")
  { name: "Trần Ngọc Anh",   phone: "0903112233", email: "ngocanh.tran@huongviet.vn", company: "huongviet.vn", tier: "vip",     createdDays: 55, interactedH: 5,   address: "12 Trần Quang Khải, Q.1", province: "TP. Hồ Chí Minh", source: "zalo" },
  { name: "Lê Thị Minh Thư", phone: "0912334455", email: "minhthu.le@huongviet.vn",   company: "huongviet.vn", tier: "regular", createdDays: 40, interactedH: 2,   address: "88 Láng Hạ, Đống Đa",     province: "Hà Nội",          source: "zalo" },
  { name: "Phạm Quỳnh Chi",  phone: "0987654321", email: "quynhchi.pham@anphu.com.vn", company: "anphu.com.vn", tier: "vip",     createdDays: 48, interactedH: 24,  address: "5 Hai Bà Trưng, Q.3",     province: "TP. Hồ Chí Minh", source: "facebook" },
  { name: "Nguyễn Thu Hà",   phone: "0934556677", email: "thuha.ng@gmail.com",      tier: "regular", createdDays: 30, interactedH: 30,  address: "221 Nguyễn Văn Linh",     province: "Đà Nẵng",         source: "zalo" },
  { name: "Võ Hoài Phương",  phone: "0978112299", email: null,                       tier: "new",     createdDays: 3,  interactedH: 72,  address: null,                       province: "TP. Hồ Chí Minh", source: "other" },
  { name: "Đặng Kim Ngân",   phone: "0905667788", email: "kimngan.dang@gmail.com",  tier: "regular", createdDays: 25, interactedH: 96,  address: "34 Lê Lợi, Hải Châu",     province: "Đà Nẵng",         source: "referral" },
  { name: "Bùi Thanh Trúc",  phone: "0918445566", email: "thanhtruc.bui@gmail.com", tier: "new",     createdDays: 6,  interactedH: 120, address: null,                       province: "Hà Nội",          source: "zalo" },
  { name: "Hoàng Yến Nhi",   phone: "0966778899", email: "yennhi.hoang@gmail.com",  tier: "vip",     createdDays: 58, interactedH: 168, address: "9 Phan Chu Trinh, Q.1",   province: "TP. Hồ Chí Minh", source: "facebook" },
  { name: "Ngô Mai Linh",    phone: "0939001122", email: null,                       tier: "new",     createdDays: 10, interactedH: 200, address: null,                       province: "Cần Thơ",         source: "other" },
  { name: "Đỗ Hồng Nhung",   phone: "0947889900", email: "hongnhung.do@gmail.com",  tier: "regular", createdDays: 35, interactedH: 240, address: "56 Bà Triệu, Hoàn Kiếm",  province: "Hà Nội",          source: "referral" },
  { name: "Vũ Thảo Vy",      phone: "0902998877", email: null,                       tier: "dormant", createdDays: 59, interactedH: 1100, address: "77 CMT8, Q.10",          province: "TP. Hồ Chí Minh", source: "zalo" },
  { name: "Trịnh Lan Hương", phone: "0917665544", email: "lanhuong.trinh@gmail.com", tier: "dormant", createdDays: 52, interactedH: 900, address: null,                      province: "Hải Phòng",       source: "facebook" },
  // Khách "đa chạm" cho báo cáo quy kết: `source` = nguồn LÚC VÀO SỔ (sự kiện
  // contact.created ghi lại), `sourceNow` = nguồn hiện tại sau khi khách quay lại.
  // Nhờ hai chạm này mà 3 mô hình first/last/linear ra 3 con số KHÁC nhau khi demo.
  { name: "Lý Gia Hân",      phone: "0932114455", email: "giahan.ly@gmail.com",      tier: "vip",     createdDays: 45, interactedH: 300, address: "15 Nguyễn Thị Minh Khai, Q.1", province: "TP. Hồ Chí Minh", source: "facebook", sourceNow: "zalo" },
  // Hai khách tự nhắn từ hộp chat trên website (nguồn "Website")
  { name: "Nguyễn Khánh Vân", phone: "0961223344", email: "khanhvan.ng@gmail.com",   tier: "new",     createdDays: 2,  interactedH: 1,   address: null,                       province: "TP. Hồ Chí Minh", source: "website" },
  { name: "Phan Diệu Linh",   phone: "0355887766", email: null,                      tier: "new",     createdDays: 1,  interactedH: 3,   address: null,                       province: "Bình Dương",      source: "website" },
  // Khách quét mã QR dán ở quầy lễ tân (nguồn "Tại tiệm")
  { name: "Trương Bảo Trân",  phone: "0788334455", email: null,                      tier: "regular", createdDays: 12, interactedH: 20,  address: "102 Cách Mạng Tháng 8, Q.3", province: "TP. Hồ Chí Minh", source: "direct" },
];
const contactId = {};
for (const p of CONTACTS) {
  const found = await c.query(
    `select id from public.contacts where tenant_id = $1 and phone = $2 and deleted_at is null`,
    [tenantId, p.phone],
  );
  if (found.rowCount) {
    contactId[p.phone] = found.rows[0].id;
    // rerun: làm mới mốc tương tác + hồ sơ để demo không "già" đi theo thời gian.
    // source_id lấy nguồn HIỆN TẠI (sourceNow nếu khách có hành trình đa chạm) —
    // đặt lại mỗi lần chạy để hồ sơ seed cũ được sửa về đúng nguồn.
    await c.query(
      `update public.contacts set last_interaction_at = $2, email = $3, tier = $4,
         company_id = $5, source_id = $6 where id = $1`,
      [
        found.rows[0].id, ago(p.interactedH * HOUR), p.email, p.tier,
        p.company ? companyId[p.company] : null, src(p.sourceNow ?? p.source),
      ],
    );
  } else {
    const ins = await c.query(
      `insert into public.contacts
         (tenant_id, full_name, phone, phone_e164, email, address, province,
          tier, owner_id, source_id, created_by, created_at, last_interaction_at, company_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$9,$11,$12,$13) returning id`,
      [
        tenantId, p.name, p.phone, "+84" + p.phone.slice(1), p.email, p.address, p.province,
        p.tier, userId, src(p.source), ago(p.createdDays * DAY), ago(p.interactedH * HOUR),
        p.company ? companyId[p.company] : null,
      ],
    );
    contactId[p.phone] = ins.rows[0].id;
  }
}

// gán tag từ bộ đã seed theo ngành (idempotent qua PK contact_tags)
const tags = (
  await c.query(`select id, name from public.tags where tenant_id = $1 order by name`, [tenantId])
).rows;
if (tags.length) {
  const tagFor = (i) => tags[i % tags.length].id;
  let i = 0;
  for (const p of CONTACTS) {
    await c.query(
      `insert into public.contact_tags (tenant_id, contact_id, tag_id)
       values ($1,$2,$3), ($1,$2,$4) on conflict do nothing`,
      [tenantId, contactId[p.phone], tagFor(i), tagFor(i + 3)],
    );
    i++;
  }
}

// ---------- 6) 7 hội thoại spa (neo theo external_user_id) ----------
// m: [direction|note, nội dung, số giờ trước]  — direction: in/out, note = ghi chú nội bộ
const THREADS = [
  {
    ext: "demo-zl-001", phone: "0903112233", status: "open", unread: 0,
    m: [
      ["in",  "Chào em, chị muốn đặt lịch chăm sóc da mặt cuối tuần này được không?", 96],
      ["out", "Dạ em chào chị Ngọc Anh ạ 🌸 Cuối tuần bên em còn trống khung 9h30 và 15h thứ Bảy, chị tiện khung nào ạ?", 95.5],
      ["in",  "15h thứ Bảy nhé em. À da chị dạo này hơi khô, có liệu trình nào phù hợp không?", 95],
      ["out", "Dạ với da khô bên em đang có liệu trình cấp ẩm chuyên sâu HA 60 phút, đang ưu đãi tháng này còn 450k (giá gốc 600k) chị ạ.", 94.6],
      ["in",  "Nghe được đấy. Cho chị đặt gói đó luôn.", 94],
      ["out", "Dạ em chốt lịch 15h thứ Bảy — liệu trình cấp ẩm chuyên sâu cho chị nhé. Trước hôm đó em sẽ nhắn nhắc lịch ạ 💧", 93.8],
      ["note", "Khách VIP, da khô — ưu tiên phòng 2 có máy xông ẩm. Nhắc khách mang kết quả soi da lần trước.", 93],
      ["in",  "Em ơi cho chị hỏi thêm, chỗ em có giữ xe ô tô không?", 30],
      ["out", "Dạ có ạ, bãi xe ngay bên hông tòa nhà, chị đỗ miễn phí 2 tiếng nha chị.", 29.5],
      ["in",  "Ok em. À mà thứ Bảy chị bận đột xuất, dời sang Chủ nhật cùng giờ được không?", 6],
      ["out", "Dạ được ạ! Em đã dời lịch sang 15h Chủ nhật cho chị. Chủ nhật bên em cũng vắng hơn, chị được thư giãn thoải mái luôn ạ 🥰", 5.5],
      ["in",  "Cảm ơn em nhiều nhé, hẹn Chủ nhật.", 5],
      ["out", "Dạ em cảm ơn chị, hẹn gặp chị Chủ nhật ạ!", 4.8],
    ],
  },
  {
    ext: "demo-zl-002", phone: "0912334455", status: "open", unread: 2,
    m: [
      ["in",  "Shop ơi, triệt lông nách bên mình giá sao ạ?", 50],
      ["out", "Dạ chào chị Minh Thư! Triệt lông nách công nghệ diode laser bên em gói 8 buổi là 1.200k, đang giảm còn 899k cho khách đặt trong tuần ạ.", 49.5],
      ["in",  "8 buổi cách nhau bao lâu vậy em?", 49],
      ["out", "Dạ mỗi buổi cách nhau 3-4 tuần tùy chu kỳ mọc lông, tổng liệu trình khoảng 6-8 tháng là lông giảm 90% ạ.", 48.7],
      ["in",  "Có đau không em? Chị sợ đau lắm 😅", 48],
      ["out", "Dạ chị yên tâm, máy bên em có đầu lạnh làm dịu ngay khi bắn nên chỉ hơi châm chích nhẹ thôi ạ. Nhiều khách nằm thư giãn ngủ luôn á chị 😄", 47.6],
      ["note", "Khách quan tâm giá — đã báo ưu đãi tuần này. Follow-up nếu chưa chốt trước thứ Sáu.", 47],
      ["in",  "Để chị suy nghĩ thêm nha.", 46],
      ["out", "Dạ chị cứ thong thả ạ. Ưu đãi 899k giữ đến hết Chủ nhật, chị chốt lúc nào nhắn em liền nha 💕", 45.8],
      ["in",  "Em ơi chị quyết rồi, đặt cho chị gói 8 buổi nhé!", 2.5],
      ["in",  "Chiều nay chị qua làm buổi đầu luôn được không?", 2],
    ],
  },
  {
    ext: "demo-zl-003", phone: "0987654321", status: "pending", unread: 0,
    m: [
      ["out", "Dạ em chào chị Quỳnh Chi, em nhắc lịch mai 10h chị có buổi số 4 liệu trình trẻ hóa da nhé ạ 📅", 76],
      ["in",  "Ừ chị nhớ rồi, mai chị tới nha.", 75],
      ["out", "Dạ vâng, hẹn chị mai ạ!", 74.8],
      ["in",  "Em ơi hôm qua làm xong da chị căng mịn hẳn, thích quá 🥰", 48],
      ["out", "Dạ em cảm ơn chị! Chị nhớ dùng kem chống nắng đều và uống đủ nước để giữ hiệu quả lâu nha chị.", 47.5],
      ["in",  "Ok em. Buổi sau tuần nào nhỉ?", 47],
      ["out", "Dạ buổi 5 của chị vào thứ Tư tuần sau, 10h sáng như cũ ạ. Em đặt lịch sẵn cho chị rồi nhé!", 46.7],
      ["in",  "Cảm ơn em nha.", 46],
      ["out", "Dạ không có gì ạ, chúc chị ngày vui vẻ 🌷", 45.9],
      ["note", "Đã hoàn thành 4/8 buổi. Khách phản hồi tốt — gợi ý gói nâng cấp khi kết thúc liệu trình.", 45],
    ],
  },
  {
    ext: "demo-zl-004", phone: "0934556677", status: "closed", unread: 0,
    m: [
      ["in",  "Chị phản ánh chút: hôm qua chị đợi 25 phút mới được vào phòng dù đã đặt lịch trước. Lần sau vậy chắc chị không quay lại đâu.", 130],
      ["out", "Dạ em thành thật xin lỗi chị Thu Hà về trải nghiệm hôm qua ạ. Hôm đó bên em có ca khách trước phát sinh kéo dài ngoài dự kiến. Em xin nhận lỗi vì đã không báo sớm cho chị 🙏", 129.5],
      ["in",  "Ừ, chị hiểu là có lúc phát sinh, nhưng ít nhất nên nhắn cho khách một câu chứ.", 129],
      ["out", "Dạ chị nói đúng ạ. Bên em đã bổ sung quy trình nhắn tin báo ngay khi lịch bị trễ quá 10 phút. Buổi tới em xin gửi chị voucher chăm sóc da miễn phí thay lời xin lỗi, mong chị cho bên em cơ hội phục vụ tốt hơn ạ.", 128.6],
      ["in",  "Thôi được rồi, em chu đáo thế chị cũng vui. Tuần sau chị ghé nhé.", 128],
      ["out", "Dạ em cảm ơn chị đã thông cảm! Em đặt lịch ưu tiên khung giờ chị hay đi — 14h thứ Năm tuần sau chị nhé, đảm bảo không phải đợi ạ 💐", 127.7],
      ["note", "Khách phàn nàn chờ lâu — đã xử lý, tặng voucher 1 buổi chăm da. Ưu tiên đúng giờ cho khách này.", 127],
      ["in",  "Ừ chốt vậy đi em.", 126],
      ["out", "Dạ vâng ạ, hẹn gặp chị thứ Năm tuần sau! Voucher em đã ghi vào hồ sơ của chị rồi ạ.", 125.8],
      ["in",  "👍", 125],
    ],
  },
  {
    ext: "demo-zl-005", phone: "0966778899", status: "open", unread: 1,
    m: [
      ["in",  "Em ơi, chị nghe nói bên em có gói thành viên năm? Tư vấn chị với.", 100],
      ["out", "Dạ chào chị Yến Nhi 🌸 Gói thành viên Platinum của bên em 12 triệu/năm gồm 12 buổi chăm da + 4 buổi gội đầu dưỡng sinh + giảm 15% mọi dịch vụ khác ạ.", 99.5],
      ["in",  "Tính ra mỗi tháng 1 buổi hả em? Có được chuyển nhượng cho người nhà không?", 99],
      ["out", "Dạ đúng rồi ạ, và chị được chuyển tối đa 3 buổi/năm cho người thân ạ. Mẹ hoặc em gái chị đều dùng được nha chị.", 98.6],
      ["in",  "Hay đấy. Mà trả góp được không em?", 98],
      ["out", "Dạ bên em có hỗ trợ chia 3 kỳ không lãi qua thẻ tín dụng ạ. Chị qua tiệm em tư vấn chi tiết kèm soi da miễn phí luôn nha chị!", 97.7],
      ["note", "Khách VIP quan tâm gói Platinum 12tr — khả năng chốt cao, mời qua tiệm tư vấn trực tiếp.", 97],
      ["in",  "Ok để cuối tuần chị sắp xếp.", 96],
      ["out", "Dạ vâng ạ, cuối tuần chị qua giờ nào cũng được, em ưu tiên đón chị luôn ạ 🥰", 95.8],
      ["in",  "Em ơi, chị hỏi thêm: gói đó có bao gồm triệt lông không?", 24],
    ],
  },
  {
    ext: "demo-zl-006", phone: "0978112299", status: "closed", unread: 0,
    m: [
      ["in",  "Cho mình hỏi spa mở cửa tới mấy giờ vậy?", 170],
      ["out", "Dạ chào chị! Bên em mở cửa 9h00–20h30 các ngày trong tuần, Chủ nhật tới 19h ạ.", 169.5],
      ["in",  "Địa chỉ ở đâu vậy bạn?", 169],
      ["out", "Dạ tiệm em ở 68 Hồ Xuân Hương, Quận 3 ạ. Chị đi tới ngã tư Bà Huyện Thanh Quan là thấy bảng hiệu Spa Hương Sen màu hồng bên tay phải nha chị 🌸", 168.7],
      ["in",  "Ok cảm ơn bạn nha, hôm nào mình ghé.", 168],
      ["out", "Dạ em cảm ơn chị, khi nào ghé chị nhắn trước để em giữ chỗ cho mình khỏi đợi nha ạ!", 167.8],
      ["in",  "Ừ nha.", 167],
      ["out", "Dạ vâng ạ, hẹn gặp chị ạ 💕", 166.9],
      ["in",  "À cho mình hỏi có nhận khách nam không?", 150],
      ["out", "Dạ bên em phục vụ cả khách nam với các dịch vụ chăm da và massage thư giãn ạ. Anh nhà mình cũng ghé được luôn nha chị 😄", 149.5],
      ["in",  "Ok tốt quá. Cảm ơn em.", 149],
      ["out", "Dạ không có chi ạ!", 148.8],
    ],
  },
  {
    ext: "demo-zl-007", phone: "0918445566", status: "open", unread: 1,
    m: [
      ["in",  "Chào shop, mình thấy quảng cáo gói tắm trắng phi thuyền. Cho mình xin bảng giá với?", 78],
      ["out", "Dạ chào chị Thanh Trúc! Gói tắm trắng phi thuyền bên em 5 buổi là 2.500k, 10 buổi 4.500k ạ. Buổi đầu trải nghiệm chỉ 399k để chị test độ hợp da nha chị.", 77.5],
      ["in",  "Da mình hơi nhạy cảm, làm có sao không bạn?", 77],
      ["out", "Dạ trước khi làm bên em luôn soi da và test thử vùng nhỏ ạ. Da nhạy cảm em sẽ dùng dòng tinh chất dịu nhẹ riêng, chị yên tâm nha.", 76.6],
      ["in",  "Buổi trải nghiệm 399k có cần đặt cọc không?", 76],
      ["out", "Dạ không cần cọc ạ, chị đặt lịch trước 1 ngày là được nha chị.", 75.7],
      ["in",  "Để mình xem lịch rồi báo bạn nha.", 75],
      ["out", "Dạ vâng ạ, em gửi chị thêm hình kết quả khách làm 5 buổi để chị tham khảo nha 🤍", 74.8],
      ["in",  "Bạn ơi cho mình hỏi thêm, buổi trải nghiệm có được soi da tư vấn luôn không?", 74.5],
      ["out", "Dạ có ạ, buổi trải nghiệm bao gồm soi da + tư vấn phác đồ riêng cho da mình luôn nha chị!", 74.2],
      ["in",  "À mình gửi hình da mình hiện tại cho bạn xem trước nhé.", 73.8],
      ["out", "Dạ chị gửi qua đây em xem giúp mình liền nha 🤗", 73.5],
      ["in",  "Ok bạn. Mà cho mình hỏi làm xong có phải kiêng nắng lâu không?", 72],
    ],
  },
];
// 3 hội thoại open kết thúc bằng tin KHÁCH chưa trả lời — nuôi "Cần làm ngay":
// demo-zl-002 (2h) · demo-zl-005 (24h) · demo-zl-007 (72h)

// ---------- 6a) Hội thoại từ hộp chat website (kênh chạy được NGAY, không chờ ai duyệt)
// `ch: "livechat"` → gắn vào kênh livechat; external_user_id theo đúng dạng
// 'lc_<uuid>' mà RPC livechat_send sinh ra, để dữ liệu demo giống hàng thật.
THREADS.push(
  {
    ext: "lc_demo-web-0001", phone: "0961223344", status: "open", unread: 1, ch: "livechat",
    m: [
      ["in",  "Alo shop ơi, em đang xem bảng giá trên web mà không thấy gói trẻ hóa da ạ?", 26],
      ["out", "Dạ Spa Hương Sen chào chị Khánh Vân 🌸 Gói trẻ hóa da công nghệ HIFU bên em 6 buổi giá 4.500k, đang ưu đãi còn 3.900k tới hết tháng ạ.", 25.6],
      ["in",  "Vậy mình làm 1 buổi thấy hiệu quả liền hay phải hết liệu trình mới thấy?", 25],
      ["out", "Dạ sau buổi đầu da đã căng sáng hơn thấy rõ, nhưng nếp nhăn thì cần đủ 6 buổi mới vào form đẹp nhất chị nha.", 24.7],
      ["in",  "Em ở Bình Thạnh qua chi nhánh nào gần nhất vậy shop?", 1],
    ],
  },
  {
    ext: "lc_demo-web-0002", phone: "0355887766", status: "open", unread: 0, ch: "livechat",
    m: [
      ["in",  "Cho hỏi spa mở cửa tới mấy giờ ạ?", 4],
      ["out", "Dạ bên em mở 9h–20h tất cả các ngày, kể cả Chủ nhật ạ. Chị ghé khung nào để em giữ chỗ trước cho mình nha 💕", 3.6],
      ["in",  "Dạ để em sắp xếp rồi báo lại sau nhé, cảm ơn shop.", 3],
      ["out", "Dạ vâng, chị cứ thong thả ạ. Em để lịch trống chiều mai cho chị nha 🌷", 2.8],
    ],
  },
);

for (const th of THREADS) {
  const cid = contactId[th.phone];
  const person = CONTACTS.find((p) => p.phone === th.phone);
  const chId = th.ch === "livechat" ? livechatChannelId : channelId;
  let conv = await c.query(
    `select id from public.conversations
     where tenant_id = $1 and channel_id = $2 and external_user_id = $3`,
    [tenantId, chId, th.ext],
  );
  let convId;
  if (conv.rowCount) {
    convId = conv.rows[0].id;
  } else {
    conv = await c.query(
      `insert into public.conversations (tenant_id, channel_id, contact_id, external_user_id, status, assignee_user_id)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [tenantId, chId, cid, th.ext, th.status, userId],
    );
    convId = conv.rows[0].id;
  }

  // định danh kênh của khách (hiện tên/avatar trong inbox)
  await c.query(
    `insert into public.contact_identities (tenant_id, contact_id, channel_type, external_id, display_name)
     values ($1,$2,$5,$3,$4)
     on conflict (tenant_id, channel_type, external_id) do nothing`,
    [tenantId, cid, th.ext, person.name, th.ch === "livechat" ? "livechat" : "zalo_oa"],
  );

  // tin nhắn — neo external_message_id 'demo-msg-<ext>-<i>' (unique theo conversation)
  const existing = new Set(
    (
      await c.query(
        `select external_message_id from public.messages
         where conversation_id = $1 and external_message_id is not null`,
        [convId],
      )
    ).rows.map((r) => r.external_message_id),
  );
  let lastAt = null;
  let lastInAt = null;
  for (let i = 0; i < th.m.length; i++) {
    const [kind, content, hoursAgo] = th.m[i];
    const extId = `demo-msg-${th.ext}-${i}`;
    const sentAt = ago(hoursAgo * HOUR);
    if (kind === "in") {
      lastInAt = sentAt;
      lastAt = sentAt;
    } else if (kind === "out") {
      lastAt = sentAt;
    }
    const direction = kind === "in" ? "in" : "out";
    const senderType = kind === "in" ? "user" : kind === "note" ? "system" : "agent";
    if (existing.has(extId)) {
      // rerun: làm mới toàn bộ (kể cả vai trò — phòng khi kịch bản thread đổi)
      await c.query(
        `update public.messages
         set content = $3, sent_at = $4, direction = $5, sender_type = $6, sender_user_id = $7
         where conversation_id = $1 and external_message_id = $2`,
        [convId, extId, content, sentAt, direction, senderType, kind === "in" ? null : userId],
      );
    } else {
      await c.query(
        `insert into public.messages
           (tenant_id, conversation_id, direction, external_message_id, sender_type, sender_user_id, content, sent_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          tenantId, convId, direction, extId, senderType,
          kind === "in" ? null : userId, content, sentAt,
        ],
      );
    }
  }
  await c.query(
    `update public.conversations
     set status = $2, last_message_at = $3, last_user_message_at = $4, unread_count = $5
     where id = $1`,
    [convId, th.status, lastAt, lastInAt, th.unread],
  );
  if (lastInAt) {
    await c.query(`update public.contacts set last_interaction_at = $2 where id = $1`, [
      cid,
      lastInAt,
    ]);
  }
}

// ---------- 6b) Hành trình nguồn của khách đa chạm ----------
// Khách có `sourceNow`: vào sổ từ nguồn này (contact.created ghi lại), sau đó
// quay lại từ nguồn khác. Đổi nguồn hồ sơ TRƯỚC khi tạo cơ hội để sự kiện
// deal.created ghi CHẠM THỨ HAI. Báo cáo quy kết đọc đúng lịch sử đó:
// chạm đầu = nguồn cũ · chạm cuối = nguồn mới · chia đều = mỗi bên một nửa.
// Chạy lại an toàn: nguồn đã đúng thì UPDATE không đổi gì, không phát event mới.
for (const p of CONTACTS.filter((x) => x.sourceNow)) {
  await c.query(
    `update public.contacts set source_id = $2 where id = $1 and source_id is distinct from $2`,
    [contactId[p.phone], src(p.sourceNow)],
  );
}

// ---------- 7) Cơ hội trên bảng Kanban (neo theo tiêu đề) ----------
// Đảm bảo tenant có pipeline + cột Thua + lý do thua (migration #13, idempotent)
await asUser({ tenant_id: tenantId, role: "owner" }, `select public.ensure_deal_defaults()`);

const pipelineId = (
  await c.query(
    `select id from public.pipelines where tenant_id = $1 order by is_default desc, position limit 1`,
    [tenantId],
  )
).rows[0].id;
const stages = (
  await c.query(
    `select id, name, kind from public.pipeline_stages where pipeline_id = $1 order by position`,
    [pipelineId],
  )
).rows;
const stage = (name) => stages.find((s) => s.name === name)?.id ?? stages[0].id;
const stageOfKind = (kind) => stages.find((s) => s.kind === kind)?.id ?? stages[0].id;
const lostReasons = (
  await c.query(`select id, name from public.lost_reasons where tenant_id = $1`, [tenantId])
).rows;
const lostReason = (kw) =>
  lostReasons.find((r) => r.name.toLowerCase().includes(kw))?.id ?? lostReasons[0]?.id ?? null;

// nextDays: hạn việc kế tiếp (âm = QUÁ HẠN → thẻ hiện cảnh báo "Cần việc kế tiếp")
const DEALS = [
  {
    title: "Gói triệt lông 8 buổi - Chị Minh Thư", phone: "0912334455",
    value: 8990000, stageName: "Đang tư vấn", closeDays: 7, nextDays: 1,
    next: "Gọi chốt lịch buổi đầu, nhắc ưu đãi 899k hết Chủ nhật",
  },
  {
    title: "Liệu trình cấp ẩm 10 buổi - Chị Ngọc Anh", phone: "0903112233",
    value: 4500000, stageName: "Hẹn lịch", closeDays: 3, nextDays: 2,
    next: "Nhắn nhắc lịch 15h Chủ nhật + dặn mang kết quả soi da",
  },
  {
    title: "Gói thành viên Platinum 1 năm - Chị Yến Nhi", phone: "0966778899",
    value: 12000000, stageName: "Đang tư vấn", closeDays: 10, nextDays: -3,
    next: "Mời qua tiệm tư vấn trực tiếp + báo phương án trả góp 3 kỳ",
  },
  {
    title: "Tắm trắng phi thuyền 10 buổi - Chị Thanh Trúc", phone: "0918445566",
    value: 4500000, stageName: "Mới", closeDays: 14, nextDays: 1,
    next: "Gửi hình kết quả 5 buổi + chốt buổi trải nghiệm 399k",
  },
  {
    title: "Liệu trình trẻ hóa da 8 buổi - Chị Quỳnh Chi", phone: "0987654321",
    value: 9600000, stageKind: "won", closeDays: -5, nextDays: -5, wonDays: 5,
    next: "Đã chốt — theo dõi buổi 5 tuần sau",
  },
  {
    title: "Combo chăm da mặt 5 buổi - Chị Thu Hà", phone: "0934556677",
    value: 3200000, stageKind: "lost", closeDays: -7, nextDays: -7, lostDays: 7,
    lostKw: "giá cao", next: "Đã thua — ghi nhận lý do để cải thiện báo giá",
  },
  // 2 cơ hội THẮNG nữa, khác nguồn khách → báo cáo "Nguồn nào ra tiền" có nhiều dòng
  {
    title: "Liệu trình nâng cơ HIFU 6 buổi - Chị Gia Hân", phone: "0932114455",
    value: 7000000, stageKind: "won", closeDays: -12, nextDays: -12, wonDays: 12,
    next: "Đã chốt — chăm sóc sau liệu trình",
  },
  {
    title: "Gói gội đầu dưỡng sinh 10 buổi - Chị Hồng Nhung", phone: "0947889900",
    value: 3500000, stageKind: "won", closeDays: -20, nextDays: -20, wonDays: 20,
    next: "Đã chốt — nhắc lịch buổi kế tiếp",
  },
];

for (const d of DEALS) {
  const stageId = d.stageKind ? stageOfKind(d.stageKind) : stage(d.stageName);
  const status = d.stageKind ?? "open";
  const row = {
    stage_id: stageId,
    contact_id: contactId[d.phone],
    value_vnd: d.value,
    expected_close_date: new Date(now + d.closeDays * DAY).toISOString().slice(0, 10),
    status,
    won_at: d.wonDays ? ago(d.wonDays * DAY) : null,
    lost_at: d.lostDays ? ago(d.lostDays * DAY) : null,
    lost_reason_id: d.lostKw ? lostReason(d.lostKw) : null,
    next_action_at: new Date(now + d.nextDays * DAY).toISOString(),
    next_action_note: d.next,
  };
  const found = await c.query(
    `select id from public.deals where tenant_id = $1 and title = $2 and deleted_at is null`,
    [tenantId, d.title],
  );
  if (found.rowCount) {
    await c.query(
      `update public.deals set stage_id = $2, contact_id = $3, value_vnd = $4,
         expected_close_date = $5, status = $6, won_at = $7, lost_at = $8,
         lost_reason_id = $9, next_action_at = $10, next_action_note = $11
       where id = $1`,
      [
        found.rows[0].id, row.stage_id, row.contact_id, row.value_vnd,
        row.expected_close_date, row.status, row.won_at, row.lost_at,
        row.lost_reason_id, row.next_action_at, row.next_action_note,
      ],
    );
  } else {
    await c.query(
      `insert into public.deals
         (tenant_id, pipeline_id, stage_id, contact_id, owner_id, created_by, title,
          value_vnd, expected_close_date, status, won_at, lost_at, lost_reason_id,
          next_action_at, next_action_note)
       values ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        tenantId, pipelineId, row.stage_id, row.contact_id, userId, d.title,
        row.value_vnd, row.expected_close_date, row.status, row.won_at, row.lost_at,
        row.lost_reason_id, row.next_action_at, row.next_action_note,
      ],
    );
  }
}

// ---------- 7b) Việc có hạn (nuôi màn "Hôm nay gọi ai") ----------
// Mốc hạn tính NGAY TRONG DB để ranh giới ngày theo giờ VN luôn đúng, không phụ
// thuộc giờ của máy chạy script. "Việc hôm nay" phải nằm trong [bây giờ, hết ngày VN)
// — kẹp bằng least() để chạy seed lúc khuya vẫn không tràn sang ngày mai.
const END_OF_VN_DAY = `((date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') + interval '1 day')
     at time zone 'Asia/Ho_Chi_Minh')`;
const ACTIVITIES = [
  {
    phone: "0966778899", subject: "Gọi lại chị Yến Nhi chốt gói Platinum",
    body: "Khách hỏi gói có bao gồm triệt lông không — trả lời rồi chốt phương án trả góp 3 kỳ.",
    dueSql: "now() - interval '1 day'",
  },
  {
    phone: "0918445566", subject: "Gửi hình kết quả 5 buổi tắm trắng cho chị Thanh Trúc",
    body: "Kèm lịch trống tuần này để khách chọn buổi trải nghiệm 399k.",
    dueSql: "now() - interval '5 hours'",
  },
  {
    phone: "0903112233", subject: "Nhắn nhắc lịch 15h Chủ nhật cho chị Ngọc Anh",
    body: "Dặn khách mang kết quả soi da lần trước.",
    dueSql: `least(now() + interval '2 hours', ${END_OF_VN_DAY} - interval '1 minute')`,
  },
  {
    phone: "0912334455", subject: "Gọi chị Minh Thư chốt buổi đầu triệt lông",
    body: "Khách đã quyết mua gói 8 buổi, hỏi chiều nay qua làm được không.",
    dueSql: `least(now() + interval '4 hours', ${END_OF_VN_DAY} - interval '1 minute')`,
  },
];
for (const a of ACTIVITIES) {
  const cid = contactId[a.phone];
  const found = await c.query(
    `select id from public.activities where tenant_id = $1 and contact_id = $2 and subject = $3`,
    [tenantId, cid, a.subject],
  );
  if (found.rowCount) {
    // rerun: làm mới mốc hạn để demo không "già" đi theo thời gian
    await c.query(
      `update public.activities set due_at = ${a.dueSql}, done_at = null, body = $2 where id = $1`,
      [found.rows[0].id, a.body],
    );
    continue;
  }
  // Trigger activities_touch_contact đẩy last_interaction_at = now() khi thêm việc.
  // Nhưng GIAO việc chưa phải là ĐÃ CHĂM khách → trả lại mốc tương tác cũ để số
  // "khách nóng cần chăm lại" của Tổng quan/Hôm nay vẫn đúng.
  const prev = (
    await c.query(`select last_interaction_at from public.contacts where id = $1`, [cid])
  ).rows[0].last_interaction_at;
  await c.query(
    `insert into public.activities (tenant_id, type, subject, body, contact_id, owner_id, due_at)
     values ($1,'task',$2,$3,$4,$5, ${a.dueSql})`,
    [tenantId, a.subject, a.body, cid, userId],
  );
  await c.query(`update public.contacts set last_interaction_at = $2 where id = $1`, [cid, prev]);
}

// ---------- 7c) Mã QR theo nguồn + lượt quét ----------
// `code` ghim cứng (không dùng DEFAULT qr_gen_code()) để chạy lại không sinh mã
// mới — đường dẫn /q/<code> đã in ra tờ rơi thì không được đổi.
const QR_CODES = [
  {
    code: "quaylet4n1", name: "Mã QR ở quầy lễ tân", source: "direct",
    target: "https://zalo.me/spahuongsen", scans: 47,
  },
  {
    code: "toroicc8vn", name: "Tờ rơi chung cư Sunrise", source: "direct",
    target: "https://zalo.me/spahuongsen", scans: 12,
  },
];
for (const q of QR_CODES) {
  await c.query(
    `insert into public.qr_codes (tenant_id, code, name, source_id, target_url, created_by)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (tenant_id, name) do update
       set source_id = excluded.source_id, target_url = excluded.target_url`,
    [tenantId, q.code, q.name, src(q.source), q.target, userId],
  );
  const qrId = (
    await c.query(`select id from public.qr_codes where tenant_id = $1 and name = $2`, [
      tenantId,
      q.name,
    ])
  ).rows[0].id;
  // qr_scans không có khóa tự nhiên → ĐẾM rồi bù cho đủ, không insert mù.
  // Chạy lại: đã đủ thì thêm 0 dòng (đây là chỗ dễ nhân bản dữ liệu nhất).
  const have = Number(
    (await c.query(`select count(*) as n from public.qr_scans where qr_code_id = $1`, [qrId]))
      .rows[0].n,
  );
  for (let i = have; i < q.scans; i++) {
    await c.query(
      `insert into public.qr_scans (tenant_id, qr_code_id, scanned_at)
       values ($1, $2, now() - make_interval(hours => $3))`,
      [tenantId, qrId, (i % 30) * 24 + (i % 11)],
    );
  }
}

// ---------- 7d) Nhân viên thứ hai + bàn giao khách ----------
// Có người thứ hai mới demo được: phân quyền (nhân viên chỉ thấy khách mình),
// bảng "Hiệu suất nhân viên" có từ 2 dòng, và nút "Bàn giao khách".
const STAFF_EMAIL = "nhanvien.demo.ifan.2026@gmail.com";
const STAFF_PASSWORD = "DemoIfan#2026";
const STAFF_NAME = "Bạn Thảo (lễ tân)";
let staffId;
{
  const { data, error } = await admin.auth.admin.createUser({
    email: STAFF_EMAIL,
    password: STAFF_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: STAFF_NAME },
  });
  if (error) {
    if (!/already|registered|exists/i.test(error.message)) throw error;
  } else {
    staffId = data.user.id;
  }
  if (!staffId) {
    const r = await c.query(`select id from auth.users where email = $1`, [STAFF_EMAIL]);
    if (!r.rowCount) throw new Error("Không tạo được tài khoản nhân viên demo");
    staffId = r.rows[0].id;
    const { error: upErr } = await admin.auth.admin.updateUserById(staffId, {
      password: STAFF_PASSWORD,
      email_confirm: true,
    });
    if (upErr) throw upErr;
  }
}
await c.query(
  `insert into public.profiles (user_id, display_name) values ($1, $2)
   on conflict (user_id) do update set display_name = excluded.display_name`,
  [staffId, STAFF_NAME],
);
await c.query(
  `insert into public.tenant_members (tenant_id, user_id, role, manager_id, status, joined_at)
   values ($1, $2, 'staff', $3, 'active', now())
   on conflict (tenant_id, user_id) do update
     set role = 'staff', manager_id = excluded.manager_id, status = 'active'`,
  [tenantId, staffId, userId],
);

// Bạn Thảo trực hộp chat website — hai hội thoại livechat về tay bạn ấy.
await c.query(
  `update public.conversations set assignee_user_id = $2
   where tenant_id = $1 and channel_id = $3`,
  [tenantId, staffId, livechatChannelId],
);

// Thảo phải PHỤ TRÁCH vài khách, nếu không đăng nhập tài khoản nhân viên sẽ ra
// màn "Chưa có khách hàng nào" (RLS: nhân viên chỉ thấy khách của mình) — nhìn
// như tiệm trống, không demo được phân quyền.
await c.query(
  `update public.contacts set owner_id = $2
   where tenant_id = $1 and deleted_at is null and phone = any($3::text[])`,
  [tenantId, staffId, ["0961223344", "0355887766", "0788334455", "0947889900"]],
);

// Việc trên hồ sơ khách phải theo NGƯỜI PHỤ TRÁCH KHÁCH — đúng luật của chính
// sản phẩm (`wf_resolve_user` giao việc cho chủ hồ sơ). Không có bước này thì
// mọi việc đều đứng tên chủ tiệm, và màn "Hôm nay gọi ai" của nhân viên hiện
// "Không còn việc nào quá hạn" trong khi khách CỦA CHÍNH BẠN ẤY đang quá hạn —
// tức là màn bán hàng mạnh nhất lại trống rỗng đúng lúc đăng nhập tài khoản
// nhân viên cho khách xem. Chạy lại không đổi gì thêm (idempotent).
await c.query(
  `update public.activities a set owner_id = ct.owner_id
   from public.contacts ct
   where ct.id = a.contact_id
     and a.tenant_id = $1 and ct.tenant_id = $1
     and ct.deleted_at is null
     and ct.owner_id is not null
     and a.owner_id is distinct from ct.owner_id`,
  [tenantId],
);

// Thảo phụ trách một cơ hội ĐANG MỞ và một cơ hội ĐÃ THẮNG → bảng "Hiệu suất
// nhân viên" có 2 dòng thật, mỗi dòng đều có số ở cả 3 cột.
await c.query(
  `update public.deals set owner_id = $2
   where tenant_id = $1 and deleted_at is null and title = any($3::text[])`,
  [
    tenantId,
    staffId,
    [
      "Tắm trắng phi thuyền 10 buổi - Chị Thanh Trúc",
      "Gói gội đầu dưỡng sinh 10 buổi - Chị Hồng Nhung",
    ],
  ],
);

// Bàn giao thật: Thảo chuyển ca khó lên chủ tiệm. Gọi ĐÚNG RPC của nút bấm để
// dữ liệu demo đi qua cùng đường với hàng thật (ghi sổ + bắn thông báo).
// Chạy lại: đã có sổ bàn giao cho hội thoại này thì bỏ qua — RPC không idempotent.
{
  const target = await c.query(
    `select id from public.conversations
     where tenant_id = $1 and channel_id = $2 and external_user_id = 'lc_demo-web-0001'`,
    [tenantId, livechatChannelId],
  );
  if (target.rowCount) {
    const convId = target.rows[0].id;
    const already = await c.query(
      `select 1 from public.conversation_handoffs where conversation_id = $1`,
      [convId],
    );
    if (!already.rowCount) {
      await asUser(
        { tenant_id: tenantId, role: "staff" },
        `select public.handoff_conversation($1, $2, $3)`,
        [convId, userId, "Khách hỏi gói HIFU và muốn thương lượng giá — nhờ chị chốt giúp em."],
        staffId,
      );
    }
  }
}

// ---------- 7e) Dọn chuông thông báo ----------
// Mỗi lần seed chạy lại, mốc thời gian hội thoại/việc được làm mới → đồng hồ SLA
// khởi động lại → cron bắn thêm một loạt cảnh báo cho ĐÚNG mấy việc cũ. Sau vài
// lần seed, chuông demo hiện "51 chưa đọc" toàn cảnh báo trùng — nhìn như phần
// mềm hỏng. Dọn ở đây, KHÔNG phải sửa động cơ SLA (nó đang chạy đúng).
// Giữ lại: cảnh báo SLA mới nhất mỗi loại + thông báo bàn giao (điểm nhấn demo).
await c.query(
  `delete from public.notifications n
   where n.tenant_id = $1 and n.type = 'sla'
     and n.id not in (
       select distinct on (title) id from public.notifications
       where tenant_id = $1 and type = 'sla'
       order by title, created_at desc)`,
  [tenantId],
);
// Còn lại vài cái — để chuông có số nhỏ, thật, bấm vào có nội dung tử tế.
await c.query(
  `update public.notifications set read_at = now()
   where tenant_id = $1 and read_at is null and type not in ('sla', 'handoff')`,
  [tenantId],
);

// ---------- 7f) Lịch hẹn mẫu (Lịch hẹn ra đời SAU lần seed đầu, tiệm demo
// từng có 0 lịch hẹn — trống trơn khi ai bấm vào mục Lịch hẹn lúc tham
// quan. Việc #160/#149, ghi ở docs/SU-THAT-SAN-PHAM.md đợt 40) ----------
// Không có khoá tự nhiên để "tìm-thấy-thì-cập-nhật" như contacts (SĐT)
// hay conversations (external_id) — xoá sạch rồi chèn lại là AN TOÀN vì
// tiệm demo này chỉ có 2 tài khoản (chủ + Thảo) đụng tới, không ai khác
// tạo lịch hẹn thật ở đây.
const hence = (ms) => new Date(now + ms).toISOString();
const { rows: serviceItems } = await c.query(
  `select id, name from public.items where tenant_id = $1 and kind = 'service' and status = 'active'`,
  [tenantId],
);
const itemId = Object.fromEntries(serviceItems.map((r) => [r.name, r.id]));
const need = (name) => {
  if (!itemId[name]) throw new Error(`Thiếu dịch vụ "${name}" — chạy migration items trước khi seed lịch hẹn`);
  return itemId[name];
};
await c.query(`delete from public.appointments where tenant_id = $1`, [tenantId]);
const APPOINTMENTS = [
  // Đã qua — có done lẫn no_show để bảng "Lịch sử" trên hồ sơ khách không toàn màu xanh.
  { phone: "0903112233", item: "Chăm sóc da cơ bản",  staff: userId,  startAgo: 5 * DAY, status: "done",    price: 250000 },
  { phone: "0966778899", item: "Massage trị liệu",    staff: staffId, startAgo: 3 * DAY, status: "done",    price: 450000 },
  { phone: "0902998877", item: "Gội đầu dưỡng sinh",  staff: staffId, startAgo: 2 * DAY, status: "no_show", price: 120000 },
  { phone: "0987654321", item: "Triệt lông (1 vùng)", staff: userId,  startAgo: 1 * DAY, status: "done",    price: 300000 },
  // Sắp tới — để "Hôm nay"/"Tuần này" trên màn Lịch không trống.
  { phone: "0917665544", item: "Chăm sóc da cơ bản",  staff: staffId, startIn: 3 * HOUR,     status: "booked", price: 250000 },
  { phone: "0905667788", item: "Massage trị liệu",    staff: userId,  startIn: 1 * DAY,      status: "booked", price: 450000 },
  { phone: "0918445566", item: "Gội đầu dưỡng sinh",  staff: staffId, startIn: 3 * DAY,      status: "booked", price: 120000 },
  { phone: "0934556677", item: "Triệt lông (1 vùng)", staff: userId,  startIn: 5 * DAY,      status: "booked", price: 300000 },
];
for (const a of APPOINTMENTS) {
  const cid = contactId[a.phone];
  if (!cid) throw new Error(`Lịch hẹn mẫu trỏ tới SĐT không có trong contacts: ${a.phone}`);
  const durationMin = a.item === "Massage trị liệu" ? 90 : a.item === "Gội đầu dưỡng sinh" || a.item === "Triệt lông (1 vùng)" ? 45 : 60;
  const start = a.startAgo != null ? ago(a.startAgo) : hence(a.startIn);
  const end = new Date(new Date(start).getTime() + durationMin * 60 * 1000).toISOString();
  await c.query(
    `insert into public.appointments
       (tenant_id, contact_id, staff_user_id, item_id, start_at, end_at, status, price_vnd, source, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'calendar',$9)`,
    [tenantId, cid, a.staff, need(a.item), start, end, a.status, a.price, userId],
  );
}

// ---------- 7g) Mảng Bán hàng V3: hàng hoá, đơn, thu tiền, sổ quỹ, lãi gộp ----------
// Cùng lớp thiếu sót với lịch hẹn ở 7f nhưng LỚN HƠN: V3 ra đời sau lần seed
// gần nhất nên tiệm demo có 0 sản phẩm, 0 đơn, 0 thu tiền, 0 sổ quỹ và chưa
// khai tài khoản ngân hàng ⇒ CẢ NĂM màn mới nhất (Hàng hoá · Đơn hàng · Thu
// tiền VietQR · Sổ quỹ · Lãi gộp) đều trống khi demo — đúng thứ đáng bán nhất
// lại không demo được. Việc #161.
//
// THỨ TỰ BẮT BUỘC (các chốt chặn của CSDL, không đảo được):
//   giá vốn → dòng hàng (trigger order_lines_snapshot_cost chốt giá vốn lúc
//   bán, chạy AFTER INSERT nên item_costs phải có TRƯỚC)
//   đơn draft → thêm dòng → mới đổi trạng thái (order_lines_lock_guard cấm
//   đụng dòng của đơn completed/cancelled)
//   dòng hàng → thu tiền (order_payments_guard chặn thu vượt tổng đơn)
//   phiếu hoàn phải có qty ÂM (order_lines_sign_guard)

// Tài khoản nhận tiền — có mới hiện được mã VietQR ở màn thu tiền.
// Số tài khoản DEMO, không phải tài khoản thật của ai.
await c.query(
  `update public.tenants
      set bank_code = '970436', bank_account_no = '0071000123456',
          bank_account_name = 'SPA HUONG SEN DEMO'
    where id = $1`,
  [tenantId],
);

// Xoá theo đúng chiều phụ thuộc: cash_entries trỏ vào orders bằng ON DELETE
// SET NULL, xoá orders trước sẽ để lại phiếu quỹ mồ côi (mất dấu vết nguồn tiền).
await c.query(`delete from public.cash_entries where tenant_id = $1`, [tenantId]);
await c.query(`delete from public.orders where tenant_id = $1`, [tenantId]);
await c.query(`delete from public.item_variants where tenant_id = $1`, [tenantId]);

// Sản phẩm bán kèm (spa nào cũng bán mỹ phẩm mang về) — KHÔNG xoá 4 dịch vụ
// đang có: lịch hẹn ở 7f trỏ vào chúng, xoá là gãy.
const PRODUCTS = [
  { name: "Serum dưỡng ẩm HA",     unit: "chai",   price: 450000, cost: 180000 },
  { name: "Kem chống nắng SPF50",  unit: "tuýp",   price: 320000, cost: 140000 },
  { name: "Mặt nạ giấy cấp ẩm",    unit: "miếng",  price: 45000,  cost: 15000 },
  { name: "Dầu gội dược liệu",     unit: "chai",   price: 180000, cost: 70000 },
];
for (const p of PRODUCTS) {
  const found = await c.query(
    `select id from public.items where tenant_id = $1 and name = $2`, [tenantId, p.name]);
  if (found.rowCount) {
    itemId[p.name] = found.rows[0].id;
    await c.query(
      `update public.items set unit = $2, price_vnd = $3, status = 'active' where id = $1`,
      [found.rows[0].id, p.unit, p.price]);
  } else {
    const ins = await c.query(
      `insert into public.items (tenant_id, kind, name, unit, price_vnd, status)
       values ($1,'product',$2,$3,$4,'active') returning id`,
      [tenantId, p.name, p.unit, p.price]);
    itemId[p.name] = ins.rows[0].id;
  }
}

// Giá vốn — PHẢI có trước khi tạo dòng hàng, nếu không báo cáo Lãi gộp sẽ
// đúng luật mà báo "chưa đủ giá vốn" (hasUnknownCost) và demo mất ý nghĩa.
const COSTS = {
  "Chăm sóc da cơ bản": 60000, "Gội đầu dưỡng sinh": 25000,
  "Massage trị liệu": 90000,   "Triệt lông (1 vùng)": 50000,
  ...Object.fromEntries(PRODUCTS.map((p) => [p.name, p.cost])),
};
for (const [name, cost] of Object.entries(COSTS)) {
  await c.query(
    `insert into public.item_costs (item_id, tenant_id, cost_vnd) values ($1,$2,$3)
     on conflict (item_id) do update set cost_vnd = excluded.cost_vnd, updated_at = now()`,
    [need(name), tenantId, cost]);
}

// Biến thể — chứng minh "một mặt hàng nhiều dung tích" chạy thật.
for (const v of [{ dungTich: "30ml", price: 450000 }, { dungTich: "50ml", price: 680000 }]) {
  await c.query(
    `insert into public.item_variants (tenant_id, item_id, attributes, price_vnd, sku)
     values ($1,$2,$3,$4,$5)`,
    [tenantId, need("Serum dưỡng ẩm HA"), JSON.stringify({ "Dung tích": v.dungTich }),
     v.price, `SERUM-HA-${v.dungTich.toUpperCase()}`]);
}

// Đơn hàng — rải đủ MỌI trạng thái để mỗi bộ lọc trên màn Đơn hàng đều có dòng.
const ORDERS = [
  { key: "o1", phone: "0903112233", createdAgo: 5 * DAY, status: "completed",
    lines: [["Chăm sóc da cơ bản", 1, 250000], ["Serum dưỡng ẩm HA", 1, 450000]],
    pay: [{ method: "cash", amount: 700000 }] },
  { key: "o2", phone: "0966778899", createdAgo: 3 * DAY, status: "completed",
    lines: [["Massage trị liệu", 1, 450000], ["Kem chống nắng SPF50", 1, 320000]],
    pay: [{ method: "bank_transfer", amount: 770000 }] },
  { key: "o3", phone: "0987654321", createdAgo: 1 * DAY, status: "completed",
    lines: [["Triệt lông (1 vùng)", 1, 300000], ["Mặt nạ giấy cấp ẩm", 3, 45000]],
    pay: [{ method: "vietqr", amount: 435000 }] },
  // Đã chốt nhưng MỚI ĐẶT CỌC — nuôi đúng câu hỏi "ai còn nợ tiền".
  { key: "o4", phone: "0905667788", createdAgo: 4 * HOUR, status: "confirmed",
    lines: [["Massage trị liệu", 1, 450000]],
    pay: [{ method: "cash", amount: 200000 }] },
  { key: "o5", phone: "0917665544", createdAgo: 2 * HOUR, status: "draft",
    lines: [["Chăm sóc da cơ bản", 1, 250000]], pay: [] },
  { key: "o6", phone: "0902998877", createdAgo: 2 * DAY, status: "cancelled",
    lines: [["Gội đầu dưỡng sinh", 1, 120000]], pay: [],
    cancelReason: "Khách báo bận, hẹn tuần sau quay lại" },
];
const orderId = {};
for (const o of ORDERS) {
  const cid = contactId[o.phone];
  if (!cid) throw new Error(`Đơn mẫu trỏ tới SĐT không có trong contacts: ${o.phone}`);
  const ins = await c.query(
    `insert into public.orders (tenant_id, contact_id, status, created_by, created_at, updated_at)
     values ($1,$2,'draft',$3,$4,$4) returning id`,
    [tenantId, cid, userId, ago(o.createdAgo)]);
  orderId[o.key] = ins.rows[0].id;
  for (const [name, qty, price] of o.lines) {
    await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd)
       values ($1,$2,$3,$4,$5)`,
      [tenantId, orderId[o.key], need(name), qty, price]);
  }
  // Thu tiền TRƯỚC khi khoá đơn: order_payments không bị lock_guard chặn, nhưng
  // giữ đúng trình tự đời thật (thu rồi mới đóng đơn) cho dễ đọc.
  for (const p of o.pay) {
    await c.query(
      `insert into public.order_payments (tenant_id, order_id, method, amount_vnd, received_by, received_at)
       values ($1,$2,$3,$4,$5,$6)`,
      [tenantId, orderId[o.key], p.method, p.amount, userId, ago(o.createdAgo)]);
  }
  if (o.status !== "draft") {
    await c.query(
      `update public.orders set status = $2, cancel_reason = $3,
         cancelled_by = case when $2 = 'cancelled' then $4::uuid else null end
       where id = $1`,
      [orderId[o.key], o.status, o.cancelReason ?? null, userId]);
  }
}

// Đơn nền cho ĐỦ QUY MÔ. Sáu đơn kể chuyện ở trên là để demo từng trạng thái,
// nhưng nếu chỉ có bấy nhiêu thì Sổ quỹ ra "doanh thu 1,5 triệu / chi phí 25,9
// triệu" — tiệm demo lỗ 21 triệu/tháng, đem đi chào khách là phản tác dụng.
// Sinh thêm ~80 đơn đã xong rải đều 28 ngày (≈3 khách/ngày) để doanh thu ~34
// triệu, khớp mức chi phí thật (thuê 8tr + lương 12tr) → tiệm LÃI mỏng, đúng đời thật.
// Sinh bằng phép chia lấy dư (không random) để chạy lại ra y hệt.
const NEN_KHACH = ["0903112233","0966778899","0987654321","0905667788","0917665544",
                   "0912334455","0934556677","0947889900","0932114455","0918445566"];
const NEN_GIO = [
  [["Massage trị liệu", 1, 450000], ["Serum dưỡng ẩm HA", 1, 450000]],
  [["Chăm sóc da cơ bản", 1, 250000], ["Mặt nạ giấy cấp ẩm", 2, 45000]],
  [["Triệt lông (1 vùng)", 2, 300000]],
  [["Gội đầu dưỡng sinh", 1, 120000], ["Dầu gội dược liệu", 1, 180000]],
  [["Massage trị liệu", 1, 450000], ["Kem chống nắng SPF50", 1, 320000]],
  [["Chăm sóc da cơ bản", 1, 250000], ["Serum dưỡng ẩm HA", 1, 450000], ["Mặt nạ giấy cấp ẩm", 1, 45000]],
];
const NEN_CACH_THU = ["cash", "bank_transfer", "vietqr"];
for (let i = 0; i < 80; i++) {
  const gio = NEN_GIO[i % NEN_GIO.length];
  const tong = gio.reduce((s, [, qty, gia]) => s + qty * gia, 0);
  // Rải trong 28 ngày gần nhất, giờ làm việc 9h–19h cho hợp lý.
  const ngayTruoc = 1 + Math.floor((i * 28) / 80);
  const gioTrongNgay = 9 + (i % 10);
  const luc = ago(ngayTruoc * DAY - gioTrongNgay * HOUR);
  const ins = await c.query(
    `insert into public.orders (tenant_id, contact_id, status, created_by, created_at, updated_at)
     values ($1,$2,'draft',$3,$4,$4) returning id`,
    [tenantId, contactId[NEN_KHACH[i % NEN_KHACH.length]], i % 3 === 0 ? staffId : userId, luc]);
  for (const [name, qty, gia] of gio) {
    await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd)
       values ($1,$2,$3,$4,$5)`,
      [tenantId, ins.rows[0].id, need(name), qty, gia]);
  }
  await c.query(
    `insert into public.order_payments (tenant_id, order_id, method, amount_vnd, received_by, received_at)
     values ($1,$2,$3,$4,$5,$6)`,
    [tenantId, ins.rows[0].id, NEN_CACH_THU[i % 3], tong, i % 3 === 0 ? staffId : userId, luc]);
  await c.query(`update public.orders set status = 'completed' where id = $1`, [ins.rows[0].id]);
}

// Phiếu hoàn hàng: khách trả lại lọ kem của đơn o2. Dòng hàng qty ÂM (luật của
// order_lines_sign_guard) và KHÔNG có order_payments — tiền trả khách đi ra
// bằng phiếu quỹ `refund` bên dưới, đúng đường đã thiết kế.
{
  const ins = await c.query(
    `insert into public.orders (tenant_id, contact_id, kind, parent_order_id, status, created_by, created_at, updated_at)
     values ($1,$2,'return',$3,'draft',$4,$5,$5) returning id`,
    [tenantId, contactId["0966778899"], orderId.o2, userId, ago(2 * DAY)]);
  await c.query(
    `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd)
     values ($1,$2,$3,-1,320000)`,
    [tenantId, ins.rows[0].id, need("Kem chống nắng SPF50")]);
  await c.query(`update public.orders set status = 'completed' where id = $1`, [ins.rows[0].id]);
}

// Phiếu quỹ tự sinh từ thu tiền mang mốc `now()` (mặc định của cột) — kéo về
// đúng ngày thu để Sổ quỹ không hiện "tất cả cùng một phút".
await c.query(
  `update public.cash_entries ce set created_at = op.received_at
     from public.order_payments op
    where ce.order_payment_id = op.id and ce.tenant_id = $1`,
  [tenantId],
);

// Chi phí tay — Sổ quỹ chỉ có tiền vào thì không ra hình hài sổ quỹ thật.
const CHI = [
  { agoDays: 15, dir: "out", amount: 8000000,  fund: "bank", cat: "rent",             note: "Tiền thuê mặt bằng tháng 8" },
  { agoDays: 15, dir: "out", amount: 12000000, fund: "bank", cat: "salary",           note: "Lương nhân viên tháng 7" },
  { agoDays: 9,  dir: "out", amount: 3500000,  fund: "bank", cat: "supplier_payment", note: "Nhập mỹ phẩm bán kèm" },
  { agoDays: 7,  dir: "out", amount: 1200000,  fund: "bank", cat: "marketing",        note: "Quảng cáo Facebook tuần 2" },
  { agoDays: 4,  dir: "out", amount: 900000,   fund: "cash", cat: "utility",          note: "Điện nước tháng 7" },
  { agoDays: 2,  dir: "out", amount: 320000,   fund: "cash", cat: "refund",           note: "Hoàn tiền khách trả kem chống nắng" },
  { agoDays: 11, dir: "in",  amount: 2000000,  fund: "cash", cat: "other_in",         note: "Chủ tiệm bổ sung vốn quỹ" },
];
for (const k of CHI) {
  await c.query(
    `insert into public.cash_entries
       (tenant_id, direction, amount_vnd, fund, category, note, recorded_by, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [tenantId, k.dir, k.amount, k.fund, k.cat, k.note, userId, ago(k.agoDays * DAY)]);
}

// ---------- 8) Chấm điểm lead + bản tin tuần ----------
for (const p of CONTACTS) {
  await c.query(`select public.recompute_contact_score($1)`, [contactId[p.phone]]);
}
await c.query(
  `select public.compute_weekly_digest($1,
     (date_trunc('week', (now() at time zone 'Asia/Ho_Chi_Minh'))::date))`,
  [tenantId],
);
await c.query("commit");

// ---------- 9) Verify + tóm tắt (không in secret) ----------
const cnt = await c.query(
  `select
     (select count(*) from public.contacts where tenant_id = $1 and deleted_at is null) as contacts,
     (select count(*) from public.conversations where tenant_id = $1) as conversations,
     (select count(*) from public.messages where tenant_id = $1) as messages,
     (select count(*) from public.channels where tenant_id = $1) as channels,
     (select count(*) from public.tags where tenant_id = $1) as tags,
     (select count(*) from public.quick_replies where tenant_id = $1) as quick_replies,
     (select count(*) from public.companies where tenant_id = $1 and deleted_at is null) as companies,
     (select count(*) from public.contacts where tenant_id = $1 and deleted_at is null and company_id is not null) as linked_contacts,
     (select count(*) from public.deals where tenant_id = $1 and deleted_at is null) as deals,
     (select count(*) from public.tenant_members where tenant_id = $1 and status = 'active') as members,
     (select count(*) from public.qr_codes where tenant_id = $1) as qr_codes,
     (select count(*) from public.qr_scans where tenant_id = $1) as qr_scans,
     (select count(*) from public.conversation_handoffs where tenant_id = $1) as handoffs,
     (select count(*) from public.conversations cv join public.channels ch on ch.id = cv.channel_id
        where cv.tenant_id = $1 and ch.type = 'livechat') as livechat_convs`,
  [tenantId],
);
const dealStats = await c.query(
  `select
     count(*) filter (where status = 'open') as open,
     count(*) filter (where status = 'won') as won,
     count(*) filter (where status = 'lost' and lost_reason_id is not null) as lost_with_reason,
     count(*) filter (where status = 'open' and (next_action_at is null or next_action_at <= now())) as needs_next_action
   from public.deals where tenant_id = $1 and deleted_at is null`,
  [tenantId],
);
const hot = await c.query(
  `select count(*) as n from public.contacts where tenant_id = $1 and deleted_at is null and lead_score >= 70`,
  [tenantId],
);
const unanswered = await c.query(
  `select count(*) as n from public.conversations c
   where c.tenant_id = $1 and c.status = 'open' and c.last_user_message_at is not null
     and c.last_user_message_at >= coalesce(c.last_message_at, c.last_user_message_at)`,
  [tenantId],
);
const followup = await c.query(
  `select count(*) as n from public.contacts
   where tenant_id = $1 and deleted_at is null and lead_score >= 70
     and (last_interaction_at is null or last_interaction_at < now() - interval '3 days')`,
  [tenantId],
);
// Màn "Hôm nay gọi ai" (migration #16): việc quá hạn / đến hạn trong ngày VN
const tasks = await c.query(
  `select
     count(*) filter (where done_at is null and due_at < now()) as overdue,
     count(*) filter (where done_at is null and due_at >= now()
       and due_at < ((date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') + interval '1 day')
                       at time zone 'Asia/Ho_Chi_Minh')) as due_today
   from public.activities where tenant_id = $1`,
  [tenantId],
);
// Báo cáo "Nguồn nào ra tiền" 30 ngày — kiểm 3 mô hình quy kết có số thật.
// Hàm là SECURITY INVOKER: phải gọi dưới danh nghĩa chủ tiệm (role authenticated)
// thì RLS mới khoanh đúng tenant demo — quyền postgres sẽ bỏ qua RLS.
await c.query("begin");
const attribution = await asUser(
  { tenant_id: tenantId, role: "owner" },
  `select source_name, revenue_first, revenue_last, revenue_linear
   from public.source_revenue_report(
     (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') - interval '29 days')
       at time zone 'Asia/Ho_Chi_Minh',
     (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') + interval '1 day')
       at time zone 'Asia/Ho_Chi_Minh')
   where revenue_first > 0 or revenue_last > 0 or revenue_linear > 0
   order by revenue_first desc`,
);
await c.query("commit");
const scores = await c.query(
  `select full_name, tier, lead_score from public.contacts
   where tenant_id = $1 and deleted_at is null order by lead_score desc`,
  [tenantId],
);
const digest = await c.query(
  `select week_start::text as week_start, payload from public.tenant_weekly_digests
   where tenant_id = $1 order by week_start desc limit 1`,
  [tenantId],
);
await c.end();

const t = cnt.rows[0];
console.log(`\n=== Tiệm demo "${TENANT_NAME}" (slug: ${TENANT_SLUG}) ===`);
console.log(`Đăng nhập: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
console.log(
  `contacts=${t.contacts} conversations=${t.conversations} messages=${t.messages} ` +
    `channels=${t.channels} tags=${t.tags} quick_replies=${t.quick_replies} deals=${t.deals}`,
);
console.log(
  `công ty=${t.companies} · khách đã gắn công ty=${t.linked_contacts} (kỳ vọng: 3 công ty, 3 khách)`,
);
const ds = dealStats.rows[0];
console.log(
  `cơ hội: mở=${ds.open} thắng=${ds.won} thua (có lý do)=${ds.lost_with_reason} ` +
    `cần việc kế tiếp=${ds.needs_next_action}`,
);
console.log(
  `hot (score>=70)=${hot.rows[0].n} · chờ trả lời=${unanswered.rows[0].n} · nóng cần chăm lại=${followup.rows[0].n}`,
);
console.log(`(kỳ vọng: hot>=2, chờ trả lời=4, nóng cần chăm lại>=1)`);
console.log(
  `hộp chat website: hội thoại=${t.livechat_convs} · mã QR=${t.qr_codes} (lượt quét=${t.qr_scans}) ` +
    `· người trong tiệm=${t.members} · lần bàn giao=${t.handoffs}`,
);
console.log(`(kỳ vọng: livechat=2, QR=2 với 59 lượt quét, người=2, bàn giao=1)`);
console.log(`Nhân viên demo: ${STAFF_EMAIL} / ${STAFF_PASSWORD} (vai trò: nhân viên)`);
const tk = tasks.rows[0];
console.log(`"Hôm nay": việc quá hạn=${tk.overdue} · việc đến hạn hôm nay=${tk.due_today} (kỳ vọng: mỗi loại >=2)`);
console.log(`quy kết nguồn 30 ngày (chạm đầu / chạm cuối / chia đều):`);
for (const r of attribution.rows) {
  console.log(
    `  ${(r.source_name ?? "Chưa rõ nguồn").padEnd(16)} ${String(r.revenue_first).padStart(10)}` +
      ` ${String(r.revenue_last).padStart(10)} ${String(r.revenue_linear).padStart(10)}`,
  );
}
for (const r of scores.rows) console.log(`  ${r.lead_score >= 70 ? "🔥" : "  "} ${r.lead_score}  ${r.tier.padEnd(8)} ${r.full_name}`);
if (digest.rowCount) {
  console.log(`digest tuần ${digest.rows[0].week_start}:`, JSON.stringify(digest.rows[0].payload));
} else {
  console.log("digest: CHƯA CÓ — kiểm tra compute_weekly_digest");
}
if (
  Number(hot.rows[0].n) < 2 ||
  Number(unanswered.rows[0].n) !== 4 ||
  Number(followup.rows[0].n) < 1 ||
  Number(t.deals) < 8 ||
  Number(ds.won) < 3 ||
  Number(ds.lost_with_reason) < 1 ||
  Number(ds.needs_next_action) < 1 ||
  Number(t.companies) < 3 ||
  Number(t.linked_contacts) < 3 ||
  Number(tk.overdue) < 2 ||
  Number(tk.due_today) < 2 ||
  attribution.rows.length < 2 ||
  // Bằng ĐÚNG, không phải >=: mọi con số dưới đây đều neo theo khóa cố định nên
  // chạy lại phải ra y hệt. Lớn hơn kỳ vọng = seed đang nhân bản dữ liệu.
  Number(t.livechat_convs) !== 2 ||
  Number(t.qr_codes) !== 2 ||
  // Lượt quét là NGOẠI LỆ của luật "bằng đúng": vòng lặp trên chỉ BÙ cho đủ 59
  // nên seed không bao giờ tạo dư — nhưng người thật quét mã lúc demo thì con số
  // tăng thật. Ép bằng đúng 59 khiến chạy lại seed sau buổi demo là báo lỗi oan.
  Number(t.qr_scans) < 59 ||
  Number(t.members) !== 2 ||
  Number(t.handoffs) !== 1
) {
  console.error("⚠️  Số liệu chưa đạt kỳ vọng — xem lại seed.");
  process.exit(1);
}
console.log("✅ Seed demo hoàn tất (idempotent — chạy lại an toàn).");

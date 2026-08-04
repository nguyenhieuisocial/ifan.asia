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
// helper: chạy 1 câu dưới danh nghĩa demo user (mô phỏng JWT như rls-smoke)
async function asUser(claims, sql, params = []) {
  await c.query(
    `select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)`,
    [JSON.stringify({ sub: userId, role: "authenticated", app_metadata: claims })],
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
await asUser(
  { tenant_id: tenantId, role: "owner" },
  `select public.seed_industry_template('spa_clinic')`,
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

// nguồn khách hệ thống (create_tenant seed sẵn) — map theo tên nếu có
const sources = (
  await c.query(`select id, name from public.lead_sources where tenant_id = $1`, [tenantId])
).rows;
const src = (kw) =>
  sources.find((s) => s.name.toLowerCase().includes(kw))?.id ?? sources[0]?.id ?? null;

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
  { name: "Võ Hoài Phương",  phone: "0978112299", email: null,                       tier: "new",     createdDays: 3,  interactedH: 72,  address: null,                       province: "TP. Hồ Chí Minh", source: "website" },
  { name: "Đặng Kim Ngân",   phone: "0905667788", email: "kimngan.dang@gmail.com",  tier: "regular", createdDays: 25, interactedH: 96,  address: "34 Lê Lợi, Hải Châu",     province: "Đà Nẵng",         source: "referral" },
  { name: "Bùi Thanh Trúc",  phone: "0918445566", email: "thanhtruc.bui@gmail.com", tier: "new",     createdDays: 6,  interactedH: 120, address: null,                       province: "Hà Nội",          source: "zalo" },
  { name: "Hoàng Yến Nhi",   phone: "0966778899", email: "yennhi.hoang@gmail.com",  tier: "vip",     createdDays: 58, interactedH: 168, address: "9 Phan Chu Trinh, Q.1",   province: "TP. Hồ Chí Minh", source: "facebook" },
  { name: "Ngô Mai Linh",    phone: "0939001122", email: null,                       tier: "new",     createdDays: 10, interactedH: 200, address: null,                       province: "Cần Thơ",         source: "website" },
  { name: "Đỗ Hồng Nhung",   phone: "0947889900", email: "hongnhung.do@gmail.com",  tier: "regular", createdDays: 35, interactedH: 240, address: "56 Bà Triệu, Hoàn Kiếm",  province: "Hà Nội",          source: "referral" },
  { name: "Vũ Thảo Vy",      phone: "0902998877", email: null,                       tier: "dormant", createdDays: 59, interactedH: 1100, address: "77 CMT8, Q.10",          province: "TP. Hồ Chí Minh", source: "zalo" },
  { name: "Trịnh Lan Hương", phone: "0917665544", email: "lanhuong.trinh@gmail.com", tier: "dormant", createdDays: 52, interactedH: 900, address: null,                      province: "Hải Phòng",       source: "facebook" },
];
const contactId = {};
for (const p of CONTACTS) {
  const found = await c.query(
    `select id from public.contacts where tenant_id = $1 and phone = $2 and deleted_at is null`,
    [tenantId, p.phone],
  );
  if (found.rowCount) {
    contactId[p.phone] = found.rows[0].id;
    // rerun: làm mới mốc tương tác + hồ sơ để demo không "già" đi theo thời gian
    await c.query(
      `update public.contacts set last_interaction_at = $2, email = $3, tier = $4, company_id = $5 where id = $1`,
      [
        found.rows[0].id, ago(p.interactedH * HOUR), p.email, p.tier,
        p.company ? companyId[p.company] : null,
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

for (const th of THREADS) {
  const cid = contactId[th.phone];
  const person = CONTACTS.find((p) => p.phone === th.phone);
  let conv = await c.query(
    `select id from public.conversations
     where tenant_id = $1 and channel_id = $2 and external_user_id = $3`,
    [tenantId, channelId, th.ext],
  );
  let convId;
  if (conv.rowCount) {
    convId = conv.rows[0].id;
  } else {
    conv = await c.query(
      `insert into public.conversations (tenant_id, channel_id, contact_id, external_user_id, status, assignee_user_id)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [tenantId, channelId, cid, th.ext, th.status, userId],
    );
    convId = conv.rows[0].id;
  }

  // định danh kênh của khách (hiện tên/avatar trong inbox)
  await c.query(
    `insert into public.contact_identities (tenant_id, contact_id, channel_type, external_id, display_name)
     values ($1,$2,'zalo_oa',$3,$4)
     on conflict (tenant_id, channel_type, external_id) do nothing`,
    [tenantId, cid, th.ext, person.name],
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
     (select count(*) from public.deals where tenant_id = $1 and deleted_at is null) as deals`,
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
console.log(`(kỳ vọng: hot>=2, chờ trả lời=3, nóng cần chăm lại>=1)`);
for (const r of scores.rows) console.log(`  ${r.lead_score >= 70 ? "🔥" : "  "} ${r.lead_score}  ${r.tier.padEnd(8)} ${r.full_name}`);
if (digest.rowCount) {
  console.log(`digest tuần ${digest.rows[0].week_start}:`, JSON.stringify(digest.rows[0].payload));
} else {
  console.log("digest: CHƯA CÓ — kiểm tra compute_weekly_digest");
}
if (
  Number(hot.rows[0].n) < 2 ||
  Number(unanswered.rows[0].n) !== 3 ||
  Number(followup.rows[0].n) < 1 ||
  Number(t.deals) < 6 ||
  Number(ds.won) < 1 ||
  Number(ds.lost_with_reason) < 1 ||
  Number(ds.needs_next_action) < 1 ||
  Number(t.companies) < 3 ||
  Number(t.linked_contacts) < 3
) {
  console.error("⚠️  Số liệu chưa đạt kỳ vọng — xem lại seed.");
  process.exit(1);
}
console.log("✅ Seed demo hoàn tất (idempotent — chạy lại an toàn).");

#!/usr/bin/env node
/**
 * Seed 5 tiệm mẫu còn lại (shop/kham/pet/fnb/retail) cho chế độ Tham quan
 * tiệm mẫu (15b, migration #64). Ngành "spa" đã có sẵn tiệm demo phong phú
 * (seed-demo.mjs) — đánh dấu is_sample ở migration #64, KHÔNG tạo lại.
 *
 * IDEMPOTENT: chạy lại an toàn — mọi bản ghi neo theo slug tenant cố định
 * (on conflict do nothing / kiểm tồn tại trước khi chèn).
 * Nhẹ có chủ đích ("phương án RẺ" — Quy hoạch mục 15b): vài khách/cơ hội/việc
 * đủ để tiệm "sống", KHÔNG nuôi hội thoại/tin nhắn như tiệm demo Spa.
 */
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([a-zA-Z]):/, "$1:");
const envPath = `${ROOT}.env.local`;
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

const OWNER_EMAIL = "sample.tenants.owner@ifan.asia";
const OWNER_PASSWORD = "SampleTenantsOwner#2026";
const OWNER_NAME = "Chủ tiệm (mẫu)";

const PACKS = [
  {
    industry: "shop", tenantName: "Sắc Màu Boutique (Mẫu)", slug: "sample-shop",
    stages: ["Hỏi giá", "Chốt", "Giao hàng", "Thu tiền"],
    tags: ["Hỏi giá", "Chốt đơn", "Giao hàng", "Khách thân thiết"],
    contacts: ["Trần Thị Mai", "Nguyễn Thu Hà", "Lê Bảo Ngọc", "Phạm Thanh Tú", "Vũ Kim Chi"],
    deals: [
      ["Áo dài cách tân đặt may", 1_200_000],
      ["Set váy dạo phố 2 món", 850_000],
      ["Đơn sỉ 10 áo thun", 2_400_000],
      ["Túi xách da bò thật", 1_650_000],
    ],
  },
  {
    industry: "kham", tenantName: "Nha Khoa Gia Đình An Tâm (Mẫu)", slug: "sample-kham",
    stages: ["Tư vấn", "Đặt hẹn", "Đang điều trị", "Tái khám"],
    tags: ["Tư vấn", "Đặt hẹn", "Đang điều trị", "Khách VIP"],
    contacts: ["Đặng Văn Hùng", "Ngô Thị Lan", "Bùi Minh Đức", "Hoàng Thị Nga", "Đỗ Quốc Bảo"],
    deals: [
      ["Niềng răng trong suốt", 35_000_000],
      ["Trám răng sâu số 6", 450_000],
      ["Tẩy trắng răng toàn hàm", 2_800_000],
      ["Nhổ răng khôn + tái khám", 900_000],
    ],
  },
  {
    industry: "pet", tenantName: "Spa Thú Cưng Bống Bang (Mẫu)", slug: "sample-pet",
    stages: ["Tư vấn", "Hẹn lịch", "Đã đến làm", "Chăm sau"],
    tags: ["Tắm chải", "Cắt tỉa lông", "Khám thú y", "Khách VIP"],
    contacts: ["Trịnh Thu Thảo", "Lý Gia Bảo", "Phan Ngọc Diệp", "Đinh Văn Sơn", "Tô Bích Ngân"],
    deals: [
      ["Tắm + cắt tỉa lông bé Poodle", 350_000],
      ["Gói khám tổng quát bé mèo Anh lông ngắn", 500_000],
      ["Tiêm phòng dại định kỳ", 250_000],
      ["Cạo vôi răng bé chó Corgi", 400_000],
    ],
  },
  {
    industry: "fnb", tenantName: "Cafe Góc Phố (Mẫu)", slug: "sample-fnb",
    stages: ["Hỏi", "Đặt bàn", "Đã đến", "Quay lại"],
    tags: ["Đặt bàn", "Đặt trước", "Khách quen", "Tiệc nhóm"],
    contacts: ["Huỳnh Anh Thư", "Mai Xuân Trường", "Cao Thị Yến", "Lâm Đức Anh", "Trương Bảo Trân"],
    deals: [
      ["Đặt bàn 6 người sinh nhật", 1_800_000],
      ["Tiệc nhóm công ty 15 người", 4_500_000],
      ["Đặt bàn cặp đôi tối cuối tuần", 400_000],
      ["Đặt trước bàn ngoài trời", 600_000],
    ],
  },
  {
    industry: "retail", tenantName: "Mỹ Phẩm Ngọc Trai (Mẫu)", slug: "sample-retail",
    stages: ["Hỏi", "Giữ hàng", "Đã mua", "Quay lại"],
    tags: ["Hỏi giá", "Giữ hàng", "Đã mua", "Khách thân thiết"],
    contacts: ["Võ Thị Hồng Nhung", "Đặng Gia Hân", "Nguyễn Phương Linh", "Trần Việt Hoàng", "Lê Thị Kim Oanh"],
    deals: [
      ["Bộ dưỡng da chống lão hóa", 2_200_000],
      ["Son + phấn nền trang điểm", 750_000],
      ["Nước hoa mini set quà tặng", 1_100_000],
      ["Kem chống nắng + serum vitamin C", 680_000],
    ],
  },
];

// ---------- 1) Chủ tiệm mẫu dùng chung (một tài khoản, owner của cả 5 tiệm) ----------
const admin = createClient(SB_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
let ownerId;
{
  const { data, error } = await admin.auth.admin.createUser({
    email: OWNER_EMAIL, password: OWNER_PASSWORD, email_confirm: true,
    user_metadata: { display_name: OWNER_NAME },
  });
  if (error) {
    if (!/already|registered|exists/i.test(error.message)) throw error;
    const { data: list } = await admin.auth.admin.listUsers();
    ownerId = list.users.find((u) => u.email === OWNER_EMAIL)?.id;
  } else {
    ownerId = data.user.id;
  }
}
if (!ownerId) throw new Error("Không lấy được id chủ tiệm mẫu");

// ---------- 2) Postgres trực tiếp (TLS ghim CA, đúng mẫu seed-demo.mjs) ----------
const c = new pg.Client({
  connectionString: DB_URL,
  ssl: { ca: readFileSync(`${ROOT}supabase/supabase-ca.crt`, "utf8"), rejectUnauthorized: true },
});
await c.connect();

for (const pack of PACKS) {
  console.log(`--- ${pack.industry} (${pack.slug}) ---`);

  let tenantId;
  const existing = await c.query(`select id from public.tenants where slug = $1`, [pack.slug]);
  if (existing.rowCount) {
    tenantId = existing.rows[0].id;
    console.log("  tenant đã có, dùng lại:", tenantId);
  } else {
    const { rows: [t] } = await c.query(
      `insert into public.tenants (name, slug, industry, is_sample) values ($1,$2,$3,true) returning id`,
      [pack.tenantName, pack.slug, pack.industry],
    );
    tenantId = t.id;
    console.log("  tenant mới:", tenantId);
  }

  await c.query(
    `insert into public.tenant_members (tenant_id, user_id, role, status, joined_at)
     values ($1,$2,'owner','active',now()) on conflict (tenant_id, user_id) do nothing`,
    [tenantId, ownerId],
  );

  // Pipeline + stages (idempotent: chỉ tạo nếu tenant chưa có pipeline nào)
  let pipelineId, stageIds;
  const existingPl = await c.query(`select id from public.pipelines where tenant_id=$1 and is_default`, [tenantId]);
  if (existingPl.rowCount) {
    pipelineId = existingPl.rows[0].id;
    const st = await c.query(`select id from public.pipeline_stages where pipeline_id=$1 order by position`, [pipelineId]);
    stageIds = st.rows.map((r) => r.id);
  } else {
    const { rows: [pl] } = await c.query(
      `insert into public.pipelines (tenant_id, name, is_default) values ($1,'Mặc định',true) returning id`,
      [tenantId],
    );
    pipelineId = pl.id;
    stageIds = [];
    for (let i = 0; i < pack.stages.length; i++) {
      const kind = i === pack.stages.length - 1 ? "won" : "open";
      const { rows: [st] } = await c.query(
        `insert into public.pipeline_stages (tenant_id, pipeline_id, name, position, kind)
         values ($1,$2,$3,$4,$5) returning id`,
        [tenantId, pipelineId, pack.stages[i], i + 1, kind],
      );
      stageIds.push(st.id);
    }
  }

  // Tags (on conflict do nothing — unique tenant_id+name)
  for (const tag of pack.tags) {
    await c.query(
      `insert into public.tags (tenant_id, name) values ($1,$2) on conflict (tenant_id, name) do nothing`,
      [tenantId, tag],
    );
  }

  // Contacts (idempotent theo tên — tiệm mẫu không cần dedupe SĐT thật)
  const contactIds = [];
  for (const name of pack.contacts) {
    const found = await c.query(`select id from public.contacts where tenant_id=$1 and full_name=$2`, [tenantId, name]);
    if (found.rowCount) {
      contactIds.push(found.rows[0].id);
      continue;
    }
    const { rows: [ct] } = await c.query(
      `insert into public.contacts (tenant_id, full_name, owner_id, lifecycle, tier) values ($1,$2,$3,'customer','regular') returning id`,
      [tenantId, name, ownerId],
    );
    contactIds.push(ct.id);
  }

  // Deals — rải qua các stage, cái cuối 'won', còn lại 'open' + next_action_at gần đây
  const existingDeals = await c.query(`select count(*)::int as n from public.deals where tenant_id=$1`, [tenantId]);
  if (existingDeals.rows[0].n === 0) {
    for (let i = 0; i < pack.deals.length; i++) {
      const [title, value] = pack.deals[i];
      const stageIdx = Math.min(i, stageIds.length - 1);
      const isWon = stageIdx === stageIds.length - 1;
      const contactId = contactIds[i % contactIds.length];
      if (isWon) {
        await c.query(
          `insert into public.deals (tenant_id,pipeline_id,stage_id,contact_id,owner_id,title,value_vnd,status,won_at)
           values ($1,$2,$3,$4,$5,$6,$7,'won',now() - interval '2 days')`,
          [tenantId, pipelineId, stageIds[stageIdx], contactId, ownerId, title, value],
        );
      } else {
        await c.query(
          `insert into public.deals (tenant_id,pipeline_id,stage_id,contact_id,owner_id,title,value_vnd,status,next_action_at)
           values ($1,$2,$3,$4,$5,$6,$7,'open',now() + interval '1 day')`,
          [tenantId, pipelineId, stageIds[stageIdx], contactId, ownerId, title, value],
        );
      }
    }
    console.log(`  đã tạo ${pack.deals.length} cơ hội`);
  }

  // Việc đang chờ (activities, due_at gần — job đêm #64 sẽ tự làm tươi tiếp)
  const existingAct = await c.query(`select count(*)::int as n from public.activities where tenant_id=$1`, [tenantId]);
  if (existingAct.rows[0].n === 0) {
    await c.query(
      `insert into public.activities (tenant_id,type,subject,contact_id,owner_id,due_at)
       values ($1,'task',$2,$3,$4, now() + interval '6 hours')`,
      [tenantId, "Gọi hỏi thăm sau khi ghé", contactIds[0], ownerId],
    );
    await c.query(
      `insert into public.activities (tenant_id,type,subject,contact_id,owner_id,due_at)
       values ($1,'task',$2,$3,$4, now() + interval '1 day')`,
      [tenantId, "Nhắc lịch hẹn tuần này", contactIds[1], ownerId],
    );
    console.log("  đã tạo 2 việc đang chờ");
  }
}

await c.end();
console.log("\nXong — 5 tiệm mẫu sẵn sàng cho chế độ Tham quan (15b).");

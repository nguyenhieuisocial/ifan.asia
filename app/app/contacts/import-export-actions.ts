"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentMembership } from "@/lib/auth/membership";
import { formatVN } from "@/lib/datetime";
import { applyKeysetCursor, keysetCursor } from "@/lib/keyset-cursor";
import { createClient } from "@/lib/supabase/server";
import { getTenantPack, type TenantPackCustomField } from "@/lib/tenant-pack";
import { workEmailDomain } from "../companies/types";
import {
  buildXlsx,
  extractRows,
  guessMapping,
  parseSpreadsheet,
  type ImportRow,
  type SheetCell,
} from "./excel";
import { applyContactsFilter, type ContactsFilterBase } from "./queries";
import {
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  normalizeSearch,
  ownerLabel,
  type ColumnMapping,
  type RowProblem,
  type Tier,
} from "./types";

/**
 * Nhập/Xuất Excel danh sách khách (đợt 1).
 *
 * File tải về trả bằng base64 rồi client mới dựng Blob: server action không đặt
 * được header Content-Disposition, còn route handler thì phải dựng lại auth +
 * bộ lọc lần nữa — giữ ở đây để chỉ có MỘT nguồn sự thật cho bộ lọc và RLS.
 */

const MANAGE_ROLES = ["owner", "admin", "manager"];

/**
 * Vai được TẢI FILE danh sách khách về máy.
 *
 * Rộng hơn MANAGE_ROLES đúng một vai — `staff` — và cố ý chặn đúng một vai:
 * `viewer`. Lý do nằm ở RLS `contacts_select` (migration #65): owner/admin/
 * manager/viewer thấy KHÁCH CẢ TIỆM, còn staff chỉ thấy khách mình phụ trách.
 * Nghĩa là file staff tải về chỉ chứa khách của chính họ — thứ họ vốn đã đọc
 * được từng dòng trên màn; cấm ở đây chỉ làm khó người đi bán hàng.
 *
 * "Chỉ xem" thì khác: vai đó thấy TOÀN BỘ danh bạ kèm số điện thoại nhưng được
 * đặt ra để XEM, không phải để MANG ĐI. Một cú bấm là cả danh bạ khách nằm
 * trong file trên máy cá nhân, ra khỏi mọi chốt chặn của phần mềm. Ba đường
 * xuất CSV (`app/api/export/*`) vốn đã chặn viewer; nút Excel ở màn Khách hàng
 * là chỗ DUY NHẤT còn hở — bịt cho khớp.
 */
const EXPORT_ROLES = ["owner", "admin", "manager", "staff"];

/** Trần an toàn cho file xuất — đợt 1 chưa có tenant nào chạm tới. */
const EXPORT_MAX_ROWS = 20000;
const EXPORT_BATCH = 1000;

type FileResult = {
  error: string | null;
  fileBase64?: string;
  fileName?: string;
};

const filterSchema = z.object({
  q: z.string().max(200).default(""),
  sourceId: z.uuid().nullable().default(null),
  // File xuất bám đúng bộ lọc trên màn hình, kể cả bộ lọc hạng + chưa quay lại
  tier: z.enum(["new", "regular", "vip", "dormant"]).nullable().default(null),
  inactiveDays: z.number().int().min(1).max(3650).nullable().default(null),
  tagId: z.uuid().nullable().default(null),
  // cf_<khoá> → giá trị lọc (24o) — khoá do pack khai, không đóng được ở đây
  custom: z.record(z.string(), z.string().max(500)).default({}),
  mineOnly: z.boolean().default(false),
});

const mappingSchema = z
  .object({
    fullName: z.number().int().min(-1).max(200),
    phone: z.number().int().min(-1).max(200),
    email: z.number().int().min(-1).max(200),
    source: z.number().int().min(-1).max(200),
    tags: z.number().int().min(-1).max(200),
  })
  // cf_<khoá>: cột nguồn cho từng trường tùy biến pack khai — khoá MỞ, không
  // liệt kê hết được (mỗi pack khác nhau) nên nhận thêm bất kỳ khoá số nào.
  .catchall(z.number().int().min(-1).max(200));

const uploadSchema = z.object({
  fileBase64: z.string().max(Math.ceil(IMPORT_MAX_FILE_BYTES * 1.4)),
  fileName: z.string().max(260).regex(/\.(xlsx|csv)$/i, "unsupportedFile"),
  mapping: mappingSchema.nullable(),
});

type Member = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  tenantId: string;
  role: string;
};

/**
 * Auth + membership dùng chung.
 *
 * ⚠️ KHÔNG tự viết lại `.from("tenant_members").select("role").eq("user_id", …)`.
 * Truy vấn tự viết đó quên lọc `status='active'` và quên xét `expires_at`, nên
 * người VỪA BỊ GỠ khỏi tiệm vẫn tải được toàn bộ danh sách khách trong lúc token
 * cũ còn sống (~1 giờ): `removeMember` (`app/app/settings/team/actions.ts`) chỉ
 * đổi `status='removed'` chứ không xoá dòng, còn RLS `contacts_select` đọc từ
 * CLAIM của JWT nên tầng web là chốt DUY NHẤT. Đúng lớp lỗi mục 69 / ADR-0006.
 * `getCurrentMembership` đã lọc đủ cả hai — dùng nó, đừng viết hàm thứ ba.
 *
 * `tenant_id` lấy riêng qua `tenants` (RLS đã khoá đúng tiệm đang mở), cùng
 * khuôn với `requireManage` ở `app/app/items/actions.ts`.
 */
async function requireMember(): Promise<Member | { errorKey: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errorKey: "errors.sessionExpired" };

  const [member, { data: tenant }] = await Promise.all([
    getCurrentMembership(supabase, user.id),
    supabase.from("tenants").select("id").maybeSingle(),
  ]);
  if (!member || !tenant) return { errorKey: "errors.tenantNotFound" };

  return {
    supabase,
    userId: user.id,
    tenantId: tenant.id as string,
    role: member.role,
  };
}

// ------------------------------------------------------------------ xuất

const EXPORT_SELECT = `id, full_name, phone, email, tier, lead_score, owner_id, created_at, custom,
  lead_sources(name),
  contact_tags(tags(name))`;

type ExportContact = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  tier: Tier;
  lead_score: number;
  owner_id: string | null;
  created_at: string;
  custom: Record<string, string> | null;
  lead_sources: { name: string } | null;
  contact_tags: { tags: { name: string } | null }[];
};

/**
 * Xuất .xlsx đúng tập kết quả đang lọc trên màn hình.
 * KHÔNG cần kiểm quyền thêm: RLS `contacts_select` đã cho staff chỉ thấy khách
 * mình phụ trách, quản lý thấy cả tiệm — file xuất phản chiếu đúng như vậy.
 */
export async function exportContactsXlsx(
  filter: z.input<typeof filterSchema>,
): Promise<FileResult> {
  const t = await getTranslations("contacts");
  const parsed = filterSchema.safeParse(filter);
  if (!parsed.success) return { error: t("importExport.errors.exportFailed") };

  const m = await requireMember();
  if ("errorKey" in m) return { error: t(m.errorKey) };
  if (!EXPORT_ROLES.includes(m.role)) {
    return { error: t("importExport.errors.permissionDenied") };
  }

  // Trường tùy biến pack khai "cho lên cột" (24o) — file xuất mang đúng những
  // cột đang hiện trên bảng danh sách, không phải toàn bộ trường đã khai.
  const pack = await getTenantPack(m.supabase);
  const listableFields = (pack.custom_fields ?? []).filter((f) => f.listable);

  const scoped: ContactsFilterBase = { ...parsed.data, userId: m.userId };
  const contacts: ExportContact[] = [];
  let cursor: string | null = null;

  while (contacts.length < EXPORT_MAX_ROWS) {
    let query = m.supabase
      .from("contacts")
      .select(EXPORT_SELECT)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(EXPORT_BATCH);
    ({ query } = await applyContactsFilter(m.supabase, query, scoped));
    if (cursor) query = applyKeysetCursor(query, cursor);

    const { data, error } = await query;
    if (error) return { error: t("importExport.errors.exportFailed") };
    const batch = (data ?? []) as unknown as ExportContact[];
    contacts.push(...batch);
    if (batch.length < EXPORT_BATCH) break;
    cursor = keysetCursor(batch[batch.length - 1]);
  }

  // Sổ "ai tải dữ liệu gì" (record_audit, action='exported' — migration #60):
  // chủ tiệm cần biết ai đã mang danh bạ kèm SĐT ra khỏi phần mềm, lúc nào,
  // bao nhiêu dòng. entity_id là chính tiệm (sự kiện thuộc về cả tiệm, không
  // phải một khách riêng lẻ).
  //
  // ⚠️ NGOẠI LỆ DUY NHẤT của hàm này được nuốt lỗi: ghi sổ trượt không được
  // phép chặn người đang tải một file hợp lệ — họ không có gì để sửa cả. Không
  // cần khai miễn trừ ở scripts/soat-ghi-im-lang.mjs vì cổng đó chỉ soát
  // .update()/.delete()/.upsert(), không soát .rpc().
  try {
    await m.supabase.rpc("record_audit_log", {
      p_entity_type: "data_export",
      p_entity_id: m.tenantId,
      p_action: "exported",
      p_diff: { loai: "contacts", rows: contacts.length, truncated: contacts.length >= EXPORT_MAX_ROWS },
    });
  } catch {
    // Xem chú thích ngay trên — cố ý bỏ qua, không làm hỏng việc tải file.
  }

  const { data: profiles } = await m.supabase
    .from("profiles")
    .select("user_id, display_name");
  const names = Object.fromEntries(
    (profiles ?? []).map((p) => [p.user_id as string, p.display_name as string]),
  );

  const headers = [
    t("importExport.columns.name"),
    t("importExport.columns.phone"),
    t("importExport.columns.email"),
    t("importExport.columns.tier"),
    t("importExport.columns.score"),
    t("importExport.columns.source"),
    t("importExport.columns.tags"),
    t("importExport.columns.owner"),
    t("importExport.columns.createdAt"),
    ...listableFields.map((f) => f.label),
  ];

  const rows: SheetCell[][] = contacts.map((c) => [
    c.full_name,
    c.phone ?? "",
    c.email ?? "",
    t(`tier.${c.tier}`),
    c.lead_score,
    c.lead_sources?.name ?? "",
    c.contact_tags
      .map((ct) => ct.tags?.name)
      .filter(Boolean)
      .join(", "),
    ownerLabel(c.owner_id, m.userId, t, names),
    // Luôn dd/MM/yyyy theo giờ VN: file mở bằng Excel VN, không phụ thuộc locale UI
    formatVN(c.created_at, "dd/MM/yyyy"),
    // Ô trống ghi dấu gạch, KHÔNG để trắng — trắng làm người đọc tưởng hỏng
    // (thẻ design man-bang-loc.html).
    ...listableFields.map((f) => c.custom?.[f.key] || "—"),
  ]);

  const buffer = await buildXlsx(
    t("importExport.sheetName"),
    headers,
    rows,
    [28, 16, 26, 12, 8, 18, 24, 18, 14, ...listableFields.map(() => 20)],
  );
  return {
    error: null,
    fileBase64: buffer.toString("base64"),
    fileName: `${t("importExport.exportFileBase")}-${formatVN(Date.now(), "yyyyMMdd")}.xlsx`,
  };
}

/** File mẫu: đúng tiêu đề hệ thống hiểu + 2 dòng ví dụ (sinh tại chỗ, không có asset tĩnh). */
export async function downloadImportTemplate(): Promise<FileResult> {
  const t = await getTranslations("contacts");
  const m = await requireMember();
  if ("errorKey" in m) return { error: t(m.errorKey) };

  const headers = [
    t("importExport.columns.name"),
    t("importExport.columns.phone"),
    t("importExport.columns.email"),
    t("importExport.columns.source"),
    t("importExport.columns.tags"),
  ];
  const buffer = await buildXlsx(
    t("importExport.sheetName"),
    headers,
    [
      ["Nguyễn Thị Hoà", "0912345678", "hoa@example.com", "Zalo", "VIP, Da khô"],
      ["Trần Văn Đạt", "0387654321", "", "Facebook", "Khách quen"],
    ],
    [28, 16, 26, 18, 24],
  );
  return {
    error: null,
    fileBase64: buffer.toString("base64"),
    fileName: `${t("importExport.templateFileBase")}.xlsx`,
  };
}

// ------------------------------------------------------------------ nhập

export type ImportPreview = {
  error: string | null;
  headers?: string[];
  mapping?: ColumnMapping;
  totalRows?: number;
  toCreate?: number;
  duplicates?: number;
  failed?: number;
  /** Tối đa 20 dòng có vấn đề đầu tiên, kèm lý do từng dòng. */
  problems?: RowProblem[];
  /** Trường tùy biến theo pack (24o) — dialog vẽ thêm dòng ánh xạ cột cho từng trường. */
  customFields?: TenantPackCustomField[];
};

const PROBLEMS_SHOWN = 20;

type Prepared = {
  table: string[][];
  mapping: ColumnMapping;
  rows: ImportRow[];
  problems: RowProblem[];
  customFields: TenantPackCustomField[];
};

/** Lỗi chưa dịch: key + tham số cho message (vd trần số dòng). */
type PrepareError = { errorKey: string; values?: Record<string, number> };

/**
 * Giải mã + parse + kiểm dữ liệu. Dùng chung cho chạy thử và nhập thật nên hai
 * bước luôn nhìn cùng một kết quả, và bước nhập KHÔNG tin dữ liệu client gửi lên.
 */
async function prepare(
  m: Member,
  input: z.infer<typeof uploadSchema>,
): Promise<Prepared | PrepareError> {
  const buffer = Buffer.from(input.fileBase64, "base64");
  if (buffer.byteLength === 0) {
    return { errorKey: "importExport.errors.emptyFile" };
  }
  if (buffer.byteLength > IMPORT_MAX_FILE_BYTES) {
    return { errorKey: "importExport.errors.fileTooLarge" };
  }

  let table: string[][];
  try {
    table = await parseSpreadsheet(buffer, input.fileName);
  } catch {
    return { errorKey: "importExport.errors.parseFailed" };
  }
  if (table.length < 2) return { errorKey: "importExport.errors.emptyFile" };
  if (table.length - 1 > IMPORT_MAX_ROWS) {
    return {
      errorKey: "importExport.errors.tooManyRows",
      values: { max: IMPORT_MAX_ROWS },
    };
  }

  // Trường tùy biến pack khai (24o) — nhập Excel mang theo trường riêng ngành
  // đúng mapping khai sẵn, không phân biệt filterable/listable ở đây (nhập
  // là ghi, không phải hiện — mọi trường tùy biến đều nhập được).
  const pack = await getTenantPack(m.supabase);
  const customFields = pack.custom_fields ?? [];

  const mapping = input.mapping ?? guessMapping(table[0], customFields);
  if (mapping.fullName === -1) {
    return { errorKey: "importExport.errors.nameColumnRequired" };
  }

  const { rows, problems } = extractRows(table, mapping, customFields);

  // Trùng SĐT với khách đã có trong tiệm → bỏ qua (quy tắc mặc định đợt 1)
  const e164 = rows.map((r) => r.phoneE164).filter((p): p is string => p !== null);
  const existing = new Set<string>();
  for (let i = 0; i < e164.length; i += 500) {
    const { data } = await m.supabase
      .from("contacts")
      .select("phone_e164")
      .is("deleted_at", null)
      .in("phone_e164", e164.slice(i, i + 500));
    for (const row of data ?? []) existing.add(row.phone_e164 as string);
  }

  const fresh: ImportRow[] = [];
  for (const row of rows) {
    if (row.phoneE164 && existing.has(row.phoneE164)) {
      problems.push({
        rowNumber: row.rowNumber,
        label: row.fullName,
        reason: "duplicateExisting",
      });
      continue;
    }
    fresh.push(row);
  }
  problems.sort((a, b) => a.rowNumber - b.rowNumber);

  return { table, mapping, rows: fresh, problems, customFields };
}

/** Chạy thử: đếm sẽ tạo / trùng / lỗi và liệt kê 20 dòng vướng đầu tiên. */
export async function previewContactsImport(
  input: z.input<typeof uploadSchema>,
): Promise<ImportPreview> {
  const t = await getTranslations("contacts");
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: t("importExport.errors.unsupportedFile") };
  }

  const m = await requireMember();
  if ("errorKey" in m) return { error: t(m.errorKey) };
  if (!MANAGE_ROLES.includes(m.role)) {
    return { error: t("importExport.errors.permissionDenied") };
  }

  const prepared = await prepare(m, parsed.data);
  if ("errorKey" in prepared) {
    return { error: t(prepared.errorKey, prepared.values) };
  }

  const duplicates = prepared.problems.filter(
    (p) => p.reason === "duplicateExisting" || p.reason === "duplicateInFile",
  ).length;

  return {
    error: null,
    headers: prepared.table[0],
    mapping: prepared.mapping,
    totalRows: prepared.table.length - 1,
    toCreate: prepared.rows.length,
    duplicates,
    failed: prepared.problems.length - duplicates,
    problems: prepared.problems.slice(0, PROBLEMS_SHOWN),
    customFields: prepared.customFields,
  };
}

/** Tìm/tạo bản ghi cấu hình theo tên (lead_sources, tags) — trả map tên đã chuẩn hóa → id. */
async function resolveByName(
  m: Member,
  table: "lead_sources" | "tags",
  wanted: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (wanted.length === 0) return map;

  const { data: existing } = await m.supabase.from(table).select("id, name");
  for (const row of existing ?? []) {
    map.set(normalizeSearch(row.name as string), row.id as string);
  }

  const missing = wanted.filter((name) => !map.has(normalizeSearch(name)));
  if (missing.length === 0) return map;

  if (table === "tags") {
    // tags.(tenant_id, name) là partial unique index từ migration #71 (chỉ
    // tính nhãn còn sống, cho gộp/xoá xong dùng lại tên) — upsert onConflict
    // của PostgREST không khai được mệnh đề WHERE của index từng phần nên
    // dùng insert thường; đụng đúng lúc 2 người nhập cùng lúc tạo trùng tên
    // (hiếm) thì đọc lại DB thay vì báo lỗi cả file.
    const { data: created, error } = await m.supabase
      .from(table)
      .insert(missing.map((name) => ({ tenant_id: m.tenantId, name })))
      .select("id, name");
    if (error) {
      const { data: retry } = await m.supabase
        .from(table)
        .select("id, name")
        .in("name", missing);
      for (const row of retry ?? []) {
        map.set(normalizeSearch(row.name as string), row.id as string);
      }
    } else {
      for (const row of created ?? []) {
        map.set(normalizeSearch(row.name as string), row.id as string);
      }
    }
    return map;
  }

  const { data: created } = await m.supabase
    .from(table)
    .upsert(
      missing.map((name) => ({ tenant_id: m.tenantId, name })),
      { onConflict: "tenant_id,name" },
    )
    .select("id, name");
  for (const row of created ?? []) {
    map.set(normalizeSearch(row.name as string), row.id as string);
  }
  return map;
}

/**
 * Tự động nối công ty khi nhập Excel: chỉ nối vào công ty ĐÃ CÓ khớp đuôi email
 * công việc — file Excel không bao giờ đẻ ra công ty mới.
 * Trả map đuôi email → company_id (công ty cũ nhất khi trùng đuôi).
 *
 * Tra bằng RPC `companies_by_email_domain` (migration #37) chứ KHÔNG phải một
 * câu `select … in (…)`: câu select trả tối đa 1000 DÒNG, nên file nhập nhiều
 * đuôi công ty (hoặc tiệm nhiều công ty trùng đuôi) sẽ có khách bị bỏ sót không
 * nối vào công ty mà KHÔNG báo lỗi gì. RPC gộp sẵn trong CSDL và trả về đúng
 * MỘT dòng jsonb {đuôi → id} nên không còn trần dòng nào; danh sách đuôi đi
 * trong thân POST nên cũng không đụng trần độ dài URL.
 */
async function resolveCompaniesByDomain(
  m: Member,
  emails: string[],
): Promise<Map<string, string>> {
  const domains = [
    ...new Set(
      emails.map((e) => workEmailDomain(e)).filter((d): d is string => d !== null),
    ),
  ];
  if (domains.length === 0) return new Map();

  const { data } = await m.supabase.rpc("companies_by_email_domain", {
    p_domains: domains,
  });
  return new Map(Object.entries((data ?? {}) as Record<string, string>));
}

const INSERT_BATCH = 200;

export type ImportResult = {
  error: string | null;
  created?: number;
  skipped?: number;
  failed?: number;
  /** Số khách được tự động gắn vào công ty sẵn có theo đuôi email công việc. */
  linked?: number;
};

/** Nhập thật: parse lại từ file gốc, tạo khách hợp lệ, phát `contact.created` (channel "import"). */
export async function runContactsImport(
  input: z.input<typeof uploadSchema>,
): Promise<ImportResult> {
  const t = await getTranslations("contacts");
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success || !parsed.data.mapping) {
    return { error: t("importExport.errors.unsupportedFile") };
  }

  const m = await requireMember();
  if ("errorKey" in m) return { error: t(m.errorKey) };
  if (!MANAGE_ROLES.includes(m.role)) {
    return { error: t("importExport.errors.permissionDenied") };
  }

  const prepared = await prepare(m, parsed.data);
  if ("errorKey" in prepared) {
    return { error: t(prepared.errorKey, prepared.values) };
  }

  const { rows, problems } = prepared;
  const duplicates = problems.filter(
    (p) => p.reason === "duplicateExisting" || p.reason === "duplicateInFile",
  ).length;
  if (rows.length === 0) {
    return {
      error: null,
      created: 0,
      skipped: duplicates,
      failed: problems.length - duplicates,
      linked: 0,
    };
  }

  const sources = await resolveByName(
    m,
    "lead_sources",
    [...new Set(rows.map((r) => r.sourceName).filter(Boolean))],
  );
  const tags = await resolveByName(
    m,
    "tags",
    [...new Set(rows.flatMap((r) => r.tagNames))],
  );

  const companiesByDomain = await resolveCompaniesByDomain(
    m,
    rows.map((r) => r.email),
  );
  const companyFor = (email: string): string | null => {
    const domain = workEmailDomain(email);
    return domain ? (companiesByDomain.get(domain) ?? null) : null;
  };

  let created = 0;
  let linked = 0;
  let failed = problems.length - duplicates;

  // contact.created (channel "import") và contact.company_linked (method "import")
  // do trigger DB phát ngay trong lệnh INSERT (migration #15) — không còn vòng gọi
  // RPC riêng cho từng khách; client này chỉ mang theo ngữ cảnh để payload đúng.
  const writer = await createClient({ channel: "import", linkMethod: "import" });

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { data, error } = await writer
      .from("contacts")
      .insert(
        batch.map((r) => ({
          tenant_id: m.tenantId,
          full_name: r.fullName,
          phone: r.phone || null,
          phone_e164: r.phoneE164,
          email: r.email || null,
          source_id: sources.get(normalizeSearch(r.sourceName)) ?? null,
          company_id: companyFor(r.email),
          owner_id: m.userId, // RLS: người nhập tự phụ trách, giống createContact
          created_by: m.userId,
          custom: r.custom,
        })),
      )
      .select("id");

    if (error || !data) {
      // Một lô hỏng không được chặn cả file — đếm là lỗi rồi đi tiếp
      failed += batch.length;
      continue;
    }
    created += data.length;

    // INSERT … RETURNING giữ đúng thứ tự lô gửi lên → ghép id với dòng tương ứng
    const links = batch.flatMap((r, index) =>
      r.tagNames
        .map((name) => tags.get(normalizeSearch(name)))
        .filter((tagId): tagId is string => Boolean(tagId))
        .map((tagId) => ({
          tenant_id: m.tenantId,
          contact_id: data[index].id as string,
          tag_id: tagId,
        })),
    );
    if (links.length > 0) {
      await m.supabase
        .from("contact_tags")
        .upsert(links, { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
    }

    linked += batch.filter((r) => companyFor(r.email) !== null).length;
  }

  revalidatePath("/app/contacts");
  if (linked > 0) revalidatePath("/app/companies");
  return { error: null, created, skipped: duplicates, failed, linked };
}

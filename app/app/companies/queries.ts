import type { SupabaseClient } from "@supabase/supabase-js";
import { applyKeysetCursor, keysetCursor } from "@/lib/keyset-cursor";
import { normalizeSearch } from "../contacts/types";
import {
  normalizeTaxCode,
  type CompanyContactRow,
  type CompanyDealRow,
  type CompanyDetailRow,
  type CompanyOption,
  type CompanyRow,
  type CompanyStats,
} from "./types";

/**
 * Fetcher dùng chung màn Công ty: server component load trang đầu, client
 * (TanStack Query) refetch — cùng một câu select để shape dữ liệu khớp nhau.
 * Mọi query đi qua client đã đăng nhập → RLS tự giới hạn theo tenant.
 */

export const PAGE_SIZE = 50;

const COMPANY_SELECT = `id, name, email_domain, tax_code, created_at, updated_at`;

export type CompaniesPage = { rows: CompanyRow[]; nextCursor: string | null };

const EMPTY_STATS = { contact_count: 0, open_deal_count: 0, won_value_vnd: 0 };

/**
 * Ghép bộ lọc tìm kiếm: tên (không dấu, khớp cột name_normalized do DB sinh),
 * đuôi email, MST (so theo chữ số nên gõ "0101243150-001" hay liền đều ra).
 */
function orSearch(q: string): string | null {
  const text = normalizeSearch(q).replace(/[%_]/g, "\\$&");
  if (!text) return null;
  const parts = [
    `name_normalized.ilike."%${text}%"`,
    `email_domain.ilike."%${text}%"`,
  ];
  const digits = normalizeTaxCode(q);
  if (digits) parts.push(`tax_code.ilike."%${digits}%"`);
  return parts.join(",");
}

/** Số liệu (số khách / cơ hội mở / doanh thu thắng) cho đúng các công ty đang hiện. */
async function fetchStats(
  supabase: SupabaseClient,
  companyIds: string[],
): Promise<Map<string, CompanyStats>> {
  const map = new Map<string, CompanyStats>();
  if (companyIds.length === 0) return map;
  const { data, error } = await supabase
    .from("company_stats")
    .select("company_id, contact_count, open_deal_count, won_value_vnd")
    .in("company_id", companyIds);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as CompanyStats[]) {
    map.set(row.company_id, row);
  }
  return map;
}

export async function fetchCompaniesPage(
  supabase: SupabaseClient,
  q: string,
  cursor: string | null,
): Promise<CompaniesPage> {
  let query = supabase
    .from("companies")
    .select(COMPANY_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE);

  const search = orSearch(q);
  if (search) query = query.or(search);
  if (cursor) query = applyKeysetCursor(query, cursor);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const base = (data ?? []) as Omit<CompanyRow, "stats">[];
  const stats = await fetchStats(
    supabase,
    base.map((c) => c.id),
  );

  const rows: CompanyRow[] = base.map((c) => ({
    ...c,
    stats: stats.get(c.id) ?? { company_id: c.id, ...EMPTY_STATS },
  }));
  return {
    rows,
    nextCursor:
      rows.length === PAGE_SIZE ? keysetCursor(rows[rows.length - 1]) : null,
  };
}

export async function fetchCompanyDetail(
  supabase: SupabaseClient,
  companyId: string,
): Promise<CompanyDetailRow | null> {
  const { data, error } = await supabase
    .from("companies")
    .select(`id, name, email_domain, tax_code, phone, address, created_at, updated_at`)
    .eq("id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as CompanyDetailRow | null;
}

export async function fetchCompanyStats(
  supabase: SupabaseClient,
  companyId: string,
): Promise<CompanyStats> {
  const stats = await fetchStats(supabase, [companyId]);
  return stats.get(companyId) ?? { company_id: companyId, ...EMPTY_STATS };
}

// Trần này phải NÓI RA trên màn hình khi chạm tới — trần ngầm làm người
// dùng tưởng đó là tất cả (bài học #21/#29). View nhận hằng số qua props.
export const COMPANY_CONTACT_LIMIT = 100;

export async function fetchCompanyContacts(
  supabase: SupabaseClient,
  companyId: string,
): Promise<CompanyContactRow[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select("id, full_name, phone, email, lead_score")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("lead_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(COMPANY_CONTACT_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []) as CompanyContactRow[];
}

export const COMPANY_DEAL_LIMIT = 50;

/**
 * Cơ hội của công ty = cơ hội của những khách thuộc công ty.
 * Form Cơ hội đợt 1 chỉ chọn KHÁCH (deals.company_id chưa dùng) nên đây là
 * quan hệ đúng với dữ liệu thật — cùng cách tính với view company_stats.
 */
export async function fetchCompanyDeals(
  supabase: SupabaseClient,
  companyId: string,
): Promise<CompanyDealRow[]> {
  const { data, error } = await supabase
    .from("deals")
    .select(
      `id, title, value_vnd, status, pipeline_stages(name, kind), contacts!inner(company_id)`,
    )
    .eq("contacts.company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(COMPANY_DEAL_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CompanyDealRow[];
}

export const COMPANY_OPTION_LIMIT = 20;

/** Gợi ý công ty cho ô chọn công ty của form khách (tìm không dấu như màn Khách hàng). */
export async function searchCompanyOptions(
  supabase: SupabaseClient,
  q: string,
): Promise<CompanyOption[]> {
  let query = supabase
    .from("companies")
    .select("id, name, email_domain")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(COMPANY_OPTION_LIMIT);

  const search = orSearch(q);
  if (search) query = query.or(search);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as CompanyOption[];
}

/**
 * Công ty khớp đuôi email công việc — trái tim của "tự động nối".
 * Lấy bản ghi CŨ NHẤT khi có nhiều công ty cùng đuôi (email_domain không unique:
 * chi nhánh/công ty con dùng chung tên miền là chuyện thật) để kết quả ổn định.
 */
export async function findCompanyByDomain(
  supabase: SupabaseClient,
  domain: string,
): Promise<CompanyOption | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, email_domain")
    .eq("email_domain", domain)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as CompanyOption | null;
}

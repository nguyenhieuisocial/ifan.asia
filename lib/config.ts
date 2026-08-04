/**
 * Cấu hình CÔNG KHAI của app (Supabase URL + anon key vốn được gửi tới mọi
 * trình duyệt — không phải bí mật). Env var luôn được ưu tiên khi có;
 * giá trị mặc định nhúng sẵn để deploy không phụ thuộc cấu hình dashboard.
 * TUYỆT ĐỐI không đặt secret (service_role, DB password...) vào file này.
 */
/** Origin công khai của site — dùng cho metadataBase, robots, sitemap. */
export const SITE_URL = "https://ifan-web.vercel.app";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://espdwbxibylgzsvldsgd.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcGR3YnhpYnlsZ3pzdmxkc2dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NzAwMTIsImV4cCI6MjEwMTE0NjAxMn0.m51dZoSbsp9kK4T5p2D1tMF8Q4rqjdInuY8wfMck8aQ";

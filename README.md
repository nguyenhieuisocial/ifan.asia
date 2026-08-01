# ifan.asia

Nền tảng quản trị doanh nghiệp cho SME Việt Nam — inbox Zalo/đa kênh, CRM, công việc, kho, tài chính, AI. Multi-tenant SaaS.

- **Stack:** Next.js (App Router, TypeScript, Tailwind) trên Vercel · Supabase Postgres (Singapore) với RLS multi-tenant · Cloudflare.
- **Tài liệu điều hành, spec 12 module, quy hoạch tổng thể:** vault Obsidian nội bộ (không nằm trong repo này).
- **Quy tắc bất di bất dịch:** RLS + `tenant_id` trên mọi bảng từ migration đầu tiên; test cách ly tenant (`scripts/test-rls-isolation.mjs`) phải xanh trong CI mỗi lần deploy; tiền lưu `bigint` VNĐ; múi giờ `Asia/Ho_Chi_Minh`; sự kiện liên module đi qua outbox `domain_events` theo `docs/EVENT_CATALOG.md`.

## Chạy local

```bash
npm install
cp .env.example .env.local   # điền giá trị Supabase
npm run dev
```

## Cấu trúc

- `app/` — Next.js App Router
- `supabase/migrations/` — schema database (nguồn sự thật duy nhất, không sửa tay trên dashboard)
- `docs/EVENT_CATALOG.md` — catalog sự kiện liên module
- `scripts/test-rls-isolation.mjs` — quality gate cách ly dữ liệu tenant

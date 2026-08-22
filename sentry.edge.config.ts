// Sentry cho phần chạy ở BIÊN (Edge runtime — `proxy.ts` và mọi route khai
// `runtime = "edge"`). Nạp từ `instrumentation.ts`.
//
// ⚠️ Tệp này KHÔNG được nạp thứ gì chỉ chạy được ở Node. `lib/sentry-chung.ts`
//   cố ý chỉ đọc biến môi trường, không dùng `node:crypto` như `lib/ghi-loi.ts`.
import * as Sentry from "@sentry/nextjs";
import { CAU_HINH_CHUNG } from "@/lib/sentry-chung";

Sentry.init(CAU_HINH_CHUNG);

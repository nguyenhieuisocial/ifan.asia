// Sentry cho phần chạy ở MÁY CHỦ (Node). Nạp từ `instrumentation.ts`.
// Cấu hình chung nằm ở `lib/sentry-chung.ts` — sửa ở đó, không sửa ở đây.
import * as Sentry from "@sentry/nextjs";
import { CAU_HINH_CHUNG } from "@/lib/sentry-chung";

Sentry.init(CAU_HINH_CHUNG);

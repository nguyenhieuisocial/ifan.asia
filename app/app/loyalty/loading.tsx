import { Skeleton } from "@/components/ui/skeleton";

// Khung xương chung khi chuyển màn — hiện NGAY thay cho cảm giác "đơ" trong lúc
// máy chủ tải dữ liệu. Mẫu theo app/app/loading.tsx (chỉ hình khối, không chữ;
// chữ thật do server render khi dữ liệu về).
export default function Loading() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Bề ngang bám theo loyalty-view (672px, từ lg là 1024px) — lệch mốc
          là lúc dữ liệu về khung nhảy ngang một cái. */}
      <div className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6 lg:max-w-5xl xl:max-w-7xl 2xl:max-w-[1600px]">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <Skeleton className="h-7 w-44 max-w-full" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

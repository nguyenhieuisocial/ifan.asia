import { Skeleton } from "@/components/ui/skeleton";

/**
 * Khung xương màn "Hôm nay gọi ai" — khớp bố cục today-view.tsx: thanh đầu màn
 * (tiêu đề + phụ đề, nút phạm vi, nút Tổng quan) nằm cùng khung với danh sách,
 * dưới là 3 thẻ việc cao 96 cách nhau 12 (đúng thẻ "Hôm nay" trong
 * design-system/loading.html). Bề ngang và mốc lg phải khớp y hệt today-view —
 * lệch một mốc là lúc dữ liệu về khung nhảy ngang một cái.
 */
export default function TodayLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 p-3 lg:max-w-5xl xl:max-w-7xl 2xl:max-w-[1600px]">
          <div className="w-full min-w-0 space-y-1.5 sm:mr-auto sm:w-auto">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-44" />
          </div>
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-4 p-4 lg:max-w-5xl xl:max-w-7xl 2xl:max-w-[1600px]">
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

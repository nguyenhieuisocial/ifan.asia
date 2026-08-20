import { Skeleton } from "@/components/ui/skeleton";

/**
 * Khung xương màn Tổng quan — khớp bố cục thật của app/app/page.tsx:
 * đầu trang (tiêu đề + dãy nút chọn kỳ) → 2 hàng ô số (mỗi hàng nhãn nhóm +
 * lưới 2/4 ô) → hàng biểu đồ doanh thu + nguồn. Chỉ hình khối, không chữ —
 * chữ thật do server render khi dữ liệu về.
 */
export default function OverviewLoading() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Bề ngang phải khớp Y HỆT page.tsx — lệch một mốc thì lúc dữ liệu về
          khung nhảy ngang một cái, người dùng tưởng mình bấm nhầm. */}
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 xl:max-w-7xl 2xl:max-w-[1600px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-8 w-56 max-w-full" />
          </div>
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        {/* 2 hàng ô số: TIỀN trong kỳ + KPI hội thoại/khách */}
        {[0, 1].map((row) => (
          <div key={row} className="space-y-3">
            <Skeleton className="h-4 w-28" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
        {/* Hàng biểu đồ doanh thu theo ngày + nguồn nào ra tiền */}
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-56 rounded-lg" />
          <Skeleton className="h-56 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

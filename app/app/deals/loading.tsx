import { Skeleton } from "@/components/ui/skeleton";

/**
 * Khung xương bảng Cơ hội — khớp bố cục deals-board.tsx: thanh đầu màn (tiêu đề
 * + dòng tổng tiền + cụm nút phải) rồi các cột Kanban 280px cuộn ngang, mỗi cột
 * có đầu cột và vài thẻ.
 */
export default function DealsLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
        <Skeleton className="mr-1 h-5 w-20" />
        <Skeleton className="h-4 w-48 max-w-full" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full gap-3 p-3">
          {[0, 1, 2, 3].map((col) => (
            <div
              key={col}
              className="flex w-[280px] shrink-0 flex-col rounded-lg border bg-muted/30"
            >
              <div className="shrink-0 space-y-2 border-b px-3 py-2.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="space-y-2 p-2">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
                {col === 0 && <Skeleton className="h-28 w-full" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

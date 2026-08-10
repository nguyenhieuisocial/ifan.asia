import { Skeleton } from "@/components/ui/skeleton";

/**
 * Khung xương Hộp thư — khớp bố cục inbox-shell.tsx: cột danh sách hội thoại
 * (toàn màn trên điện thoại, 340px từ md) + khung chat chỉ hiện từ md. Mỗi hàng
 * danh sách = avatar tròn + 2 dòng chữ, đúng nhịp conversation-list.tsx.
 */
export default function InboxLoading() {
  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex w-full flex-col border-r md:w-[340px] md:shrink-0">
        <div className="shrink-0 space-y-2 border-b p-2">
          {/* Ô tìm khách + hàng thẻ bộ lọc */}
          <Skeleton className="h-8 w-full" />
          <div className="flex flex-wrap gap-1">
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex items-start gap-3 border-b px-3 py-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2 py-0.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-5/6" />
              </div>
            </div>
          ))}
        </div>
      </section>
      {/* Khung chat: ẩn trên điện thoại y như lúc chưa chọn hội thoại */}
      <section className="hidden min-w-0 flex-1 flex-col md:flex">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex-1 space-y-3 overflow-hidden p-4">
          <Skeleton className="h-12 w-2/3 max-w-sm rounded-lg" />
          <Skeleton className="ml-auto h-12 w-1/2 max-w-xs rounded-lg" />
          <Skeleton className="h-12 w-3/5 max-w-sm rounded-lg" />
        </div>
      </section>
    </div>
  );
}

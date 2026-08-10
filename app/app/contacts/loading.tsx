import { Skeleton } from "@/components/ui/skeleton";

/**
 * Khung xương danh sách Khách hàng — khớp bố cục contacts-shell.tsx: thanh lọc
 * hai tầng (ô tìm + hàng nút lọc) rồi 5 hàng cao 44, hàng cuối ngắn hơn
 * (đúng thẻ "Danh sách khách hàng" trong design-system/loading.html).
 */
export default function ContactsLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b p-3">
        <div className="flex items-center gap-2">
          <Skeleton className="mr-2 hidden h-5 w-24 sm:block" />
          <Skeleton className="h-9 flex-1 sm:max-w-xs" />
        </div>
        <div className="flex items-center gap-2 overflow-hidden pb-0.5">
          <Skeleton className="h-8 w-28 shrink-0" />
          <Skeleton className="h-8 w-24 shrink-0" />
          <Skeleton className="h-8 w-32 shrink-0" />
          <Skeleton className="ml-auto h-8 w-28 shrink-0" />
          <Skeleton className="h-8 w-24 shrink-0" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="space-y-2 p-4">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-2/3" />
        </div>
      </div>
    </div>
  );
}

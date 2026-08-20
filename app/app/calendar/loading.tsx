import { Skeleton } from "@/components/ui/skeleton";

// Khung xương chung khi chuyển màn — hiện NGAY thay cho cảm giác "đơ" trong lúc
// máy chủ tải dữ liệu. Mẫu theo app/app/loading.tsx (chỉ hình khối, không chữ;
// chữ thật do server render khi dữ liệu về).
export default function Loading() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* KHÔNG khoá bề rộng: màn Lịch thật dùng HẾT chiều ngang
          (lưới theo ngày / bảng cột), nên khung chờ khoá 1024px làm trang nhảy
          giật một cái đúng lúc dữ liệu về. Cùng lớp lỗi đã vá cho 7 màn khác
          hôm 21/08 — hai màn này sót lại vì chúng không có khung căn giữa để
          đối chiếu. */}
      <div className="w-full space-y-6 p-4 sm:p-6">
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

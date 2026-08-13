import { MODULE_REGISTRY } from "@/lib/feature-registry";

/**
 * Chụp lại "bảng trạng thái 28 mảng" bằng ĐÚNG chữ đang hiện trên trang công
 * khai, để máy chủ so hai lần triển khai và báo cái gì vừa đổi.
 *
 * VÌ SAO KHÔNG GỬI THẲNG KHOÁ KỸ THUẬT: bản cũ gửi `{contractsBilling:
 * "planned"}` nên bản tin về nhóm Telegram đọc là *"contractsBilling: planned →
 * ready"*. Đó là mã nguồn, không phải tiếng Việt — người nhận tin là founder,
 * không phải người viết code. Nay gửi kèm tên và trạng thái đã dịch.
 *
 * VÌ SAO LẤY CHỮ TỪ messages/vi.json CHỨ KHÔNG CHÉP TAY (luật D1): nếu chép
 * tay, hôm nào đổi tên mảng trên web là bản tin nói tên cũ mãi mãi — và không
 * ai phát hiện, vì bản tin thì đúng cú pháp, chỉ sai sự thật.
 *
 * ĐỔI ĐỢT CŨNG LÀ TIN: một mảng dời từ "đợt V7–V8" lên "đợt V3–V5" là lộ trình
 * vừa đổi — hiện ngay trên trang /lo-trinh công khai. Bản cũ chỉ gửi status nên
 * việc dời lịch đi qua hoàn toàn im lặng.
 */
export interface ModuleState {
  /** Tên mảng như trên trang chủ, ví dụ "Hợp đồng & Gói định kỳ". */
  ten: string;
  /** Trạng thái + đợt, ví dụ "trong lộ trình · đợt V3–V5". */
  trang: string;
  /** Nhóm hiển thị trên /tinh-nang, ví dụ "Bán hàng & Khách hàng". */
  nhom: string;
}

type ViMessages = {
  landing: { modules: Record<string, { name?: string }> };
  loTrinh: Record<string, string>;
  tinhNang: { groups: Record<string, { title?: string }> };
};

/** Nhãn đợt nằm ở 3 khoá khác nhau — bảng này chỉ ánh xạ mã đợt sang khoá đó. */
const WAVE_KEY: Record<string, string> = {
  v3v5: "waveV3V5Sub",
  v6: "waveV6Sub",
  v7v8: "waveV7Sub",
};

export async function describeModules(): Promise<Record<string, ModuleState>> {
  const vi = ((await import("@/messages/vi.json")).default as unknown) as ViMessages;

  const out: Record<string, ModuleState> = {};
  for (const m of MODULE_REGISTRY) {
    const trang =
      m.status === "ready"
        ? vi.loTrinh.readyTitle
        : m.status === "building"
          ? vi.loTrinh.buildingTitle
          : [vi.loTrinh.statPlanned, m.wave ? vi.loTrinh[WAVE_KEY[m.wave]] : null]
              .filter(Boolean)
              .join(" · ");

    out[m.key] = {
      // Thiếu chữ thì rơi về khoá — thà đọc khó còn hơn bản tin trống trơn,
      // và khoá lòi ra chính là dấu hiệu file ngôn ngữ thiếu mục.
      ten: vi.landing.modules[m.key]?.name ?? m.key,
      trang: trang || m.status,
      nhom: vi.tinhNang.groups[m.groupId]?.title ?? m.groupId,
    };
  }
  return out;
}

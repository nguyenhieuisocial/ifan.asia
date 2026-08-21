/**
 * ẢNH VÀ TỆP ĐÍNH KÈM tin nhắn nội bộ — phần dùng chung, KHÔNG chạy ở máy chủ.
 *
 * Tách khỏi `actions.ts` vì file đó mang directive `"use server"` và chỉ được
 * export hàm async; hằng số và hàm đồng bộ phải nằm ở đây (cổng
 * `soat-use-server-exports`).
 */

/** Tối đa mấy tệp cho một tin. Bốn là đủ cho một loạt ảnh trước–sau. */
export const MAX_TEP_MOI_TIN = 4;

/**
 * Trần cỡ MỘT tệp sau khi đã thu nhỏ, tính bằng byte.
 *
 * 8 MB: đủ cho một ảnh chụp điện thoại chất lượng cao và một tệp PDF bảng
 * công, mà vẫn chặn được video vô tình chọn nhầm — video 30 giây đã vượt xa
 * mức này, và một kênh chat đầy video sẽ ăn hết dung lượng kho trong một tuần.
 */
export const MAX_CO_TEP = 8 * 1024 * 1024;

/**
 * Cạnh dài tối đa của ẢNH sau khi thu nhỏ.
 *
 * ⚠️ Thu nhỏ Ở MÁY NGƯỜI GỬI, trước khi tải lên. Một ảnh chụp điện thoại đời
 *   mới là 4000×3000 và nặng 5–8 MB, trong khi màn chat hiện nó rộng chưa tới
 *   600px. Gửi nguyên bản là bắt cả tiệm tải về gấp ba mươi lần thứ họ nhìn
 *   thấy — trên mạng 3G ở tiệm thì đó là khác biệt giữa "xem được" và "không
 *   xem được".
 */
export const CANH_ANH_TOI_DA = 1600;

export type TepDinhKem = {
  duongDan: string;
  ten: string;
  loai: string;
  co: number;
};

/** Đuôi tệp lấy từ tên gốc, đã chuẩn hoá — chỉ để đặt tên trong kho. */
export function duoiTep(ten: string): string {
  const m = /\.([a-zA-Z0-9]{1,8})$/.exec(ten);
  return m ? m[1].toLowerCase() : "bin";
}

/** Cỡ tệp cho người đọc: `2,4 MB`. */
export function coDocDuoc(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} KB`;
  return `${(byte / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function laAnh(loai: string): boolean {
  return loai.startsWith("image/");
}

/**
 * Thu nhỏ một ảnh trước khi tải lên. Không phải ảnh thì trả về nguyên tệp.
 *
 * ⚠️ Ảnh GIF giữ NGUYÊN: vẽ lại qua canvas sẽ mất hoạt ảnh, chỉ còn khung đầu
 *   tiên — và người gửi sẽ không hiểu vì sao ảnh của họ "đứng im".
 *
 * ⚠️ Hỏng bước nào thì trả về TỆP GỐC chứ không ném lỗi. Thu nhỏ là việc làm
 *   cho tốt hơn, không phải điều kiện để gửi được; hỏng mà chặn luôn việc gửi
 *   là đổi một thứ phụ lấy một thứ chính.
 */
export async function thuNhoAnh(tep: File): Promise<File> {
  if (!laAnh(tep.type) || tep.type === "image/gif") return tep;

  try {
    const anh = await createImageBitmap(tep);
    const canhDai = Math.max(anh.width, anh.height);
    if (canhDai <= CANH_ANH_TOI_DA) {
      anh.close();
      return tep;
    }
    const ty = CANH_ANH_TOI_DA / canhDai;
    const w = Math.round(anh.width * ty);
    const h = Math.round(anh.height * ty);

    const khung = document.createElement("canvas");
    khung.width = w;
    khung.height = h;
    const ve = khung.getContext("2d");
    if (!ve) return tep;
    ve.drawImage(anh, 0, 0, w, h);
    anh.close();

    const blob = await new Promise<Blob | null>((xong) =>
      khung.toBlob(xong, "image/jpeg", 0.85),
    );
    if (!blob || blob.size >= tep.size) return tep;

    return new File([blob], tep.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } catch {
    return tep;
  }
}

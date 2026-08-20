/**
 * #225 lát UI — tính "dấu mặt" (embedding 128 số) NGAY TRÊN ĐIỆN THOẠI bằng
 * face-api.js (on-device, miễn phí). Dùng cho: nạp mặt gốc, và so mặt lúc chấm
 * giúp. Chỉ gửi DÃY SỐ lên máy chủ — không gửi ảnh đi đâu để nhận dạng.
 *
 * ⚠️ getUserMedia + WebGL: chỉ chạy trên trình duyệt thật (HTTPS). KHÔNG kiểm
 * được ở máy dev không camera — phải test trên điện thoại.
 *
 * NẶNG (~6MB model + TF.js): NHẬP ĐỘNG để không phình bó chính; model chỉ tải
 * khi ai đó thực sự dùng nạp mặt / chấm giúp.
 */
type FaceApi = typeof import("@vladmandic/face-api");

let sanSang: Promise<FaceApi> | null = null;

/** Nạp thư viện + model MỘT LẦN (dùng lại cho các lần sau). */
function napFaceApi(): Promise<FaceApi> {
  if (!sanSang) {
    sanSang = (async () => {
      const mod = await import("@vladmandic/face-api");
      const URL = "/models";
      await mod.nets.tinyFaceDetector.loadFromUri(URL);
      await mod.nets.faceLandmark68Net.loadFromUri(URL);
      await mod.nets.faceRecognitionNet.loadFromUri(URL);
      return mod;
    })();
  }
  return sanSang;
}

/**
 * Tính dấu mặt từ một khung hình (canvas). Trả 128 số, hoặc null nếu KHÔNG thấy
 * đúng một khuôn mặt rõ (thiếu sáng, quay đi, nhiều mặt…). Null ⇒ không chấm
 * điểm khớp, chấm giúp vẫn chạy (chỉ mất phần so mặt).
 */
export async function tinhDauMat(canvas: HTMLCanvasElement): Promise<number[] | null> {
  try {
    const fa = await napFaceApi();
    const det = await fa
      .detectSingleFace(canvas, new fa.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!det) return null;
    return Array.from(det.descriptor as Float32Array);
  } catch {
    return null;
  }
}

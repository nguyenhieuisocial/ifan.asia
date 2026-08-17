/**
 * Ngân hàng TMVN + mã BIN NAPAS — đối chiếu trực tiếp với `api.vietqr.io/v2/banks`
 * (danh sách công khai NAPAS, kiểm lúc viết ADR-0019 việc 5, 17/08/2026).
 * 26 ngân hàng phổ biến nhất — KHÔNG đủ toàn bộ ~65 ngân hàng NAPAS; tiệm dùng
 * ngân hàng khác vẫn tự nhập được mã BIN 6 số (ô "Ngân hàng khác" ở form Cài
 * đặt → Nhận thanh toán).
 */
export type VnBank = { bin: string; shortName: string };

export const VN_BANKS: VnBank[] = [
  { bin: "970436", shortName: "Vietcombank" },
  { bin: "970415", shortName: "VietinBank" },
  { bin: "970418", shortName: "BIDV" },
  { bin: "970405", shortName: "Agribank" },
  { bin: "970407", shortName: "Techcombank" },
  { bin: "970422", shortName: "MBBank" },
  { bin: "970416", shortName: "ACB" },
  { bin: "970432", shortName: "VPBank" },
  { bin: "970423", shortName: "TPBank" },
  { bin: "970403", shortName: "Sacombank" },
  { bin: "970431", shortName: "Eximbank" },
  { bin: "970426", shortName: "MSB" },
  { bin: "970437", shortName: "HDBank" },
  { bin: "970441", shortName: "VIB" },
  { bin: "970443", shortName: "SHB" },
  { bin: "970440", shortName: "SeABank" },
  { bin: "970448", shortName: "OCB" },
  { bin: "970429", shortName: "SCB" },
  { bin: "970454", shortName: "VietCapitalBank" },
  { bin: "970428", shortName: "NamABank" },
  { bin: "970409", shortName: "BacABank" },
  { bin: "970400", shortName: "SaigonBank" },
  { bin: "970449", shortName: "LienVietPostBank" },
  { bin: "970433", shortName: "VietBank" },
  { bin: "970438", shortName: "BaoVietBank" },
  { bin: "970430", shortName: "PGBank" },
];

export function bankNameForBin(bin: string | null): string | null {
  if (!bin) return null;
  return VN_BANKS.find((b) => b.bin === bin)?.shortName ?? bin;
}

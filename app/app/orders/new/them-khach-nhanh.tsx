"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { createContact } from "@/app/app/contacts/actions";
import { normalizePhone } from "@/app/app/contacts/types";

/**
 * TẠO KHÁCH NGAY TRONG MÀN TẠO ĐƠN (thẻ `man-nhap-nhanh-don-hang`).
 *
 * ⚠️ VÌ SAO CẦN: màn tạo đơn là một TRANG RIÊNG, không phải cửa sổ. Khách chưa
 *   có trong máy thì người bán buộc phải thoát ra, sang Khách hàng, tạo, rồi
 *   quay lại — và GIỎ HÀNG VỪA NHẬP MẤT SẠCH. Chuyện đó xảy ra đúng lúc bận
 *   nhất: khách đang đứng trước mặt.
 *
 * ⚠️ CHỈ HAI Ô: TÊN VÀ SỐ ĐIỆN THOẠI. Đủ để bán hàng. Nguồn, công ty, thẻ, ghi
 *   chú… để dành cho màn Khách hàng đầy đủ — nhét hết vào đây là dựng lại một
 *   cái form thứ hai phải nuôi song song với form thật.
 *
 * ⚠️ DÙNG LẠI ĐÚNG `createContact` CỦA MÀN KHÁCH HÀNG, không viết đường ghi thứ
 *   hai. Cùng một phép kiểm dữ liệu, cùng trigger sinh sự kiện, cùng một chỗ để
 *   sửa khi có lỗi. Dựng đường thứ hai "cho nhanh" là dựng chỗ để hai đường
 *   lệch nhau.
 */

export interface KhachMoi {
  id: string;
  name: string;
}

/**
 * Chuẩn hoá số để SO TRÙNG — dùng lại đúng `normalizePhone` mà màn Khách hàng
 * dùng khi GHI. Tự viết một phép chuẩn hoá thứ hai nghĩa là hai bên hiểu "cùng
 * một số" khác nhau, và cảnh báo trùng sẽ im đúng lúc cần kêu.
 */
function chiSo(s: string): string {
  return normalizePhone(s);
}

export function ThemKhachNhanh({
  goiY,
  xong,
  thoi,
}: {
  /** Chữ người bán vừa gõ ở ô tìm — điền sẵn vào đúng ô hợp lý. */
  goiY: string;
  xong: (k: KhachMoi) => void;
  thoi: () => void;
}) {
  const t = useTranslations("orders.newOrder");
  const supabase = useMemo(() => createClient(), []);
  const [pending, startTransition] = useTransition();

  // Người bán hay gõ thẳng số điện thoại vào ô tìm. Đoán một lần cho đúng ô,
  // còn hơn bắt họ gõ lại.
  const laSo = chiSo(goiY).length >= 8 && /^[\d\s+.()-]+$/.test(goiY.trim());
  const [ten, datTen] = useState(laSo ? "" : goiY.trim());
  const [dienThoai, datDienThoai] = useState(laSo ? goiY.trim() : "");
  // ⚠️ LƯU KÈM CHÍNH SỐ ĐÃ TRA. Nếu chỉ lưu kết quả, người bán sửa số một chữ
  //   là cảnh báo của số CŨ còn treo ở đó cho tới khi lượt tra mới xong — họ
  //   sẽ đọc "đã có khách dùng số này" về một số không phải số đang gõ.
  const [trung, datTrung] = useState<{ so: string; id: string; name: string } | null>(null);

  // ── Soát trùng theo SỐ ĐIỆN THOẠI, không theo tên ──────────────────
  // Trùng tên là chuyện thường ở Việt Nam; trùng số mới đáng ngờ. Bảng khách
  // KHÔNG có ràng buộc duy nhất nào trên số điện thoại (đo 22/08), nên dòng
  // cảnh báo này là lớp chặn DUY NHẤT.
  useEffect(() => {
    const so = chiSo(dienThoai);
    // ⚠️ KHÔNG gọi setState thẳng ở đây khi số còn ngắn — đó là "đặt state ngay
    //   trong effect", gây dựng lại dây chuyền và bị lint chặn. Số ngắn thì
    //   đơn giản là không tra; phần hiện ra bên dưới tự lọc theo số hiện tại.
    if (so.length < 8) return;
    let bo = false;
    const id = setTimeout(async () => {
      // Hỏi thẳng CSDL đúng số đó, KHÔNG tải một nắm khách về rồi lọc ở trình
      // duyệt: tiệm có hàng nghìn khách, lọc phía trình duyệt vừa chậm vừa sai
      // — nó chỉ lọc trong phần tình cờ được tải về.
      const { data } = await supabase
        .from("contacts")
        .select("id, full_name")
        .eq("phone", so)
        .is("deleted_at", null)
        .limit(1);
      if (bo) return;
      const khop = (data ?? [])[0];
      datTrung(khop ? { so, id: khop.id as string, name: khop.full_name as string } : null);
    }, 350);
    return () => {
      bo = true;
      clearTimeout(id);
    };
  }, [dienThoai, supabase]);

  const luu = () => {
    if (!ten.trim() || pending) return;
    startTransition(async () => {
      // ⚠️ PHẢI GỬI ĐỦ MỌI TRƯỜNG CỦA `contactInputSchema`. Lược đồ đó khai
      //   `phone`/`email`/`sourceId`/`companyId` là BẮT BUỘC — chuỗi rỗng và
      //   null là giá trị hợp lệ, còn thiếu hẳn thì hỏng. Bỏ sót là lỗi LÚC
      //   CHẠY chứ không phải lúc dịch, và người bán chỉ thấy "chưa lưu được".
      const res = await createContact({
        fullName: ten.trim(),
        phone: dienThoai.trim(),
        email: "",
        sourceId: null,
        companyId: null,
      });
      if (res.error || !res.id) {
        toast.error(res.error ?? t("quickAdd.failed"));
        return;
      }
      toast.success(t("quickAdd.created", { name: ten.trim() }));
      xong({ id: res.id, name: ten.trim() });
    });
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
        {t("quickAdd.title")}
      </p>

      <div className="space-y-1">
        <Label htmlFor="khach-ten">{t("quickAdd.name")}</Label>
        <Input
          id="khach-ten"
          value={ten}
          onChange={(e) => datTen(e.target.value)}
          autoFocus
          className="max-md:h-11"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="khach-dien-thoai">{t("quickAdd.phone")}</Label>
        <Input
          id="khach-dien-thoai"
          value={dienThoai}
          onChange={(e) => datDienThoai(e.target.value)}
          inputMode="tel"
          className="max-md:h-11"
        />
      </div>

      {/* ⚠️ CẢNH BÁO, KHÔNG CHẶN. Hai người nhà dùng chung một số là chuyện có
          thật; chặn cứng là bắt người bán nhập số giả — tệ hơn hẳn. */}
      {trung?.so === chiSo(dienThoai) && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-[12px] leading-relaxed">
          <p className="font-semibold text-destructive">
            {t("quickAdd.duplicate", { name: trung.name })}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-1.5"
            onClick={() => xong({ id: trung.id, name: trung.name })}
          >
            {t("quickAdd.useExisting")}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={thoi} disabled={pending}>
          {t("quickAdd.cancel")}
        </Button>
        <Button type="button" size="sm" onClick={luu} disabled={!ten.trim() || pending}>
          {pending ? t("quickAdd.saving") : t("quickAdd.save")}
        </Button>
      </div>
    </div>
  );
}

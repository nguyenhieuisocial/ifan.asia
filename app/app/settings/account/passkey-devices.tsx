"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Fingerprint, Trash2 } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import type { RegistrationResponseJSON } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCoVanTay } from "@/components/passkey/co-van-tay";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import {
  batDauDangKyPasskey,
  danhSachPasskey,
  goPasskey,
  xongDangKyPasskey,
} from "./passkey-actions";

type May = { id: string; ten: string | null; taoLuc: string; dungLanCuoi: string | null };

/**
 * QUẢN LÝ MÁY ĐÃ GẮN VÂN TAY.
 *
 * ⚠️ Danh sách này phải GỠ ĐƯỢC, không chỉ để xem. Máy quầy bị mất, nhân viên
 *   nghỉ việc, đổi điện thoại — không gỡ được thì cách duy nhất để chặn là đổi
 *   mật khẩu toàn tài khoản, và lúc đó không ai làm.
 *
 * ⚠️ Tên máy là thứ DUY NHẤT phân biệt các dòng — mã thiết bị là chuỗi ngẫu
 *   nhiên, người dùng nhìn không ra. Bắt đặt tên trước khi thêm.
 */
export function PasskeyDevices() {
  const t = useTranslations("passkey");
  const locale = useLocale() as Locale;
  const [ds, datDs] = useState<May[] | null>(null);
  const [ten, datTen] = useState("");
  const [dangThem, datDangThem] = useState(false);
  const [dangGo, batDauGo] = useTransition();

  const coHoTro = useCoVanTay();

  useEffect(() => {
    let con = true;
    danhSachPasskey().then((r) => {
      if (con) datDs(r.error ? [] : r.ds);
    });
    return () => {
      con = false;
    };
  }, []);

  async function them() {
    datDangThem(true);
    try {
      const mo = await batDauDangKyPasskey();
      if (mo.error || !mo.tuyChon) {
        toast.error(t("serverNotReady"));
        return;
      }

      let traLoi: RegistrationResponseJSON;
      try {
        traLoi = await startRegistration({
          optionsJSON: mo.tuyChon as Parameters<typeof startRegistration>[0]["optionsJSON"],
        });
      } catch (e) {
        const loai = (e as Error)?.name;
        // Bấm Huỷ ở hộp vân tay — im lặng quay về, không mắng người dùng.
        if (loai === "NotAllowedError") return;
        // Trình duyệt từ chối vì máy này ĐÃ có trong `excludeCredentials`.
        toast.error(loai === "InvalidStateError" ? t("alreadyAdded") : t("notSupported"));
        return;
      }

      const xong = await xongDangKyPasskey({ traLoi, ten: ten.trim() });
      if (xong.error) {
        toast.error(t("failed"));
        return;
      }
      datTen("");
      const lai = await danhSachPasskey();
      datDs(lai.error ? [] : lai.ds);
      toast.success(t("addDone"));
    } finally {
      datDangThem(false);
    }
  }

  function go(may: May) {
    if (!window.confirm(t("removeConfirm"))) return;
    batDauGo(async () => {
      const r = await goPasskey({ id: may.id });
      if (r.error) {
        toast.error(t("failed"));
        return;
      }
      datDs((cu) => (cu ?? []).filter((x) => x.id !== may.id));
      toast.success(t("removed"));
    });
  }

  if (!coHoTro) return null;

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-medium">
          <Fingerprint className="size-4" />
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {ds !== null && (
        <ul className="space-y-1.5">
          {ds.length === 0 && (
            <li className="text-sm text-muted-foreground">{t("empty")}</li>
          )}
          {ds.map((may) => (
            <li
              key={may.id}
              className="flex items-center gap-2 rounded-md border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{may.ten}</p>
                <p className="text-xs text-muted-foreground">
                  {t("addedAt", { ngay: formatDate(may.taoLuc, locale) })} ·{" "}
                  {may.dungLanCuoi
                    ? t("lastUsed", { ngay: formatDate(may.dungLanCuoi, locale) })
                    : t("neverUsed")}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={dangGo}
                onClick={() => go(may)}
                aria-label={t("remove")}
                title={t("remove")}
                className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          value={ten}
          onChange={(e) => datTen(e.target.value)}
          placeholder={t("namePlaceholder")}
          maxLength={60}
          className="h-9"
        />
        <Button
          type="button"
          onClick={them}
          disabled={dangThem || ten.trim().length === 0}
          className="h-9 shrink-0"
        >
          {dangThem ? t("adding") : t("add")}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{t("privacy")}</p>
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Building2, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { createCompany } from "../companies/actions";
import { searchCompanyOptions } from "../companies/queries";
import type { CompanyOption } from "../companies/types";

type Props = {
  value: string | null;
  /** Tên công ty đang gắn (mode sửa) — để không phải query lại chỉ để hiện tên. */
  selectedName?: string;
  onChange: (companyId: string | null, name: string) => void;
};

/**
 * Ô chọn công ty cho form khách: tìm công ty sẵn có (không dấu) hoặc tạo nhanh
 * ngay tại chỗ bằng tên. Cùng khuôn với ô chọn khách của form Cơ hội.
 */
export function CompanyPicker({ value, selectedName, onChange }: Props) {
  const t = useTranslations("contacts.form");
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [creating, startCreate] = useTransition();

  // Debounce 300ms: gõ xong mới query (như màn Khách hàng)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  const optionsQuery = useQuery({
    queryKey: ["company-options", debouncedQ],
    queryFn: () => searchCompanyOptions(supabase, debouncedQ),
    enabled: !value,
  });
  const options: CompanyOption[] = optionsQuery.data ?? [];
  const typed = q.trim();
  const canCreate =
    typed !== "" &&
    !optionsQuery.isPending &&
    !options.some((o) => o.name.toLowerCase() === typed.toLowerCase());

  const create = () => {
    if (creating || !canCreate) return;
    startCreate(async () => {
      const res = await createCompany({ name: typed, emailDomain: "", taxCode: "" });
      if (res.error || !res.id) {
        toast.error(res.error ?? t("companyCreateFailed"));
        return;
      }
      onChange(res.id, res.name ?? typed);
      setQ("");
    });
  };

  if (value) {
    return (
      <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input px-3 text-sm max-md:h-11">
        <span className="flex min-w-0 items-center gap-2">
          <Building2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{selectedName || t("companyUnnamed")}</span>
        </span>
        {/* Chữ "Đổi" là NÚT — cao bằng cả ô để ngón tay với tới (44px). */}
        <button
          type="button"
          className="shrink-0 text-xs font-medium text-primary hover:underline max-md:flex max-md:h-11 max-md:items-center"
          onClick={() => onChange(null, "")}
        >
          {t("companyChange")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("companySearchPlaceholder")}
          className="pl-8"
        />
      </div>
      <ul className="max-h-36 divide-y overflow-y-auto rounded-md border">
        {canCreate && (
          <li>
            <button
              type="button"
              onClick={create}
              disabled={creating}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted/60 disabled:opacity-60 max-md:min-h-11"
            >
              <Plus className="size-4 shrink-0" />
              <span className="truncate">{t("companyCreate", { name: typed })}</span>
            </button>
          </li>
        )}
        {optionsQuery.isPending ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">
            {t("companyLoading")}
          </li>
        ) : options.length === 0 ? (
          !canCreate && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              {t("companyEmpty")}
            </li>
          )
        ) : (
          options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onChange(o.id, o.name)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 max-md:min-h-11"
              >
                <span className="truncate">{o.name}</span>
                {o.email_domain && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    @{o.email_domain}
                  </span>
                )}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

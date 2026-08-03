"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { defaultLocale, isLocale } from "./config";

const ONE_YEAR_S = 60 * 60 * 24 * 365;

/** Đổi ngôn ngữ: set cookie `locale` + revalidate toàn bộ layout. */
export async function setLocale(locale: string) {
  const next = isLocale(locale) ? locale : defaultLocale;
  const store = await cookies();
  store.set("locale", next, {
    path: "/",
    maxAge: ONE_YEAR_S,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

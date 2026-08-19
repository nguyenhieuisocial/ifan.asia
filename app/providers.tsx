"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "@/components/ui/sonner";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
  });
}

// Server: client mới mỗi request (chống rò dữ liệu giữa users).
// Browser: singleton (giữ cache qua các lần render).
let browserQueryClient: QueryClient | undefined;
function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  return (browserQueryClient ??= makeQueryClient());
}

/** `nonce`: vé CSP của lượt tải, lấy ở khung gốc và truyền thẳng cho
 *  next-themes — script chống-loé-sáng của nó cần vé mới được chạy. */
export function Providers({
  children,
  nonce,
}: {
  children: React.ReactNode;
  nonce?: string;
}) {
  const queryClient = getQueryClient();
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
      <NuqsAdapter>
        <QueryClientProvider client={queryClient}>
          {children}
          <Toaster richColors position="top-center" />
        </QueryClientProvider>
      </NuqsAdapter>
    </ThemeProvider>
  );
}

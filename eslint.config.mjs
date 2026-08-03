import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // ADR-0001 #9: danh sách thư viện CẤM — giữ codebase thống nhất cho AI dev
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [],
          patterns: [
            "@prisma/*", "prisma", "drizzle-orm", "drizzle-orm/*", "kysely",
            "axios", "ky", "moment", "dayjs", "luxon",
            "formik", "yup",
            "@mui/*", "antd", "antd/*", "@chakra-ui/*",
            "@reduxjs/*", "redux", "zustand",
            "socket.io-client", "pusher-js",
            "html5-qrcode", "@zxing/*",
            "styled-components", "@emotion/*",
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // File máy móc do GitNexus sinh ra
    ".gitnexus/**",
  ]),
]);

export default eslintConfig;

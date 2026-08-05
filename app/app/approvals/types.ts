/** Kiểu dữ liệu + hằng dùng chung màn "Duyệt & yêu cầu" (server + client). */

import type { FormField } from "../settings/forms/types";

/** Số phiếu mỗi lượt tải của cả 3 tab. */
export const APPROVALS_PAGE_SIZE = 50;

/** Một phiếu duyệt được giao cho tôi (đang chờ hoặc tôi đã xử lý). */
export type TicketRow = {
  id: string;
  title: string;
  body: string | null;
  level: number;
  totalLevels: number;
  status: string;
  createdAt: string;
  decisionNote: string | null;
  myDecision: string;
  myDecidedAt: string | null;
  myNote: string | null;
  sourceName: string | null;
  fromWorkflow: boolean;
  submitterName: string | null;
  fields: FormField[];
  data: Record<string, unknown>;
};

/** Một yêu cầu do chính tôi gửi đi. */
export type MyRequestRow = {
  id: string;
  formName: string;
  createdAt: string;
  status: string;
  level: number | null;
  totalLevels: number | null;
  decisionNote: string | null;
  deciderName: string | null;
  fields: FormField[];
  data: Record<string, unknown>;
};

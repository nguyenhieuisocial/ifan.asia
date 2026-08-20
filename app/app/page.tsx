import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowRight,
  BadgePercent,
  Banknote,
  Check,
  Clock,
  Flame,
  Handshake,
  MessageCircle,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { seedLabel } from "@/lib/seed-i18n";
import { formatDate, formatMoney, formatRelative } from "@/lib/format";
import { formatVN } from "@/lib/datetime";
import type { Locale, Translator } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { CHANNEL_LABELS } from "./inbox/types";
import { ScoreBadge } from "./contacts/score-badge";
import { IndustrySetupCard } from "./industry-setup-card";
import {
  DEFAULT_RANGE,
  RANGE_PRESETS,
  fetchDashboardSales,
  isRangePreset,
  renderInstant,
  revenueDayCount,
  trendOf,
  vnDaysOf,
  vnRange,
  winRate,
  type DashboardSales,
  type RangePreset,
} from "./dashboard-range";
import {
  Panel,
  RevenueChart,
  SourcePanel,
  StaffPanel,
  TrendLine,
} from "./dashboard-panels";
import { AutoRefresh } from "./dashboard-auto-refresh";
import type { SourceReportRow } from "./reports/sources/types";

export const dynamic = "force-dynamic";

/**
 * Màn Tổng quan — MỘT màn hình cho chủ tiệm (GĐ2 "Báo cáo đợt 1 lõi"):
 *   tiền kỳ này SO kỳ trước · KPI CRM · doanh thu theo ngày · nguồn nào ra tiền
 *   · hiệu suất nhân viên · việc cần làm ngay · bản tin tuần.
 *
 * Số liệu lấy trong 3 lượt gọi song song, tất cả SECURITY INVOKER nên RLS tự lo
 * phân quyền, không cần tầng web lọc. LƯU Ý phạm vi KHÁC NHAU giữa hai hàng đầu:
 *   - TIỀN (deals/contacts, RLS "Pattern B") → nhân viên thường chỉ ra số của mình.
 *   - HỘI THOẠI (conversations, RLS tenant-scope) → LUÔN là số của CẢ TIỆM, kể cả
 *     với nhân viên thường. Đây là CHỦ Ý: spec Inbox §4.2 cho mọi vai trò tab
 *     "Chưa gán / Tất cả" và §5 chốt RLS conversations chỉ theo tenant — hộp thư
 *     dùng chung để không ai bỏ sót khách. Vì hai phạm vi khác nhau lại đứng cạnh
 *     nhau, hai ô hội thoại PHẢI tự ghi rõ "cả tiệm" cho nhân viên thường, nếu
 *     không họ đọc nhầm thành số của riêng mình. Luật này áp cho MỌI khối lấy
 *     dữ liệu cả tiệm — kể cả danh sách "Hội thoại chờ trả lời" ở hàng dưới,
 *     vốn đứng ngay cạnh "Khách nóng cần chăm lại" (contacts = số của riêng
 *     nhân viên).
 *   dashboard_overview()      — migration #11, sửa ở #30 (ô "Khách mới 7 ngày"
 *                               đổi sang NGÀY LỊCH GIỜ VN để khớp tuyệt đối với
 *                               ô "Khách mới" khi lọc 7 ngày; tên khách trong
 *                               "Hội thoại chờ trả lời" hết hiện mã kỹ thuật)
 *   dashboard_sales()         — migration #21 (tiền, so kỳ trước, nhân viên)
 *   source_revenue_report()   — migration #16 (nguồn — DÙNG LẠI đúng RPC của màn
 *                               "Nguồn nào ra tiền" để hai màn không lệch số)
 *
 * Bộ lọc thời gian nằm trên URL (?r=) — chia sẻ được, và dùng chung mốc giờ VN
 * với báo cáo nguồn (vnRange).
 */

type DigestPayload = {
  conversations_total: number;
  messages_in: number;
  messages_out: number;
  new_contacts: number;
  hot_contacts: number;
  unanswered_end_of_week: number;
};

type Overview = {
  open_conversations: number;
  unanswered: number;
  new_contacts_7d: number;
  hot_contacts: number;
  channels_count: number;
  contacts_count: number;
  need_reply: {
    id: string;
    name: string | null;
    channel_type: string;
    channel_name: string | null;
    waiting_since: string;
  }[];
  hot_followup: {
    id: string;
    full_name: string;
    lead_score: number;
    last_interaction_at: string | null;
  }[];
  digest: {
    week_start: string;
    payload: DigestPayload;
    created_at: string;
  } | null;
};

const DAY_MS = 86_400_000;
const MANAGER_ROLES = ["owner", "admin", "manager"];

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string | string[] }>;
}) {
  const sp = await searchParams; // Next 16: searchParams phải await
  const rParam = typeof sp.r === "string" ? sp.r : "";
  const range: RangePreset = isRangePreset(rParam) ? rParam : DEFAULT_RANGE;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, industry")
    .maybeSingle();
  if (!tenant) redirect("/onboarding");

  const me = await getCurrentMembership(supabase, user.id);
  const isManager = MANAGER_ROLES.includes(me?.role ?? "");

  // Card "Chọn ngành" (Tiệm mẫu, migration #12): chỉ khi tenant CHƯA chọn
  // ngành và user là owner/admin — staff không có quyền seed.
  const showIndustrySetup =
    tenant.industry === null && (me?.role === "owner" || me?.role === "admin");

  const now = renderInstant();
  const { from, to } = vnRange(range, now);
  const [
    locale,
    t,
    tOv,
    tTime,
    tSeed,
    rpcRes,
    salesRes,
    sourceRes,
    sourceNames,
    liveChannelsRes,
  ] = await Promise.all([
    getLocale() as Promise<Locale>,
    getTranslations("dashboard"),
    getTranslations("overview"),
    getTranslations("time"),
    getTranslations("seed"),
    supabase.rpc("dashboard_overview"),
    fetchDashboardSales(supabase, range, now),
    supabase.rpc("source_revenue_report", { p_from: from, p_to: to }),
    supabase.from("lead_sources").select("id, name, i18n_key"),
    // Kênh CHẠY THẬT — không phải mọi dòng channels: kênh Live Chat sinh ra chỉ
    // bằng một cú bấm Lưu trong Cài đặt, chưa chứng minh được gì (mã có thể chưa
    // dán lên website); nó chỉ tính khi đã có tin thật từ website (last_event_at,
    // migration #23/#55). Các kênh khác (Zalo OA…) phải bắt tay OAuth thật mới
    // 'active' nên tính ngay khi đang bật.
    supabase
      .from("channels")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .or("type.neq.livechat,last_event_at.not.is.null"),
  ]);
  if (rpcRes.error) throw new Error(rpcRes.error.message);
  if (sourceRes.error) throw new Error(sourceRes.error.message);
  const ov = rpcRes.data as Overview;
  const sales = salesRes as DashboardSales;
  // Tên nguồn CÀI SẴN dịch được (migration #36). RPC báo cáo trả tên đã lưu nên
  // tra lại theo id — cùng cách màn Mã QR làm, không đụng hợp đồng của RPC.
  const seedSourceName = new Map(
    (sourceNames.data ?? []).map((s) => [
      s.id as string,
      seedLabel(s.i18n_key as string | null, s.name as string, tSeed),
    ]),
  );
  const sources = ((sourceRes.data ?? []) as SourceReportRow[]).map((r) => ({
    ...r,
    source_name: r.source_id
      ? (seedSourceName.get(r.source_id) ?? r.source_name)
      : r.source_name,
  }));

  // Tenant mới toanh (chưa kênh CHẠY THẬT, chưa khách) → hướng dẫn ấm thay 2
  // danh sách. Không dùng ov.channels_count (đếm mọi dòng channels): một dòng
  // Live Chat mới bấm Lưu chưa phải là kênh đang chạy — xem query ở trên.
  const isBrandNew = (liveChannelsRes.count ?? 0) === 0 && ov.contacts_count === 0;

  // Gói kích hoạt người mới: tick checklist tính từ DỮ LIỆU THẬT, không lưu cờ
  // riêng. Hai câu đếm chỉ chạy cho tiệm mới toanh — tiệm đang chạy không tốn
  // thêm round-trip nào.
  //   (1) hộp chat web ĐANG CHẠY: đúng định nghĩa "kênh chạy thật" phía trên —
  //       livechat active + đã có tin thật từ website (last_event_at, #23/#55).
  //   (2) có khách đầu tiên: contacts đếm thẳng — bộ tiệm mẫu theo ngành (#12)
  //       chỉ seed thẻ + câu trả lời nhanh, KHÔNG tạo khách, nên không phải
  //       trừ hao dòng seed nào.
  //   (3) mời nhân viên: tenant_members > 1 (policy members_select cho mọi
  //       member đọc cả tiệm, migration #1).
  let checklist = { livechat: false, contact: false, invite: false };
  if (isBrandNew) {
    const [livechatRes, membersRes] = await Promise.all([
      supabase
        .from("channels")
        .select("id", { count: "exact", head: true })
        .eq("type", "livechat")
        .eq("status", "active")
        .not("last_event_at", "is", null),
      supabase
        .from("tenant_members")
        .select("user_id", { count: "exact", head: true }),
    ]);
    checklist = {
      livechat: (livechatRes.count ?? 0) > 0,
      contact: ov.contacts_count > 0,
      invite: (membersRes.count ?? 0) > 1,
    };
  }

  const rateNow = winRate(sales.deals_won.current, sales.deals_lost.current);
  const ratePrev = winRate(sales.deals_won.previous, sales.deals_lost.previous);
  const chartDays = vnDaysOf(range, now);
  const showChart = revenueDayCount(chartDays, sales.daily) >= 2;

  // Hai ô hội thoại luôn đếm cả tiệm. Chủ/quản lý vốn xem mọi thứ ở phạm vi cả
  // tiệm nên không cần nhắc; nhân viên thường thì hàng tiền phía trên là số của
  // riêng họ, nên phải nói rõ hai ô này khác phạm vi.
  const sharedInboxNote = isManager ? undefined : (
    <p className="mt-1 text-xs text-muted-foreground">{t("tiles.wholeShop")}</p>
  );

  // Bản tin tuần cũng đếm CẢ TIỆM (nguồn: metric_daily gộp theo tenant). Nhân
  // viên thường thấy "Khách nóng" ở đây khác con số "Khách nóng" của riêng họ
  // phía trên — không ghi phạm vi thì hai số cùng tên hóa ra mâu thuẫn.
  const digestScopeNote = isManager ? undefined : (
    <span className="text-xs text-muted-foreground">{t("digest.wholeShop")}</span>
  );

  // Cùng lý do, cho DANH SÁCH "Hội thoại chờ trả lời": nó lấy cả tiệm, mà ô
  // ngay bên cạnh ("Khách nóng cần chăm lại") lại chỉ là khách của riêng nhân
  // viên (contacts theo Pattern B). Hai phạm vi khác nhau đứng cạnh nhau thì
  // cái rộng hơn phải tự khai, nếu không nhân viên đọc nhầm thành việc của mình.
  const needReplyScopeNote = isManager ? undefined : (
    <p className="mt-0.5 text-xs text-muted-foreground">{t("needReply.wholeShop")}</p>
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <AutoRefresh seconds={60} />
      {/* Tới hết lg vẫn khoá 1024px cho quen mắt — điện thoại không đổi gì. Chỉ
          từ xl mới nới: trên màn 1440px lưới ô số và hai biểu đồ bỏ trống gần
          nửa bề ngang bên phải, nhìn như trang chưa dựng xong. */}
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 xl:max-w-7xl 2xl:max-w-[1600px]">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <nav
              aria-label={tOv("range.label")}
              className="flex flex-wrap items-center gap-1"
            >
              {RANGE_PRESETS.map((p) => (
                <Link
                  key={p}
                  href={p === DEFAULT_RANGE ? "/app" : `/app?r=${p}`}
                  aria-current={range === p ? "page" : undefined}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                    range === p
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.04]",
                  )}
                >
                  {tOv(`range.${p}`)}
                </Link>
              ))}
            </nav>
          </div>
          <p className="text-[13px] text-muted-foreground">
            {tOv(`compare.${range}`)} ·{" "}
            {tOv("updatedAt", { time: formatVN(now, "HH:mm") })}
          </p>
        </header>

        {showIndustrySetup && <IndustrySetupCard />}

        {/* ---------- Hàng 1: TIỀN, có so kỳ trước ----------
            Có tiêu đề nhóm như mọi khối khác trên màn: 8 ô số trơ trọi không
            nhóm thì mắt đọc thành một mảng 8 con số ngang hàng nhau, trong khi
            4 ô đầu là TIỀN TRONG KỲ (so kỳ trước) còn 4 ô sau là TÌNH TRẠNG
            NGAY LÚC NÀY — hai loại khác hẳn, không so với nhau được. */}
        <section className="space-y-3">
          <h2 className="text-[13px] font-medium text-muted-foreground">
            {t("sections.money")}
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            label={tOv("money.revenue")}
            value={formatMoney(Number(sales.revenue.current), locale)}
            icon={Banknote}
            trend={<TrendLine trend={trendOf(sales.revenue)} t={tOv} />}
          />
          <StatTile
            label={tOv("money.wonDeals")}
            value={String(Number(sales.deals_won.current))}
            icon={Handshake}
            trend={<TrendLine trend={trendOf(sales.deals_won)} t={tOv} />}
          />
          <StatTile
            label={tOv("money.winRate")}
            value={rateNow === null ? "—" : `${rateNow}%`}
            icon={BadgePercent}
            trend={
              <p className="mt-1 text-xs text-muted-foreground">
                {/* Nói thẳng MẪU SỐ: "100%" trơ trọi làm chủ tiệm hiểu nhầm sang
                    "cứ 100 khách thì chốt 100". Đây là thắng/(thắng+thua) của các
                    cơ hội ĐÃ ĐÓNG trong kỳ — khác hẳn cột cùng tên cũ ở Báo cáo
                    nguồn (nay đổi thành "Tỉ lệ khách thành đơn"). */}
                {rateNow !== null &&
                  `${tOv("money.rateBasis", {
                    won: Number(sales.deals_won.current),
                    closed:
                      Number(sales.deals_won.current) +
                      Number(sales.deals_lost.current),
                  })} · `}
                {ratePrev === null
                  ? tOv("money.prevRateNone")
                  : tOv("money.prevRate", { rate: ratePrev })}
              </p>
            }
          />
          <StatTile
            label={tOv("money.newContacts")}
            value={String(Number(sales.new_contacts.current))}
            icon={UserPlus}
            trend={<TrendLine trend={trendOf(sales.new_contacts)} t={tOv} />}
          />
          </div>
        </section>

        {/* ---------- Hàng 2: KPI hội thoại/khách (RPC #11 giữ nguyên) ---------- */}
        <section className="space-y-3">
          <h2 className="text-[13px] font-medium text-muted-foreground">
            {t("sections.pulse")}
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            label={t("tiles.open")}
            value={String(ov.open_conversations)}
            icon={MessageCircle}
            href="/app/inbox?filter=open"
            trend={sharedInboxNote}
          />
          <StatTile
            label={t("tiles.unanswered")}
            value={String(ov.unanswered)}
            icon={Clock}
            valueClass={ov.unanswered > 0 ? "text-destructive" : undefined}
            href="/app/inbox?filter=unanswered"
            trend={sharedInboxNote}
          />
          <StatTile
            label={t("tiles.new7d")}
            value={String(ov.new_contacts_7d)}
            icon={UserPlus}
            // Danh sách Khách hàng mặc định sắp theo ngày tạo mới nhất → chính
            // các khách được ô này đếm nằm ngay đầu danh sách.
            href="/app/contacts"
          />
          <StatTile
            label={t("tiles.hot")}
            value={String(ov.hot_contacts)}
            icon={Flame}
            // Ô đếm khách lead_score ≥ 70 (band Nóng) trong TẤT CẢ khách mình
            // thấy — /app/today chỉ liệt kê khách nóng bị bỏ bẵng ≥ 3 ngày (tập
            // con), nên đích đúng nghĩa là danh sách Khách hàng sắp theo điểm:
            // khách nóng dồn hết lên đầu.
            href="/app/contacts?sort=score"
            // Cùng màu band Nóng với score-badge (SCORE_BADGE.hot)
            iconClass="text-destructive"
          />
          </div>
        </section>

        {/* ---------- Hàng 3: doanh thu theo ngày + nguồn ---------- */}
        {/* Không đủ ngày có tiền để vẽ biểu đồ → nguồn chiếm trọn hàng, không
            để lại ô trống vô nghĩa. */}
        <section className={cn("grid gap-4", showChart && "md:grid-cols-2")}>
          <RevenueChart days={chartDays} daily={sales.daily} locale={locale} t={tOv} />
          <SourcePanel
            rows={sources}
            range={range}
            canOpenReport={isManager}
            locale={locale}
            t={tOv}
          />
        </section>

        {/* ---------- Hàng 4: hiệu suất nhân viên + tiền đang thương lượng ---------- */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <StaffPanel
              rows={sales.staff}
              selfOnly={!isManager}
              locale={locale}
              t={tOv}
            />
          </div>
          <Panel title={tOv("pipeline.title")} caption={tOv("pipeline.caption")}>
            <p className="text-xl font-semibold tabular-nums">
              {formatMoney(Number(sales.open_deals.value), locale)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {tOv("pipeline.count", { count: Number(sales.open_deals.count) })}
            </p>
            <Link
              href="/app/deals"
              className="group mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {tOv("pipeline.open")}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Panel>
        </section>

        {isBrandNew ? (
          <GettingStarted
            t={t}
            seeded={tenant.industry !== null}
            checklist={checklist}
          />
        ) : (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">{t("needAction.title")}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <ListCard title={t("needReply.title")} note={needReplyScopeNote}>
                {ov.need_reply.length === 0 ? (
                  <EmptyLine text={t("needReply.empty")} />
                ) : (
                  ov.need_reply.map((r) => (
                    <Link
                      key={r.id}
                      href={`/app/inbox?c=${r.id}`}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-foreground/[0.04]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">
                          {r.name ?? t("lists.guest")}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {CHANNEL_LABELS[r.channel_type] ?? r.channel_type}
                          {r.channel_name ? ` · ${r.channel_name}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatRelative(r.waiting_since, locale, tTime)}
                      </span>
                    </Link>
                  ))
                )}
              </ListCard>
              <ListCard title={t("hotList.title")}>
                {ov.hot_followup.length === 0 ? (
                  <EmptyLine text={t("hotList.empty")} />
                ) : (
                  ov.hot_followup.map((c) => (
                    <Link
                      key={c.id}
                      href={`/app/contacts/${c.id}`}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-foreground/[0.04]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">
                          {c.full_name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.last_interaction_at
                            ? t("hotList.lastTouch", {
                                time: formatRelative(
                                  c.last_interaction_at,
                                  locale,
                                  tTime,
                                ),
                              })
                            : t("hotList.neverTouched")}
                        </p>
                      </div>
                      <ScoreBadge score={c.lead_score} className="shrink-0" />
                    </Link>
                  ))
                )}
              </ListCard>
            </div>
          </section>
        )}

        <DigestCard
          t={t}
          locale={locale}
          digest={ov.digest}
          scopeNote={digestScopeNote}
        />
      </div>
    </div>
  );
}

/**
 * `href` — ô số liệu dẫn tới chỗ LÀM việc đó.
 *
 * Ô "Chưa trả lời" tô đỏ để báo gấp, mà bấm vào không đi đâu cả: nói với chủ
 * tiệm "có 4 khách đang chờ" rồi bỏ mặc họ tự đi tìm. Ô nào có chỗ để đi thì
 * phải đi được.
 */
function StatTile({
  label,
  value,
  icon: Icon,
  iconClass,
  valueClass,
  trend,
  href,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  iconClass?: string;
  valueClass?: string;
  trend?: React.ReactNode;
  href?: string;
}) {
  const box = (
    <div
      className={cn(
        "h-full rounded-lg border bg-card p-4",
        href && "transition-colors hover:border-primary/40 hover:bg-accent",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-[13px] font-medium text-muted-foreground">
          {label}
        </p>
        <Icon className={cn("size-4 shrink-0 text-muted-foreground", iconClass)} />
      </div>
      <p
        className={cn(
          "mt-2 text-xl font-semibold tabular-nums break-words",
          valueClass,
        )}
      >
        {value}
      </p>
      {trend}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
      {box}
    </Link>
  ) : (
    box
  );
}

function ListCard({
  title,
  note,
  children,
}: {
  title: string;
  /** Dòng ghi rõ phạm vi số liệu khi tiêu đề chưa nói hết (xem sharedInboxNote). */
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-[13px] font-medium text-muted-foreground">{title}</h3>
      {note}
      <div className="mt-2 flex flex-col">{children}</div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="py-2 text-[13px] text-muted-foreground">{text}</p>;
}

/**
 * Gói kích hoạt người mới: checklist 3 bước, mỗi bước giữ dòng "Được gì:"
 * (mẫu Phụ lục C luật thiết kế). Tick KHÔNG lưu cờ riêng — tính từ dữ liệu
 * thật ở OverviewPage. Trong màn isBrandNew hai bước đầu đương nhiên chưa
 * tick (có kênh chạy thật hoặc có khách là thoát isBrandNew, màn tự sống dậy
 * với số liệu thật) — checklist ở đây để chỉ ĐƯỜNG ĐI và ghi nhận bước mời
 * nhân viên nếu chủ tiệm làm bước đó trước.
 */
function GettingStarted({
  t,
  seeded,
  checklist,
}: {
  t: Translator;
  /** Tenant đã chọn ngành → giới thiệu bộ tiệm mẫu đã seed (thẻ + câu trả lời nhanh, #12). */
  seeded: boolean;
  checklist: { livechat: boolean; contact: boolean; invite: boolean };
}) {
  const steps = [
    {
      done: checklist.livechat,
      href: "/app/settings/channels/livechat",
      title: t("empty.connectTitle"),
      benefit: t("empty.connectBenefit"),
    },
    {
      done: checklist.contact,
      href: "/app/contacts",
      title: t("empty.addContactTitle"),
      benefit: t("empty.addContactBenefit"),
    },
    {
      done: checklist.invite,
      href: "/app/settings/team",
      title: t("empty.inviteTitle"),
      benefit: t("empty.inviteBenefit"),
    },
  ];
  return (
    <section className="rounded-lg border bg-card p-6">
      <h2 className="text-sm font-semibold">{t("empty.title")}</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {t("empty.description")}
      </p>
      <ol className="mt-4 space-y-3">
        {steps.map((step, i) => (
          <ChecklistStep
            key={step.href}
            index={i + 1}
            doneLabel={t("empty.stepDone")}
            {...step}
          />
        ))}
      </ol>
      {seeded && (
        <p className="mt-4 text-xs text-muted-foreground">{t("empty.seedIntro")}</p>
      )}
    </section>
  );
}

/** Một bước checklist: vòng số thứ tự → tick xanh khi dữ liệu thật xác nhận đã xong. */
function ChecklistStep({
  index,
  done,
  href,
  title,
  benefit,
  doneLabel,
}: {
  index: number;
  done: boolean;
  href: string;
  title: string;
  benefit: string;
  /** Chữ cho screen reader — riêng dấu tick xanh không tự đọc được. */
  doneLabel: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex items-start gap-3 rounded-lg border p-4 transition-colors hover:border-primary/40 hover:bg-primary-tint"
      >
        <span
          className={cn(
            "mt-px flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            done
              ? "bg-status-closed text-status-closed-foreground"
              : "border text-muted-foreground",
          )}
        >
          {done ? <Check className="size-3.5" aria-hidden /> : index}
          {done && <span className="sr-only">{doneLabel}</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            <span className="min-w-0">{title}</span>
            <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">{benefit}</span>
        </span>
      </Link>
    </li>
  );
}

function DigestCard({
  t,
  locale,
  digest,
  scopeNote,
}: {
  t: Translator;
  locale: Locale;
  digest: Overview["digest"];
  /** Nhãn phạm vi cho nhân viên thường — bản tin luôn là số CẢ TIỆM. */
  scopeNote?: React.ReactNode;
}) {
  const items: { key: string; value: number }[] | null = digest
    ? [
        { key: "conversations", value: digest.payload.conversations_total },
        { key: "messagesIn", value: digest.payload.messages_in },
        { key: "messagesOut", value: digest.payload.messages_out },
        { key: "newContacts", value: digest.payload.new_contacts },
        { key: "hotContacts", value: digest.payload.hot_contacts },
        { key: "unanswered", value: digest.payload.unanswered_end_of_week },
      ]
    : null;
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 className="text-sm font-semibold">{t("digest.title")}</h2>
          {scopeNote}
        </div>
        {digest ? (
          <span className="text-xs text-muted-foreground">
            {t("digest.week", {
              from: formatDate(digest.week_start, locale),
              to: formatDate(
                new Date(digest.week_start).getTime() + 6 * DAY_MS,
                locale,
              ),
            })}
          </span>
        ) : null}
      </div>
      {items ? (
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {items.map(({ key, value }) => (
            <div key={key}>
              <dt className="text-xs text-muted-foreground">
                {t(`digest.${key}`)}
              </dt>
              <dd className="mt-0.5 text-base font-semibold tabular-nums">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <EmptyLine text={t("digest.empty")} />
      )}
      {/* Nhắc nhẹ: lớp nhận xét AI của bản tin sẽ bật sau, không chặn đợt 0 */}
      <p className="mt-3 text-xs text-muted-foreground/70">{t("digest.aiSoon")}</p>
    </section>
  );
}

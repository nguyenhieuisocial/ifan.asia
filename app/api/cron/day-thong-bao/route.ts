import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { bangNhauHangThoiGian } from "@/lib/security/so-sanh-bi-mat";
import { SITE_URL, SUPABASE_URL } from "@/lib/config";
import { guiMotDay } from "@/lib/push/gui";
import { coKhoaBiMat } from "@/lib/push/khoa";
import { guiEmail } from "@/lib/email/gui";

/**
 * NHỊP ĐẨY THÔNG BÁO lên điện thoại.
 *
 * `pg_net` bị khoá từ #36 nên cơ sở dữ liệu KHÔNG tự gọi HTTP được — mọi việc
 * nền đều cần một nhịp từ bên ngoài kéo. Cùng khuôn với `/api/cron/nhac-lich`.
 *
 * ┌─ HAI LỚP CHẶN "DỘI THÔNG BÁO CŨ" ─────────────────────────────────
 * Đây là lỗi KHÔNG ĐƯỢC PHÉP xảy ra dù chỉ một lần: người dùng nhận hàng trăm
 * thông báo trong vài phút thì việc đầu tiên họ làm là tắt thông báo của ứng
 * dụng, vĩnh viễn. Nên có hai lớp, độc lập nhau:
 *
 *   1. cột `pushed_at` — dòng nào đẩy rồi thì thôi (migration #315), và toàn
 *      bộ 1.786 dòng cũ đã được đánh dấu sẵn (#316);
 *   2. CỬA SỔ THỜI GIAN — chỉ nhặt dòng sinh ra trong vòng `CUA_SO_PHUT`.
 *      Lớp này là để phòng đúng một tình huống: nhịp chết vài ngày rồi sống
 *      lại. Lúc đó cột `pushed_at` của cả đống dòng vẫn NULL và lớp 1 không
 *      cứu được gì.
 *
 * ┌─ ĐÁNH DẤU ĐÃ ĐẨY DÙ GỬI HỎNG ─────────────────────────────────────
 * Đẩy thông báo là việc CỐ GẮNG HẾT SỨC, không phải việc bảo đảm. Mạng chập
 * hay dịch vụ đẩy quá tải thì bỏ qua lượt đó — bản ghi bền vững vẫn nằm trong
 * chuông của ứng dụng. Thử lại mãi thì một sự cố của Google/Apple sẽ biến
 * thành một cơn mưa thông báo trùng lúc họ hồi phục.
 */

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** Mỗi lượt xử tối đa ngần này thông báo. Nhịp 1 phút/lần nên thừa sức. */
const MOI_LUOT = 200;
/** Chỉ đẩy thông báo sinh ra trong vòng ngần này phút. Xem "hai lớp chặn". */
const CUA_SO_PHUT = 60;
/** Trần email mỗi người mỗi lượt — xem ghi chú ở `guiEmailChoThongBao`. */
const TRAN_EMAIL_MOI_NGUOI = 5;

type HangBao = {
  id: string;
  user_id: string;
  title: string | null;
  body: string | null;
  link: string | null;
  type: string | null;
};

type HangDangKy = {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  fail_count: number;
};

async function handle(req: Request): Promise<Response> {
  try {
    const key = process.env.BOT_INGEST_KEY;
    if (!key) return new Response(null, { status: 204 });
    if (!coKhoaBiMat()) {
      // Chưa khai khoá đẩy — đứng yên, KHÔNG lỗi. Màn cài đặt đã nói rõ với
      // người dùng là tính năng chưa bật được, nên ở đây không cần rải log.
      return new Response(null, { status: 204 });
    }

    const { allowed } = await rateLimit(`day-bao:ip:${clientIpFrom(req.headers)}`, 120, 60);
    if (!allowed) return new Response(null, { status: 429 });

    const gui = req.headers.get("authorization") ?? "";
    const mong = `Bearer ${key}`;
    if (!bangNhauHangThoiGian(gui, mong)) return new Response(null, { status: 204 });

    const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
      auth: { persistSession: false },
    });

    const tuLuc = new Date(Date.now() - CUA_SO_PHUT * 60_000).toISOString();

    // ── EMAIL: một lượt quét riêng, cột riêng ────────────────────────
    // Hai đường gửi ĐỘC LẬP: đẩy hỏng thì email vẫn phải đi, và ngược lại.
    // Dùng chung một cột "đã gửi" nghĩa là hỏng một đường thì mất luôn đường
    // kia — và không ai nhìn ra vì con số vẫn chạy.
    const soEmail = await guiEmailChoThongBao(db, tuLuc);

    const { data: baoRaw, error: loiBao } = await db
      .from("notifications")
      .select("id, user_id, title, body, link, type")
      .is("pushed_at", null)
      .gte("created_at", tuLuc)
      .order("created_at", { ascending: true })
      .limit(MOI_LUOT);
    if (loiBao) return Response.json({ error: loiBao.message }, { status: 500 });

    const bao = (baoRaw ?? []) as HangBao[];
    if (bao.length === 0) {
      return Response.json({ da_day: 0, bo_thiet_bi: 0, da_email: soEmail });
    }

    // Một người có thể có nhiều thiết bị; lấy đủ trong MỘT lượt đọc.
    const nguoi = [...new Set(bao.map((b) => b.user_id))];
    const { data: dkRaw } = await db
      .from("push_subscriptions")
      .select("endpoint, user_id, p256dh, auth, fail_count")
      .in("user_id", nguoi);
    const dk = (dkRaw ?? []) as HangDangKy[];

    /**
     * Số việc CHƯA ĐỌC của từng người — để đặt huy hiệu trên biểu tượng app.
     *
     * ⚠️ Đếm TRONG cơ sở dữ liệu bằng `head + count`, không kéo dòng về. Bảng
     *   `notifications` đã gần hai nghìn dòng và chỉ lớn thêm.
     */
    const demChuaDoc = new Map<string, number>();
    await Promise.all(
      nguoi.map(async (u) => {
        const { count } = await db
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", u)
          .is("read_at", null);
        demChuaDoc.set(u, count ?? 0);
      }),
    );

    const theoNguoi = new Map<string, HangDangKy[]>();
    for (const d of dk) {
      const ds = theoNguoi.get(d.user_id) ?? [];
      ds.push(d);
      theoNguoi.set(d.user_id, ds);
    }

    const canXoa: string[] = [];
    let daDay = 0;

    for (const b of bao) {
      const thietBi = theoNguoi.get(b.user_id) ?? [];
      for (const tb of thietBi) {
        const kq = await guiMotDay(
          { endpoint: tb.endpoint, p256dh: tb.p256dh, auth: tb.auth },
          {
            title: b.title ?? "iFan",
            body: (b.body ?? "").slice(0, 200),
            link: b.link ?? "/app/today",
            // Gom theo ĐƯỜNG DẪN: mười tin trong một kênh cùng trỏ về một chỗ
            // ⇒ một dòng thông báo, không phải mười.
            nhom: b.link ?? b.type ?? undefined,
            soChuaDoc: demChuaDoc.get(b.user_id),
          },
        );
        if (kq === "ok") daDay++;
        // 404/410 = thiết bị không còn. Giữ lại thì mỗi nhịp lại gửi hỏng
        // thêm một lần, mãi mãi.
        else if (kq === "bo") canXoa.push(tb.endpoint);
      }
    }

    // Đánh dấu đã đẩy CHO MỌI DÒNG vừa xét, kể cả dòng không có thiết bị nào
    // và dòng gửi hỏng — xem "đánh dấu đã đẩy dù gửi hỏng" ở đầu file.
    //
    // ⚠️ PHẢI ĐẾM SỐ DÒNG THẬT SỰ ĐÁNH DẤU ĐƯỢC. Không đếm mà lệnh này hụt thì
    //   lượt sau nhặt lại đúng những dòng đó và đẩy LẦN HAI — người dùng nhận
    //   thông báo trùng, và cứ mỗi phút lại thêm một lần. Đúng lớp lỗi mà cả
    //   tính năng này sinh ra để tránh.
    const { data: daDanhDau, error: loiDanhDau } = await db
      .from("notifications")
      .update({ pushed_at: new Date().toISOString() })
      .in(
        "id",
        bao.map((b) => b.id),
      )
      .select("id");
    if (loiDanhDau) return Response.json({ error: loiDanhDau.message }, { status: 500 });
    if (!daDanhDau || daDanhDau.length !== bao.length) {
      // Nói ra ngay. Im lặng ở đây nghĩa là mỗi phút một cơn thông báo trùng.
      return Response.json(
        {
          error: "danh_dau_hut",
          da_xet: bao.length,
          danh_dau_duoc: daDanhDau ? daDanhDau.length : 0,
        },
        { status: 500 },
      );
    }

    let boThietBi = 0;
    if (canXoa.length > 0) {
      const { data: daBo, error: loiBo } = await db
        .from("push_subscriptions")
        .delete()
        .in("endpoint", canXoa)
        .select("endpoint");
      // Xoá hụt thì KHÔNG chết cả nhịp — thiết bị chết chỉ làm tốn một lượt
      // gửi hỏng mỗi phút, không sinh thông báo sai. Nhưng phải đếm được để
      // con số trả về nói đúng sự thật.
      if (loiBo || !daBo) boThietBi = 0;
      else boThietBi = daBo.length;
    }

    return Response.json({
      da_xet: bao.length,
      da_day: daDay,
      bo_thiet_bi: boThietBi,
      da_email: soEmail,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;


/**
 * Gửi email cho những thông báo chưa gửi, của những người ĐÃ BẬT email.
 *
 * ⚠️ MẶC ĐỊNH TẮT. Ngược với thông báo đẩy (người dùng phải tự bật ở trình
 *   duyệt trước nên bật sẵn là hợp lý). Email không có bước xin phép nào —
 *   bật sẵn nghĩa là tự tiện gửi thư cho người ta.
 *
 * ⚠️ CÓ TRẦN MỖI NGƯỜI MỖI LƯỢT. Một sự cố sinh ra hàng loạt thông báo mà gửi
 *   hết thành email thì hộp thư của người ta đánh dấu iFan là thư rác —
 *   VĨNH VIỄN, và sau đó cả email đặt lại mật khẩu cũng rơi vào đó.
 *
 * ⚠️ Đánh dấu `emailed_at` CHO MỌI DÒNG đã xét, kể cả dòng của người chưa bật
 *   email và dòng gửi hỏng. Không đánh dấu thì lượt sau nhặt lại và mỗi phút
 *   một lần thử — với người chưa bật thì là quét vô ích mãi mãi.
 */
async function guiEmailChoThongBao(
  // Kiểu chung: `ReturnType<typeof createClient>` suy ra một kiểu có tham số
  // schema cụ thể và không khớp khi truyền vào — dùng `SupabaseClient` trần.
  db: SupabaseClient,
  tuLuc: string,
): Promise<number> {
  const { data: raw } = await db
    .from("notifications")
    .select("id, user_id, title, body, link")
    .is("emailed_at", null)
    .gte("created_at", tuLuc)
    .order("created_at", { ascending: true })
    .limit(MOI_LUOT);

  const ds = (raw ?? []) as {
    id: string;
    user_id: string;
    title: string | null;
    body: string | null;
    link: string | null;
  }[];
  if (ds.length === 0) return 0;

  const nguoi = [...new Set(ds.map((x) => x.user_id))];

  // Ai đã bật email
  const { data: prefRaw } = await db
    .from("notification_prefs")
    .select("user_id, pref")
    .in("user_id", nguoi);
  const daBat = new Set(
    ((prefRaw ?? []) as { user_id: string; pref: { email?: { enabled?: boolean } } }[])
      .filter((p) => p.pref?.email?.enabled === true)
      .map((p) => p.user_id),
  );

  let daGui = 0;
  if (daBat.size > 0) {
    const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emailTheoId = new Map(
      (users?.users ?? []).map((u) => [u.id, u.email ?? ""]),
    );

    const demMoiNguoi = new Map<string, number>();
    for (const b of ds) {
      if (!daBat.has(b.user_id)) continue;
      const email = emailTheoId.get(b.user_id);
      if (!email) continue;
      const daGuiChoNguoiNay = demMoiNguoi.get(b.user_id) ?? 0;
      if (daGuiChoNguoiNay >= TRAN_EMAIL_MOI_NGUOI) continue;

      const kq = await guiEmail({
        toi: email,
        tieuDe: b.title ?? "iFan",
        chu: (b.body ?? "").slice(0, 800),
        duongDan: b.link ? `${SITE_URL}${b.link}` : undefined,
      });
      if (kq === "ok") {
        daGui++;
        demMoiNguoi.set(b.user_id, daGuiChoNguoiNay + 1);
      }
      // `chuaCauHinh` thì thôi cả lượt — thử tiếp chỉ tốn thời gian.
      if (kq === "chuaCauHinh") break;
    }
  }

  // ⚠️ PHẢI ĐẾM. Đánh dấu hụt thì lượt sau nhặt lại đúng những dòng đó và gửi
  //   email LẦN HAI — mỗi phút một lần, cho tới khi hộp thư của người ta đánh
  //   dấu iFan là thư rác. Đó là hỏng không sửa lại được.
  const { data, error } = await db
    .from("notifications")
    .update({ emailed_at: new Date().toISOString() })
    .in(
      "id",
      ds.map((x) => x.id),
    )
    .select("id");
  if (error || !data || data.length !== ds.length) {
    console.error(
      "[day-thong-bao] danh dau email hut:",
      data ? data.length : 0,
      "/",
      ds.length,
      error?.message ?? "",
    );
  }

  return daGui;
}

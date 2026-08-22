#!/usr/bin/env node
/**
 * Cổng chống tái phát cho GHÉP NỐI BOT ↔ TƯ CÁCH THÀNH VIÊN (việc #199,
 * migration #212).
 *
 * LỖ ĐƯỢC ĐO THẬT TRƯỚC KHI VÁ: nhân viên ghép chat Zalo cá nhân vào tiệm bằng
 * mã 6 số (`staff_channel_links`). Khi người đó BỊ GỠ khỏi tiệm, dòng ghép nối
 * KHÔNG bị cắt — và đường bản tin (`bot_digest_run`) duyệt thẳng bảng ghép nối
 * mà KHÔNG hỏi lại "còn là người của tiệm không". Hệ quả: người đã nghỉ việc
 * vẫn nhận bản tin kinh doanh của tiệm cũ, VÔ THỜI HẠN, và không màn hình nào
 * cắt được (màn Cài đặt → Thông báo chỉ cho CHÍNH CHỦ tự gỡ — mà người đã nghỉ
 * thì không ai bắt họ bấm nút đó).
 *
 * Đây KHÁC lỗ "thẻ đăng nhập cũ còn hiệu lực 1 tiếng" (#69): đường bot KHÔNG đi
 * qua thẻ đăng nhập, nên không có gì tự hết hạn. Không vá thì nó là vĩnh viễn.
 *
 * Bộ kiểm chạy HAI LƯỢT trong CÙNG một giao dịch:
 *   LƯỢT 1 — ĐO TRƯỚC: gỡ người khỏi tiệm rồi chạy đúng đường bot dùng, ghi lại
 *            người đó có lọt vào danh sách nhận không (mong đợi: CÓ ⇒ lỗ thật).
 *   LƯỢT 2 — ĐO SAU: nạp nội dung migration #212 vào TRONG giao dịch rồi đo lại
 *            (mong đợi: bị chặn). Không áp migration lên CSDL thật — cuối cùng
 *            `rollback`.
 *
 * MỌI khẳng định đều có ĐỐI CHỨNG bằng một người CÒN LÀM VIỆC: bịt lỗ mà cắt
 * nhầm người đang làm thì tệ hơn lỗ.
 *
 * Chạy: node scripts/ghep-noi-bot-smoke.mjs   (cần SUPABASE_DB_URL)
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

// Chạy tay thì đọc .env.local; trên CI biến đã có sẵn và file đó không tồn tại.
if (!process.env.SUPABASE_DB_URL) {
  try {
    for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* không có .env.local là bình thường trên CI */
  }
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL (env hoặc .env.local).");
  process.exit(1);
}

// ── THÁO CHỐT: chứng minh ca kiểm KHÔNG RỖNG ────────────────────────────────
// Một ca xanh không phân biệt được với một ca không kiểm gì cả. Nên từng chốt
// của #212 phải THẤY ĐỎ được theo yêu cầu:
//
//   THAO_CHOT=bo-cong-ban-tin   node scripts/ghep-noi-bot-smoke.mjs
//   THAO_CHOT=bo-cong-phat-tin  node scripts/ghep-noi-bot-smoke.mjs
//   THAO_CHOT=bo-cat-ghep-noi   node scripts/ghep-noi-bot-smoke.mjs
//   THAO_CHOT=bo-cong-ghep-moi  node scripts/ghep-noi-bot-smoke.mjs
//
// Cách làm giống voucher-diem-smoke: đọc CHÍNH file migration, thay đúng một
// đoạn, nạp bản đã tháo vào trong giao dịch. Không chép thân hàm vào đây — chép
// là có ngày bản chép lệch bản thật, và khi đó phép tháo chốt chứng minh nhầm
// một hàm không ai chạy.
const THAO_CHOT = process.env.THAO_CHOT ?? "";
const FILE_MIGRATION = "20260820000212_cat_ghep_noi_bot_khi_gio_nguoi_khoi_tiem.sql";
const CHOT = {
  // Bỏ cổng thành viên ở đường BẢN TIN ⇒ người đã nghỉ lọt lại vào danh sách.
  "bo-cong-ban-tin": {
    thay: [
      [
        `    join public.tenant_members tm
      on tm.tenant_id = l.tenant_id and tm.user_id = l.user_id
     and tm.status = 'active'
    left join notification_prefs p`,
        `    left join notification_prefs p`,
      ],
    ],
  },
  // Bỏ cổng thành viên ở đường PHÁT TIN ⇒ tin đã xếp hàng trước lúc gỡ vẫn bay đi.
  "bo-cong-phat-tin": {
    thay: [
      [
        `  update public.bot_outbox o
    set status = 'failed', last_error = 'not_member'
    where o.status in ('pending', 'sending')
      and not exists (
        select 1 from public.tenant_members tm
         where tm.tenant_id = o.tenant_id and tm.user_id = o.user_id
           and tm.status = 'active'
      );`,
        `  -- (chốt đã tháo)`,
      ],
    ],
  },
  // Bỏ trigger cắt ghép nối ⇒ gỡ người xong dòng ghép nối vẫn nằm lại.
  "bo-cat-ghep-noi": {
    thay: [
      [
        `create trigger tenant_members_cat_ghep_noi_bot`,
        `create trigger tenant_members_cat_ghep_noi_bot_da_thao`,
      ],
      [
        `  after delete or update of status on public.tenant_members`,
        `  after truncate on public.tenant_members`,
      ],
      [`  for each row execute function public.cat_ghep_noi_bot();`, `  execute function public.cat_ghep_noi_bot();`],
    ],
  },
  // Bỏ cổng thành viên lúc GHÉP MỚI ⇒ mã cũ đổi được thành ghép nối mới.
  "bo-cong-ghep-moi": {
    thay: [
      [
        `  if not exists (
    select 1 from public.tenant_members tm
     where tm.tenant_id = v_row.tenant_id and tm.user_id = v_row.user_id
       and tm.status = 'active'
  ) then
    return jsonb_build_object('status', 'not_member', 'bot_token', v_token);
  end if;`,
        `  -- (chốt đã tháo)`,
      ],
    ],
  },
};

function docMigration() {
  const p = path.join(GOC, "supabase", "migrations", FILE_MIGRATION);
  let sql = readFileSync(p, "utf8");
  if (!THAO_CHOT) return sql;
  const cap = CHOT[THAO_CHOT];
  if (!cap) {
    console.error(`THAO_CHOT không hợp lệ: ${THAO_CHOT}. Chọn: ${Object.keys(CHOT).join(" · ")}`);
    process.exit(1);
  }
  for (const [tu, den] of cap.thay) {
    if (!sql.includes(tu)) {
      console.error(`THÁO CHỐT hỏng: không tìm thấy đoạn cần thay trong ${FILE_MIGRATION}.\n--- cần ---\n${tu}`);
      process.exit(1);
    }
    sql = sql.replace(tu, den);
  }
  return sql;
}

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"),
    rejectUnauthorized: true,
  },
});
await c.connect();

let n = 0;
let fail = 0;
const check = (name, cond, detail = "") => {
  n++;
  console.log(`${cond ? "  PASS" : "  FAIL"} ${n} ${name}${cond ? "" : " — " + detail}`);
  if (!cond) fail++;
};
// Lỗi trong transaction làm ABORT cả transaction ⇒ mỗi khẳng định một SAVEPOINT
// riêng, y khuôn rls-smoke / voucher-diem-smoke.
let spN = 0;
const thu = async (fn) => {
  const sp = `sp_thu_${++spN}`;
  await c.query(`savepoint ${sp}`);
  try {
    const v = await fn();
    await c.query(`release savepoint ${sp}`);
    return { ok: true, v };
  } catch (e) {
    await c.query(`rollback to savepoint ${sp}`);
    return { ok: false, e };
  }
};

const stamp = Date.now();
const uOwner = randomUUID();
const uA = randomUUID(); // CÒN làm việc — đối chứng
const uB = randomUUID(); // ĐÃ bị gỡ khỏi tiệm — người của lỗ
const chatA = `chat-a-${stamp}`;
const chatB = `chat-b-${stamp}`;

try {
  await c.query("begin");
  // Không có lock_timeout thì script treo lặng lẽ tới hết statement_timeout rồi
  // mới báo lỗi mơ hồ. Đặt ngắn để lỗi (nếu có) ra NHANH và RÕ (55P03).
  await c.query("set local lock_timeout = '10s'");

  // ── SEED (quyền postgres, bypass RLS như backend thật) ────────────────────
  await c.query(
    `insert into auth.users (id, aud, role, email) values
     ($1,'authenticated','authenticated',$2),
     ($3,'authenticated','authenticated',$4),
     ($5,'authenticated','authenticated',$6)`,
    [
      uOwner,
      `bot-o-${stamp}@t.local`,
      uA,
      `bot-a-${stamp}@t.local`,
      uB,
      `bot-b-${stamp}@t.local`,
    ],
  );
  const {
    rows: [tn],
  } = await c.query(
    `insert into public.tenants (name, slug, is_sample) values ('Bot Smoke', $1, true) returning id`,
    [`bot-smoke-${stamp}`],
  );
  await c.query(
    `insert into public.tenant_members (tenant_id, user_id, role, status) values
     ($1,$2,'owner','active'), ($1,$3,'staff','active'), ($1,$4,'staff','active')`,
    [tn.id, uOwner, uA, uB],
  );

  // Kênh bot của tiệm + token trong Vault (bot_answer/bot_claim_outbox đều đọc).
  const {
    rows: [ch],
  } = await c.query(
    `insert into public.notification_channels (tenant_id, kind, connected_at)
     values ($1,'zalo_bot', now()) returning id`,
    [tn.id],
  );
  const {
    rows: [sec],
  } = await c.query(`select vault.create_secret($1, $2) as id`, [
    `tok-${stamp}`,
    `bot:${ch.id}:token`,
  ]);
  await c.query(`update public.notification_channels set token_secret_id = $1 where id = $2`, [
    sec.id,
    ch.id,
  ]);

  // Ghép nối CẢ HAI người + bật bản tin đúng GIỜ HIỆN TẠI (giờ VN) để
  // bot_digest_run() xếp tin ngay trong lượt chạy này.
  await c.query(
    `insert into public.staff_channel_links (tenant_id, user_id, external_chat_id)
     values ($1,$2,$3), ($1,$4,$5)`,
    [tn.id, uA, chatA, uB, chatB],
  );
  await c.query(
    `insert into public.notification_prefs (tenant_id, user_id, pref)
     select $1, u, jsonb_build_object(
       'enabled', true,
       'digest_hour', extract(hour from now() at time zone 'Asia/Ho_Chi_Minh')::int,
       'kinds', jsonb_build_object('unread', true, 'today', true, 'sla', true))
     from unnest(array[$2::uuid,$3::uuid]) u`,
    [tn.id, uA, uB],
  );
  // Có thông báo CHƯA ĐỌC ⇒ bản tin có nội dung để gửi (v_has = true).
  await c.query(
    `insert into public.notifications (tenant_id, user_id, type, title)
     select $1, u, 'sla', 'Có việc trễ hẹn' from unnest(array[$2::uuid,$3::uuid]) u`,
    [tn.id, uA, uB],
  );

  const {
    rows: [cfg],
  } = await c.query(`select value from private.app_config where key = 'bot_ingest_key'`);
  const KEY = cfg.value;

  const demOutbox = async (uid) => {
    const { rows } = await c.query(
      `select count(*)::int n from public.bot_outbox where tenant_id=$1 and user_id=$2`,
      [tn.id, uid],
    );
    return rows[0].n;
  };
  const xoaOutbox = () => c.query(`delete from public.bot_outbox where tenant_id=$1`, [tn.id]);
  const demGhepNoi = async (uid) => {
    const { rows } = await c.query(
      `select count(*)::int n from public.staff_channel_links where tenant_id=$1 and user_id=$2`,
      [tn.id, uid],
    );
    return rows[0].n;
  };

  // ═══════════════════════════════════════════════════════════════════
  // LƯỢT 1 — CHỐT CÓ MẶT KHÔNG
  // ═══════════════════════════════════════════════════════════════════
  //
  // ⚠️ KHỐI NÀY TỪNG VIẾT NGƯỢC, VÀ ĐÓ LÀ MỘT BÀI HỌC VỀ CỔNG KIỂM
  //
  // Bản đầu khẳng định *"người đã nghỉ VẪN nhận được bản tin"* — tức nó khẳng
  // định **lỗ còn đó**. Lúc viết thì đúng, vì migration #212 chưa áp; nó chạy
  // 24/24 xanh. Áp #212 xong chạy lại thì **ba khẳng định đó lập tức ĐỎ**, và
  // đỏ vì bản vá CHẠY ĐÚNG.
  //
  // Một bộ kiểm chạy mỗi lần đẩy mã **không được phép** khẳng định lỗ vẫn còn:
  // nó biến "vá xong" thành "cổng đỏ", tức nó phạt đúng việc mình muốn khuyến
  // khích. Phép dựng-lại-lỗ thuộc về đợt ĐIỀU TRA một lần, không thuộc về cổng.
  //
  // Nên khối này đảo lại: khẳng định **chốt có mặt và đang chạy**. Phần chứng
  // minh bộ kiểm không rỗng nằm ở bốn phép THÁO CHỐT phía dưới — tháo chốt ra
  // thì đúng khẳng định tương ứng phải đỏ. Đó mới là cách chứng minh cổng còn
  // răng mà không phải giữ lỗ lại để chụp ảnh.
  //
  // Cùng hình dạng với ba bộ kiểm đã sửa cùng đêm (`hoa-hong-smoke`,
  // `rls-smoke`, `tong-ket-chien-dich-smoke`): chúng mã hoá một đường đi mà máy
  // trạng thái mới cấm, nên bản vá đúng lại làm cổng đỏ.
  console.log("\n[CHỐT] Gỡ B khỏi tiệm rồi chạy đúng đường bot dùng:");

  // Gỡ B đúng cách app gỡ: DELETE thẳng trên tenant_members (policy
  // members_manage cho owner/admin làm việc này — KHÔNG có RPC trung gian nào,
  // nên cũng KHÔNG có chỗ nào để nhét lệnh dọn ghép nối vào ngoài trigger).
  await c.query(`delete from public.tenant_members where tenant_id=$1 and user_id=$2`, [tn.id, uB]);

  check(
    "VÁ: gỡ người khỏi tiệm thì DÒNG GHÉP NỐI mất theo",
    (await demGhepNoi(uB)) === 0,
    `ghép nối của B còn ${await demGhepNoi(uB)} dòng — trigger cắt ghép nối không chạy`,
  );

  await xoaOutbox();
  await c.query(`select public.bot_digest_run()`);
  const truocB = await demOutbox(uB);
  const truocA = await demOutbox(uA);
  check(
    `VÁ: người ĐÃ NGHỈ không còn được xếp bản tin (B nhận ${truocB} tin)`,
    truocB === 0,
    "B vẫn nhận được bản tin ⇒ cổng ở bot_digest_run() không chạy",
  );
  check(
    `ĐỐI CHỨNG: người CÒN LÀM VIỆC vẫn nhận bình thường (A nhận ${truocA} tin)`,
    truocA > 0,
    "A không nhận được gì ⇒ phép đo hỏng, không kết luận được gì về B",
  );

  // Đường phát tin: tin đã xếp hàng có bay ra ngoài không.
  const claimTruoc = await c.query(`select o_chat from public.bot_claim_outbox($1, 50)`, [KEY]);
  const chatsTruoc = claimTruoc.rows.map((r) => r.o_chat);
  check(
    "VÁ: worker KHÔNG nhận tin của người đã nghỉ để gửi đi",
    !chatsTruoc.includes(chatB),
    `worker vẫn nhận tin của B: ${JSON.stringify(chatsTruoc)}`,
  );

  // Đường hỏi đáp — đo để biết nó ĐÃ được vá từ trước hay chưa (#121).
  const {
    rows: [ansB0],
  } = await c.query(`select public.bot_answer($1,$2,$3,$4) as r`, [KEY, ch.id, chatB, "việc"]);
  check(
    "Đường HỎI ĐÁP vốn đã chặn sẵn người đã nghỉ (chốt cũ của #121)",
    String(ansB0.r.reply ?? "").includes("Chưa nối tài khoản nào"),
    `bot_answer trả cho B: ${JSON.stringify(ansB0.r.reply)}`,
  );

  // ═══════════════════════════════════════════════════════════════════
  // NẠP MIGRATION #212 VÀO TRONG GIAO DỊCH (không áp lên CSDL thật)
  // ═══════════════════════════════════════════════════════════════════
  if (THAO_CHOT) {
    console.log(`\n⚠️ ĐANG THÁO CHỐT "${THAO_CHOT}" — bộ kiểm PHẢI ĐỎ ở ca tương ứng.`);
  }
  await c.query(docMigration());
  console.log("\n[ĐO SAU] Đã nạp migration #212 trong giao dịch kiểm:");

  // ── Chốt 1: dọn dòng mồ côi có sẵn ────────────────────────────────────────
  check(
    "Migration dọn sạch dòng ghép nối mồ côi đang có (B)",
    (await demGhepNoi(uB)) === 0,
    "dòng ghép nối của B vẫn còn sau khi vá",
  );
  check(
    "ĐỐI CHỨNG: ghép nối của người còn làm việc KHÔNG bị dọn nhầm (A)",
    (await demGhepNoi(uA)) === 1,
    "đã cắt nhầm người đang làm việc — tệ hơn lỗ",
  );

  // ── Chốt 2: cổng thành viên ở đường BẢN TIN ───────────────────────────────
  // Dựng lại đúng thế mồ côi (ghép nối còn, tư cách thành viên không còn) để đo
  // riêng cổng đọc — không mượn kết quả của bước dọn ở trên.
  await c.query(
    `insert into public.staff_channel_links (tenant_id, user_id, external_chat_id) values ($1,$2,$3)`,
    [tn.id, uB, chatB],
  );
  await xoaOutbox();
  await c.query(`select public.bot_digest_run()`);
  const sauB = await demOutbox(uB);
  const sauA = await demOutbox(uA);
  check(`VÁ: người đã nghỉ KHÔNG còn được xếp bản tin (B nhận ${sauB} tin)`, sauB === 0);
  check(
    `ĐỐI CHỨNG: người còn làm việc VẪN nhận bản tin (A nhận ${sauA} tin)`,
    sauA > 0,
    "đã cắt nhầm người đang làm việc — tệ hơn lỗ",
  );

  // ── Chốt 3: cổng thành viên ở đường PHÁT TIN ──────────────────────────────
  // Tin đã nằm sẵn trong hàng đợi TRƯỚC lúc gỡ người (xếp lúc còn là thành
  // viên) vẫn phải bị chặn ở cửa phát — nếu không, bản tin cuối cùng vẫn bay đi
  // sau khi người ta đã nghỉ.
  await xoaOutbox();
  await c.query(
    `insert into public.bot_outbox (tenant_id, user_id, external_chat_id, kind, dedupe_key, body)
     values ($1,$2,$3,'test',$4,'tin cu'), ($1,$5,$6,'test',$7,'tin cu')`,
    [tn.id, uB, chatB, `test:${randomUUID()}`, uA, chatA, `test:${randomUUID()}`],
  );
  const claimSau = await c.query(`select o_chat from public.bot_claim_outbox($1, 50)`, [KEY]);
  const chatsSau = claimSau.rows.map((r) => r.o_chat);
  check(
    "VÁ: worker KHÔNG nhận tin của người đã nghỉ để gửi",
    !chatsSau.includes(chatB),
    `vẫn nhận: ${JSON.stringify(chatsSau)}`,
  );
  check(
    "ĐỐI CHỨNG: worker VẪN nhận tin của người còn làm việc",
    chatsSau.includes(chatA),
    `không nhận tin của A: ${JSON.stringify(chatsSau)}`,
  );
  const { rows: ketB } = await c.query(
    `select status, last_error from public.bot_outbox where tenant_id=$1 and user_id=$2`,
    [tn.id, uB],
  );
  check(
    "Tin bị chặn được chốt 'failed' chứ không nằm chờ mãi",
    ketB.length === 1 && ketB[0].status === "failed" && ketB[0].last_error === "not_member",
    JSON.stringify(ketB),
  );

  // ── Chốt 4: trigger cắt ghép nối NGAY khi gỡ người ────────────────────────
  // Bốn chốt trên là cổng ĐỌC; chốt này cắt ngay tại nguồn nên không sinh thêm
  // dòng mồ côi mới. Dựng lại B như một người vừa được nhận vào làm.
  await c.query(
    `insert into public.tenant_members (tenant_id, user_id, role, status) values ($1,$2,'staff','active')`,
    [tn.id, uB],
  );
  await c.query(
    `insert into public.staff_channel_links (tenant_id, user_id, external_chat_id)
     values ($1,$2,$3) on conflict (tenant_id,user_id) do update set external_chat_id = excluded.external_chat_id`,
    [tn.id, uB, chatB],
  );
  check("Dựng lại: B là thành viên và đã ghép nối", (await demGhepNoi(uB)) === 1);
  await c.query(`delete from public.tenant_members where tenant_id=$1 and user_id=$2`, [tn.id, uB]);
  check(
    "VÁ: GỠ người khỏi tiệm là ghép nối bot bị cắt NGAY",
    (await demGhepNoi(uB)) === 0,
    "ghép nối vẫn còn sau khi gỡ người",
  );
  check(
    "ĐỐI CHỨNG: ghép nối của người còn làm việc không bị đụng",
    (await demGhepNoi(uA)) === 1,
  );

  // Đình chỉ (status khác 'active') cũng phải cắt — không chỉ mỗi xoá hẳn.
  await c.query(
    `insert into public.staff_channel_links (tenant_id, user_id, external_chat_id) values ($1,$2,$3)
     on conflict (tenant_id,user_id) do update set external_chat_id = excluded.external_chat_id`,
    [tn.id, uA, chatA],
  );
  await c.query(
    `update public.tenant_members set status='removed' where tenant_id=$1 and user_id=$2`,
    [tn.id, uA],
  );
  // Gỡ MỀM: app cũng gỡ người bằng cách đổi status sang 'removed' chứ không
  // phải lúc nào cũng xoá hẳn dòng — cả hai lối đều phải cắt.
  check("VÁ: gỡ MỀM (status='removed', không xoá dòng) cũng cắt ghép nối", (await demGhepNoi(uA)) === 0);
  await c.query(
    `update public.tenant_members set status='active' where tenant_id=$1 and user_id=$2`,
    [tn.id, uA],
  );
  await c.query(
    `insert into public.staff_channel_links (tenant_id, user_id, external_chat_id) values ($1,$2,$3)`,
    [tn.id, uA, chatA],
  );

  // ── Hệ quả: nút "Gửi thử cho tôi" cũng tự đóng ───────────────────────────
  // `bot_enqueue_test()` không đọc tenant_members — nó tin vào phiên đăng nhập,
  // mà `current_tenant_id()` lấy tenant TỪ THẺ ĐĂNG NHẬP trước rồi mới tra bảng.
  // Nghĩa là người vừa bị gỡ, trong khoảng thẻ cũ còn hiệu lực (lỗ #69), vẫn có
  // ngữ cảnh tiệm hợp lệ. Đo xem trigger cắt ghép nối có tự bịt nốt đường này
  // không — nếu có thì KHÔNG cần đụng vào hàm đó, đỡ một chỗ phải sửa.
  const goiGuiThu = async (uid) => {
    await c.query(
      `select set_config('request.jwt.claims',$1,true), set_config('role','authenticated',true)`,
      [
        JSON.stringify({
          sub: uid,
          role: "authenticated",
          app_metadata: { tenant_id: tn.id, role: "staff" },
        }),
      ],
    );
    try {
      return await thu(() => c.query(`select public.bot_enqueue_test()`));
    } finally {
      await c.query(`select set_config('role','postgres',true)`);
    }
  };
  // ⚠️ KIỂM KẾT QUẢ, KHÔNG KIỂM CÂU CHỮ CỦA LỖI. Bản cũ đòi đúng chữ
  //   `not_linked`. Đo lại 22/08: giờ chặn ở lớp SỚM HƠN và trả `no_tenant_context`
  //   — migration #301 bắt `current_tenant_id()` phải có tư cách thành viên
  //   CÒN HIỆU LỰC, nên người vừa bị gỡ không còn ngữ cảnh tiệm nào để mà đi
  //   tới lớp kiểm ghép nối. Chốt CHẶT HƠN thứ bài kiểm giả định, nhưng bài
  //   kiểm vẫn ĐỎ vì nó ghim một câu chữ.
  //   Thứ thật sự cần canh là: KHÔNG có tin nào ra. Chặn ở lớp nào là chuyện
  //   của kiến trúc, và nó sẽ còn đổi.
  const truocGuiThuB = await demOutbox(uB);
  const guiThuB = await goiGuiThu(uB);
  const sauGuiThuB = await demOutbox(uB);
  check(
    "VÁ: người đã nghỉ bấm 'Gửi thử' cũng KHÔNG ra tin (thẻ cũ còn hạn vẫn chặn)",
    !guiThuB.ok && sauGuiThuB === truocGuiThuB,
    guiThuB.ok
      ? `LỌT — vẫn xếp được tin (${truocGuiThuB} → ${sauGuiThuB})`
      : `bị chặn: ${guiThuB.e.message}`,
  );
  const guiThuA = await goiGuiThu(uA);
  check(
    "ĐỐI CHỨNG: người còn làm việc VẪN bấm 'Gửi thử' được",
    guiThuA.ok,
    guiThuA.ok ? "" : guiThuA.e.message,
  );

  // ── Chốt 5: cổng thành viên lúc GHÉP MỚI ─────────────────────────────────
  // Mã ghép nối sống 10 phút. Người bị gỡ trong 10 phút đó vẫn cầm mã hợp lệ ⇒
  // không có chốt này thì họ ghép lại được ngay sau khi vừa bị gỡ.
  await c.query(
    `insert into public.link_codes (code, tenant_id, user_id, expires_at)
     values ('424242', $1, $2, now() + interval '10 minutes')`,
    [tn.id, uB],
  );
  const {
    rows: [ghep],
  } = await c.query(`select public.bot_link_via_code($1,$2,$3,$4) as r`, [
    KEY,
    ch.id,
    chatB,
    "424242",
  ]);
  check(
    "VÁ: người đã nghỉ KHÔNG ghép nối lại được bằng mã còn hạn",
    ghep.r.status === "not_member" && (await demGhepNoi(uB)) === 0,
    JSON.stringify(ghep.r),
  );
  const {
    rows: [ans],
  } = await c.query(`select public.bot_answer($1,$2,$3,$4) as r`, [KEY, ch.id, chatB, "việc"]);
  check(
    "VÁ: người đã nghỉ hỏi số liệu vẫn không được trả lời",
    String(ans.r.reply ?? "").includes("Chưa nối tài khoản nào"),
    JSON.stringify(ans.r.reply),
  );

  // ĐỐI CHỨNG cuối: người CÒN làm việc ghép nối mới vẫn chạy trơn.
  await c.query(`delete from public.staff_channel_links where tenant_id=$1 and user_id=$2`, [
    tn.id,
    uA,
  ]);
  await c.query(
    `insert into public.link_codes (code, tenant_id, user_id, expires_at)
     values ('313131', $1, $2, now() + interval '10 minutes')`,
    [tn.id, uA],
  );
  const {
    rows: [ghepA],
  } = await c.query(`select public.bot_link_via_code($1,$2,$3,$4) as r`, [
    KEY,
    ch.id,
    chatA,
    "313131",
  ]);
  check(
    "ĐỐI CHỨNG: người còn làm việc VẪN ghép nối được",
    ghepA.r.status === "linked" && (await demGhepNoi(uA)) === 1,
    JSON.stringify(ghepA.r),
  );
  const {
    rows: [ansA],
  } = await c.query(`select public.bot_answer($1,$2,$3,$4) as r`, [KEY, ch.id, chatA, "việc"]);
  check(
    "ĐỐI CHỨNG: người còn làm việc VẪN hỏi được số liệu",
    ansA.r.reply !== null && !String(ansA.r.reply).includes("Chưa nối tài khoản nào"),
    JSON.stringify(ansA.r.reply),
  );

  // ── Chốt 6: đường NHẮC LỊCH HẸN cũng phải có cổng ────────────────────────
  // Cùng hình dạng lỗ với bản tin: đọc thẳng staff_channel_links theo
  // staff_user_id mà không hỏi tư cách thành viên.
  const {
    rows: [ct],
  } = await c.query(
    `insert into public.contacts (tenant_id, full_name) values ($1,'Khach Smoke') returning id`,
    [tn.id],
  );
  await c.query(
    `insert into public.staff_channel_links (tenant_id, user_id, external_chat_id) values ($1,$2,$3)`,
    [tn.id, uB, chatB],
  );
  await c.query(
    `insert into public.tenant_members (tenant_id, user_id, role, status) values ($1,$2,'staff','active')`,
    [tn.id, uB],
  );
  await c.query(
    `insert into public.appointments (tenant_id, contact_id, staff_user_id, start_at, end_at, status)
     values ($1,$2,$3, now() + interval '30 minutes', now() + interval '90 minutes', 'booked'),
            ($1,$2,$4, now() + interval '30 minutes', now() + interval '90 minutes', 'booked')`,
    [tn.id, ct.id, uB, uA],
  );
  // Gỡ B lần nữa — nhưng giữ lại dòng ghép nối để đo riêng CỔNG ĐỌC (trigger đã
  // chứng minh ở chốt 4; ở đây cần thế mồ côi để soi hàm nhắc lịch).
  await c.query(`delete from public.tenant_members where tenant_id=$1 and user_id=$2`, [tn.id, uB]);
  await c.query(
    `insert into public.staff_channel_links (tenant_id, user_id, external_chat_id) values ($1,$2,$3)
     on conflict (tenant_id,user_id) do update set external_chat_id = excluded.external_chat_id`,
    [tn.id, uB, chatB],
  );
  await xoaOutbox();

  // ⚠️ LỖI RIÊNG, KHÔNG PHẢI VIỆC #199 — phải đi vòng thì mới đo được chốt này.
  // `bot_outbox_kind_check` đang chỉ cho ('digest','test','answer'), nhưng
  // `process_appointment_reminders()` lại chèn kind='appointment_reminder' ⇒
  // câu chèn ném 23514 và làm HỎNG CẢ LƯỢT chạy (kể cả chuông trong app của
  // những ca khác trong cùng lô, vì cùng một giao dịch). Chưa ai thấy vì
  // `staff_channel_links` đang 0 dòng nên nhánh Zalo chưa từng chạy — người
  // ĐẦU TIÊN ghép nối bot sẽ làm vỡ job nhắc lịch, cứ 15 phút một lần.
  // Bỏ ràng buộc TRONG giao dịch kiểm (rollback ở cuối) để đo được đúng thứ bộ
  // kiểm này nói về: cổng tư cách thành viên. Sửa lỗi kia xong thì bỏ đoạn này.
  await c.query(`alter table public.bot_outbox drop constraint bot_outbox_kind_check`);

  const rNhac = await thu(() => c.query(`select public.process_appointment_reminders(50)`));
  if (!rNhac.ok) {
    check("Đường nhắc lịch hẹn chạy được", false, rNhac.e.message);
  } else {
    check("VÁ: nhắc lịch hẹn KHÔNG gửi bot cho người đã nghỉ", (await demOutbox(uB)) === 0);
    check(
      "ĐỐI CHỨNG: nhắc lịch hẹn VẪN gửi bot cho người còn làm việc",
      (await demOutbox(uA)) > 0,
      "A không nhận nhắc lịch ⇒ đã cắt nhầm",
    );
  }
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${n - fail}/${n} khẳng định xanh.`);
process.exit(fail === 0 ? 0 : 1);

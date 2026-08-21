/**
 * CỔNG: công tắc tính năng (#331) đúng luật.
 *
 * ═══════════════════════════════════════════════════════════════════
 * BỐN LUẬT PHẢI GIỮ, VÀ VÌ SAO
 * ═══════════════════════════════════════════════════════════════════
 * ① KHÔNG CÓ CÔNG TẮC ⇒ TÍNH NĂNG VẪN CHẠY. Làm ngược lại thì một lần gõ sai
 *    tên khoá là cả tính năng biến mất, và công tắc thành bẫy thay vì lưới.
 * ② CHỈ CHỦ SAAS GẠT ĐƯỢC. Hàm ghi chạy bằng quyền chủ sở hữu (security
 *    definer) nên thiếu chốt là BẤT KỲ người dùng đã đăng nhập nào cũng gạt
 *    được công tắc của cả nền tảng.
 * ③ KHÔNG AI ĐỌC THẲNG BẢNG. `tiem_ids` là danh sách tiệm nào đang được ưu ái
 *    dùng thử — không phải thứ để một chủ tiệm bất kỳ đọc được.
 * ④ MỖI LẦN GẠT VÀO SỔ. Không có sổ thì một sáng nào đó tính năng tắt và không
 *    ai biết vì sao — đúng lúc cần biết nhất.
 *
 * ⚠️ Bộ kiểm chạy TRONG MỘT GIAO DỊCH rồi rollback ⇒ không để lại gì.
 * ⚠️ CÓ THÁO CHỐT: `THAO_CHOT=mac-dinh-tat` phải làm ca ① ĐỎ. Một ca xanh không
 *    phân biệt được với một ca không kiểm gì cả.
 *
 * Chạy: node scripts/cong-tac-smoke.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { themThanhVien } from "./ho-tro/tu-cach-thanh-vien.mjs";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
if (!process.env.SUPABASE_DB_URL) {
  try {
    for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split("\n")) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* không có .env.local là bình thường trên CI */
  }
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL (env hoặc .env.local).");
  process.exit(1);
}

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"), rejectUnauthorized: true },
});
await c.connect();

let n = 0;
let fail = 0;
const check = (ten, ok, chiTiet = "") => {
  n++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${n} ${ten}${ok ? "" : " — " + chiTiet}`);
  if (!ok) fail++;
};

let spN = 0;
const thu = async (fn) => {
  const sp = `sp_ct_${++spN}`;
  await c.query(`savepoint ${sp}`);
  try {
    const v = await fn();
    await c.query(`release savepoint ${sp}`);
    return { ok: true, v };
  } catch (e) {
    await c.query(`rollback to savepoint ${sp}`);
    return { ok: false, e: e.message };
  }
};

const nhuNguoi = async (uid, claims, fn) => {
  await c.query(
    `select set_config('request.jwt.claims',$1,true), set_config('role','authenticated',true)`,
    [JSON.stringify({ sub: uid, role: "authenticated", app_metadata: claims })],
  );
  try {
    return await fn();
  } finally {
    await c.query(`select set_config('role','postgres',true)`);
  }
};

// THÁO CHỐT: đổi mặc định của `co_bat` từ BẬT sang TẮT. Ca ① phải đỏ.
const THAO_CHOT = process.env.THAO_CHOT ?? "";

await c.query("begin");
try {
  if (THAO_CHOT === "mac-dinh-tat") {
    const f = readFileSync(
      path.join(GOC, "supabase", "migrations", "20260822000331_cong_tac_tinh_nang.sql"),
      "utf8",
    );
    const moc = "create or replace function public.co_bat(p_khoa text)";
    const than = f.slice(f.indexOf(moc));
    const sql = than.slice(0, than.indexOf("$$;") + 3).replace("    true\n  );", "    false\n  );");
    await c.query(sql);
    console.log('⚠️ ĐANG THÁO CHỐT "mac-dinh-tat" — ca ① PHẢI ĐỎ.');
  }

  const st = Date.now();
  const uChu = randomUUID();
  const uNV = randomUUID();
  await c.query(
    `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4)`,
    [uChu, `ct-chu-${st}@t.local`, uNV, `ct-nv-${st}@t.local`],
  );
  const { rows: [tA] } = await c.query(
    `insert into public.tenants (name, slug) values ('Tiem cong tac A', $1) returning id`,
    [`ct-a-${st % 1e8}`]);
  const { rows: [tB] } = await c.query(
    `insert into public.tenants (name, slug) values ('Tiem cong tac B', $1) returning id`,
    [`ct-b-${st % 1e8}`]);
  await themThanhVien(c, tA.id, uChu, "owner");
  await themThanhVien(c, tA.id, uNV, "staff");
  await themThanhVien(c, tB.id, uChu, "owner");

  const CHU_A = { tenant_id: tA.id, role: "owner" };
  const NV_A = { tenant_id: tA.id, role: "staff" };
  const CHU_B = { tenant_id: tB.id, role: "owner" };

  // ── ① Không có công tắc ⇒ vẫn chạy ─────────────────────────────────
  await nhuNguoi(uChu, CHU_A, async () => {
    const { rows: [r] } = await c.query(`select public.co_bat('khoa-khong-ton-tai-bao-gio') b`);
    check("① không có công tắc ⇒ tính năng VẪN CHẠY", r.b === true, JSON.stringify(r));
  });

  // ── ② Chỉ chủ SaaS gạt được ────────────────────────────────────────
  // ⚠️ Người dùng THẬT ở đây, không phải quyền `postgres`. Kiểm bằng quyền
  //   postgres thì mọi chốt đều "qua" và ca kiểm chứng minh nhầm.
  await nhuNguoi(uChu, CHU_A, async () => {
    const { rows: [r] } = await c.query(
      `select public.admin_dat_cong_tac('thu-nghiem-ct','Thu nghiem',null,'tat') j`);
    check("② chủ TIỆM (không phải chủ SaaS) KHÔNG gạt được công tắc",
      r.j.ok === false && r.j.ly_do === "forbidden", JSON.stringify(r.j));
  });
  await nhuNguoi(uNV, NV_A, async () => {
    const { rows: [r] } = await c.query(`select public.admin_tat_cong_tac_ngay('bang-lenh') j`);
    check("② nhân viên KHÔNG bấm được Tắt ngay",
      r.j.ok === false && r.j.ly_do === "forbidden", JSON.stringify(r.j));
    const { rows: [d] } = await c.query(`select public.admin_cong_tac() j`);
    check("② nhân viên đọc danh sách công tắc ⇒ RỖNG (không ném lỗi)",
      Array.isArray(d.j) && d.j.length === 0, JSON.stringify(d.j));
  });

  // ── ③ Không ai đọc thẳng bảng ──────────────────────────────────────
  await c.query(
    `insert into public.feature_flags (khoa, ten, pham_vi, tiem_ids)
       values ('ct-vai-tiem','Thu vai tiem','vai_tiem', array[$1]::uuid[])`, [tA.id]);
  await nhuNguoi(uChu, CHU_A, async () => {
    const { rows } = await c.query(`select * from public.feature_flags`);
    check("③ chủ tiệm KHÔNG đọc thẳng được bảng công tắc", rows.length === 0, `${rows.length} dòng`);
    const w = await thu(() =>
      c.query(`update public.feature_flags set pham_vi='moi_tiem' where khoa='ct-vai-tiem'`));
    // RLS bật mà không policy ⇒ update không trúng dòng nào (không ném lỗi).
    check("③ chủ tiệm KHÔNG sửa thẳng được bảng công tắc",
      !w.ok || w.v.rowCount === 0, JSON.stringify(w.ok ? w.v.rowCount : w.e));
  });

  // ── Phạm vi "vài tiệm" chọn đúng tiệm ───────────────────────────────
  await nhuNguoi(uChu, CHU_A, async () => {
    const { rows: [r] } = await c.query(`select public.co_bat('ct-vai-tiem') b`);
    check("tiệm ĐƯỢC chỉ định ⇒ thấy tính năng", r.b === true, JSON.stringify(r));
  });
  await nhuNguoi(uChu, CHU_B, async () => {
    const { rows: [r] } = await c.query(`select public.co_bat('ct-vai-tiem') b`);
    check("tiệm KHÔNG được chỉ định ⇒ không thấy", r.b === false, JSON.stringify(r));
  });

  // ── Phạm vi "theo vai" ──────────────────────────────────────────────
  await c.query(
    `insert into public.feature_flags (khoa, ten, pham_vi, vai)
       values ('ct-theo-vai','Thu theo vai','theo_vai', array['owner','manager'])`);
  await nhuNguoi(uChu, CHU_A, async () => {
    const { rows: [r] } = await c.query(`select public.co_bat('ct-theo-vai') b`);
    check("vai ĐƯỢC chỉ định ⇒ thấy", r.b === true, JSON.stringify(r));
  });
  await nhuNguoi(uNV, NV_A, async () => {
    const { rows: [r] } = await c.query(`select public.co_bat('ct-theo-vai') b`);
    check("vai KHÔNG được chỉ định ⇒ không thấy", r.b === false, JSON.stringify(r));
  });

  // ── Tắt hết thì tắt với mọi người ──────────────────────────────────
  await c.query(
    `insert into public.feature_flags (khoa, ten, pham_vi) values ('ct-tat','Thu tat','tat')`);
  for (const [ten, uid, claims] of [["chủ tiệm", uChu, CHU_A], ["nhân viên", uNV, NV_A]]) {
    await nhuNguoi(uid, claims, async () => {
      const { rows: [r] } = await c.query(`select public.co_bat('ct-tat') b`);
      check(`công tắc TẮT ⇒ ${ten} không thấy`, r.b === false, JSON.stringify(r));
    });
  }

  // ── Phạm vi "một phần" mà danh sách rỗng ⇒ CSDL từ chối ─────────────
  // Nếu không chặn thì màn hiện "mở một phần" nhưng thực tế không ai thấy —
  // một trạng thái nói dối, và là kiểu lỗi khó lần nhất.
  for (const [ten, sql] of [
    ["vài tiệm mà không chọn tiệm nào",
      `insert into public.feature_flags (khoa, ten, pham_vi) values ('ct-rong-1','x','vai_tiem')`],
    ["theo vai mà không chọn vai nào",
      `insert into public.feature_flags (khoa, ten, pham_vi) values ('ct-rong-2','x','theo_vai')`],
  ]) {
    const r = await thu(() => c.query(sql));
    check(`${ten} ⇒ CSDL từ chối`, !r.ok && /check|constraint/i.test(r.e), r.ok ? "chèn LỌT" : r.e);
  }

  // Khoá sai dạng (có hoa, có khoảng trắng) ⇒ từ chối.
  const rSai = await thu(() =>
    c.query(`insert into public.feature_flags (khoa, ten) values ('Khoa Sai','x')`));
  check("mã tính năng sai dạng ⇒ CSDL từ chối", !rSai.ok, JSON.stringify(rSai));

  // ── ④ Mỗi lần gạt vào sổ ───────────────────────────────────────────
  await c.query(`update public.feature_flags set pham_vi='moi_tiem' where khoa='ct-tat'`);
  const { rows: [so] } = await c.query(
    `select count(*)::int n from public.feature_flag_log where khoa='ct-tat'`);
  // 1 lần thêm + 1 lần sửa = 2 dòng.
  check("④ mỗi lần gạt đều vào sổ", so.n === 2, `${so.n} dòng`);
  // ⚠️ XẾP THEO `id`, KHÔNG THEO `luc`. Hai dòng sổ sinh ra trong CÙNG một
  //   giao dịch nên `now()` của chúng BẰNG NHAU tuyệt đối — xếp theo thời gian
  //   thì thứ tự do cơ sở dữ liệu tuỳ ý chọn, và ca kiểm lúc xanh lúc đỏ mà
  //   không đổi dòng mã nào. Đã dính đúng lỗi này lần chạy đầu.
  const { rows: [doi] } = await c.query(
    `select truoc->>'pham_vi' a, sau->>'pham_vi' b from public.feature_flag_log
      where khoa='ct-tat' order by id desc limit 1`);
  check("④ sổ ghi ĐÚNG từ gì sang gì", doi.a === "tat" && doi.b === "moi_tiem", JSON.stringify(doi));

  // ── Tắt ngay: một bấm là xong ──────────────────────────────────────
  // Chốt quyền đã kiểm ở ca ②; ở đây kiểm TÁC DỤNG bằng quyền quản trị thật.
  const { rows: [ad] } = await c.query(`select count(*)::int n from public.platform_admins`);
  if (ad.n > 0) {
    const { rows: [pa] } = await c.query(`select user_id from public.platform_admins limit 1`);
    await nhuNguoi(pa.user_id, { tenant_id: tA.id, role: "owner" }, async () => {
      const { rows: [r] } = await c.query(`select public.admin_tat_cong_tac_ngay('ct-tat') j`);
      check("chủ SaaS bấm Tắt ngay ⇒ được", r.j.ok === true, JSON.stringify(r.j));
      const { rows: [x] } = await c.query(`select public.admin_tat_cong_tac_ngay('khong-co-dau') j`);
      check("Tắt ngay một khoá không có ⇒ báo rõ, không ném lỗi",
        x.j.ok === false && x.j.ly_do === "khong_thay", JSON.stringify(x.j));
    });
    // ⚠️ ĐỌC LẠI BẰNG QUYỀN QUẢN TRỊ, ngoài `nhuNguoi`. Trong đó vai đang là
    //   `authenticated`, mà bảng công tắc bật RLS không policy ⇒ câu select trả
    //   RỖNG. Lần chạy đầu đã ngã đúng chỗ này: không phải chốt hỏng, mà là
    //   phép đo tự bịt mắt mình.
    const { rows: [k] } = await c.query(
      `select pham_vi from public.feature_flags where khoa='ct-tat'`);
    check("Tắt ngay ⇒ phạm vi về 'tat'", k?.pham_vi === "tat", JSON.stringify(k));
  } else {
    // ⚠️ KHÔNG lặng lẽ bỏ qua. Bảng trống thì phần chốt quyền chỉ kiểm được
    //   chiều TỪ CHỐI, và người đọc kết quả phải biết điều đó.
    console.log("  ⚠️ BỎ QUA 3 ca 'chủ SaaS bấm được': bảng platform_admins đang trống.");
  }
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(
  fail === 0
    ? `[cong-tac-smoke] ${n}/${n} PASS — không có công tắc thì vẫn chạy, chỉ chủ SaaS gạt được, không ai đọc thẳng bảng, mọi lần gạt vào sổ.`
    : `[cong-tac-smoke] HỎNG ${fail}/${n} ca — xem dòng FAIL ở trên.`,
);
process.exit(fail === 0 ? 0 : 1);

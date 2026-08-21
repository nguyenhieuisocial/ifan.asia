/**
 * CỔNG: ảnh chứng từ của phiếu chi phải nằm ĐÚNG trong thư mục của tiệm mình.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CA "ĐƯỜNG DẪN NGOÀI TIỆM" LÀ CA QUAN TRỌNG NHẤT
 * ═══════════════════════════════════════════════════════════════════
 * Ảnh nằm trong kho `tenant-files` — CÙNG MỘT KHO đang chứa ảnh chấm công (mặt
 * nhân viên) và tệp khách gửi trong Chat. Nếu hàm đính chứng từ nhận bất kỳ
 * đường dẫn nào, thì một người có quyền ghi sổ quỹ chỉ cần đính một đường dẫn
 * trỏ sang thư mục TIỆM KHÁC, và màn hình sẽ ngoan ngoãn ký hạn rồi mở ảnh đó
 * ra. Không phải lỗ ở kho — lỗ ở chỗ NHẬN đường dẫn.
 *
 * ⚠️ Mọi ca ghi đều nằm trong giao dịch rồi hoàn tác.
 *
 * Chạy: node scripts/chung-tu-phieu-chi-smoke.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";

if (!process.env.SUPABASE_DB_URL) {
  try {
    for (const d of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* CI đã có env sẵn */
  }
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("❌ Thiếu SUPABASE_DB_URL — cổng này KHÔNG tự bỏ qua.");
  process.exit(1);
}

let dat = 0;
let truot = 0;
const kiem = (ten, ok, ghi = "") => {
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${!ok && ghi ? " — " + ghi : ""}`);
  if (ok) dat++;
  else truot++;
};

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync("supabase/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
});
await c.connect();

const { rows: [t] } = await c.query(
  `select id from public.tenants where slug = 'demo-spa-huong-sen'`,
);
const { rows: [khac] } = await c.query(
  `select id from public.tenants where id <> $1 and deleted_at is null limit 1`,
  [t.id],
);
const { rows: [chu] } = await c.query(
  `select user_id from public.tenant_members where tenant_id = $1 and role = 'owner' limit 1`,
  [t.id],
);
const { rows: [nv] } = await c.query(
  `select user_id from public.tenant_members where tenant_id = $1 and role = 'staff' limit 1`,
  [t.id],
);

const anh = (tiem, ten = "hoa-don.jpg") =>
  JSON.stringify([{ duong_dan: `${tiem}/chung-tu/abc-123.jpg`, ten, co: 41234 }]);

/** Chạy một ca dưới danh nghĩa một người dùng, rồi hoàn tác. */
const nhuNguoi = async (uid, viec) => {
  await c.query("begin");
  try {
    await c.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [uid],
    );
    await c.query("set local role authenticated");
    return await viec();
  } finally {
    await c.query("rollback");
  }
};

/** Tạo một phiếu chi tạm để thử (đang ở quyền authenticated). */
const taoPhieuChi = async () => {
  const { rows } = await c.query(
    `insert into public.cash_entries (tenant_id, direction, amount_vnd, fund, category, note, recorded_by)
     values ($1, 'out', 5000000, 'cash', 'other_out', 'phieu thu de kiem', $2)
     returning id`,
    [t.id, chu.user_id],
  );
  return rows[0].id;
};

console.log("[chung-tu] Chot duong dan:");

await nhuNguoi(chu.user_id, async () => {
  const id = await taoPhieuChi();
  const { rows: [r] } = await c.query("select public.dinh_chung_tu($1, $2::jsonb) j", [
    id,
    anh(t.id),
  ]);
  kiem("đính ảnh trong thư mục CỦA TIỆM MÌNH ⇒ được", r.j.ok === true, JSON.stringify(r.j));
  const { rows: [x] } = await c.query("select chung_tu from public.cash_entries where id = $1", [id]);
  kiem("ảnh đã ghi vào phiếu", Array.isArray(x.chung_tu) && x.chung_tu.length === 1);
});

await nhuNguoi(chu.user_id, async () => {
  const id = await taoPhieuChi();
  const { rows: [r] } = await c.query("select public.dinh_chung_tu($1, $2::jsonb) j", [
    id,
    anh(khac.id),
  ]);
  kiem(
    "đính ảnh trỏ sang THƯ MỤC TIỆM KHÁC ⇒ TỪ CHỐI",
    r.j.loi === "duong_dan_ngoai_tiem",
    `nhận về ${JSON.stringify(r.j)} — đây là cửa mở sang kho của tiệm khác`,
  );
});

await nhuNguoi(chu.user_id, async () => {
  const id = await taoPhieuChi();
  // ⚠️ CA NÀY TỪNG LÀ MỘT DÒNG "GHI NHẬN" MƠ HỒ, KHÔNG PHẢI MỘT CA KIỂM.
  //   Bản đầu viết: "đường dẫn này bắt đầu đúng tiền tố nên đi qua, nhưng chốt
  //   thật nằm ở kho lưu trữ vì nó coi cả chuỗi là MỘT tên". Câu sau là một
  //   GIẢ THIẾT CHƯA ĐO. Đi đo thật thì NGƯỢC LẠI: kho Supabase CÓ hiểu `..`,
  //   tệp rơi hẳn sang thư mục tiệm kia. (Người dùng thường vẫn bị RLS chặn vì
  //   kho chuẩn hoá đường dẫn trước khi kiểm quyền — nhưng chỗ ký hạn giờ có
  //   thể chạy bằng khoá dịch vụ, và lúc đó `..` sẽ được giải ra.)
  //   #352 chặn thẳng. Đây là ca canh, không còn là lời ghi chú.
  const bay = JSON.stringify([
    { duong_dan: `${t.id}/chung-tu/../../${khac.id}/cham-cong/mat.jpg`, ten: "a.jpg", co: 1 },
  ]);
  const { rows: [r] } = await c.query("select public.dinh_chung_tu($1, $2::jsonb) j", [id, bay]);
  kiem(
    "đường dẫn có `..` (đúng tiền tố nhưng leo sang tiệm khác) ⇒ TỪ CHỐI",
    r.j.loi === "duong_dan_leo_thu_muc",
    `nhận về ${JSON.stringify(r.j)} — kho Supabase CÓ hiểu \`..\`, đã đo thật`,
  );

  const nguoc = JSON.stringify([
    { duong_dan: `${t.id}/chung-tu/..\\..\\${khac.id}/x.jpg`, ten: "a.jpg", co: 1 },
  ]);
  const { rows: [r2] } = await c.query("select public.dinh_chung_tu($1, $2::jsonb) j", [id, nguoc]);
  kiem("đường dẫn có gạch chéo ngược ⇒ TỪ CHỐI", r2.j.ok !== true, JSON.stringify(r2.j));
});

console.log("[chung-tu] Chot hinh dang:");

await nhuNguoi(chu.user_id, async () => {
  const id = await taoPhieuChi();
  const bon = JSON.stringify(
    Array.from({ length: 4 }, (_, i) => ({
      duong_dan: `${t.id}/chung-tu/x${i}.jpg`,
      ten: `x${i}.jpg`,
      co: 1,
    })),
  );
  const { rows: [r] } = await c.query("select public.dinh_chung_tu($1, $2::jsonb) j", [id, bon]);
  kiem("4 ảnh ⇒ TỪ CHỐI (trần là 3)", r.j.loi === "sai_hinh_dang", JSON.stringify(r.j));
});

await nhuNguoi(chu.user_id, async () => {
  const { rows: [thu] } = await c.query(
    `insert into public.cash_entries (tenant_id, direction, amount_vnd, fund, category, recorded_by)
     values ($1, 'in', 100000, 'cash', 'other_in', $2) returning id`,
    [t.id, chu.user_id],
  );
  const { rows: [r] } = await c.query("select public.dinh_chung_tu($1, $2::jsonb) j", [
    thu.id,
    anh(t.id),
  ]);
  kiem(
    "đính vào phiếu THU ⇒ TỪ CHỐI (tính năng chỉ dành cho phiếu chi)",
    r.j.loi === "khong_ghi_duoc",
    JSON.stringify(r.j),
  );
});

await nhuNguoi(chu.user_id, async () => {
  let chan = false;
  await c.query("savepoint s1");
  try {
    await c.query(
      `insert into public.cash_entries (tenant_id, direction, amount_vnd, fund, category, recorded_by, chung_tu)
       values ($1, 'in', 100000, 'cash', 'other_in', $2, $3::jsonb)`,
      [t.id, chu.user_id, anh(t.id)],
    );
  } catch {
    chan = true;
  }
  await c.query("rollback to savepoint s1");
  kiem(
    "ghi THẲNG ảnh vào phiếu THU (không qua hàm) ⇒ CSDL vẫn chặn",
    chan,
    "chốt chỉ nằm ở hàm thì gọi thẳng API là đi vòng qua được",
  );
});

console.log("[chung-tu] Chot vai:");

if (nv) {
  // ⚠️ TẠO PHIẾU VÀ THỬ PHẢI NẰM TRONG CÙNG MỘT GIAO DỊCH. Bản đầu tạo phiếu ở
  //   một giao dịch rồi thử ở giao dịch sau — mà giao dịch đầu đã hoàn tác, nên
  //   giao dịch sau không thấy phiếu nào và ca kiểm TỰ BỎ QUA CHÍNH NÓ. Một ca
  //   luôn tự bỏ qua không phân biệt được với một ca luôn đạt.
  await c.query("begin");
  try {
    await c.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [chu.user_id],
    );
    await c.query("set local role authenticated");
    const id = await taoPhieuChi();

    // Đổi sang nhân viên NGAY TRONG giao dịch đó — phiếu vừa tạo vẫn còn đấy.
    await c.query("reset role");
    await c.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [nv.user_id],
    );
    await c.query("set local role authenticated");
    const { rows: [r] } = await c.query("select public.dinh_chung_tu($1, $2::jsonb) j", [
      id,
      anh(t.id),
    ]);
    kiem(
      "nhân viên thường KHÔNG đính được chứng từ vào sổ quỹ",
      r.j.ok !== true,
      `nhân viên ghi được: ${JSON.stringify(r.j)}`,
    );
  } finally {
    await c.query("rollback");
  }
}

await c.end();
console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);

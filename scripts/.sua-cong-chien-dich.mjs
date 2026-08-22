import { readFileSync, writeFileSync } from "node:fs";
const f = "scripts/tong-ket-chien-dich-smoke.mjs";
let s = readFileSync(f, "utf8");

const doi = [
  // ① Tạo thêm một người dùng THẬT SỰ thuộc tiệm kia.
  [
    `  const uChu = randomUUID();
  const uNV = randomUUID();
  await c.query(
    \`insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2), ($3,'authenticated','authenticated',$4)\`,
    [uChu, \`chu-\${st}@t.local\`, uNV, \`nv-\${st}@t.local\`],
  );`,
    `  const uChu = randomUUID();
  const uNV = randomUUID();
  // Chủ của TIỆM KHÁC — một người thật, có tư cách thành viên thật.
  const uChu2 = randomUUID();
  await c.query(
    \`insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2), ($3,'authenticated','authenticated',$4),
       ($5,'authenticated','authenticated',$6)\`,
    [uChu, \`chu-\${st}@t.local\`, uNV, \`nv-\${st}@t.local\`, uChu2, \`chu2-\${st}@t.local\`],
  );`,
  ],
  // ② Gắn uChu2 vào t2.
  [
    `  await c.query(
    \`insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'owner'), ($1,$3,'staff')\`,
    [t.id, uChu, uNV],
  );`,
    `  await c.query(
    \`insert into public.tenant_members (tenant_id, user_id, role)
       values ($1,$2,'owner'), ($1,$3,'staff'), ($4,$5,'owner')\`,
    [t.id, uChu, uNV, t2.id, uChu2],
  );`,
  ],
  // ③ Hai ca cách ly: dùng NGƯỜI THẬT của tiệm kia, không dùng lời khai giả.
  [
    `  check("Tiệm khác đọc 0 dòng", (await docTK(uChu, "owner", t2.id)) === 0, "");`,
    `  // ⚠️ CA NÀY TỪNG THỬ SAI ĐƯỜNG, VÀ ĐÃ ĐỎ THẬT. Bản cũ lấy chủ tiệm A rồi
  //   KHAI GIAN mã tiệm B trong thẻ đăng nhập, và mong đọc ra 0 dòng.
  //   Đo thật 22/08: \`current_tenant_id()\` **bỏ qua hẳn lời khai gian** và trả
  //   về tiệm THẬT của người đó (migration #301 bắt buộc phải có tư cách thành
  //   viên còn hiệu lực). Nên chủ tiệm A vẫn đọc đúng 2 dòng của tiệm A —
  //   không phải rò, mà là chốt CHẶT HƠN thứ bài kiểm giả định.
  //   ⇒ Muốn kiểm cách ly thì phải dùng NGƯỜI THẬT của tiệm kia.
  check("Chủ TIỆM KHÁC đọc 0 dòng của tiệm này", (await docTK(uChu2, "owner", t2.id)) === 0, "");
  check(
    "Khai gian mã tiệm trong thẻ đăng nhập ⇒ BỊ BỎ QUA, không mở được cửa nào",
    (await docTK(uChu, "owner", t2.id)) === 2,
    "lời khai gian có tác dụng — đây mới là rò thật",
  );`,
  ],
  [
    `  const cheoTiem = await asUser(uChu, { tenant_id: t2.id, role: "owner" }, () =>
    thu(() => c.query(\`select public.campaign_tong_ket_yeu_cau($1)\`, [cd.id])),
  );`,
    `  // Cùng lý do: người gọi phải là NGƯỜI THẬT của tiệm kia.
  const cheoTiem = await asUser(uChu2, { tenant_id: t2.id, role: "owner" }, () =>
    thu(() => c.query(\`select public.campaign_tong_ket_yeu_cau($1)\`, [cd.id])),
  );`,
  ],
];

for (const [a, b] of doi) {
  if (!s.includes(a)) {
    console.error("KHONG KHOP:", a.slice(0, 60).replace(/\n/g, " "));
    process.exit(1);
  }
  s = s.replace(a, b);
}
writeFileSync(f, s);
console.log("da sua 2 ca kiem cach ly");

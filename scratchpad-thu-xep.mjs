import { xepChong } from "./scratchpad-xep.mjs";

let dung = 0, sai = 0;
const kiem = (ten, that, mong) => {
  const ok = JSON.stringify(that) === JSON.stringify(mong);
  console.log(`  ${ok ? "✓" : "✗"} ${ten}`);
  if (!ok) { console.log(`      ra : ${JSON.stringify(that)}`); console.log(`      mong: ${JSON.stringify(mong)}`); sai++; } else dung++;
};
const chay = (cs) => cs.map((c) => { const o = xepChong(cs).get(c); return [o.cot, o.soCot]; });

kiem("mot ca -> 1 cot",           chay([{startMin:540,endMin:600}]), [[0,1]]);
kiem("hai ca roi nhau -> deu 1 cot", chay([{startMin:540,endMin:600},{startMin:660,endMin:720}]), [[0,1],[0,1]]);
kiem("hai ca trung -> 2 cot",     chay([{startMin:540,endMin:600},{startMin:570,endMin:630}]), [[0,2],[1,2]]);
kiem("ba ca cung gio -> 3 cot",   chay([{startMin:540,endMin:600},{startMin:540,endMin:600},{startMin:540,endMin:600}]), [[0,3],[1,3],[2,3]]);
kiem("noi duoi (9-10, 10-11) KHONG trung", chay([{startMin:540,endMin:600},{startMin:600,endMin:660}]), [[0,1],[0,1]]);
// Cai bay chinh: A 9-10, B 9:30-10:30, C 10:15-11. A khong trung C, nhung ca ba
// dinh nhau thanh MOT cum -> ca ba phai cung so cot.
kiem("day trung noi tiep -> cung mot cum 2 cot",
     chay([{startMin:540,endMin:600},{startMin:570,endMin:630},{startMin:615,endMin:660}]),
     [[0,2],[1,2],[0,2]]);
kiem("ca dai 0 phut van chiem cho", chay([{startMin:540,endMin:540},{startMin:540,endMin:600}]), [[0,2],[1,2]]);
kiem("khong co ca nao", [...xepChong([]).values()], []);
console.log(`\n${dung} dung · ${sai} sai`);
process.exit(sai ? 1 : 0);

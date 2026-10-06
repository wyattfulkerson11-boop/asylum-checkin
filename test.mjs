// node checkin/test.mjs — runs the pure logic block out of index.html.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const src = html.split('// --- logic ---')[1].split('// --- ui ---')[0];
const { fresh, addStudent, checkIn, rosterText, pdfRoster, rangeTitle, dayOf, waiting, pullDraft, backupText, readBackup, persist, KEY, RESERVE } =
  new Function(src + '; return { fresh, addStudent, checkIn, rosterText, pdfRoster, rangeTitle, dayOf, waiting, pullDraft, backupText, readBackup, persist, KEY, RESERVE };')();

const db = fresh();
const ann = addStudent(db, '  ann   lee ');
assert.equal(db.students[ann].name, 'ann lee');
assert.equal(addStudent(db, 'ANN LEE'), ann, 'same name, any case, is the same student');
const bo = addStudent(db, '=Bo "B" Diaz');

const at = new Date(2026, 9, 2, 18, 5); // local 6:05pm, Oct 2
assert.equal(dayOf(new Date(2026, 9, 2, 23, 59)), '2026-10-02', 'late class stays on its own day');
checkIn(db, [ann, bo], ['MMA'], at);
checkIn(db, [ann], ['MMA', 'Wrestling'], new Date(2026, 9, 2, 19, 0));
assert.equal(db.checkins.length, 3, 'a later check-in is its own record');
assert.deepEqual(db.checkins[0].c, ['MMA'], 'the first record is unchanged');
assert.deepEqual(db.checkins[2], { s: ann, d: '2026-10-02', t: '19:00', c: ['Wrestling'] }, 'only the new class, at its own time');
assert.deepEqual(db.students[ann].last, ['MMA', 'Wrestling']);

const text = rosterText(db, '2026-10-02');
assert.match(text, /2 checked in/);
assert.match(text, /MMA \(2\)/);
assert.match(text, /ann lee  6:05 PM/);
assert.match(text, /Wrestling \(1\)\n  ann lee  7:00 PM/, 'each class shows its own time');
assert.doesNotMatch(text, /Kickboxing/, 'empty classes are left out');
assert.match(rosterText(db, '2026-10-03'), /0 checked in/);


const checkPdf = (pdf) => {
  const offsets = [...pdf.split('xref\n0 ')[1].matchAll(/(\d{10}) 00000 n/g)].map((m) => +m[1]);
  offsets.forEach((o, i) => assert.ok(pdf.startsWith((i + 1) + ' 0 obj', o), 'xref offset ' + (i + 1)));
  assert.equal(+pdf.match(/startxref\n(\d+)/)[1], pdf.lastIndexOf('xref\n0 '));
  return pdf.match(/\/Type \/Page /g).length;
};
const oct2 = db.checkins.filter((r) => r.d === '2026-10-02');
const pdf = pdfRoster(db, oct2, rangeTitle('2026-10-02', '2026-10-02'), 'FAKEJPEG');
assert.ok(pdf.includes('(Friday, October 2, 2026) Tj') && pdf.includes('(checked in) Tj'), 'one day: date and checked in');
assert.ok(!pdf.includes('(check-ins) Tj'));
assert.ok(pdf.startsWith('%PDF-1.4') && pdf.includes('(ann lee) Tj') && pdf.includes('(6:05 PM) Tj') && pdf.includes('(=Bo "B" Diaz) Tj'));
assert.ok(pdf.includes('/Length 8 >>\nstream\nFAKEJPEG') && pdf.includes('/Im1 Do'));
assert.equal(checkPdf(pdf), 1);
assert.ok(!pdfRoster(db, oct2, 'x').includes('/Im1 Do'), 'no logo, no image drawn');
assert.equal(checkPdf(pdfRoster(db, [], 'Saturday, October 3, 2026')), 1, 'an empty day is still a valid page');
checkIn(db, [bo], ['MMA'], new Date(2026, 9, 3, 18, 0));
const range = pdfRoster(db, db.checkins, rangeTitle('2026-10-02', '2026-10-03'), 'FAKEJPEG');
assert.equal(checkPdf(range), 1);
assert.ok(range.includes('(Oct 2 to Oct 3, 2026) Tj'), 'range title');
assert.ok(range.includes('(Saturday, October 3, 2026) Tj') && range.includes('(check-ins) Tj'), 'a heading per day');
assert.match(range, /BT \/F2 30 Tf [\d.]+ 698 Td \(3\) Tj/, 'total counts each student once per day');
assert.equal(rangeTitle('2025-12-29', '2026-01-02'), 'Dec 29, 2025 to Jan 2, 2026');

const big = fresh();
const crowd = Array.from({ length: 80 }, (_, i) => addStudent(big, 'Student (' + i + ')'));
checkIn(big, crowd, ['MMA'], at);
const long = pdfRoster(big, big.checkins, 'Friday, October 2, 2026');
assert.equal(checkPdf(long), 3, '80 names run onto three pages');
assert.ok(long.includes('Page 3 of 3') && long.includes('(Student \\(7\\)) Tj'), 'pages numbered, parentheses escaped');

db.students[ann].gone = true;
assert.equal(addStudent(db, 'Ann Lee'), ann);
assert.ok(!db.students[ann].gone, 'a removed student who returns is restored');

// --- pulls ---
const p = fresh();
const cy = addStudent(p, 'Cy');
const morning = new Date(2026, 9, 5, 9, 0);
checkIn(p, [cy], ['Morning Jiu-Jitsu'], morning);
assert.deepEqual(waiting(p, '2026-10-19'), { n: 1, from: '2026-10-05', to: '2026-10-05', age: 14 });
assert.equal(waiting(p, '2026-10-01').age, 0, 'a future-dated record is not negative age');
const draft = pullDraft(p, new Date(2026, 9, 5, 12, 0));
assert.ok(!p.checkins[0].p && p.pulls.length === 0 && p.dirty === false, 'the draft never touches the live db');
assert.equal(draft.recs.length, 1);
assert.equal(draft.title, 'Monday, October 5, 2026');
assert.equal(draft.next.checkins[0].p, draft.at);
assert.equal(waiting(draft.next, '2026-10-05'), null);
assert.equal(pullDraft(draft.next, new Date()), null, 'nothing waiting, nothing to pull');
const q = draft.next;
checkIn(q, [cy], ['Morning Jiu-Jitsu'], new Date(2026, 9, 5, 18, 0));
assert.equal(q.checkins.length, 1, 'a class already pulled today adds nothing');
checkIn(q, [cy], ['Morning Jiu-Jitsu', 'MMA'], new Date(2026, 9, 5, 18, 5));
assert.equal(q.checkins.length, 2, 'a new class after a pull is a new record');
assert.deepEqual(q.checkins[0].c, ['Morning Jiu-Jitsu'], 'the pulled record is unchanged');
assert.deepEqual(q.checkins[1].c, ['MMA']);
checkIn(q, [cy], ['Adult Jiu-Jitsu', 'MMA'], new Date(2026, 9, 5, 19, 0));
assert.equal(q.checkins.length, 3, 'a third check-in is its own record');
assert.deepEqual(q.checkins[2].c, ['Adult Jiu-Jitsu']);
assert.match(rosterText(q, '2026-10-05'), /1 checked in/, 'three records, one student');
assert.equal(waiting(q, '2026-10-05').n, 2);

// --- backups ---
const back = readBackup(backupText(q, new Date(2026, 9, 5, 20, 0)));
assert.ok(back && back.dirty === false && back.exportedAt);
assert.deepEqual(back.checkins, q.checkins);
const old = fresh(); delete old.pulls; delete old.dirty; addStudent(old, 'Old Timer');
assert.equal(readBackup(JSON.stringify(old)).pulls.length, 0, 'a db from before pulls existed loads');
assert.equal(readBackup(JSON.stringify(Object.assign({}, q, { pulls: [] }))), null, 'a pulled mark needs its pull');
const bad = (f) => { const b = JSON.parse(backupText(q, new Date())); f(b); return readBackup(JSON.stringify(b)); };
assert.equal(readBackup('not json'), null);
assert.equal(readBackup('[]'), null);
assert.equal(bad((b) => { b.v = 2; }), null, 'wrong schema');
assert.equal(bad((b) => { b.checkins[0].d = '2026-02-30'; }), null, 'impossible date');
assert.equal(bad((b) => { b.checkins[0].t = '25:00'; }), null, 'impossible time');
assert.equal(bad((b) => { b.checkins[0].s = 'constructor'; }), null, 'record for a student not in the file');
assert.equal(bad((b) => { b.checkins[1].p = '2026-10-05T00:00:00.000Z'; }), null, 'pull mark with no pull');
assert.equal(bad((b) => { b.students['1'].name = 'x'.repeat(61); }), null, 'oversize name');
assert.equal(bad((b) => { b.nextId = 1; b.students['7'] = { name: 'Dee' }; }).nextId, 8, 'nextId raised past the highest id');

// --- storage full ---
const full = (limit) => {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    removeItem: (k) => m.delete(k),
    setItem(k, v) {
      const size = [...m].reduce((n, [a, b]) => n + (a === k ? 0 : a.length + b.length), 0) + k.length + v.length;
      if (size > limit) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      m.set(k, v);
    },
  };
};
const big2 = fresh();
const ids = Array.from({ length: 30 }, (_, i) => addStudent(big2, 'Kid ' + i));
for (let d = 1; d <= 6; d++) checkIn(big2, ids, ['MMA'], new Date(2026, 8, d, 18, 0));
const pulled = pullDraft(big2, new Date(2026, 8, 7)).next;
checkIn(pulled, ids, ['MMA'], new Date(2026, 8, 8, 18, 0));
const need = JSON.stringify(pulled).length;
const st = full(need + KEY.length - 400);
assert.equal(persist(full(need + KEY.length), pulled), pulled, 'fits: written as is');
const kept = persist(st, pulled);
assert.ok(kept && kept !== pulled, 'full: a pruned copy was written');
assert.equal(pulled.checkins.length, 210, 'the caller\'s db is untouched');
assert.equal(kept.checkins.filter((r) => !r.p).length, 30, 'unpulled check-ins are never dropped');
assert.equal(kept.freed.from, '2026-09-01', 'oldest day goes first');
assert.ok(kept.checkins.some((r) => r.d === '2026-09-06'), 'only as much as needed');
const one = fresh(); one.classes = []; addStudent(one, 'Z');
assert.ok(JSON.stringify(one).length > 50);
const r2 = full(KEY.length + JSON.stringify(one).length + RESERVE.length + 5);
r2.m.set(RESERVE, 'x'.repeat(100));
assert.ok(persist(r2, one), 'nothing pulled: the reserve is given up instead');
assert.equal(r2.getItem(RESERVE), null);
assert.equal(persist(full(10), one), null, 'nothing left to free: refused');
const denied = { getItem: () => null, removeItem() {}, setItem() { throw Object.assign(new Error('no'), { name: 'SecurityError' }); } };
assert.equal(persist(denied, pulled), null, 'not a quota error: no pruning');

// sw.js: an error page from GitHub falls back to the cached copy.
{
  const on = {}, store = new Map();
  const cache = { put: async (k, v) => store.set(k, v), match: async (k) => store.get(k) };
  const swSelf = { addEventListener: (t, f) => (on[t] = f) };
  let reply;
  new Function('self', 'caches', 'fetch', readFileSync(new URL('./sw.js', import.meta.url), 'utf8'))(
    swSelf, { open: async () => cache }, async () => reply);
  const nav = async () => { let p; on.fetch({ request: { mode: 'navigate' }, respondWith: (x) => (p = x) }); return p; };
  reply = { ok: true, status: 200, clone() { return this; } };
  assert.equal((await nav()).status, 200, 'a good page is served and cached');
  reply = { ok: false, status: 404 };
  assert.equal((await nav()).status, 200, 'a 404 serves the cached copy');
  store.clear();
  assert.equal((await nav()).status, 404, 'nothing cached: the error page is all there is');
}

console.log('checkin: ok');

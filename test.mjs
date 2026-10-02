// node checkin/test.mjs — runs the pure logic block out of index.html.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const src = html.split('// --- logic ---')[1].split('// --- ui ---')[0];
const { fresh, addStudent, checkIn, rosterText, csvText, pdfText, dayOf } =
  new Function(src + '; return { fresh, addStudent, checkIn, rosterText, csvText, pdfText, dayOf };')();

const db = fresh();
const ann = addStudent(db, '  ann   lee ');
assert.equal(db.students[ann].name, 'ann lee');
assert.equal(addStudent(db, 'ANN LEE'), ann, 'same name, any case, is the same student');
const bo = addStudent(db, '=Bo "B" Diaz');

const at = new Date(2026, 9, 2, 18, 5); // local 6:05pm, Oct 2
assert.equal(dayOf(new Date(2026, 9, 2, 23, 59)), '2026-10-02', 'late class stays on its own day');
checkIn(db, [ann, bo], ['MMA'], at);
checkIn(db, [ann], ['MMA', 'Wrestling'], new Date(2026, 9, 2, 19, 0));
assert.equal(db.checkins.length, 2, 'second check-in the same day merges');
assert.deepEqual(db.checkins[0].c, ['MMA', 'Wrestling']);
assert.equal(db.checkins[0].t, '18:05', 'keeps the first arrival time');
assert.deepEqual(db.students[ann].last, ['MMA', 'Wrestling']);

const text = rosterText(db, '2026-10-02');
assert.match(text, /2 checked in/);
assert.match(text, /MMA \(2\)/);
assert.match(text, /Wrestling \(1\)/);
assert.doesNotMatch(text, /Kickboxing/, 'empty classes are left out');
assert.match(rosterText(db, '2026-10-03'), /0 checked in/);

const csv = csvText(db, '2026-10-01', '2026-10-31').trim().split('\r\n');
assert.equal(csv.length, 4, 'header + one row per student per class');
assert.ok(csv.includes('2026-10-02,18:05,"\'=Bo ""B"" Diaz","MMA"'), 'quotes escaped, formula defused');

const pdf = pdfText(text);
assert.ok(pdf.startsWith('%PDF-1.4') && pdf.includes('(  ann lee  18:05) Tj'));
assert.ok(pdf.includes("(  '=Bo \"B\" Diaz  18:05)") === false && pdf.includes('(  =Bo "B" Diaz  18:05)'));
const offsets = [...pdf.split('xref\n')[1].matchAll(/(\d{10}) 00000 n/g)].map((m) => +m[1]);
offsets.forEach((o, i) => assert.ok(pdf.startsWith((i + 1) + ' 0 obj', o), 'xref offset ' + (i + 1)));
assert.equal(+pdf.match(/startxref\n(\d+)/)[1], pdf.indexOf('xref\n0 '));
const long = pdfText(Array.from({ length: 120 }, (_, i) => '  Student (' + i + ')').join('\n'));
assert.equal(long.match(/\/Type \/Page /g).length, 4, '120 names at 37 a page is 4 pages');
assert.ok(long.includes('Student \\(7\\)'), 'parentheses escaped');

db.students[ann].gone = true;
assert.equal(addStudent(db, 'Ann Lee'), ann);
assert.ok(!db.students[ann].gone, 'a removed student who returns is restored');

console.log('checkin: ok');

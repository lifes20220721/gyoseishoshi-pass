import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.dirname(new URL(import.meta.url).pathname);
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), context);
const data = context.window.GYOPASS_DATA;

assert.equal(data.subjects.length, 6);
assert.equal(data.lessons.length, 18);
assert.equal(data.ox.length, 34);
assert.equal(data.five.length, 8);
assert.equal(data.multi.length, 2);
assert.equal(data.written.length, 5);

const subjectIds = new Set(data.subjects.map(item => item.id));
const lessonIds = new Set(data.lessons.map(item => item.id));
const questionIds = [...data.ox, ...data.five, ...data.multi, ...data.written].map(item => item.id);
assert.equal(new Set(questionIds).size, questionIds.length, '教材IDは重複できません');

for (const lesson of data.lessons) {
  assert(subjectIds.has(lesson.subject), `${lesson.id}: 科目が存在しません`);
  assert(lesson.sections.length >= 2, `${lesson.id}: 本文が不足しています`);
  for (const source of lesson.sources) {
    assert(source.url.startsWith('https://laws.e-gov.go.jp/'), `${lesson.id}: e-Gov以外の条文URLです`);
  }
}

for (const question of [...data.ox, ...data.five, ...data.multi, ...data.written]) {
  assert(subjectIds.has(question.subject), `${question.id}: 科目が存在しません`);
  assert(lessonIds.has(question.lessonId), `${question.id}: 関連テキストが存在しません`);
}
for (const question of data.ox) assert.equal(typeof question.answer, 'boolean');
for (const question of data.five) assert(question.answer >= 0 && question.answer < question.options.length);
for (const question of data.multi) assert.equal(question.answer.length, 4);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const file of ['styles.css', 'data.js', 'app.js', 'manifest.webmanifest', 'service-worker.js', 'icons/app-icon.svg']) {
  assert(fs.existsSync(path.join(root, file)), `${file} がありません`);
}
assert(html.includes('https://gyosei-shiken.or.jp/doc/exam/index.html'));
assert(html.includes('公式過去問本文は収録していません'));
assert(fs.readFileSync(path.join(root, 'app.js'), 'utf8').includes("gyoseishoshi-pass:learning:v1"));
assert(!html.includes('shihoshoshi-pass'));

console.log(JSON.stringify({
  passed: true,
  counts: { subjects: data.subjects.length, lessons: data.lessons.length, ox: data.ox.length, five: data.five.length, multi: data.multi.length, written: data.written.length },
  checks: ['unique IDs', 'subject and lesson references', 'answer ranges', 'e-Gov links', 'official past-exam link', 'separate storage key', 'PWA assets']
}, null, 2));

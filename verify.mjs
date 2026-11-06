import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.dirname(new URL(import.meta.url).pathname);
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(path.join(root, 'reinforcement-v0.3.0.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(path.join(root, 'administrative-focus-v0.4.0.js'), 'utf8'), context);
const data = context.window.GYOPASS_DATA;
const reinforcement = context.window.GYOPASS_REINFORCEMENT;
const adminFocus = context.window.GYOPASS_ADMIN_FOCUS;
data.ox.push(...reinforcement.ox);
data.five.push(...reinforcement.five);
data.multi.push(...reinforcement.multi);
data.written.push(...reinforcement.written);
data.version = reinforcement.version;
data.lessons.push(...adminFocus.newLessons);
for (const [id, enhancement] of Object.entries(adminFocus.enhancements)) {
  const lesson = data.lessons.find(item => item.id === id);
  assert(lesson, `${id}: 強化対象の講義がありません`);
  lesson.sections.push(...enhancement.sections);
  lesson.diagrams = [...(lesson.diagrams || []), ...(enhancement.diagrams || [])];
}
data.ox.push(...adminFocus.ox);
data.five.push(...adminFocus.five);
data.multi.push(...adminFocus.multi);
data.written.push(...adminFocus.written);
data.version = adminFocus.version;
const audit = JSON.parse(fs.readFileSync(path.join(root, 'official-topic-audit-v0.3.0.json'), 'utf8'));

assert.equal(data.subjects.length, 6);
assert.equal(data.lessons.length, 20);
assert.equal(data.version, '0.4.0');
assert.equal(data.ox.length, 97);
assert.equal(data.five.length, 22);
assert.equal(data.multi.length, 7);
assert.equal(data.written.length, 13);
assert.equal(audit.questions_reviewed, 300);
assert.equal(audit.distribution.reduce((sum, item) => sum + item.questions, 0), 300);
assert.equal(audit.administrative_law_breakdown.reduce((sum, item) => sum + item.questions, 0), 95);
assert.equal(audit.distribution.find(item => item.area === '基礎法学')?.questions, 10);
assert.equal(audit.distribution.find(item => item.area === '憲法')?.questions, 25);

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
const administrativeLessons = data.lessons.filter(item => item.subject === 'administrative');
assert.equal(administrativeLessons.length, 7);
for (const lesson of administrativeLessons) {
  assert(lesson.sections.length >= 4, `${lesson.id}: 行政法本文が不足しています`);
  assert(lesson.diagrams?.length >= 1, `${lesson.id}: 図解がありません`);
}

for (const question of [...data.ox, ...data.five, ...data.multi, ...data.written]) {
  assert(subjectIds.has(question.subject), `${question.id}: 科目が存在しません`);
  assert(lessonIds.has(question.lessonId), `${question.id}: 関連テキストが存在しません`);
}
for (const question of data.ox) assert.equal(typeof question.answer, 'boolean');
for (const question of data.five) assert(question.answer >= 0 && question.answer < question.options.length);
for (const question of data.multi) assert.equal(question.answer.length, 4);
for (const question of [...reinforcement.ox, ...reinforcement.five, ...reinforcement.multi, ...reinforcement.written]) {
  assert(question.trend, `${question.id}: 過去問傾向情報がありません`);
  assert(question.trend.years.length > 0, `${question.id}: 対象年度がありません`);
  assert.equal(question.trend.sourceUrl, audit.source_url, `${question.id}: 公式出典URLが一致しません`);
}
const focusQuestions = [...adminFocus.ox, ...adminFocus.five, ...adminFocus.multi, ...adminFocus.written];
assert.equal(focusQuestions.length, 46);
for (const question of focusQuestions) {
  assert.equal(question.subject, 'administrative', `${question.id}: 行政法問題ではありません`);
  assert.equal(question.focus, true, `${question.id}: 重点問題フラグがありません`);
  assert.equal(question.trend.sourceUrl, audit.source_url, `${question.id}: 公式出典URLが一致しません`);
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const file of ['styles.css', 'data.js', 'reinforcement-v0.3.0.js', 'administrative-focus-v0.4.0.js', 'official-topic-audit-v0.3.0.json', 'app.js', 'manifest.webmanifest', 'service-worker.js', 'icons/app-icon.svg']) {
  assert(fs.existsSync(path.join(root, file)), `${file} がありません`);
}
assert(html.includes('https://gyosei-shiken.or.jp/doc/exam/index.html'));
assert(html.includes('公式問題本文は転載していません'));
assert(html.includes('reinforcement-v0.3.0.js'));
assert(html.includes('administrative-focus-v0.4.0.js'));
assert(html.includes('公式問題300問を分野別に分析'));
assert(fs.readFileSync(path.join(root, 'app.js'), 'utf8').includes("gyoseishoshi-pass:learning:v1"));
assert(fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8').includes('./reinforcement-v0.3.0.js'));
assert(fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8').includes('./administrative-focus-v0.4.0.js'));
assert(audit.copyright_policy.includes('問題本文は収録せず'));
assert(!html.includes('shihoshoshi-pass'));

console.log(JSON.stringify({
  passed: true,
  counts: { subjects: data.subjects.length, lessons: data.lessons.length, ox: data.ox.length, five: data.five.length, multi: data.multi.length, written: data.written.length },
  checks: ['unique IDs', 'subject and lesson references', 'answer ranges', 'e-Gov links', '7 administrative lessons', '7 diagrams', '46 administrative focus questions', '300-question topic audit', 'trend metadata', 'official past-exam link', 'separate storage key', 'PWA assets']
}, null, 2));

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.dirname(new URL(import.meta.url).pathname);
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(path.join(root, 'reinforcement-v0.3.0.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(path.join(root, 'administrative-focus-v0.4.0.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(path.join(root, 'administrative-trend-v0.5.0.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(path.join(root, 'mega-bank-v1.0.0.js'), 'utf8'), context);
const data = context.window.GYOPASS_DATA;
const reinforcement = context.window.GYOPASS_REINFORCEMENT;
const adminFocus = context.window.GYOPASS_ADMIN_FOCUS;
const adminTrend = context.window.GYOPASS_ADMIN_TREND;
const megaBank = context.window.GYOPASS_MEGA_BANK;
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
data.ox.push(...adminTrend.ox);
data.five.push(...adminTrend.five);
data.multi.push(...adminTrend.multi);
data.written.push(...adminTrend.written);
for (const question of [...data.ox, ...data.five, ...data.multi, ...data.written]) {
  if (question.subject !== 'administrative') continue;
  const priority = adminTrend.priorities[question.lessonId];
  assert(priority, `${question.id}: 重要度設定がありません`);
  question.priority = `${priority.level} ${priority.label}`;
  question.priorityScore = priority.score;
}
data.version = adminTrend.version;
data.ox.push(...megaBank.ox);
data.five.push(...megaBank.five);
data.multi.push(...megaBank.multi);
data.written.push(...megaBank.written);
for (const question of [...megaBank.ox, ...megaBank.five, ...megaBank.multi, ...megaBank.written]) {
  if (question.subject !== 'administrative') continue;
  const priority = adminTrend.priorities[question.lessonId];
  assert(priority, `${question.id}: 重要度設定がありません`);
  question.priority = `${priority.level} ${priority.label}`;
  question.priorityScore = priority.score;
}
data.version = megaBank.version;
const audit = JSON.parse(fs.readFileSync(path.join(root, 'official-topic-audit-v0.3.0.json'), 'utf8'));

assert.equal(data.subjects.length, 6);
assert.equal(data.lessons.length, 20);
assert.equal(data.version, '1.1.0');
assert.equal(data.ox.length, 341);
assert.equal(data.five.length, 506);
assert.equal(data.multi.length, 48);
assert.equal(data.written.length, 105);
assert.equal(data.ox.length + data.five.length + data.multi.length + data.written.length, 1000);
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
const predictedQuestions = [...adminTrend.ox, ...adminTrend.five, ...adminTrend.multi, ...adminTrend.written];
assert.equal(predictedQuestions.length, 11);
const administrativeQuestions = [...data.ox, ...data.five, ...data.multi, ...data.written].filter(question => question.subject === 'administrative');
assert(administrativeQuestions.length >= adminTrend.targetAdminQuestions);
assert.equal(administrativeQuestions.length, 396);
for (const question of administrativeQuestions) {
  assert(question.priority, `${question.id}: 重要度が付与されていません`);
  assert(question.priorityScore > 0, `${question.id}: 重要度スコアがありません`);
}
assert.equal(Object.keys(adminTrend.priorities).length, 7);
assert.deepEqual([...new Set(Object.values(adminTrend.priorities).map(item => item.level))].sort(), ['A', 'S']);
const megaQuestions = [...megaBank.ox, ...megaBank.five, ...megaBank.multi, ...megaBank.written];
assert.equal(megaBank.concepts, 120);
assert.equal(megaQuestions.length, 850);
assert.equal(megaBank.ox.length, 240);
assert.equal(megaBank.five.length, 480);
assert.equal(megaBank.multi.length, 40);
assert.equal(megaBank.written.length, 90);
for (const question of megaQuestions) {
  assert.equal(question.mega, true, `${question.id}: 1000問バンクの印がありません`);
  assert.equal(question.trend.sourceUrl, audit.source_url, `${question.id}: 公式出典URLが一致しません`);
}
for (const question of megaBank.five) {
  assert.equal(question.options.length, 5, `${question.id}: 選択肢が5つではありません`);
  assert.equal(new Set(question.options).size, 5, `${question.id}: 選択肢が重複しています`);
}
for (const question of megaBank.multi) {
  assert.equal(question.words.length, 8, `${question.id}: 語群が8語ではありません`);
  assert.equal(new Set(question.words).size, 8, `${question.id}: 語群が重複しています`);
}
for (const question of megaBank.written) assert(question.model.length <= 80, `${question.id}: 解答例が80字を超えています`);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const adsenseAccountTag = '<meta name="google-adsense-account" content="ca-pub-8976067134459371">';
for (const file of ['CNAME', 'styles.css', 'legal.css', 'data.js', 'reinforcement-v0.3.0.js', 'administrative-focus-v0.4.0.js', 'administrative-trend-v0.5.0.js', 'mega-bank-v1.0.0.js', 'official-topic-audit-v0.3.0.json', 'app.js', 'monetization-config.js', 'monetization.js', 'privacy.html', 'terms.html', 'contact.html', 'sources.html', 'robots.txt', 'sitemap.xml', 'MONETIZATION.md', 'PWA.md', 'ads.txt', 'ads.txt.example', 'manifest.webmanifest', 'service-worker.js', 'icons/app-icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png']) {
  assert(fs.existsSync(path.join(root, file)), `${file} がありません`);
}
assert(html.includes('https://gyosei-shiken.or.jp/doc/exam/index.html'));
assert(html.includes('公式問題本文は転載していません'));
assert(html.includes('reinforcement-v0.3.0.js'));
assert(html.includes('administrative-focus-v0.4.0.js'));
assert(html.includes('administrative-trend-v0.5.0.js'));
assert(html.includes('mega-bank-v1.0.0.js'));
assert(html.includes('公式問題300問を分野別に分析'));
assert(html.includes('全1000問・行政法396問の独自問題バンク'));
assert.equal(fs.readFileSync(path.join(root, 'CNAME'), 'utf8').trim(), 'gyoseishoshipass.com');
assert(html.includes('<link rel="canonical" href="https://gyoseishoshipass.com/">'));
assert(html.includes(adsenseAccountTag));
assert(html.includes('application/ld+json'));
for (const page of ['privacy.html', 'terms.html', 'contact.html', 'sources.html']) {
  assert(html.includes(`href="${page}"`), `${page} へのリンクがありません`);
  assert(fs.readFileSync(path.join(root, page), 'utf8').includes(adsenseAccountTag), `${page} にAdSense確認タグがありません`);
}
assert(html.includes('monetization-config.js'));
assert(html.includes('monetization.js'));
assert(fs.readFileSync(path.join(root, 'app.js'), 'utf8').includes("gyoseishoshi-pass:learning:v1"));
assert(fs.readFileSync(path.join(root, 'app.js'), 'utf8').includes('subjectResume'));
assert(html.includes('科目・分野別に学ぶ'));
assert(html.includes('問題の途中位置は科目ごとに自動保存されます'));
assert(html.includes('data-action="install-app"'));
assert(html.includes('id="installDialog"'));
assert(html.includes('id="networkStatus"'));
assert(html.includes('apple-mobile-web-app-capable'));
assert(html.includes('icons/apple-touch-icon.png'));
const appScript = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert(appScript.includes('beforeinstallprompt'));
assert(appScript.includes('appinstalled'));
assert(appScript.includes("window.addEventListener('offline'"));
assert(appScript.includes("window.addEventListener('online'"));
const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
assert(serviceWorker.includes('./reinforcement-v0.3.0.js'));
assert(serviceWorker.includes('./administrative-focus-v0.4.0.js'));
assert(serviceWorker.includes('./administrative-trend-v0.5.0.js'));
assert(serviceWorker.includes('./mega-bank-v1.0.0.js'));
assert(serviceWorker.includes("request.mode === 'navigate'"));
assert(serviceWorker.includes("request.headers.has('range')"));
for (const file of ['./monetization-config.js', './monetization.js', './privacy.html', './terms.html', './contact.html', './sources.html']) {
  assert(serviceWorker.includes(file), `${file} がオフライン対象ではありません`);
}
for (const file of ['./icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png']) assert(serviceWorker.includes(file), `${file} がオフライン対象ではありません`);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.id, './');
assert.equal(manifest.display, 'standalone');
assert(manifest.categories.includes('education'));
assert(manifest.icons.some(icon => icon.src === 'icons/icon-192.png' && icon.sizes === '192x192'));
assert(manifest.icons.some(icon => icon.src === 'icons/icon-512.png' && icon.sizes === '512x512'));
assert(manifest.icons.some(icon => icon.src === 'icons/maskable-512.png' && icon.purpose === 'maskable'));
function pngDimensions(file) {
  const buffer = fs.readFileSync(path.join(root, file));
  assert.equal(buffer.subarray(1, 4).toString(), 'PNG', `${file} はPNGではありません`);
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}
assert.deepEqual(pngDimensions('icons/icon-192.png'), [192, 192]);
assert.deepEqual(pngDimensions('icons/icon-512.png'), [512, 512]);
assert.deepEqual(pngDimensions('icons/maskable-512.png'), [512, 512]);
assert.deepEqual(pngDimensions('icons/apple-touch-icon.png'), [180, 180]);
assert(fs.readFileSync(path.join(root, 'app.js'), 'utf8').includes("'start-admin-priority'"));
assert(audit.copyright_policy.includes('問題本文は収録せず'));
assert(!html.includes('shihoshoshi-pass'));

const monetizationConfig = fs.readFileSync(path.join(root, 'monetization-config.js'), 'utf8');
const monetization = fs.readFileSync(path.join(root, 'monetization.js'), 'utf8');
assert(monetizationConfig.includes('enabled: false'), '広告ID未設定時は無効である必要があります');
assert(monetizationConfig.includes("adsenseClient: ''"), '架空の広告IDを設定してはいけません');
assert.equal(
  fs.readFileSync(path.join(root, 'ads.txt'), 'utf8').trim(),
  'google.com, pub-8976067134459371, DIRECT, f08c47fec0942fa0',
  'ads.txtのパブリッシャー情報が正しくありません'
);
assert(monetization.includes('pagead2.googlesyndication.com'));
assert(monetization.includes('clientIsValid'));
assert(monetization.includes('gyoseishoshi-pass:advertising-consent:v1'));
assert(!html.includes('pagead2.googlesyndication.com'), '広告同意前に外部広告を直接読み込んではいけません');

const privacy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
const terms = fs.readFileSync(path.join(root, 'terms.html'), 'utf8');
const contact = fs.readFileSync(path.join(root, 'contact.html'), 'utf8');
const sources = fs.readFileSync(path.join(root, 'sources.html'), 'utf8');
assert(privacy.includes('広告・アフィリエイト'));
assert(privacy.includes('localStorage'));
assert(terms.includes('広告・収益化方針'));
assert(terms.includes('免責'));
assert(contact.includes('life.s.20220721@gmail.com'));
assert(contact.includes('gyoseishoshi-pass/issues/new'));
assert(sources.includes('公式過去問本文を収録せず'));
assert(sources.includes('転載に許諾が必要'));
assert(fs.readFileSync(path.join(root, 'robots.txt'), 'utf8').includes('sitemap.xml'));
assert(fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8').includes('<urlset'));
assert(fs.readFileSync(path.join(root, 'MONETIZATION.md'), 'utf8').includes('独自ドメイン'));
assert(fs.readFileSync(path.join(root, 'MONETIZATION.md'), 'utf8').includes('Google AdSense'));

console.log(JSON.stringify({
  passed: true,
  counts: { subjects: data.subjects.length, lessons: data.lessons.length, ox: data.ox.length, five: data.five.length, multi: data.multi.length, written: data.written.length },
  checks: ['exactly 1000 questions', 'unique IDs', 'subject and lesson references', 'answer ranges', '5 unique options', '8 unique multi-choice words', 'written answer length', 'e-Gov links', '7 administrative lessons', '7 diagrams', '396 administrative questions', '120-concept mega bank', 'S/A priority metadata', '300-question topic audit', 'SEO canonical and sitemap', 'privacy and terms pages', 'operator and source disclosure', 'consent-gated ad loader', 'empty ad ID by default', 'subject-specific quiz resume', 'separate storage keys', 'PWA install flow', 'offline navigation', 'PNG and maskable icons']
}, null, 2));

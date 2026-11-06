'use strict';

(() => {
  const DATA = window.GYOPASS_DATA;
  const reinforcement = window.GYOPASS_REINFORCEMENT;
  if (reinforcement && !DATA.reinforcementLoaded) {
    DATA.ox.push(...reinforcement.ox);
    DATA.five.push(...reinforcement.five);
    DATA.multi.push(...reinforcement.multi);
    DATA.written.push(...reinforcement.written);
    DATA.version = reinforcement.version;
    DATA.reinforcementLoaded = true;
  }
  const adminFocus = window.GYOPASS_ADMIN_FOCUS;
  if (adminFocus && !DATA.adminFocusLoaded) {
    DATA.lessons.push(...adminFocus.newLessons);
    Object.entries(adminFocus.enhancements).forEach(([id, enhancement]) => {
      const lesson = DATA.lessons.find(item => item.id === id);
      if (!lesson) return;
      lesson.sections.push(...enhancement.sections);
      lesson.diagrams = [...(lesson.diagrams || []), ...(enhancement.diagrams || [])];
    });
    const orderedAdmin = adminFocus.lessonOrder.map(id => DATA.lessons.find(item => item.id === id)).filter(Boolean);
    const otherLessons = DATA.lessons.filter(item => item.subject !== 'administrative');
    DATA.lessons.splice(0, DATA.lessons.length, ...orderedAdmin, ...otherLessons);
    DATA.ox.push(...adminFocus.ox);
    DATA.five.push(...adminFocus.five);
    DATA.multi.push(...adminFocus.multi);
    DATA.written.push(...adminFocus.written);
    DATA.version = adminFocus.version;
    DATA.adminFocusLoaded = true;
    const administrative = DATA.subjects.find(item => item.id === 'administrative');
    if (administrative) administrative.description = '総論・行政作用・手続・救済・国家賠償・地方自治';
  }
  const adminTrend = window.GYOPASS_ADMIN_TREND;
  if (adminTrend && !DATA.adminTrendLoaded) {
    DATA.ox.push(...adminTrend.ox);
    DATA.five.push(...adminTrend.five);
    DATA.multi.push(...adminTrend.multi);
    DATA.written.push(...adminTrend.written);
    [...DATA.ox, ...DATA.five, ...DATA.multi, ...DATA.written].forEach(question => {
      if (question.subject !== 'administrative') return;
      const priority = adminTrend.priorities[question.lessonId];
      if (!priority) return;
      question.priority = `${priority.level} ${priority.label}`;
      question.priorityLevel = priority.level;
      question.priorityScore = priority.score;
      question.priorityRank = priority.rank;
      question.priorityForecast = priority.forecast;
      question.priorityReason = priority.reason;
    });
    const byPriority = (a, b) => (b.priorityScore || 0) - (a.priorityScore || 0) || String(a.id).localeCompare(String(b.id));
    DATA.multi.sort(byPriority);
    DATA.written.sort(byPriority);
    DATA.version = adminTrend.version;
    DATA.adminTrendLoaded = true;
  }
  const STORAGE_KEY = 'gyoseishoshi-pass:learning:v1';
  const VIEWS = ['home', 'texts', 'lesson', 'quiz', 'multi', 'written', 'stats'];
  const DEFAULT_STATE = {
    schema: 1,
    answers: {},
    wrong: [],
    textRead: [],
    writtenDrafts: {},
    multiAnswers: {},
    resume: null
  };

  let state = loadState();
  let route = 'home';
  let lessonId = null;
  let deferredInstall = null;
  let toastTimer = null;
  let session = { mode: 'ox', questions: [], index: 0, subject: 'all', returnToQuiz: false, originLessonId: null, attempted: new Set() };
  let multiIndex = 0;
  let writtenIndex = 0;
  let multiSelection = [];

  const $ = id => document.getElementById(id);
  const subjectById = id => DATA.subjects.find(subject => subject.id === id);
  const lessonById = id => DATA.lessons.find(lesson => lesson.id === id);
  const allPractice = () => [...DATA.ox, ...DATA.five];

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!parsed || parsed.schema !== 1 || typeof parsed.answers !== 'object') return structuredClone(DEFAULT_STATE);
      return { ...structuredClone(DEFAULT_STATE), ...parsed };
    } catch (_) {
      return structuredClone(DEFAULT_STATE);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function setResume(type, data = {}) {
    state.resume = { type, data, at: new Date().toISOString() };
    saveState();
  }

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 2600);
  }

  function showRoute(nextRoute, options = {}) {
    route = nextRoute;
    VIEWS.forEach(name => $(`${name}View`).classList.toggle('hidden', name !== nextRoute));
    if (nextRoute === 'home') renderHome();
    if (nextRoute === 'texts') renderTexts();
    if (nextRoute === 'stats') renderStats();
    window.scrollTo({ top: 0, behavior: options.instant ? 'auto' : 'smooth' });
    document.title = `${routeTitle(nextRoute)} | 行政書士PASS`;
  }

  function routeTitle(name) {
    return ({ home: '行政書士PASS', texts: '科目別テキスト', lesson: 'テキスト', quiz: '問題演習', multi: '多肢選択式', written: '40字記述式', stats: '科目別成績' })[name];
  }

  function answeredEntries() {
    return Object.values(state.answers);
  }

  function accuracy(entries = answeredEntries()) {
    return entries.length ? Math.round(entries.filter(item => item.correct).length / entries.length * 100) : 0;
  }

  function renderHome() {
    const answered = answeredEntries();
    $('homeStats').innerHTML = `
      <div class="stat"><strong>${answered.length}</strong><span>解答済み</span></div>
      <div class="stat"><strong>${accuracy()}%</strong><span>正答率</span></div>
      <div class="stat"><strong>${state.textRead.length}/${DATA.lessons.length}</strong><span>読了テキスト</span></div>`;
    $('wrongMenuCount').textContent = `未復習 ${state.wrong.length}問`;
    renderResume();
  }

  function renderResume() {
    const card = $('resumeCard');
    if (!state.resume || state.resume.type === 'home') {
      card.classList.add('hidden');
      return;
    }
    const label = resumeLabel(state.resume);
    card.replaceChildren();
    const p = document.createElement('p');
    p.innerHTML = `<strong>前回の続きがあります</strong><br><span>${label}</span>`;
    const resume = document.createElement('button');
    resume.className = 'primary';
    resume.type = 'button';
    resume.textContent = '続きから再開';
    resume.dataset.action = 'resume';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = '途中位置を消す';
    clear.dataset.action = 'clear-resume';
    card.append(p, resume, clear);
    card.classList.remove('hidden');
  }

  function resumeLabel(item) {
    if (item.type === 'lesson') return `テキスト「${lessonById(item.data.lessonId)?.title || ''}」`;
    if (item.type === 'quiz') return `${modeTitle(item.data.mode)} ${Number(item.data.index || 0) + 1}問目`;
    if (item.type === 'multi') return `多肢選択式 ${Number(item.data.index || 0) + 1}問目`;
    if (item.type === 'written') return `40字記述式 ${Number(item.data.index || 0) + 1}問目`;
    return '前回の学習';
  }

  function resumeProgress() {
    const saved = state.resume;
    if (!saved) return;
    if (saved.type === 'lesson') return openLesson(saved.data.lessonId);
    if (saved.type === 'quiz') return startQuiz(saved.data.mode, { subject: saved.data.subject, index: saved.data.index, originLessonId: saved.data.originLessonId });
    if (saved.type === 'multi') { multiIndex = saved.data.index || 0; renderMulti(); return; }
    if (saved.type === 'written') { writtenIndex = saved.data.index || 0; renderWritten(); }
  }

  function renderTexts() {
    const root = $('subjectList');
    root.replaceChildren();
    DATA.subjects.forEach(subject => {
      const lessons = DATA.lessons.filter(item => item.subject === subject.id);
      const card = document.createElement('article');
      card.className = 'subject-card';
      const summary = document.createElement('button');
      summary.className = 'subject-summary';
      summary.type = 'button';
      summary.setAttribute('aria-expanded', 'false');
      summary.innerHTML = `<span><strong>${subject.name}</strong><small>${subject.description}</small></span><span>${lessons.length}講義 ＋</span>`;
      const list = document.createElement('div');
      list.className = 'lesson-list hidden';
      lessons.forEach((lesson, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'lesson-link';
        button.dataset.lesson = lesson.id;
        const read = state.textRead.includes(lesson.id) ? '読了' : `${index + 1}`;
        button.innerHTML = `<strong>${lesson.title}</strong><span>${read}　›</span>`;
        list.append(button);
      });
      summary.addEventListener('click', () => {
        const open = list.classList.toggle('hidden') === false;
        summary.setAttribute('aria-expanded', String(open));
        summary.lastElementChild.textContent = `${lessons.length}講義 ${open ? '−' : '＋'}`;
      });
      card.append(summary, list);
      root.append(card);
    });
  }

  function openLesson(id, options = {}) {
    const lesson = lessonById(id);
    if (!lesson) return showToast('テキストが見つかりません。');
    lessonId = id;
    session.returnToQuiz = Boolean(options.returnToQuiz);
    if (!state.textRead.includes(id)) state.textRead.push(id);
    saveState();
    $('lessonSubject').textContent = subjectById(lesson.subject).name;
    $('lessonTitle').textContent = lesson.title;
    $('lessonLead').textContent = lesson.lead;
    const body = $('lessonBody');
    body.replaceChildren();
    lesson.sections.forEach(section => {
      const heading = document.createElement('h3');
      heading.textContent = section.title;
      const paragraph = document.createElement('p');
      paragraph.textContent = section.body;
      body.append(heading, paragraph);
    });
    (lesson.diagrams || []).forEach(diagram => body.append(renderLessonDiagram(diagram)));
    $('lessonPoint').innerHTML = `<strong>確認ポイント</strong><br>${lesson.point}`;
    const sources = $('lessonSources');
    sources.replaceChildren();
    lesson.sources.forEach(source => {
      const link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `${source.label}をe-Govで開く ↗`;
      sources.append(link);
    });
    if (!lesson.sources.length) sources.textContent = 'この講義には個別の参照条文リンクはありません。';
    const back = document.querySelector('[data-action="back-to-texts"]');
    back.textContent = session.returnToQuiz ? '← 問題へ戻る' : '← 科目一覧';
    setResume('lesson', { lessonId: id });
    showRoute('lesson');
    updateLessonNav();
  }

  function renderLessonDiagram(diagram) {
    const figure = document.createElement('figure');
    figure.className = `lesson-diagram ${diagram.type === 'flow' ? 'flow-diagram' : 'compare-diagram'}`;
    const label = document.createElement('p');
    label.className = 'diagram-label';
    label.textContent = '図解';
    const title = document.createElement('h3');
    title.textContent = diagram.title;
    const content = document.createElement('div');
    content.className = 'diagram-content';
    if (diagram.type === 'flow') {
      diagram.items.forEach((item, index) => {
        const step = document.createElement('div');
        step.className = 'diagram-step';
        step.textContent = item;
        content.append(step);
        if (index < diagram.items.length - 1) {
          const arrow = document.createElement('span');
          arrow.className = 'diagram-arrow';
          arrow.setAttribute('aria-hidden', 'true');
          arrow.textContent = '→';
          content.append(arrow);
        }
      });
    } else {
      diagram.groups.forEach(group => {
        const card = document.createElement('section');
        card.className = 'diagram-group';
        const heading = document.createElement('strong');
        heading.textContent = group.title;
        const list = document.createElement('ul');
        group.items.forEach(item => {
          const row = document.createElement('li');
          row.textContent = item;
          list.append(row);
        });
        card.append(heading, list);
        content.append(card);
      });
    }
    const caption = document.createElement('figcaption');
    caption.textContent = diagram.caption;
    figure.append(label, title, content, caption);
    return figure;
  }

  function updateLessonNav() {
    const index = DATA.lessons.findIndex(item => item.id === lessonId);
    document.querySelector('[data-action="lesson-prev"]').disabled = index <= 0;
    document.querySelector('[data-action="lesson-next"]').disabled = index >= DATA.lessons.length - 1;
  }

  function moveLesson(direction) {
    const index = DATA.lessons.findIndex(item => item.id === lessonId);
    const next = DATA.lessons[index + direction];
    if (next) openLesson(next.id);
  }

  function modeTitle(mode) {
    return ({ ox: '一問一答', five: '5肢択一', quick: 'クイック演習', review: '間違い復習', lesson: '関連問題' })[mode] || '問題演習';
  }

  function questionsFor(mode, subject = 'all', originLessonId = null) {
    let questions;
    if (mode === 'five') questions = [...DATA.five];
    else if (mode === 'review') questions = allPractice().filter(item => state.wrong.includes(item.id));
    else if (mode === 'quick') questions = deterministicShuffle(allPractice()).slice(0, 10);
    else if (mode === 'lesson') questions = allPractice().filter(item => item.lessonId === originLessonId);
    else questions = [...DATA.ox];
    if (subject !== 'all' && mode !== 'review' && mode !== 'lesson') questions = questions.filter(item => item.subject === subject);
    if (subject === 'administrative' && !['review', 'lesson'].includes(mode)) {
      questions.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0) || String(a.id).localeCompare(String(b.id)));
    }
    return questions;
  }

  function deterministicShuffle(items) {
    const day = Math.floor(Date.now() / 86400000);
    return [...items].sort((a, b) => hash(`${a.id}${day}`) - hash(`${b.id}${day}`));
  }

  function hash(text) {
    let value = 0;
    for (const char of text) value = ((value << 5) - value + char.charCodeAt(0)) | 0;
    return value;
  }

  function startQuiz(mode, options = {}) {
    const subject = options.subject || 'all';
    const originLessonId = options.originLessonId || null;
    const questions = questionsFor(mode, subject, originLessonId);
    if (!questions.length) {
      showToast(mode === 'review' ? '復習する問題はまだありません。' : 'この範囲の問題はまだありません。');
      return;
    }
    session = { mode, questions, index: Math.min(Number(options.index) || 0, questions.length - 1), subject, returnToQuiz: false, originLessonId, attempted: new Set() };
    setupSubjectSelect();
    renderQuestion();
    showRoute('quiz');
  }

  function setupSubjectSelect() {
    const select = $('quizSubject');
    select.replaceChildren(new Option('全科目', 'all'));
    DATA.subjects.forEach(subject => select.add(new Option(subject.name, subject.id)));
    select.value = session.subject;
    select.disabled = ['review', 'lesson'].includes(session.mode);
    $('quizModeLabel').textContent = session.mode === 'review' ? 'REVIEW' : 'PRACTICE';
    $('quizHeading').textContent = modeTitle(session.mode);
  }

  function renderQuestion() {
    const question = session.questions[session.index];
    if (!question) return;
    const savedAnswer = state.answers[question.id];
    const saved = session.mode === 'review' && !session.attempted.has(question.id) ? null : savedAnswer;
    $('quizCounter').textContent = `${session.index + 1} / ${session.questions.length}`;
    $('quizProgress').value = (session.index + 1) / session.questions.length * 100;
    $('questionMeta').innerHTML = `<span>${subjectById(question.subject).name}</span><span>${question.type === 'ox' ? '○×' : '5肢択一'}</span><span>オリジナル</span>${question.priority ? `<span class="priority-badge priority-${question.priorityLevel.toLowerCase()}">${question.priority}</span>` : question.focus ? '<span>行政法重点</span>' : question.trend ? '<span>過去問傾向補強</span>' : ''}`;
    $('questionText').textContent = question.text;
    const options = $('questionOptions');
    options.replaceChildren();
    const optionTexts = question.type === 'ox' ? ['○　正しい', '×　誤り'] : question.options;
    optionTexts.forEach((text, index) => {
      const value = question.type === 'ox' ? index === 0 : index;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'option-button';
      button.dataset.answer = String(value);
      button.textContent = question.type === 'five' ? `${index + 1}. ${text}` : text;
      if (saved) styleAnsweredButton(button, question, value, saved);
      options.append(button);
    });
    renderFeedback(question, saved);
    $('previousQuestion').disabled = session.index === 0;
    $('nextQuestion').textContent = session.index === session.questions.length - 1 ? '結果を確認' : '次の問題 →';
    setResume('quiz', { mode: session.mode, index: session.index, subject: session.subject, originLessonId: session.originLessonId });
  }

  function styleAnsweredButton(button, question, value, saved) {
    button.disabled = true;
    const isAnswer = value === question.answer;
    const isSelection = value === saved.selection;
    if (isAnswer) button.classList.add('correct');
    else if (isSelection) button.classList.add('wrong');
  }

  function answerQuestion(rawValue) {
    const question = session.questions[session.index];
    if (state.answers[question.id] && session.mode !== 'review') return;
    if (session.mode === 'review' && session.attempted.has(question.id)) return;
    const selection = question.type === 'ox' ? rawValue === 'true' : Number(rawValue);
    const correct = selection === question.answer;
    state.answers[question.id] = { questionId: question.id, subject: question.subject, type: question.type, selection, correct, at: new Date().toISOString() };
    session.attempted.add(question.id);
    state.wrong = state.wrong.filter(id => id !== question.id);
    if (!correct) state.wrong.push(question.id);
    saveState();
    renderQuestion();
  }

  function renderFeedback(question, saved) {
    const box = $('questionFeedback');
    if (!saved) {
      box.replaceChildren();
      box.className = 'feedback hidden';
      return;
    }
    box.className = `feedback ${saved.correct ? 'correct' : 'wrong'}`;
    const lesson = lessonById(question.lessonId);
    box.innerHTML = `<h4>${saved.correct ? '正解です' : 'もう一度確認しましょう'}</h4><p>${question.explanation}</p><p><strong>根拠：</strong>${lesson?.title || '関連教材'}</p>`;
    if (lesson?.sources[0]) {
      const link = document.createElement('a');
      link.href = lesson.sources[0].url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `${lesson.sources[0].label}をe-Govで確認 ↗`;
      box.append(link);
    }
    appendTrendNote(box, question);
  }

  function appendTrendNote(parent, item) {
    if (!item.trend) return;
    const note = document.createElement('aside');
    note.className = 'trend-note';
    const title = document.createElement('strong');
    title.textContent = '過去問傾向との対応';
    if (item.priority) {
      const priority = document.createElement('p');
      priority.className = 'priority-reason';
      priority.textContent = `重要度 ${item.priority}・${item.priorityForecast}：${item.priorityReason}`;
      note.append(title, priority);
    } else {
      note.append(title);
    }
    const detail = document.createElement('p');
    detail.textContent = `${item.trend.years.join('・')}年度の公式問題で扱われた「${item.trend.scope}」を補強する独自問題です。問題文は転載していません。`;
    const link = document.createElement('a');
    link.href = item.trend.sourceUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '公式の過去の試験問題と正解を開く ↗';
    note.append(detail, link);
    parent.append(note);
  }

  function moveQuestion(direction) {
    const next = session.index + direction;
    if (next < 0) return;
    if (next >= session.questions.length) {
      showToast(`演習完了：${session.questions.length}問中 ${session.questions.filter(q => state.answers[q.id]?.correct).length}問正解`);
      showRoute('stats');
      return;
    }
    session.index = next;
    renderQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderMulti() {
    const item = DATA.multi[multiIndex];
    const saved = state.multiAnswers[item.id];
    multiSelection = saved?.selection ? [...saved.selection] : [];
    const root = $('multiContent');
    root.replaceChildren();
    const meta = document.createElement('div');
    meta.className = 'question-meta';
    meta.innerHTML = `<span>${subjectById(item.subject).name}</span><span>${multiIndex + 1} / ${DATA.multi.length}</span><span>オリジナル</span>${item.priority ? `<span class="priority-badge priority-${item.priorityLevel.toLowerCase()}">${item.priority}</span>` : item.focus ? '<span>行政法重点</span>' : item.trend ? '<span>過去問傾向補強</span>' : ''}`;
    const title = document.createElement('h3');
    title.textContent = item.title;
    const prompt = document.createElement('p');
    prompt.className = 'written-prompt';
    prompt.textContent = item.text;
    const answer = document.createElement('div');
    answer.id = 'multiAnswerLine';
    answer.className = 'blank-answer';
    const bank = document.createElement('div');
    bank.className = 'word-bank';
    item.words.forEach(word => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.multiWord = word;
      button.textContent = word;
      if (multiSelection.includes(word)) button.classList.add('active');
      if (saved) button.disabled = true;
      bank.append(button);
    });
    const check = document.createElement('button');
    check.type = 'button';
    check.className = 'primary';
    check.dataset.action = 'multi-check';
    check.textContent = '解答する';
    check.disabled = Boolean(saved);
    root.append(meta, title, prompt, answer, bank, check);
    updateMultiAnswerLine();
    if (saved) appendMultiFeedback(root, item, saved.correct);
    setResume('multi', { index: multiIndex });
    showRoute('multi');
  }

  function toggleMultiWord(word) {
    if (multiSelection.includes(word)) multiSelection = multiSelection.filter(item => item !== word);
    else if (multiSelection.length < 4) multiSelection.push(word);
    else return showToast('選べる語句は4つです。');
    document.querySelectorAll('[data-multi-word]').forEach(button => button.classList.toggle('active', multiSelection.includes(button.dataset.multiWord)));
    updateMultiAnswerLine();
  }

  function updateMultiAnswerLine() {
    const line = $('multiAnswerLine');
    if (line) line.textContent = ['A', 'B', 'C', 'D'].map((label, index) => `［${label}］${multiSelection[index] || '＿＿'}`).join('　');
  }

  function checkMulti() {
    if (multiSelection.length !== 4) return showToast('A〜Dに入る4語を順番に選んでください。');
    const item = DATA.multi[multiIndex];
    const correct = item.answer.every((answer, index) => answer === multiSelection[index]);
    state.multiAnswers[item.id] = { selection: [...multiSelection], correct, at: new Date().toISOString() };
    saveState();
    renderMulti();
  }

  function appendMultiFeedback(root, item, correct) {
    const box = document.createElement('div');
    box.className = `feedback ${correct ? 'correct' : 'wrong'}`;
    box.innerHTML = `<h4>${correct ? '正解です' : '解答を確認しましょう'}</h4><p><strong>正答：</strong>${item.answer.join(' ／ ')}</p><p>${item.explanation}</p>`;
    appendTrendNote(box, item);
    root.append(box);
  }

  function moveMulti(direction) {
    multiIndex = (multiIndex + direction + DATA.multi.length) % DATA.multi.length;
    renderMulti();
  }

  function renderWritten() {
    const item = DATA.written[writtenIndex];
    const draft = state.writtenDrafts[item.id] || { text: '', revealed: false };
    const root = $('writtenContent');
    root.replaceChildren();
    const meta = document.createElement('div');
    meta.className = 'question-meta';
    meta.innerHTML = `<span>${subjectById(item.subject).name}</span><span>${writtenIndex + 1} / ${DATA.written.length}</span><span>オリジナル</span>${item.priority ? `<span class="priority-badge priority-${item.priorityLevel.toLowerCase()}">${item.priority}</span>` : item.focus ? '<span>行政法重点</span>' : item.trend ? '<span>過去問傾向補強</span>' : ''}`;
    const title = document.createElement('h3');
    title.textContent = item.title;
    const prompt = document.createElement('p');
    prompt.className = 'written-prompt';
    prompt.textContent = item.prompt;
    const textarea = document.createElement('textarea');
    textarea.id = 'writtenAnswer';
    textarea.className = 'written-area';
    textarea.maxLength = 80;
    textarea.placeholder = 'ここに答案を入力（目安40字）';
    textarea.value = draft.text;
    const counter = document.createElement('p');
    counter.id = 'writtenCount';
    counter.className = 'char-count';
    counter.textContent = `${[...draft.text].length}字 / 目安40字`;
    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.className = 'primary';
    reveal.dataset.action = 'written-reveal';
    reveal.textContent = draft.revealed ? '解答例を表示中' : '解答例・採点ポイントを見る';
    reveal.disabled = draft.revealed;
    root.append(meta, title, prompt, textarea, counter, reveal);
    if (draft.revealed) appendWrittenModel(root, item);
    setResume('written', { index: writtenIndex });
    showRoute('written');
  }

  function updateWritten(text) {
    const item = DATA.written[writtenIndex];
    state.writtenDrafts[item.id] = { ...(state.writtenDrafts[item.id] || {}), text };
    saveState();
    $('writtenCount').textContent = `${[...text].length}字 / 目安40字`;
  }

  function revealWritten() {
    const item = DATA.written[writtenIndex];
    const draft = state.writtenDrafts[item.id] || { text: '' };
    state.writtenDrafts[item.id] = { ...draft, revealed: true, at: new Date().toISOString() };
    saveState();
    renderWritten();
  }

  function appendWrittenModel(root, item) {
    const box = document.createElement('div');
    box.className = 'model-answer';
    const list = item.points.map(point => `<li>${point}</li>`).join('');
    box.innerHTML = `<strong>解答例</strong><p>${item.model}</p><strong>自己採点ポイント</strong><ul>${list}</ul><p>${item.explanation}</p>`;
    appendTrendNote(box, item);
    root.append(box);
  }

  function moveWritten(direction) {
    writtenIndex = (writtenIndex + direction + DATA.written.length) % DATA.written.length;
    renderWritten();
  }

  function renderStats() {
    const root = $('statsContent');
    root.replaceChildren();
    DATA.subjects.forEach(subject => {
      const entries = answeredEntries().filter(item => item.subject === subject.id);
      const correct = entries.filter(item => item.correct).length;
      const rate = accuracy(entries);
      const panel = document.createElement('article');
      panel.className = 'panel stats-subject';
      panel.innerHTML = `<div class="stats-row"><div><strong>${subject.name}</strong><p class="muted">${entries.length}問解答・${correct}問正解</p></div><strong>${rate}%</strong></div><div class="stats-bar" aria-label="正答率${rate}%"><span style="width:${rate}%"></span></div>`;
      root.append(panel);
    });
    const note = document.createElement('p');
    note.className = 'basis-note';
    note.textContent = '成績は○×・5肢択一の直近の解答を集計しています。問題を解き直すと更新されます。';
    root.append(note);
  }

  function exportBackup() {
    const payload = { app: 'gyoseishoshi-pass', exportedAt: new Date().toISOString(), version: DATA.version, state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gyoseishoshi-pass-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('バックアップを保存しました。');
  }

  async function importBackup(file) {
    try {
      const payload = JSON.parse(await file.text());
      if (payload.app !== 'gyoseishoshi-pass' || payload.state?.schema !== 1 || typeof payload.state.answers !== 'object') throw new Error('invalid');
      state = { ...structuredClone(DEFAULT_STATE), ...payload.state };
      saveState();
      renderHome();
      showToast('学習データを復元しました。');
    } catch (_) {
      showToast('このファイルは行政書士PASSのバックアップではありません。');
    } finally {
      $('importFile').value = '';
    }
  }

  function installHelp() {
    alert('iPhone / iPad（Safari）: 共有ボタン →「ホーム画面に追加」\n\nAndroid（Chrome）: メニュー →「アプリをインストール」または「ホーム画面に追加」\n\n表示されない場合は、GitHub PagesなどHTTPSの公開URLで開いてください。');
  }

  function resetLearning() {
    if (!confirm('解答履歴・復習リスト・記述答案をすべて削除します。元に戻せません。よろしいですか？')) return;
    state = structuredClone(DEFAULT_STATE);
    saveState();
    renderHome();
    showRoute('home');
    showToast('学習履歴を初期化しました。');
  }

  function onClick(event) {
    const routeButton = event.target.closest('[data-route]');
    if (routeButton) return showRoute(routeButton.dataset.route);
    const lessonButton = event.target.closest('[data-lesson]');
    if (lessonButton) return openLesson(lessonButton.dataset.lesson);
    const answerButton = event.target.closest('[data-answer]');
    if (answerButton) return answerQuestion(answerButton.dataset.answer);
    const wordButton = event.target.closest('[data-multi-word]');
    if (wordButton) return toggleMultiWord(wordButton.dataset.multiWord);
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    const actions = {
      'start-quick': () => startQuiz('quick'),
      'start-admin-priority': () => startQuiz('ox', { subject: 'administrative' }),
      'start-ox': () => startQuiz('ox'),
      'start-five': () => startQuiz('five'),
      'start-review': () => startQuiz('review'),
      'start-multi': () => { multiIndex = 0; renderMulti(); },
      'start-written': () => { writtenIndex = 0; renderWritten(); },
      'resume': resumeProgress,
      'clear-resume': () => { state.resume = null; saveState(); renderResume(); },
      'back-to-texts': () => session.returnToQuiz ? (renderQuestion(), showRoute('quiz')) : showRoute('texts'),
      'lesson-prev': () => moveLesson(-1),
      'lesson-next': () => moveLesson(1),
      'lesson-quiz': () => startQuiz('lesson', { originLessonId: lessonId }),
      'question-prev': () => moveQuestion(-1),
      'question-next': () => moveQuestion(1),
      'related-text': () => openLesson(session.questions[session.index].lessonId, { returnToQuiz: true }),
      'multi-check': checkMulti,
      'multi-prev': () => moveMulti(-1),
      'multi-next': () => moveMulti(1),
      'written-reveal': revealWritten,
      'written-prev': () => moveWritten(-1),
      'written-next': () => moveWritten(1),
      'export': exportBackup,
      'install-help': installHelp,
      'reset': resetLearning
    };
    actions[action]?.();
  }

  function registerPwa() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstall = event;
      $('installButton').classList.remove('hidden');
    });
    $('installButton').addEventListener('click', async () => {
      if (!deferredInstall) return installHelp();
      deferredInstall.prompt();
      await deferredInstall.userChoice;
      deferredInstall = null;
      $('installButton').classList.add('hidden');
    });
  }

  document.addEventListener('click', onClick);
  $('quizSubject').addEventListener('change', event => startQuiz(session.mode, { subject: event.target.value }));
  $('importFile').addEventListener('change', event => event.target.files[0] && importBackup(event.target.files[0]));
  document.addEventListener('input', event => {
    if (event.target.id === 'writtenAnswer') updateWritten(event.target.value);
  });
  registerPwa();
  renderHome();
  showRoute('home', { instant: true });
})();

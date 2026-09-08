import { loadTokenizer, analyze } from './tokenizer.js?v=DEV';
import { renderLines } from './render.js?v=DEV';
import { loadCurriculum, getLessons, getLesson, wordForm } from './curriculum.js?v=DEV';
import { getLessonState, recordAttempt, recordAnswer, isUnlocked, PASS_SCORE } from './progress.js?v=DEV';
import { buildQuiz } from './practice.js?v=DEV';

const $ = (id) => document.getElementById(id);
const el = {
  loading: $('loading'), loadingTitle: $('loadingTitle'), barFill: $('barFill'),
  view: $('view'), title: $('pageTitle'), back: $('backBtn'),
  kanaToggle: $('kanaToggle'), kanaWrap: $('kanaToggleWrap'),
};

let tokenizer = null;
let backAction = null;

/** 把日文字串渲染成帶假名與詞性顏色的節點 */
function jp(text, cls = '') {
  const box = document.createElement('div');
  box.className = 'jp ' + cls;
  renderLines(box, analyze(tokenizer, text));
  return box;
}

const node = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function setView(title, back) {
  el.title.textContent = title;
  backAction = back;
  el.back.hidden = !back;
  el.view.replaceChildren();
  window.scrollTo(0, 0);
}

// ── 首頁：課程列表 ────────────────────────────────────────
function renderHome() {
  setView('日文課程', null);

  const lessons = getLessons();
  const doneCount = lessons.filter((l) => getLessonState(l.id).done).length;

  const summary = node('p', 'summary', `已完成 ${doneCount} / ${lessons.length} 課`);
  el.view.appendChild(summary);

  for (const lesson of lessons) {
    const state = getLessonState(lesson.id);
    const unlocked = isUnlocked(lesson.id);

    const card = node('button', 'lesson-card' + (unlocked ? '' : ' locked'));
    card.disabled = !unlocked;

    const head = node('div', 'lesson-head');
    head.appendChild(node('span', 'lesson-no', `第 ${lesson.id} 課`));
    if (state.done) head.appendChild(node('span', 'badge done', `最佳 ${state.best}%`));
    else if (!unlocked) head.appendChild(node('span', 'badge', '未解鎖'));
    card.appendChild(head);

    card.appendChild(node('div', 'lesson-title', lesson.title));
    card.appendChild(node('div', 'lesson-pattern', lesson.pattern));

    card.addEventListener('click', () => renderLesson(lesson.id));
    el.view.appendChild(card);
  }

  if (doneCount < lessons.length && !isUnlocked(2)) {
    el.view.appendChild(node('p', 'note', '完成一課之後，下一課才會解鎖。'));
  }
}

// ── 課程頁：單字 / 文法 / 練習 ────────────────────────────
function renderLesson(id, tab = 'vocab') {
  const lesson = getLesson(id);
  setView(`第 ${lesson.id} 課`, renderHome);

  el.view.appendChild(node('h2', 'lesson-h2', lesson.title));
  el.view.appendChild(node('p', 'goal', lesson.goal));

  const tabs = node('div', 'tabs');
  for (const [key, label] of [['vocab', '單字'], ['grammar', '文法'], ['quiz', '練習']]) {
    const b = node('button', 'tab' + (key === tab ? ' active' : ''), label);
    b.addEventListener('click', () => renderLesson(id, key));
    tabs.appendChild(b);
  }
  el.view.appendChild(tabs);

  const body = node('div', 'tab-body');
  el.view.appendChild(body);

  if (tab === 'vocab') renderVocab(body, lesson);
  else if (tab === 'grammar') renderGrammar(body, lesson);
  else startQuiz(lesson);
}

function renderVocab(box, lesson) {
  for (const v of lesson.vocab) {
    const row = node('div', 'vocab-row');
    row.appendChild(jp(wordForm(v), 'vocab-jp'));
    // 讀音已經標在漢字上方，右側不再重複顯示假名
    row.appendChild(node('div', 'vocab-zh', v.zh));
    box.appendChild(row);
  }
  const next = node('button', 'primary wide', '看文法 →');
  next.addEventListener('click', () => renderLesson(lesson.id, 'grammar'));
  box.appendChild(next);
}

function renderGrammar(box, lesson) {
  for (const g of lesson.grammar) {
    const card = node('div', 'grammar-card');
    card.appendChild(node('div', 'grammar-pattern', g.pattern));
    card.appendChild(node('div', 'grammar-summary', g.summary));
    card.appendChild(node('div', 'grammar-detail', g.detail));
    for (const ex of g.examples) {
      const exBox = node('div', 'example');
      exBox.appendChild(jp(ex.jp));
      exBox.appendChild(node('div', 'example-zh', ex.zh));
      card.appendChild(exBox);
    }
    box.appendChild(card);
  }
  const next = node('button', 'primary wide', '開始練習 →');
  next.addEventListener('click', () => renderLesson(lesson.id, 'quiz'));
  box.appendChild(next);
}

// ── 練習 ──────────────────────────────────────────────────
function startQuiz(lesson) {
  const questions = buildQuiz(lesson, tokenizer);
  let index = 0;
  let correctCount = 0;

  function showQuestion() {
    if (index >= questions.length) return showResult();

    const q = questions[index];
    setView(`第 ${lesson.id} 課 · 練習`, () => renderLesson(lesson.id, 'grammar'));

    const bar = node('div', 'quiz-bar');
    const fill = node('div', 'quiz-bar-fill');
    fill.style.width = `${(index / questions.length) * 100}%`;
    bar.appendChild(fill);
    el.view.appendChild(bar);
    el.view.appendChild(node('div', 'quiz-count', `${index + 1} / ${questions.length}`));

    el.view.appendChild(node('div', 'quiz-title' + (q.isReview ? ' review' : ''), q.title));
    if (q.jp) el.view.appendChild(jp(q.jp, 'quiz-jp'));
    if (q.zh) el.view.appendChild(node('div', 'quiz-zh', q.zh));

    if (q.type === 'order') renderOrder(q, onAnswered);
    else renderChoices(q, onAnswered);
  }

  function onAnswered(ok, q) {
    if (ok) correctCount++;
    recordAnswer(q.vocabId, ok);
    const next = node('button', 'primary wide', index + 1 >= questions.length ? '看結果' : '下一題');
    next.addEventListener('click', () => { index++; showQuestion(); });
    el.view.appendChild(next);
    next.scrollIntoView({ block: 'nearest' });
  }

  function showResult() {
    const pct = Math.round((correctCount / questions.length) * 100);
    recordAttempt(lesson.id, pct);
    setView(`第 ${lesson.id} 課 · 完成`, renderHome);

    el.view.appendChild(node('div', 'result-pct', `${pct}%`));
    el.view.appendChild(node('div', 'result-detail', `答對 ${correctCount} / ${questions.length} 題`));
    const passed = pct >= PASS_SCORE;
    el.view.appendChild(node('p', 'result-msg',
      pct === 100 ? '全對。下一課已經解鎖了。'
        : passed ? '通過了，下一課已經解鎖。再練一次可以更穩。'
        : `還沒到 ${PASS_SCORE}% 的及格線。回去看一次文法，再練一次就好。`));

    const again = node('button', (passed ? 'ghost' : 'primary') + ' wide', '再練一次');
    again.addEventListener('click', () => renderLesson(lesson.id, 'quiz'));
    el.view.appendChild(again);

    const review = node('button', 'ghost wide', '回去看文法');
    review.addEventListener('click', () => renderLesson(lesson.id, 'grammar'));
    el.view.appendChild(review);

    const home = node('button', 'ghost wide', '回課程列表');
    home.addEventListener('click', renderHome);
    el.view.appendChild(home);
  }

  showQuestion();
}

function renderChoices(q, done) {
  const box = node('div', 'choices');
  const buttons = [];
  q.choices.forEach((c, i) => {
    const b = node('button', 'choice');
    // 日文選項要標假名，中文選項直接放文字
    if (q.type === 'zh2jp' || q.type === 'particle') b.appendChild(jp(c));
    else b.textContent = c;
    b.addEventListener('click', () => {
      if (buttons.some((x) => x.disabled)) return;
      const ok = i === q.answer;
      buttons.forEach((x, j) => {
        x.disabled = true;
        if (j === q.answer) x.classList.add('correct');
        else if (j === i) x.classList.add('wrong');
      });
      done(ok, q);
    });
    buttons.push(b);
    box.appendChild(b);
  });
  el.view.appendChild(box);
}

function renderOrder(q, done) {
  const built = node('div', 'order-built');
  const pool = node('div', 'choices order-pool');
  const chosen = [];

  const refresh = () => {
    built.replaceChildren();
    if (!chosen.length) built.appendChild(node('span', 'order-hint', '點下面的詞，依序排出句子'));
    else chosen.forEach((c) => built.appendChild(jp(c.text, 'order-chip')));
  };

  q.choices.forEach((text) => {
    const b = node('button', 'choice chip');
    b.appendChild(jp(text));
    b.addEventListener('click', () => {
      if (b.disabled) return;
      b.disabled = true;
      b.classList.add('used');
      chosen.push({ text, btn: b });
      refresh();
      if (chosen.length === q.choices.length) {
        const ok = chosen.map((c) => c.text).join('') === q.solution.join('');
        built.classList.add(ok ? 'correct' : 'wrong');
        if (!ok) {
          const ans = node('div', 'order-answer');
          ans.appendChild(node('span', 'order-answer-label', '正確答案：'));
          ans.appendChild(jp(q.solution.join('')));
          el.view.insertBefore(ans, pool);
        }
        done(ok, q);
      }
    });
    pool.appendChild(b);
  });

  refresh();
  el.view.appendChild(built);
  el.view.appendChild(pool);
}

// ── 啟動 ──────────────────────────────────────────────────
const mb = (n) => (n / 1048576).toFixed(1);

Promise.all([
  loadTokenizer((loaded, total) => {
    el.barFill.style.width = `${(loaded / total) * 100}%`;
    el.loadingTitle.textContent = `正在載入日文字典… ${mb(loaded)} / ${mb(total)} MB`;
  }),
  loadCurriculum(),
])
  .then(([tk]) => {
    tokenizer = tk;
    el.loading.hidden = true;
    el.kanaWrap.hidden = false;
    renderHome();
  })
  .catch((err) => {
    el.loadingTitle.textContent = '載入失敗';
    el.barFill.parentElement.hidden = true;
    el.loading.classList.add('error');
    console.error(err);
  });

el.back.addEventListener('click', () => backAction && backAction());
el.kanaToggle.addEventListener('change', () => {
  document.body.classList.toggle('hide-kana', !el.kanaToggle.checked);
});

import { loadTokenizer, analyze, registerWords } from './tokenizer.js?v=DEV';
import { renderLines, renderToken } from './render.js?v=DEV';
import { loadCurriculum, getLessons, getLesson, wordForm } from './curriculum.js?v=DEV';
import { getLessonState, recordAttempt, recordAnswer, isUnlocked, PASS_SCORE,
         enrollVocab, getDueVocabIds, getEnrolledVocabIds, getReviewSummary } from './progress.js?v=DEV';
import { buildQuiz, buildReview } from './practice.js?v=DEV';

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

  renderReviewCard(lessons);

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

/**
 * 補登：在複習功能上線前就通過的課，單字沒進排程。
 * 每次啟動都跑一次，已在排程裡的不會被動到，所以是安全的。
 * 補登的字今天就到期——它們早就該被複習了。
 */
function backfillReview() {
  for (const l of getLessons()) {
    if (getLessonState(l.id).done) enrollVocab(l.vocab.map((v) => v.id), 0);
  }
}

// ── 複習卡（首頁）────────────────────────────────────────
function renderReviewCard(lessons) {
  const sum = getReviewSummary();
  if (sum.enrolled === 0) return;            // 一課都沒過，還沒有東西可以複習

  const card = node('div', 'review-card' + (sum.due ? ' has-due' : ''));
  if (sum.due > 0) {
    card.appendChild(node('div', 'review-title', `今天有 ${sum.due} 個單字要複習`));
    card.appendChild(node('div', 'review-sub',
      `已納入 ${sum.enrolled} 個單字，其中 ${sum.mastered} 個已經很熟`));
    const btn = node('button', 'primary wide', '開始複習');
    btn.addEventListener('click', () => startReview(lessons));
    card.appendChild(btn);
  } else {
    card.appendChild(node('div', 'review-title', '今天的複習做完了'));
    card.appendChild(node('div', 'review-sub',
      sum.nextDue ? `下一批 ${sum.nextDue.slice(5).replace('-', '/')} 回來。已納入 ${sum.enrolled} 個單字，${sum.mastered} 個已經很熟。`
                  : `已納入 ${sum.enrolled} 個單字`));
  }
  // 自由練習隨時可用：從所有學過的字出題，不影響排程，想練幾次都行
  const free = node('button', (sum.due ? 'ghost' : 'primary') + ' wide', '自由練習');
  free.addEventListener('click', () => startFreePractice(lessons));
  card.appendChild(free);
  el.view.appendChild(card);
}

// ── 練習與複習共用的答題流程 ──────────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.title 頂欄標題
 * @param {Array} opts.questions
 * @param {Function} opts.onBack 中途按返回要去哪
 * @param {Function} opts.onFinish (correctCount, total) → 負責畫結果頁
 * @param {boolean} [opts.affectSchedule=true] 自由練習傳 false
 */
function runQuiz({ title, questions, onBack, onFinish, affectSchedule = true }) {
  let index = 0;
  let correctCount = 0;

  function showQuestion() {
    if (index >= questions.length) return onFinish(correctCount, questions.length);

    const q = questions[index];
    setView(title, onBack);

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
    recordAnswer(q.vocabId, ok, affectSchedule);
    const next = node('button', 'primary wide', index + 1 >= questions.length ? '看結果' : '下一題');
    next.addEventListener('click', () => { index++; showQuestion(); });
    el.view.appendChild(next);
    next.scrollIntoView({ block: 'nearest' });
  }

  showQuestion();
}

// ── 課程練習 ──────────────────────────────────────────────
function startQuiz(lesson) {
  runQuiz({
    title: `第 ${lesson.id} 課 · 練習`,
    questions: buildQuiz(lesson, tokenizer),
    onBack: () => renderLesson(lesson.id, 'grammar'),
    onFinish(correctCount, total) {
      const pct = Math.round((correctCount / total) * 100);
      recordAttempt(lesson.id, pct);
      const passed = pct >= PASS_SCORE;
      if (passed) enrollVocab(lesson.vocab.map((v) => v.id));   // 這課的字從明天開始進複習

      setView(`第 ${lesson.id} 課 · 完成`, renderHome);
      el.view.appendChild(node('div', 'result-pct', `${pct}%`));
      el.view.appendChild(node('div', 'result-detail', `答對 ${correctCount} / ${total} 題`));
      el.view.appendChild(node('p', 'result-msg',
        pct === 100 ? '全對。下一課已經解鎖，這課的單字明天會進複習。'
          : passed ? '通過了，下一課已經解鎖，這課的單字明天會進複習。'
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
    },
  });
}

// ── 自由練習：不看到期日，不動排程 ──────────────────────
function startFreePractice(lessons) {
  const passed = lessons.filter((l) => getLessonState(l.id).done);
  const questions = buildReview(getEnrolledVocabIds(), passed, tokenizer);
  if (!questions.length) return renderHome();

  runQuiz({
    title: '自由練習',
    questions,
    affectSchedule: false,
    onBack: renderHome,
    onFinish(correctCount, total) {
      const pct = Math.round((correctCount / total) * 100);
      setView('自由練習 · 完成', renderHome);
      el.view.appendChild(node('div', 'result-pct', `${pct}%`));
      el.view.appendChild(node('div', 'result-detail', `答對 ${correctCount} / ${total} 題`));
      el.view.appendChild(node('p', 'result-msg', '自由練習不影響複習排程，想練幾次都可以。'));

      const again = node('button', 'primary wide', '再練一次');
      again.addEventListener('click', () => startFreePractice(lessons));
      el.view.appendChild(again);
      const home = node('button', 'ghost wide', '回課程列表');
      home.addEventListener('click', renderHome);
      el.view.appendChild(home);
    },
  });
}

// ── 複習 ──────────────────────────────────────────────────
function startReview(lessons) {
  const passed = lessons.filter((l) => getLessonState(l.id).done);
  const questions = buildReview(getDueVocabIds(), passed, tokenizer);
  if (!questions.length) return renderHome();

  runQuiz({
    title: '複習',
    questions,
    onBack: renderHome,
    onFinish(correctCount, total) {
      const pct = Math.round((correctCount / total) * 100);
      const left = getReviewSummary().due;
      setView('複習 · 完成', renderHome);
      el.view.appendChild(node('div', 'result-pct', `${pct}%`));
      el.view.appendChild(node('div', 'result-detail', `答對 ${correctCount} / ${total} 題`));
      el.view.appendChild(node('p', 'result-msg',
        left > 0 ? `答錯的 ${left} 個字會今天再回來一次。答對的字下次出現的間隔會拉長。`
                 : '今天的複習做完了。答對的字下次出現的間隔會拉長，答錯的會很快再回來。'));

      if (left > 0) {
        const again = node('button', 'primary wide', `再複習答錯的 ${left} 個`);
        again.addEventListener('click', () => startReview(lessons));
        el.view.appendChild(again);
      }
      const home = node('button', (left > 0 ? 'ghost' : 'primary') + ' wide', '回課程列表');
      home.addEventListener('click', renderHome);
      el.view.appendChild(home);
    },
  });
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

  // 詞塊用句子裡斷好的 token 直接畫，不能拿字串重新斷詞——
  // 「人」單獨斷會變 ひと，但在 台湾人 裡是 じん。
  const chip = (tok, cls = '') => {
    const box = node('div', 'jp ' + cls);
    box.appendChild(renderToken(tok));
    return box;
  };

  const refresh = () => {
    built.replaceChildren();
    if (!chosen.length) built.appendChild(node('span', 'order-hint', '點下面的詞，依序排出句子'));
    else chosen.forEach((c) => built.appendChild(chip(c.tok, 'order-chip')));
  };

  q.choices.forEach((tok) => {
    const b = node('button', 'choice chip');
    b.appendChild(chip(tok));
    b.addEventListener('click', () => {
      if (b.disabled) return;
      b.disabled = true;
      b.classList.add('used');
      chosen.push({ tok, btn: b });
      refresh();
      if (chosen.length === q.choices.length) {
        const ok = chosen.map((c) => c.tok.surface).join('') === q.solution.join('');
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
    // 讓斷詞認得課程單字：台湾人、勉強します 這類 kuromoji 會切碎的詞才能保持完整
    registerWords(getLessons().flatMap((l) => l.vocab));
    el.loading.hidden = true;
    el.kanaWrap.hidden = false;
    backfillReview();
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

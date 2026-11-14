import { loadTokenizer, analyze, registerWords } from './tokenizer.js?v=DEV';
import { renderLines, renderToken } from './render.js?v=DEV';
import { loadCurriculum, getLessons, getLesson, wordForm, vocabUpTo } from './curriculum.js?v=DEV';
import { getLessonState, recordAttempt, recordAnswer, isUnlocked, PASS_SCORE,
         enrollVocab, getDueVocabIds, getEnrolledVocabIds, getReviewSummary,
         getPlan, setPlan, clearPlan, countLessonsDone,
         getKanaState, recordKanaAttempt,
         getExamResult, saveExamResult,
         getPackState, recordPackAttempt,
         getPapers, addPaperResult, removePaperResult } from './progress.js?v=DEV';
import { loadKana, getKanaSections, getKanaSection, buildKanaQuiz } from './kana.js?v=DEV';
import { conjugate } from './conjugate.js?v=DEV';
import { initSpeech, speak, stopSpeaking, speechAvailable, missingVoiceHelp } from './speech.js?v=DEV';
import { loadExamData, buildExam, scoreExam, reviewRecord, SCORING, SECTIONS } from './exam.js?v=DEV';
import { PHASES, TOTAL_LESSONS, computePace, upcomingExamDates, localDate } from './plan.js?v=DEV';
import { buildQuiz, buildReview, buildListeningQuiz, buildPackQuiz } from './practice.js?v=DEV';
import { loadPacks, getPacks, getPack } from './packs.js?v=DEV';
import { PAPER, partKey, scorePaper } from './paper.js?v=DEV';

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

/** 純日文文字：不斷詞、不標假名。單字題的題目與選項用這個，假名不能透露答案。 */
function jpPlain(text, cls = '') {
  return node('div', 'jp-plain ' + cls, text);
}

const node = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function setView(title, back) {
  stopSpeaking();                 // 換畫面就停掉還在念的句子
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
  const n5 = lessons.filter((l) => (l.level || 'N5') === 'N5');
  const n4 = lessons.filter((l) => l.level === 'N4');
  const doneN5 = n5.filter((l) => getLessonState(l.id).done).length;

  const summary = node('p', 'summary', `N5 課程 ${doneN5} / ${n5.length} 課`);
  el.view.appendChild(summary);

  renderPlanCard();
  renderReviewCard(lessons);
  renderPackCard();
  renderKanaCard();
  renderListeningCard(lessons);
  renderExamCard(lessons);
  renderPaperCard();

  renderLessonList(n5);

  if (n4.length) {
    const head = node('div', 'level-head');
    head.appendChild(node('span', 'level-name', 'N4'));
    head.appendChild(node('span', 'level-note',
      doneN5 === n5.length ? 'N5 的文法走完了，這裡是下一階'
                           : `先把 N5 的 ${n5.length} 課上完，這一段不算在 N5 的考試進度裡`));
    el.view.appendChild(head);
    renderLessonList(n4);
  }

  if (doneN5 < n5.length && !isUnlocked(2)) {
    el.view.appendChild(node('p', 'note', '完成一課之後，下一課才會解鎖。'));
  }
}

function renderLessonList(lessons) {
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

// ── 模擬考 ────────────────────────────────────────────────
function renderExamCard(lessons) {
  const n5 = lessons.filter((l) => (l.level || 'N5') === 'N5');
  const passed = n5.filter((l) => getLessonState(l.id).done);
  if (passed.length < n5.length) return;        // N5 全部上完才開放

  const packWords = donePackWords();
  const card = node('div', 'exam-card');
  card.appendChild(node('div', 'exam-title', '課程總考（N5 格式）'));
  card.appendChild(node('div', 'exam-warn', '這個分數不能預測 JLPT 成績。'));
  card.appendChild(node('div', 'exam-sub',
    `出題範圍就是這個 APP 教過的字（課程 ${vocabUpTo(25).length} 個 ＋ 單字包 ${packWords.length} 個），`
    + '沒教過的不會出現，所以它測的是「教過的東西記住了多少」。'
    + '格式照官方的來，因為限時內寫完本身要練：'
    + '文字・語彙 20 分鐘、文法・読解 40 分鐘、聴解 30 分鐘，中途不給答案。'));
  card.appendChild(officialLink());
  if (!speechAvailable()) {
    card.appendChild(node('div', 'exam-warn', '這台裝置沒有日文語音，聴解那一節會跳過，無法判定及格。'));
  }
  const last = getExamResult();
  if (last) {
    const line = node('div', 'exam-last');
    line.appendChild(node('span', 'exam-last-date', fmtDate(last.date)));
    line.appendChild(node('span', 'exam-last-score',
      `${last.total} / ${SCORING.totalMax}`));
    line.appendChild(node('span', 'exam-last-wrong',
      last.wrong.length ? `錯 ${last.wrong.length} 題` : '全對'));
    card.appendChild(line);
  }

  const btn = node('button', 'primary wide', '開始總考');
  btn.addEventListener('click', () => startExam(passed));
  card.appendChild(btn);

  if (last && last.wrong.length) {
    const rev = node('button', 'ghost wide', `檢討上次的 ${last.wrong.length} 題錯題`);
    rev.addEventListener('click', () => renderExamReview(last, renderHome));
    card.appendChild(rev);
  }
  el.view.appendChild(card);
}

function startExam(lessons) {
  const sections = buildExam(tokenizer, lessons, speechAvailable(), donePackWords());
  const results = [];
  const wrong = [];          // 錯題與沒作答的題目，考完才拿出來檢討
  let finalRec = null;       // 算過一次就定案，回到結果頁不會重算、也不會重複扣複習格
  let si = 0;

  function intro() {
    const sec = sections[si];
    setView(`總考 · ${sec.name}`, null);
    el.view.appendChild(node('div', 'exam-step', `第 ${si + 1} 節 / ${sections.length}`));
    el.view.appendChild(node('h2', 'lesson-h2', sec.name));
    el.view.appendChild(node('p', 'goal',
      `${sec.questions.length} 題，限時 ${sec.minutes} 分鐘。作答中不會告訴你對錯，時間到會自動交卷。`));
    const go = node('button', 'primary wide', '開始這一節');
    go.addEventListener('click', () => runSection(sec));
    el.view.appendChild(go);
    const quit = node('button', 'ghost wide', '離開總考');
    quit.addEventListener('click', renderHome);
    el.view.appendChild(quit);
  }

  function runSection(sec) {
    let index = 0, correct = 0;
    const deadline = Date.now() + sec.minutes * 60000;
    let timerEl = null, ticker = null;

    const stopTimer = () => { if (ticker) clearInterval(ticker); ticker = null; };

    function finishSection() {
      stopTimer();
      // 時間到時還沒作答的題目也要留紀錄，不然檢討表會漏題，
      // 而「這一節寫不完」本身就是最該檢討的事。
      for (let i = index; i < sec.questions.length; i++) {
        wrong.push(reviewRecord(sec.id, sec.name, sec.questions[i], null));
      }
      index = sec.questions.length;
      results.push({ id: sec.id, correct, total: sec.questions.length });
      si++;
      if (si < sections.length) intro(); else showResult();
    }

    function show() {
      if (index >= sec.questions.length) return finishSection();
      const q = sec.questions[index];
      setView(`總考 · ${sec.name}`, null);

      const bar = node('div', 'quiz-bar');
      const fill = node('div', 'quiz-bar-fill');
      fill.style.width = `${(index / sec.questions.length) * 100}%`;
      bar.appendChild(fill);
      el.view.appendChild(bar);

      const row = node('div', 'exam-row');
      row.appendChild(node('span', 'quiz-count', `${index + 1} / ${sec.questions.length}`));
      row.appendChild(node('span', 'exam-kind', q.kind));
      timerEl = node('span', 'exam-timer');
      row.appendChild(timerEl);
      el.view.appendChild(row);
      tick();
      stopTimer();
      ticker = setInterval(tick, 1000);

      if (q.passage) el.view.appendChild(jp(q.passage, 'exam-passage'));
      el.view.appendChild(node('div', 'quiz-title', q.title));
      if (q.stem) {
        // 考題一律不標假名——標了漢字読み那一題就等於送分
        el.view.appendChild(jpPlain(q.stem, q.passage ? 'exam-question' : 'quiz-prompt'));
      }
      if (q.audio) el.view.appendChild(audioControls(q));
      if (q.zh) el.view.appendChild(node('div', 'quiz-zh', q.zh));

      if (q.type === 'order') renderExamOrder(q, pick);
      else renderExamChoices(q, pick);
    }

    function tick() {
      const left = Math.max(0, deadline - Date.now());
      if (timerEl) {
        const m = Math.floor(left / 60000), s2 = Math.floor((left % 60000) / 1000);
        timerEl.textContent = `${m}:${String(s2).padStart(2, '0')}`;
        timerEl.classList.toggle('low', left < 120000);
      }
      if (left <= 0) finishSection();      // 時間到自動交卷，跟真考試一樣
    }

    function pick(ok, your) {
      if (ok) correct++;
      else wrong.push(reviewRecord(sec.id, sec.name, sec.questions[index], your));
      index++;
      show();
    }

    show();
  }

  function showResult() {
    if (!finalRec) {
      finalRec = { date: localDate(), ...scoreExam(results), sections: results, wrong };
      saveExamResult(finalRec);
      // 考錯的單字掉回複習第一格，明天的複習卡就會把它們推回來——
      // 知道錯在哪而沒有再見到它，等於沒複習。
      for (const w of wrong) if (w.wordId) recordAnswer(w.wordId, false);
    }
    const r = finalRec;
    setView('總考 · 結果', renderHome);

    el.view.appendChild(node('div', 'result-pct', `${r.total} / ${SCORING.totalMax}`));
    el.view.appendChild(node('div', 'exam-verdict ' + (r.passed ? 'pass' : 'fail'),
      r.skippedListening ? '聴解未作答，無法判定' : (r.passed ? '合格' : '不合格')));

    const table = node('div', 'exam-scores');
    const rowOf = (label, got, max, pass, okFlag) => {
      const row = node('div', 'exam-score-row' + (okFlag ? '' : ' miss'));
      row.appendChild(node('span', 'esr-label', label));
      row.appendChild(node('span', 'esr-score', `${got == null ? '—' : got} / ${max}`));
      row.appendChild(node('span', 'esr-pass', `及格線 ${pass}`));
      return row;
    };
    table.appendChild(rowOf(SCORING.knowledge.label, r.knowledge, SCORING.knowledge.max,
                            SCORING.knowledge.pass, r.knowledgePassed));
    table.appendChild(rowOf(SCORING.listening.label, r.listening, SCORING.listening.max,
                            SCORING.listening.pass, r.listeningPassed));
    el.view.appendChild(table);

    const notes = [];
    if (!r.knowledgePassed) notes.push(`言語知識・読解 沒到 ${SCORING.knowledge.pass} 分。`);
    if (!r.skippedListening && !r.listeningPassed) notes.push(`聴解 沒到 ${SCORING.listening.pass} 分。`);
    if (r.total < SCORING.totalPass) notes.push(`總分沒到 ${SCORING.totalPass} 分。`);
    if (!notes.length && r.passed) notes.push('三個條件都過了。');
    notes.push('任一區沒到及格線，總分再高也不合格——這是官方規則。');
    el.view.appendChild(node('p', 'result-msg', notes.join(' ')));

    const warn = node('div', 'exam-disclaimer');
    warn.appendChild(node('div', 'exam-disclaimer-t', '這個分數不能預測 JLPT'));
    warn.appendChild(node('div', 'exam-disclaimer-b',
      '題目全部從這個 APP 教過的字組出來，沒教過的不會出現，所以分數高只代表教過的都記住了。'
      + `真正的 N5 要約 800 個單字，這裡目前有 ${vocabUpTo(25).length + donePackWords().length} 個。`
      + '要知道自己實際到哪裡，請做官方問題例。'));
    warn.appendChild(officialLink());
    el.view.appendChild(warn);

    if (wrong.length) {
      const rev = node('button', 'primary wide', `檢討錯的 ${wrong.length} 題`);
      rev.addEventListener('click', () => renderExamReview(finalRec, showResult));
      el.view.appendChild(rev);
      const n = wrong.filter((w) => w.wordId).length;
      if (n) el.view.appendChild(node('p', 'note',
        `錯的 ${n} 個單字已經放回複習排程，明天的複習卡會把它們推回來。`));
    } else {
      el.view.appendChild(node('p', 'result-msg', '全部答對，沒有錯題可以檢討。'));
    }

    const again = node('button', 'ghost wide', '再考一次');
    again.addEventListener('click', () => startExam(lessons));
    el.view.appendChild(again);
    const home = node('button', 'ghost wide', '回課程列表');
    home.addEventListener('click', renderHome);
    el.view.appendChild(home);
  }

  intro();
}

/** 模擬考的選擇題：選完直接進下一題，不顯示對錯 */
function renderExamChoices(q, done) {
  const box = node('div', 'choices');
  q.choices.forEach((c, i) => {
    const b = node('button', 'choice');
    if (q.choiceKind === 'kana' || q.choiceKind === 'kanji') b.appendChild(jpPlain(c));
    else b.textContent = c;
    b.addEventListener('click', () => done(i === q.answer, c));
    box.appendChild(b);
  });
  el.view.appendChild(box);
}

/** 模擬考的排列題：排完直接判定，不顯示正解 */
function renderExamOrder(q, done) {
  const built = node('div', 'order-built');
  const pool = node('div', 'choices order-pool');
  const chosen = [];
  const chip = (tok, cls = '') => {
    const b = node('div', 'jp-plain ' + cls);
    b.textContent = tok.surface;          // 考題不標假名
    return b;
  };
  const refresh = () => {
    built.replaceChildren();
    if (!chosen.length) built.appendChild(node('span', 'order-hint', '點詞排出正確的句子'));
    else chosen.forEach((c) => built.appendChild(chip(c, 'order-chip')));
  };
  q.choices.forEach((tok) => {
    const b = node('button', 'choice chip');
    b.appendChild(chip(tok));
    b.addEventListener('click', () => {
      if (b.disabled) return;
      b.disabled = true; b.classList.add('used');
      chosen.push(tok); refresh();
      if (chosen.length === q.choices.length) {
        const built2 = chosen.map((c) => c.surface).join('');
        done(built2 === q.solution.join(''), built2);
      }
    });
    pool.appendChild(b);
  });
  refresh();
  el.view.appendChild(built);
  el.view.appendChild(pool);
}

// ── 主題單字包 ──────────────────────────────────────────
// 課程只教了 303 個字，N5 要約 800 個。差的幾百個字沒有文法可以掛，
// 所以按主題分包：只背字、不教句型，背完一樣進間隔複習。

/** 已完成的單字包裡的字，拿來當複習題的干擾選項來源 */
function donePackWords() {
  return getPacks().filter((p) => getPackState(p.id).done).flatMap((p) => p.words);
}

function packStats() {
  const packs = getPacks();
  const words = packs.reduce((a, p) => a + p.words.length, 0);
  const donePacks = packs.filter((p) => getPackState(p.id).done);
  const doneWords = donePacks.reduce((a, p) => a + p.words.length, 0);
  return { packs, words, donePacks: donePacks.length, doneWords };
}

function renderPackCard() {
  const { packs, words, donePacks, doneWords } = packStats();
  if (!packs.length) return;

  const card = node('div', 'pack-card');
  card.appendChild(node('div', 'pack-title', '主題單字包'));
  card.appendChild(node('div', 'pack-sub',
    `${packs.length} 個主題、${words} 個新字，跟課程不重複。`
    + `課程 ${vocabUpTo(25).length} 個 ＋ 這裡 ${words} 個 ＝ ${vocabUpTo(25).length + words} 個，`
    + 'N5 需要約 800 個。只背字、不教句型，背完一樣進每天的複習。'));
  card.appendChild(node('div', 'pack-progress',
    donePacks ? `已完成 ${donePacks} / ${packs.length} 包（${doneWords} 個字）`
              : '還沒開始'));
  const btn = node('button', 'primary wide', donePacks ? '繼續背單字' : '開始背單字');
  btn.addEventListener('click', renderPackList);
  card.appendChild(btn);
  el.view.appendChild(card);
}

function renderPackList() {
  setView('主題單字包', renderHome);
  const { packs, words, doneWords } = packStats();
  el.view.appendChild(node('p', 'summary',
    `${packs.length} 個主題、${words} 個字，已背 ${doneWords} 個。順序隨你，想先背哪個主題就點哪個。`));

  for (const p of packs) {
    const st = getPackState(p.id);
    const card = node('button', 'lesson-card');
    const head = node('div', 'lesson-head');
    head.appendChild(node('span', 'lesson-no', `${p.words.length} 個字`));
    if (st.done) head.appendChild(node('span', 'badge done', `最佳 ${st.best}%`));
    else if (st.attempts) head.appendChild(node('span', 'badge', `最佳 ${st.best}%`));
    card.appendChild(head);
    card.appendChild(node('div', 'lesson-title', p.title));
    card.appendChild(node('div', 'lesson-pattern', p.zh));
    card.addEventListener('click', () => renderPack(p.id));
    el.view.appendChild(card);
  }
}

function renderPack(id) {
  const p = getPack(id);
  setView(p.title, renderPackList);
  const st = getPackState(p.id);

  el.view.appendChild(node('p', 'goal',
    `${p.zh}　${p.words.length} 個字。先看過一遍再練習；答對 ${PASS_SCORE}% 以上算完成，` +
    '這些字就會進每天的複習排程。'));

  const table = node('div', 'pack-words');
  for (const w of p.words) {
    const row = node('div', 'pack-word');
    // 讀音靠假名標註，不另外列一欄——否則右上角「顯示假名」的開關關掉之後，
    // 讀音還是露在旁邊，就沒辦法自我測驗了。
    // 但 noForce 的詞（一日＝ついたち／いちにち）斷詞器標出來的讀音正是錯的那個，
    // 所以這些詞不標假名，改用一個會跟著開關一起隱藏的欄位寫清楚。
    if (w.noForce) {
      row.appendChild(jpPlain(w.kanji || w.kana, 'pw-jp'));
      row.appendChild(node('span', 'pw-kana', w.kana));
    } else {
      row.appendChild(jp(w.kanji || w.kana, 'pw-jp'));
    }
    row.appendChild(node('span', 'pw-zh', w.zh));
    const say = node('button', 'pw-say', '🔊');
    say.addEventListener('click', () => speak(w.kana, 0.85));
    if (speechAvailable()) row.appendChild(say);
    table.appendChild(row);
  }
  el.view.appendChild(table);

  const btn = node('button', 'primary wide', st.attempts ? '再練一次' : '開始練習');
  btn.addEventListener('click', () => startPackQuiz(p.id));
  el.view.appendChild(btn);
  const back = node('button', 'ghost wide', '回單字包列表');
  back.addEventListener('click', renderPackList);
  el.view.appendChild(back);
}

function startPackQuiz(id) {
  const p = getPack(id);
  const questions = buildPackQuiz(p.words);
  if (!questions.length) return renderPack(id);

  runQuiz({
    title: p.title,
    questions,
    onBack: () => renderPack(id),
    onFinish(correctCount, total) {
      const pct = Math.round((correctCount / total) * 100);
      const passed = pct >= PASS_SCORE;
      recordPackAttempt(p.id, pct);
      // 過了才納入複習：沒過就納入，等於把還沒記住的字塞進排程裡慢慢忘
      if (passed) enrollVocab(p.words.map((w) => w.id), 1);

      setView(`${p.title} · 完成`, renderPackList);
      el.view.appendChild(node('div', 'result-pct', `${pct}%`));
      el.view.appendChild(node('div', 'result-detail', `答對 ${correctCount} / ${total} 題`));
      el.view.appendChild(node('p', 'result-msg',
        passed ? `這一包完成了。${p.words.length} 個字已經進複習排程，明天會回來一次。`
               : `還沒到 ${PASS_SCORE}%。回去把字再看一遍，這一包還沒進複習排程。`));

      const again = node('button', 'primary wide', passed ? '再練一次' : '回去看單字');
      again.addEventListener('click', () => (passed ? startPackQuiz(id) : renderPack(id)));
      el.view.appendChild(again);
      const list = node('button', 'ghost wide', '回單字包列表');
      list.addEventListener('click', renderPackList);
      el.view.appendChild(list);
    },
  });
}

// ── 官方紙本考卷 ────────────────────────────────────────
// 官方題目不能複製進 APP（公式問題集是 JEES 的著作，官網問題例也不能散佈），
// 所以這裡做的是紙本做不到的事：照官方時間計時，並把紙上的結果變成
// 「哪個大問弱」的資料。刻意不換算 /180——JLPT 是等化計分，那個數字推不出來。

const pct = (r) => (r == null ? '—' : `${Math.round(r * 100)}%`);
const fmtDateTime = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function renderPaperCard() {
  const papers = getPapers();
  const card = node('div', 'paper-card');
  card.appendChild(node('div', 'paper-title', '官方考卷計分'));
  card.appendChild(node('div', 'paper-sub',
    '官方題目不能放進這個 APP，但你手上的紙本可以交給它管：照官方時間分節計時，'
    + '考完按大問輸入答對幾題，它會算出每個大問的正確率、指出最弱的那一個，並記錄歷次變化。'));
  card.appendChild(officialLink());

  if (papers.length) {
    const last = papers[0];
    const line = node('div', 'paper-last');
    line.appendChild(node('span', 'paper-last-name', last.name));
    line.appendChild(node('span', 'paper-last-rate', pct(last.rate)));
    card.appendChild(line);
  }

  const btn = node('button', 'primary wide', '開始一份紙本考卷');
  btn.addEventListener('click', renderPaperIntro);
  card.appendChild(btn);
  if (papers.length) {
    const hist = node('button', 'ghost wide', `看紀錄（${papers.length} 份）`);
    hist.addEventListener('click', renderPaperHistory);
    card.appendChild(hist);
  }
  el.view.appendChild(card);
}

function renderPaperIntro() {
  setView('官方考卷', renderHome);
  el.view.appendChild(node('p', 'goal',
    '題目用你手上的紙本（或官網的問題例），在紙上作答。這裡只負責計時與計分。'));

  const nameWrap = node('div', 'paper-field');
  nameWrap.appendChild(node('label', 'paper-label', '這是哪一份考卷'));
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'paper-input wide-input';
  nameInput.placeholder = '例：公式問題集 Vol.2';
  nameInput.value = '公式問題集';
  nameWrap.appendChild(nameInput);
  el.view.appendChild(nameWrap);

  const table = node('div', 'paper-plan');
  for (const sec of PAPER) {
    const row = node('div', 'paper-plan-row');
    row.appendChild(node('span', 'pp-name', sec.name));
    row.appendChild(node('span', 'pp-min', `${sec.minutes} 分`));
    row.appendChild(node('span', 'pp-parts', `大問 1〜${sec.parts.length}`));
    table.appendChild(row);
  }
  el.view.appendChild(table);

  const go = node('button', 'primary wide', '開始計時');
  go.addEventListener('click', () => runPaperTimer(nameInput.value.trim() || '官方考卷', 0));
  el.view.appendChild(go);

  const skip = node('button', 'ghost wide', '已經考完了，直接輸入成績');
  skip.addEventListener('click', () => renderPaperEntry(nameInput.value.trim() || '官方考卷'));
  el.view.appendChild(skip);

  const back = node('button', 'ghost wide', '回首頁');
  back.addEventListener('click', renderHome);
  el.view.appendChild(back);
}

/** 一節一節計時。時間到不自動跳下一節——紙本還要收拾，讓人自己按。 */
function runPaperTimer(name, si) {
  const sec = PAPER[si];
  setView(`${sec.name}`, null);
  el.view.appendChild(node('div', 'exam-step', `第 ${si + 1} 節 / ${PAPER.length}`));
  el.view.appendChild(node('h2', 'lesson-h2', sec.name));
  el.view.appendChild(node('p', 'goal',
    `限時 ${sec.minutes} 分鐘，大問 1〜${sec.parts.length}。在紙上作答，時間到這裡會響一聲。`));

  const clock = node('div', 'paper-clock');
  el.view.appendChild(clock);

  let remain = sec.minutes * 60000;
  let last = Date.now();
  let running = true;
  let done = false;
  let ticker = null;

  const draw = () => {
    const m = Math.floor(remain / 60000);
    const s2 = Math.floor((remain % 60000) / 1000);
    clock.textContent = `${m}:${String(s2).padStart(2, '0')}`;
    clock.classList.toggle('low', remain < 120000);
    clock.classList.toggle('over', remain <= 0);
  };

  const stop = () => { if (ticker) clearInterval(ticker); ticker = null; };

  const tick = () => {
    const now = Date.now();
    if (running) remain = Math.max(0, remain - (now - last));
    last = now;
    draw();
    if (remain <= 0 && !done) {
      done = true;
      running = false;
      stop();
      clock.textContent = '時間到';
      if (speechAvailable()) speak('時間です。', 1);
      pauseBtn.hidden = true;
    }
  };

  const pauseBtn = node('button', 'ghost wide', '暫停');
  pauseBtn.addEventListener('click', () => {
    running = !running;
    last = Date.now();
    pauseBtn.textContent = running ? '暫停' : '繼續';
  });
  el.view.appendChild(pauseBtn);

  const next = node('button', 'primary wide',
    si + 1 < PAPER.length ? '這一節做完了，下一節' : '全部做完了，輸入成績');
  next.addEventListener('click', () => {
    stop();
    if (si + 1 < PAPER.length) runPaperTimer(name, si + 1);
    else renderPaperEntry(name);
  });
  el.view.appendChild(next);

  const quit = node('button', 'ghost wide', '放棄這一份');
  quit.addEventListener('click', () => { stop(); renderHome(); });
  el.view.appendChild(quit);

  draw();
  ticker = setInterval(tick, 250);
}

function renderPaperEntry(name, prefill = {}) {
  setView('輸入成績', renderHome);
  el.view.appendChild(node('p', 'goal',
    `${name}：對照紙本的答案，按大問填「答對幾題 / 共幾題」。`
    + '官方不公布每個大問的題數，所以題數也要你填。沒做的大問留空就好。'));

  const inputs = {};
  for (const sec of PAPER) {
    const head = node('div', 'level-head');
    head.appendChild(node('span', 'level-name', sec.name));
    head.appendChild(node('span', 'level-note', `${sec.minutes} 分`));
    el.view.appendChild(head);

    for (const p of sec.parts) {
      const key = partKey(sec.id, p.n);
      const row = node('div', 'paper-entry');
      const label = node('div', 'pe-label');
      label.appendChild(node('span', 'pe-n', `問題${p.n}`));
      label.appendChild(node('span', 'pe-name', p.name));
      label.appendChild(node('span', 'pe-aim', p.aim));
      row.appendChild(label);

      const nums = node('div', 'pe-nums');
      const mk = (ph, val) => {
        const i = document.createElement('input');
        i.type = 'number';
        i.min = '0';
        i.inputMode = 'numeric';
        i.className = 'paper-input';
        i.placeholder = ph;
        if (val != null) i.value = val;
        return i;
      };
      const c = mk('對', prefill[key]?.correct);
      const t = mk('共', prefill[key]?.total);
      nums.append(c, node('span', 'pe-slash', '/'), t);
      row.appendChild(nums);
      inputs[key] = { c, t };
      el.view.appendChild(row);
    }
  }

  const err = node('p', 'paper-error');
  err.hidden = true;
  el.view.appendChild(err);

  const save = node('button', 'primary wide', '算出結果');
  save.addEventListener('click', () => {
    const entries = {};
    for (const [key, io] of Object.entries(inputs)) {
      const total = Number(io.t.value) || 0;
      const correct = Number(io.c.value) || 0;
      if (!total) continue;
      if (correct > total) {
        err.hidden = false;
        err.textContent = '有一個大問的「答對」比「共幾題」還多，檢查一下。';
        io.c.focus();
        return;
      }
      entries[key] = { correct, total };
    }
    if (!Object.keys(entries).length) {
      err.hidden = false;
      err.textContent = '至少填一個大問的題數。';
      return;
    }
    const r = scorePaper(entries);
    const rec = { at: new Date().toISOString(), name, entries, rate: r.rate,
                  correct: r.correct, total: r.total };
    addPaperResult(rec);
    renderPaperResult(rec);
  });
  el.view.appendChild(save);

  const back = node('button', 'ghost wide', '回首頁');
  back.addEventListener('click', renderHome);
  el.view.appendChild(back);
}

function renderPaperResult(rec) {
  const r = scorePaper(rec.entries);
  setView('官方考卷 · 結果', renderHome);
  el.view.appendChild(node('div', 'result-pct', pct(r.rate)));
  el.view.appendChild(node('div', 'result-detail',
    `${rec.name}　答對 ${r.correct} / ${r.total} 題`));

  for (const sec of r.sections) {
    if (!sec.total) continue;
    const head = node('div', 'level-head');
    head.appendChild(node('span', 'level-name', sec.name));
    head.appendChild(node('span', 'level-note', `${sec.correct} / ${sec.total}　${pct(sec.rate)}`));
    el.view.appendChild(head);

    for (const p of sec.parts) {
      if (!p.total) continue;
      const row = node('div', 'paper-bar-row' + (r.weakest && r.weakest.name === p.name ? ' weak' : ''));
      const top = node('div', 'pb-top');
      top.appendChild(node('span', 'pb-name', `問題${p.n}　${p.name}`));
      top.appendChild(node('span', 'pb-num', `${p.correct} / ${p.total}`));
      row.appendChild(top);
      const bar = node('div', 'pb-bar');
      const fill = node('div', 'pb-fill');
      fill.style.width = `${Math.round(p.rate * 100)}%`;
      bar.appendChild(fill);
      row.appendChild(bar);
      el.view.appendChild(row);
    }
  }

  if (r.weakest) {
    el.view.appendChild(node('p', 'result-msg',
      `最弱的是「${r.weakest.section}　問題${r.weakest.n}　${r.weakest.name}」`
      + `（${r.weakest.correct} / ${r.weakest.total}）。${r.weakest.aim}。`));
  }

  const warn = node('div', 'exam-disclaimer');
  warn.appendChild(node('div', 'exam-disclaimer-t', '這裡沒有 /180 的分數，是故意的'));
  warn.appendChild(node('div', 'exam-disclaimer-b',
    'JLPT 用等化計分，同一題在不同場次的權重不同，從答對率推不出總分——'
    + '推出來的數字是編的。答對率與各大問的落差才是真的，拿它決定接下來練什麼。'));
  el.view.appendChild(warn);

  const again = node('button', 'ghost wide', '改一下剛才填的數字');
  again.addEventListener('click', () => {
    removePaperResult(rec.at);
    renderPaperEntry(rec.name, rec.entries);
  });
  el.view.appendChild(again);
  const hist = node('button', 'ghost wide', '看全部紀錄');
  hist.addEventListener('click', renderPaperHistory);
  el.view.appendChild(hist);
  const home = node('button', 'ghost wide', '回首頁');
  home.addEventListener('click', renderHome);
  el.view.appendChild(home);
}

function renderPaperHistory() {
  const papers = getPapers();
  setView('官方考卷 · 紀錄', renderHome);
  if (!papers.length) {
    el.view.appendChild(node('p', 'result-msg', '還沒有紀錄。'));
  }
  el.view.appendChild(node('p', 'summary',
    '每個大問的正確率擺在一起看，才知道哪裡在進步、哪裡卡住。'));

  for (const rec of papers) {
    const r = scorePaper(rec.entries);
    const card = node('button', 'lesson-card');
    const head = node('div', 'lesson-head');
    head.appendChild(node('span', 'lesson-no', fmtDateTime(rec.at)));
    head.appendChild(node('span', 'badge', pct(r.rate)));
    card.appendChild(head);
    card.appendChild(node('div', 'lesson-title', rec.name));
    card.appendChild(node('div', 'lesson-pattern',
      r.sections.filter((s) => s.total)
        .map((s) => `${s.name.replace('言語知識', '').replace(/[（）]/g, '')} ${pct(s.rate)}`)
        .join('　')));
    card.addEventListener('click', () => renderPaperResult(rec));
    el.view.appendChild(card);
  }

  const back = node('button', 'ghost wide', '回首頁');
  back.addEventListener('click', renderHome);
  el.view.appendChild(back);
}

/**
 * 官方題目的連結。這個 APP 出的題都是自己教過的東西，真考題只有官方那份。
 * 問題例每個大問只給一題，是用來看題型的；要整份練要用公式問題集。
 */
function officialLink() {
  const box = node('div', 'official-links');
  const link = (href, text, note) => {
    const a = document.createElement('a');
    a.className = 'official-link';
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = text;
    box.appendChild(a);
    if (note) box.appendChild(node('div', 'official-note', note));
  };
  link('https://www.jlpt.jp/samples/n5/index.html', '→ JLPT 官方 N5 問題例',
       '免費。每個大問只有一題，看題型用的。');
  link('https://www.jlpt.jp/samples/sampleindex.html', '→ 日本語能力試験 公式問題集',
       '官方整份考卷。要估自己的實力就看這個。');
  return box;
}

// ── 總考錯題檢討 ────────────────────────────────────────
// 考試中刻意不給對錯（真考試也不會給），所以錯的題目必須在考完之後交代清楚：
// 題目長什麼樣、你選了什麼、正解是什麼、那句話是什麼意思。
// 這裡跟考試中剛好相反——全部標假名，檢討階段讀不出來才是問題。

function answerLine(label, text, cls, plain) {
  const row = node('div', 'ri-line ' + cls);
  row.appendChild(node('span', 'ri-label', label));
  if (text == null) row.appendChild(node('span', 'ri-text none', '沒作答（時間到）'));
  else if (plain) row.appendChild(node('span', 'ri-text', text));
  else row.appendChild(jp(text, 'ri-text'));
  return row;
}

function reviewItemCard(w, n) {
  const card = node('div', 'review-item');

  const head = node('div', 'ri-head');
  head.appendChild(node('span', 'ri-no', String(n)));
  head.appendChild(node('span', 'exam-kind', w.kind));
  if (w.lesson) head.appendChild(node('span', 'ri-lesson', `第 ${w.lesson} 課`));
  card.appendChild(head);

  if (w.passage) {
    card.appendChild(jp(w.passage, 'exam-passage'));
    if (w.passageZh) card.appendChild(node('div', 'ri-zh', w.passageZh));
  }
  card.appendChild(node('div', 'ri-title', w.title));

  if (w.audio) {
    // 當時只有聲音的內容，這裡要看得到
    card.appendChild(jp(w.audio, 'ri-stem'));
    const play = node('button', 'audio-btn', '🔊 再聽一次');
    play.addEventListener('click', () => speak(w.audio, 0.85));
    card.appendChild(play);
  } else if (w.stem) {
    card.appendChild(jp(w.stem, 'ri-stem'));
  }
  if (w.reviewZh) card.appendChild(node('div', 'ri-zh', w.reviewZh));

  const plainAnswer = w.choiceKind === 'text';      // 中文選項不要丟去斷詞
  card.appendChild(answerLine('你選的', w.your, 'wrong', plainAnswer));
  card.appendChild(answerLine('正解', w.right, 'right', plainAnswer));

  // 單字題補上漢字＋讀音，句子題補上完整的原句
  const extra = w.reviewJp || (w.revealJp && w.revealJp !== w.audio ? w.revealJp : null);
  if (extra && extra !== w.right && extra !== w.stem) {
    const box = node('div', 'ri-full');
    box.appendChild(node('span', 'ri-label', w.wordId ? '這個字' : '原句'));
    box.appendChild(jp(extra, 'ri-text'));
    card.appendChild(box);
  }
  return card;
}

function renderExamReview(rec, back) {
  setView('總考 · 錯題檢討', back);

  el.view.appendChild(node('p', 'summary',
    `${fmtDate(rec.date)}　${rec.total} / ${SCORING.totalMax}　錯 ${rec.wrong.length} 題`));

  if (!rec.wrong.length) {
    el.view.appendChild(node('p', 'result-msg', '這次沒有錯題。'));
  }

  let n = 0;
  for (const sec of SECTIONS) {
    const items = rec.wrong.filter((w) => w.section === sec.id);
    if (!items.length) continue;
    const got = (rec.sections || []).find((x) => x.id === sec.id);
    const head = node('div', 'level-head');
    head.appendChild(node('span', 'level-name', sec.name));
    head.appendChild(node('span', 'level-note',
      got ? `錯 ${items.length} 題 / 共 ${got.total} 題` : `錯 ${items.length} 題`));
    el.view.appendChild(head);
    for (const w of items) el.view.appendChild(reviewItemCard(w, ++n));
  }

  const wordIds = [...new Set(rec.wrong.map((w) => w.wordId).filter(Boolean))];
  if (wordIds.length) {
    const drill = node('button', 'primary wide', `馬上練這 ${wordIds.length} 個單字`);
    drill.addEventListener('click', () => startExamWordDrill(rec, wordIds));
    el.view.appendChild(drill);
  }
  const home = node('button', 'ghost wide', '回課程列表');
  home.addEventListener('click', renderHome);
  el.view.appendChild(home);
}

/** 只用模擬考錯掉的單字出一輪練習。算正式複習，會動排程。 */
function startExamWordDrill(rec, wordIds) {
  const passed = getLessons().filter((l) => (l.level || 'N5') === 'N5' && getLessonState(l.id).done);
  const questions = buildReview(wordIds, passed, tokenizer);
  if (!questions.length) return renderExamReview(rec, renderHome);

  runQuiz({
    title: '總考錯題 · 單字',
    questions,
    onBack: () => renderExamReview(rec, renderHome),
    onFinish(correctCount, total) {
      const pct = Math.round((correctCount / total) * 100);
      setView('總考錯題 · 完成', renderHome);
      el.view.appendChild(node('div', 'result-pct', `${pct}%`));
      el.view.appendChild(node('div', 'result-detail', `答對 ${correctCount} / ${total} 題`));
      el.view.appendChild(node('p', 'result-msg', '這一輪算正式複習，答錯的字很快會再回來。'));
      const again = node('button', 'ghost wide', '回錯題檢討');
      again.addEventListener('click', () => renderExamReview(rec, renderHome));
      el.view.appendChild(again);
      const home = node('button', 'ghost wide', '回課程列表');
      home.addEventListener('click', renderHome);
      el.view.appendChild(home);
    },
  });
}

// ── 聽力卡（首頁）────────────────────────────────────────
// N5 的聽解佔總分三分之一，而中文母語者看得懂卻聽不懂是常態。
function renderListeningCard(lessons) {
  const passed = lessons.filter((l) => getLessonState(l.id).done);
  const maxLesson = passed.length ? Math.max(...passed.map((l) => l.id)) : 0;
  if (!maxLesson) return;                 // 一課都還沒過，沒有題庫

  const card = node('div', 'listen-card');
  card.appendChild(node('div', 'listen-title', '聽力練習'));

  if (!speechAvailable()) {
    card.appendChild(node('div', 'listen-sub', missingVoiceHelp()));
    el.view.appendChild(card);
    return;
  }

  card.appendChild(node('div', 'listen-sub',
    `只聽聲音、不給文字，從學過的 ${vocabUpTo(maxLesson).length} 個單字和句子出題。不影響複習排程。`));
  const btn = node('button', 'primary wide', '開始聽力練習');
  // 這一下點擊同時解鎖 iOS 的語音權限——iOS 第一次發聲必須在使用者手勢裡
  btn.addEventListener('click', () => startListening(lessons, maxLesson));
  card.appendChild(btn);
  el.view.appendChild(card);
}

function startListening(lessons, maxLesson) {
  const passed = lessons.filter((l) => getLessonState(l.id).done);
  const questions = buildListeningQuiz(vocabUpTo(maxLesson), passed, 12);
  if (!questions.length) return renderHome();

  runQuiz({
    title: '聽力練習',
    questions,
    affectSchedule: false,
    onBack: renderHome,
    onFinish(correctCount, total) {
      const pct = Math.round((correctCount / total) * 100);
      setView('聽力練習 · 完成', renderHome);
      el.view.appendChild(node('div', 'result-pct', `${pct}%`));
      el.view.appendChild(node('div', 'result-detail', `答對 ${correctCount} / ${total} 題`));
      el.view.appendChild(node('p', 'result-msg',
        pct >= 80 ? '耳朵跟上了。聽力就是靠每天聽一點累積的。'
          : '聽不出來很正常——看得懂跟聽得懂是兩種能力。多用慢速鍵，聽到能分辨為止。'));
      const again = node('button', 'primary wide', '再練一次');
      again.addEventListener('click', () => startListening(lessons, maxLesson));
      el.view.appendChild(again);
      const home = node('button', 'ghost wide', '回課程列表');
      home.addEventListener('click', renderHome);
      el.view.appendChild(home);
    },
  });
}

// ── 假名基礎卡（首頁）────────────────────────────────────
// 不擋課程進度：已經在上課的人隨時可以回來補濁音、拗音。
function renderKanaCard() {
  const card = node('div', 'kana-card');
  card.appendChild(node('div', 'kana-card-title', '假名基礎'));
  card.appendChild(node('div', 'kana-card-sub', '課程裡到處都是濁音和拗音（べんきょう、きょう、じゅう）。沒把握就先來這裡。'));
  const row = node('div', 'kana-sections');
  for (const sec of getKanaSections()) {
    const st = getKanaState(sec.id);
    const b = node('button', 'kana-section-btn' + (st.best >= 90 ? ' good' : ''));
    b.appendChild(node('span', 'kana-section-name', sec.title));
    b.appendChild(node('span', 'kana-section-meta', st.attempts ? `最佳 ${st.best}%` : sec.subtitle));
    b.addEventListener('click', () => renderKanaSection(sec.id));
    row.appendChild(b);
  }
  card.appendChild(row);
  el.view.appendChild(card);
}

// ── 假名一節：表格 + 練習 ────────────────────────────────
function renderKanaSection(id) {
  const sec = getKanaSection(id);
  setView(`假名 · ${sec.title}`, renderHome);

  el.view.appendChild(node('p', 'goal', sec.intro));

  const grid = node('div', 'kana-grid');
  grid.style.gridTemplateColumns = `repeat(${sec.cols}, 1fr)`;
  for (const r of sec.rows) {
    const cell = node('div', 'kana-cell');
    cell.appendChild(node('div', 'kana-h jp-plain', r.h));
    cell.appendChild(node('div', 'kana-k jp-plain', r.k));
    cell.appendChild(node('div', 'kana-r', r.r));
    if (r.zh && !r.ex) cell.appendChild(node('div', 'kana-ex', r.zh));      // 促音長音：詞本身的意思
    if (r.ex) cell.appendChild(node('div', 'kana-ex jp-plain', `${r.ex}`));  // 濁音拗音：課程裡的例詞
    if (r.ex) cell.appendChild(node('div', 'kana-exzh', r.zh));
    if (r.note) cell.appendChild(node('div', 'kana-exzh', r.note));
    grid.appendChild(cell);
  }
  el.view.appendChild(grid);

  const btn = node('button', 'primary wide', '練習這一節');
  btn.addEventListener('click', () => startKanaQuiz(sec));
  el.view.appendChild(btn);
}

function startKanaQuiz(sec) {
  runQuiz({
    title: `假名 · ${sec.title} · 練習`,
    questions: buildKanaQuiz(sec, 12),
    affectSchedule: false,
    onBack: () => renderKanaSection(sec.id),
    onFinish(correctCount, total) {
      const pct = Math.round((correctCount / total) * 100);
      recordKanaAttempt(sec.id, pct);
      setView(`假名 · ${sec.title} · 完成`, renderHome);
      el.view.appendChild(node('div', 'result-pct', `${pct}%`));
      el.view.appendChild(node('div', 'result-detail', `答對 ${correctCount} / ${total} 題`));
      el.view.appendChild(node('p', 'result-msg',
        pct >= 90 ? '很穩了。可以往下一節，或回課程繼續。'
          : pct >= 70 ? '大致可以，再練一兩次會更順。'
          : '還不熟，回去看一次表格再練。假名是底，底穩了後面全部會輕鬆。'));
      const again = node('button', 'primary wide', '再練一次');
      again.addEventListener('click', () => startKanaQuiz(sec));
      el.view.appendChild(again);
      const table = node('button', 'ghost wide', '回去看表格');
      table.addEventListener('click', () => renderKanaSection(sec.id));
      el.view.appendChild(table);
      const home = node('button', 'ghost wide', '回首頁');
      home.addEventListener('click', renderHome);
      el.view.appendChild(home);
    },
  });
}

/** 聽力題的播放控制：自動念一次，另外給重播與慢速 */
function audioControls(q) {
  const box = node('div', 'audio-box');
  const play = node('button', 'audio-btn', '🔊 再聽一次');
  play.addEventListener('click', () => speak(q.audio, 0.85));
  const slow = node('button', 'audio-btn slow', '🐢 慢速');
  slow.addEventListener('click', () => speak(q.audio, 0.55));
  box.append(play, slow);
  // 題目一出現就念一次；iOS 已經被「開始聽力練習」那一下解鎖了
  setTimeout(() => speak(q.audio, 0.85), 150);
  return box;
}

// ── 進度卡（首頁）────────────────────────────────────────
const fmtDate = (s) => { const [y, m, d] = s.split('-'); return `${y} 年 ${+m} 月 ${+d} 日`; };

function renderPlanCard() {
  const plan = getPlan();
  const card = node('div', 'plan-card');

  if (!plan) {
    card.appendChild(node('div', 'plan-title', '設定考試目標'));
    card.appendChild(node('div', 'plan-sub', 'JLPT 一年兩次，7 月和 12 月的第一個星期日。設定之後首頁會告訴你進度是超前還是落後。'));
    const row = node('div', 'plan-presets');
    for (const d of upcomingExamDates()) {
      const b = node('button', 'ghost', fmtDate(d));
      b.addEventListener('click', () => { setPlan(d, localDate()); renderHome(); });
      row.appendChild(b);
    }
    card.appendChild(row);
    const custom = node('label', 'plan-custom');
    custom.append('或自訂日期：');
    const input = document.createElement('input');
    input.type = 'date';
    input.min = localDate();
    input.addEventListener('change', () => { if (input.value) { setPlan(input.value, localDate()); renderHome(); } });
    custom.appendChild(input);
    card.appendChild(custom);
    el.view.appendChild(card);
    return;
  }

  const n5Ids = getLessons().filter((l) => (l.level || 'N5') === 'N5').map((l) => l.id);
  const pace = computePace(plan, countLessonsDone(n5Ids));
  const head = node('div', 'plan-head');
  head.appendChild(node('div', 'plan-title', `目標 ${fmtDate(plan.examDate)}`));
  const change = node('button', 'link', '更改');
  change.addEventListener('click', () => { clearPlan(); renderHome(); });
  head.appendChild(change);
  card.appendChild(head);

  if (pace.tooLate) {
    card.appendChild(node('div', 'plan-sub', '考試日已過。按「更改」設定下一場。'));
    el.view.appendChild(card);
    return;
  }

  let status, cls;
  if (pace.allDone)               { status = '課程全部完成'; cls = 'ahead'; }
  else if (pace.deltaWeeks >= 1)  { status = `超前 ${pace.deltaWeeks} 週`; cls = 'ahead'; }
  else if (pace.deltaWeeks <= -1) { status = `落後 ${-pace.deltaWeeks} 週`; cls = 'behind'; }
  else                            { status = '進度正常'; cls = 'ontrack'; }

  const line = node('div', 'plan-line');
  line.appendChild(node('span', '', `還有 ${pace.weeksLeft} 週`));
  line.appendChild(node('span', 'plan-dot', '·'));
  line.appendChild(node('span', '', `完成 ${countLessonsDone(n5Ids)} / ${TOTAL_LESSONS} 課`));
  line.appendChild(node('span', 'plan-dot', '·'));
  line.appendChild(node('span', 'plan-status ' + cls, status));
  card.appendChild(line);

  if (pace.allDone) {
    card.appendChild(node('div', 'plan-sub', `接下來是${pace.expectedPhase.name}：${pace.expectedPhase.note}。複習卡每天照做。`));
  } else if (pace.expectedLesson && cls === 'behind') {
    card.appendChild(node('div', 'plan-sub', `照計畫今天應該在第 ${pace.expectedLesson} 課。不用補進度，把複習卡做完、往下走就好。`));
  } else if (cls === 'ahead') {
    card.appendChild(node('div', 'plan-sub', '超前不用加快，把複習卡做穩比多走一課有用。'));
  }

  // 階段列表：現在在哪、接下來是什麼
  const list = node('div', 'plan-phases');
  for (const ph of PHASES) {
    const isNow = ph.id === pace.currentPhase.id;
    const row = node('div', 'plan-phase' + (isNow ? ' now' : ''));
    const range = ph.lessons ? `第 ${ph.lessons[0]}～${ph.lessons[1]} 課` : '';
    row.appendChild(node('span', 'plan-phase-name', `${ph.id}. ${ph.name}`));
    row.appendChild(node('span', 'plan-phase-range', range));
    if (isNow) row.appendChild(node('div', 'plan-phase-note', ph.note));
    list.appendChild(row);
  }
  card.appendChild(list);
  el.view.appendChild(card);
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
    if (q.jp) el.view.appendChild(jp(q.jp, 'quiz-jp'));                 // 句子：斷詞＋標假名
    if (q.promptJp) el.view.appendChild(jp(q.promptJp, 'quiz-jp'));     // 活用題：動詞ます形，標假名
    if (q.prompt) el.view.appendChild(jpPlain(q.prompt, 'quiz-prompt')); // 單字：不標假名
    if (q.audio) el.view.appendChild(audioControls(q));                  // 聽力：只有聲音，不給文字
    if (q.zh) el.view.appendChild(node('div', 'quiz-zh', q.zh));

    if (q.type === 'order') renderOrder(q, onAnswered);
    else renderChoices(q, onAnswered);
  }

  function onAnswered(ok, q) {
    if (ok) correctCount++;
    recordAnswer(q.vocabId, ok, affectSchedule);
    // 聽力題答完才揭曉文字——答題當下看到就不是聽力了
    if (q.revealJp) {
      const box = node('div', 'listen-reveal');
      box.appendChild(node('span', 'listen-reveal-label', '剛才念的是'));
      box.appendChild(jp(q.revealJp));
      el.view.appendChild(box);
    }
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
  const questions = buildReview(getEnrolledVocabIds(), passed, tokenizer, donePackWords());
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
  const questions = buildReview(getDueVocabIds(), passed, tokenizer, donePackWords());
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
    if (q.choiceKind === 'kana' || q.choiceKind === 'kanji') b.appendChild(jpPlain(c));  // 單字：不標假名
    else if (q.type === 'particle') b.appendChild(jp(c));                                // 助詞
    else b.textContent = c;                                                              // 中文
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
  loadCurriculum().then(loadPacks),   // 包的字要進單字索引，所以得等課程載好
  loadKana(),
  loadExamData(),
])
  .then(([tk]) => {
    tokenizer = tk;
    // 讓斷詞認得課程單字：台湾人、勉強します 這類 kuromoji 會切碎的詞才能保持完整
    // 課程單字 + 課程指定的額外讀音（四時半 這類不是單字、但 kuromoji 切法對不上單字表的詞）
    const allVocab = getLessons().flatMap((l) => l.vocab);
    // 動詞的所有變化形也登記：食べて／書かない／来ない 才會被當成一塊、讀音才會對
    const conjugated = allVocab.filter((v) => v.group).flatMap((v) => Object.values(conjugate(v)));
    registerWords([...allVocab, ...getLessons().flatMap((l) => l.readings || []), ...conjugated]);
    el.loading.hidden = true;
    el.kanaWrap.hidden = false;
    backfillReview();
    renderHome();
    initSpeech().then(() => renderHome());   // 語音清單是非同步的，載到了再重畫首頁
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

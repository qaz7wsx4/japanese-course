// 練習題產生器。
// 單字題直接由課程資料組合；助詞填空與排列組句則靠 kuromoji 斷詞自動生成，
// 所以課程只要寫例句，題目會自己長出來，不需要手寫題庫。

import { analyze } from './tokenizer.js?v=DEV';
import { vocabUpTo, wordForm, getVocab } from './curriculum.js?v=DEV';

const CORE_PARTICLES = ['は', 'が', 'を', 'に', 'で', 'へ', 'と', 'の'];

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const sample = (arr, n) => shuffle(arr).slice(0, n);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * 產生一份練習。
 * @param {object} lesson 課程資料
 * @param {object} tokenizer kuromoji tokenizer
 */
export function buildQuiz(lesson, tokenizer) {
  const pool = vocabUpTo(lesson.id);
  const current = lesson.vocab;
  const earlier = pool.filter((v) => v.lesson < lesson.id);

  const kanjiWords = current.filter((v) => v.kanji);

  // 中文母語者看到漢字就知道意思，所以單字題的難度要放在「讀音」上：
  // 給漢字不給假名、或只給假名不給漢字。N5 的漢字読み／表記就是這樣考的。
  const questions = [
    ...sample(kanjiWords, 3).map((v) => readingQ(v, pool)),      // 漢字 → 選讀音
    ...sample(current, 3).map((v) => zh2kanaQ(v, pool)),         // 中文 → 選假名
    ...sample(current, 3).map((v) => kana2zhQ(v, pool)),         // 假名 → 選中文
    ...sample(kanjiWords, 2).map((v) => kana2kanjiQ(v, pool)),   // 假名 → 選漢字
    ...particleQuestions(lesson, tokenizer, 3),
    ...orderQuestions(lesson, tokenizer, 2),
    // 穿插舊課單字，讓學過的東西持續回來
    ...sample(earlier, Math.min(2, earlier.length)).map((v) => reviewQ(v, pool)),
  ].filter(Boolean);

  return shuffle(questions);
}

/**
 * 產生一份複習。
 * @param {string[]} dueIds 今天要複習的單字 id（已依不熟程度排序）
 * @param {object[]} passedLessons 已通過的課，用來抽句型題與干擾選項
 */
export function buildReview(dueIds, passedLessons, tokenizer) {
  const MAX_WORDS = 20;                       // 一次不要太多，寧可明天再來
  const words = dueIds.slice(0, MAX_WORDS).map(getVocab).filter(Boolean);
  if (!words.length) return [];

  const maxLesson = Math.max(...passedLessons.map((l) => l.id), 1);
  const pool = vocabUpTo(maxLesson);

  // 幾種方向輪流問，避免只會「看得懂」不會「想得起來」
  const wordQs = words.map((v, i) => reviewQ(v, pool, i));

  // 穿插幾題句型，讓文法也一起回來
  const sentenceQs = [];
  for (const L of shuffle(passedLessons)) {
    if (sentenceQs.length >= 3) break;
    sentenceQs.push(...particleQuestions(L, tokenizer, 1), ...orderQuestions(L, tokenizer, 1));
  }

  return shuffle([...wordQs, ...sentenceQs.slice(0, 3)].filter(Boolean));
}

// ── 單字題 ──────────────────────────────────────────────
// 每題結構：
//   promptKind: 'text' | 'kanji' | 'kana'   題目怎麼呈現（kanji/kana 都不標假名）
//   choiceKind: 'text' | 'kana' | 'kanji'   選項怎麼呈現
// 干擾選項盡量挑「像」的：假名長度相近、或共用同一個漢字，不然一眼就能刪掉。

/** 從 pool 挑 n 個干擾項，依 score 越小越優先（相似度），同分隨機 */
function distractors(v, pool, n, score) {
  const cands = pool.filter((x) => x.id !== v.id && x.zh !== v.zh && x.kana !== v.kana);
  return shuffle(cands)
    .map((x) => ({ x, s: score(x) }))
    .sort((a, b) => a.s - b.s)
    .slice(0, n)
    .map((o) => o.x);
}

const lenDiff = (v) => (x) => Math.abs(x.kana.length - v.kana.length);
const sharesKanji = (v) => (x) => (x.kanji && [...x.kanji].some((c) => v.kanji.includes(c)) ? 0 : 1);

function build(v, choicesArr, fields) {
  const choices = shuffle(choicesArr);
  return { ...fields, answer: choices.findIndex((c) => c.id === v.id), vocabId: v.id, _choices: choices };
}

/** 漢字 → 選讀音（N5 漢字読み） */
function readingQ(v, pool, isReview = false) {
  if (!v.kanji) return kana2zhQ(v, pool, isReview);
  const ds = distractors(v, pool, 3, lenDiff(v));
  if (ds.length < 3) return null;
  const q = build(v, [v, ...ds], {
    type: 'reading', isReview,
    title: (isReview ? '複習：' : '') + '這個字怎麼唸？',
    promptKind: 'kanji', prompt: v.kanji,
    choiceKind: 'kana',
  });
  q.choices = q._choices.map((c) => c.kana);
  return q;
}

/** 假名 → 選中文（拿掉漢字，逼你靠聲音認字） */
function kana2zhQ(v, pool, isReview = false) {
  const ds = distractors(v, pool, 3, () => 0);
  if (ds.length < 3) return null;
  const q = build(v, [v, ...ds], {
    type: 'kana2zh', isReview,
    title: (isReview ? '複習：' : '') + '這個詞是什麼意思？',
    promptKind: 'kana', prompt: v.kana,
    choiceKind: 'text',
  });
  q.choices = q._choices.map((c) => c.zh);
  return q;
}

/** 中文 → 選假名（選項不給漢字，不能靠字形比對） */
function zh2kanaQ(v, pool, isReview = false) {
  const ds = distractors(v, pool, 3, lenDiff(v));
  if (ds.length < 3) return null;
  const q = build(v, [v, ...ds], {
    type: 'zh2kana', isReview,
    title: (isReview ? '複習：' : '') + '「' + v.zh + '」的日文怎麼唸？',
    promptKind: 'text', prompt: null,
    choiceKind: 'kana',
  });
  q.choices = q._choices.map((c) => c.kana);
  return q;
}

/** 假名 → 選漢字（N5 表記），干擾項優先挑共用漢字的 */
function kana2kanjiQ(v, pool, isReview = false) {
  if (!v.kanji) return zh2kanaQ(v, pool, isReview);
  const ds = distractors(v, pool.filter((x) => x.kanji), 3, sharesKanji(v));
  if (ds.length < 3) return null;
  const q = build(v, [v, ...ds], {
    type: 'kana2kanji', isReview,
    title: (isReview ? '複習：' : '') + '「' + v.kana + '」的漢字是哪一個？',
    promptKind: 'text', prompt: null,
    choiceKind: 'kanji',
  });
  q.choices = q._choices.map((c) => c.kanji);
  return q;
}

/** 複習用：幾種方向輪著出 */
function reviewQ(v, pool, i = Math.floor(Math.random() * 3)) {
  const kind = i % 3;
  if (kind === 0) return readingQ(v, pool, true);
  if (kind === 1) return kana2zhQ(v, pool, true);
  return zh2kanaQ(v, pool, true);
}

// ── 助詞填空（從例句自動生成）──────────────────────────
function particleQuestions(lesson, tokenizer, want) {
  const out = [];
  const examples = shuffle(lesson.grammar.flatMap((g) => g.examples).filter((ex) => !ex.noQuiz));

  for (const ex of examples) {
    if (out.length >= want) break;
    const toks = analyze(tokenizer, ex.jp)[0] || [];
    const spots = toks
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.pos === 'particle' && CORE_PARTICLES.includes(t.surface));
    if (!spots.length) continue;

    const spot = pick(spots);
    const answerParticle = spot.t.surface;
    const distractors = sample(CORE_PARTICLES.filter((p) => p !== answerParticle), 3);
    const choices = shuffle([answerParticle, ...distractors]);

    out.push({
      type: 'particle',
      title: '填入正確的助詞',
      // 用 ○ 當空格，避免底線在日文字體裡對不齊
      jp: toks.map((t, i) => (i === spot.i ? '○' : t.surface)).join(''),
      zh: ex.zh,
      choices,
      answer: choices.indexOf(answerParticle),
      vocabId: null,
    });
  }
  return out;
}

// ── 排列組句（從例句自動生成）──────────────────────────
function orderQuestions(lesson, tokenizer, want) {
  const out = [];
  const examples = shuffle(lesson.grammar.flatMap((g) => g.examples).filter((ex) => !ex.noQuiz));

  for (const ex of examples) {
    if (out.length >= want) break;
    const toks = (analyze(tokenizer, ex.jp)[0] || []).filter((t) => t.pos !== 'symbol');
    if (toks.length < 3 || toks.length > 7) continue;   // 太短沒挑戰、太長太痛苦

    const correct = toks.map((t) => t.surface);
    let order = shuffle(correct.map((_, i) => i));
    if (order.every((v, i) => v === i)) order = order.reverse();   // 別剛好洗成原順序

    out.push({
      type: 'order',
      title: '把句子排成正確的順序',
      zh: ex.zh,
      // 帶整個 token 而不只是字串：詞塊要用「在句子裡」的讀音來畫，
      // 單獨拿「人」去重新斷詞會變成 ひと，但在 台湾人 裡是 じん。
      choices: order.map((i) => toks[i]),
      solution: correct,             // 正確順序，作答時比對組出來的句子
      vocabId: null,
    });
  }
  return out;
}

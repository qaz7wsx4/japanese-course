// 練習題產生器。
// 單字題直接由課程資料組合；助詞填空與排列組句則靠 kuromoji 斷詞自動生成，
// 所以課程只要寫例句，題目會自己長出來，不需要手寫題庫。

import { analyze } from './tokenizer.js?v=DEV';
import { vocabUpTo, wordForm } from './curriculum.js?v=DEV';

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

  const questions = [
    ...sample(current, 5).map((v) => jp2zh(v, pool)),
    ...sample(current, 4).map((v) => zh2jp(v, pool)),
    ...particleQuestions(lesson, tokenizer, 3),
    ...orderQuestions(lesson, tokenizer, 2),
    // 穿插舊課單字，讓學過的東西持續回來
    ...sample(earlier, Math.min(3, earlier.length)).map((v) => jp2zh(v, pool, true)),
  ].filter(Boolean);

  return shuffle(questions);
}

// ── 單字題 ──────────────────────────────────────────────
function jp2zh(v, pool, isReview = false) {
  const distractors = sample(pool.filter((x) => x.id !== v.id && x.zh !== v.zh), 3);
  if (distractors.length < 3) return null;
  const choices = shuffle([v, ...distractors]);
  return {
    type: 'jp2zh',
    title: isReview ? '複習：這個詞是什麼意思？' : '這個詞是什麼意思？',
    jp: wordForm(v),
    choices: choices.map((c) => c.zh),
    answer: choices.findIndex((c) => c.id === v.id),
    vocabId: v.id,
    isReview,
  };
}

function zh2jp(v, pool) {
  const distractors = sample(pool.filter((x) => x.id !== v.id && x.zh !== v.zh), 3);
  if (distractors.length < 3) return null;
  const choices = shuffle([v, ...distractors]);
  return {
    type: 'zh2jp',
    title: '「' + v.zh + '」的日文是哪一個？',
    jp: null,
    choicesJp: choices.map((c) => wordForm(c)),
    choices: choices.map((c) => wordForm(c)),
    answer: choices.findIndex((c) => c.id === v.id),
    vocabId: v.id,
  };
}

// ── 助詞填空（從例句自動生成）──────────────────────────
function particleQuestions(lesson, tokenizer, want) {
  const out = [];
  const examples = shuffle(lesson.grammar.flatMap((g) => g.examples));

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
  const examples = shuffle(lesson.grammar.flatMap((g) => g.examples));

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
      choices: order.map((i) => correct[i]),
      solution: correct,             // 正確順序，作答時比對組出來的句子
      vocabId: null,
    });
  }
  return out;
}

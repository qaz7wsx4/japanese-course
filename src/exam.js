// N5 模擬考。
//
// 依官方公布的結構組卷（jlpt.jp，2026-11 查證）：
//   三節分開計時：文字・語彙 20 分／文法・読解 40 分／聴解 30 分
//   計分分兩區：言語知識・読解 0–120（及格線 38）／聴解 0–60（及格線 19）
//   總分 0–180，及格線 80。**三個條件要同時成立**，任一區沒過，總分再高也不及格。
//
// 題目從課程既有內容組出來，読解短文與即時応答另外寫在 curriculum/exam.json。
// 本模擬考只涵蓋本課程教過的 N5 範圍，比真正的考題容易——結果只能當參考，不是預測。

import { vocabUpTo, wordForm } from './curriculum.js?v=DEV';
import { analyze } from './tokenizer.js?v=DEV';

export const SECTIONS = [
  { id: 'vocab',   name: '文字・語彙',  minutes: 20, count: 20 },
  { id: 'grammar', name: '文法・読解',  minutes: 40, count: 20 },
  { id: 'listen',  name: '聴解',        minutes: 30, count: 12 },
];

export const SCORING = {
  knowledge: { max: 120, pass: 38, label: '言語知識・読解' },
  listening: { max: 60,  pass: 19, label: '聴解' },
  totalPass: 80,
  totalMax: 180,
};

let examData = null;
export async function loadExamData() {
  if (examData) return examData;
  const res = await fetch('curriculum/exam.json?v=DEV');
  if (!res.ok) throw new Error('模擬考資料載入失敗');
  examData = await res.json();
  return examData;
}

const shuffle = (a) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};
const sample = (a, n) => shuffle(a).slice(0, n);
const CORE_PARTICLES = ['は', 'が', 'を', 'に', 'で', 'へ', 'と', 'の'];

/**
 * 挑干擾項。score 越小越優先——干擾項必須「像」正解，否則一眼就能刪掉，
 * 模擬出來的分數會虛高，失去參考價值。
 */
function pickOptions(correct, others, n = 3, score = () => 0) {
  const uniq = [...new Set(others)].filter((x) => x && x !== correct);
  const ds = shuffle(uniq).map((x) => ({ x, s: score(x) })).sort((a, b) => a.s - b.s)
    .slice(0, n).map((o) => o.x);
  if (ds.length < n) return null;
  const opts = shuffle([correct, ...ds]);
  return { choices: opts, answer: opts.indexOf(correct) };
}

/** 長度接近、開頭或結尾相同的優先 */
const similarKana = (correct) => (x) =>
  Math.abs(x.length - correct.length) * 2
  + (x[0] === correct[0] ? 0 : 1)
  + (x.slice(-1) === correct.slice(-1) ? 0 : 1);

/** 共用漢字的優先，其次長度接近 */
const similarKanji = (correct) => (x) =>
  ([...x].some((c) => correct.includes(c)) ? 0 : 3) + Math.abs(x.length - correct.length);

// 每個單字的詞性只算一次——文脈規定的干擾項要跟正解同詞性，
// 否則會出現「（　　）に入って」的選項裡放動詞這種文法上不可能的選擇。
const posCache = new Map();
function posOf(v, tokenizer) {
  const key = wordForm(v);
  if (!posCache.has(key)) {
    const t = analyze(tokenizer, key)[0];
    posCache.set(key, t && t.length ? t[t.length - 1].pos : 'other');
  }
  return posCache.get(key);
}

/** 第一節：文字・語彙。漢字読み／表記／文脈規定／言い換え類義 */
function buildVocabSection(pool, lessons, count) {
  const kanjiWords = pool.filter((v) => v.kanji);
  const out = [];

  // 漢字読み：給漢字選讀音。干擾項挑讀音相近的
  for (const v of sample(kanjiWords, Math.ceil(count * 0.35))) {
    const o = pickOptions(v.kana, kanjiWords.map((x) => x.kana), 3, similarKana(v.kana));
    if (o) out.push({ kind: '漢字読み', stem: v.kanji, stemPlain: true,
                      title: 'この言葉の読み方は？', ...o, choiceKind: 'kana' });
  }
  // 表記：給假名選漢字。干擾項優先挑共用漢字的
  for (const v of sample(kanjiWords, Math.ceil(count * 0.25))) {
    const o = pickOptions(v.kanji, kanjiWords.map((x) => x.kanji), 3, similarKanji(v.kanji));
    if (o) out.push({ kind: '表記', stem: v.kana, stemPlain: true,
                      title: 'この言葉の漢字は？', ...o, choiceKind: 'kanji' });
  }
  // 文脈規定：例句挖掉一個詞，選填進去的詞
  const exs = shuffle(lessons.flatMap((l) => l.grammar.flatMap((g) => g.examples)).filter((e) => !e.noQuiz));
  for (const ex of exs) {
    if (out.length >= count) break;
    const toks = analyze(window.__examTokenizer, ex.jp)[0] || [];
    // 句子太短就挖空的話，上下文不足以指向唯一答案——
    // 「私は（　　）です。」填 日本人 或 台湾人 都通，那題就沒有正解可言。
    if (toks.filter((t) => t.pos !== 'symbol').length < 6) continue;
    const content = toks
      .filter((t) => ['noun', 'verb', 'adj-i', 'adj-na', 'adverb'].includes(t.pos));
    if (!content.length) continue;
    const t = content[Math.floor(Math.random() * content.length)];
    // 同詞性的詞才能當干擾項，不然文法上就不可能，等於送分
    const samePos = pool.filter((v) => posOf(v, window.__examTokenizer) === t.pos).map(wordForm);
    const o = pickOptions(t.surface, samePos, 3, similarKanji(t.surface));
    if (!o) continue;
    out.push({ kind: '文脈規定', stem: ex.jp.replace(t.surface, '（　　）'), stemPlain: true,
               title: '（　　）に入るものは？', ...o, choiceKind: 'kanji' });
  }
  return shuffle(out).slice(0, count);
}

/** 第二節：文法・読解。文法形式／文の組み立て／読解 */
function buildGrammarSection(pool, lessons, reading, count) {
  const out = [];
  const exs = shuffle(lessons.flatMap((l) => l.grammar.flatMap((g) => g.examples)).filter((e) => !e.noQuiz));

  // 文法形式の判断：助詞填空
  for (const ex of exs) {
    if (out.length >= Math.floor(count * 0.45)) break;
    const toks = analyze(window.__examTokenizer, ex.jp)[0] || [];
    const spots = toks.filter((t) => t.pos === 'particle' && CORE_PARTICLES.includes(t.surface));
    if (!spots.length) continue;
    const t = spots[Math.floor(Math.random() * spots.length)];
    let replaced = false;
    const stem = toks.map((x) => (!replaced && x === t ? (replaced = true, '（　　）') : x.surface)).join('');
    const o = pickOptions(t.surface, CORE_PARTICLES);
    if (o) out.push({ kind: '文法形式', stem, stemPlain: true,
                      title: '（　　）に入るものは？', ...o, choiceKind: 'kana' });
  }

  // 文の組み立て：把打散的詞排回去
  for (const ex of exs) {
    if (out.length >= Math.floor(count * 0.7)) break;
    const toks = (analyze(window.__examTokenizer, ex.jp)[0] || []).filter((t) => t.pos !== 'symbol');
    if (toks.length < 4 || toks.length > 7) continue;
    const correct = toks.map((t) => t.surface);
    let order = shuffle(correct.map((_, i) => i));
    if (order.every((v, i) => v === i)) order = order.reverse();
    out.push({ kind: '文の組み立て', type: 'order', title: '正しい順に並べてください',
               zh: ex.zh, choices: order.map((i) => toks[i]), solution: correct });
  }

  // 読解：短文＋設問
  const need = count - out.length;
  let added = 0;
  for (const p of shuffle(reading)) {
    if (added >= need) break;
    for (const q of p.questions) {
      if (added >= need) break;
      out.push({ kind: '読解', passage: p.text, stem: q.q, stemPlain: false,
                 title: '本文を読んで答えてください', choices: q.choices, answer: q.answer,
                 choiceKind: 'kana' });
      added++;
    }
  }
  return out.slice(0, count);
}

/** 第三節：聴解。課題理解（聽詞）／即時応答 */
function buildListenSection(pool, quickResponse, count) {
  const out = [];
  const nQuick = Math.min(quickResponse.length, Math.floor(count * 0.4));

  for (const v of sample(pool, count - nQuick)) {
    const o = pickOptions(v.zh, pool.map((x) => x.zh), 3,
                          (x) => Math.abs(x.length - v.zh.length));
    if (o) out.push({ kind: '課題理解', audio: v.kana, revealJp: wordForm(v),
                      title: '聞いて、正しい意味を選んでください', ...o, choiceKind: 'text' });
  }
  for (const q of sample(quickResponse, nQuick)) {
    const opts = shuffle(q.choices.map((c, i) => ({ c, ok: i === q.answer })));
    out.push({ kind: '即時応答', audio: q.prompt, revealJp: q.prompt,
               title: '聞いて、正しい返事を選んでください',
               choices: opts.map((o) => o.c), answer: opts.findIndex((o) => o.ok),
               choiceKind: 'kana' });
  }
  return shuffle(out).slice(0, count);
}

/**
 * 組一份完整的模擬考。
 * @param {object} tokenizer kuromoji
 * @param {object[]} lessons 已通過的 N5 課（題目只從學過的出）
 * @param {boolean} canListen 裝置有沒有日文語音；沒有的話聴解整節跳過
 */
export function buildExam(tokenizer, lessons, canListen) {
  window.__examTokenizer = tokenizer;        // 給上面幾個 builder 用
  const maxLesson = Math.max(...lessons.map((l) => l.id), 1);
  const pool = vocabUpTo(maxLesson);

  const sections = [
    { ...SECTIONS[0], questions: buildVocabSection(pool, lessons, SECTIONS[0].count) },
    { ...SECTIONS[1], questions: buildGrammarSection(pool, lessons, examData.reading, SECTIONS[1].count) },
  ];
  if (canListen) {
    sections.push({ ...SECTIONS[2], questions: buildListenSection(pool, examData.quickResponse, SECTIONS[2].count) });
  }
  return sections;
}

/**
 * 依官方計分方式算分。
 * @param {{id: string, correct: number, total: number}[]} results
 */
export function scoreExam(results) {
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  const kCorrect = (byId.vocab?.correct || 0) + (byId.grammar?.correct || 0);
  const kTotal = (byId.vocab?.total || 0) + (byId.grammar?.total || 0);
  const lCorrect = byId.listen?.correct || 0;
  const lTotal = byId.listen?.total || 0;

  const knowledge = kTotal ? Math.round((kCorrect / kTotal) * SCORING.knowledge.max) : 0;
  const listening = lTotal ? Math.round((lCorrect / lTotal) * SCORING.listening.max) : null;
  const total = knowledge + (listening ?? 0);

  return {
    knowledge, listening, total,
    skippedListening: listening === null,
    knowledgePassed: knowledge >= SCORING.knowledge.pass,
    listeningPassed: listening !== null && listening >= SCORING.listening.pass,
    // 聴解沒考就無法判定及格——真考試缺考一節直接不合格
    passed: listening !== null && total >= SCORING.totalPass
            && knowledge >= SCORING.knowledge.pass && listening >= SCORING.listening.pass,
  };
}

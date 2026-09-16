// 假名基礎：資料載入與練習題生成。
// 跟課程單字題是同一套答題流程（runQuiz），只是題目對象是假名而非單字。

let data = null;

export async function loadKana() {
  if (data) return data;
  const res = await fetch('curriculum/kana.json?v=DEV');
  if (!res.ok) throw new Error('假名資料載入失敗');
  data = await res.json();
  return data;
}

export const getKanaSections = () => data.sections;
export const getKanaSection = (id) => data.sections.find((s) => s.id === id);

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const sample = (arr, n) => shuffle(arr).slice(0, n);

/** 羅馬拼音去掉最後的母音，當作「同一行」的判斷：ka/ki/ku → k */
const consonant = (r) => r.replace(/[aiueo]+$/, '');
const vowel = (r) => (r.match(/[aiueo]$/) || [''])[0];

/**
 * 干擾項要像：同一行（が→ぎ・ぐ）或同一段（が→ざ・だ・ば）優先。
 * 隨機抽的話 が 配 ぱ・ぼ・ぜ 一眼就能刪掉。
 */
function distractors(row, pool, n) {
  const cands = pool.filter((x) => x !== row && x.r !== row.r && x.h !== row.h);
  const score = (x) =>
    consonant(x.r) === consonant(row.r) ? 0 : vowel(x.r) === vowel(row.r) ? 1 : 2;
  return shuffle(cands)
    .map((x) => ({ x, s: score(x) + Math.random() * 0.5 }))
    .sort((a, b) => a.s - b.s)
    .slice(0, n)
    .map((o) => o.x);
}

function make(row, pool, fields, pick) {
  const ds = distractors(row, pool, 3);
  if (ds.length < 3) return null;
  const opts = shuffle([row, ...ds]);
  return {
    ...fields,
    choices: opts.map(pick),
    answer: opts.indexOf(row),
    vocabId: null,          // 假名不進單字複習排程
  };
}

/**
 * 產生一節的練習。四種方向輪著出：
 *   看假名選拼音、看拼音選假名、平假名→片假名、片假名→平假名
 */
export function buildKanaQuiz(section, count = 12) {
  const pool = section.rows;
  const per = Math.ceil(count / 4);
  const qs = [
    ...sample(pool, per).map((r) => make(r, pool,
      { type: 'kana2romaji', title: '這個怎麼唸？', prompt: r.h, promptKind: 'kana', choiceKind: 'text' },
      (x) => x.r)),
    ...sample(pool, per).map((r) => make(r, pool,
      { type: 'romaji2kana', title: '「' + r.r + '」是哪一個？', prompt: null, choiceKind: 'kana' },
      (x) => x.h)),
    ...sample(pool, per).map((r) => make(r, pool,
      { type: 'hira2kata', title: '對應的片假名是哪一個？', prompt: r.h, promptKind: 'kana', choiceKind: 'kana' },
      (x) => x.k)),
    ...sample(pool, per).map((r) => make(r, pool,
      { type: 'kata2hira', title: '對應的平假名是哪一個？', prompt: r.k, promptKind: 'kana', choiceKind: 'kana' },
      (x) => x.h)),
  ].filter(Boolean);
  return shuffle(qs).slice(0, count);
}

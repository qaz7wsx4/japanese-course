// 官方考卷計分。
//
// 這個 APP 不能提供官方題目——公式問題集是 JEES 出的著作，官網的問題例也不能複製散佈。
// 所以這裡只做 APP 做得到、而紙本做不到的兩件事：
//   1. 照官方時間分節計時
//   2. 把紙上的結果變成「哪個大問弱」的資料，並記錄歷次變化
//
// 大問結構出自官方「Ｎ５ 大問のねらい」（jlpt.jp/guideline/pdf/n5_revised.pdf，國際交流基金，
// 2026-11 查證）。官方不公布每個大問的小問數，所以題數由使用者自己填。
//
// 刻意不換算成 /180：JLPT 用等化計分，同一題在不同場次的權重不同，
// 從答對率推總分是編的。這裡只給答對率。

export const PAPER = [
  {
    id: 'vocab', name: '言語知識（文字・語彙）', minutes: 20,
    parts: [
      { n: 1, name: '漢字読み',     aim: '漢字寫的詞怎麼唸' },
      { n: 2, name: '表記',         aim: '平假名寫的詞，漢字／片假名怎麼寫' },
      { n: 3, name: '文脈規定',     aim: '依上下文選出該填的詞' },
      { n: 4, name: '言い換え類義', aim: '選出意思最接近的說法' },
    ],
  },
  {
    id: 'grammar', name: '言語知識（文法）・読解', minutes: 40,
    parts: [
      { n: 1, name: '文の文法1（文法形式の判断）', aim: '選出符合句意的文法形式' },
      { n: 2, name: '文の文法2（文の組み立て）',   aim: '把詞排成通順且合文法的句子' },
      { n: 3, name: '文章の文法',                 aim: '選出符合文章脈絡的句子' },
      { n: 4, name: '内容理解（短文）',           aim: '約 80 字的短文理解' },
      { n: 5, name: '内容理解（中文）',           aim: '約 240 字的文章理解' },
      { n: 6, name: '情報検索',                   aim: '從公告、傳單裡找出需要的資訊' },
    ],
  },
  {
    id: 'listen', name: '聴解', minutes: 30,
    parts: [
      { n: 1, name: '課題理解',     aim: '聽完整段話，判斷接下來該做什麼' },
      { n: 2, name: 'ポイント理解', aim: '先知道要聽什麼，再抓重點' },
      { n: 3, name: '発話表現',     aim: '看圖聽說明，選出合適的說法' },
      { n: 4, name: '即時応答',     aim: '聽短句，選出合適的回應' },
    ],
  },
];

export const partKey = (sectionId, n) => `${sectionId}-${n}`;

/**
 * 算一份紙本考卷的結果。
 * @param {Record<string, {correct:number,total:number}>} entries partKey → 答對／題數
 */
export function scorePaper(entries) {
  const sections = PAPER.map((sec) => {
    const parts = sec.parts.map((p) => {
      const e = entries[partKey(sec.id, p.n)] || {};
      const total = Number(e.total) || 0;
      const correct = Math.min(Number(e.correct) || 0, total);
      return { ...p, correct, total, rate: total ? correct / total : null };
    });
    const correct = parts.reduce((a, p) => a + p.correct, 0);
    const total = parts.reduce((a, p) => a + p.total, 0);
    return { id: sec.id, name: sec.name, parts, correct, total, rate: total ? correct / total : null };
  });
  const correct = sections.reduce((a, s) => a + s.correct, 0);
  const total = sections.reduce((a, s) => a + s.total, 0);
  // 最弱的大問。不能直接比正確率：0/1 會永遠排第一，但一題什麼都說明不了。
  // 用 Laplace 平滑 (對+0.5)/(題+1)：題數少的往 50% 靠，題數多的接近真實正確率，
  // 所以 0/2（0.17）會排在 1/3（0.38）前面，而 0/1（0.25）不會蓋過 0/2。
  const smoothed = (p) => (p.correct + 0.5) / (p.total + 1);
  const weakest = sections
    .flatMap((s) => s.parts.map((p) => ({ ...p, section: s.name })))
    .filter((p) => p.total >= 2)
    .sort((a, b) => smoothed(a) - smoothed(b))[0] || null;
  return { sections, correct, total, rate: total ? correct / total : null, weakest };
}

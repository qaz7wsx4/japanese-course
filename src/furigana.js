// ふりがな 對齊。
//
// kuromoji 只給「整個詞的片假名讀音」，不會告訴你哪個假名對應哪個漢字。
// 直接把讀音標在整個詞上會變成「食べました→たべました」，送り仮名上面
// 也被標了假名，這是錯的。
//
// 作法：以「假名」為錨點把詞切段，夾在假名之間的漢字區塊分到剩下的讀音。
//   食べました / たべました  →  食[た] + べました
//   落ち着く   / おちつく    →  落[お] + ち + 着[つ] + く

const KANJI = /[㐀-䶿一-鿿豈-﫿々〆ヶ]/;
const KANA  = /[ぁ-ゟァ-ヿー]/;

/** 片假名 → 平假名（長音符號 ー 原樣保留） */
export function toHiragana(s) {
  return String(s ?? '').replace(/[ァ-ヶ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60)
  );
}

const isKanji = (c) => KANJI.test(c);

/** 整個字串是否只由漢字與假名組成（數字、拉丁字母、標點都不算） */
function isKanjiKanaOnly(s) {
  for (const c of s) if (!KANJI.test(c) && !KANA.test(c)) return false;
  return true;
}

/** 把詞面切成「漢字段」與「假名段」交替的區塊 */
function splitRuns(surface) {
  const runs = [];
  for (const c of surface) {
    const kanji = isKanji(c);
    const last = runs[runs.length - 1];
    if (last && last.kanji === kanji) last.text += c;
    else runs.push({ kanji, text: c });
  }
  return runs;
}

/**
 * @param {string} surface 詞面，例：食べました
 * @param {string} reading kuromoji 的片假名讀音，例：タベマシタ
 * @returns {Array<{base: string, rt: string|null}>} rt 為 null 代表不標假名
 */
export function toRuby(surface, reading) {
  const plain = [{ base: surface, rt: null }];

  if (!surface) return plain;
  // 沒有漢字就不需要標；讀音缺漏（kuromoji 對未知詞會給 undefined）也不標。
  if (!KANJI.test(surface)) return plain;
  if (!reading) return plain;
  // 含數字或拉丁字母的詞，讀音跟詞面對不起來，寧可不標也不要標錯。
  if (!isKanjiKanaOnly(surface)) return plain;

  const yomi = toHiragana(reading);
  const runs = splitRuns(surface);
  const out = [];
  let ri = 0;

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];

    if (!run.kanji) {
      // 假名段必須逐字對上讀音，對不上代表整體對齊失敗。
      const kana = toHiragana(run.text);
      if (yomi.slice(ri, ri + kana.length) !== kana) return fallback(surface, yomi);
      ri += kana.length;
      out.push({ base: run.text, rt: null });
      continue;
    }

    let rt;
    if (i === runs.length - 1) {
      rt = yomi.slice(ri);
      ri = yomi.length;
    } else {
      // 下一段必為假名段，用它在讀音中的位置切出這塊漢字的讀音。
      // 從 ri+1 開始找，因為漢字至少要吃掉一個假名。
      const nextKana = toHiragana(runs[i + 1].text);
      const idx = yomi.indexOf(nextKana, ri + 1);
      if (idx === -1) return fallback(surface, yomi);
      rt = yomi.slice(ri, idx);
      ri = idx;
    }

    if (!rt) return fallback(surface, yomi);
    out.push({ base: run.text, rt });
  }

  if (ri !== yomi.length) return fallback(surface, yomi);
  return out;
}

// 對齊失敗時退回「整個詞標一次讀音」——不漂亮，但比沒有讀音好。
function fallback(surface, yomi) {
  return [{ base: surface, rt: yomi }];
}

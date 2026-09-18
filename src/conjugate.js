// 動詞活用。給 ます形（漢字寫法與假名）和組別，算出所有 N5 會用到的形態。
//
// 課程資料只需要寫 ます形 和 group，其餘全部由這裡推導，好處有兩個：
//   1. 活用題的正確答案與「套錯規則」的干擾項都能自動生成
//   2. 所有變化形登記給斷詞器後，食べて／書かない 會被當成一塊，不會被切碎
//
// group: 1 = I 類（五段）、2 = II 類（一段）、3 = III 類（します／来ます）

// I 類：ます前一個字（い段）→ 各形態
const TE   = { き:'いて', ぎ:'いで', し:'して', ち:'って', り:'って', い:'って', に:'んで', び:'んで', み:'んで' };
const NAI  = { き:'か',   ぎ:'が',   し:'さ',   ち:'た',   り:'ら',   い:'わ',   に:'な',   び:'ば',   み:'ま'   };
const DICT = { き:'く',   ぎ:'ぐ',   し:'す',   ち:'つ',   り:'る',   い:'う',   に:'ぬ',   び:'ぶ',   み:'む'   };

const teToTa = (te) => te.replace(/て$/, 'た').replace(/で$/, 'だ');

/**
 * 對一個字串（漢字寫法或假名皆可，兩者結尾的送り仮名相同）做基本四形。
 * @param {string} base  ます形
 * @param {string} kana  ます形的假名（用來判斷特例）
 * @param {boolean} isKana base 本身是不是假名
 */
function baseForms(base, kana, group, isKana) {
  const stem = base.slice(0, -2);              // 去掉 ます

  if (group === 3) {
    if (kana.endsWith('します')) {
      const s = base.slice(0, -3);
      return { te: s + 'して', ta: s + 'した', nai: s + 'しない', dict: s + 'する' };
    }
    if (kana === 'きます') {                      // 来ます：假名不規則，漢字不變
      return isKana
        ? { te: 'きて', ta: 'きた', nai: 'こない', dict: 'くる' }
        : { te: stem + 'て', ta: stem + 'た', nai: stem + 'ない', dict: stem + 'る' };
    }
  }

  if (group === 2) {
    return { te: stem + 'て', ta: stem + 'た', nai: stem + 'ない', dict: stem + 'る' };
  }

  // I 類
  const last = stem.slice(-1);
  const s = stem.slice(0, -1);
  if (!TE[last]) throw new Error(`無法活用：${base}（${kana}）`);

  let te = s + TE[last];
  if (kana === 'いきます') te = s + 'って';       // 行きます → 行って，唯一的例外
  let nai = s + NAI[last] + 'ない';
  if (kana === 'あります') nai = 'ない';           // あります 的否定是 ない，不是 あらない
  return { te, ta: teToTa(te), nai, dict: s + DICT[last] };
}

/**
 * @param {{kanji: string|null, kana: string, group: number}} v
 * @returns {Record<string, {kanji: string, kana: string}>}
 *   masu / te / ta / nai / dict / naide / nakereba / nakute / tari
 */
export function conjugate(v) {
  const kanjiBase = v.kanji || v.kana;
  const k = baseForms(kanjiBase, v.kana, v.group, !v.kanji);
  const h = baseForms(v.kana, v.kana, v.group, true);

  const pair = (a, b) => ({ kanji: a, kana: b });
  const naiStem = (x) => x.slice(0, -2);          // 去掉 ない

  return {
    masu:     pair(kanjiBase, v.kana),
    te:       pair(k.te, h.te),
    ta:       pair(k.ta, h.ta),
    nai:      pair(k.nai, h.nai),
    dict:     pair(k.dict, h.dict),
    naide:    pair(k.nai + 'で', h.nai + 'で'),
    nakereba: pair(naiStem(k.nai) + 'なければ', naiStem(h.nai) + 'なければ'),
    nakute:   pair(naiStem(k.nai) + 'なくて',   naiStem(h.nai) + 'なくて'),
    tari:     pair(k.ta + 'り', h.ta + 'り'),
  };
}

/**
 * 「套錯規則」的干擾項：學習者真的會犯的錯。
 * 例如 書きます 的て形，錯法有 書きて（當成 II 類）、書って（把 き 當 ち）、書んで（當 み）。
 * @returns {string[]} 不含正解、已去重的錯誤形態（漢字寫法）
 */
export function wrongForms(v, form) {
  const base = v.kanji || v.kana;
  const stem = base.slice(0, -2);
  const s = stem.slice(0, -1);
  const correct = conjugate(v)[form].kanji;

  // 依「像不像人會犯的錯」排序，練習題取前三個。
  //   I 類的典型錯：當成 II 類（書きて）、套錯 I 類的規則（書って、書んで）
  //   II 類的典型錯：多加一個ら（食べらない）、當成 I 類（見って）
  let cands = [];
  const isII = v.group === 2;
  switch (form) {
    case 'te':
      cands = isII
        ? [stem + 'って', stem + 'んで', stem + 'いて', s + 'って', s + 'いて']
        : [stem + 'て', s + 'って', s + 'んで', s + 'いて', s + 'して', stem + 'って'];
      break;
    case 'ta':
      cands = isII
        ? [stem + 'った', stem + 'んだ', stem + 'いた', s + 'った', s + 'いた']
        : [stem + 'た', s + 'った', s + 'んだ', s + 'いた', s + 'した', stem + 'った'];
      break;
    case 'nai':
      cands = isII
        ? [stem + 'らない', stem + 'わない', s + 'かない', s + 'らない', stem + 'くない']
        : [stem + 'ない', s + 'かない', s + 'らない', s + 'わない', s + 'まない', stem + 'らない'];
      break;
    case 'dict':
      cands = isII
        ? [s + 'く', s + 'う', stem + 'う', s + 'す', stem]
        : [stem + 'る', s + 'う', s + 'く', s + 'す', s + 'つ', s + 'む', stem];
      break;
  }
  return [...new Set(cands)].filter((x) => x && x !== correct && x !== base);
}

export const GROUP_LABEL = { 1: 'I 類', 2: 'II 類', 3: 'III 類' };
export const FORM_LABEL = { te: 'て形', ta: 'た形', nai: 'ない形', dict: '辞書形' };

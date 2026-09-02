// 詞性正規化：把 kuromoji 幾十種細分詞性收斂成初學者看得懂的少數幾類。
// 每一類對應一個 CSS class（style.css 裡的 .pos-*）。

export const POS_CATEGORIES = [
  { id: 'noun',      label: '名詞' },
  { id: 'verb',      label: '動詞' },
  { id: 'particle',  label: '助詞' },
  { id: 'adj-i',     label: 'い形容詞' },
  { id: 'adj-na',    label: 'な形容詞' },
  { id: 'adverb',    label: '副詞' },
  { id: 'aux',       label: '助動詞' },
  { id: 'other',     label: '其他' },
];

const LABELS = Object.fromEntries(POS_CATEGORIES.map((c) => [c.id, c.label]));

/**
 * @param {object} t kuromoji 原始 token
 * @returns {{ id: string, label: string }}
 */
export function classify(t) {
  const pos = t.pos;
  const d1 = t.pos_detail_1;

  // 形容動詞語幹（例：静か、便利）在 kuromoji 裡歸在名詞底下，
  // 但對學習者來說它是「な形容詞」，必須拆出來。
  if (pos === '名詞' && d1 === '形容動詞語幹') return tag('adj-na');

  switch (pos) {
    case '名詞':   return tag('noun');
    case '動詞':   return tag('verb');
    case '助詞':   return tag('particle');
    case '形容詞': return tag('adj-i');
    case '副詞':   return tag('adverb');
    case '助動詞': return tag('aux');
    case '記号':   return tag('symbol');
    default:       return tag('other');
  }
}

function tag(id) {
  return { id, label: LABELS[id] ?? '' };
}

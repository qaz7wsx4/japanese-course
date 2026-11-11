// 主題單字包。
//
// 課程 25 課只教了 303 個單字，N5 實際需要約 800 個。差的那幾百個字沒有文法可以掛，
// 硬塞進課裡會把課程結構撐壞，所以另外用主題分包：一個包一個生活場景，只背字、不教句型。
//
// 這些字一樣會進間隔複習，所以背完不會掉。

import { registerExtraVocab } from './curriculum.js?v=DEV';
import { registerWords } from './tokenizer.js?v=DEV';

let data = null;

export async function loadPacks() {
  if (data) return data;
  const res = await fetch('curriculum/packs.json?v=DEV');
  if (!res.ok) throw new Error('單字包載入失敗');
  data = await res.json();
  const all = data.packs.flatMap((p) => p.words.map((w) => ({ ...w, pack: p.id })));
  registerExtraVocab(all);     // 讓複習與 SRS 查得到這些字
  // 一字多讀的詞（一日＝ついたち／いちにち、辛い＝からい／つらい）標了 noForce，
  // 當單字卡教、但不去覆寫斷詞讀音——覆寫會把別的句子讀錯。
  registerWords(all.filter((w) => !w.noForce));
  return data;
}

export const getPacks = () => data.packs;
export const getPack = (id) => data.packs.find((p) => p.id === id);
export const allPackWords = () => data.packs.flatMap((p) => p.words);

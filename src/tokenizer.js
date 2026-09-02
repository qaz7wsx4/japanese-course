// kuromoji 的載入與斷詞。
// 字典放在本地 vendor/ 底下：一來 kuromoji 內部用 path.join 組網址，
// 會把 CDN 的 https:// 壓成 https:/ 而載入失敗；二來本地檔可離線使用。

import { toRuby, toHiragana } from './furigana.js';
import { classify } from './pos.js';

const DICT_PATH = 'vendor/kuromoji/dict';

// 各字典檔的實際大小，用來算載入進度。
const FILE_SIZES = {
  'base.dat.gz': 3956825, 'check.dat.gz': 3111633, 'tid.dat.gz': 1605820,
  'tid_pos.dat.gz': 5916009, 'tid_map.dat.gz': 1485576, 'cc.dat.gz': 1692067,
  'unk.dat.gz': 10512, 'unk_pos.dat.gz': 10540, 'unk_map.dat.gz': 1190,
  'unk_char.dat.gz': 306, 'unk_compat.dat.gz': 338, 'unk_invoke.dat.gz': 1140,
};

export const DICT_TOTAL_BYTES = Object.values(FILE_SIZES).reduce((a, b) => a + b, 0);

/**
 * 載入字典並建立 tokenizer。
 * kuromoji 沒有提供進度回呼，所以在載入期間暫時包住 XMLHttpRequest
 * 來取得實際下載位元組數，載完立刻還原。
 *
 * @param {(loaded: number, total: number) => void} onProgress
 * @returns {Promise<object>} kuromoji tokenizer
 */
export function loadTokenizer(onProgress) {
  return new Promise((resolve, reject) => {
    const loadedPerFile = new Map();
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    let restored = false;

    const restore = () => {
      if (restored) return;
      XMLHttpRequest.prototype.open = origOpen;
      XMLHttpRequest.prototype.send = origSend;
      restored = true;
    };

    const emit = () => {
      let sum = 0;
      for (const n of loadedPerFile.values()) sum += n;
      onProgress?.(Math.min(sum, DICT_TOTAL_BYTES), DICT_TOTAL_BYTES);
    };

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__url = String(url);
      return origOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      const url = this.__url || '';
      if (url.includes(DICT_PATH)) {
        const name = url.split('/').pop();
        this.addEventListener('progress', (e) => {
          if (e.lengthComputable) { loadedPerFile.set(name, e.loaded); emit(); }
        });
        // 讀快取時 progress 事件可能完全不觸發，所以完成時直接補上該檔大小。
        this.addEventListener('load', () => {
          loadedPerFile.set(name, FILE_SIZES[name] ?? loadedPerFile.get(name) ?? 0);
          emit();
        });
      }
      return origSend.apply(this, args);
    };

    kuromoji.builder({ dicPath: DICT_PATH }).build((err, tokenizer) => {
      restore();
      if (err) reject(err);
      else resolve(tokenizer);
    });
  });
}

/**
 * 斷詞。逐行處理以保留原文的段落結構（kuromoji 不會保留換行）。
 * @returns {Array<Array<Token>>} 每個元素是一行的 tokens
 */
export function analyze(tokenizer, text) {
  return text.split(/\r?\n/).map((line) =>
    line.trim() ? merge(tokenizer.tokenize(line).map(normalize)) : []
  );
}

// kuromoji 會把「行きました」切成 行き＋まし＋た 三個形態素。
// 這對初學者太破碎，而且點詞時該顯示的是整個「行きました」對應原形「行く」。
// 因此把 動詞／い形容詞 後面接的助動詞（與動詞接尾）併回同一個顯示詞塊。
function merge(tokens) {
  const out = [];
  for (const t of tokens) {
    const prev = out[out.length - 1];
    if (prev && canAttach(prev, t)) {
      prev.surface += t.surface;
      prev.reading += t.reading;
      prev.ruby = prev.ruby.concat(t.ruby);
      prev.conjForm = t.conjForm || prev.conjForm;
      prev.parts.push(t);          // P2 的詞卡靠這個判讀活用（例：まし＋た＝過去肯定）
    } else {
      out.push({ ...t, parts: [t] });
    }
  }
  return out;
}

function canAttach(prev, t) {
  if (prev.pos !== 'verb' && prev.pos !== 'adj-i') return false;
  return t.pos === 'aux' || (t._pos === '動詞' && t._d1 === '接尾');
}

function normalize(t) {
  const surface = t.surface_form;
  const reading = t.reading && t.reading !== '*' ? t.reading : '';
  const pos = classify(t);

  return {
    surface,
    reading: toHiragana(reading),
    basic: t.basic_form && t.basic_form !== '*' ? t.basic_form : surface,
    pos: pos.id,
    posLabel: pos.label,
    _pos: t.pos,
    _d1: t.pos_detail_1,
    // 以下兩項 P1 用不到，但 P2 的詞卡要判讀活用形，先留著。
    conjType: t.conjugated_type !== '*' ? t.conjugated_type : '',
    conjForm: t.conjugated_form !== '*' ? t.conjugated_form : '',
    ruby: toRuby(surface, reading),
  };
}

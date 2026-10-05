// 日文語音合成。用瀏覽器內建的 speechSynthesis，不需要 API、不花錢，
// 裝置上有本機日文語音時連網路都不用。
//
// 三個必須處理的現實：
//   1. getVoices() 可能一開始是空的，要等 voiceschanged，而且有些瀏覽器不會觸發這個事件
//   2. iOS 第一次發聲必須在使用者手勢（點擊）裡觸發
//   3. 有些裝置根本沒有日文語音，要講清楚怎麼裝，而不是靜靜地沒聲音

let voice = null;
let checked = false;

function loadVoices() {
  return new Promise((resolve) => {
    const now = speechSynthesis.getVoices();
    if (now.length) return resolve(now);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(speechSynthesis.getVoices());
    };
    speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
    setTimeout(finish, 1500);        // 不觸發事件的瀏覽器用逾時兜底
  });
}

/** @returns {Promise<{available: boolean, name: string|null, local: boolean}>} */
export async function initSpeech() {
  if (checked) return status();
  checked = true;
  if (!('speechSynthesis' in window)) return status();

  const ja = (await loadVoices()).filter((v) => (v.lang || '').toLowerCase().startsWith('ja'));
  voice = pickVoice(ja);
  return status();
}

// 各平台的標準日文語音。新版 macOS／iOS 會塞一堆玩具聲（Eddy、Grandma、Rocko…），
// 那些是刻意做得誇張的音效聲，拿來學發音會學歪，必須避開。
const PREFERRED = ['kyoko', 'otoya', 'hattori', 'o-ren', 'google 日本語', 'nanami', 'ayumi', 'haruka', 'ichiro'];
const NOVELTY = ['eddy', 'flo', 'grandma', 'grandpa', 'reed', 'rocko', 'sandy', 'shelley',
                 'bubbles', 'jester', 'organ', 'superstar', 'trinoids', 'whisper', 'wobble', 'bells', 'boing'];

function pickVoice(ja) {
  if (!ja.length) return null;
  const score = (v) => {
    const n = (v.name || '').toLowerCase();
    const pref = PREFERRED.findIndex((x) => n.includes(x));
    if (pref >= 0) return pref;                       // 0..8：越前面越好
    if (NOVELTY.some((x) => n.includes(x))) return 100;  // 玩具聲，最後才考慮
    return 50;                                        // 其他不認得的，排中間
  };
  return [...ja].sort((a, b) =>
    score(a) - score(b) ||
    (b.localService ? 1 : 0) - (a.localService ? 1 : 0) ||   // 本機優先，可離線
    (b.default ? 1 : 0) - (a.default ? 1 : 0)
  )[0];
}

const status = () => ({
  available: !!voice,
  name: voice ? voice.name : null,
  local: voice ? !!voice.localService : false,
});

export const speechAvailable = () => !!voice;

/**
 * 念一段日文。
 * @param {string} text 要念的內容。單字請傳假名——傳漢字的話 TTS 可能讀成另一個音。
 * @param {number} rate 語速，預設比正常慢一點，初學者才跟得上
 */
export function speak(text, rate = 0.85) {
  if (!voice || !text) return false;
  try {
    speechSynthesis.cancel();        // 先停掉前一句，避免疊在一起
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang || 'ja-JP';
    u.rate = rate;
    speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking() {
  try { speechSynthesis.cancel(); } catch {}
}

/** 沒有日文語音時，告訴使用者怎麼裝——不同系統位置不一樣 */
export function missingVoiceHelp() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) {
    return '你的裝置還沒有日文語音。到「設定 → 輔助使用 → 朗讀內容 → 聲音 → 日文」下載一個，回來重新整理即可。';
  }
  if (/Macintosh/.test(ua)) {
    return '你的電腦還沒有日文語音。到「系統設定 → 輔助使用 → 朗讀內容 → 系統聲音 → 管理聲音」加入日文（例如 Kyoko），回來重新整理即可。';
  }
  if (/Android/.test(ua)) {
    return '你的裝置還沒有日文語音。到「設定 → 系統 → 語言與輸入 → 文字轉語音輸出」安裝日文語音包，回來重新整理即可。';
  }
  return '這個瀏覽器找不到日文語音。換用 Safari 或 Chrome，或在系統設定裡安裝日文語音後重新整理。';
}

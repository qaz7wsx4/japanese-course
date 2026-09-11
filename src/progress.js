// 學習進度。存在瀏覽器的 localStorage，換裝置不會同步——這是刻意的取捨，
// 現階段不值得為了同步去架帳號系統。

const KEY = 'jp-course-progress-v1';

/** 及格門檻。沒到這個分數不算通過，下一課也不會解鎖——
    否則亂按也能一路解鎖，關卡就失去意義了。 */
export const PASS_SCORE = 70;

function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY)) || {};
    return { lessons: {}, vocab: {}, srs: {}, ...s };
  } catch {
    return { lessons: {}, vocab: {}, srs: {} };
  }
}

function write(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 無痕視窗或封鎖儲存時會失敗，讓學習流程照常進行，只是不留紀錄。
  }
}

export function getLessonState(id) {
  return read().lessons[id] || { done: false, best: 0, attempts: 0 };
}

export function recordAttempt(id, scorePct) {
  const s = read();
  const prev = s.lessons[id] || { done: false, best: 0, attempts: 0 };
  s.lessons[id] = {
    done: prev.done || scorePct >= PASS_SCORE,
    best: Math.max(prev.best, scorePct),
    attempts: prev.attempts + 1,
  };
  write(s);
}

export function recordAnswer(vocabId, correct) {
  if (!vocabId) return;
  const s = read();
  const v = s.vocab[vocabId] || { seen: 0, correct: 0 };
  v.seen += 1;
  if (correct) v.correct += 1;
  s.vocab[vocabId] = v;
  s.srs[vocabId] = schedule(s.srs[vocabId], correct);
  write(s);
}

// ── 間隔複習 ──────────────────────────────────────────────
// 每個單字放在 0～5 其中一格，答對往上一格、答錯掉回第 0 格。
// 格子越高，下次出現的間隔越長。這是 Leitner 盒的作法，比完整的 SM-2 簡單，
// 但對幾百個單字的規模已經夠用，而且行為好預測、好解釋。
const INTERVALS_DAYS = [0, 1, 3, 7, 14, 30];

/** 本地日期 YYYY-MM-DD。不用 toISOString，那是 UTC，台灣晚上會跳到隔天。 */
function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return localDate(d);
}

function schedule(entry, correct) {
  const box = correct ? Math.min((entry?.box ?? 0) + 1, INTERVALS_DAYS.length - 1) : 0;
  return { box, due: addDays(localDate(), INTERVALS_DAYS[box]) };
}

/** 通過一課時，把該課所有單字納入複習（練習裡沒抽到的也要進來），明天開始 */
export function enrollVocab(vocabIds) {
  const s = read();
  for (const id of vocabIds) {
    if (!s.srs[id]) s.srs[id] = { box: 1, due: addDays(localDate(), 1) };
  }
  write(s);
}

/** 今天（含逾期）要複習的單字 id */
export function getDueVocabIds() {
  const s = read();
  const today = localDate();
  return Object.entries(s.srs)
    .filter(([, e]) => e.due <= today)
    .sort((a, b) => a[1].box - b[1].box)    // 越不熟的排前面
    .map(([id]) => id);
}

/** 複習總覽：已納入幾個、今天幾個、下一次是哪天 */
export function getReviewSummary() {
  const s = read();
  const today = localDate();
  const entries = Object.values(s.srs);
  const future = entries.map((e) => e.due).filter((d) => d > today).sort();
  return {
    enrolled: entries.length,
    due: entries.filter((e) => e.due <= today).length,
    nextDue: future[0] || null,
    mastered: entries.filter((e) => e.box >= 4).length,   // 14 天以上才回來的算熟了
  };
}

/** 這一課是否已解鎖：第 1 課永遠開著，其餘要前一課完成 */
export function isUnlocked(lessonId) {
  if (lessonId === 1) return true;
  return getLessonState(lessonId - 1).done;
}

export function resetAll() {
  try { localStorage.removeItem(KEY); } catch {}
}

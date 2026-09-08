// 學習進度。存在瀏覽器的 localStorage，換裝置不會同步——這是刻意的取捨，
// 現階段不值得為了同步去架帳號系統。

const KEY = 'jp-course-progress-v1';

/** 及格門檻。沒到這個分數不算通過，下一課也不會解鎖——
    否則亂按也能一路解鎖，關卡就失去意義了。 */
export const PASS_SCORE = 70;

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { lessons: {}, vocab: {} };
  } catch {
    return { lessons: {}, vocab: {} };
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
  write(s);
}

/** 這一課是否已解鎖：第 1 課永遠開著，其餘要前一課完成 */
export function isUnlocked(lessonId) {
  if (lessonId === 1) return true;
  return getLessonState(lessonId - 1).done;
}

export function resetAll() {
  try { localStorage.removeItem(KEY); } catch {}
}

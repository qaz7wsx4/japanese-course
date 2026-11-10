// 載入課程資料，並建立查詢用的索引。

let data = null;
let vocabById = null;

export async function loadCurriculum() {
  if (data) return data;
  const res = await fetch('curriculum/lessons.json?v=DEV');
  if (!res.ok) throw new Error('課程資料載入失敗');
  data = await res.json();
  vocabById = new Map();
  for (const lesson of data.lessons) {
    for (const v of lesson.vocab) vocabById.set(v.id, { ...v, lesson: lesson.id });
  }
  return data;
}

/**
 * 把主題單字包的字加進單字索引。
 * 複習與 SRS 都靠 getVocab 查字，包裡的字不進索引就會在複習時變成空白題。
 * 課程單字優先：同一個 id 不覆蓋。
 */
export function registerExtraVocab(words) {
  for (const w of words) if (!vocabById.has(w.id)) vocabById.set(w.id, { ...w });
}

export const getLessons = () => data.lessons;
export const getLesson = (id) => data.lessons.find((l) => l.id === Number(id));
export const getVocab = (id) => vocabById.get(id);

/** 某一課（含）之前所有課的單字，用來出干擾選項與複習題 */
export function vocabUpTo(lessonId) {
  const out = [];
  for (const l of data.lessons) {
    if (l.id > lessonId) break;
    out.push(...l.vocab.map((v) => ({ ...v, lesson: l.id })));
  }
  return out;
}

/** 單字的日文書寫形：有漢字就用漢字（kuromoji 會自動標假名），否則用假名 */
export const wordForm = (v) => v.kanji || v.kana;

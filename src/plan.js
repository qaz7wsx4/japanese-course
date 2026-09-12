// 學習計畫與進度比對。
// 計畫是固定的階段序列，各階段有「相對份量」；把它按比例攤在
// 「設定目標那天 → 考試日」這段時間上，就能算出今天該走到哪。
// 這樣不管離考試是 12 週還是 42 週，同一份計畫都能用。

export const PHASES = [
  { id: 1, name: '入門',       lessons: [1, 10],  weight: 7,  note: '名詞句、動詞ます形、形容詞、數字、時間' },
  { id: 2, name: '動詞變化',   lessons: [11, 16], weight: 13, note: 'て形、ない形、辞書形、た形——N5 的核心，走慢一點' },
  { id: 3, name: '句型擴充',   lessons: [17, 25], weight: 8,  note: '數量詞、比較、授受、普通形、修飾句' },
  { id: 4, name: '單字與聽力', lessons: null,     weight: 9,  note: '主題單字包、每天聽力 10 分鐘' },
  { id: 5, name: '模擬考',     lessons: null,     weight: 4,  note: '官方樣題、回頭補弱點' },
];

const TOTAL_WEIGHT = PHASES.reduce((a, p) => a + p.weight, 0);
export const TOTAL_LESSONS = 25;

const DAY = 86400000;

/** 本地日期 YYYY-MM-DD */
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const parse = (s) => new Date(s + 'T00:00:00');

/** JLPT 固定在 7 月與 12 月的第一個星期日。回傳今天之後最近的兩場。 */
export function upcomingExamDates(today = new Date()) {
  const firstSunday = (y, m) => {
    const d = new Date(y, m, 1);
    d.setDate(1 + ((7 - d.getDay()) % 7));
    return d;
  };
  const out = [];
  for (let y = today.getFullYear(); out.length < 2; y++) {
    for (const m of [6, 11]) {
      const d = firstSunday(y, m);
      // 離考試不到 4 週就不列，來不及了
      if (d - today > 28 * DAY) out.push(localDate(d));
      if (out.length === 2) break;
    }
  }
  return out;
}

/** 「已完成 n 課」對應到計畫上的位置（份量單位） */
function positionOfLessons(n) {
  let pos = 0;
  for (const p of PHASES) {
    if (!p.lessons) break;
    const [a, b] = p.lessons;
    const count = b - a + 1;
    const doneHere = Math.max(0, Math.min(n, b) - a + 1);
    pos += (doneHere / count) * p.weight;
    if (n < b) break;
  }
  return pos;
}

/** 位置（份量單位）對應到的階段與課號 */
function describePosition(pos) {
  let acc = 0;
  for (const p of PHASES) {
    if (pos < acc + p.weight || p === PHASES[PHASES.length - 1]) {
      const inPhase = (pos - acc) / p.weight;           // 0..1
      let lesson = null;
      if (p.lessons) {
        const [a, b] = p.lessons;
        lesson = Math.min(b, a + Math.floor(inPhase * (b - a + 1)));
      }
      return { phase: p, lesson };
    }
    acc += p.weight;
  }
  return { phase: PHASES[PHASES.length - 1], lesson: null };
}

/**
 * @param {{examDate:string, startDate:string}} plan
 * @param {number} lessonsDone 已完成的課數
 * @returns 進度摘要；plan 為空回傳 null
 */
export function computePace(plan, lessonsDone, today = new Date()) {
  if (!plan?.examDate) return null;
  const start = parse(plan.startDate);
  const exam = parse(plan.examDate);
  const now = parse(localDate(today));

  const totalDays = Math.max(1, (exam - start) / DAY);
  const elapsed = Math.min(totalDays, Math.max(0, (now - start) / DAY));
  const daysLeft = Math.max(0, Math.round((exam - now) / DAY));

  const expectedPos = (elapsed / totalDays) * TOTAL_WEIGHT;
  const allDone = lessonsDone >= TOTAL_LESSONS;
  // 課全部上完之後，第 4、5 階段（單字包、模擬考）沒有「課」可以計算進度，
  // 只能視為跟上計畫，不然會出現「全部完成卻落後 11 週」這種鬼話。
  const actualPos = allDone ? Math.max(positionOfLessons(lessonsDone), expectedPos)
                            : positionOfLessons(lessonsDone);
  const daysPerUnit = totalDays / TOTAL_WEIGHT;
  const deltaDays = (actualPos - expectedPos) * daysPerUnit;   // 正 = 超前

  const expected = describePosition(expectedPos);
  const current = describePosition(actualPos);

  return {
    daysLeft,
    weeksLeft: Math.round(daysLeft / 7),
    deltaWeeks: Math.round(deltaDays / 7),
    expectedLesson: expected.lesson,
    expectedPhase: expected.phase,
    currentPhase: current.phase,
    percent: Math.round((actualPos / TOTAL_WEIGHT) * 100),
    tooLate: daysLeft === 0,
    allDone,
  };
}

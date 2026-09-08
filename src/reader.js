import { loadTokenizer, analyze } from './tokenizer.js?v=DEV';
import { renderLines, renderLegend } from './render.js?v=DEV';

const $ = (id) => document.getElementById(id);

const el = {
  loading: $('loading'), loadingTitle: $('loadingTitle'), loadingNote: $('loadingNote'),
  barFill: $('barFill'), input: $('input'), analyzeBtn: $('analyzeBtn'),
  sampleBtn: $('sampleBtn'), clearBtn: $('clearBtn'), output: $('output'),
  legend: $('legend'), kanaToggle: $('kanaToggle'), kanaToggleWrap: $('kanaToggleWrap'),
};

const SAMPLE = [
  '今日は友達と一緒に新しい喫茶店へ行きました。',
  'そこのコーヒーはとても美味しかったです。',
  '来年は日本語の試験を受けるつもりです。',
].join('\n');

let tokenizer = null;

// ── 字典載入 ──────────────────────────────────────────────
const mb = (n) => (n / 1048576).toFixed(1);

loadTokenizer((loaded, total) => {
  el.barFill.style.width = `${(loaded / total) * 100}%`;
  el.loadingTitle.textContent = `正在載入日文字典… ${mb(loaded)} / ${mb(total)} MB`;
})
  .then((tk) => {
    tokenizer = tk;
    el.loading.hidden = true;
    el.analyzeBtn.disabled = false;
    el.kanaToggleWrap.hidden = false;
    renderLegend(el.legend);
    el.legend.hidden = false;
    if (el.input.value.trim()) run();     // 載入期間就貼好文章的話，直接跑
  })
  .catch((err) => {
    el.barFill.parentElement.hidden = true;
    el.loadingTitle.textContent = '字典載入失敗';
    el.loadingNote.textContent =
      '請確認是透過本機伺服器開啟（不能直接用 file:// 開檔），並重新整理頁面。';
    el.loading.classList.add('error');
    console.error(err);
  });

// ── 操作 ──────────────────────────────────────────────────
function run() {
  const text = el.input.value;
  if (!tokenizer || !text.trim()) {
    el.output.replaceChildren();
    return;
  }
  renderLines(el.output, analyze(tokenizer, text));
}

el.analyzeBtn.addEventListener('click', run);

el.sampleBtn.addEventListener('click', () => {
  el.input.value = SAMPLE;
  run();
});

el.clearBtn.addEventListener('click', () => {
  el.input.value = '';
  el.output.replaceChildren();
  el.input.focus();
});

// 假名開關只切 CSS，不重新解析。
el.kanaToggle.addEventListener('change', () => {
  document.body.classList.toggle('hide-kana', !el.kanaToggle.checked);
});

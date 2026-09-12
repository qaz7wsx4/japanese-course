// tokens → DOM。用 DOM API 建節點而非字串拼接，避免原文裡的 < & 造成問題。

import { POS_CATEGORIES } from './pos.js?v=DEV';

export function renderLines(container, lines) {
  container.replaceChildren();

  lines.forEach((tokens, lineIndex) => {
    if (tokens.length === 0) {
      container.appendChild(document.createElement('br'));
      return;
    }
    const p = document.createElement('p');
    p.className = 'line';
    tokens.forEach((tok, i) => p.appendChild(renderToken(tok, `${lineIndex}-${i}`)));
    container.appendChild(p);
  });
}

export function renderToken(tok, id = '') {
  const span = document.createElement('span');
  span.className = `tok pos-${tok.pos}`;
  span.dataset.id = id;              // P2 的詞卡會用這個對應回 token
  span.title = tok.posLabel || '';

  for (const seg of tok.ruby) {
    if (seg.rt) {
      const ruby = document.createElement('ruby');
      ruby.append(seg.base);
      const rt = document.createElement('rt');
      rt.textContent = seg.rt;
      ruby.appendChild(rt);
      span.appendChild(ruby);
    } else {
      span.append(seg.base);
    }
  }
  return span;
}

export function renderLegend(container) {
  container.replaceChildren();
  for (const c of POS_CATEGORIES) {
    const item = document.createElement('span');
    item.className = `legend-item pos-${c.id}`;
    item.textContent = c.label;
    container.appendChild(item);
  }
}

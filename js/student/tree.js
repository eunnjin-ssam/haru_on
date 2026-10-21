// 내 씨앗 나무 카드: 누적 포인트로 단계(settings.tree)와 다음 단계까지 진행 바. 상점·대시보드에서 함께 쓴다.
import { h } from '../common/ui.js';

export function treeCard(total, settings) {
  const currency = settings.names.currency;
  const stages = settings.tree ?? [];
  let cur = stages[0] ?? { name: '새싹', min: 0 };
  let next = null;
  for (let i = 0; i < stages.length; i++) {
    if (total >= stages[i].min) { cur = stages[i]; next = stages[i + 1] ?? null; }
  }
  const pct = next ? Math.min(100, ((total - cur.min) / (next.min - cur.min)) * 100) : 100;
  return h('section', { class: 'card tree' },
    h('div', { class: 'tree-emoji' }, '🌱'),
    h('div', { class: 'tree-info' },
      h('div', { class: 'tree-name' }, `내 씨앗 나무 · ${cur.name}`),
      h('div', { class: 'muted' }, `누적 ${total} ${currency}`),
      h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${pct}%` })),
      next ? h('div', { class: 'muted small' }, `다음 '${next.name}'까지 ${next.min - total} ${currency}`) : h('div', { class: 'muted small' }, '가장 큰 나무예요! 🌳'),
    ),
  );
}

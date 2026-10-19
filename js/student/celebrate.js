// 공동 목표를 달성한 순간 보여 주는 축하 화면. 눌러서 닫는다.
import { h } from '../common/ui.js';

const BITS = ['🎉', '🎊', '⭐', '💚', '✨', '🎈'];

export function celebrateGoal(goal) {
  const confetti = Array.from({ length: 24 }, (_, i) => h('span', {
    class: 'cele-bit',
    style: `left:${Math.random() * 100}%;animation-delay:${(Math.random() * 0.8).toFixed(2)}s;font-size:${18 + Math.random() * 18}px`,
  }, BITS[i % BITS.length]));
  const dlg = h('div', { class: 'cele', role: 'dialog' },
    ...confetti,
    h('div', { class: 'cele-box' },
      h('div', { class: 'cele-big' }, '🎉'),
      h('h2', null, '우리반 공동 목표 달성!'),
      h('p', { class: 'cele-title' }, goal.title),
      goal.reward ? h('p', null, `🎁 보상: ${goal.reward}`) : null,
      h('p', { class: 'muted small' }, '마지막 포인트를 보태 줘서 고마워요!'),
      h('button', { class: 'btn', onclick: () => dlg.remove() }, '좋아요!')));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.remove(); });
  document.body.append(dlg);
}

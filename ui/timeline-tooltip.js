// timeline-tooltip.js
//
// Shared prose tooltip (ported from emigration's makeTooltip). Positioned
// relative to the given wrap element; pointer-events:none so it never eats hover.

import { el } from "/history-and-rankings/ui/timeline-dom.js";

export function makeTooltip(wrap) {
  const tip = el("div", "htimeline-tip");
  tip.style.display = "none";
  wrap.appendChild(tip);
  return {
    setHTML: (h) => { tip.innerHTML = h; },
    show: () => { tip.style.display = "block"; },
    hide: () => { tip.style.display = "none"; },
    move: (ev) => {
      const r = wrap.getBoundingClientRect();
      tip.style.left = (ev.clientX - r.left) + "px";
      tip.style.top = (ev.clientY - r.top) + "px";
    }
  };
}

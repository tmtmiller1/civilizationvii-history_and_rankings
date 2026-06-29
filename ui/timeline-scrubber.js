// timeline-scrubber.js
//
// One shared timeline control: a range input + play/pause + speed chips that
// broadcast a "current turn" to subscribers (ribbon playhead, map frame,
// chronicle highlight) so scrubbing all three stays coherent.

import { el } from "/history-and-rankings/ui/timeline-dom.js";
import { loc } from "/history-and-rankings/ui/timeline-i18n.js";

const SPEEDS = [["0.5\u00d7", 0.5], ["1\u00d7", 1], ["2\u00d7", 2], ["4\u00d7", 4]];
const PLAY_INTERVAL = 42;

function nearest(turns, t) {
  let best = 0, bd = Infinity;
  turns.forEach((v, i) => { const d = Math.abs(v - t); if (d < bd) { bd = d; best = i; } });
  return best;
}

function speedChips(pb) {
  const row = el("div", "htimeline-speeds");
  SPEEDS.forEach(([label, mul]) => {
    const chip = el("button", "htimeline-speed", label);
    if (mul === pb.speedMul) chip.classList.add("on");
    chip.addEventListener("click", () => {
      pb.speedMul = mul;
      row.querySelectorAll(".htimeline-speed").forEach((c) => c.classList.remove("on"));
      chip.classList.add("on");
    });
    row.appendChild(chip);
  });
  return row;
}

function buildControls(turns, pb) {
  const root = el("div", "htimeline-time");
  const btn = el("button", "htimeline-play", "\u25b6");
  const input = document.createElement("input");
  input.type = "range"; input.min = "0"; input.max = String(turns.length - 1); input.value = String(pb.idx);
  input.className = "htimeline-range";
  const lbl = el("div", "htimeline-time-lbl");
  return { root, btn, input, lbl };
}

function startLoop(pb, turns, goTo, setPlaying) {
  let tick = 0;
  const loop = () => {
    if (pb.playing) {
      tick += pb.speedMul;
      if (tick >= PLAY_INTERVAL) {
        tick = 0;
        if (pb.idx < turns.length - 1) goTo(pb.idx + 1); else setPlaying(false);
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export function makeScrubber(turns, onSet) {
  if (!turns.length) turns = [0];
  const pb = { playing: false, idx: turns.length - 1, speedMul: 1 };
  const { root, btn, input, lbl } = buildControls(turns, pb);
  const subs = onSet ? [onSet] : [];
  const setLabel = (i) => { lbl.textContent = loc("LOC_HTIMELINE_TURN_N", "Turn {1_T}", turns[i]); };
  const goTo = (i) => {
    pb.idx = i; input.value = String(i); setLabel(i);
    for (const s of subs) try { s(turns[i], i); } catch (_) { /* */ }
  };
  const setPlaying = (p) => { pb.playing = p; btn.textContent = p ? "\u23f8" : "\u25b6"; };
  btn.addEventListener("click", () => {
    if (!pb.playing && pb.idx >= turns.length - 1) goTo(0);
    setPlaying(!pb.playing);
  });
  input.addEventListener("input", () => { setPlaying(false); goTo(parseInt(input.value, 10)); });
  startLoop(pb, turns, goTo, setPlaying);
  root.appendChild(btn); root.appendChild(input); root.appendChild(lbl); root.appendChild(speedChips(pb));
  setLabel(pb.idx);
  return {
    root, subscribe: (fn) => subs.push(fn),
    goToTurn: (t) => goTo(nearest(turns, t)), current: () => turns[pb.idx]
  };
}

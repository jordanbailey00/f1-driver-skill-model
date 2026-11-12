import { el } from "./dom.js";

let tip = null;
let lastEvt = null;

export function initTooltip() {
  tip = document.getElementById("tip");
  window.addEventListener("scroll", hideTip, { passive: true });
  window.addEventListener("blur", hideTip);
}

// rows: [{ v: "value", k: "label", key: "css color" }]; hint: small line at the bottom
export function showTip(evt, title, rows = [], opts = {}) {
  if (!tip) return;
  tip.replaceChildren();
  if (title) tip.append(el("div", { class: "t-title", text: title }));
  if (opts.sub) tip.append(el("div", { class: "t-sub", text: opts.sub }));
  for (const r of rows) {
    const row = el("div", { class: "t-row" });
    if (r.key) row.append(el("i", { class: "t-key", style: { background: r.key } }));
    row.append(el("b", { text: r.v }), el("span", { text: r.k || "" }));
    tip.append(row);
  }
  if (opts.hint) tip.append(el("div", { class: "t-hint", text: opts.hint }));
  tip.hidden = false;
  moveTip(evt);
}

export function moveTip(evt) {
  if (!tip || tip.hidden) return;
  lastEvt = evt || lastEvt;
  if (!lastEvt) return;
  const touch = lastEvt.pointerType === "touch";
  const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
  let x = lastEvt.clientX + pad, y = touch ? lastEvt.clientY - h - 28 : lastEvt.clientY + pad;
  if (x + w > window.innerWidth - 8) x = lastEvt.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = lastEvt.clientY - h - pad;
  if (y < 8) y = lastEvt.clientY + 24;
  tip.style.transform = `translate(${Math.max(8, Math.round(x))}px, ${Math.max(8, Math.round(y))}px)`;
}

export function hideTip() {
  if (tip) tip.hidden = true;
}

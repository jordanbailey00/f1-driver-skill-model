import * as d3 from "d3";
import { navigate } from "./router.js";

// Redraw `fn(width)` whenever the host's width changes (coalesced to one frame).
export function observeWidth(host, fn) {
  let last = -1, raf = 0;
  const run = () => {
    const w = Math.floor(host.clientWidth);
    if (w > 0 && w !== last) { last = w; fn(w); }
  };
  const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(run); });
  ro.observe(host);
  run();
  return {
    redraw: () => { last = -1; run(); },
    stop: () => { ro.disconnect(); cancelAnimationFrame(raf); },
  };
}

export function makeSvg(host, w, h, label) {
  host.replaceChildren();
  return d3.select(host).append("svg")
    .attr("width", w).attr("height", h).attr("viewBox", `0 0 ${w} ${h}`)
    .attr("role", "img").attr("aria-label", label);
}

export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function hGrid(svg, y, ticks, x0, x1) {
  svg.append("g").attr("class", "grid").selectAll("line").data(ticks).join("line")
    .attr("x1", x0).attr("x2", x1).attr("y1", (v) => y(v)).attr("y2", (v) => y(v));
}
export function vGrid(svg, x, ticks, y0, y1) {
  svg.append("g").attr("class", "grid").selectAll("line").data(ticks).join("line")
    .attr("x1", (v) => x(v)).attr("x2", (v) => x(v)).attr("y1", y0).attr("y2", y1);
}
export function leftAxis(svg, y, ticks, fmt, x) {
  svg.append("g").attr("transform", `translate(${x},0)`)
    .call(d3.axisLeft(y).tickValues(ticks).tickSize(0).tickPadding(8).tickFormat(fmt))
    .call((g) => g.select(".domain").remove());
}
export function bottomAxis(svg, x, ticks, fmt, y) {
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${y})`)
    .call(d3.axisBottom(x).tickValues(ticks).tickFormat(fmt).tickSizeOuter(0).tickSize(5));
}
// Year ticks that fit the width.
export function yearTicks(x, w, minGap = 52) {
  const [a, b] = x.domain().map(Math.round);
  const n = Math.max(2, Math.floor(w / minGap));
  const steps = [1, 2, 5, 10, 20];
  const step = steps.find((s) => (b - a) / s <= n) || 25;
  const out = [];
  for (let y = Math.ceil(a / step) * step; y <= b; y += step) out.push(y);
  return out;
}

// Clickable marks: mouse click goes straight there; on touch the first tap shows the
// tooltip and the second tap on the same mark follows the link.
let armed = null;
let lastPointer = "mouse";
window.addEventListener("pointerdown", (e) => { lastPointer = e.pointerType || "mouse"; }, { capture: true, passive: true });
export const isTouch = () => lastPointer === "touch";
export function tapToGo(evt, key, href, showFn) {
  if (lastPointer === "touch" && armed !== key) {
    armed = key;
    showFn?.();
    return;
  }
  armed = null;
  navigate(href);
}
export function disarm() { armed = null; }

// Diverging blue (faster) <-> red (slower) colour for a rating, neutral grey at average.
export function ratingColor(domain = 0.8) {
  const neg = cssVar("--div-neg"), mid = cssVar("--div-mid"), pos = cssVar("--div-pos");
  const left = d3.interpolateLab(neg, mid), right = d3.interpolateLab(mid, pos);
  const f = (v) => {
    const t = Math.max(-1, Math.min(1, v / domain));
    return t < 0 ? left(1 + t) : right(t);
  };
  f.stops = (n = 9) => d3.range(n).map((i) => f(-domain + (2 * domain * i) / (n - 1)));
  return f;
}

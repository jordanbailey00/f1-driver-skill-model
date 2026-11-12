// Tiny DOM builder: el("a", { href: "/x", class: "y", onclick: fn }, child, "text", ...)
export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  append(e, kids);
  return e;
}
function append(e, kids) {
  for (const kid of kids) {
    if (kid == null || kid === false) continue;
    if (Array.isArray(kid)) append(e, kid);
    else e.append(kid);
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";
const ICONS = {
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4.4h4.4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
};
export function icon(name, cls = "ico") {
  const s = document.createElementNS(SVG_NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", cls);
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = ICONS[name] || "";
  return s;
}

export function nextLink(href, kicker, title, desc) {
  return el("a", { class: "next", href },
    el("div", {},
      el("div", { class: "next-k", text: kicker }),
      el("div", { class: "next-t", text: title }),
      desc ? el("div", { class: "next-d", text: desc }) : null),
    icon("arrowRight", "ico next-arrow"));
}

export function setTitle(t) {
  document.title = t ? t + " · Equal Machinery" : "Equal Machinery · F1 drivers rated in the same car";
}

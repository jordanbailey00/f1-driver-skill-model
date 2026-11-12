const root = document.documentElement;
const mq = window.matchMedia("(prefers-color-scheme: dark)");

export const effectiveTheme = () => root.dataset.theme || (mq.matches ? "dark" : "light");

function emit() {
  const btn = document.getElementById("theme-btn");
  const next = effectiveTheme() === "dark" ? "light" : "dark";
  if (btn) btn.setAttribute("aria-label", "Switch to " + next + " theme");
  document.dispatchEvent(new CustomEvent("themechange"));
}

export function initTheme() {
  document.getElementById("theme-btn")?.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("em-theme", next); } catch (e) { /* storage blocked */ }
    emit();
  });
  mq.addEventListener("change", () => { if (!root.dataset.theme) emit(); });
  emit();
}

// Views that bake colours into their charts call this to redraw on a theme switch.
export function onThemeChange(fn) {
  document.addEventListener("themechange", fn);
  return () => document.removeEventListener("themechange", fn);
}

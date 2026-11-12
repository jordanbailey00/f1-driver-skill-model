// Dev-only: renders the link-preview image (Open Graph / X card) to public/og.png, 1200x630,
// from the running dev server so it uses the site's fonts, colours and current data.
//   node tools/share-image.mjs [out.png]      (URL=... for another server)
import { chromium } from "playwright-core";
import os from "node:os";
import path from "node:path";

const exe = process.env.CHROME || path.join(os.homedir(), ".cache/ms-playwright/chromium-1248/chrome-linux64/chrome");
const BASE = (process.env.URL || "http://localhost:5173").replace(/\/$/, "");
const out = process.argv[2] || "public/og.png";

const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: "dark" });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(BASE + "/rankings", { waitUntil: "networkidle" });
await page.waitForSelector("table.rank tbody tr");
await page.evaluate(() => {
  const rows = [...document.querySelectorAll("table.rank tbody tr")].slice(0, 8).map((tr) => ({
    pos: tr.querySelector(".c-pos").textContent,
    code: tr.querySelector(".code").textContent,
    name: tr.querySelector(".nm-full").textContent,
    val: tr.querySelector(".c-num").textContent,
  }));
  const max = parseFloat(rows[0].val);
  document.documentElement.dataset.theme = "dark";
  document.body.style.cssText = "margin:0;width:1200px;height:630px;overflow:hidden;display:block;min-height:0";
  document.body.innerHTML = `
  <div style="position:relative;width:1200px;height:630px;box-sizing:border-box;padding:64px 64px 56px;background:var(--page);color:var(--ink);font-family:var(--font-body);display:grid;grid-template-columns:1.05fr 1fr;gap:56px;align-items:center">
    <div style="position:absolute;inset:0 0 auto 0;height:6px;display:flex"><i style="flex:1;background:var(--accent)"></i><i style="flex:1;background:var(--accent-2)"></i></div>
    <div style="display:grid;gap:22px;align-content:center">
      <div style="font-family:var(--font-mono);font-size:17px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-2)">Formula 1 · every driver since 1990</div>
      <div style="font-family:var(--font-display);font-weight:800;text-transform:uppercase;font-size:112px;line-height:.86">Equal<br><span style="color:var(--accent)">Machinery</span></div>
      <div style="font-size:26px;line-height:1.35;color:var(--ink-2);max-width:30ch">Who's fastest in the same car? Every driver rated only on teammate duels, chained into one scale.</div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:6px;font-size:19px;color:var(--muted)">
        <svg viewBox="0 0 32 32" width="30" height="30"><rect width="32" height="32" rx="8" fill="#f0efec"/><rect x="7" y="10" width="18" height="4.2" rx="2.1" fill="#3987e5"/><rect x="7" y="17.8" width="18" height="4.2" rx="2.1" fill="#eb6834"/></svg>
        f1-equal-machinery.vercel.app
      </div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:22px 24px 18px;display:grid;gap:6px">
      <div style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:14px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-2);padding-bottom:10px;border-bottom:1px solid var(--line);margin-bottom:4px"><span>Top eight, all eras</span><span>vs average</span></div>
      ${rows.map((r) => `
        <div style="display:grid;grid-template-columns:28px 54px 1fr auto;gap:12px;align-items:center;padding:5px 0">
          <span style="font-family:var(--font-mono);color:var(--muted);font-size:17px;text-align:right">${r.pos}</span>
          <span style="font-family:var(--font-mono);font-weight:600;font-size:18px;letter-spacing:.05em">${r.code}</span>
          <span style="display:grid;gap:5px"><span style="font-size:18px;color:var(--ink-2)">${r.name}</span><i style="display:block;height:4px;border-radius:2px;background:var(--accent);width:${Math.max(6, (100 * parseFloat(r.val)) / max)}%"></i></span>
          <span style="font-family:var(--font-mono);font-size:19px;font-weight:600">${r.val}%</span>
        </div>`).join("")}
    </div>
  </div>`;
});
await page.waitForTimeout(300);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log("wrote", out);

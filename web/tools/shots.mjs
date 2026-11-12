// Dev-only visual check: screenshots every page at desktop and phone sizes, light and dark,
// and reports page errors, console errors and horizontal overflow.
//   node tools/shots.mjs <out dir>          (uses the running dev server on :5173)
//   URL=https://... ROUTES=/,/rankings SIZES=mobile THEMES=dark node tools/shots.mjs out
import { chromium } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const exe = process.env.CHROME || path.join(os.homedir(), ".cache/ms-playwright/chromium-1248/chrome-linux64/chrome");
const BASE = (process.env.URL || "http://localhost:5173").replace(/\/$/, "");
const OUT = process.argv[2] || "shots";
const ROUTES = (process.env.ROUTES || "/,/rankings,/driver/max-verstappen,/compare/ayrton-senna/max-verstappen,/timeline,/seasons/2026,/network,/method,/validation").split(",");
const SIZES = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const which = (process.env.SIZES || "desktop,mobile").split(",");
const themes = (process.env.THEMES || "light,dark").split(",");
const maxH = +(process.env.MAX_H || 2600);

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
let problems = 0;
for (const size of which) {
  for (const theme of themes) {
    const mobile = size === "mobile";
    const ctx = await browser.newContext({ viewport: SIZES[size], deviceScaleFactor: 1, colorScheme: theme, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => { problems++; console.log(`[pageerror] ${size}/${theme} ${page.url()}: ${e.message}`); });
    page.on("console", (m) => { if (m.type() === "error") { problems++; console.log(`[console] ${size}/${theme} ${page.url()}: ${m.text()}`); } });
    for (const r of ROUTES) {
      await page.goto(BASE + r, { waitUntil: "networkidle" });
      await page.waitForSelector(".view", { timeout: 20000 });
      await page.waitForTimeout(500);
      const { over, h } = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - window.innerWidth, h: document.documentElement.scrollHeight }));
      if (over > 0) { problems++; console.log(`[overflow] ${size}/${theme} ${r}: ${over}px wider than the viewport`); }
      const name = `${size}-${theme}-${r.replace(/[/?=&]+/g, "_").replace(/^_|_$/g, "") || "home"}.png`;
      await page.screenshot({ path: path.join(OUT, name), fullPage: true, clip: { x: 0, y: 0, width: SIZES[size].width, height: Math.min(h, maxH) } });
    }
    await ctx.close();
  }
}
await browser.close();
console.log(problems ? `${problems} problem(s)` : "no page errors, console errors or overflow");

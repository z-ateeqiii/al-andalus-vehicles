import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const base = process.argv[2];
const paths = process.argv[3].split(',');
const widths = (process.argv[4] ?? '375,1440').split(',').map(Number);
const shotDir = process.argv[5];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
});

for (const path of paths) {
  for (const width of widths) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await page.goto(base + path, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 600));

    const report = await page.evaluate(() => {
      const de = document.documentElement;
      const vw = de.clientWidth;
      const offenders = [];
      // Content inside a deliberate horizontal scroller (the الصور strip, the
      // thumbnail rail) is supposed to sit outside its box — not a defect.
      const insideScroller = (el) => {
        for (let node = el.parentElement; node; node = node.parentElement) {
          const overflowX = getComputedStyle(node).overflowX;
          if (overflowX === 'auto' || overflowX === 'scroll') return true;
        }
        return false;
      };

      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (insideScroller(el)) continue;
        if (r.right > vw + 1 || r.left < -1) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            left: Math.round(r.left),
            right: Math.round(r.right),
            w: Math.round(r.width),
            cls: String(el.getAttribute('class') ?? '').slice(0, 70),
          });
        }
      }
      return {
        vw,
        docScrollW: de.scrollWidth,
        bodyScrollW: document.body.scrollWidth,
        scrollLeft: de.scrollLeft,
        title: document.title,
        offenders: offenders.slice(0, 12),
      };
    });

    const slug = path.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'home';
    const tag = `${slug}-${width}`;
    if (shotDir) {
      await page.screenshot({ path: `${shotDir}/${tag}.png` });
    }

    const overflow = report.docScrollW > report.vw + 1;
    console.log(
      `${path} @${width}  vw=${report.vw} docScrollW=${report.docScrollW} bodyScrollW=${report.bodyScrollW} ${overflow ? 'HORIZONTAL OVERFLOW' : 'ok'}`,
    );
    for (const o of report.offenders) {
      console.log(`    ${o.tag} l=${o.left} r=${o.right} w=${o.w} | ${o.cls}`);
    }
    await page.close();
  }
}

await browser.close();

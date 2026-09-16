/**
 * Lighthouse pass over the public routes, mobile with 4G throttling.
 *
 *   node scripts/dev/lighthouse-run.mjs <baseUrl> <comma,separated,paths> <label> [runs]
 *
 * Each path runs several times and the median is reported: a single
 * Lighthouse run on a laptop moves by 10-20% on its own, which is wide
 * enough to invent an improvement that is not there.
 */
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const baseUrl = process.argv[2];
const paths = (process.argv[3] ?? '/').split(',');
const label = process.argv[4] ?? 'run';
const runs = Number(process.argv[5] ?? 3);

/** Lighthouse's own mobile 4G preset: 1.6 Mbps down, 150ms RTT, 4x CPU. */
const config = {
  extends: 'lighthouse:default',
  settings: {
    formFactor: 'mobile',
    screenEmulation: {
      mobile: true,
      width: 412,
      height: 823,
      deviceScaleFactor: 1.75,
      disabled: false,
    },
    throttlingMethod: 'simulate',
    throttling: {
      rttMs: 150,
      throughputKbps: 1638.4,
      requestLatencyMs: 562.5,
      downloadThroughputKbps: 1638.4,
      uploadThroughputKbps: 675,
      cpuSlowdownMultiplier: 4,
    },
    onlyCategories: ['performance'],
  },
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const chrome = await launch({
  chromePath: CHROME,
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
});

const results = [];

for (const path of paths) {
  const samples = { score: [], lcp: [], tbt: [], fcp: [], si: [], cls: [], script: [], total: [] };

  for (let i = 0; i < runs; i++) {
    const { lhr } = await lighthouse(baseUrl + path, { port: chrome.port, output: 'json' }, config);
    const audits = lhr.audits;

    samples.score.push(Math.round(lhr.categories.performance.score * 100));
    samples.lcp.push(audits['largest-contentful-paint'].numericValue);
    samples.tbt.push(audits['total-blocking-time'].numericValue);
    samples.fcp.push(audits['first-contentful-paint'].numericValue);
    samples.si.push(audits['speed-index'].numericValue);
    samples.cls.push(audits['cumulative-layout-shift'].numericValue);

    const items = audits['network-requests']?.details?.items ?? [];
    samples.total.push(items.reduce((sum, item) => sum + (item.transferSize ?? 0), 0));
    samples.script.push(
      items
        .filter((item) => item.resourceType === 'Script')
        .reduce((sum, item) => sum + (item.transferSize ?? 0), 0),
    );
  }

  results.push({
    path,
    score: median(samples.score),
    lcp: median(samples.lcp),
    tbt: median(samples.tbt),
    fcp: median(samples.fcp),
    si: median(samples.si),
    cls: median(samples.cls),
    script: median(samples.script),
    total: median(samples.total),
  });
}

await chrome.kill();

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} kB`;
const ms = (value) => `${Math.round(value)} ms`;

console.log(`\n=== ${label} — median of ${runs}, mobile 4G ===`);
console.log(
  'path'.padEnd(11) +
    ['perf', 'LCP', 'TBT', 'FCP', 'SpeedIdx', 'CLS', 'JS', 'total']
      .map((h) => h.padStart(10))
      .join(''),
);
for (const r of results) {
  console.log(
    r.path.padEnd(11) +
      [
        String(r.score),
        ms(r.lcp),
        ms(r.tbt),
        ms(r.fcp),
        ms(r.si),
        r.cls.toFixed(3),
        kb(r.script),
        kb(r.total),
      ]
        .map((v) => v.padStart(10))
        .join(''),
  );
}
console.log(`\nJSON ${JSON.stringify({ label, results })}`);

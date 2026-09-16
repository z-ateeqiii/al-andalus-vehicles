import puppeteer from 'puppeteer-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const base = process.argv[2];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('console', (m) => { if (m.type() === 'error') console.log('  console:', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('  pageerror:', String(e).slice(0, 200)));
page.on('requestfailed', (r) => { if (r.url().includes('googleapis')) console.log('  reqfail:', r.url().slice(0, 90), r.failure()?.errorText); });
page.on('response', async (r) => {
  if (r.url().includes('identitytoolkit')) {
    console.log('  auth response:', r.status(), r.url().split('?')[0].split('/').pop());
    if (!r.ok()) { try { console.log('   body:', JSON.stringify(await r.json()).slice(0, 300)); } catch {} }
  }
});
await page.goto(base + '/admin/login', { waitUntil: 'networkidle2' });
await page.type('#email', process.env.ADMIN_EMAIL);
await page.type('#password', process.env.ADMIN_PASS);
await page.click('button[type=submit]');
await new Promise((r) => setTimeout(r, 6000));
console.log('url =', page.url());
const err = await page.evaluate(() => document.querySelector('[role=alert]')?.innerText?.trim() ?? '(no alert)');
console.log('form error:', err);
await browser.close();

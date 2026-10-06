const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

// Use actual page modules with delayed database reads to catch request waterfalls.
const root = path.resolve(__dirname, '..');
async function run() {
  // Normalize fixture line endings before instrumenting on Windows.
  const instrumented = fs.readFileSync(path.join(__dirname, 'fixtures/firebase.js'), 'utf8')
    .replaceAll('\r\n', '\n')
    .replace(/export const getDocument = async \(c, id\) =>\n  \(data\[c\] \|\| \[\]\).find\(\(d\) => d.id === id\) \|\| null;/,
      `export const getDocument = async (c, id) => {
        const read = { c, id, start: performance.now() };
        window.__reads.push(read);
        await new Promise(resolve => setTimeout(resolve, 80));
        read.end = performance.now();
        return (data[c] || []).find(d => d.id === id) || null;
      };`);
  assert.match(instrumented, /window.__reads.push/);
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(root + path.sep)) return response.writeHead(403).end();
    fs.readFile(target, (error, body) => {
      response.writeHead(error ? 404 : 200, { 'Content-Type': {
        '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css'
      }[path.extname(target)] || 'application/octet-stream' });
      response.end(error ? 'Not found' : body);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    browser = await chromium.launch({ headless: true,
      executablePath: process.env.CHROMIUM_PATH || (fs.existsSync(edge) ? edge : undefined) });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__signedIn = true;
      window.__writes = [];
      window.__reads = [];
    });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/js/firebase.js') return route.fulfill({
        contentType: 'application/javascript', body: instrumented
      });
      return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.locator('#card-next-race').waitFor();
    const report = await page.evaluate(async () => {
      const db = await import('/js/firebase.js');
      const { DRIVERS_2026 } = await import('/js/seed.js');
      const { renderResults } = await import('/js/results.js');
      const { renderPredictionBuilder } = await import('/js/predictions.js');
      const order = DRIVERS_2026.map(d => d.id);
      await db.setDocument('results', 'r2_quali', { raceId: 'r2', session: 'quali', order, calculatedAt: 1 });
      for (const userId of ['u1', 'u2', 'u3', 'u4']) {
        await db.setDocument('predictions', `${userId}_r2_quali`, { userId, raceId: 'r2', session: 'quali', order, lockedAt: 1 });
      }
      window.__reads = [];
      await renderResults('r2', 'quali');
      const results = [...window.__reads];
      const resultText = document.querySelector('#results-page').textContent;
      window.__reads = [];
      await renderPredictionBuilder('r2', 'quali');
      const builder = [...window.__reads];
      const readOnly = !document.querySelector('#predict-page .order-slot.draggable');
      window.__isAdmin = true;
      window.__reads = [];
      await renderPredictionBuilder('r2', 'quali', true, true);
      const admin = [...window.__reads];
      const editable = !!document.querySelector('#results-page .order-slot.draggable');
      return { results, builder, admin, resultText, readOnly, editable };
    });
    const overlap = reads => {
      assert.ok(reads.length > 1);
      assert.ok(Math.max(...reads.map(r => r.start)) < Math.min(...reads.map(r => r.end)), 'Independent reads must overlap');
    };
    overlap(report.results.filter(r => r.c === 'scores'));
    assert.equal(report.results.filter(r => r.c === 'results').length, 1);
    assert.match(report.resultText, /4 players scored/);
    const builderScores = report.builder.filter(r => r.c === 'scores');
    assert.equal(builderScores.length, new Set(builderScores.map(r => r.id)).size);
    overlap(builderScores.filter(r => r.id !== 'u1_r2_quali'));
    const adminResults = report.admin.filter(r => r.c === 'results');
    overlap(adminResults);
    assert.equal(adminResults.length, new Set(adminResults.map(r => r.id)).size);
    assert.equal(report.readOnly, true);
    assert.equal(report.editable, true);
    assert.deepEqual(errors, []);
    console.log('PASS: concurrent reads, no duplicate session reads, score fallback, locked predictions and admin editing');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });


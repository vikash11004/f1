const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures/firebase.js'),
  'utf8',
);

async function run() {
  const root = path.resolve(__dirname, '..');
  const contentTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
  };

  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const target = path.resolve(
      root,
      '.' + (pathname === '/' ? '/index.html' : pathname),
    );
    if (!target.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(target, (error, body) => {
      response.writeHead(error ? 404 : 200, {
        'Content-Type':
          contentTypes[path.extname(target)] || 'application/octet-stream',
      });
      response.end(error ? 'Not found' : body);
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;

  let browser;
  try {
    const executablePath =
      process.env.CHROMIUM_PATH ||
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

    browser = await chromium.launch({
      executablePath: fs.existsSync(executablePath) ? executablePath : undefined,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
    });

    await context.addInitScript(() => {
      window.__signedIn = true;
      window.__isAdmin = true;
      window.__writes = [];
    });

    await context.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === '/js/firebase.js') {
        return route.fulfill({
          contentType: 'application/javascript',
          body: fixture,
        });
      }
      if (u.hostname !== '127.0.0.1' && !u.hostname.includes('jsdelivr.net')) {
        return route.abort();
      }
      return route.continue();
    });

    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    console.log('Navigating to dashboard as Admin...');
    await page.goto(baseURL, { waitUntil: 'networkidle' });

    // 1. Verify Dashboard Admin Export Button
    await page.locator('#cta-manage').waitFor();
    const dashboardExportBtn = page.locator('#btn-dashboard-export');
    assert.equal(await dashboardExportBtn.isVisible(), true, 'Admin should see Export Session button on dashboard');

    // 2. Navigate to Race Calendar
    console.log('Navigating to Race Calendar...');
    await page.locator('[data-page=races]').click();
    await page.locator('.race-calendar-row').first().waitFor();

    const calendarExportBtn = page.locator('#btn-admin-export-calendar');
    assert.equal(await calendarExportBtn.isVisible(), true, 'Admin should see Export Session Excel in calendar toolbar');

    const fabExportBtn = page.locator('#btn-fab-export-session');
    assert.equal(await fabExportBtn.isVisible(), true, 'Admin should see Export Session in FAB area');

    // 3. Test opening Admin Export Modal from toolbar
    console.log('Testing Admin Export Modal...');
    await calendarExportBtn.click();
    await page.locator('#export-modal-overlay').waitFor();
    assert.equal(await page.locator('#export-race-select').isVisible(), true, 'Race select should be visible');
    assert.equal(await page.locator('#export-session-select').isVisible(), true, 'Session select should be visible');
    assert.equal(await page.locator('#export-session-preview').isVisible(), true, 'Live session preview should be visible');
    assert.equal(await page.locator('#export-modal-download').isVisible(), true, 'Download button should be visible');

    // Change race selection and check session updates
    await page.locator('#export-race-select').selectOption({ index: 1 }); // Chinese GP (Sprint)
    await page.waitForTimeout(300);
    const sessionCount = await page.locator('#export-session-select option').count();
    assert.equal(sessionCount, 4, 'Sprint race should display 4 sessions in dropdown');

    // Close modal
    await page.locator('#export-modal-cancel').click();
    await page.locator('#export-modal-overlay').waitFor({ state: 'detached' });

    // 4. Test Race Side Panel Session Export Buttons
    console.log('Testing Race Details Side Panel session exports...');
    await page.locator('.race-calendar-row').first().click();
    await page.locator('.side-panel.open').waitFor();

    const sessionExportButtons = page.locator('.btn-session-export-excel');
    const sessionBtnCount = await sessionExportButtons.count();
    assert.ok(sessionBtnCount >= 2, 'Each session should have an Excel export button in panel');

    const panelExportAction = page.locator('#btn-panel-export-excel');
    assert.equal(await panelExportAction.isVisible(), true, 'Panel actions should contain Export Session button');

    // Close panel
    await page.locator('#close-panel').click();

    // 5. Navigate to Results / Predict mode as admin
    console.log('Testing Results View header export button...');
    await page.evaluate(() => { location.hash = '#results/r1/race'; });
    await page.locator('#btn-admin-export-session-xlsx').waitFor();
    assert.equal(await page.locator('#btn-admin-export-session-xlsx').isVisible(), true, 'Results header should contain Export Excel button for admin');

    // 6. Test Excel Export execution in page context
    console.log('Testing exportSessionToExcel execution in browser...');
    const exportResult = await page.evaluate(async () => {
      // Mock XLSX.writeFile to capture export without native OS dialog block
      let exportedFile = null;
      let sheetNames = [];
      const origWrite = window.XLSX.writeFile;
      window.XLSX.writeFile = (wb, filename) => {
        exportedFile = filename;
        sheetNames = wb.SheetNames;
      };

      const { setDocument } = await import('./js/firebase.js');
      await setDocument('results', 'r1_race', {
        id: 'r1_race',
        raceId: 'r1',
        session: 'race',
        order: ['nor', 'pia', 'rus', 'ant', 'ver', 'had', 'lec', 'ham', 'alb', 'sai', 'lin', 'law', 'str', 'alo', 'oco', 'bea', 'hul', 'bor', 'gas', 'col', 'per', 'bot'],
        calculatedAt: Date.now()
      });
      await setDocument('predictions', 'pred_u1_r1_race', {
        id: 'pred_u1_r1_race',
        raceId: 'r1',
        session: 'race',
        userId: 'u1',
        order: ['nor', 'pia', 'ver', 'rus', 'ham', 'ant', 'lec', 'sai', 'alb', 'had', 'lin', 'law', 'str', 'alo', 'oco', 'bea', 'hul', 'bor', 'gas', 'col', 'per', 'bot'],
        lockedAt: Date.now()
      });

      const { exportSessionToExcel } = await import('./js/export.js');
      await exportSessionToExcel('r1', 'race');

      return { exportedFile, sheetNames };
    });

    assert.ok(exportResult.exportedFile, 'Excel file should have been exported');
    assert.match(exportResult.exportedFile, /Australian_Grand_Prix.*\.xlsx/, 'Filename should match Australian GP');
    console.log('Exported file successfully:', exportResult.exportedFile);
    console.log('Generated sheets:', exportResult.sheetNames);

    assert.equal(pageErrors.length, 0, `Page errors encountered: ${pageErrors.join(', ')}`);
    console.log('PASS: All Admin Excel export tests completed successfully!');

  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('FAIL: Admin export test failed:', err);
  process.exit(1);
});

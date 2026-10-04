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

    // -------------------------------------------------------------
    // PART 1: REGULAR (NON-ADMIN) USER VERIFICATION
    // -------------------------------------------------------------
    console.log('--- Starting Regular User Test ---');
    const userContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
    });

    await userContext.addInitScript(() => {
      window.__signedIn = true;
      window.__isAdmin = false; // Regular user, NOT admin
      window.__writes = [];
    });

    await userContext.route('**/*', (route) => {
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

    const userPage = await userContext.newPage();
    const pageErrors = [];
    userPage.on('pageerror', (err) => pageErrors.push(err.message));

    // Seed mock official results and multi-user predictions for r1 race
    await userPage.goto(baseURL, { waitUntil: 'networkidle' });

    console.log('Seeding mock official results and user predictions...');
    await userPage.evaluate(async () => {
      const { setDocument } = await import('./js/firebase.js');
      const order = [
        'nor', 'pia', 'rus', 'ant', 'ver', 'had', 'lec', 'ham', 'alb', 'sai',
        'lin', 'law', 'str', 'alo', 'oco', 'bea', 'hul', 'bor', 'gas', 'col',
        'per', 'bot'
      ];
      // Official result
      await setDocument('results', 'r1_race', {
        id: 'r1_race',
        raceId: 'r1',
        session: 'race',
        order,
        calculatedAt: Date.now()
      });

      // Current user (u1 - Alex Morgan) prediction
      await setDocument('predictions', 'pred_u1_r1_race', {
        id: 'pred_u1_r1_race',
        raceId: 'r1',
        session: 'race',
        userId: 'u1',
        order,
        lockedAt: Date.now()
      });

      // Other player (u2 - Jordan Lee) prediction
      await setDocument('predictions', 'pred_u2_r1_race', {
        id: 'pred_u2_r1_race',
        raceId: 'r1',
        session: 'race',
        userId: 'u2',
        order: [
          'ver', 'nor', 'lec', 'ham', 'pia', 'rus', 'sai', 'ant', 'alb', 'had',
          'alo', 'str', 'law', 'lin', 'oco', 'gas', 'bea', 'hul', 'col', 'bor',
          'bot', 'per'
        ],
        lockedAt: Date.now()
      });

      // Other player (u3 - Sam Rivera) prediction
      await setDocument('predictions', 'pred_u3_r1_race', {
        id: 'pred_u3_r1_race',
        raceId: 'r1',
        session: 'race',
        userId: 'u3',
        order: [
          'lec', 'ver', 'nor', 'ham', 'pia', 'rus', 'sai', 'ant', 'alo', 'alb',
          'had', 'str', 'law', 'lin', 'bea', 'hul', 'oco', 'gas', 'col', 'bor',
          'per', 'bot'
        ],
        lockedAt: Date.now()
      });
    });

    // 1. Verify Header Nav includes "Results"
    console.log('Checking Header Nav for Results item...');
    const resultsNavBtn = userPage.locator('.nav-item[data-page=results]');
    assert.equal(await resultsNavBtn.isVisible(), true, 'Results nav item should be visible in header');

    // 2. Click Results in nav to navigate to Results page
    console.log('Navigating to Results via Header Nav...');
    await resultsNavBtn.click();
    await userPage.waitForTimeout(500);

    // 3. Verify user's own performance card
    console.log('Verifying User Personal Performance Card...');
    const heroCard = userPage.locator('.result-hero-card');
    await heroCard.waitFor();
    assert.equal(await heroCard.isVisible(), true, 'User should see their own result hero card');
    const heroText = await heroCard.innerText();
    console.log('heroText:', JSON.stringify(heroText));
    assert.ok(heroText.includes('Alex Morgan') || heroText.includes('YOUR PERFORMANCE'), 'Hero card should display current user performance');
    assert.ok(heroText.toLowerCase().includes('rank'), 'User should see their session rank');

    // 4. Verify other players' cards
    console.log('Verifying other players results cards...');
    const playerCards = userPage.locator('.result-player-card');
    const playerCardCount = await playerCards.count();
    assert.ok(playerCardCount >= 3, `Should display all players cards (found ${playerCardCount})`);

    // Verify Jordan Lee and Sam Rivera are displayed
    const gridText = await userPage.locator('#results-grid').innerText();
    assert.ok(gridText.includes('Jordan Lee'), 'Other player Jordan Lee should be visible');
    assert.ok(gridText.includes('Sam Rivera'), 'Other player Sam Rivera should be visible');

    // 5. Test switching to Official Classification sub-view tab
    console.log('Testing Official Classification sub-view tab...');
    await userPage.locator('#view-tab-official').click();
    await userPage.locator('.official-table').waitFor();
    const officialTableText = await userPage.locator('.official-table').innerText();
    assert.ok(officialTableText.includes('NOR'), 'Official table should display Lando Norris');
    assert.ok(officialTableText.includes('McLaren'), 'Official table should display team names');
    assert.ok(officialTableText.includes('P1') && officialTableText.includes('P22'), 'Official table should display P1 through P22');

    // 6. Test switching to Grid Picks Matrix tab
    console.log('Testing Grid Picks Matrix tab...');
    await userPage.locator('#view-tab-matrix').click();
    await userPage.locator('#btn-export-matrix-direct').waitFor();
    const matrixText = await userPage.locator('#results-content-area').innerText();
    assert.ok(matrixText.toUpperCase().includes('OFFICIAL RESULT'), 'Matrix should show official result column');
    assert.ok(matrixText.toUpperCase().includes('ALEX MORGAN'), 'Matrix should show current user column');
    assert.ok(matrixText.toUpperCase().includes('JORDAN LEE'), 'Matrix should show other players column');

    // 7. Test Excel export from Results Breakdown page
    console.log('Testing Excel export by regular user from Results page...');
    const exportResult = await userPage.evaluate(async () => {
      let exportedFile = null;
      let sheetNames = [];
      window.XLSX.writeFile = (wb, filename) => {
        exportedFile = filename;
        sheetNames = wb.SheetNames;
      };

      const { exportSessionToExcel } = await import('./js/export.js');
      await exportSessionToExcel('r1', 'race');
      return { exportedFile, sheetNames };
    });

    assert.ok(exportResult.exportedFile, 'Regular user should be able to trigger Excel export');
    assert.ok(exportResult.sheetNames.includes('Results & Breakdown'), 'Excel should contain Results & Breakdown sheet');
    assert.ok(exportResult.sheetNames.includes('Session Leaderboard'), 'Excel should contain Session Leaderboard sheet');
    assert.ok(exportResult.sheetNames.includes('Official Classification'), 'Excel should contain Official Classification sheet');
    console.log('Generated sheets for regular user:', exportResult.sheetNames);

    // 8. Test Export Modal from Race Calendar for regular user
    console.log('Testing Race Calendar Export / Results Modal for regular user...');
    await userPage.locator('[data-page=races]').click();
    await userPage.locator('.race-calendar-row').first().waitFor();

    const calendarExportBtn = userPage.locator('#btn-admin-export-calendar');
    assert.equal(await calendarExportBtn.isVisible(), true, 'Regular user should see Export Session Excel in calendar toolbar');
    await calendarExportBtn.click();
    await userPage.locator('#export-modal-overlay').waitFor();

    // Verify modal elements
    assert.equal(await userPage.locator('#export-modal-view-results').isVisible(), true, 'Modal should contain View Results button');
    // Select r1 (Australian GP with seeded results)
    await userPage.locator('#export-race-select').selectOption('r1');
    await userPage.waitForTimeout(300);

    // Test clicking View Results from modal
    await userPage.locator('#export-modal-view-results').click();
    await userPage.locator('#export-modal-overlay').waitFor({ state: 'detached' });
    await userPage.locator('.result-hero-card').waitFor();
    console.log('Modal "View Results" successfully navigated to Results Breakdown page!');

    // 9. Test Race Details side panel session buttons
    console.log('Testing Race Details side panel buttons for regular user...');
    await userPage.locator('[data-page=races]').click();
    await userPage.locator('.race-calendar-row').first().click();
    await userPage.locator('.side-panel.open').waitFor();

    const sessionResultBtns = userPage.locator('.btn-session-view-results');
    assert.ok(await sessionResultBtns.count() >= 2, 'Sessions should have Results buttons in side panel');

    const sessionExcelBtns = userPage.locator('.btn-session-export-excel');
    assert.ok(await sessionExcelBtns.count() >= 2, 'Sessions should have Excel export buttons in side panel');

    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join(', ')}`);
    console.log('PASS: All Regular User Results & Excel Export tests passed!');

    await userContext.close();

    // -------------------------------------------------------------
    // PART 2: ADMIN USER VERIFICATION
    // -------------------------------------------------------------
    console.log('--- Starting Admin User Test ---');
    const adminContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
    });

    await adminContext.addInitScript(() => {
      window.__signedIn = true;
      window.__isAdmin = true; // Admin user
      window.__writes = [];
    });

    await adminContext.route('**/*', (route) => {
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

    const adminPage = await adminContext.newPage();
    const adminErrors = [];
    adminPage.on('pageerror', (err) => adminErrors.push(err.message));

    await adminPage.goto(baseURL, { waitUntil: 'networkidle' });

    // Seed mock data for r1
    await adminPage.evaluate(async () => {
      const { setDocument } = await import('./js/firebase.js');
      const order = [
        'nor', 'pia', 'rus', 'ant', 'ver', 'had', 'lec', 'ham', 'alb', 'sai',
        'lin', 'law', 'str', 'alo', 'oco', 'bea', 'hul', 'bor', 'gas', 'col',
        'per', 'bot'
      ];
      await setDocument('results', 'r1_race', {
        id: 'r1_race',
        raceId: 'r1',
        session: 'race',
        order,
        calculatedAt: Date.now()
      });
      await setDocument('predictions', 'pred_u1_r1_race', {
        id: 'pred_u1_r1_race',
        raceId: 'r1',
        session: 'race',
        userId: 'u1',
        order,
        lockedAt: Date.now()
      });
    });

    // Admin navigates to results
    await adminPage.locator('.nav-item[data-page=results]').click();
    await adminPage.locator('.result-hero-card').waitFor();

    // Verify Admin has "Edit Results" button
    const editBtn = adminPage.locator('#btn-edit-results-breakdown');
    assert.equal(await editBtn.isVisible(), true, 'Admin should have Edit Results button in Results view');

    // Verify Admin has "Export Excel" button in Results view
    const exportResultsBtn = adminPage.locator('#btn-export-results-breakdown');
    assert.equal(await exportResultsBtn.isVisible(), true, 'Admin should have Export Excel button in Results view');

    assert.equal(adminErrors.length, 0, `Admin page errors: ${adminErrors.join(', ')}`);
    console.log('PASS: All Admin Results & Excel Export tests passed!');

    await adminContext.close();

  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('FAIL: Test failed:', err);
  process.exit(1);
});

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures/firebase.js'),
  'utf8',
);
const screenshotDir = process.env.F1_SCREENSHOT_DIR || '/tmp/f1-ui-smoke';
fs.mkdirSync(screenshotDir, { recursive: true });
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
    browser = await chromium.launch({
      executablePath:
        process.env.CHROMIUM_PATH ||
        (fs.existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
          ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
          : fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      env: { ...process.env, XDG_CACHE_HOME: '/tmp/f1-browser-cache' },
    });
    const errors = [];
    async function open(width, height, signedIn = false, mock = true) {
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: width <= 1024,
        reducedMotion: 'reduce',
      });
      await context.addInitScript(
        ({ signedIn }) => {
          window.__signedIn = signedIn;
          window.__writes = [];
        },
        { signedIn },
      );
      await context.route('**/*', (route) => {
        const u = new URL(route.request().url());
        if (mock && u.pathname === '/js/firebase.js')
          return route.fulfill({
            contentType: 'application/javascript',
            body: fixture,
          });
        if (u.hostname !== '127.0.0.1') return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(baseURL, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      return page;
    }
    async function screenshot(page, name) {
      await page.mouse.move(0, 0);
      await page
        .locator('.toast-close')
        .evaluateAll((buttons) => buttons.forEach((button) => button.click()));
      await page.waitForFunction(
        () => document.querySelectorAll('.toast').length === 0,
      );
      await page.screenshot({
        path: path.join(screenshotDir, name + '.png'),
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        'Horizontal overflow on ' + name,
      );
    }
    const page = await open(1440, 1000);
    await page.locator('#auth-submit:enabled').waitFor();
    await screenshot(page, 'auth-ready');
    await page.locator('#auth-submit').click();
    assert.match(await page.locator('#email-error').innerText(), /required/);
    await page.locator('#auth-email').fill('bad-email');
    await page.locator('#auth-submit').click();
    assert.match(await page.locator('#email-error').innerText(), /valid/);
    await page.locator('#auth-toggle').click();
    assert.equal(await page.locator('#name-group').isVisible(), true);
    assert.match(await page.locator('#auth-title').innerText(), /Your season/);
    await page.locator('#auth-password').fill('example-password');
    await page.locator('#password-toggle').click();
    assert.equal(
      await page.locator('#auth-password').getAttribute('type'),
      'text',
    );
    await page.locator('#password-toggle').click();
    await page.locator('#auth-toggle').click();
    await page.locator('#auth-email').fill('alex@example.test');
    await page.locator('#auth-submit').click();
    await page.locator('#card-next-race').waitFor();
    await screenshot(page, 'dashboard-desktop');
    assert.match(await page.locator('#cd-days').innerText(), /^\d{2}$/);
    await page.locator('[data-page=races]').click();
    await page.locator('.race-calendar-row').first().waitFor();
    assert.equal(await page.locator('.race-calendar-row').count(), 5);
    await page.locator('[data-filter=active]').click();
    assert.equal(await page.locator('.race-calendar-row').count(), 1);
    await page.locator('[data-filter=all]').click();
    assert.equal(
      await page.locator('[data-filter=all]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(await page.locator('.filter-btn.active').count(), 1);
    await screenshot(page, 'calendar-desktop');
    await page.locator('.race-calendar-row').first().focus();
    await page.keyboard.press('Enter');
    await page.locator('.side-panel.open').waitFor();
    await page
      .locator('#side-panel-overlay')
      .click({ position: { x: 50, y: 100 } });
    await page.locator('[data-page=leaderboard]').click();
    await page.locator('.podium-card').first().waitFor();
    assert.equal(await page.locator('.leaderboard-row').count(), 4);
    await screenshot(page, 'standings-desktop');
    await page.evaluate(() => (location.hash = '#predict/r3/quali'));
    await page.locator('#driver-pool .driver-card').first().waitFor();
    assert.equal(await page.locator('#driver-pool .driver-card').count(), 22);
    await page.locator('#driver-pool .driver-card').first().click();
    await page.waitForTimeout(1000);
    assert.match(await page.locator('#filled-count').innerText(), /1\/22/);
    await screenshot(page, 'prediction-desktop');
    await page.locator('#btn-signout').click();
    await page.locator('#auth-submit:enabled').waitFor();
    const mobile = await open(390, 844, true);
    await mobile.locator('#card-next-race').waitFor();
    await screenshot(mobile, 'dashboard-mobile');
    await mobile.locator('#mobile-menu-btn').click();
    assert.equal(
      await mobile.locator('#mobile-menu-btn').getAttribute('aria-expanded'),
      'true',
    );
    await mobile.locator('[data-page=races]').click();
    assert.equal(
      await mobile.locator('#mobile-menu-btn').getAttribute('aria-expanded'),
      'false',
    );
    await mobile.locator('.race-calendar-row').first().waitFor();
    await screenshot(mobile, 'calendar-mobile');
    await mobile.locator('#mobile-menu-btn').click();
    await mobile.locator('[data-page=leaderboard]').click();
    await mobile.locator('.podium-card').first().waitFor();
    await screenshot(mobile, 'standings-mobile');
    await mobile.evaluate(() => (location.hash = '#predict/r3/quali'));
    await mobile.locator('#driver-pool .driver-card').first().waitFor();
    await screenshot(mobile, 'prediction-mobile');
    await mobile.locator('#btn-signout').click();
    await mobile.locator('#auth-submit:enabled').waitFor();
    await screenshot(mobile, 'auth-mobile');
    const blocked = await open(390, 844, false, false);
    await blocked.locator('#retry-connection').waitFor();
    assert.equal(await blocked.locator('#auth-submit').isDisabled(), true);
    await screenshot(blocked, 'offline-mobile');
    for (const width of [320, 375, 600, 768, 820, 1024, 1440]) {
      const responsive = await open(width, 900, true);
      await responsive.locator('#card-next-race').waitFor();
      await screenshot(responsive, 'overview-' + width);
      for (const [route, ready] of [
        ['races', '.race-calendar-row'],
        ['leaderboard', '.podium-card'],
        ['predict/r3/quali', '#driver-pool .driver-card'],
      ]) {
        await responsive.evaluate(route => { location.hash = '#' + route; }, route);
        await responsive.locator(ready).first().waitFor();
        await screenshot(responsive, route.split('/')[0] + '-' + width);
      }
      const slots = await responsive.locator('#order-list .order-slot').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().height));
      assert.ok(slots.every(height => height >= 44), 'Order rows must not collapse inside scroll panel');
      if (width <= 1024) await responsive.locator('#driver-pool .driver-card').first().tap();
      else await responsive.locator('#driver-pool .driver-card').first().click();
      await responsive.locator('#order-list .filled').first().waitFor();
      assert.match(await responsive.locator('#filled-count').innerText(), /1\/22/);
      await responsive.locator('#order-list .filled').first().click();
      assert.match(await responsive.locator('#filled-count').innerText(), /0\/22/);
      if (width <= 900) {
        if (width === 375) {
          // A full touch-built prediction must leave Review/Lock and the dialog reachable.
          for (let i = 0; i < 22; i++) await responsive.locator('#driver-pool .driver-card').first().click();
          await responsive.locator('#btn-confirm').click();
          await responsive.locator('.modal').waitFor();
          await screenshot(responsive, 'prediction-confirm-phone');
          await responsive.locator('.modal').evaluate(modal => {
            if (modal.getBoundingClientRect().bottom > innerHeight + 1) throw new Error('Confirmation dialog exceeds screen');
          });
          await responsive.keyboard.press('Escape');
        }
        await responsive.locator('#mobile-menu-btn').click();
        await responsive.locator('[data-page=races]').click();
        await responsive.locator('.race-calendar-row').first().click();
        await responsive.locator('.side-panel.open').waitFor();
        await screenshot(responsive, 'race-details-' + width);
      }
      await responsive.context().close();
    }
    const landscape = await open(844, 390, true);
    await landscape.evaluate(() => { location.hash = '#predict/r3/quali'; });
    await landscape.locator('#driver-pool .driver-card').first().waitFor();
    await screenshot(landscape, 'prediction-landscape');
    await landscape.locator('#chat-fab').tap();
    await landscape.locator('#chat-popup:not(.hidden)').waitFor();
    await screenshot(landscape, 'chat-landscape');
    const chatBounds = await landscape.locator('#chat-popup').boundingBox();
    assert.ok(chatBounds.y >= 0 && chatBounds.y + chatBounds.height <= 390, 'Landscape chat must fit the screen');
    await landscape.locator('#btn-close-chat').tap();
    await landscape.locator('#btn-signout').click();
    await landscape.locator('#auth-submit:enabled').waitFor();
    await screenshot(landscape, 'auth-landscape');
    assert.deepEqual(errors, []);
    console.log(
      'PASS: Auth validation, account toggle, password visibility, sign-in/out, overview, calendar filters and keyboard details, standings, driver selection, mobile menu, no horizontal overflow, and offline state. Firebase isolated with browser-only fixtures; no live writes.',
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});

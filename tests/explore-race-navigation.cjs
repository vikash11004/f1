const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const fixtureBase = fs.readFileSync(
  path.join(__dirname, 'fixtures/firebase.js'),
  'utf8'
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
      '.' + (pathname === '/' ? '/index.html' : pathname)
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
    });

    // Test 1: Inactive / upcoming race where admin has NOT activated predictions yet
    console.log('Testing: Inactive/Upcoming race (admin has not activated predictions)...');
    {
      // Create fixture where r3 is completed and r4 is upcoming
      const fixtureUpcoming = fixtureBase.replace(
        "status: 'active',",
        "status: 'completed',"
      );

      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await context.route('**/*', (route) => {
        const u = new URL(route.request().url());
        if (u.pathname === '/js/firebase.js') {
          return route.fulfill({
            contentType: 'application/javascript',
            body: fixtureUpcoming,
          });
        }
        if (u.hostname !== '127.0.0.1') return route.abort();
        return route.continue();
      });

      const page = await context.newPage();
      await page.goto(baseURL);

      // Sign in as regular user
      await page.locator('#auth-email').fill('alex@example.test');
      await page.locator('#auth-password').fill('password123');
      await page.locator('#auth-submit').click();
      await page.locator('#card-next-race').waitFor();

      // Verify hero card shows 'Explore the race'
      const heroLink = page.locator('#card-next-race .race-hero-link');
      const heroLinkText = await heroLink.innerText();
      console.log('Hero link text:', heroLinkText);
      assert.ok(
        heroLinkText.includes('Explore the race'),
        'Hero link should say "Explore the race" when predictions are not active'
      );

      // Click card-next-race
      await page.locator('#card-next-race').click();

      // Check current URL hash
      const currentHash = await page.evaluate(() => window.location.hash);
      console.log('Navigated hash on click:', currentHash);
      assert.ok(
        currentHash.startsWith('#races'),
        `Should navigate to #races when predictions not activated, got: ${currentHash}`
      );
      assert.ok(
        !currentHash.startsWith('#predict'),
        'Must NOT navigate to #predict when predictions are not activated!'
      );

      // Verify side panel opens to explore the race details
      await page.locator('.side-panel.open').waitFor();
      const panelTitle = await page.locator('.side-panel.open .text-display-sm').innerText();
      console.log('Side panel opened for:', panelTitle);
      assert.ok(panelTitle.includes('Bahrain Grand Prix'), 'Side panel should show Bahrain Grand Prix');

      // Test direct navigation to #predict for upcoming race
      console.log('Testing direct navigation to #predict/r4/quali for upcoming race...');
      await page.evaluate(() => (window.location.hash = '#predict/r4/quali'));
      await page.waitForTimeout(500);

      const emptyTitle = await page.locator('#predict-page .empty-state-title').innerText();
      console.log('Direct navigation block message:', emptyTitle);
      assert.equal(emptyTitle, 'Predictions Not Open Yet');

      await context.close();
    }

    // Test 2: Active race where admin HAS activated predictions
    console.log('Testing: Active race (admin HAS activated predictions)...');
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await context.route('**/*', (route) => {
        const u = new URL(route.request().url());
        if (u.pathname === '/js/firebase.js') {
          return route.fulfill({
            contentType: 'application/javascript',
            body: fixtureBase,
          });
        }
        if (u.hostname !== '127.0.0.1') return route.abort();
        return route.continue();
      });

      const page = await context.newPage();
      await page.goto(baseURL);

      await page.locator('#auth-email').fill('alex@example.test');
      await page.locator('#auth-password').fill('password123');
      await page.locator('#auth-submit').click();
      await page.locator('#card-next-race').waitFor();

      // Verify hero card shows 'Make your prediction'
      const heroLink = page.locator('#card-next-race .race-hero-link');
      const heroLinkText = await heroLink.innerText();
      console.log('Active race hero link text:', heroLinkText);
      assert.ok(heroLinkText.includes('Make your prediction'));

      // Click card-next-race
      await page.locator('#card-next-race').click();

      const currentHash = await page.evaluate(() => window.location.hash);
      console.log('Active race navigated hash on click:', currentHash);
      assert.ok(
        currentHash.startsWith('#predict'),
        `Should navigate to #predict when predictions are active, got: ${currentHash}`
      );

      await context.close();
    }

    console.log('PASS: All Explore Race navigation tests passed successfully!');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});

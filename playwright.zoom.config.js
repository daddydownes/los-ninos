let playwright;
try { playwright = require('@playwright/test'); }
catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  // The Codex desktop runtime bundles the same test runner with Playwright.
  playwright = require('playwright/test');
}
const { defineConfig, devices } = playwright;

// Run the exported demo, so relative paths and packaging are covered as well.
// Device profiles exercise browser engines; they cannot reproduce Safari's GPU
// eviction or its native toolbar resizing on a physical iPhone.
module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'zoom-journey.check.cjs',
  fullyParallel: true,
  timeout: 35_000,
  expect: { timeout: 8_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 3,
  outputDir: '.local/zoom-test-results',
  reporter: [['list'], ['html', { outputFolder: '.local/zoom-test-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8767',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'python3 scripts/build-zoom-demo.py --output .local/zoom-check-site && python3 scripts/serve-test.py',
    env: { PORT: '8767', SITE_DIR: '.local/zoom-check-site' },
    url: 'http://127.0.0.1:8767',
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'ignore',
  },
  projects: [
    {
      name: 'zoom-webkit-iphone',
      use: {
        ...devices['iPhone 15'], browserName: 'webkit',
        viewport: { width: 393, height: 852 }, deviceScaleFactor: 3,
      },
    },
    {
      name: 'zoom-chromium-mobile',
      use: {
        ...devices['Pixel 7'], browserName: 'chromium',
        viewport: { width: 393, height: 852 }, deviceScaleFactor: 3,
      },
    },
    {
      name: 'zoom-chromium-desktop',
      use: { ...devices['Desktop Chrome'], browserName: 'chromium', viewport: { width: 1440, height: 1000 } },
    },
  ],
});

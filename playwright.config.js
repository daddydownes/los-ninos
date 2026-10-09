const { defineConfig, devices } = require('@playwright/test');

// These are engine/device-profile regressions, not a substitute for a physical
// iPhone's GPU, thermal behaviour, browser chrome, or VoiceOver testing.
module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : 3,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8765',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'python3 scripts/build-site.py && python3 scripts/serve-test.py',
    url: 'http://127.0.0.1:8765',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'ignore',
  },
  projects: [
    { name: 'webkit-iphone-se', use: { ...devices['iPhone SE'], browserName: 'webkit' } },
    { name: 'webkit-iphone-15', use: { ...devices['iPhone 15'], browserName: 'webkit' } },
    { name: 'webkit-iphone-landscape', use: { ...devices['iPhone 15 landscape'], browserName: 'webkit' } },
    { name: 'webkit-ipad', use: { ...devices['iPad Mini'], browserName: 'webkit' } },
    { name: 'webkit-desktop-safari', use: { ...devices['Desktop Safari'], browserName: 'webkit' } },
    { name: 'webkit-iphone-reduced-motion', use: { ...devices['iPhone 15'], browserName: 'webkit', reducedMotion: 'reduce' } },
    { name: 'chromium-android', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], browserName: 'chromium' } },
  ],
});

const { chromium } = require('@playwright/test')
const fs = require('fs')
const path = require('node:path')
const baseUrl = process.env.CODEX_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:3329'
if (!['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname))
  throw Error('Use an isolated local acceptance server.')
const output = path.resolve(
  __dirname,
  '../../../work/artifacts/codex-connection',
)
fs.mkdirSync(output, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  await context.addInitScript(() => {
    const Native = window.WebSocket
    window.__acceptanceSockets = []
    window.WebSocket = class extends Native {
      constructor(...args) {
        super(...args)
        window.__acceptanceSockets.push(this)
      }
    }
  })
  const page = await context.newPage()
  let ready = 0
  let errors = []
  let networkFault = false
  let expectedFaults = []
  page.on('pageerror', (e) => {
    if (networkFault && /fetch|network/i.test(e.message))
      expectedFaults.push(e.message)
    else errors.push(e.message)
  })
  page.on('websocket', (s) =>
    s.on('framereceived', (f) => {
      try {
        const d = JSON.parse(f.payload)
        if (d.detail?.kind === 'connection.ready') ready++
      } catch {}
    }),
  )
  const report = { checks: [], passed: false }
  try {
    await page.goto(baseUrl + '/login?redirect=/codex/verify-device')
    await page.getByLabel('用户名', { exact: true }).fill('admin')
    await page.getByLabel('密码', { exact: true }).fill('admin')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.waitForURL('**/codex/verify-device', { timeout: 30000 })
    await page.waitForTimeout(2000)
    await page.goto(baseUrl + '/codex/verify-device')
    await page.getByRole('heading', { name: '验证电脑', exact: true }).waitFor()
    report.checks.push('real browser login and enrollment page')
    await page.waitForTimeout(4000)
    await page.screenshot({
      path: path.join(output, 'browser-enrollment.png'),
      fullPage: true,
    })
    ready = 0
    await page.goto(baseUrl + '/codex/tasks')
    for (let i = 0; i < 60 && !ready; i++) await page.waitForTimeout(500)
    if (!ready)
      throw Error(
        'No realtime ready: ' +
          (await page.locator('body').innerText()).slice(0, 1200),
      )
    report.checks.push('real WebSocket ready')
    await page.waitForTimeout(2000)
    const previous = ready
    networkFault = true
    await context.setOffline(true)
    await page.evaluate(() =>
      window.__acceptanceSockets.forEach((socket) => socket.close()),
    )
    await page.waitForTimeout(3000)
    await context.setOffline(false)
    for (let i = 0; i < 90 && ready <= previous; i++)
      await page.waitForTimeout(500)
    if (ready <= previous) throw Error('No recovery ready')
    report.checks.push('offline/online reconnect reaches ready')
    networkFault = false
    report.expectedNetworkErrors = expectedFaults.length
    if (errors.length) throw Error(errors.join('\n'))
    report.passed = true
  } catch (e) {
    report.error = String(e)
    report.url = page.url()
    report.body = (await page.locator('body').innerText()).slice(0, 2000)
    report.errors = errors
    await page.screenshot({
      path: path.join(output, 'browser-failure.png'),
      fullPage: true,
    })
  } finally {
    fs.writeFileSync(
      path.join(output, 'browser.json'),
      JSON.stringify(report, null, 2),
    )
    await browser.close()
  }
  if (!report.passed) process.exitCode = 1
})()

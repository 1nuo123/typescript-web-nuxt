const { chromium, expect } = require('@playwright/test')
const fs = require('node:fs')
const origin = process.env.CODEX_ACCEPTANCE_ORIGIN
const host = process.env.CODEX_ACCEPTANCE_HOST_ID
const thread = process.env.CODEX_ACCEPTANCE_CONTENT_THREAD
const output = process.env.CODEX_ACCEPTANCE_OUTPUT
if (
  !origin ||
  new URL(origin).hostname !== '127.0.0.1' ||
  !host ||
  !thread ||
  !output
)
  throw Error('Use isolated content acceptance runner')
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 },
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  const report = {
    passed: false,
    stage: 'login',
    checks: [],
    page_errors: [],
    content_requests: 0,
    max_http_bytes: 0,
  }
  page.on('pageerror', (e) => report.page_errors.push(String(e)))
  page.on('response', async (response) => {
    if (response.url().includes('/content/read') && response.ok()) {
      report.content_requests++
      report.max_http_bytes = Math.max(
        report.max_http_bytes,
        (await response.body()).length,
      )
    }
  })
  try {
    await page.goto(origin + '/login?redirect=/codex/tasks')
    await page.getByLabel('用户名', { exact: true }).fill('admin')
    await page.getByLabel('密码', { exact: true }).fill('admin')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.waitForURL((url) => url.pathname === '/codex/tasks')
    const url = `${origin}/codex/tasks/${encodeURIComponent(thread)}?hostId=${encodeURIComponent(host)}`
    await page.goto(url)
    await expect(page.getByLabel('发送给 Codex', { exact: true })).toBeEnabled({
      timeout: 30000,
    })
    report.stage = 'expand and exact UTF-8 reconstruction'
    const expand = page
      .getByRole('button', { name: '展开正文', exact: true })
      .first()
    await expect(expand).toBeVisible({ timeout: 30000 })
    await expand.click()
    const body = page.getByLabel('已加载正文片段', { exact: true }).first()
    await expect(body).toContainText('中文🙂')
    let iterations = 0
    while (
      await page.getByRole('button', { name: '继续读取', exact: true }).count()
    ) {
      await page
        .getByRole('button', { name: '继续读取', exact: true })
        .first()
        .click()
      await expect(
        page.getByRole('button', { name: '正在读取…', exact: true }),
      ).toHaveCount(0)
      if (++iterations > 10) throw Error('No read progress')
    }
    const text = await body.locator('pre').allTextContents()
    const source =
      '中文🙂\\\n'.repeat(1800) +
      '\nReply exactly CONNECTION_WINDOW_OK. Do not use tools.'
    if (text.join('') !== source)
      throw Error('Browser text differs from real CLI input')
    report.checks.push(
      'Full real CLI body matches exact Chinese, emoji, newline, backslash text',
    )
    await page.screenshot({
      path: output.replace(/\.json$/, '-desktop.png'),
      fullPage: true,
    })
    await page
      .getByRole('button', { name: '收起正文', exact: true })
      .first()
      .click()
    await expect(body).toHaveCount(0)
    report.stage = 'cancel on collapse and navigation'
    await expand.click()
    await page
      .getByRole('button', { name: '收起正文', exact: true })
      .first()
      .click()
    await page.getByRole('link', { name: '设置', exact: true }).click()
    await page.waitForURL(/\/codex\/settings/)
    await expect(
      page.getByLabel('已加载正文片段', { exact: true }),
    ).toHaveCount(0)
    await page.goBack()
    await expect(expand).toBeVisible({ timeout: 30000 })
    await expect(page.getByLabel('发送给 Codex', { exact: true })).toBeEnabled({
      timeout: 30000,
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await expand.click()
    await expect(body).toContainText('中文🙂')
    await expect(body).toBeVisible()
    await page.screenshot({
      path: output.replace(/\.json$/, '-mobile.png'),
      fullPage: true,
    })
    const size = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    if (size.scroll > size.client + 1) throw Error('Mobile horizontal overflow')
    await expect(page.getByLabel('发送给 Codex', { exact: true })).toBeEnabled({
      timeout: 30000,
    })
    if (report.page_errors.length) throw Error(report.page_errors.join('\n'))
    report.checks.push(
      'Collapse cancels/clears, route leave clears, mobile rendering stays within viewport',
    )
    report.passed = true
    report.stage = 'complete'
  } catch (e) {
    report.error = String(e).slice(0, 1500)
    await page
      .screenshot({
        path: output.replace(/\.json$/, '-failure.png'),
        fullPage: true,
      })
      .catch(() => {})
  } finally {
    fs.writeFileSync(output, JSON.stringify(report, null, 2))
    await browser.close()
  }
  if (!report.passed) process.exitCode = 1
})().catch((e) => {
  console.error(String(e))
  process.exitCode = 1
})

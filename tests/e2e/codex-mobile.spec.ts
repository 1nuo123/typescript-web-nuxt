import { expect, test } from '@nuxt/test-utils/playwright'

const isCodexFeatureEnabled =
  process.env.NUXT_TEST_CODEX_FEATURE_ENABLED === 'true'

test('protects the Codex mobile entry without horizontal overflow', async ({
  page,
  goto,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await goto('/codex/tasks', { waitUntil: 'hydration' })

  if (isCodexFeatureEnabled) {
    await expect(
      page.getByRole('heading', { name: '登录', exact: true }),
    ).toBeVisible()
    await expect(page).toHaveURL(
      /\/login\?redirect=%2Fcodex%2Ftasks|\/login\?redirect=\/codex\/tasks/,
    )
  } else {
    await expect(
      page.getByRole('heading', { name: '页面未找到' }),
    ).toBeVisible()
    await expect(page.getByText('当前环境未启用该后台功能。')).toBeVisible()
  }

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
})

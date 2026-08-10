import { expect, test } from '@nuxt/test-utils/playwright'
import { THEME_STORAGE_KEY } from '../../app/utils/theme'

const NUXT_CLIENT_SCRIPT_PATTERN = /\/_nuxt\/.*\.js(?:\?.*)?$/
const MIN_INTERCEPTED_CLIENT_SCRIPTS = 1
const EMPTY_CLIENT_SCRIPT = ''
const HOME_PAGE_TITLE = '首页工作台'
const LOGIN_PAGE_TITLE = '登录'

const successHeader = {
  code: 'system.success.ok',
  message: 'ok',
  request_id: 'request-e2e-registration',
  trace_id: 'trace-e2e-registration',
}

test('renders the blank public home placeholder', async ({ page, goto }) => {
  await goto('/', { waitUntil: 'hydration' })

  await expect(
    page.getByRole('heading', { name: HOME_PAGE_TITLE, exact: true }),
  ).toBeVisible()
  await expect(page.locator('#app-sidebar')).toHaveCount(0)
  await expect(page.getByText('后台入口')).not.toBeVisible()
  await expect(page.getByText('进入后台')).not.toBeVisible()
  await expect(page.getByText('管理员用户')).not.toBeVisible()
})

test('renders the generic 404 boundary', async ({ page, goto }) => {
  const response = await goto('/route-that-does-not-exist', {
    waitUntil: 'hydration',
  })

  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: '页面未找到' })).toBeVisible()
  await expect(page.getByRole('button', { name: '返回首页' })).toBeVisible()
})

test('renders the public registration form', async ({ page, goto }) => {
  await goto('/register', { waitUntil: 'hydration' })

  await expect(
    page.getByRole('heading', { name: '注册', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('用户名')).toBeVisible()
  await expect(page.getByLabel('密码', { exact: true })).toBeVisible()
  await expect(page.getByLabel('确认密码')).toBeVisible()
  await expect(page.getByRole('button', { name: '注册' })).toBeVisible()
})

test('validates registration before sending a request', async ({
  page,
  goto,
}) => {
  await goto('/register', { waitUntil: 'hydration' })
  await page.getByLabel('用户名').fill('Invalid user')
  await page.getByLabel('密码', { exact: true }).fill('short')
  await page.getByLabel('确认密码').fill('different')
  await page.getByRole('button', { name: '注册' }).click()

  await expect(page.getByText('用户名只能使用小写字母')).toBeVisible()
  await expect(page.getByText('密码至少需要 12 个字符')).toBeVisible()
  await expect(page.getByText('两次输入的密码不一致')).toBeVisible()
})

test('registers and opens the new account session', async ({ page, goto }) => {
  const username = 'browser_user'
  const password = 'browser-registration-password'

  await page.route('**/auth/register', (route) =>
    route.fulfill({
      contentType: 'application/json',
      status: 201,
      body: JSON.stringify({
        header: successHeader,
        data: {
          kind: 'user_registration',
          schema_version: '1.0',
          subject_id: 'user-browser',
          username,
        },
      }),
    }),
  )
  await page.route('**/auth/browser/token', (route) =>
    route.fulfill({
      contentType: 'application/json',
      status: 200,
      body: JSON.stringify({
        header: successHeader,
        data: {
          kind: 'browser_token_issue',
          schema_version: '1.0',
          access_token: 'browser-access-token',
          token_type: 'Bearer',
          expires_in_seconds: 900,
        },
      }),
    }),
  )
  await page.route('**/auth/me', (route) =>
    route.fulfill({
      contentType: 'application/json',
      status: 200,
      body: JSON.stringify({
        header: successHeader,
        data: {
          kind: 'authenticated_principal',
          subject_id: 'user-browser',
          username,
          roles: ['registered_user'],
          scopes: [],
          is_admin: false,
        },
      }),
    }),
  )

  await goto('/register', { waitUntil: 'hydration' })
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByLabel('确认密码').fill(password)
  await page.getByRole('button', { name: '注册' }).click()

  await expect(page).toHaveURL(/\/account$/)
  await expect(page.getByRole('heading', { name: '个人中心' })).toBeVisible()
  await expect(
    page.getByRole('definition').filter({ hasText: username }),
  ).toBeVisible()
  await expect(page.getByText('registered_user', { exact: true })).toBeVisible()
})

test('redirects protected admin routes for anonymous sessions', async ({
  page,
  goto,
}) => {
  await goto('/admin', { waitUntil: 'hydration' })

  await expect(
    page.getByRole('heading', { name: LOGIN_PAGE_TITLE }),
  ).toBeVisible()
  await expect(page).toHaveURL(
    /\/login\?redirect=%2Fadmin|\/login\?redirect=\/admin/,
  )
})

test('renders the standalone auth pages outside the admin shell', async ({
  page,
  goto,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await goto('/login', { waitUntil: 'hydration' })

  await expect(
    page.getByRole('heading', { name: LOGIN_PAGE_TITLE, exact: true }),
  ).toBeVisible()

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)

  await expect(page.locator('.app-frame')).toHaveCount(0)
  await expect(page.locator('#app-sidebar')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '打开导航' })).toHaveCount(0)

  await goto('/register', { waitUntil: 'hydration' })

  await expect(page.locator('.app-frame')).toHaveCount(0)
  await expect(page.locator('#app-sidebar')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '打开导航' })).toHaveCount(0)
})

test('applies stored theme before hydration completes', async ({
  page,
  goto,
}) => {
  const interceptedClientScripts: string[] = []

  await page.route(NUXT_CLIENT_SCRIPT_PATTERN, (route) => {
    interceptedClientScripts.push(route.request().url())
    return route.fulfill({
      body: EMPTY_CLIENT_SCRIPT,
      contentType: 'application/javascript',
      status: 200,
    })
  })
  await page.addInitScript(
    ([storageKey]) => {
      localStorage.setItem(storageKey, 'dark')
    },
    [THEME_STORAGE_KEY],
  )

  await goto('/login', { waitUntil: 'domcontentloaded' })

  expect(
    interceptedClientScripts.length,
    'client bundle should be intercepted so this assertion runs before hydration',
  ).toBeGreaterThanOrEqual(MIN_INTERCEPTED_CLIENT_SCRIPTS)
  expect(
    await page.evaluate(() => document.documentElement.dataset.theme),
  ).toBe('dark')
})

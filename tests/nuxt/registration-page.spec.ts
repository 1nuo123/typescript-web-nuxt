import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RegisterPage from '~/pages/register.vue'
import { HttpFaultKind } from '~/types/api'
import {
  AUTH_REGISTER_PATH,
  AuthErrorCode,
  AuthSessionStatus,
} from '~/types/auth'

const VALID_USERNAME = 'new_user'
const VALID_PASSWORD = 'registration-password'

const duplicateUsernameError = {
  statusCode: 409,
  data: {
    header: {
      code: AuthErrorCode.RegistrationUsernameConflict,
      message: '该用户名不可用。',
      request_id: 'request-registration-conflict',
      trace_id: 'trace-registration-conflict',
    },
    data: {
      kind: HttpFaultKind.HttpFault,
      schema_version: '1.0',
      status_code: 409,
      error_code: AuthErrorCode.RegistrationUsernameConflict,
    },
  },
}

describe('registration page', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore().$reset()
  })

  it('renders all registration fields without contacting the backend', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)

    const component = await mountSuspended(RegisterPage)

    expect(component.find('input[name="username"]').exists()).toBe(true)
    expect(component.find('input[name="password"]').exists()).toBe(true)
    expect(component.find('input[name="password_confirmation"]').exists()).toBe(
      true,
    )
    expect(fetchMock).not.toHaveBeenCalled()
    component.unmount()
  })

  it('rejects invalid fields and mismatched passwords before submission', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)
    const component = await mountSuspended(RegisterPage)

    await component.get('input[name="username"]').setValue('Invalid user')
    await component.get('input[name="password"]').setValue('short')
    await component
      .get('input[name="password_confirmation"]')
      .setValue('different')
    await component.get('form').trigger('submit')

    expect(component.text()).toContain('用户名只能使用小写字母')
    expect(component.text()).toContain('密码至少需要 12 个字符')
    expect(component.text()).toContain('两次输入的密码不一致')
    expect(fetchMock).not.toHaveBeenCalled()
    component.unmount()
  })

  it('shows a stable duplicate username message and restores the form', async () => {
    const fetchMock = vi.fn().mockRejectedValue(duplicateUsernameError)
    vi.stubGlobal('$fetch', fetchMock)
    const component = await mountSuspended(RegisterPage)

    await component.get('input[name="username"]').setValue(VALID_USERNAME)
    await component.get('input[name="password"]').setValue(VALID_PASSWORD)
    await component
      .get('input[name="password_confirmation"]')
      .setValue(VALID_PASSWORD)
    await component.get('form').trigger('submit')
    await flushPromises()

    expect(fetchMock.mock.calls[0]?.[0]).toBe(AUTH_REGISTER_PATH)
    expect(component.text()).toContain('该用户名不可用，请更换后重试。')
    expect(component.get('input[name="username"]').attributes('disabled')).toBe(
      undefined,
    )
    expect(useAuthStore().status).toBe(AuthSessionStatus.Anonymous)
    component.unmount()
  })
})

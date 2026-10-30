import { expect, test } from '@nuxt/test-utils/playwright'

const codexFeatureEnabled =
  process.env.NUXT_TEST_CODEX_FEATURE_ENABLED === 'true'
const API_ORIGIN = 'http://127.0.0.1:8000'
const APP_ORIGIN = 'http://127.0.0.1:3320'
const NOW = '2026-09-15T01:00:00.000Z'

const envelope = <T>(data: T) => ({
  header: {
    code: 'system.success.ok',
    message: 'ok',
    request_id: 'e2e-request',
  },
  data,
})

const host = {
  host_id: 'host-1',
  owner_subject_id: 'subject-1',
  display_name: 'E2E Agent',
  platform: 'windows',
  agent_version: '0.1.25',
  codex_version: '0.145.0',
  agent_protocol_version: '2',
  app_server_schema_digest: 'schema',
  status: 'online',
  capabilities: {
    items: [
      { code: 'thread.start', version: 1 },
      { code: 'turn.start', version: 1 },
    ],
    app_server_instance_id: 'instance-1',
    model_catalog: {
      state: 'ready',
      models: [
        {
          model: 'gpt-5.6-sol',
          display_name: 'gpt-5.6-sol',
          reasoning_efforts: ['medium', 'xhigh'],
          default_reasoning_effort: 'xhigh',
          is_default: true,
        },
      ],
    },
    model_ids: ['gpt-5.6-sol'],
    reasoning_efforts: ['medium', 'xhigh'],
    sandbox_modes: ['workspace-write'],
    approval_policies: ['untrusted', 'on-request'],
  },
  compatibility: { state: 'compatible', reason_code: null },
  update: {
    state: 'current',
    channel: 'internal',
    current_version: '0.1.25',
    target_version: null,
    last_checked_at: NOW,
    last_result: null,
    security_deadline: null,
  },
  doctor: { state: 'healthy', checked_at: NOW, issue_codes: [] },
  last_seen_at: NOW,
  revoked_at: null,
  created_at: NOW,
  updated_at: NOW,
  version: 1,
}

const workspace = {
  workspace_id: 'workspace-1',
  host_id: 'host-1',
  owner_subject_id: 'subject-1',
  agent_workspace_key: 'workspace-key',
  display_name: 'E2E Workspace',
  repo_fingerprint: null,
  default_branch: 'main',
  worktree_policy: {
    enabled: false,
    base_branch: 'main',
    max_active: 1,
    retention_seconds: 3600,
    disk_watermark_percent: 90,
  },
  execution_preferences: {
    model: 'gpt-5.6-sol',
    reasoning_effort: 'xhigh',
    sandbox_mode: 'workspace-write',
    approval_policy: 'untrusted',
    capabilities_revision: 'capabilities-1',
  },
  is_pinned: false,
  enabled: true,
  created_at: NOW,
  updated_at: NOW,
  version: 1,
}

const thread = {
  thread_index_id: 'thread-index-1',
  host_id: 'host-1',
  workspace_id: 'workspace-1',
  owner_subject_id: 'subject-1',
  upstream_thread_id: 'thread-1',
  display_name: '执行审计会话',
  title_source: 'manual',
  model: 'gpt-5.6-sol',
  model_provider: 'openai',
  reasoning_effort: 'xhigh',
  status: 'idle',
  active_turn_id: null,
  turn_runtime: null,
  archived: false,
  is_pinned: false,
  source_kind: 'app_server',
  created_at: NOW,
  recency_at: NOW,
  updated_at: NOW,
  last_synced_at: NOW,
}

const fileApproval = (approvalId: string, path: string) => ({
  approval_id: approvalId,
  owner_subject_id: 'subject-1',
  host_id: 'host-1',
  workspace_id: 'workspace-1',
  thread_id: 'thread-1',
  turn_id: 'turn-1',
  item_id: `item-${approvalId}`,
  approval_kind: 'file_change',
  risk_level: 'normal',
  payload_digest: `digest-${approvalId}`,
  state: 'pending',
  version: 1,
  expires_at: null,
  decided_by: null,
  decision: null,
  decided_at: null,
  applied_at: null,
  created_at: NOW,
  updated_at: NOW,
  display_summary: {
    title: '写入文件',
    reason: '需要写入受控工作区。',
    workspace_name: 'E2E Workspace',
    risk_level: 'normal',
    risk_reason: null,
    allowed_actions: ['accept', 'decline', 'cancel'],
    file_scope: [path],
    file_changes: [
      {
        path,
        change_kind: 'added',
        added_lines: 1,
        deleted_lines: 0,
        sensitive: false,
        diff: '+ e2e file content',
        truncated: false,
      },
    ],
  },
})

const makeEvent = (eventId: string, detail: Record<string, unknown>) => ({
  header: {
    kind: 'codex_realtime_event',
    schema_version: '2.0',
    stream_epoch: 'codex-browser-stream-v2',
    cursor: eventId,
    event_id: eventId,
    occurred_at: NOW,
    host_id: 'host-1',
    workspace_id: 'workspace-1',
    thread_id: 'thread-1',
    turn_id: 'turn-1',
    item_id: null,
    detail_kind: detail.kind,
  },
  detail: { schema_version: '2.0', ...detail },
})

const textTimelineItem = (
  itemId: string,
  turnId: string,
  text: string,
  kind: 'user_message' | 'agent_message' = 'agent_message',
  clientOperationId: string | null = null,
) => ({
  header: {
    item_id: itemId,
    thread_id: 'thread-1',
    turn_id: turnId,
    detail_kind: kind,
    schema_version: '1.0',
    status: 'completed',
    created_at: NOW,
    client_operation_id: clientOperationId,
  },
  detail: {
    kind,
    schema_version: '1.0',
    text,
  },
})

const completedTurn = (turnId: string) => ({
  turn_id: turnId,
  thread_id: 'thread-1',
  status: 'completed',
  started_at: NOW,
  completed_at: NOW,
  error_message: null,
})

test.describe('Codex execution audit browser flow', () => {
  test.skip(
    !codexFeatureEnabled,
    'requires NUXT_TEST_CODEX_FEATURE_ENABLED=true so the client route is enabled.',
  )

  test('keeps accepted work, approvals, file results, terminals, and reconnects visible across viewports', async ({
    page,
    goto,
  }, testInfo) => {
    test.setTimeout(90_000)
    let failNextThreadList = false
    let processIsRunning = false
    const currentFixtureThread = () =>
      processIsRunning
        ? { ...thread, status: 'active', active_turn_id: 'turn-1' }
        : thread
    await page.addInitScript(() => {
      class DeterministicWebSocket extends EventTarget {
        static connections: DeterministicWebSocket[] = []
        readyState = 0
        readonly url: string

        constructor(url: string) {
          super()
          this.url = url
          DeterministicWebSocket.connections.push(this)
          Reflect.set(window, '__codexE2eSocket', this)
          window.setTimeout(() => {
            this.readyState = 1
            this.dispatchEvent(new Event('open'))
            this.emit(
              JSON.stringify({
                header: {
                  kind: 'codex_realtime_event',
                  schema_version: '2.0',
                  stream_epoch: 'codex-browser-stream-v2',
                  cursor: null,
                  event_id: crypto.randomUUID(),
                  occurred_at: new Date().toISOString(),
                  host_id: '00000000-0000-0000-0000-000000000000',
                  workspace_id: null,
                  thread_id: null,
                  turn_id: null,
                  item_id: null,
                  detail_kind: 'connection.ready',
                },
                detail: {
                  schema_version: '2.0',
                  kind: 'connection.ready',
                  heartbeat_interval: 15,
                  server_time: new Date().toISOString(),
                },
              }),
            )
          }, 0)
        }

        send(): void {}

        close(code = 1000, reason = ''): void {
          this.readyState = 3
          this.dispatchEvent(
            new CloseEvent('close', { code, reason, wasClean: code === 1000 }),
          )
        }

        emit(payload: string): void {
          this.dispatchEvent(new MessageEvent('message', { data: payload }))
        }
      }

      Object.defineProperty(window, 'WebSocket', {
        configurable: true,
        value: DeterministicWebSocket,
      })
    })

    await page.route(`${API_ORIGIN}/**`, async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const headers = {
        'access-control-allow-origin': APP_ORIGIN,
        'access-control-allow-credentials': 'true',
        'content-type': 'application/json',
      }
      const fulfill = (data: unknown, status = 200) =>
        route.fulfill({ status, headers, body: JSON.stringify(envelope(data)) })

      if (url.pathname === '/auth/browser/refresh') {
        return fulfill({
          kind: 'browser_token_issue',
          schema_version: '1.0',
          access_token: 'e2e-access-token',
          token_type: 'Bearer',
          expires_in_seconds: 3600,
        })
      }
      if (url.pathname === '/auth/me') {
        return fulfill({
          kind: 'authenticated_principal',
          schema_version: '1.0',
          subject_id: 'subject-1',
          username: 'e2e',
          roles: ['registered_user'],
          scopes: [
            'codex:read',
            'codex:operate',
            'codex:approve',
            'codex:files',
            'codex:terminal',
            'codex:host_manage',
          ],
          is_admin: false,
        })
      }
      if (url.pathname === '/codex/experience/feature-flags') {
        return fulfill({
          codex_scroll_controller_v2: false,
          codex_realtime_batch_v2: false,
          codex_authority_recovery_v2: false,
        })
      }
      if (url.pathname === '/codex/realtime-tickets') {
        return fulfill({ ticket: 'e2e-ticket', expires_at: null })
      }
      if (url.pathname === '/codex/active-host')
        return fulfill({
          active_host_id: 'host-1',
          draining_host_id: null,
          target_host_id: null,
          version: 1,
        })
      if (url.pathname === '/codex/hosts') return fulfill({ items: [host] })
      if (url.pathname === '/codex/hosts/host-1/workspaces') {
        return fulfill({ items: [workspace] })
      }
      if (
        url.pathname ===
        '/codex/hosts/host-1/workspaces/workspace-1/preferences'
      ) {
        return fulfill({
          workspace_id: 'workspace-1',
          effective_preferences: {
            ...workspace.execution_preferences,
            requested: {
              model: 'gpt-5.6-sol',
              reasoning_effort: 'xhigh',
              permission_mode: 'inherit',
            },
            local_revision: 1,
            applied_state: 'saved',
            error: null,
          },
          adjusted_fields: [],
        })
      }
      if (url.pathname === '/codex/hosts/host-1/threads') {
        if (request.method() === 'GET') {
          if (failNextThreadList) {
            failNextThreadList = false
            return route.fulfill({
              status: 500,
              headers,
              body: JSON.stringify({
                message: 'index temporarily unavailable',
              }),
            })
          }
          return fulfill({ items: [currentFixtureThread()], next_cursor: null })
        }
      }
      if (url.pathname === '/codex/hosts/host-1/threads/thread-1') {
        return fulfill({
          thread: currentFixtureThread(),
          turns: [],
          items: [],
          history_status: 'complete',
          history_before_cursor: null,
          history_has_more: false,
          history_revision: 'history-1',
        })
      }
      if (url.pathname === '/codex/hosts/host-1/threads/thread-1/resume') {
        return fulfill({
          operation_id: 'resume-1',
          command_id: 'resume-1',
          client_operation_id: null,
          status: 'accepted',
          replayed: false,
        })
      }
      if (url.pathname === '/codex/hosts/host-1/operations/resume-1') {
        return fulfill({
          operation_id: 'resume-1',
          command_id: 'resume-1',
          host_id: 'host-1',
          workspace_id: 'workspace-1',
          thread_id: 'thread-1',
          status: 'completed',
          error_code: null,
          updated_at: NOW,
        })
      }
      if (url.pathname === '/codex/hosts/host-1/threads/thread-1/turns') {
        failNextThreadList = true
        return fulfill({
          operation_id: 'turn-operation-1',
          command_id: 'turn-command-1',
          client_operation_id: request.postDataJSON().client_operation_id,
          status: 'accepted',
          replayed: false,
        })
      }
      if (url.pathname === '/codex/approvals') {
        return fulfill({
          items: [
            fileApproval('approval-1', '很长的目录/子目录/你好世界.txt'),
            fileApproval('approval-2', 'second.txt'),
          ],
        })
      }
      if (url.pathname.match(/^\/codex\/approvals\/approval-[12]\/decision$/)) {
        return fulfill({
          operation_id: `decision-${url.pathname.at(-1)}`,
          command_id: `decision-${url.pathname.at(-1)}`,
          client_operation_id: null,
          status: 'accepted',
          replayed: false,
        })
      }
      return route.fulfill({
        status: 500,
        headers,
        body: JSON.stringify(
          envelope({ message: 'Unhandled E2E API request' }),
        ),
      })
    })

    await goto('/codex/tasks/thread-1?hostId=host-1&workspaceId=workspace-1', {
      waitUntil: 'hydration',
    })
    await expect(
      page.getByRole('heading', { name: '执行审计会话' }),
    ).toBeVisible()
    await expect(page.getByText('gpt-5.6-sol · xhigh')).toBeVisible()

    await page.setViewportSize({ width: 1440, height: 900 })
    const draftInput = page.getByLabel('发送给 Codex')
    await draftInput.fill('折叠导航时保留的草稿')
    const navigation = page.getByRole('complementary', {
      name: 'Codex 项目导航',
    })
    const navigationWidth = await navigation.evaluate(
      (element) => element.getBoundingClientRect().width,
    )
    expect(navigationWidth).toBe(280)
    const collapseButton = page.getByRole('button', {
      name: '收起导航',
      exact: true,
    })
    await collapseButton.focus()
    await page.keyboard.press('Enter')
    await expect(navigation).toBeHidden()
    await expect(draftInput).toHaveValue('折叠导航时保留的草稿')
    await expect(page.getByRole('button', { name: '展开导航' })).toBeFocused()
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('codex-focus-mode.png'),
    })
    await page.getByRole('button', { name: '展开导航' }).click()
    await expect(navigation).toBeVisible()
    await draftInput.clear()

    for (const theme of ['dark', 'light']) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value
      }, theme)
      await expect(page.locator('.codex-main')).toHaveCSS(
        'background-color',
        theme === 'dark' ? 'rgb(20, 20, 20)' : 'rgb(255, 255, 255)',
      )
      await page
        .locator('.codex-conversation-header')
        .getByLabel('会话菜单', { exact: true })
        .click()
      await page
        .locator('.codex-conversation-header')
        .getByRole('button', { name: '重命名', exact: true })
        .click()
      const dialog = page.getByRole('dialog', { name: '重命名会话' })
      await expect(dialog).toBeVisible()
      await expect(dialog).toHaveClass(/codex-surface/)
      await expect(
        dialog.getByRole('button', { name: '关闭弹窗', exact: true }).last(),
      ).toBeFocused()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Shift+Tab')
      const closeFocusStyle = await dialog
        .getByRole('button', { name: '关闭弹窗', exact: true })
        .last()
        .evaluate((element) => ({
          width: getComputedStyle(element).outlineWidth,
          style: getComputedStyle(element).outlineStyle,
        }))
      expect(closeFocusStyle).toEqual({ width: '2px', style: 'solid' })
      await page.keyboard.press('Tab')
      await expect(dialog.getByLabel('会话标题')).toBeFocused()
      await expect(dialog.getByLabel('会话标题')).toHaveCSS(
        'outline-style',
        'solid',
      )

      await page.screenshot({
        animations: 'disabled',
        path: testInfo.outputPath(`codex-${theme}-dialog.png`),
      })
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await page
        .locator('.codex-conversation-header')
        .getByLabel('会话菜单', { exact: true })
        .click()
      await page.screenshot({
        animations: 'disabled',
        path: testInfo.outputPath(`codex-${theme}-conversation.png`),
      })
    }

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 900 },
      { width: 1024, height: 900 },
      { width: 768, height: 900 },
      { width: 844, height: 390 },
      { width: 430, height: 900 },
      { width: 390, height: 844 },
      { width: 360, height: 800 },
    ]) {
      await page.setViewportSize(viewport)
      await expect(
        page.getByRole('heading', { name: '执行审计会话' }),
      ).toBeVisible()
      if (viewport.width >= 768) {
        await expect(
          page
            .getByRole('navigation', { name: 'Codex 辅助导航' })
            .getByRole('link', { name: '设置', exact: true }),
        ).toBeInViewport()
        await expect(
          page.locator('[data-codex-thread-id="thread-1"]'),
        ).toBeInViewport()
      }
      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }))
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
      await page.screenshot({
        animations: 'disabled',
        path: testInfo.outputPath(`codex-${viewport.width}.png`),
      })
      await page
        .getByRole('button', { name: '会话上下文', exact: true })
        .click()
      await expect(
        page.getByRole('complementary', { name: '会话上下文' }),
      ).toBeVisible()
      await page.screenshot({
        animations: 'disabled',
        path: testInfo.outputPath(`codex-context-${viewport.width}.png`),
      })
      await page
        .getByRole('button', { name: '关闭上下文', exact: true })
        .click()
      await expect(
        page.getByRole('complementary', { name: '会话上下文' }),
      ).toBeHidden()
    }

    await page.getByLabel('发送给 Codex').fill('写入审计文件')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(page.getByText('指令已提交，正在同步会话状态。')).toBeVisible()
    await expect(page.getByText('操作失败')).not.toBeVisible()

    await page.getByRole('button', { name: '查看审批' }).click()
    const firstApproval = page
      .getByRole('article')
      .filter({ hasText: '很长的目录/子目录/你好世界.txt' })
    await expect(firstApproval).toContainText('+ e2e file content')
    await firstApproval.getByRole('button', { name: '允许一次' }).click()
    await expect(
      page.getByText('审批结果已提交，正在等待 Agent 确认应用。'),
    ).toBeVisible()

    await page.evaluate(
      (event) => {
        const socket = Reflect.get(window, '__codexE2eSocket') as {
          emit: (payload: string) => void
        }
        socket.emit(JSON.stringify(event))
      },
      makeEvent('cursor-approval-1', {
        kind: 'approval.resolved',
        approval: {
          ...fileApproval('approval-1', '很长的目录/子目录/你好世界.txt'),
          state: 'applied',
          decision: 'accept',
          applied_at: NOW,
          updated_at: '2026-09-15T01:00:01.000Z',
        },
      }),
    )
    await expect(page).toHaveURL(/\/codex\/approval-center/)
    await expect(page.getByText('1 项待处理')).toBeVisible()
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('approval-1-applied.png'),
    })

    const secondApproval = page
      .getByRole('article')
      .filter({ hasText: 'second.txt' })
    await secondApproval.getByRole('button', { name: '允许一次' }).click()
    await page.evaluate(
      (event) => {
        const socket = Reflect.get(window, '__codexE2eSocket') as {
          emit: (payload: string) => void
        }
        socket.emit(JSON.stringify(event))
      },
      makeEvent('cursor-approval-2', {
        kind: 'approval.resolved',
        approval: {
          ...fileApproval('approval-2', 'second.txt'),
          state: 'applied',
          decision: 'accept',
          applied_at: NOW,
          updated_at: '2026-09-15T01:00:02.000Z',
        },
      }),
    )
    await expect(page).toHaveURL(/\/codex\/tasks\/thread-1/)

    await page.evaluate(
      (event) => {
        const socket = Reflect.get(window, '__codexE2eSocket') as {
          emit: (payload: string) => void
        }
        socket.emit(JSON.stringify(event))
      },
      makeEvent('cursor-file-completed', {
        kind: 'item.upsert',
        item: {
          header: {
            item_id: 'file-item-1',
            thread_id: 'thread-1',
            turn_id: 'turn-1',
            detail_kind: 'diff',
            schema_version: '1.0',
            status: 'completed',
            created_at: NOW,
            client_operation_id: null,
          },
          detail: {
            kind: 'diff',
            schema_version: '1.0',
            diff: {
              files: [
                {
                  path: '很长的目录/子目录/你好世界.txt',
                  old_path: null,
                  change_kind: 'added',
                  binary: false,
                  large: false,
                  truncated: false,
                  hunks: [
                    {
                      header: '@@ -0,0 +1 @@',
                      old_start: 0,
                      new_start: 1,
                      lines: [
                        {
                          kind: 'addition',
                          content: 'e2e file content',
                          old_line_number: null,
                          new_line_number: 1,
                        },
                      ],
                    },
                  ],
                },
              ],
              total_characters: 16,
              truncated: false,
            },
          },
        },
      }),
    )
    await expect(page.getByText('1 个文件变更')).toBeVisible()
    for (const item of [
      textTimelineItem(
        'design-user',
        'turn-1',
        '请检查项目结构，并展示可维护的实现方案。',
        'user_message',
      ),
      textTimelineItem(
        'design-agent',
        'turn-1',
        [
          '## 实现方案',
          '保持既有业务边界，将布局、消息和表单收敛到统一的视觉体系。',
          '',
          '- **导航**：项目与会话放在同一侧栏。',
          '- **交互**：保留键盘操作、复制代码和阅读位置。',
          '',
          '```typescript',
          'const message = "A deliberately long line to verify that code wrapping and horizontal scrolling remain usable on narrow mobile screens without widening the conversation"',
          'console.log(message)',
          '```',
          '',
          '界面已准备就绪，可以继续检查下一项。',
        ].join('\n'),
      ),
    ]) {
      await page.evaluate(
        (event) => {
          const socket = Reflect.get(window, '__codexE2eSocket') as {
            emit: (payload: string) => void
          }
          socket.emit(JSON.stringify(event))
        },
        makeEvent(`cursor-${item.header.item_id}`, {
          kind: 'item.upsert',
          item,
        }),
      )
    }
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 1000 },
    ]) {
      await page.setViewportSize(viewport)
      const agentMessage = page.locator('[data-codex-item-id="design-agent"]')
      await expect(agentMessage).toBeVisible()
      await page
        .getByRole('button', { name: '开启代码换行', exact: true })
        .click()
      await expect(page.locator('.codex-markdown-pre-wrapped')).toBeVisible()
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value
        }, theme)
        expect(
          await page
            .locator('.codex-reading-column')
            .first()
            .evaluate((element) => element.getBoundingClientRect().width),
        ).toBeLessThanOrEqual(780)
        await page.screenshot({
          animations: 'disabled',
          path: testInfo.outputPath(
            `codex-messages-${viewport.width}-${theme}.png`,
          ),
        })
      }
      await page
        .getByRole('button', { name: '关闭代码换行', exact: true })
        .click()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true)
    }
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.getByRole('button', { name: '复制代码', exact: true }).click()
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain('console.log(message)')

    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('file-diff.png'),
    })

    const emitProcess = async (
      cursor: string,
      detail: Record<string, unknown>,
    ) => {
      await page.evaluate(
        (event) => {
          const socket = Reflect.get(window, '__codexE2eSocket') as {
            emit: (payload: string) => void
          }
          socket.emit(JSON.stringify(event))
        },
        makeEvent(cursor, detail),
      )
    }
    const expectMeasuredRows = async () => {
      await expect
        .poll(() =>
          page
            .locator('.codex-conversation [data-codex-item-id]')
            .evaluateAll((elements) => {
              const rows = elements
                .map((element) => ({
                  id: element.getAttribute('data-codex-item-id'),
                  index: Number(element.getAttribute('data-index')),
                  box: element.getBoundingClientRect(),
                }))
                .sort((left, right) => left.index - right.index)
              return rows.flatMap((row, index) => {
                const next = rows[index + 1]
                return next && next.box.top < row.box.bottom - 1
                  ? [`${row.id} overlaps ${next.id}`]
                  : []
              })
            }),
        )
        .toEqual([])
    }
    const processCommand = (
      status: string,
      output: string,
      exitCode: number | null,
      id = 'process-command',
    ) => ({
      header: {
        item_id: id,
        thread_id: 'thread-1',
        turn_id: 'turn-1',
        detail_kind: 'command',
        schema_version: '1.0',
        status,
        created_at: NOW,
        client_operation_id: null,
      },
      detail: {
        kind: 'command',
        schema_version: '1.0',
        command:
          id === 'process-command'
            ? 'python -u verify_ui.py'
            : 'python fail_ui.py',
        output,
        exit_code: exitCode,
      },
    })
    processIsRunning = true
    await emitProcess('process-start', {
      kind: 'turn.started',
      turn: {
        turn_id: 'turn-1',
        thread_id: 'thread-1',
        status: 'active',
        started_at: NOW,
      },
    })
    await emitProcess('process-running', {
      kind: 'thread.updated',
      thread: {
        ...thread,
        status: 'active',
        active_turn_id: 'turn-1',
        turn_runtime: {
          turn_id: 'turn-1',
          thread_id: 'thread-1',
          phase: 'running',
          last_activity_at: NOW,
          stalled_reason: null,
          lease_generation: 1,
          lease_expires_at: null,
        },
      },
    })
    await emitProcess('process-empty', {
      kind: 'item.upsert',
      item: processCommand('streaming', '', null),
    })
    await page.setViewportSize({ width: 1440, height: 1000 })
    const workingStatus = page.getByRole('status', {
      name: 'Codex 变更已应用，仍在执行',
      exact: true,
    })
    await expect(workingStatus).toBeVisible()
    await expect(workingStatus).toHaveClass(/codex-message/)
    await expect(workingStatus.locator('.codex-markdown')).toHaveCSS(
      'font-size',
      '15px',
    )
    await expect(workingStatus.locator('.codex-markdown')).toHaveCSS(
      'line-height',
      '28px',
    )
    await expect(workingStatus.locator('.animate-spin')).toHaveCount(0)
    const process = page.locator(
      '.codex-conversation [data-command-id="process-command"]',
    )
    await expect(process.locator('summary')).toContainText('执行中')
    await expect(
      page.getByRole('button', { name: '中断', exact: true }),
    ).toBeVisible()
    await process.locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(process.locator('details')).toHaveAttribute('open', '')
    await expect(process.getByLabel('命令输出')).toHaveText('等待输出…')
    await process.scrollIntoViewIfNeeded()
    await expect(process.locator('.codex-terminal')).toBeInViewport({
      ratio: 0.95,
    })
    await expectMeasuredRows()
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('execution-running-empty.png'),
    })
    const partialOutput = 'step 1\n' + 'long-output-'.repeat(45)
    await emitProcess('process-partial', {
      kind: 'item.upsert',
      item: processCommand('streaming', partialOutput, null),
    })
    await expect(process.locator('details')).toHaveAttribute('open', '')
    await expect(process.getByLabel('命令输出')).toHaveText(partialOutput)
    await emitProcess('process-tail', {
      kind: 'item.upsert',
      item: textTimelineItem('process-tail', 'turn-1', '命令输出后续消息'),
    })
    const tail = page.locator('[data-codex-item-id="process-tail"]')
    await expect
      .poll(async () => {
        const first = await process.boundingBox()
        const next = await tail.boundingBox()
        return Boolean(first && next && next.y >= first.y + first.height - 1)
      })
      .toBe(true)
    await process.scrollIntoViewIfNeeded()
    await expect(process.locator('.codex-terminal')).toBeInViewport({
      ratio: 0.95,
    })
    await expectMeasuredRows()
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('execution-partial-desktop.png'),
    })
    await page.setViewportSize({ width: 390, height: 1000 })
    await expect(async () => {
      await process.scrollIntoViewIfNeeded()
      await expect(process.locator('.codex-terminal')).toBeInViewport({
        ratio: 0.95,
      })
    }).toPass({ timeout: 5000 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await process.scrollIntoViewIfNeeded()
    await expect(process.locator('.codex-terminal')).toBeInViewport({
      ratio: 0.95,
    })
    await expectMeasuredRows()
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('execution-partial-mobile.png'),
    })
    await emitProcess('process-complete', {
      kind: 'item.upsert',
      item: processCommand('completed', partialOutput + '\nfinished', 0),
    })
    await expect(process.locator('details')).toHaveAttribute('open', '')
    await expect(process.locator('summary')).toContainText('退出码 0')
    await process.getByRole('button', { name: '复制输出', exact: true }).click()
    await expect
      .poll(() =>
        page.evaluate(async () =>
          (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'),
        ),
      )
      .toBe(partialOutput + '\nfinished')
    await process.getByRole('button', { name: '复制命令', exact: true }).click()
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe('python -u verify_ui.py')
    await process.locator('summary').click()
    await emitProcess('process-complete-update', {
      kind: 'item.upsert',
      item: processCommand('completed', 'final verified output', 0),
    })
    await expect(process.locator('details')).not.toHaveAttribute('open')
    await emitProcess('process-failure', {
      kind: 'item.upsert',
      item: processCommand(
        'completed',
        'expected failure',
        1,
        'process-failed',
      ),
    })
    const failedProcess = page.locator(
      '.codex-conversation [data-command-id="process-failed"]',
    )
    await expect(failedProcess.locator('summary')).toContainText('执行失败')
    await expect(failedProcess.locator('summary')).toContainText('退出码 1')
    await failedProcess.locator('summary').click()
    await expect(failedProcess.getByLabel('命令输出')).toHaveText(
      'expected failure',
    )
    await failedProcess.scrollIntoViewIfNeeded()
    await expect(failedProcess.locator('.codex-terminal')).toBeInViewport({
      ratio: 0.95,
    })
    await expectMeasuredRows()
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('execution-failed-mobile.png'),
    })
    await failedProcess
      .getByRole('button', { name: '在上下文中查看', exact: true })
      .click()
    await expect(page).toHaveURL(/contextItem=process-failed/)
    const context = page.getByRole('complementary', { name: '会话上下文' })
    await expect(
      context.locator('[data-command-id="process-failed"]'),
    ).toBeVisible()
    await context.getByLabel('选择命令输出').selectOption('process-command')
    await expect(
      context.locator('[data-command-id="process-command"]'),
    ).toBeVisible()
    await context.locator('summary').click()
    await expect(context.getByLabel('命令输出', { exact: true })).toHaveText(
      'final verified output',
    )
    await context
      .getByRole('button', { name: '关闭上下文', exact: true })
      .click()
    await expect(page).not.toHaveURL(/context=/)
    await expect(failedProcess.locator('summary')).toContainText('执行失败')
    const planItem = {
      header: {
        ...processCommand('streaming', '', null).header,
        item_id: 'process-plan',
        detail_kind: 'plan',
      },
      detail: {
        kind: 'plan',
        schema_version: '1.0',
        explanation: '只展示已收到的计划步骤',
        steps: [
          { step: '运行检查', status: 'completed' },
          { step: '整理结果', status: 'in_progress' },
        ],
      },
    }
    await emitProcess('process-plan', { kind: 'item.upsert', item: planItem })
    await page.getByLabel('会话时间线', { exact: true }).press('End')
    const plan = page.locator('[data-codex-item-id="process-plan"] details')
    await expect(plan.locator('summary')).toContainText('1/2 已完成')
    await plan.locator('summary').click()
    await emitProcess('process-plan-done', {
      kind: 'item.upsert',
      item: {
        ...planItem,
        detail: {
          ...planItem.detail,
          steps: planItem.detail.steps.map((step) => ({
            ...step,
            status: 'completed',
          })),
        },
      },
    })
    await expect(plan).not.toHaveAttribute('open')
    await expect(plan.locator('summary')).toContainText('2/2 已完成')
    await expectMeasuredRows()
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByLabel('会话时间线', { exact: true }).press('End')
    await expect(plan).not.toHaveAttribute('open')
    await plan.scrollIntoViewIfNeeded()
    await expectMeasuredRows()
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('execution-completed-collapsed.png'),
    })

    processIsRunning = false
    await page.evaluate(
      (event) => {
        const socket = Reflect.get(window, '__codexE2eSocket') as {
          emit: (payload: string) => void
        }
        socket.emit(JSON.stringify(event))
      },
      makeEvent('cursor-turn-failed', {
        kind: 'turn.failed',
        turn: {
          turn_id: 'turn-1',
          thread_id: 'thread-1',
          status: 'failed',
          started_at: NOW,
          completed_at: '2026-09-15T01:00:03.000Z',
          error_message: 'E2E 上游失败',
        },
      }),
    )
    await expect(page.getByText('本轮执行失败')).toBeVisible()
    await expect(page.getByText('E2E 上游失败')).toBeVisible()

    await page.evaluate(() => {
      const socket = Reflect.get(window, '__codexE2eSocket') as {
        close: (code: number, reason: string) => void
      }
      socket.close(1006, 'e2e reconnect')
    })
    await expect(page.getByText(/正在重新连接/)).toBeVisible()

    const surfaces = [
      {
        path: '/codex/tasks?hostId=host-1&workspaceId=workspace-1',
        title: 'E2E Workspace',
        name: 'welcome',
      },
      {
        path: '/codex/projects?hostId=host-1',
        title: '项目',
        name: 'projects',
      },
      {
        path: '/codex/projects/workspace-1?hostId=host-1',
        title: 'E2E Workspace',
        name: 'project',
      },
      { path: '/codex/approval-center', title: '审批', name: 'approvals' },
      {
        path: '/codex/settings?hostId=host-1',
        title: '电脑',
        name: 'settings',
      },
      {
        path: '/codex/settings/execution?hostId=host-1&workspaceId=workspace-1',
        title: '运行设置',
        name: 'execution',
      },
      { path: '/codex/verify-device', title: '验证电脑', name: 'verify' },
    ]
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport)
      for (const surface of surfaces) {
        await goto(surface.path, { waitUntil: 'hydration' })
        if (surface.name !== 'welcome' || viewport.width > 767) {
          await expect(
            page.getByRole('heading', { name: surface.title, exact: true }),
          ).toBeVisible()
        } else {
          await expect(
            page.getByRole('heading', { name: 'Remote', exact: true }),
          ).toBeVisible()
        }
        for (const theme of ['light', 'dark']) {
          await page.evaluate((value) => {
            document.documentElement.dataset.theme = value
          }, theme)
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          ).toBe(true)
          await page.screenshot({
            animations: 'disabled',
            path: testInfo.outputPath(
              `codex-${surface.name}-${viewport.width}-${theme}.png`,
            ),
            fullPage: true,
          })
        }
        if (surface.name === 'settings') {
          const renameComputer = page.getByRole('button', {
            name: '重命名电脑',
            exact: true,
          })
          await renameComputer.scrollIntoViewIfNeeded()
          await expect(renameComputer).toBeInViewport()
          await renameComputer.click()
          await expect(
            page.getByRole('dialog', { name: '重命名电脑' }),
          ).toBeVisible()
          await page.keyboard.press('Escape')
          await page.getByRole('button', { name: '浅色', exact: true }).click()
          await expect(page.locator('html')).toHaveAttribute(
            'data-theme',
            'light',
          )
          await page.getByRole('button', { name: '深色', exact: true }).click()
          await expect(page.locator('html')).toHaveAttribute(
            'data-theme',
            'dark',
          )
        }
      }
    }
  })

  test('recovers terminal timeline authority without resurrecting buffered items', async ({
    page,
    goto,
  }) => {
    let snapshotMode: 'initial' | 'complete' | 'paged' | 'omitted' = 'initial'
    let recoverySnapshotResponses = 0
    let releaseRecoverySnapshot: () => void = () => undefined
    let resolveRecoverySnapshotRequest: () => void = () => undefined
    const recoverySnapshotReleased = new Promise<void>((resolve) => {
      releaseRecoverySnapshot = resolve
    })
    const recoverySnapshotRequested = new Promise<void>((resolve) => {
      resolveRecoverySnapshotRequest = resolve
    })

    const authoritativeSnapshot = {
      thread,
      turns: [completedTurn('turn-1'), completedTurn('turn-2')],
      // This is the newest whole page: history_has_more=false means both
      // represented terminal turns are safe to replace.
      items: [
        textTimelineItem(
          'snapshot-turn-1-user',
          'turn-1',
          'Authoritative user request',
          'user_message',
        ),
        textTimelineItem(
          'snapshot-turn-1-agent',
          'turn-1',
          'Shared terminal reply',
        ),
        textTimelineItem(
          'snapshot-turn-2-agent',
          'turn-2',
          'Shared terminal reply',
        ),
      ],
      history_status: 'complete',
      history_before_cursor: null,
      history_has_more: false,
      history_revision: 'history-2',
    }

    await page.addInitScript(() => {
      class DeterministicWebSocket extends EventTarget {
        readyState = 0

        constructor() {
          super()
          Reflect.set(window, '__codexE2eSocket', this)
          window.setTimeout(() => {
            this.readyState = 1
            this.dispatchEvent(new Event('open'))
            this.emit(
              JSON.stringify({
                header: {
                  kind: 'codex_realtime_event',
                  schema_version: '2.0',
                  stream_epoch: 'codex-browser-stream-v2',
                  cursor: null,
                  event_id: crypto.randomUUID(),
                  occurred_at: new Date().toISOString(),
                  host_id: '00000000-0000-0000-0000-000000000000',
                  workspace_id: null,
                  thread_id: null,
                  turn_id: null,
                  item_id: null,
                  detail_kind: 'connection.ready',
                },
                detail: {
                  schema_version: '2.0',
                  kind: 'connection.ready',
                  heartbeat_interval: 15,
                  server_time: new Date().toISOString(),
                },
              }),
            )
          }, 0)
        }

        send(): void {}

        close(code = 1000, reason = ''): void {
          this.readyState = 3
          this.dispatchEvent(
            new CloseEvent('close', { code, reason, wasClean: code === 1000 }),
          )
        }

        emit(payload: string): void {
          this.dispatchEvent(new MessageEvent('message', { data: payload }))
        }
      }

      Object.defineProperty(window, 'WebSocket', {
        configurable: true,
        value: DeterministicWebSocket,
      })
    })

    await page.route(`${API_ORIGIN}/**`, async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const headers = {
        'access-control-allow-origin': APP_ORIGIN,
        'access-control-allow-credentials': 'true',
        'content-type': 'application/json',
      }
      const fulfill = (data: unknown, status = 200) =>
        route.fulfill({ status, headers, body: JSON.stringify(envelope(data)) })

      if (url.pathname === '/auth/browser/refresh') {
        return fulfill({
          kind: 'browser_token_issue',
          schema_version: '1.0',
          access_token: 'e2e-access-token',
          token_type: 'Bearer',
          expires_in_seconds: 3600,
        })
      }
      if (url.pathname === '/auth/me') {
        return fulfill({
          kind: 'authenticated_principal',
          schema_version: '1.0',
          subject_id: 'subject-1',
          username: 'e2e',
          roles: ['registered_user'],
          scopes: [
            'codex:read',
            'codex:operate',
            'codex:files',
            'codex:terminal',
          ],
          is_admin: false,
        })
      }
      if (url.pathname === '/codex/experience/feature-flags') {
        return fulfill({
          codex_scroll_controller_v2: false,
          codex_realtime_batch_v2: false,
          codex_authority_recovery_v2: false,
        })
      }
      if (url.pathname === '/codex/realtime-tickets') {
        return fulfill({ ticket: 'e2e-ticket', expires_at: null })
      }
      if (url.pathname === '/codex/hosts') return fulfill({ items: [host] })
      if (url.pathname === '/codex/hosts/host-1/workspaces') {
        return fulfill({ items: [workspace] })
      }
      if (url.pathname === '/codex/hosts/host-1/threads') {
        return fulfill({ items: [thread], next_cursor: null })
      }
      if (url.pathname === '/codex/hosts/host-1/threads/thread-1') {
        if (snapshotMode === 'complete') {
          resolveRecoverySnapshotRequest()
          await recoverySnapshotReleased
          recoverySnapshotResponses += 1
          return fulfill(authoritativeSnapshot)
        }
        if (snapshotMode === 'paged') {
          recoverySnapshotResponses += 1
          return fulfill({
            ...authoritativeSnapshot,
            thread: { ...thread, status: 'active', active_turn_id: 'turn-3' },
            turns: [
              completedTurn('turn-1'),
              completedTurn('turn-2'),
              {
                ...completedTurn('turn-3'),
                status: 'active',
                completed_at: null,
              },
            ],
            items: [
              textTimelineItem(
                'paged-turn-1-tail',
                'turn-1',
                'Older page tail',
              ),
              textTimelineItem(
                'paged-turn-2-agent',
                'turn-2',
                'Newer page reply',
              ),
              textTimelineItem(
                'paged-turn-3-agent',
                'turn-3',
                'Active snapshot',
              ),
            ],
            history_before_cursor: 'older-page',
            history_has_more: true,
            history_revision: 'history-paged',
          })
        }
        if (snapshotMode === 'omitted') {
          recoverySnapshotResponses += 1
          return fulfill({
            thread,
            turns: [completedTurn('turn-1'), completedTurn('turn-2')],
            items: [],
            history_status: 'omitted_too_large',
            history_before_cursor: null,
            history_has_more: false,
            history_revision: 'history-3',
          })
        }
        return fulfill({
          thread,
          turns: [],
          items: [],
          history_status: 'complete',
          history_before_cursor: null,
          history_has_more: false,
          history_revision: 'history-1',
        })
      }
      if (url.pathname === '/codex/hosts/host-1/threads/thread-1/resume') {
        return fulfill({
          operation_id: 'resume-1',
          command_id: 'resume-1',
          client_operation_id: null,
          status: 'accepted',
          replayed: false,
        })
      }
      if (url.pathname === '/codex/hosts/host-1/threads/thread-1/turns') {
        const operationId = request.postDataJSON().client_operation_id as string
        authoritativeSnapshot.items[0]!.header.client_operation_id = operationId
        return fulfill({
          operation_id: 'turn-1',
          command_id: 'turn-1',
          client_operation_id: operationId,
          status: 'accepted',
          replayed: false,
        })
      }
      if (url.pathname === '/codex/approvals') return fulfill({ items: [] })
      return route.fulfill({
        status: 500,
        headers,
        body: JSON.stringify(
          envelope({ message: 'Unhandled E2E API request' }),
        ),
      })
    })

    await goto('/codex/tasks/thread-1?hostId=host-1&workspaceId=workspace-1', {
      waitUntil: 'hydration',
    })
    await expect(
      page.getByRole('heading', { name: '执行审计会话' }),
    ).toBeVisible()
    await page.waitForFunction(() => Reflect.has(window, '__codexE2eSocket'))

    await page.getByLabel('发送给 Codex').fill('Authoritative user request')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(page.locator('[data-codex-item-id^="local-"]')).toHaveCount(1)

    const emit = (event: ReturnType<typeof makeEvent>) =>
      page.evaluate((payload) => {
        const socket = Reflect.get(window, '__codexE2eSocket') as {
          emit: (message: string) => void
        }
        socket.emit(JSON.stringify(payload))
      }, event)
    const stalledThread = (turnId: string, leaseGeneration: number) => ({
      ...thread,
      status: 'active',
      active_turn_id: turnId,
      turn_runtime: {
        turn_id: turnId,
        thread_id: 'thread-1',
        phase: 'stalled',
        last_activity_at: NOW,
        stalled_reason: 'e2e recovery',
        lease_generation: leaseGeneration,
        lease_expires_at: null,
      },
    })

    await emit(
      makeEvent('timeline-live-turn-1-user', {
        kind: 'item.upsert',
        item: textTimelineItem(
          'live-turn-1-user',
          'turn-1',
          'Realtime user request',
          'user_message',
        ),
      }),
    )
    await emit(
      makeEvent('timeline-live-turn-1-agent', {
        kind: 'item.upsert',
        item: textTimelineItem(
          'live-turn-1-agent',
          'turn-1',
          'Shared terminal reply',
        ),
      }),
    )
    await emit(
      makeEvent('timeline-live-turn-2-agent', {
        kind: 'item.upsert',
        item: textTimelineItem(
          'live-turn-2-agent',
          'turn-2',
          'Shared terminal reply',
        ),
      }),
    )
    await expect(
      page.locator('[data-codex-item-id="live-turn-1-agent"]'),
    ).toBeVisible()

    snapshotMode = 'complete'
    await emit(
      makeEvent('timeline-recovery-stalled', {
        kind: 'thread.updated',
        thread: stalledThread('turn-1', 1),
      }),
    )
    await recoverySnapshotRequested
    await emit(
      makeEvent('timeline-buffered-stale-item', {
        kind: 'item.upsert',
        item: textTimelineItem(
          'buffered-stale-turn-1-agent',
          'turn-1',
          'Buffered stale terminal reply',
        ),
      }),
    )
    releaseRecoverySnapshot()

    await expect(
      page.locator('[data-codex-item-id="snapshot-turn-1-agent"]'),
    ).toBeVisible()
    await expect(
      page.locator('[data-codex-item-id="live-turn-1-user"]'),
    ).toHaveCount(0)
    await expect(
      page.locator('[data-codex-item-id="live-turn-1-agent"]'),
    ).toHaveCount(0)
    await expect(
      page.locator('[data-codex-item-id="buffered-stale-turn-1-agent"]'),
    ).toHaveCount(0)
    await expect(
      page.getByText('Shared terminal reply', { exact: true }),
    ).toHaveCount(2)
    await expect(page.locator('[data-codex-item-id^="local-"]')).toHaveCount(0)
    await expect(
      page.getByText('Authoritative user request', { exact: true }),
    ).toHaveCount(1)

    await emit(
      makeEvent('timeline-active-item', {
        kind: 'item.upsert',
        item: textTimelineItem(
          'live-turn-3-agent',
          'turn-3',
          'Active live content',
        ),
      }),
    )
    await expect(
      page.locator('[data-codex-item-id="live-turn-3-agent"]'),
    ).toBeVisible()
    snapshotMode = 'paged'
    await emit(
      makeEvent('timeline-paged-stalled', {
        kind: 'thread.updated',
        thread: stalledThread('turn-3', 2),
      }),
    )
    await expect.poll(() => recoverySnapshotResponses).toBe(2)
    await expect(
      page.locator('[data-codex-item-id="snapshot-turn-1-agent"]'),
    ).toBeVisible()
    await expect(
      page.locator('[data-codex-item-id="snapshot-turn-2-agent"]'),
    ).toHaveCount(0)
    await expect(
      page.locator('[data-codex-item-id="live-turn-3-agent"]'),
    ).toBeVisible()
    await expect
      .poll(async () =>
        page
          .locator('[data-codex-item-id^="paged-"]')
          .evaluateAll((items) =>
            items.map((item) => item.getAttribute('data-codex-item-id')),
          ),
      )
      .toEqual([
        'paged-turn-1-tail',
        'paged-turn-2-agent',
        'paged-turn-3-agent',
      ])

    await emit(
      makeEvent('timeline-live-omitted-item', {
        kind: 'item.upsert',
        item: textTimelineItem(
          'live-omitted-turn-3-agent',
          'turn-3',
          'Realtime content retained when history is omitted',
        ),
      }),
    )
    await expect(
      page.locator('[data-codex-item-id="live-omitted-turn-3-agent"]'),
    ).toBeVisible()

    snapshotMode = 'omitted'
    await emit(
      makeEvent('timeline-omitted-stalled', {
        kind: 'thread.updated',
        thread: stalledThread('turn-3', 3),
      }),
    )
    await expect.poll(() => recoverySnapshotResponses).toBe(3)
    await expect(page.getByText('部分历史不可用')).toBeVisible()
    await expect(
      page.locator('[data-codex-item-id="live-omitted-turn-3-agent"]'),
    ).toBeVisible()
  })
})

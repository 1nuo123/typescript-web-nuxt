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
    let failNextThreadList = false
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
          return fulfill({ items: [thread], next_cursor: null })
        }
      }
      if (url.pathname === '/codex/hosts/host-1/threads/thread-1') {
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

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1024, height: 900 },
      { width: 430, height: 900 },
      { width: 390, height: 844 },
      { width: 360, height: 800 },
    ]) {
      await page.setViewportSize(viewport)
      await expect(
        page.getByRole('heading', { name: '执行审计会话' }),
      ).toBeVisible()
      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }))
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
      await page.screenshot({
        path: testInfo.outputPath(`codex-${viewport.width}.png`),
      })
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
    await page.screenshot({ path: testInfo.outputPath('file-diff.png') })

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

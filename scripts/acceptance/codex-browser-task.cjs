const { chromium, expect } = require('@playwright/test')
const fs = require('node:fs')
const baseUrl = process.env.CODEX_ACCEPTANCE_ORIGIN
const output = process.env.CODEX_ACCEPTANCE_OUTPUT
const hostId = process.env.CODEX_ACCEPTANCE_HOST_ID
const timeoutSeconds = Number(
  process.env.CODEX_ACCEPTANCE_TIMEOUT_SECONDS || 720,
)
if (!baseUrl || new URL(baseUrl).hostname !== '127.0.0.1' || !output || !hostId)
  throw Error('Use the isolated browser-task acceptance entry point.')
if (
  !Number.isFinite(timeoutSeconds) ||
  timeoutSeconds < 120 ||
  timeoutSeconds > 1800
)
  throw Error('Acceptance timeout must be between 120 and 1800 seconds.')
;(async () => {
  const browser = await chromium.launch({ headless: true })
  // Only this isolated context trusts the fixture's ephemeral localhost TLS cert.
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 },
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  const report = {
    passed: false,
    checks: [],
    thread_id: null,
    stage: 'login',
    turns: [],
    approvals: [],
    commands: [],
    event_counts: {},
    websocket: { opened: 0, closed: 0, ready: 0 },
    timeout_seconds: timeoutSeconds,
  }
  const turns = new Map()
  const items = new Map()
  const approvals = new Map()
  const seenEvents = new Set()
  const errors = []
  report.operation_details = []
  report.execution_preferences = []
  page.on('response', async (response) => {
    const path = new URL(response.url()).pathname
    if (response.request().method() !== 'GET' || !response.ok()) return
    try {
      if (/\/codex\/hosts\/[^/]+\/operations\/[^/]+$/.test(path)) {
        const data = (await response.json()).data
        report.operation_details.push({
          operation_id: data.operation_id,
          command_id: data.command_id,
          status: data.status,
          error_code: data.error_code,
        })
      } else if (/\/workspaces\/[^/]+\/preferences$/.test(path)) {
        const data = (await response.json()).data.effective_preferences
        report.execution_preferences.push({
          model: data.model,
          reasoning_effort: data.reasoning_effort,
          sandbox_mode: data.sandbox_mode,
          approval_policy: data.approval_policy,
          requested: data.requested,
        })
      } else if (path.endsWith('/codex/hosts')) {
        const host = (await response.json()).data.items.find(
          (item) => item.host_id === hostId,
        )
        report.model_catalog = host?.capabilities?.model_catalog
      }
    } catch {
      /* Optional metadata diagnostics do not replace functional assertions. */
    }
  })
  let sequence = 0
  let deadlineTimer
  const persist = () =>
    fs.writeFileSync(output, JSON.stringify(report, null, 2))
  const check = (name, evidence) => {
    report.checks.push({ name, passed: true, ...evidence })
    persist()
  }
  const setStage = (stage) => {
    report.stage = stage
    persist()
  }
  const inspectEvent = (event) => {
    for (const child of event.events || event.detail?.events || [])
      inspectEvent(child)
    const detail = event.detail || {}
    if (detail.kind === 'connection.ready') report.websocket.ready++
    const threadId =
      event.header?.thread_id ||
      detail.thread_id ||
      detail.turn?.thread_id ||
      detail.item?.header?.thread_id ||
      detail.approval?.thread_id
    if (!report.thread_id || threadId !== report.thread_id) return
    const eventId = event.header?.event_id
    if (eventId && seenEvents.has(eventId)) return
    if (eventId) seenEvents.add(eventId)
    sequence++
    report.event_counts[detail.kind] =
      (report.event_counts[detail.kind] || 0) + 1
    const turnId =
      detail.turn?.turn_id ||
      detail.turn_id ||
      detail.item?.header?.turn_id ||
      event.header?.turn_id
    if (turnId && !turns.has(turnId))
      turns.set(turnId, {
        turn_id: turnId,
        delta_count: 0,
        delta_characters: 0,
      })
    const turn = turns.get(turnId)
    if (detail.kind === 'item.delta' && turn && detail.delta?.length) {
      turn.delta_count++
      turn.delta_characters += detail.delta.length
      turn.first_delta_sequence ??= sequence
      // Observe the real rendered message on the next browser frame; never inject UI/events.
      void page
        .evaluate(async (itemId) => {
          await new Promise((resolve) => requestAnimationFrame(resolve))
          const row = [
            ...document.querySelectorAll('[data-codex-item-id]'),
          ].find((node) => node.getAttribute('data-codex-item-id') === itemId)
          const body = row?.querySelector('.codex-markdown')
          const viewport = row?.closest('[aria-label="会话时间线"]')
          if (!body || !viewport) return 0
          const box = body.getBoundingClientRect()
          const bounds = viewport.getBoundingClientRect()
          return box.bottom > bounds.top && box.top < bounds.bottom
            ? body.textContent.trim().length
            : 0
        }, detail.item_id)
        .then((characters) => {
          if (characters > 0 && !turn.status) {
            turn.visible_streaming_samples =
              (turn.visible_streaming_samples || 0) + 1
            turn.visible_streaming_characters = characters
          }
        })
        .catch(() => undefined)
    }
    if (detail.kind === 'turn.started' && turn) turn.started_sequence = sequence
    if (
      ['turn.completed', 'turn.failed', 'turn.interrupted'].includes(
        detail.kind,
      ) &&
      turn
    ) {
      turn.status = detail.turn.status
      turn.terminal_event = detail.kind
      turn.terminal_sequence = sequence
    }
    if (detail.kind === 'item.upsert')
      items.set(detail.item.header.item_id, detail.item)
    if (detail.approval)
      approvals.set(detail.approval.approval_id, detail.approval)
  }
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('websocket', (socket) => {
    report.websocket.opened++
    socket.on('close', () => report.websocket.closed++)
    socket.on('framereceived', (frame) => {
      try {
        inspectEvent(JSON.parse(frame.payload))
      } catch {
        /* Non-JSON transport frames are not evidence. */
      }
    })
  })
  const composer = page.getByLabel('发送给 Codex', { exact: true })
  const threadResponse = (response) => {
    const pathname = new URL(response.url()).pathname
    return (
      response.request().method() === 'GET' &&
      pathname.endsWith(`/codex/hosts/${hostId}/threads/${report.thread_id}`)
    )
  }
  const submit = async (name, prompt) => {
    await expect(composer).toBeEnabled({ timeout: 30000 })
    await composer.fill(prompt)
    const previous = new Set(turns.keys())
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith(
          `/threads/${report.thread_id}/turns`,
        ),
    )
    await page.getByRole('button', { name: '发送', exact: true }).click()
    const response = await responsePromise
    if (!response.ok())
      throw Error(`${name}: turn submission HTTP ${response.status()}`)
    const accepted = (await response.json()).data
    if (!accepted?.operation_id)
      throw Error(`${name}: missing accepted operation ID`)
    await expect
      .poll(
        () =>
          [...turns.values()].find(
            (turn) => !previous.has(turn.turn_id) && turn.started_sequence,
          )?.turn_id,
        { timeout: 60000 },
      )
      .toBeTruthy()
    const turn = [...turns.values()].find(
      (item) => !previous.has(item.turn_id) && item.started_sequence,
    )
    turn.name = name
    turn.operation_id = accepted.operation_id
    turn.http_status = response.status()
    report.turns.push(turn)
    persist()
    return turn
  }
  const terminal = async (turn, expected = 'completed') => {
    await expect.poll(() => turn.status, { timeout: 150000 }).toBe(expected)
    await expect(composer).toBeEnabled({ timeout: 30000 })
    persist()
  }
  const pendingApproval = (turn) =>
    [...approvals.values()].find(
      (approval) =>
        approval.turn_id === turn.turn_id && approval.state === 'pending',
    )
  const grant = async (turn, commandMarker) => {
    await expect
      .poll(() => pendingApproval(turn)?.approval_id || turn.status, {
        timeout: 150000,
      })
      .toBeTruthy()
    const approval = pendingApproval(turn)
    if (!approval)
      throw Error(
        `${turn.name}: turn ${turn.turn_id} ended ${turn.status} without the required command approval.`,
      )
    if (
      approval.approval_kind !== 'command' ||
      !approval.display_summary.command?.includes(commandMarker) ||
      !approval.display_summary.allowed_actions.includes('accept')
    )
      throw Error(
        'Approval does not match this isolated harmless command probe.',
      )
    await page.getByRole('button', { name: '查看审批', exact: true }).click()
    const card = page
      .locator('article')
      .filter({ hasText: commandMarker })
      .filter({
        has: page.getByRole('button', { name: /^(验证并允许|允许一次)$/ }),
      })
    await expect(card).toHaveCount(1)
    await page.screenshot({
      path: output.replace(
        /\.json$/,
        `-approval-${report.approvals.length + 1}.png`,
      ),
    })
    const decisionResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith(
          `/approvals/${approval.approval_id}/decision`,
        ),
    )
    await card.getByRole('button', { name: /^(验证并允许|允许一次)$/ }).click()
    if (approval.risk_level === 'high') {
      const verification = page.getByRole('dialog', {
        name: '增强验证',
        exact: true,
      })
      await verification.getByLabel('账号密码', { exact: true }).fill('admin')
      await verification
        .getByRole('button', { name: '确认', exact: true })
        .click()
    }
    const response = await decisionResponse
    if (!response.ok())
      throw Error(`Approval decision HTTP ${response.status()}`)
    await expect
      .poll(() => approvals.get(approval.approval_id)?.state, {
        timeout: 60000,
      })
      .toBe('applied')
    report.approvals.push({
      approval_id: approval.approval_id,
      turn_id: turn.turn_id,
      kind: approval.approval_kind,
      state: 'applied',
      risk_level: approval.risk_level,
      http_status: response.status(),
    })
    persist()
    // Approval UI may return automatically after the final pending request.
    const panel = page.getByRole('complementary', { name: '会话上下文' })
    if (await panel.isVisible())
      await panel
        .getByRole('button', { name: '关闭上下文', exact: true })
        .click()
    const back = page.getByRole('link', { name: '返回会话', exact: true })
    if (await back.isVisible()) await back.click()
  }
  const commandFor = (turn, marker) =>
    [...items.values()].find(
      (item) =>
        item.header.turn_id === turn.turn_id &&
        item.detail.kind === 'command' &&
        item.detail.command.includes(marker),
    )
  const assertHistory = async (snapshot, expectedTurns) => {
    if (snapshot?.thread?.upstream_thread_id !== report.thread_id)
      throw Error('HTTP history returned a different thread.')
    const ids = snapshot.turns.map((turn) => turn.turn_id)
    if (new Set(ids).size !== ids.length)
      throw Error('HTTP history has duplicate turns.')
    for (const expected of expectedTurns) {
      const actual = snapshot.turns.find(
        (turn) => turn.turn_id === expected.turn_id,
      )
      if (!actual || actual.status !== expected.status)
        throw Error(`HTTP history disagrees for ${expected.name}.`)
    }
    const itemIds = snapshot.items.map((item) => item.header.item_id)
    if (new Set(itemIds).size !== itemIds.length)
      throw Error('HTTP history has duplicate items.')
    const command = snapshot.items.find(
      (item) => item.header.item_id === report.commands[0].item_id,
    )
    if (
      !command ||
      !command.detail.output.includes('BROWSER_COMMAND_OK') ||
      command.detail.exit_code !== 0
    )
      throw Error('HTTP history lost command output or exit code.')
    report.history = {
      turn_count: ids.length,
      item_count: itemIds.length,
      turn_ids: ids,
      history_status: snapshot.history_status,
    }
  }

  const run = async () => {
    await page.goto(baseUrl + '/login?redirect=/codex/tasks')
    await page.getByLabel('用户名', { exact: true }).fill('admin')
    await page.getByLabel('密码', { exact: true }).fill('admin')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.waitForURL((url) => url.pathname === '/codex/tasks')
    if (process.env.CODEX_ACCEPTANCE_ACTIVATION_ONLY === 'true') {
      setStage('activate connected inactive host through settings')
      await page.getByRole('link', { name: '设置', exact: true }).click()
      const card = page.locator('article')
      await expect(card).toHaveCount(1)
      await expect(
        card.getByText('已连接，执行未就绪', { exact: true }),
      ).toBeVisible()
      const activated = page.waitForResponse(
        (response) =>
          response.request().method() === 'PUT' &&
          new URL(response.url()).pathname.endsWith('/codex/active-host'),
      )
      await card
        .getByRole('button', { name: '使用这台电脑', exact: true })
        .click()
      const response = await activated
      if (!response.ok()) throw Error(`Activation HTTP ${response.status()}`)
      await page.waitForURL(/\/codex\/tasks(?:\?|$)/, { timeout: 60000 })
      await expect(
        page.getByRole('button', { name: 'Acceptance', exact: true }),
      ).toBeVisible({ timeout: 60000 })
      await page
        .getByRole('button', { name: 'Acceptance', exact: true })
        .click()
      await expect(
        page.getByRole('heading', { name: 'Acceptance', exact: true }),
      ).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
      await page.getByRole('link', { name: '设置', exact: true }).click()
      await expect(
        page
          .locator('article')
          .getByRole('button', { name: '进入工作台', exact: true }),
      ).toBeVisible({ timeout: 60000 })
      await card
        .getByRole('button', { name: '重命名电脑', exact: true })
        .click()
      const rename = page.getByRole('dialog', {
        name: '重命名电脑',
        exact: true,
      })
      await rename
        .getByLabel('电脑名称', { exact: true })
        .fill('Acceptance connected host')
      await rename.getByRole('button', { name: '保存', exact: true }).click()
      await expect(rename).not.toBeVisible()
      await expect(
        card.getByText('Acceptance connected host', { exact: true }),
      ).toBeVisible()
      await expect(page.getByText(/1 台已连接/)).toBeVisible()
      check(
        'rename reloads authoritative live host projection without losing connection',
        { host_id: hostId },
      )
      await page.setViewportSize({ width: 390, height: 844 })
      await page.screenshot({
        path: output.replace(/\.json$/, '.png'),
        fullPage: true,
      })
      if (errors.length) throw Error(errors.join('\n'))
      check(
        'settings button activates single preselected host through real API and reaches workspace',
        { host_id: hostId },
      )
      report.passed = true
      report.stage = 'complete'
      return
    }
    setStage('select isolated host and workspace')
    const navigation = page.getByRole('complementary', {
      name: 'Codex 项目导航',
      exact: true,
    })
    await navigation.getByRole('combobox').selectOption(hostId)
    await page.getByRole('button', { name: 'Acceptance', exact: true }).click()
    await page.getByRole('button', { name: '新建会话', exact: true }).click()
    await page.waitForURL(/\/codex\/tasks\/[^/?]+/, { timeout: 60000 })
    report.thread_id = decodeURIComponent(
      new URL(page.url()).pathname.split('/').pop(),
    )
    const taskUrl = page.url()
    persist()
    setStage('isolated workspace execution settings')
    await page.getByRole('link', { name: '运行设置', exact: true }).click()
    await page
      .getByRole('combobox', { name: /^访问模式/ })
      .selectOption('restricted')
    await page
      .getByRole('button', { name: '保存运行设置', exact: true })
      .click()
    await expect(
      page.getByText('运行设置已由本机确认，将在下一轮使用。', { exact: true }),
    ).toBeVisible()
    await page.goto(taskUrl)

    setStage('send and real streaming delta')
    const streamed = await submit(
      'streaming',
      'This is a UI streaming acceptance. Do not use tools or access files/network. Reply with BROWSER_STREAM_OK followed by sixty numbered short sentences describing a quiet garden. Finish with BROWSER_STREAM_END.',
    )
    await expect
      .poll(() => streamed.visible_streaming_samples || 0, { timeout: 150000 })
      .toBeGreaterThan(0)
    await terminal(streamed)
    if (
      !streamed.delta_count ||
      streamed.first_delta_sequence >= streamed.terminal_sequence
    )
      throw Error('No real nonempty item.delta before terminal event.')
    await expect(
      page
        .locator('.codex-conversation article')
        .filter({ has: page.getByText('Codex', { exact: true }) })
        .filter({ hasText: 'BROWSER_STREAM_END' }),
    ).toBeVisible()
    check('UI submission accepted with operation and real turn IDs', {
      turn_id: streamed.turn_id,
      operation_id: streamed.operation_id,
    })
    check('real streaming delta precedes terminal and renders in UI', {
      delta_count: streamed.delta_count,
      delta_characters: streamed.delta_characters,
      visible_streaming_samples: streamed.visible_streaming_samples,
    })

    setStage('real command approval and output')
    const approved = await submit(
      'command_approval',
      "Invoke the PowerShell shell tool exactly once with exactly [Console]::WriteLine('BROWSER_COMMAND_OK') using its normal sandbox settings. Do not request permission escalation. This command only writes the marker to standard output; do not read/write files, access network, or run any other command. The current untrusted policy will request command approval; invoke the tool now rather than asking a text question. If denied, stop. After the command completes, reply BROWSER_COMMAND_DONE.",
    )
    await grant(approved, 'BROWSER_COMMAND_OK')
    await terminal(approved)
    const command = commandFor(approved, 'BROWSER_COMMAND_OK')
    if (
      !command ||
      command.header.status !== 'completed' ||
      command.detail.exit_code !== 0 ||
      !command.detail.output.includes('BROWSER_COMMAND_OK')
    )
      throw Error('Real command result is missing output/completed/exit 0.')
    report.commands.push({
      turn_id: approved.turn_id,
      item_id: command.header.item_id,
      exit_code: 0,
      output_marker: 'BROWSER_COMMAND_OK',
    })
    await page.getByLabel('会话时间线', { exact: true }).press('End')
    const commandUi = page.locator(
      `.codex-conversation [data-command-id="${command.header.item_id}"]`,
    )
    await commandUi.locator('summary').click()
    await expect(
      commandUi.getByLabel('命令输出', { exact: true }),
    ).toContainText('BROWSER_COMMAND_OK')
    await expect(commandUi.locator('summary')).toContainText('退出码 0')
    await page.screenshot({ path: output.replace(/\.json$/, '-command.png') })
    check('real command output and exit code agree with rendered terminal', {
      item_id: command.header.item_id,
    })
    check('real pending approval decided through UI and confirmed applied', {
      approval_id: report.approvals[0].approval_id,
    })

    setStage('interrupt running command')
    const interrupted = await submit(
      'interruption',
      'Run exactly Start-Sleep -Seconds 90 in PowerShell once. Do not read/write files or access network. Start the tool now; the UI will interrupt it. Do not simulate waiting with text.',
    )
    await expect
      .poll(
        () =>
          pendingApproval(interrupted)
            ? 'approval'
            : commandFor(interrupted, 'Start-Sleep')?.header.status,
        { timeout: 150000 },
      )
      .toMatch(/approval|streaming/)
    if (pendingApproval(interrupted)) await grant(interrupted, 'Start-Sleep')
    await expect
      .poll(() => commandFor(interrupted, 'Start-Sleep')?.header.status, {
        timeout: 60000,
      })
      .toBe('streaming')
    const interruptResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.includes(
          `/threads/${report.thread_id}/`,
        ) &&
        new URL(response.url()).pathname.endsWith('/interrupt'),
    )
    await page.getByRole('button', { name: '中断', exact: true }).click()
    const interrupt = await interruptResponse
    if (!interrupt.ok()) throw Error(`Interrupt HTTP ${interrupt.status()}`)
    await terminal(interrupted, 'interrupted')
    if (interrupted.terminal_event !== 'turn.interrupted')
      throw Error('Missing real turn.interrupted event.')
    check(
      'UI interrupts a genuinely running command and receives interrupted terminal',
      { turn_id: interrupted.turn_id, http_status: interrupt.status() },
    )

    setStage('native websocket disconnect and reconnect')
    const draft = 'BROWSER_DRAFT_SURVIVES_RECONNECT'
    await composer.fill(draft)
    const before = { ...report.websocket }
    await context.setOffline(true)
    await expect(page.getByText(/浏览器网络已断开/)).toBeVisible()
    await expect(composer).toBeDisabled()
    await expect(composer).toHaveValue(draft)
    await expect
      .poll(() => report.websocket.closed, { timeout: 30000 })
      .toBeGreaterThan(before.closed)
    await page.screenshot({ path: output.replace(/\.json$/, '-offline.png') })
    await context.setOffline(false)
    await expect
      .poll(() => report.websocket.ready, { timeout: 60000 })
      .toBeGreaterThan(before.ready)
    await expect(composer).toBeEnabled({ timeout: 60000 })
    await expect(composer).toHaveValue(draft)
    report.reconnection = {
      before,
      after: { ...report.websocket },
      draft_preserved: true,
    }
    await composer.fill('')
    const recovered = await submit(
      'after_reconnect',
      'Reply exactly BROWSER_RECONNECTED_OK. Do not use tools or access files/network.',
    )
    await terminal(recovered)
    await expect(
      page
        .locator('.codex-conversation article')
        .filter({ has: page.getByText('Codex', { exact: true }) })
        .filter({ hasText: 'BROWSER_RECONNECTED_OK' }),
    ).toBeVisible()
    check(
      'native WSS reconnect preserves draft and a new UI turn succeeds without reload',
      { ready_before: before.ready, ready_after: report.websocket.ready },
    )

    setStage('final authoritative history and mobile UI')
    const finalHistory = page.waitForResponse(threadResponse)
    await page.reload()
    const finalResponse = await finalHistory
    if (!finalResponse.ok())
      throw Error(`Final history HTTP ${finalResponse.status()}`)
    await assertHistory((await finalResponse.json()).data, report.turns)
    await expect(composer).toBeEnabled({ timeout: 60000 })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(composer).toBeVisible()
    const box = await composer.boundingBox()
    if (!box || box.x < 0 || box.x + box.width > 391)
      throw Error('Mobile composer overflow')
    await page.screenshot({
      path: output.replace(/\.json$/, '.png'),
      fullPage: true,
    })
    if (errors.length) throw Error(errors.join('\n'))
    report.passed = true
    report.stage = 'complete'
  }
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => {
        deadlineTimer = setTimeout(
          () =>
            reject(
              Error(`Overall browser deadline ${timeoutSeconds}s exceeded`),
            ),
          timeoutSeconds * 1000,
        )
      }),
    ])
  } catch (error) {
    report.error = String(error)
      .replace(/([?&](?:ticket|token|access_token)=)[^\s&]+/gi, '$1[redacted]')
      .slice(0, 3000)
    await context.setOffline(false).catch(() => undefined)
    await page
      .screenshot({
        path: output.replace(/\.json$/, '-failure.png'),
        fullPage: true,
      })
      .catch(() => undefined)
  } finally {
    clearTimeout(deadlineTimer)
    report.page_errors = errors
    persist()
    await browser.close()
  }
  if (!report.passed) process.exitCode = 1
})().catch((error) => {
  console.error(String(error))
  process.exitCode = 1
})

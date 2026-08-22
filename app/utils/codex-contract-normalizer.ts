import {
  CodexApprovalDecision,
  CodexApprovalKind,
  CodexApprovalRiskLevel,
  CodexApprovalState,
  type CodexApproval,
  type CodexApprovalBase,
  type CodexApprovalCommandAction,
  type CodexApprovalFileChange,
} from '../types/codex-approval'
import {
  CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
  CodexDiffChangeKind,
  CodexDiffLineKind,
  CodexTimelineItemKind,
  CodexTimelineItemStatus,
  type CodexDiffFile,
  type CodexDiffHunk,
  type CodexDiffLine,
  type CodexDiffSnapshot,
  type CodexPlanStep,
  type CodexTimelineItem,
  type CodexTimelineItemHeader,
} from '../types/codex-item'

export class CodexProductContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CodexProductContractError'
  }
}

const EPOCH_TIMESTAMP = '1970-01-01T00:00:00.000Z'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null

/** 只接受后端收窄后的 UUID v4，非法上游标识不得参与乐观消息对账。 */
const readClientOperationId = (value: unknown): string | null => {
  const candidate = readString(value)
  if (
    !candidate ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      candidate,
    )
  ) {
    return null
  }
  return candidate
}

const requireString = (value: unknown, path: string): string => {
  const candidate = readString(value)
  if (candidate === null) {
    throw new CodexProductContractError(`${path} must be a non-empty string.`)
  }
  return candidate
}

const requireText = (value: unknown, path: string): string => {
  if (typeof value !== 'string') {
    throw new CodexProductContractError(`${path} must be a string.`)
  }
  return value
}

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []

const normalizeApprovalDecisions = (value: unknown): CodexApprovalDecision[] =>
  readStringArray(value).filter((item): item is CodexApprovalDecision =>
    Object.values(CodexApprovalDecision).includes(
      item as CodexApprovalDecision,
    ),
  )

const readNullableNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const readBoolean = (value: unknown): boolean => value === true

const enumValue = <TValue extends string>(
  value: unknown,
  values: readonly TValue[],
  fallback: TValue,
): TValue => (values.includes(value as TValue) ? (value as TValue) : fallback)

const normalizeCommandActions = (
  value: unknown,
): CodexApprovalCommandAction[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const command = readString(item.command)
    const actionType = readString(item.action_type)
    if (!command || !actionType) return []
    return [
      {
        action_type: actionType,
        command,
        path: readString(item.path),
        name: readString(item.name),
        query: readString(item.query),
      },
    ]
  })
}

const normalizeFileChanges = (value: unknown): CodexApprovalFileChange[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const path = readString(item.path)
    if (!path) return []
    return [
      {
        path,
        change_kind: readString(item.change_kind) ?? 'modified',
        added_lines: readNullableNumber(item.added_lines),
        deleted_lines: readNullableNumber(item.deleted_lines),
        sensitive: readBoolean(item.sensitive),
      },
    ]
  })
}

export const normalizeCodexApproval = (value: unknown): CodexApproval => {
  if (!isRecord(value)) {
    throw new CodexProductContractError('approval must be an object.')
  }
  const summary = isRecord(value.display_summary) ? value.display_summary : {}
  const riskLevel = enumValue(
    value.risk_level ?? summary.risk_level,
    Object.values(CodexApprovalRiskLevel),
    CodexApprovalRiskLevel.Normal,
  )
  const updatedAt =
    readString(value.updated_at) ??
    readString(value.created_at) ??
    readString(value.expires_at) ??
    EPOCH_TIMESTAMP
  const createdAt = readString(value.created_at) ?? updatedAt
  const approvalKind = enumValue(
    value.approval_kind,
    Object.values(CodexApprovalKind),
    CodexApprovalKind.Command,
  )
  const allowedActions = normalizeApprovalDecisions(summary.allowed_actions)

  const approvalBase: Omit<
    CodexApprovalBase,
    'approval_kind' | 'display_summary'
  > = {
    approval_id: requireString(value.approval_id, 'approval.approval_id'),
    owner_subject_id: readString(value.owner_subject_id) ?? '',
    host_id: requireString(value.host_id, 'approval.host_id'),
    workspace_id: readString(value.workspace_id),
    thread_id: requireString(value.thread_id, 'approval.thread_id'),
    turn_id: readString(value.turn_id),
    item_id: readString(value.item_id),
    risk_level: riskLevel,
    payload_digest: readString(value.payload_digest) ?? '',
    state: enumValue(
      value.state,
      Object.values(CodexApprovalState),
      CodexApprovalState.Pending,
    ),
    version:
      typeof value.version === 'number' && value.version >= 1
        ? value.version
        : 1,
    expires_at: readString(value.expires_at),
    decided_by: readString(value.decided_by),
    decision: normalizeApprovalDecisions([value.decision])[0] ?? null,
    decided_at: readString(value.decided_at),
    applied_at: readString(value.applied_at),
    created_at: createdAt,
    updated_at: updatedAt,
  }
  const summaryBase = {
    title: readString(summary.title) ?? undefined,
    reason: readString(summary.reason) ?? undefined,
    workspace_name: readString(summary.workspace_name),
    risk_level: riskLevel,
    risk_reason: readString(summary.risk_reason),
    // 未由 Agent 明确通告的动作绝不能由客户端猜测或补全。
    allowed_actions: allowedActions,
  }

  switch (approvalKind) {
    case CodexApprovalKind.FileChange:
      return {
        ...approvalBase,
        approval_kind: CodexApprovalKind.FileChange,
        display_summary: {
          ...summaryBase,
          file_scope: readStringArray(summary.file_scope),
          file_changes: normalizeFileChanges(summary.file_changes),
        },
      }
    case CodexApprovalKind.Permissions:
      return {
        ...approvalBase,
        approval_kind: CodexApprovalKind.Permissions,
        display_summary: {
          ...summaryBase,
          permission_names: readStringArray(summary.permission_names),
          network_requested: readBoolean(summary.network_requested),
          extra_root_requested: readBoolean(summary.extra_root_requested),
        },
      }
    case CodexApprovalKind.Command:
      return {
        ...approvalBase,
        approval_kind: CodexApprovalKind.Command,
        display_summary: {
          ...summaryBase,
          command_summary: readString(summary.command_summary),
          command: readString(summary.command),
          command_actions: normalizeCommandActions(summary.command_actions),
          working_directory: readString(summary.working_directory),
          read_only: readBoolean(summary.read_only),
        },
      }
  }
}

const normalizeDiffLine = (value: unknown, path: string): CodexDiffLine => {
  if (!isRecord(value)) {
    throw new CodexProductContractError(`${path} must be an object.`)
  }
  return {
    kind: enumValue(
      value.kind,
      Object.values(CodexDiffLineKind),
      CodexDiffLineKind.Context,
    ),
    content: typeof value.content === 'string' ? value.content : '',
    old_line_number: readNullableNumber(value.old_line_number),
    new_line_number: readNullableNumber(value.new_line_number),
  }
}

const normalizeDiffHunk = (value: unknown, path: string): CodexDiffHunk => {
  if (!isRecord(value) || !Array.isArray(value.lines)) {
    throw new CodexProductContractError(`${path}.lines must be an array.`)
  }
  return {
    header: requireString(value.header, `${path}.header`),
    old_start: readNullableNumber(value.old_start) ?? 0,
    new_start: readNullableNumber(value.new_start) ?? 0,
    lines: value.lines.map((line, index) =>
      normalizeDiffLine(line, `${path}.lines[${index}]`),
    ),
  }
}

const normalizeDiffFile = (value: unknown, path: string): CodexDiffFile => {
  if (!isRecord(value) || !Array.isArray(value.hunks)) {
    throw new CodexProductContractError(`${path}.hunks must be an array.`)
  }
  return {
    path: requireString(value.path, `${path}.path`),
    old_path: readString(value.old_path),
    change_kind: enumValue(
      value.change_kind,
      Object.values(CodexDiffChangeKind),
      CodexDiffChangeKind.Modified,
    ),
    binary: readBoolean(value.binary),
    large: readBoolean(value.large),
    truncated: readBoolean(value.truncated),
    hunks: value.hunks.map((hunk, index) =>
      normalizeDiffHunk(hunk, `${path}.hunks[${index}]`),
    ),
  }
}

export const normalizeCodexDiff = (
  value: unknown,
  path = 'diff',
): CodexDiffSnapshot => {
  if (!isRecord(value) || !Array.isArray(value.files)) {
    throw new CodexProductContractError(`${path}.files must be an array.`)
  }
  return {
    files: value.files.map((file, index) =>
      normalizeDiffFile(file, `${path}.files[${index}]`),
    ),
    total_characters: readNullableNumber(value.total_characters) ?? 0,
    truncated: readBoolean(value.truncated),
  }
}

const normalizePlanSteps = (value: unknown, path: string): CodexPlanStep[] => {
  if (!Array.isArray(value)) {
    throw new CodexProductContractError(`${path} must be an array.`)
  }
  return value.map((step, index) => {
    if (!isRecord(step)) {
      throw new CodexProductContractError(
        `${path}[${index}] must be an object.`,
      )
    }
    return {
      step: requireString(step.step, `${path}[${index}].step`),
      status: enumValue(
        step.status,
        ['pending', 'in_progress', 'completed'] as const,
        'pending',
      ),
    }
  })
}

export const normalizeCodexTimelineItem = (
  value: unknown,
  path = 'item',
): CodexTimelineItem => {
  if (!isRecord(value)) {
    throw new CodexProductContractError(`${path} must be an object.`)
  }
  if (!isRecord(value.header) || !isRecord(value.detail)) {
    throw new CodexProductContractError(
      `${path} must contain header and detail.`,
    )
  }
  const headerSchemaVersion = requireString(
    value.header.schema_version,
    `${path}.header.schema_version`,
  )
  const header: CodexTimelineItemHeader = {
    item_id: requireString(value.header.item_id, `${path}.header.item_id`),
    thread_id: requireString(
      value.header.thread_id,
      `${path}.header.thread_id`,
    ),
    turn_id: readString(value.header.turn_id),
    detail_kind: enumValue(
      value.header.detail_kind,
      Object.values(CodexTimelineItemKind),
      CodexTimelineItemKind.Notice,
    ),
    schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
    status: enumValue(
      value.header.status,
      Object.values(CodexTimelineItemStatus),
      CodexTimelineItemStatus.Completed,
    ),
    created_at: readString(value.header.created_at),
    client_operation_id: readClientOperationId(
      value.header.client_operation_id,
    ),
  }
  const detail = value.detail
  const kind = enumValue(
    detail.kind,
    Object.values(CodexTimelineItemKind),
    CodexTimelineItemKind.Notice,
  )
  const detailSchemaVersion = requireString(
    detail.schema_version,
    `${path}.detail.schema_version`,
  )
  if (
    headerSchemaVersion !== CODEX_TIMELINE_ITEM_SCHEMA_VERSION ||
    detailSchemaVersion !== CODEX_TIMELINE_ITEM_SCHEMA_VERSION
  ) {
    throw new CodexProductContractError(
      `${path} schema version is incompatible.`,
    )
  }
  if (header.detail_kind !== kind) {
    throw new CodexProductContractError(
      `${path} header and detail kind differ.`,
    )
  }
  if (
    kind === CodexTimelineItemKind.UserMessage ||
    kind === CodexTimelineItemKind.AgentMessage
  ) {
    return {
      header: { ...header, detail_kind: kind },
      detail: {
        kind,
        schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
        text: requireText(detail.text, `${path}.detail.text`),
      },
    }
  }
  if (kind === CodexTimelineItemKind.Notice) {
    return {
      header: { ...header, detail_kind: kind },
      detail: {
        kind,
        schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
        label: requireString(detail.label, `${path}.detail.label`),
        text: requireText(detail.text, `${path}.detail.text`),
      },
    }
  }
  if (kind === CodexTimelineItemKind.ContextCompaction) {
    if (detail.label !== '上下文已压缩') {
      throw new CodexProductContractError(
        `${path}.detail.label must be the frozen product label.`,
      )
    }
    return {
      header: { ...header, detail_kind: kind },
      detail: {
        kind,
        schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
        label: detail.label,
      },
    }
  }
  if (kind === CodexTimelineItemKind.Plan) {
    return {
      header: { ...header, detail_kind: kind },
      detail: {
        kind,
        schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
        explanation:
          typeof detail.explanation === 'string' ? detail.explanation : '',
        steps: normalizePlanSteps(detail.steps, `${path}.detail.steps`),
      },
    }
  }
  if (kind === CodexTimelineItemKind.Command) {
    return {
      header: { ...header, detail_kind: kind },
      detail: {
        kind,
        schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
        command: typeof detail.command === 'string' ? detail.command : '',
        output: typeof detail.output === 'string' ? detail.output : '',
        exit_code: readNullableNumber(detail.exit_code),
      },
    }
  }
  if (kind === CodexTimelineItemKind.Approval) {
    return {
      header: { ...header, detail_kind: kind },
      detail: {
        kind,
        schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
        approval_id: requireString(
          detail.approval_id,
          `${path}.detail.approval_id`,
        ),
        approval_kind: requireString(
          detail.approval_kind,
          `${path}.detail.approval_kind`,
        ),
        risk_level: requireString(
          detail.risk_level,
          `${path}.detail.risk_level`,
        ),
        state: requireString(detail.state, `${path}.detail.state`),
        version: readNullableNumber(detail.version) ?? 1,
        summary: requireString(detail.summary, `${path}.detail.summary`),
      },
    }
  }
  return {
    header: { ...header, detail_kind: CodexTimelineItemKind.Diff },
    detail: {
      kind: CodexTimelineItemKind.Diff,
      schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
      diff: normalizeCodexDiff(detail.diff, `${path}.detail.diff`),
    },
  }
}

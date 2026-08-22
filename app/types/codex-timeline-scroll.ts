/** 时间线滚动控制器的显式状态，测量行为不能自行改变此状态。 */
export enum CodexTimelineScrollState {
  Following = 'following',
  Detached = 'detached',
  Restoring = 'restoring',
}

/** detached 状态下用于动态高度和 prepend 恢复的阅读锚点。 */
export interface CodexTimelineScrollAnchor {
  itemId: string
  offset: number
}

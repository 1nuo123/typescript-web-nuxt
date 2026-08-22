/** 客户端性能诊断默认采样率，必须与服务端运行时默认值保持一致。 */
export const CLIENT_DIAGNOSTIC_PERFORMANCE_SAMPLE_RATE = 0.1

const MAXIMUM_UINT32 = 0xffffffff

/**
 * 按会话稳定选择性能诊断样本。
 *
 * 此函数不保存会话标识也不发送数据；调用方只能把匿名会话键留在内存，并在显式开关
 * 开启后才据此产生性能诊断。相同键始终得到相同结果，避免刷新期间改变采样归属。
 */
export const isClientDiagnosticPerformanceSampled = (
  sessionKey: string,
  sampleRate = CLIENT_DIAGNOSTIC_PERFORMANCE_SAMPLE_RATE,
): boolean => {
  if (!sessionKey || sampleRate <= 0) return false
  if (sampleRate >= 1) return true

  let hash = 2166136261
  for (let index = 0; index < sessionKey.length; index += 1) {
    hash ^= sessionKey.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / MAXIMUM_UINT32 < sampleRate
}

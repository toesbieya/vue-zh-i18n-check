/**
 * vue-zh-i18n-check 编程 API 出口
 */

export { resolveConfig, DEFAULT_CONFIG } from './config.js'
export { zhCheck } from './checker/zh-check.js'
export { langKeyCheck } from './checker/lang-key-check.js'
export { dupKeyCheck, detectDuplicateKeys } from './checker/dup-key-check.js'

import { zhCheck } from './checker/zh-check.js'
import { langKeyCheck } from './checker/lang-key-check.js'
import { dupKeyCheck } from './checker/dup-key-check.js'

/**
 * 依次执行 lang-key-check 和 zh-check，任一未通过或抛异常则整体失败
 * @param {string | string[]} scanTargets 源码扫描目标（相对项目根）
 * @param {object} [options] 配置覆盖项（见 resolveConfig）
 * @returns {{ success: boolean }} 检测结果
 */
export function checkAll(scanTargets, options = {}) {
  /**
   * 执行单个检测并在异常时返回失败
   * @param {() => { success: boolean }} checker 检测函数
   * @returns {{ success: boolean }} 检测结果
   */
  const runCheck = (checker) => {
    try {
      return checker()
    }
    catch (error) {
      console.error(error)
      return { success: false }
    }
  }

  const langResult = runCheck(() => langKeyCheck(scanTargets, options))
  const zhResult = runCheck(() => zhCheck(scanTargets, options))

  return { success: langResult.success && zhResult.success }
}

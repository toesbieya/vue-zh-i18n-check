/**
 * 测试共享工具：fixture 路径与独立输出目录
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** fixture 根目录 */
export const FIXTURES_ROOT = path.join(__dirname, 'fixtures')

/** 仓库根目录（作为检测的默认项目根） */
export const REPO_ROOT = path.resolve(__dirname, '..')

/**
 * 获取指定用例的 fixture 目录路径
 * @param {string} caseDir 用例目录名（相对于 FIXTURES_ROOT）
 * @returns {string} fixture 目录绝对路径
 */
export function fixturePath(caseDir) {
  return path.join(FIXTURES_ROOT, caseDir)
}

/**
 * 创建独立的报告输出目录（避免用例间相互覆盖）
 * @returns {string} 输出目录绝对路径
 */
export function createOutputDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vue-zh-i18n-check-'))
}

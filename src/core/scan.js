/**
 * 文件遍历与扫描目标解析
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * 将路径分隔符统一为 POSIX 风格
 * @param {string} filePath 文件路径
 * @returns {string} POSIX 风格路径
 */
export function toPosix(filePath) {
  return filePath.split(path.sep).join('/')
}

/**
 * 获取语言包目录下的所有语言标识
 * @param {string} langRoot 语言包根目录
 * @returns {string[]} 语言标识列表
 */
export function getLanguages(langRoot) {
  return fs.readdirSync(langRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
}

/**
 * 递归获取目录下所有 json 文件路径
 * @param {string} dir 目录路径
 * @returns {string[]} json 文件路径列表
 */
export function getJsonFiles(dir) {
  const result = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...getJsonFiles(fullPath))
      continue
    }
    if (path.extname(fullPath) === '.json') {
      result.push(fullPath)
    }
  }
  return result
}

/**
 * 递归遍历目录，返回所有文件路径
 * @param {string} dir 目录路径
 * @param {(fullPath: string) => boolean} [shouldExclude] 判断指定完整路径是否应跳过的回调
 * @param {Set<string>} [allowedExtensions] 允许扫描的文件扩展名列表
 * @returns {string[]} 文件路径列表
 */
function walk(dir, shouldExclude, allowedExtensions) {
  const result = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (shouldExclude && shouldExclude(fullPath)) continue
    if (entry.isDirectory()) {
      result.push(...walk(fullPath, shouldExclude, allowedExtensions))
      continue
    }
    if (!entry.isFile()) continue
    if (allowedExtensions && !allowedExtensions.has(path.extname(fullPath))) continue
    result.push(fullPath)
  }
  return result
}

/**
 * 解析扫描目标，返回需要去重排序的文件列表
 * @param {string | string[]} scanTarget 扫描目标（目录、文件或数组）
 * @param {{ root: string, shouldExclude?: (fullPath: string) => boolean, extensions?: Set<string> }} options 解析配置
 * @returns {string[]} 文件绝对路径列表
 */
export function resolveScanFiles(scanTarget, options) {
  const { root, shouldExclude, extensions } = options
  const targets = Array.isArray(scanTarget) ? scanTarget : [scanTarget]
  const fileSet = new Set()

  for (const target of targets) {
    const absPath = path.resolve(root, target)
    if (!fs.existsSync(absPath)) {
      console.warn(`扫描目标不存在: ${absPath}`)
      continue
    }

    const stat = fs.statSync(absPath)
    if (stat.isDirectory()) {
      for (const file of walk(absPath, shouldExclude, extensions)) {
        fileSet.add(file)
      }
      continue
    }

    if (stat.isFile()) {
      if (shouldExclude && shouldExclude(absPath)) continue
      if (extensions && !extensions.has(path.extname(absPath))) continue
      fileSet.add(absPath)
      continue
    }

    console.warn(`扫描目标既不是文件也不是目录: ${absPath}`)
  }

  return Array.from(fileSet).sort()
}

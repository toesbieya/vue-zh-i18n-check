/**
 * gitignore 语义的文件/目录忽略器
 * 自动叠加项目根 .gitignore，支持配置追加忽略文件与内联模式（均为 gitignore 语法）。
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import ignore from 'ignore'
import { toPosix } from './scan.js'

/**
 * 创建排除判断函数：项目根 .gitignore + 配置忽略文件 + 配置内联模式
 * @param {string} root 项目根目录
 * @param {{ ignore?: string[], ignoreFiles?: string[] }} [options] 忽略配置
 * @param {string[]} [options.ignore] gitignore 语法的内联忽略模式（相对项目根）
 * @param {string[]} [options.ignoreFiles] 额外忽略文件路径（相对项目根，语法同 .gitignore）
 * @returns {(fullPath: string) => boolean} 判断指定完整路径是否应跳过
 */
export function createShouldExclude(root, options = {}) {
  const ig = ignore()

  const gitignorePath = path.resolve(root, '.gitignore')
  if (fs.existsSync(gitignorePath)) {
    ig.add(fs.readFileSync(gitignorePath, 'utf-8'))
  }

  for (const file of options.ignoreFiles ?? []) {
    const filePath = path.resolve(root, file)
    if (fs.existsSync(filePath)) {
      ig.add(fs.readFileSync(filePath, 'utf-8'))
    }
  }

  if (options.ignore?.length) {
    ig.add(options.ignore)
  }

  return (fullPath) => {
    const rel = toPosix(path.relative(root, fullPath))
    if (!rel || rel.startsWith('..')) return false
    // 目录路径补尾部斜杠，以匹配 .gitignore 中仅针对目录的规则（如 /cypress/videos/）
    return ig.ignores(rel) || ig.ignores(`${rel}/`)
  }
}

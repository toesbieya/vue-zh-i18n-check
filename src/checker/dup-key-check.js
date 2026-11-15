/**
 * 语言包重复 key 检测
 * 扫描语言包目录下的语言包，检测同一 JSON 文件内重复定义的顶层 key。
 * JSON.parse 遇到同名 key 不会报错，而是让后者的值静默覆盖前者，容易造成翻译丢失且难以察觉。
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { resolveConfig } from '../config.js'
import { getJsonFiles, getLanguages, toPosix } from '../core/scan.js'

/** 匹配 json 中的顶层 key 行（2 空格缩进） */
const TOP_LEVEL_KEY_LINE_REGEX = /^ {2}"((?:[^"\\]|\\.)*)":/

/**
 * 检测语言包中重复定义的顶层 key
 * @param {string} langRoot 语言包根目录
 * @param {string[]} languages 语言标识列表
 * @returns {Array<{ lang: string, file: string, key: string, lines: number[] }>} 重复 key 列表
 */
export function detectDuplicateKeys(langRoot, languages) {
  const duplicates = []

  for (const lang of languages) {
    for (const file of getJsonFiles(path.join(langRoot, lang))) {
      const rel = toPosix(path.relative(langRoot, file))
      /** @type {Map<string, number[]>} key 与其出现的行号列表 */
      const keyLines = new Map()
      const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/)

      lines.forEach((line, index) => {
        const match = line.match(TOP_LEVEL_KEY_LINE_REGEX)
        if (!match) return
        const key = match[1]
        if (!keyLines.has(key)) {
          keyLines.set(key, [])
        }
        keyLines.get(key).push(index + 1)
      })

      for (const [key, lineNumbers] of keyLines) {
        if (lineNumbers.length > 1) {
          duplicates.push({ lang, file: rel, key, lines: lineNumbers })
        }
      }
    }
  }

  return duplicates.sort((a, b) =>
    a.lang.localeCompare(b.lang) || a.file.localeCompare(b.file) || a.key.localeCompare(b.key)
  )
}

/**
 * 语言包重复 key 检测
 * @param {object} [options] 配置覆盖项（见 resolveConfig）
 * @returns {{ success: boolean, duplicates: Array<{ lang: string, file: string, key: string, lines: number[] }> }} 检测结果
 */
export function dupKeyCheck(options = {}) {
  const config = resolveConfig(options)
  const startTime = performance.now()
  console.log('[dup-key-check] 开始检测...')

  const langRoot = path.resolve(config.root, config.langRoot)
  if (!fs.existsSync(langRoot)) {
    console.error(`语言包目录不存在: ${langRoot}`)
    return { success: false, duplicates: [] }
  }

  const languages = getLanguages(langRoot)
  if (languages.length === 0) {
    console.error('未找到任何语言包目录')
    return { success: false, duplicates: [] }
  }

  const duplicates = detectDuplicateKeys(langRoot, languages)

  console.log(`语言包: ${languages.join(', ')}`)
  console.log(`重复key: ${duplicates.length} 处`)

  for (const item of duplicates) {
    console.error(`  ${item.file} :: ${item.key}（第 ${item.lines.join('、')} 行）`)
  }

  console.log(`耗时: ${(performance.now() - startTime).toFixed(2)}ms`)

  return { success: duplicates.length === 0, duplicates }
}

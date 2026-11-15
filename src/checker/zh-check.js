/**
 * 硬编码中文检测
 * AST 文件（.ts/.tsx/.js/.jsx/.vue）提取字符串字面量与模板文本检测；
 * 原始文件（.json/.html）与 .vue style 块走文本屏蔽管线检测。
 * 排除范围：注释、ignoreFns 配置函数的首个字符串参数（默认 $t / t / $pure / $i18nKey）、
 * console.*(...) 调用、%% 包裹的内容、TS 类型位置、throw Error 中的中文参数。
 * 输出：Markdown 表格。
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { resolveConfig } from '../config.js'
import { extractFromFile, isAstFile } from '../core/ast.js'
import { createShouldExclude } from '../core/ignore.js'
import { maskRawContent } from '../core/raw-mask.js'
import { resolveScanFiles, toPosix } from '../core/scan.js'

/** 中文检测正则 */
const CHINESE_REGEX = /[一-龥]/
/** 连续中文提取正则 */
const CHINESE_RUN_REGEX = /[一-龥]+/g
/** %...% 包裹内容（如 %page.首页%）过滤正则 */
const PERCENT_WRAPPED_REGEX = /%[^%\r\n]+%/g

/**
 * 从文本中提取连续中文片段（先过滤 %...% 包裹内容）
 * @param {string} text 原始文本
 * @returns {string[]} 中文片段列表
 */
function extractChineseRuns(text) {
  const filtered = text.replace(PERCENT_WRAPPED_REGEX, ' ')
  return filtered.match(CHINESE_RUN_REGEX) ?? []
}

/**
 * 从文本中提取连续中文片段并连接
 * @param {string} text 原始文本
 * @returns {string} 中文片段（空格连接），无中文返回空串
 */
function extractChinese(text) {
  return extractChineseRuns(text).join(' ')
}

/**
 * 原始文本管线检测：按行提取中文
 * @param {string} content 原始内容
 * @param {string[]} ignoreFns 需屏蔽首个字符串参数的函数名列表
 * @param {number} lineOffset 行号偏移（用于 .vue style 块）
 * @returns {Array<{ line: number, zh: string }>} 检测结果（行号为内容内 1 起始 + 偏移）
 */
function scanRaw(content, ignoreFns, lineOffset) {
  const masked = maskRawContent(content, ignoreFns)
  const rows = []
  masked.split(/\r?\n/).forEach((line, index) => {
    if (!CHINESE_REGEX.test(line)) return
    const zh = extractChinese(line)
    if (zh) rows.push({ line: index + 1 + lineOffset, zh })
  })
  return rows
}

/**
 * 生成 Markdown 表格内容
 * @param {Map<string, Array<{file: string, line: number, zh: string}>>} groupedRows 按相对项目根目录的目录结构分组的扫描结果
 * @returns {string} Markdown 文本
 */
function generateMarkdown(groupedRows) {
  let md = '# 硬编码中文统计\n\n'
  let hasProblem = false
  const sortedGroups = Array.from(groupedRows.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  for (const [group, rows] of sortedGroups) {
    if (rows.length === 0) continue
    hasProblem = true
    md += `## ${group}\n\n`
    md += '| 文件名 | 行数 | 硬编码中文 |\n'
    md += '| --- | --- | --- |\n'
    for (const row of rows) {
      md += `| ${row.file} | ${row.line} | ${row.zh} |\n`
    }
    md += '\n'
  }
  if (!hasProblem) {
    md += '未发现硬编码中文\n'
  }
  return md
}

/**
 * 硬编码中文检测
 * @param {string | string[]} scanTargets 源码扫描目标，支持目录、文件路径或两者的数组（相对项目根）
 * @param {object} [options] 配置覆盖项（见 resolveConfig）
 * @returns {{ success: boolean, outputFile: string }} 检测结果与报告文件路径
 */
export function zhCheck(scanTargets, options = {}) {
  const config = resolveConfig(options)
  const startTime = performance.now()
  console.log('[zh-check] 开始检测...')
  const outputFile = path.resolve(config.root, config.outputDir, 'zh-check-res.md')

  const shouldExclude = createShouldExclude(config.root, config)
  const files = resolveScanFiles(scanTargets, {
    root: config.root,
    shouldExclude,
    extensions: config.extensions
  })

  const groupedRows = new Map()

  for (const file of files) {
    const relFile = toPosix(path.relative(config.root, file))
    const segments = relFile.split('/')
    let group
    if (segments.length === 1) {
      group = '(root)'
    }
    else if (segments.length === 2) {
      group = segments[0]
    }
    else {
      group = segments[1]
    }
    if (!groupedRows.has(group)) {
      groupedRows.set(group, [])
    }

    const content = fs.readFileSync(file, 'utf-8')
    /** @type {Array<{ line: number, zh: string }>} */
    let rows

    if (isAstFile(file)) {
      const { candidates, rawSegments } = extractFromFile(file, content, {
        ignoreFns: config.zh.ignoreFns,
        tFns: []
      })
      // 同一物理行的多个候选（如模板字符串头尾段）合并为一行报告
      const runsByLine = new Map()
      for (const candidate of candidates) {
        const runs = extractChineseRuns(candidate.text)
        if (runs.length === 0) continue
        if (!runsByLine.has(candidate.line)) runsByLine.set(candidate.line, [])
        runsByLine.get(candidate.line).push(...runs)
      }
      rows = Array.from(runsByLine.entries())
        .map(([line, runs]) => ({ line, zh: runs.join(' ') }))
        .sort((a, b) => a.line - b.line)
      for (const segment of rawSegments) {
        rows.push(...scanRaw(segment.content, config.zh.ignoreFns, segment.startLine - 1))
      }
      rows.sort((a, b) => a.line - b.line)
    }
    else {
      rows = scanRaw(content, config.zh.ignoreFns, 0)
    }

    for (const row of rows) {
      groupedRows.get(group).push({ file: relFile, ...row })
    }
  }

  fs.mkdirSync(path.dirname(outputFile), { recursive: true })
  fs.writeFileSync(outputFile, generateMarkdown(groupedRows), 'utf-8')
  const totalRows = Array.from(groupedRows.values()).reduce((sum, rows) => sum + rows.length, 0)
  console.log(`扫描完成：${files.length} 个文件，发现 ${totalRows} 处硬编码中文`)
  console.log(`结果已保存：${outputFile}`)
  console.log(`耗时: ${(performance.now() - startTime).toFixed(2)}ms`)

  return { success: totalRows === 0, outputFile }
}

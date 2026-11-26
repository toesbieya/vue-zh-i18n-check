/**
 * 国际化 key 完整性检测
 * 扫描语言包目录，比较各语言缺失的 json 文件和 key；
 * 扫描语言包中重复定义的顶层 key（同名 key 会静默覆盖，属于阻塞性问题）；
 * 扫描源码中的翻译函数调用（默认 $t / t，可通过 lang.tFns 配置），检查 key 是否存在于语言包总 key 集合中；
 * 校验语言包中的 key 合法性（默认不允许特殊字符，可通过 lang.validateKey 自定义；
 * 由 json 文件路径拼接出的命名空间段不参与校验，只校验 JSON 内部的 key 段；
 * 源码中的 key 不重复校验——非法 key 要么已随语言包报出，要么按缺失 key 报出）。
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { resolveConfig } from '../config.js'
import { extractFromFile, isAstFile } from '../core/ast.js'
import { createShouldExclude } from '../core/ignore.js'
import { getJsonFiles, getLanguages, resolveScanFiles, toPosix } from '../core/scan.js'
import { detectDuplicateKeys } from './dup-key-check.js'

/**
 * 根据 json 文件路径推导命名空间前缀
 * @param {string} filePath json 文件完整路径
 * @param {string} langDir 当前语言目录完整路径
 * @returns {string} 命名空间前缀，如 views.system.lang
 */
function getNamespace(filePath, langDir) {
  const rel = path.relative(langDir, filePath)
  const withoutExt = rel.slice(0, -path.extname(rel).length)
  return withoutExt.split(path.sep).join('.')
}

/**
 * 扁平化 JSON 对象，生成点分 key 集合
 * @param {Record<string, unknown>} obj JSON 对象
 * @param {string} [prefix] 前缀
 * @returns {Set<string>} 扁平化后的 key 集合
 */
function flattenKeys(obj, prefix = '') {
  const keys = new Set()
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      for (const childKey of flattenKeys(value, fullKey)) {
        keys.add(childKey)
      }
      continue
    }
    keys.add(fullKey)
  }
  return keys
}

/**
 * 收集单个语言包的所有 key
 * @param {string} langDir 语言目录完整路径
 * @returns {{ files: string[], keys: Set<string>, namespaces: Set<string> }} json 文件列表、key 集合与命名空间前缀集合（由文件路径推导）
 */
function collectLanguage(langDir) {
  const files = getJsonFiles(langDir).sort()
  const keys = new Set()
  const namespaces = new Set()

  for (const file of files) {
    const ns = getNamespace(file, langDir)
    namespaces.add(ns)
    const content = JSON.parse(fs.readFileSync(file, 'utf-8'))
    for (const key of flattenKeys(content, ns)) {
      keys.add(key)
    }
  }

  return { files, keys, namespaces }
}

/**
 * 检测各语言缺失的 json 文件
 * @param {Record<string, { files: string[], keys: Set<string> }>} languageData 语言数据
 * @param {string} langRoot 语言包根目录
 * @param {string[]} languages 语言标识列表
 * @returns {Array<{ lang: string, file: string }>} 缺失文件列表
 */
function detectMissingFiles(languageData, langRoot, languages) {
  const missing = []

  for (const lang of languages) {
    const langDir = path.join(langRoot, lang)
    const thisRelFiles = new Set(
      languageData[lang].files.map(f => toPosix(path.relative(langDir, f)))
    )
    const otherRelFiles = new Set()
    for (const otherLang of languages) {
      if (otherLang === lang) continue
      const otherDir = path.join(langRoot, otherLang)
      for (const f of languageData[otherLang].files) {
        otherRelFiles.add(toPosix(path.relative(otherDir, f)))
      }
    }

    for (const file of otherRelFiles) {
      if (thisRelFiles.has(file)) continue
      missing.push({ lang, file })
    }
  }

  return missing.sort((a, b) => a.lang.localeCompare(b.lang) || a.file.localeCompare(b.file))
}

/**
 * 检测各语言缺失的 key
 * 若某个 key 所在命名空间对应的 JSON 文件已缺失，则不再列出该 key
 * @param {Record<string, { files: string[], keys: Set<string> }>} languageData 语言数据
 * @param {Set<string>} allKeys 总 key 集合
 * @param {string[]} languages 语言标识列表
 * @param {Array<{ lang: string, file: string }>} missingFiles 缺失文件列表
 * @returns {Array<{ lang: string, key: string }>} 缺失 key 列表
 */
function detectMissingKeys(languageData, allKeys, languages, missingFiles) {
  const missingNamespacesByLang = new Map()
  for (const { lang, file } of missingFiles) {
    if (!missingNamespacesByLang.has(lang)) {
      missingNamespacesByLang.set(lang, new Set())
    }
    const ns = file.slice(0, -5).split('/').join('.')
    missingNamespacesByLang.get(lang).add(ns)
  }

  const missing = []
  for (const lang of languages) {
    const namespaces = missingNamespacesByLang.get(lang) || new Set()
    for (const key of allKeys) {
      if (languageData[lang].keys.has(key)) continue
      let isInMissingFile = false
      for (const ns of namespaces) {
        if (key === ns || key.startsWith(`${ns}.`)) {
          isInMissingFile = true
          break
        }
      }
      if (isInMissingFile) continue
      missing.push({ lang, key })
    }
  }
  return missing.sort((a, b) => a.lang.localeCompare(b.lang) || a.key.localeCompare(b.key))
}

/**
 * 扫描源码中的翻译函数调用
 * @param {string[]} files 待扫描的源文件绝对路径列表
 * @param {Set<string>} allKeys 总 key 集合
 * @param {{ root: string, tFns: string[], ignoreFns: string[], i18nComponents: Array<{ tag: string, keyProp: string }> }} options 扫描配置
 * @returns {{ missingKeys: Array<{ file: string, line: number, key: string }>, dynamicCalls: Array<{ file: string, line: number, raw: string }>, usedKeys: Set<string>, scannedFiles: number }} 扫描结果
 */
function scanSourceFiles(files, allKeys, options) {
  const missingKeys = []
  const dynamicCalls = []
  const usedKeys = new Set()

  for (const file of files) {
    if (!isAstFile(file)) continue
    const content = fs.readFileSync(file, 'utf-8')
    const { calls } = extractFromFile(file, content, {
      ignoreFns: options.ignoreFns,
      tFns: options.tFns,
      i18nComponents: options.i18nComponents
    })
    const relFile = toPosix(path.relative(options.root, file))

    for (const call of calls) {
      if (call.firstArg.kind === 'empty') continue
      if (call.firstArg.kind === 'literal') {
        usedKeys.add(call.firstArg.value)
        if (allKeys.has(call.firstArg.value)) continue
        missingKeys.push({ file: relFile, line: call.line, key: call.firstArg.value })
        continue
      }
      dynamicCalls.push({ file: relFile, line: call.line, raw: call.firstArg.raw })
    }
  }

  return { missingKeys, dynamicCalls, usedKeys, scannedFiles: files.length }
}

/**
 * 校验扁平化 key 的合法性
 * 先剥离由 json 文件路径拼接出的命名空间前缀（文件名可能含中划线等字符，不属于 key 本身），
 * 仅对 JSON 内部的 key 段按点分段逐段校验
 * @param {string} key 扁平化 key
 * @param {(segment: string) => boolean} validateKey 单段校验函数
 * @param {Set<string>} namespaces 命名空间前缀集合
 * @returns {boolean} 是否合法
 */
function isValidKey(key, validateKey, namespaces) {
  const segments = key.split('.')
  let startIndex = 0
  // 从长到短匹配命名空间前缀，命中即跳过这些段
  for (let i = segments.length - 1; i > 0; i--) {
    if (namespaces.has(segments.slice(0, i).join('.'))) {
      startIndex = i
      break
    }
  }
  return segments.slice(startIndex).every(validateKey)
}

/**
 * 检测各语言包中非法的 key
 * @param {Record<string, { files: string[], keys: Set<string>, namespaces: Set<string> }>} languageData 语言数据
 * @param {string[]} languages 语言标识列表
 * @param {(segment: string) => boolean} validateKey 单段校验函数
 * @param {Set<string>} namespaces 命名空间前缀集合（校验时剥离，不参与合法性判断）
 * @returns {Array<{ lang: string, key: string }>} 非法 key 列表
 */
function detectInvalidLangKeys(languageData, languages, validateKey, namespaces) {
  const invalid = []
  for (const lang of languages) {
    for (const key of languageData[lang].keys) {
      if (isValidKey(key, validateKey, namespaces)) continue
      invalid.push({ lang, key })
    }
  }
  return invalid.sort((a, b) => a.lang.localeCompare(b.lang) || a.key.localeCompare(b.key))
}

/**
 * 检测语言包中存在但源码中未使用的 key
 * @param {Set<string>} allKeys 总 key 集合
 * @param {Set<string>} usedKeys 源码中使用的 key 集合
 * @returns {string[]} 未使用的 key 列表（已排序）
 */
function detectUnusedKeys(allKeys, usedKeys) {
  const unused = []
  for (const key of allKeys) {
    if (usedKeys.has(key)) continue
    unused.push(key)
  }
  return unused.sort()
}

/**
 * 生成 Markdown 检测报告
 * @param {{ languages: string[], languageData: Record<string, { files: string[], keys: Set<string> }>, allKeys: Set<string>, missingFiles: Array<{ lang: string, file: string }>, missingKeys: Array<{ lang: string, key: string }>, duplicateKeys: Array<{ lang: string, file: string, key: string, lines: number[] }>, invalidLangKeys: Array<{ lang: string, key: string }>, sourceResults: { missingKeys: Array<{ file: string, line: number, key: string }>, dynamicCalls: Array<{ file: string, line: number, raw: string }>, scannedFiles: number }, unusedKeys: string[] }} params 报告参数
 * @returns {string} Markdown 文本
 */
function generateReport({ languages, languageData, allKeys, missingFiles, missingKeys, duplicateKeys, invalidLangKeys, sourceResults, unusedKeys }) {
  let md = '# 国际化 Key 检测报表\n\n'

  md += '## 语言包摘要\n\n'
  md += '| 语言 | JSON 文件数 | Key 数量 |\n'
  md += '| --- | --- | --- |\n'
  for (const lang of languages) {
    md += `| ${lang} | ${languageData[lang].files.length} | ${languageData[lang].keys.size} |\n`
  }
  md += `| **并集** | - | **${allKeys.size}** |\n\n`

  if (missingFiles.length > 0) {
    md += '## 缺失的 JSON 文件\n\n'
    md += '| 语言 | 缺失文件 |\n'
    md += '| --- | --- |\n'
    for (const item of missingFiles) {
      md += `| ${item.lang} | ${item.file} |\n`
    }
    md += '\n'
  }

  if (duplicateKeys.length > 0) {
    md += '## 语言包中重复的 Key\n\n'
    md += '| 语言 | 文件 | Key | 行号 |\n'
    md += '| --- | --- | --- | --- |\n'
    for (const item of duplicateKeys) {
      md += `| ${item.lang} | ${item.file} | ${item.key} | ${item.lines.join(', ')} |\n`
    }
    md += '\n'
  }

  if (missingKeys.length > 0) {
    md += '## 语言包缺失的 Key\n\n'
    md += '| 语言 | 缺失 Key |\n'
    md += '| --- | --- |\n'
    for (const item of missingKeys) {
      md += `| ${item.lang} | ${item.key} |\n`
    }
    md += '\n'
  }

  if (invalidLangKeys.length > 0) {
    md += '## 语言包中非法的 Key\n\n'
    md += '| 语言 | 非法 Key |\n'
    md += '| --- | --- |\n'
    for (const item of invalidLangKeys) {
      md += `| ${item.lang} | ${item.key} |\n`
    }
    md += '\n'
  }

  if (sourceResults.missingKeys.length > 0) {
    md += '## 源码中缺失的 Key\n\n'
    md += '| 文件 | 行号 | Key |\n'
    md += '| --- | --- | --- |\n'
    for (const item of sourceResults.missingKeys) {
      md += `| ${item.file} | ${item.line} | ${item.key} |\n`
    }
    md += '\n'
  }

  if (sourceResults.dynamicCalls.length > 0) {
    md += '## 无法静态检查的 $t / t 调用\n\n'
    md += '| 文件 | 行号 | 第一个参数 |\n'
    md += '| --- | --- | --- |\n'
    for (const item of sourceResults.dynamicCalls) {
      md += `| ${item.file} | ${item.line} | \`${item.raw}\` |\n`
    }
    md += '\n'
  }

  if (unusedKeys.length > 0) {
    md += '## 语言包中未使用的 Key\n\n'
    md += '| Key |\n'
    md += '| --- |\n'
    for (const key of unusedKeys) {
      md += `| ${key} |\n`
    }
    md += '\n'
  }

  const hasAnyIssue = missingFiles.length > 0 || missingKeys.length > 0 || duplicateKeys.length > 0 || invalidLangKeys.length > 0 || sourceResults.missingKeys.length > 0 || sourceResults.dynamicCalls.length > 0
  if (!hasAnyIssue) {
    md += '未发现国际化 Key 问题。\n\n'
  }

  return md
}

/**
 * 国际化 key 完整性检测
 * @param {string | string[]} scanTargets 源码扫描目标，支持目录、文件路径或两者的数组（相对项目根）
 * @param {object} [options] 配置覆盖项（见 resolveConfig）
 * @returns {{ success: boolean, outputFile: string }} 检测结果与报告文件路径
 */
export function langKeyCheck(scanTargets, options = {}) {
  const config = resolveConfig(options)
  const startTime = performance.now()
  console.log('[lang-key-check] 开始检测...')
  const langRoot = path.resolve(config.root, config.langRoot)
  const outputFile = path.resolve(config.root, config.outputDir, 'i18n-check-res.md')

  const shouldExclude = createShouldExclude(config.root, config)
  const files = resolveScanFiles(scanTargets, {
    root: config.root,
    shouldExclude,
    extensions: config.extensions
  })

  if (!fs.existsSync(langRoot)) {
    console.error(`语言包目录不存在: ${langRoot}`)
    return { success: false, outputFile }
  }

  const languages = getLanguages(langRoot)
  if (languages.length === 0) {
    console.error('未找到任何语言包目录')
    return { success: false, outputFile }
  }

  /** @type {Record<string, { files: string[], keys: Set<string>, namespaces: Set<string> }>} */
  const languageData = {}
  for (const lang of languages) {
    languageData[lang] = collectLanguage(path.join(langRoot, lang))
  }

  const allKeys = new Set()
  const allNamespaces = new Set()
  for (const data of Object.values(languageData)) {
    for (const key of data.keys) {
      allKeys.add(key)
    }
    for (const ns of data.namespaces) {
      allNamespaces.add(ns)
    }
  }

  const validateKey = config.lang.validateKey || (() => true)

  const missingFiles = detectMissingFiles(languageData, langRoot, languages)
  const missingLangKeys = detectMissingKeys(languageData, allKeys, languages, missingFiles)
  const duplicateKeys = detectDuplicateKeys(langRoot, languages)
  const invalidLangKeys = detectInvalidLangKeys(languageData, languages, validateKey, allNamespaces)
  const sourceResults = scanSourceFiles(files, allKeys, {
    root: config.root,
    tFns: config.lang.tFns,
    ignoreFns: config.lang.ignoreFns,
    i18nComponents: config.i18nComponents
  })
  const unusedKeys = detectUnusedKeys(allKeys, sourceResults.usedKeys)

  const report = generateReport({
    languages,
    languageData,
    allKeys,
    missingFiles,
    missingKeys: missingLangKeys,
    duplicateKeys,
    invalidLangKeys,
    sourceResults,
    unusedKeys
  })

  fs.mkdirSync(path.dirname(outputFile), { recursive: true })
  fs.writeFileSync(outputFile, report, 'utf-8')

  const hasBlockingIssues = missingFiles.length > 0 || missingLangKeys.length > 0 || duplicateKeys.length > 0 || invalidLangKeys.length > 0 || sourceResults.missingKeys.length > 0

  console.log(`语言包: ${languages.join(', ')}`)
  console.log(`总key数: ${allKeys.size}`)
  console.log(`扫描源文件: ${sourceResults.scannedFiles} 个`)
  console.log(`缺失JSON文件: ${missingFiles.length} 处`)
  console.log(`语言包重复key: ${duplicateKeys.length} 处`)
  console.log(`语言包缺失key: ${missingLangKeys.length} 处`)
  console.log(`语言包非法key: ${invalidLangKeys.length} 处`)
  console.log(`源码缺失key: ${sourceResults.missingKeys.length} 处`)
  console.log(`无法静态检查: ${sourceResults.dynamicCalls.length} 处`)
  console.log(`语言包未使用key: ${unusedKeys.length} 处`)
  console.log(`报告已保存: ${outputFile}`)
  console.log(`耗时: ${(performance.now() - startTime).toFixed(2)}ms`)

  return { success: !hasBlockingIssues, outputFile }
}

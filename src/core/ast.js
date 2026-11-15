/**
 * AST 提取核心
 * 基于 typescript 与 @vue/compiler-sfc / @vue/compiler-dom 解析源文件，
 * 统一产出两类结果：
 * - candidates：需要检测硬编码中文的文本（字符串字面量、模板文本等），已排除
 *   注释、console.* 调用、ignoreFns 首个字符串参数、throw Error 参数与 TS 类型位置；
 * - calls：tFns 翻译函数调用（含 .vue 模板表达式），区分字面量 key 与动态参数。
 * .json / .html 文件与 .vue style 块不产出 AST 结果，由 raw-mask 管线处理。
 */

import * as ts from 'typescript'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse as parseTemplate, NodeTypes } from '@vue/compiler-dom'

/**
 * @typedef {{ line: number, text: string }} TextCandidate 待检测文本，line 为文件内 1 起始行号
 * @typedef {{ name: string, line: number, firstArg: { kind: 'literal', value: string } | { kind: 'dynamic', raw: string } | { kind: 'empty' } }} CallInfo 翻译函数调用信息
 * @typedef {{ content: string, startLine: number }} RawSegment 需走原始文本管线的片段（.vue style 块）
 * @typedef {{ candidates: TextCandidate[], calls: CallInfo[], rawSegments: RawSegment[] }} ExtractResult 提取结果
 */

/** 支持 AST 解析的扩展名（其余扩展名走原始文本管线） */
const AST_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue'])

/**
 * 判断文件是否走 AST 解析
 * @param {string} filePath 文件路径
 * @returns {boolean} 是否走 AST 解析
 */
export function isAstFile(filePath) {
  return AST_EXTENSIONS.has(filePath.slice(filePath.lastIndexOf('.')))
}

/**
 * 从源文件提取文本候选与翻译函数调用
 * @param {string} filePath 文件绝对路径
 * @param {string} content 文件内容
 * @param {{ ignoreFns: string[], tFns: string[] }} options 提取配置
 * @returns {ExtractResult} 提取结果；解析失败时返回空结果
 */
export function extractFromFile(filePath, content, options) {
  const ext = filePath.slice(filePath.lastIndexOf('.'))
  const ctx = {
    ignoreFns: new Set(options.ignoreFns),
    tFns: new Set(options.tFns),
    out: { candidates: [], calls: [], rawSegments: [] }
  }

  try {
    if (ext === '.vue') {
      extractFromVue(content, filePath, ctx)
    }
    else {
      extractFromTs(content, 1, scriptKindOf(ext), ctx)
    }
  }
  catch (error) {
    console.warn(`解析失败，已跳过: ${filePath}（${error.message}）`)
    return { candidates: [], calls: [], rawSegments: [] }
  }

  return ctx.out
}

/**
 * 由扩展名推导 ts ScriptKind
 * @param {string} ext 文件扩展名
 * @returns {ts.ScriptKind} 对应的 ScriptKind
 */
function scriptKindOf(ext) {
  if (ext === '.ts') return ts.ScriptKind.TS
  if (ext === '.tsx') return ts.ScriptKind.TSX
  if (ext === '.jsx') return ts.ScriptKind.JSX
  return ts.ScriptKind.JS
}

/**
 * 由 SFC 块的 lang 属性推导 ts ScriptKind
 * @param {string | undefined} lang script 块 lang 属性
 * @returns {ts.ScriptKind} 对应的 ScriptKind
 */
function scriptKindOfLang(lang) {
  if (lang === 'ts') return ts.ScriptKind.TS
  if (lang === 'tsx') return ts.ScriptKind.TSX
  if (lang === 'jsx') return ts.ScriptKind.JSX
  return ts.ScriptKind.JS
}

/**
 * 解析 .vue 文件：script / scriptSetup 走 ts，template 走 compiler-dom
 * @param {string} content 文件内容
 * @param {string} filePath 文件路径（仅用于解析器报错信息）
 * @param {{ ignoreFns: Set<string>, tFns: Set<string>, out: ExtractResult }} ctx 提取上下文
 */
function extractFromVue(content, filePath, ctx) {
  const { descriptor } = parseSfc(content, { filename: filePath })

  for (const block of [descriptor.script, descriptor.scriptSetup]) {
    if (!block) continue
    extractFromTs(block.content, block.loc.start.line, scriptKindOfLang(block.lang), ctx)
  }

  if (descriptor.template) {
    const baseLine = descriptor.template.loc.start.line
    try {
      const ast = parseTemplate(descriptor.template.content)
      walkTemplate(ast, baseLine, ctx)
    }
    catch (error) {
      console.warn(`模板解析失败，已跳过 template 块: ${filePath}（${error.message}）`)
    }
  }

  for (const style of descriptor.styles) {
    ctx.out.rawSegments.push({ content: style.content, startLine: style.loc.start.line })
  }
}

/**
 * 递归遍历模板 AST
 * @param {object} node 模板 AST 节点
 * @param {number} baseLine 模板内容首字符在文件内的行号（1 起始）
 * @param {{ out: ExtractResult }} ctx 提取上下文
 */
function walkTemplate(node, baseLine, ctx) {
  if (!node || typeof node !== 'object') return

  switch (node.type) {
    case NodeTypes.COMMENT:
      return
    case NodeTypes.TEXT:
      // 模板文本会经编译器压缩空白，按原始源码拆行才能保证行号准确
      pushCandidate(ctx.out, baseLine + node.loc.start.line - 1, node.loc.source, node.loc.source)
      return
    case NodeTypes.INTERPOLATION:
      walkTemplate(node.content, baseLine, ctx)
      return
    case NodeTypes.SIMPLE_EXPRESSION:
      extractFromTs(node.content, baseLine + node.loc.start.line - 1, ts.ScriptKind.TS, ctx)
      return
    case NodeTypes.ATTRIBUTE:
      walkTemplate(node.value, baseLine, ctx)
      return
    case NodeTypes.DIRECTIVE:
      walkTemplate(node.exp, baseLine, ctx)
      walkTemplate(node.arg, baseLine, ctx)
      return
  }

  for (const key of ['children', 'props', 'branches', 'source', 'content', 'value', 'exp']) {
    const child = node[key]
    if (Array.isArray(child)) {
      for (const item of child) walkTemplate(item, baseLine, ctx)
      continue
    }
    walkTemplate(child, baseLine, ctx)
  }
}

/** 中文检测正则 */
const CHINESE_REGEX = /[一-龥]/

/**
 * 记录字符串候选文本；中文仅来自 \uXXXX 等转义时跳过（与按源码文本检测的旧行为对齐）
 * 源码跨行时按物理行拆分，每行一个候选（保持按行报告的粒度）
 * @param {ExtractResult} out 提取结果
 * @param {number} line 起始行号
 * @param {string} text 解析后的文本
 * @param {string} raw 源码原文
 */
function pushCandidate(out, line, text, raw) {
  if (CHINESE_REGEX.test(text) && !CHINESE_REGEX.test(raw)) return
  if (!raw.includes('\n')) {
    out.candidates.push({ line, text })
    return
  }
  text.split(/\r?\n/).forEach((segment, index) => {
    out.candidates.push({ line: line + index, text: segment })
  })
}

/**
 * 解析一段 JS/TS 源码并遍历提取
 * @param {string} content 源码内容
 * @param {number} startLine 内容首字符在文件内的行号（1 起始）
 * @param {ts.ScriptKind} kind 源码类型
 * @param {{ ignoreFns: Set<string>, tFns: Set<string>, out: ExtractResult }} ctx 提取上下文
 */
function extractFromTs(content, startLine, kind, ctx) {
  const sourceFile = ts.createSourceFile('inline', content, ts.ScriptTarget.Latest, true, kind)

  /**
   * 计算节点在文件内的行号（1 起始）
   * @param {ts.Node} node AST 节点
   * @returns {number} 行号
   */
  const lineOf = (node) => startLine + ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile)).line

  /**
   * 遍历 AST 节点
   * @param {ts.Node} node AST 节点
   */
  const visit = (node) => {
    if (ts.isThrowStatement(node)) {
      visitThrow(node)
      return
    }

    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      if (isConsoleCall(node)) return

      const calleeName = getCalleeName(node.expression)
      if (calleeName && ctx.ignoreFns.has(calleeName)) {
        visitIgnoreFnCall(node)
        return
      }
      if (calleeName && ctx.tFns.has(calleeName) && ts.isCallExpression(node)) {
        recordCall(node, calleeName, sourceFile, lineOf, ctx.out)
      }
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      // 类型位置的字符串字面量（如 type Status = '在职' | '离职'）不属于硬编码
      if (node.parent && ts.isLiteralTypeNode(node.parent)) return
      pushCandidate(ctx.out, lineOf(node), node.text, node.getText(sourceFile))
      return
    }

    if (ts.isTemplateExpression(node)) {
      pushCandidate(ctx.out, lineOf(node), node.head.text, node.head.getText(sourceFile))
      for (const span of node.templateSpans) {
        visit(span.expression)
        pushCandidate(ctx.out, lineOf(span.literal), span.literal.text, span.literal.getText(sourceFile))
      }
      return
    }

    if (ts.isJsxText(node)) {
      pushCandidate(ctx.out, lineOf(node), node.getText(sourceFile), node.getText(sourceFile))
      return
    }

    ts.forEachChild(node, visit)
  }

  /**
   * 处理 throw 语句：throw Error / throw new Error 的首个字符串参数跳过
   * @param {ts.ThrowStatement} node throw 语句节点
   */
  const visitThrow = (node) => {
    const expr = node.expression
    const isErrorCall = expr
      && (ts.isNewExpression(expr) || ts.isCallExpression(expr))
      && ts.isIdentifier(expr.expression)
      && expr.expression.text === 'Error'
    if (!isErrorCall) {
      ts.forEachChild(node, visit)
      return
    }
    const [first, ...rest] = expr.arguments ?? []
    if (first && !isStringLike(first)) visit(first)
    rest.forEach(visit)
  }

  /**
   * 处理 ignoreFns 调用：首个字符串参数跳过，其余参数照常遍历
   * @param {ts.CallExpression | ts.NewExpression} node 调用节点
   */
  const visitIgnoreFnCall = (node) => {
    const [first, ...rest] = node.arguments ?? []
    if (first && !isStringLike(first)) visit(first)
    rest.forEach(visit)
  }

  ts.forEachChild(sourceFile, visit)
}

/**
 * 判断节点是否为字符串类字面量
 * @param {ts.Node} node AST 节点
 * @returns {boolean} 是否为字符串类字面量
 */
function isStringLike(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)
}

/**
 * 取调用表达式的函数名（标识符或属性访问的末段）
 * @param {ts.Expression} expr 被调用表达式
 * @returns {string | null} 函数名
 */
function getCalleeName(expr) {
  if (ts.isIdentifier(expr)) return expr.text
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text
  return null
}

/**
 * 判断是否为 console.* 调用
 * @param {ts.CallExpression | ts.NewExpression} node 调用节点
 * @returns {boolean} 是否为 console.* 调用
 */
function isConsoleCall(node) {
  const expr = node.expression
  return ts.isPropertyAccessExpression(expr)
    && ts.isIdentifier(expr.expression)
    && expr.expression.text === 'console'
}

/**
 * 记录翻译函数调用
 * @param {ts.CallExpression} node 调用节点
 * @param {string} calleeName 函数名
 * @param {ts.SourceFile} sourceFile 源文件
 * @param {(node: ts.Node) => number} lineOf 行号计算函数
 * @param {ExtractResult} out 提取结果
 */
function recordCall(node, calleeName, sourceFile, lineOf, out) {
  const line = lineOf(node)
  const first = node.arguments?.[0]
  if (!first) {
    out.calls.push({ name: calleeName, line, firstArg: { kind: 'empty' } })
    return
  }
  if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) {
    out.calls.push({ name: calleeName, line, firstArg: { kind: 'literal', value: first.text } })
    return
  }
  out.calls.push({ name: calleeName, line, firstArg: { kind: 'dynamic', raw: first.getText(sourceFile).trim() } })
}

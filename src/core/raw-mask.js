/**
 * 原始文本屏蔽管线
 * 仅用于不走 AST 的文件类型（.json / .html）与 .vue 的 style 块：
 * 依次屏蔽 HTML 注释、JS 注释（字符串/正则感知）、ignoreFns 首个字符串参数、
 * console.*(...) 调用、%...% 包裹内容、TS 中文字符串联合类型、throw Error 中文参数。
 */

/** 正则起始判定时允许出现在 / 之前的有效字符集合 */
const REGEX_PREV_CHARS = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^'])

/**
 * 将匹配内容替换为空格，保留换行符以维持行号
 * @param {string} content 原始内容
 * @param {RegExp} regex 匹配正则
 * @returns {string} 替换后的内容
 */
export function maskWithSpaces(content, regex) {
  return content.replace(regex, (match) =>
    match.split('').map((c) => (c === '\n' || c === '\r' ? c : ' ')).join('')
  )
}

/**
 * 屏蔽各类注释（HTML 注释、JS 块注释、JS 行注释）
 * @param {string} content 原始内容
 * @returns {string} 处理后的内容
 */
export function maskComments(content) {
  let masked = maskWithSpaces(content, /<!--[\s\S]*?-->/g)
  masked = maskWithSpaces(masked, /\/\*[\s\S]*?\*\//g)
  masked = maskWithSpaces(masked, /\/\/[^\n]*/g)
  return masked
}

/**
 * 屏蔽 HTML 注释 <!-- -->，保留换行以维持行号
 * @param {string} content 原始内容
 * @returns {string} 处理后的内容
 */
export function maskHtmlComments(content) {
  return maskWithSpaces(content, /<!--[\s\S]*?-->/g)
}

/**
 * 判断上一有效字符语境下 / 是否应按正则字面量处理（否则视为除法）
 * @param {string} prev 上一有效字符（非空白），空串表示行首
 * @returns {boolean} 是否按正则处理
 */
function isRegexContext(prev) {
  return prev === '' || REGEX_PREV_CHARS.has(prev)
}

/**
 * 字符串/正则感知的 JS 注释屏蔽
 * 单遍状态机逐字符扫描，仅在注释状态把字符替换为空格（保留 \r \n 维持行号）。
 * 字符串、模板字符串、正则字面量内部的 // 与 /* 不会被误当作注释。
 * 已知限制：return /re/ 这类以标识符结尾后跟正则的写法会被当作除法（罕见且无害）。
 * @param {string} content 原始内容
 * @returns {string} 处理后的内容
 */
export function maskJsComments(content) {
  const out = content.split('')
  const len = content.length
  /** 当前状态：code 正常 / sq 单引号 / dq 双引号 / tpl 模板 / line 行注释 / block 块注释 / regex 正则 */
  let state = 'code'
  /** 模板字符串 ${} 嵌套的 { 深度栈，仅在模板表达式内使用 */
  const embedStack = []
  /** 上一有效字符（非空白），用于正则/除法判别 */
  let prev = ''
  let i = 0

  /** 将指定下标字符置为空格（换行除外） */
  const blank = (idx) => {
    if (out[idx] !== '\n' && out[idx] !== '\r') out[idx] = ' '
  }

  while (i < len) {
    const ch = content[i]
    const next = content[i + 1]

    if (state === 'line') {
      if (ch === '\n') {
        state = 'code'
        prev = ''
      }
      else {
        blank(i)
      }
      i++
      continue
    }

    if (state === 'block') {
      if (ch === '*' && next === '/') {
        blank(i)
        blank(i + 1)
        i += 2
        state = 'code'
        prev = ''
        continue
      }
      blank(i)
      i++
      continue
    }

    if (state === 'sq' || state === 'dq') {
      const quote = state === 'sq' ? '\'' : '"'
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === quote) {
        state = 'code'
        prev = quote
        i++
        continue
      }
      if (ch === '\n' || ch === '\r') {
        state = 'code'
        i++
        continue
      }
      i++
      continue
    }

    if (state === 'tpl') {
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === '`') {
        state = 'code'
        prev = '`'
        i++
        continue
      }
      if (ch === '$' && next === '{') {
        embedStack.push(0)
        state = 'code'
        i += 2
        prev = '{'
        continue
      }
      i++
      continue
    }

    if (state === 'regex') {
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === '[') {
        i++
        while (i < len && content[i] !== ']') {
          if (content[i] === '\\') i++
          i++
        }
        i++
        continue
      }
      if (ch === '/') {
        state = 'code'
        prev = '/'
        i++
        continue
      }
      if (ch === '\n' || ch === '\r') {
        state = 'code'
        i++
        continue
      }
      i++
      continue
    }

    // state === 'code'
    if (ch === '/' && next === '/') {
      blank(i)
      blank(i + 1)
      i += 2
      state = 'line'
      continue
    }
    if (ch === '/' && next === '*') {
      blank(i)
      blank(i + 1)
      i += 2
      state = 'block'
      continue
    }
    if (ch === '\'') {
      state = 'sq'
      i++
      continue
    }
    if (ch === '"') {
      state = 'dq'
      i++
      continue
    }
    if (ch === '`') {
      state = 'tpl'
      i++
      continue
    }
    if (ch === '{') {
      if (embedStack.length > 0) embedStack[embedStack.length - 1]++
      prev = '{'
      i++
      continue
    }
    if (ch === '}') {
      if (embedStack.length > 0) {
        const top = embedStack[embedStack.length - 1]
        if (top === 0) {
          embedStack.pop()
          state = 'tpl'
          i++
          prev = '}'
          continue
        }
        embedStack[embedStack.length - 1]--
      }
      prev = '}'
      i++
      continue
    }
    if (ch === '/') {
      if (isRegexContext(prev)) {
        state = 'regex'
        i++
        continue
      }
      prev = '/'
      i++
      continue
    }
    if (!/\s/.test(ch)) prev = ch
    i++
  }

  return out.join('')
}

/**
 * 由函数名列表构建"首个字符串参数"匹配正则
 * @param {string[]} fnNames 需屏蔽首个字符串参数的函数名列表
 * @returns {RegExp} 匹配正则
 */
export function buildIgnoreFnRegex(fnNames) {
  const escaped = fnNames
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length)
  return new RegExp(`(?<![\\w$])(?:${escaped.join('|')})\\s*\\(\\s*((['"\`])(?:\\\\.|(?!\\2)[^\\\\])*\\2)`, 'g')
}

/**
 * 屏蔽 ignoreFns 函数的首个字符串参数
 * @param {string} content 原始内容
 * @param {RegExp} regex 由 buildIgnoreFnRegex 构建的正则
 * @returns {string} 处理后的内容
 */
export function maskIgnoreFnParams(content, regex) {
  return content.replace(regex, (match, p1) => {
    const before = match.slice(0, match.indexOf(p1))
    const maskedP1 = p1.split('').map((c) => (c === '\n' || c === '\r' ? c : ' ')).join('')
    return before + maskedP1
  })
}

/**
 * 字符串/模板感知的括号匹配：从开括号位置向后找配对的闭括号
 * @param {string} content 原始内容
 * @param {number} openIdx 开括号 ( 的下标
 * @returns {number} 配对闭括号 ) 的下标，找不到返回 -1
 */
function findMatchingParen(content, openIdx) {
  const len = content.length
  let depth = 0
  /** 当前所处的字符串引号，空串表示不在字符串/模板内 */
  let quote = ''
  let i = openIdx

  while (i < len) {
    const ch = content[i]
    if (quote) {
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === quote) quote = ''
      i++
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch
      i++
      continue
    }
    if (ch === '(') depth++
    if (ch === ')') {
      depth--
      if (depth === 0) return i
    }
    i++
  }

  return -1
}

/**
 * 屏蔽 console.xxx(...) 调用整体，支持多行与嵌套括号
 * @param {string} content 原始内容
 * @returns {string} 处理后的内容
 */
function maskConsoleCalls(content) {
  const out = content.split('')
  const regex = /console\.[a-zA-Z_$][\w$]*\s*\(/g
  let match

  while ((match = regex.exec(content)) !== null) {
    const openIdx = regex.lastIndex - 1
    const closeIdx = findMatchingParen(content, openIdx)
    if (closeIdx === -1) continue
    for (let k = match.index; k <= closeIdx; k++) {
      if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '
    }
    regex.lastIndex = closeIdx + 1
  }

  return out.join('')
}

/**
 * 屏蔽 %...% 包裹的内容（如 %page.首页%）
 * @param {string} content 原始内容
 * @returns {string} 处理后的内容
 */
function maskPercentWrapped(content) {
  return maskWithSpaces(content, /%[^%\r\n]+%/g)
}

/**
 * 屏蔽 TS 类型声明中的中文字符串联合类型，如 '在职' | '离职'
 * @param {string} content 原始内容
 * @returns {string} 处理后的内容
 */
function maskTsLiteralUnionTypes(content) {
  return maskWithSpaces(content, /'[^'\r\n]*[一-龥][^'\r\n]*'(?:\s*\|\s*'[^'\r\n]*[一-龥][^'\r\n]*')+/g)
}

/**
 * 屏蔽 throw Error / throw new Error 中的中文参数
 * @param {string} content 原始内容
 * @returns {string} 处理后的内容
 */
function maskErrorMessages(content) {
  const regex = /throw\s+(?:new\s+)?Error\s*\(\s*((['"`])(?:\\.|(?!\2)[^\\])*\2)/g
  return content.replace(regex, (match, p1) => {
    if (!/[一-龥]/.test(p1)) return match
    const before = match.slice(0, match.indexOf(p1))
    const maskedP1 = p1.split('').map((c) => (c === '\n' || c === '\r' ? c : ' ')).join('')
    return before + maskedP1
  })
}

/**
 * 对原始文本执行完整屏蔽管线
 * @param {string} content 原始内容
 * @param {string[]} ignoreFns 需屏蔽首个字符串参数的函数名列表
 * @returns {string} 处理后的内容
 */
export function maskRawContent(content, ignoreFns) {
  let masked = maskHtmlComments(content)
  masked = maskJsComments(masked)
  masked = maskIgnoreFnParams(masked, buildIgnoreFnRegex(ignoreFns))
  masked = maskConsoleCalls(masked)
  masked = maskPercentWrapped(masked)
  masked = maskTsLiteralUnionTypes(masked)
  masked = maskErrorMessages(masked)
  return masked
}

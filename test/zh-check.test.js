/**
 * zh-check 行为测试（移植自原 build/i18n-check 用例，实现改为 AST 后断言保持不变）
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as fs from 'node:fs'
import { fixturePath, createOutputDir, REPO_ROOT } from './helpers.js'
import { zhCheck } from '../src/index.js'

/**
 * 执行 zh-check 并读取报告
 * @param {string} caseDir 用例目录名
 * @param {object} [options] 额外配置
 * @returns {{ success: boolean, report: string }} 检测结果与报告内容
 */
function runZhCheck(caseDir, options = {}) {
  const outputDir = createOutputDir()
  const result = zhCheck(fixturePath(caseDir), { root: REPO_ROOT, outputDir, ...options })
  return { success: result.success, report: fs.readFileSync(result.outputFile, 'utf-8') }
}

describe('zh-check: 无硬编码中文', () => {
  it('success=true，报告"未发现"', () => {
    const { success, report } = runZhCheck('clean')
    assert.strictEqual(success, true)
    assert.ok(report.includes('未发现硬编码中文'))
  })
})

describe('zh-check: 空目录', () => {
  it('success=true，报告"未发现"', () => {
    const { success, report } = runZhCheck('empty')
    assert.strictEqual(success, true)
    assert.ok(report.includes('未发现硬编码中文'))
  })
})

describe('zh-check: 存在硬编码中文', () => {
  it('success=false，报告列出文件/行号/中文', () => {
    const { success, report } = runZhCheck('has-zh')
    assert.strictEqual(success, false)
    assert.ok(report.includes('你好世界'))
    assert.ok(report.includes('test.vue'))
  })
})

describe('zh-check: 注释内中文被屏蔽', () => {
  it('success=true（行注释、块注释、HTML 注释）', () => {
    const { success, report } = runZhCheck('comment')
    assert.strictEqual(success, true)
    assert.ok(report.includes('未发现硬编码中文'))
  })
})

describe('zh-check: console.*() 内中文被屏蔽', () => {
  it('success=true', () => {
    const { success, report } = runZhCheck('console-call')
    assert.strictEqual(success, true)
    assert.ok(report.includes('未发现硬编码中文'))
  })
})

describe('zh-check: 多行/嵌套 console 调用被屏蔽', () => {
  it('success=true', () => {
    const { success, report } = runZhCheck('console-multiline')
    assert.strictEqual(success, true)
    assert.ok(report.includes('未发现硬编码中文'))
  })
})

describe('zh-check: $t() 内中文被屏蔽', () => {
  it('success=true', () => {
    const { success, report } = runZhCheck('t-call')
    assert.strictEqual(success, true)
    assert.ok(report.includes('未发现硬编码中文'))
  })
})

describe('zh-check: 裸 t() 中文被屏蔽', () => {
  it('success=true（默认 ignoreFns 含裸 t）', () => {
    const { success, report } = runZhCheck('ignore-fn-t')
    assert.strictEqual(success, true)
    assert.ok(report.includes('未发现硬编码中文'))
  })
})

describe('zh-check: $pure() 内中文被屏蔽', () => {
  it('success=true', () => {
    const { success, report } = runZhCheck('pure-call')
    assert.strictEqual(success, true)
    assert.ok(report.includes('未发现硬编码中文'))
  })
})

describe('zh-check: keypath 由 $pure 规则覆盖', () => {
  it('success=true', () => {
    const { success, report } = runZhCheck('keypath')
    assert.strictEqual(success, true)
    assert.ok(report.includes('未发现硬编码中文'))
  })
})

describe('zh-check: 自定义 ignoreFns', () => {
  it("foo('中文') 被屏蔽 → success=true", () => {
    const { success, report } = runZhCheck('custom-ignore-fns', {
      zh: { ignoreFns: ['$t', '$pure', 't', 'foo'] }
    })
    assert.strictEqual(success, true)
    assert.ok(report.includes('未发现硬编码中文'))
  })
})

describe('zh-check: %...% 包裹中文被屏蔽', () => {
  it('success=true', () => {
    const { success, report } = runZhCheck('percent-wrapped')
    assert.strictEqual(success, true)
    assert.ok(report.includes('未发现硬编码中文'))
  })
})

describe('zh-check: throw Error 内中文被屏蔽', () => {
  it('success=true', () => {
    const { success, report } = runZhCheck('error-throw')
    assert.strictEqual(success, true)
    assert.ok(report.includes('未发现硬编码中文'))
  })
})

describe('zh-check: TS 联合类型被屏蔽', () => {
  it("success=true（'在职' | '离职' 属于类型位置，不进入检测）", () => {
    const { success, report } = runZhCheck('ts-union')
    assert.strictEqual(success, true)
    assert.ok(report.includes('未发现硬编码中文'))
  })
})

describe('zh-check: 字符串/模板内中文不被注释规则误屏蔽', () => {
  it('success=false，报出字符串内中文', () => {
    const { success, report } = runZhCheck('string-comment')
    assert.strictEqual(success, false)
    assert.ok(report.includes('路径'))
    assert.ok(report.includes('这是字符串不是注释'))
    assert.ok(report.includes('里的中文'))
  })
})

describe('zh-check: 分组展示', () => {
  it('success=false，报告有分组标题且两个文件都出现', () => {
    const { success, report } = runZhCheck('group')
    assert.strictEqual(success, false)
    const groupHeaders = report.split('\n').filter(line => line.startsWith('## '))
    assert.ok(groupHeaders.length > 0, '应有分组标题')
    assert.ok(report.includes('a.vue'))
    assert.ok(report.includes('b.vue'))
    assert.ok(report.includes('你好'))
    assert.ok(report.includes('世界'))
  })
})

describe('zh-check: \\u 转义中文不误报', () => {
  it("success=true（'\\u534e' 这类转义按源码文本判断）", () => {
    const { success, report } = runZhCheck('escape-only')
    assert.strictEqual(success, true)
    assert.ok(report.includes('未发现硬编码中文'))
  })
})

describe('zh-check: i18n-t 组件 keypath 不误报', () => {
  it('success=true（keypath 是翻译 key 而非硬编码文本）', () => {
    const { success, report } = runZhCheck('i18n-t')
    assert.strictEqual(success, true)
    assert.ok(report.includes('未发现硬编码中文'))
  })
})

describe('zh-check: 自定义 i18nComponents', () => {
  it('默认配置下自定义组件 key 属性报硬编码中文', () => {
    const { success } = runZhCheck('i18n-component')
    assert.strictEqual(success, false)
  })
  it('配置后 key 属性不误报 → success=true', () => {
    const { success, report } = runZhCheck('i18n-component', {
      i18nComponents: [
        { tag: 'i18n-t', keyProp: 'keypath' },
        { tag: 'I18nText', keyProp: 'k' }
      ]
    })
    assert.strictEqual(success, true)
    assert.ok(report.includes('未发现硬编码中文'))
  })
})

describe('zh-check: 含 void 元素的模板可解析', () => {
  it('success=false，报出 script 中的中文', () => {
    const { success, report } = runZhCheck('void-element')
    assert.strictEqual(success, false)
    assert.ok(report.includes('登录'))
  })
})

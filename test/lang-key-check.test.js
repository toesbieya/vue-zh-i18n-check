/**
 * lang-key-check 检测测试
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as fs from 'node:fs'
import { fixturePath, createOutputDir } from './helpers.js'
import { langKeyCheck } from '../src/index.js'

describe('lang-key-check: 缺失 key 与动态调用', () => {
  it('success=false，报告包含语言包缺失 key、源码缺失 key 与动态调用', () => {
    const root = fixturePath('lang-key')
    const outputDir = createOutputDir()
    const result = langKeyCheck('src', { root, outputDir })
    const report = fs.readFileSync(result.outputFile, 'utf-8')

    assert.strictEqual(result.success, false)
    // zh-CN 缺少 en-US 的 app.extra
    assert.ok(report.includes('app.extra'), '报告应包含语言包缺失 key')
    // 源码中 $t('app.missing') 不在任何语言包
    assert.ok(report.includes('app.missing'), '报告应包含源码缺失 key')
    // $t(key) 动态调用
    assert.ok(report.includes('无法静态检查'), '报告应包含动态调用段落')
    // 未使用 key（app.used / app.extra 源码未引用）
    assert.ok(report.includes('app.used'), '报告应包含未使用 key')
  })
})

describe('lang-key-check: 语言包目录不存在', () => {
  it('success=false', () => {
    const outputDir = createOutputDir()
    const result = langKeyCheck('src', { root: fixturePath('clean'), outputDir })
    assert.strictEqual(result.success, false)
  })
})

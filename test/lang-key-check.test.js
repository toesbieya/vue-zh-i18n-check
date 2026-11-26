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

describe('lang-key-check: i18n-t 组件 keypath 计为已使用 key', () => {
  it('success=true，keypath 的 key 不出现在未使用列表', () => {
    const root = fixturePath('i18n-t-key')
    const outputDir = createOutputDir()
    const result = langKeyCheck('src', { root, outputDir })
    const report = fs.readFileSync(result.outputFile, 'utf-8')

    assert.strictEqual(result.success, true)
    assert.ok(report.includes('未发现国际化 Key 问题'), '报告应无问题')
    assert.ok(!report.includes('未使用的 Key'), 'keypath 引用的 key 不应报未使用')
  })
})

describe('lang-key-check: key 合法性校验', () => {
  it('默认规则下语言包与源码中的特殊字符 key 均为阻塞性问题', () => {
    const root = fixturePath('key-validate')
    const outputDir = createOutputDir()
    const result = langKeyCheck('src', { root, outputDir })
    const report = fs.readFileSync(result.outputFile, 'utf-8')

    assert.strictEqual(result.success, false)
    // 语言包中 zh-CN 与 en-US 各有一处 app.操作成功！
    assert.ok(report.includes('语言包中非法的 Key'), '报告应包含语言包非法 key 段落')
    // 源码中 $t('app.操作成功！')
    assert.ok(report.includes('源码中非法的 Key'), '报告应包含源码非法 key 段落')
    // 合法 key 不应被误报
    assert.ok(!report.includes('| app.ok |'), '合法 key 不应出现在非法 key 表格')
  })

  it('自定义 validateKey 后不再报非法 key', () => {
    const root = fixturePath('key-validate')
    const outputDir = createOutputDir()
    const result = langKeyCheck('src', { root, outputDir, lang: { validateKey: () => true } })
    const report = fs.readFileSync(result.outputFile, 'utf-8')

    assert.strictEqual(result.success, true)
    assert.ok(report.includes('未发现国际化 Key 问题'), '放开校验后报告应无问题')
  })

  it('validateKey 传 null 关闭校验', () => {
    const root = fixturePath('key-validate')
    const outputDir = createOutputDir()
    const result = langKeyCheck('src', { root, outputDir, lang: { validateKey: null } })

    assert.strictEqual(result.success, true)
  })
})

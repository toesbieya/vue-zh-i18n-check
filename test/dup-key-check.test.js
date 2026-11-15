/**
 * dup-key-check 重复 key 检测测试
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { fixturePath } from './helpers.js'
import { dupKeyCheck } from '../src/index.js'

describe('dup-key-check: 存在重复 key', () => {
  it('success=false，duplicates 含重复 key 与行号', () => {
    const result = dupKeyCheck({ root: fixturePath('dup-key') })
    assert.strictEqual(result.success, false)
    assert.strictEqual(result.duplicates.length, 1)
    assert.strictEqual(result.duplicates[0].key, 'a')
    assert.deepStrictEqual(result.duplicates[0].lines, [2, 4])
  })
})

describe('dup-key-check: 无重复 key', () => {
  it('success=true', () => {
    const result = dupKeyCheck({ root: fixturePath('dup-key-clean') })
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.duplicates.length, 0)
  })
})

#!/usr/bin/env node
/**
 * vue-zh-i18n-check CLI 入口
 * 用法：vue-zh-i18n-check [扫描目标...] [--only zh|lang|dup] [--config 配置文件] [--root 项目根目录]
 * 默认执行 lang-key-check + zh-check（--only 可单独指定），检测未通过时以退出码 1 结束。
 * 配置文件支持 i18n-check.config.mjs / i18n-check.config.js / i18n-check.config.cjs（相对项目根）。
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { zhCheck } from './checker/zh-check.js'
import { langKeyCheck } from './checker/lang-key-check.js'
import { dupKeyCheck } from './checker/dup-key-check.js'

/** 支持的配置文件名（按优先级查找） */
const CONFIG_FILE_NAMES = ['i18n-check.config.mjs', 'i18n-check.config.js', 'i18n-check.config.cjs']

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    only: { type: 'string' },
    config: { type: 'string' },
    root: { type: 'string' }
  }
})

const root = path.resolve(values.root ?? process.cwd())

/**
 * 加载配置文件
 * @returns {Promise<object>} 配置对象，不存在时返回空对象
 */
async function loadConfigFile() {
  const candidates = values.config
    ? [values.config]
    : CONFIG_FILE_NAMES
  for (const name of candidates) {
    const filePath = path.resolve(root, name)
    if (!fs.existsSync(filePath)) continue
    const module = await import(pathToFileURL(filePath).href)
    return module.default ?? {}
  }
  if (values.config) {
    console.error(`配置文件不存在: ${path.resolve(root, values.config)}`)
    process.exit(1)
  }
  return {}
}

const configFile = await loadConfigFile()
const options = { ...configFile, root }
const scanTargets = positionals.length > 0 ? positionals : ['src']

const only = values.only
if (only && !['zh', 'lang', 'dup'].includes(only)) {
  console.error(`--only 仅支持 zh | lang | dup，收到: ${only}`)
  process.exit(1)
}

let success = true
try {
  if (!only || only === 'lang') {
    success = langKeyCheck(scanTargets, options).success && success
  }
  if (!only || only === 'zh') {
    success = zhCheck(scanTargets, options).success && success
  }
  if (only === 'dup') {
    success = dupKeyCheck(options).success && success
  }
}
catch (error) {
  console.error(error)
  success = false
}

if (!success) {
  process.exit(1)
}

/**
 * gitignore 忽略规则测试
 * 自建临时项目根（含 .gitignore），验证命中的目录/文件被排除，
 * 以及 ignore / ignoreFiles 配置项生效（语法同 .gitignore）。
 */

import { describe, it, after } from 'node:test'
import assert from 'node:assert'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createOutputDir } from './helpers.js'
import { zhCheck } from '../src/index.js'

/** 临时项目根目录 */
let tmpRoot

/**
 * 在临时项目根写入文件（父目录自动创建）
 * @param {string} rel 相对路径
 * @param {string} content 文件内容
 */
function writeFile(rel, content) {
  const fullPath = path.join(tmpRoot, rel)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, content)
}

after(() => {
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true })
})

/**
 * 初始化临时项目根
 * @param {string} gitignore .gitignore 内容
 */
function setup(gitignore) {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vue-zh-i18n-check-root-'))
  writeFile('.gitignore', gitignore)
}

describe('zh-check: 忽略规则', () => {
  it('.gitignore 命中的目录与文件被排除 → success=true', () => {
    setup('dist/\n*.local.json\n')
    writeFile('dist/ignored.vue', '<template>\n  <div>你好</div>\n</template>\n')
    writeFile('config.local.json', '{ "key": "你好" }\n')
    writeFile('src/clean.vue', '<template>\n  <div>Hello</div>\n</template>\n')

    const outputDir = createOutputDir()
    const result = zhCheck('.', { root: tmpRoot, outputDir })
    assert.strictEqual(result.success, true)
    assert.ok(fs.readFileSync(result.outputFile, 'utf-8').includes('未发现硬编码中文'))
  })

  it('ignore 内联模式命中 → success=true', () => {
    setup('')
    writeFile('src/views/ignored.vue', '<template>\n  <div>你好</div>\n</template>\n')

    const outputDir = createOutputDir()
    const result = zhCheck('.', { root: tmpRoot, outputDir, ignore: ['src/views/**'] })
    assert.strictEqual(result.success, true)
  })

  it('ignoreFiles 指定的忽略文件命中 → success=true', () => {
    setup('')
    writeFile('.i18ncheckignore', 'src/legacy/\n')
    writeFile('src/legacy/ignored.vue', '<template>\n  <div>你好</div>\n</template>\n')

    const outputDir = createOutputDir()
    const result = zhCheck('.', { root: tmpRoot, outputDir, ignoreFiles: ['.i18ncheckignore'] })
    assert.strictEqual(result.success, true)
  })

  it('未被忽略文件中的中文正常报出 → success=false', () => {
    setup('dist/\n')
    writeFile('src/has-zh.vue', '<template>\n  <div>你好</div>\n</template>\n')

    const outputDir = createOutputDir()
    const result = zhCheck('.', { root: tmpRoot, outputDir })
    assert.strictEqual(result.success, false)
    assert.ok(fs.readFileSync(result.outputFile, 'utf-8').includes('你好'))
  })
})

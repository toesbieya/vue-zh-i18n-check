# vue-zh-i18n-check

Vue3 中文项目国际化检测工具，基于 AST（typescript + @vue/compiler-sfc）实现：

- **zh-check**：扫描源码中的硬编码中文（含 `.vue` 模板文本）；
- **lang-key-check**：语言包 key 完整性检测（各语言缺失文件 / 缺失 key、源码引用了不存在的 key、动态调用、未使用 key、语言包重复顶层 key）；
- **dup-key-check**：语言包 JSON 文件内重复顶层 key 检测（同名 key 会被 JSON.parse 静默覆盖）。

检测未通过时退出码为 1，可直接挂在 git hook、lint-staged 与 CI 上作为门禁。

## 安装

```bash
npm install --save-dev @toesbieya/vue-zh-i18n-check
```

peer 依赖（Vue3 + TS 项目本身已有）：`typescript >=5`、`@vue/compiler-sfc >=3`、`@vue/compiler-dom >=3`。

## CLI

```bash
# 执行 lang-key-check + zh-check（默认扫描 src）
npx vue-zh-i18n-check

# 指定扫描目标（目录或文件，可多个）
npx vue-zh-i18n-check src/views src/components

# 只执行某一项检测
npx vue-zh-i18n-check --only zh     # 硬编码中文
npx vue-zh-i18n-check --only lang   # 语言包 key 完整性
npx vue-zh-i18n-check --only dup    # 语言包重复 key

# 指定项目根目录 / 配置文件
npx vue-zh-i18n-check --root /path/to/project --config i18n-check.config.mjs
```

## 配置

在项目根创建 `i18n-check.config.mjs`（也支持 `.js` / `.cjs`），所有字段可选；库自带类型声明，可用 `@type` 注解获得补全：

```js
/** @type {import('@toesbieya/vue-zh-i18n-check').I18nCheckConfig} */
export default {
  // 语言包根目录（相对项目根），默认 'src/locale/lang'
  langRoot: 'src/locale/lang',

  // 允许扫描的文件扩展名，默认 ['.vue', '.js', '.ts', '.jsx', '.tsx', '.json', '.html']
  extensions: ['.vue', '.ts'],

  // gitignore 语法的内联忽略模式（相对项目根），项目根 .gitignore 自动叠加无需重复声明
  ignore: ['src/assets', 'src/locale', 'src/styles'],

  // 额外忽略文件（相对项目根，语法同 .gitignore）
  ignoreFiles: ['.i18ncheckignore'],

  // 检测报告输出目录（相对项目根），默认 '.i18n-check'
  outputDir: '.i18n-check',

  // 模板中携带翻译 key 的组件，默认 [{ tag: 'i18n-t', keyProp: 'keypath' }]
  // key 属性值按翻译 key 处理：不算硬编码中文，且计入已使用 key
  // tag 匹配忽略大小写与连字符（i18n-t / I18nT 等价）；数组为整体覆盖，自定义时需保留默认项
  i18nComponents: [
    { tag: 'i18n-t', keyProp: 'keypath' },
    { tag: 'I18nText', keyProp: 'k' }
  ],

  // zh-check 配置
  zh: {
    // 首个字符串参数视为已国际化（不参与硬编码中文检测）的函数名
    ignoreFns: ['$t', 't', '$pure', '$i18nKey']
  },

  // lang-key-check 配置
  lang: {
    // 翻译函数名
    tFns: ['$t', 't', '$i18nKey'],
    // 首个字符串参数视为已注册的函数名
    ignoreFns: ['$pure']
  }
}
```

## 编程 API

```js
import { zhCheck, langKeyCheck, dupKeyCheck, checkAll } from '@toesbieya/vue-zh-i18n-check'

// 各函数接受与配置文件相同的覆盖项（root 默认为 process.cwd()）
zhCheck('src', { root: process.cwd(), ignore: ['src/assets'] })   // { success, outputFile }
langKeyCheck('src')                                               // { success, outputFile }
dupKeyCheck()                                                     // { success, duplicates }
checkAll('src')                                                   // lang + zh，{ success }
```

## zh-check 排除规则

以下内容不算硬编码中文：

- 各类注释（HTML 注释、JS 行/块注释、`.vue` 模板注释）；
- `ignoreFns` 函数的首个字符串参数（默认含 `$t` / `t` / `$pure` / `$i18nKey`）；
- `i18nComponents` 配置的组件 key 属性（默认 `<i18n-t keypath="...">`）；
- `console.*(...)` 整个调用；
- `%...%` 包裹的内容（如 `%page.首页%`）；
- TS 类型位置的字符串字面量（如 `type Status = '在职' | '离职'`）；
- `throw Error` / `throw new Error` 的首个字符串参数；
- 仅由 `\uXXXX` 等转义产生中文的字符串（按源码原文判断，如 `'华'` 不报）。

检测范围覆盖 `.vue` 的 script / scriptSetup / template（含插值、指令表达式、静态属性文本）与 style 块。

## lang-key-check 说明

- 语言包目录结构约定为 `<langRoot>/<语言标识>/**/*.json`，key 为「文件相对路径 + JSON 层级」的点分形式（如 `views/system/lang.json` 的 `title` 字段 → `views.system.lang.title`）；
- 阻塞性问题（退出码 1）：语言间缺失 JSON 文件、语言间缺失 key、语言包重复顶层 key、源码引用了不存在的 key；
- 非阻塞项（仅列入报告）：动态翻译调用（无法静态检查）、语言包未使用 key；
- `.json` / `.html` 文件不扫描翻译函数调用。

## dup-key-check 说明

按行匹配 2 空格缩进的顶层 key 检测重复定义（语言包 JSON 约定为 2 空格缩进格式），只读语言包目录，与扫描目标无关，适合作为轻量门禁挂在 lint-staged：

```json
{
  "lint-staged": {
    "src/locale/**/*.json": ["vue-zh-i18n-check --only dup"]
  }
}
```

## 测试

```bash
npm test
```

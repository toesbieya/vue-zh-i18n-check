/**
 * 配置解析
 * 合并默认配置、配置文件（由 CLI 加载后传入）与调用方覆盖项。
 */

/** 默认 key 合法性规则：仅允许中文、字母、数字（不允许标点、下划线、空格、换行、括号等特殊字符） */
const DEFAULT_KEY_PATTERN = /^[一-龥a-zA-Z0-9]+$/

/** 默认配置 */
export const DEFAULT_CONFIG = {
  /** 项目根目录，默认当前工作目录 */
  root: process.cwd(),
  /** 语言包根目录（相对项目根） */
  langRoot: 'src/locale/lang',
  /** 允许扫描的文件扩展名 */
  extensions: ['.vue', '.js', '.ts', '.jsx', '.tsx', '.json', '.html'],
  /** gitignore 语法的内联忽略模式（相对项目根） */
  ignore: [],
  /** 额外忽略文件路径（相对项目根，语法同 .gitignore），.gitignore 自动加载无需声明 */
  ignoreFiles: [],
  /** 检测报告输出目录（相对项目根） */
  outputDir: '.i18n-check',
  /**
   * 模板中携带翻译 key 的组件（key 属性值按翻译 key 处理，不算硬编码中文，且计入已使用 key）
   * tag 匹配忽略大小写与连字符（i18n-t / I18nT 等价）；数组为整体覆盖，自定义时需保留默认项
   */
  i18nComponents: [{ tag: 'i18n-t', keyProp: 'keypath' }],
  /** 硬编码中文检测配置 */
  zh: {
    /** 需屏蔽首个字符串参数的函数名（翻译函数本身即视为已国际化） */
    ignoreFns: ['$t', 't', '$pure', '$i18nKey']
  },
  /** 语言包 key 完整性检测配置 */
  lang: {
    /** 翻译函数名 */
    tFns: ['$t', 't', '$i18nKey'],
    /** 需屏蔽首个字符串参数的函数名 */
    ignoreFns: ['$pure'],
    /**
     * key 合法性校验（如 key 命名规范要求"不能包含特殊字符"），对扁平化 key 按点分段逐段调用，任一段返回 false 则该 key 非法
     * 由 json 文件路径拼接出的命名空间段不参与校验，只校验 JSON 内部的 key 段
     * 仅校验语言包中的 key（源码中的 key 不重复校验），非法 key 属于阻塞性问题
     */
    validateKey: (segment) => DEFAULT_KEY_PATTERN.test(segment)
  }
}

/**
 * 合并配置：默认值 < 配置文件 < 调用方覆盖项（zh / lang 分节各自浅合并）
 * @param {object} [overrides] 覆盖项，字段同 DEFAULT_CONFIG
 * @returns {typeof DEFAULT_CONFIG} 合并后的配置
 */
export function resolveConfig(overrides = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...overrides,
    zh: { ...DEFAULT_CONFIG.zh, ...overrides.zh },
    lang: { ...DEFAULT_CONFIG.lang, ...overrides.lang }
  }
  config.extensions = new Set(config.extensions)
  return config
}

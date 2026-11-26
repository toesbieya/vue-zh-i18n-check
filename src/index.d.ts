/**
 * vue-zh-i18n-check 类型声明
 * 供编程 API 与 i18n-check.config.mjs（@type 注解）使用
 */

/** 检测配置（对应 i18n-check.config.mjs 导出的对象，所有字段可选） */
export interface I18nCheckConfig {
  /** 项目根目录，默认 process.cwd() */
  root?: string
  /** 语言包根目录（相对项目根），默认 'src/locale/lang' */
  langRoot?: string
  /** 允许扫描的文件扩展名，默认 ['.vue', '.js', '.ts', '.jsx', '.tsx', '.json', '.html'] */
  extensions?: string[]
  /** gitignore 语法的内联忽略模式（相对项目根），.gitignore 会自动叠加 */
  ignore?: string[]
  /** 额外忽略文件路径（相对项目根，语法同 .gitignore），默认 [] */
  ignoreFiles?: string[]
  /** 检测报告输出目录（相对项目根），默认 '.i18n-check' */
  outputDir?: string
  /**
   * 模板中携带翻译 key 的组件，默认 [{ tag: 'i18n-t', keyProp: 'keypath' }]
   * key 属性值按翻译 key 处理：不算硬编码中文，且计入已使用 key
   * 数组为整体覆盖，添加自定义组件时需保留默认项
   */
  i18nComponents?: Array<{
    /** 组件标签名（匹配时忽略大小写与连字符，i18n-t / I18nT 等价） */
    tag: string
    /** 翻译 key 属性名 */
    keyProp: string
  }>
  /** 硬编码中文检测配置 */
  zh?: {
    /** 首个字符串参数视为已国际化的函数名，默认 ['$t', 't', '$pure', '$i18nKey'] */
    ignoreFns?: string[]
  }
  /** 语言包 key 完整性检测配置 */
  lang?: {
    /** 翻译函数名，默认 ['$t', 't', '$i18nKey'] */
    tFns?: string[]
    /** 首个字符串参数视为已注册的函数名，默认 ['$pure'] */
    ignoreFns?: string[]
    /**
     * key 合法性校验，默认仅允许中文、字母、数字（不允许特殊字符）；
     * 对扁平化 key 按点分段逐段调用（如 views.system.lang.title 会依次传入 views、system、lang、title），任一段返回 false 则该 key 非法
     * 语言包中的 key 与源码中的字面量 key 都会校验，非法 key 属于阻塞性问题
     */
    validateKey?: (segment: string) => boolean
  }
}

/** 带报告文件路径的检测结果 */
export interface CheckReportResult {
  /** 是否通过（无阻塞性问题） */
  success: boolean
  /** 报告文件绝对路径 */
  outputFile: string
}

/** 重复 key 条目 */
export interface DuplicateKeyItem {
  /** 语言标识 */
  lang: string
  /** 语言包内文件相对路径 */
  file: string
  /** 重复的顶层 key */
  key: string
  /** 重复出现的行号列表 */
  lines: number[]
}

/** 重复 key 检测结果 */
export interface DupKeyCheckResult {
  /** 是否通过（无重复 key） */
  success: boolean
  /** 重复 key 列表 */
  duplicates: DuplicateKeyItem[]
}

/** 汇总检测结果 */
export interface CheckAllResult {
  /** 是否全部通过 */
  success: boolean
}

/**
 * 硬编码中文检测
 * @param scanTargets 源码扫描目标，支持目录、文件路径或两者的数组（相对项目根）
 * @param options 配置覆盖项
 * @returns 检测结果与报告文件路径
 */
export function zhCheck(scanTargets: string | string[], options?: I18nCheckConfig): CheckReportResult

/**
 * 语言包 key 完整性检测
 * @param scanTargets 源码扫描目标，支持目录、文件路径或两者的数组（相对项目根）
 * @param options 配置覆盖项
 * @returns 检测结果与报告文件路径
 */
export function langKeyCheck(scanTargets: string | string[], options?: I18nCheckConfig): CheckReportResult

/**
 * 语言包重复顶层 key 检测
 * @param options 配置覆盖项
 * @returns 检测结果
 */
export function dupKeyCheck(options?: I18nCheckConfig): DupKeyCheckResult

/**
 * 检测语言包中重复定义的顶层 key（编程接口）
 * @param langRoot 语言包根目录
 * @param languages 语言标识列表
 * @returns 重复 key 列表
 */
export function detectDuplicateKeys(langRoot: string, languages: string[]): DuplicateKeyItem[]

/**
 * 依次执行 lang-key-check 和 zh-check，任一未通过或抛异常则整体失败
 * @param scanTargets 源码扫描目标（相对项目根）
 * @param options 配置覆盖项
 * @returns 检测结果
 */
export function checkAll(scanTargets: string | string[], options?: I18nCheckConfig): CheckAllResult

/**
 * 合并配置：默认值 < 配置文件 < 调用方覆盖项
 * @param overrides 覆盖项
 * @returns 合并后的配置
 */
export function resolveConfig(overrides?: I18nCheckConfig): I18nCheckConfig

/** 默认配置 */
export const DEFAULT_CONFIG: I18nCheckConfig

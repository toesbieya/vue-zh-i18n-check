/**
 * 模拟页面：包含已使用 key、语言包缺失 key 与动态调用
 */

const a = $t('app.ok')
const b = $t('app.missing')
const key = 'app.ok'
const c = $t(key)

export { a, b, c }

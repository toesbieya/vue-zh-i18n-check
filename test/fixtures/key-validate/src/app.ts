/**
 * 模拟页面：包含合法 key、含特殊字符的非法 key，以及文件路径含中划线的 key
 */

const a = $t('app.ok')
const b = $t('app.操作成功！')
// 命名空间段 import-excel 由文件名拼接而来，不参与合法性校验
const c = $t('components.import-excel.上限提示')

export { a, b, c }

const sanitizeHtml = require('sanitize-html')

// https://stackoverflow.com/a/40026669/1387519
const trimRegex = /(<(pre|script|style|textarea)[^]+?<\/\2)|(^|>)\s+|\s+(?=<|$)/g

const dedupSpaceRegex = / {2,}/g

const normalizeHtml = html => {
  let result = html
  result = result.trim()
  result = sanitizeHtml(result, {
    allowedTags: false,
    allowedAttributes: false,
    // selfClosing: false,
    allowedSchemes: false,
    allowedSchemesByTag: false,
    allowedSchemesAppliedToAttributes: false,
  })
  result = result.replace(trimRegex, '$1$3')
  result = result.replace(dedupSpaceRegex, ' ')
  return result
}

module.exports = normalizeHtml

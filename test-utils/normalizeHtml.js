const sanitizeHtml = require('sanitize-html')

// https://stackoverflow.com/a/40026669/1387519
const trimRegex = /(<(pre|script|style|textarea)[^]+?<\/\2)|(^|>)\s+|\s+(?=<|$)/g

const dedupSpaceRegex = / {2,}/g

const normalizeHtml = html => {
  let result = html
  // TODO This is very aggressive reformatting; it could break things that,
  //   unfortunately, might also be worthy of testing for HMR (whitespaces...)
  //   Maybe that should become an option of kind (or use a more respectfulj
  //   sanitization method).
  //
  // NOTE Many tests (of test utils) depends on this stripping of newlines,
  //   though.
  //
  result = result.replace(/\n+/g, ' ')
  result = result.trim()
  result = sanitizeHtml(result, {
    allowedTags: false,
    allowedAttributes: false,
    // selfClosing: false,
    // allowedSchemes: false,
    // allowedSchemesByTag: false,
    // allowedSchemesAppliedToAttributes: false,
  })
  result = result.replace(trimRegex, '$1$3')
  result = result.replace(dedupSpaceRegex, ' ')
  return result
}

module.exports = normalizeHtml

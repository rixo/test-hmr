if (!global.ZOAR_OPTIONS || !global.ZOAR_OPTIONS.zorax) {
  throw new Error('Missing zorax?')
}

const { zorax } = global.ZOAR_OPTIONS

if (typeof zorax === 'string') {
  const zorax = global.ZOAR_OPTIONS.zorax
    //
    .split('::')
    .slice(0, -1)
    .join('::')

  module.exports = require(zorax)
} else {
  module.exports = zorax
}

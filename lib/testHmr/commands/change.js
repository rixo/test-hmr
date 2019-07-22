/**
 *     yield change({
 *       'file.js': 'contents',
 *     })
 *
 *     yield spec({
 *       'index.html': `
 *         Hello,
 *         ::0 World
 *         ::1 HMR
 *       `,
 *     })
 *     yield change(1)
 */
const { renderSpecs, renderChanges } = require('../spec')
const { consumeExpects } = require('../expect')

const change = changes => ({
  type,
  changes,
})

change.rm = Symbol('change: rm')

const run = async (state, command) => {
  const {
    config: { writeHmr },
  } = state
  const { changes } = command
  if (typeof changes === 'string' || typeof changes === 'number') {
    const lastLabel = await consumeExpects(state, changes)
    // if our label has not been processed by consumeExpects (because
    // not present as an expectation), then we must do it ourselves
    if (lastLabel !== String(changes)) {
      const files = renderSpecs(state, changes)
      await writeHmr(state.page, files)
    }
  } else {
    const files = renderChanges(state, changes)
    await writeHmr(state.page, files)
  }
}

const type = change.name

module.exports = Object.assign(change, {
  type,
  run,
})

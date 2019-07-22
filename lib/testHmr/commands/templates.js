/**
 *     yield templates({
 *       'filename.ext': name => `Hello, ${name}`
 *     })
 *     yield change({
 *       'filename.ext': 'World'
 *     })
 */

const templates = templates => ({
  type,
  templates,
})

const type = templates.name

const run = (state, command) => {
  Object.assign(state.templates, command.templates)
}

module.exports = {
  type,
  command: templates,
  handler: { init: run, run },
}

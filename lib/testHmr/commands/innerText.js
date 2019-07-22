/**
 *     const text = yield innerText('body')
 *     assert(text, 'innerText').to.equal('foo')
 */

const innerText = selector => ({ type, selector })

const run = (state, command) =>
  state.page.$eval(command.selector, el => el && el.innerText)

const type = innerText.name

module.exports = Object.assign(innerText, {
  type,
  run,
})

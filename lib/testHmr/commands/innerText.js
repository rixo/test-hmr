/**
 *     const text = yield innerText()
 *     assert(text, 'innerText').to.equal('foo')
 */

const innerText = sub => ({ type, sub })

const run = (state, command) =>
  state.page.$eval(command.selector, el => el && el.innerText)

const type = innerText.name

module.exports = Object.assign(innerText, {
  type,
  run,
})

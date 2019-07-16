const { page } = require('../test-utils/testHmr')

const input = 'input'
const button = 'button'

const curryAble = obj =>
  Object.fromEntries(
    Object.entries(obj).map(([name, fn]) => [
      name,
      (...args) =>
        function*() {
          yield* fn(...args)
        },
    ])
  )

function* clickButton(selector = button) {
  yield page.click(selector)
}

function* clearInput(selector = input) {
  yield page.focus(selector)
  const value = yield page.$eval(selector, el => el.value)
  const len = String(value).length
  for (let i = 0; i < len; i++) {
    yield page.keyboard.press('Backspace')
  }
}

function* replaceInputValue(value, selector = input) {
  yield* clearInput(selector)
  yield page.type(selector, value)
}

module.exports = curryAble({
  clickButton,
  clearInput,
  replaceInputValue,
})

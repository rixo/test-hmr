/* eslint-env mocha */

const { writeHmr, loadPage } = require('.')

const INIT = 'init'
const TEMPLATES = 'templates'
const CHANGE = 'changes'
const INNER_TEXT = 'inner_text'

const consume = async (gen, callback, firstValue) => {
  let next
  let nextValue = firstValue
  do {
    next = gen.next(nextValue)
    nextValue = undefined
    const value = next.value
    if (!value) continue
    nextValue = await callback(value)
  } while (!next.done)
}

const renderFiles = (templates, inits) =>
  Object.fromEntries(
    Object.entries(inits).map(([key, value]) => {
      const template = templates[key]
      const contents = template ? template(value) : value
      return [key, contents]
    })
  )

const testHmr = (description, handler, test = it) =>
  test(description, async () => {
    const gen = handler({ innerText })
    const pageUrl = '/'
    const templates = {}
    const inits = {}

    const start = async firstEffect => {
      // await writeHmr(inits)
      await app.reset(inits)
      await loadPage(pageUrl, async page => {
        const handleEffect = async effect => {
          switch (effect.type) {
            case CHANGE: {
              const files = renderFiles(templates, effect.changes)
              await writeHmr(page, files)
              break
            }
            case INNER_TEXT:
              return await page.$eval(effect.selector, el => el && el.innerText)
          }
        }
        const firstValue = await handleEffect(firstEffect)
        await consume(gen, handleEffect, firstValue)
      })
    }

    await consume(gen, async effect => {
      switch (effect.type) {
        case TEMPLATES:
          Object.assign(templates, effect.templates)
          break

        case INIT: {
          const files = renderFiles(templates, effect.inits)
          Object.assign(inits, files)
          break
        }

        default:
          return await start(effect)
      }
    })
  })

testHmr.skip = (description, handler) => testHmr(description, handler, it.skip)

testHmr.only = (description, handler) => testHmr(description, handler, it.only)

const init = inits => ({ type: INIT, inits })

const templates = templates => ({
  type: TEMPLATES,
  templates,
})

const innerText = selector => ({
  type: INNER_TEXT,
  selector,
})

const change = changes => ({
  type: CHANGE,
  changes,
})

module.exports = {
  testHmr,
  init,
  templates,
  innerText,
  change,
}

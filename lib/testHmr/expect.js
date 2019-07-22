const normalizeHtml = require('../normalizeHtml')
const Deferred = require('../deferred')

const { consumeSub } = require('./consume')
const { renderSpecs } = require('./spec')

const nullLabel = Symbol('NULL LABEL')

const passIt = (its, key, handler) => {
  const promise = handler()
  if (its && its[key]) {
    // NOTE mute the error, if we're running in a describe
    return promise
      .then(r => {
        its[key].resolve(r)
      })
      .catch(err => {
        its[key].reject(err)
      })
  }
  return promise
}

const assertExpect = async (state, expectation, cond) => {
  // its: test promises that we need to resolve (for tag spec as describe)
  const { its: { [cond]: its } = {} } = state.config
  const { before, after, steps = [] } = expectation
  let stepName = ''
  try {
    if (before) {
      stepName = 'before'
      await consumeSub(state, before, state.processCommand)
    }
    let i = 0
    for (const step of steps) {
      const index = i++
      stepName = `step ${index}`
      // eslint-disable-next-line no-loop-func
      await passIt(its, index, async () => {
        const {
          function: fn,
          html,
          sub,
          before: beforeStep,
          after: afterStep,
        } = step
        if (beforeStep) {
          stepName = `step ${index} (before)`
          await consumeSub(state, beforeStep, state.processCommand)
        }
        if (fn) {
          stepName = `step ${index} (sub)`
          await fn.call(state.commands)
        }
        if (sub) {
          stepName = `step ${index} (sub)`
          await consumeSub(state, sub, state.processCommand)
        }
        if (html != null) {
          stepName = `step ${index} (html)`
          const {
            page,
            config: { appRootSelector, appHtmlPrefix },
          } = state
          const contents = await page.$eval(appRootSelector, el => el.innerHTML)
          let actual = ''
          if (contents) {
            actual = normalizeHtml(contents)
            if (appHtmlPrefix) {
              const prefixLength = appHtmlPrefix.length
              const prefix = actual.substring(0, prefixLength)
              expect(prefix, 'app HTML prefix').to.equal(appHtmlPrefix)
              actual = actual.substring(prefixLength)
            }
          }
          // const actual =
          appHtmlPrefix
          expect(actual).to.equal(html)
        }
        if (afterStep) {
          stepName = `step ${index} (after)`
          await consumeSub(state, afterStep, state.processCommand)
        }
      })
    }
    if (after) {
      stepName = 'after'
      await consumeSub(state, after, state.processCommand)
    }
    // case: spec tag as 1 it by condition (not step)
    if (its && Deferred.isDeferred(its)) {
      its.resolve()
    }
  } catch (err) {
    // case: spec tag as 1 it by condition (not step)
    if (its && Deferred.isDeferred(its)) {
      if (steps.length > 1 && stepName) {
        err.name = stepName
      }
      its.reject(err)
    } else {
      throw err
    }
  }
}

const consumeExpects = async (state, _untilLabel, alreadyWritten = false) => {
  const {
    config: { writeHmr },
  } = state
  const untilLabel = String(_untilLabel)
  const { remainingExpects } = state
  let lastLabel = nullLabel

  if (!remainingExpects || !remainingExpects.length) {
    return lastLabel
  }

  while (remainingExpects.length > 0) {
    const next = remainingExpects.shift()
    const [label, expect] = next

    lastLabel = label

    if (!alreadyWritten) {
      const files = renderSpecs(state, label)
      await writeHmr(state.page, files)
    }

    await assertExpect(state, expect, label)

    if (label === untilLabel) {
      return label
    }
  }

  return lastLabel
}

const flushExpects = state => consumeExpects(state, nullLabel)

module.exports = {
  consumeExpects,
  flushExpects,
}
'use strict'

// adapted from: https://raw.githubusercontent.com/michelsalib/chai-shallow-deep-equal/master/chai-shallow-deep-equal.js
// licence: MIT https://github.com/michelsalib/chai-shallow-deep-equal/blob/master/package.json#L47

/* eslint-disable no-throw-literal */
/* globals define */

const chai = require('chai')
const _set = require('lodash.set')

;(function(plugin) {
  if (
    typeof require === 'function' &&
    typeof exports === 'object' &&
    typeof module === 'object'
  ) {
    // NodeJS
    module.exports = plugin
  } else if (typeof define === 'function' && define.amd) {
    // AMD
    define(function() {
      return plugin
    })
  } else {
    // Other environment (usually <script> tag): plug in to global chai instance directly.
    chai.use(plugin)
  }
})(function(chai) {
  const set = (obj, path, value) => {
    if (path) {
      _set(obj, path, value)
    }
  }

  function matchPattern(expect, actual, path, result, errors) {
    set(result, path, expect)

    // null value
    if (expect === null) {
      if (!(actual === null)) {
        errors.push(
          'Expected to have null but got "' +
            actual +
            '" at path "' +
            path +
            '".'
        )
        return false
      }
      return true
    }

    // undefined expected value
    if (typeof expect == 'undefined') {
      if (typeof actual != 'undefined') {
        errors.push(
          'Expected to have undefined but got "' +
            actual +
            '" at path "' +
            path +
            '".'
        )
        return false
      }
      return true
    }

    // scalar description
    if (/boolean|number|string/.test(typeof expect)) {
      if (expect != actual) {
        errors.push(
          'Expected to have "' +
            expect +
            '" but got "' +
            actual +
            '" at path "' +
            path +
            '".'
        )
        return false
      }
      return true
    }

    // regex
    if (expect instanceof RegExp) {
      if (!expect.test(actual)) {
        errors.push(
          `Expected to match ${expect} but got "${actual}" at path ${path}`
        )
        return false
      }
      set(result, path, actual)
      return true
    }

    // array length
    if (Array.isArray(expect)) {
      if (!Array.isArray(actual)) {
        errors.push(`Expected to have array but got ${actual} at path ${path}`)
      } else if (expect.length !== actual.length) {
        errors.push(
          `Expected to have an array of length ${expect.length} but got` +
            ` ${actual.length} at path ${path}`
        )
      }
    }

    // dates
    if (expect instanceof Date) {
      if (actual instanceof Date) {
        if (expect.getTime() != actual.getTime()) {
          errors.push(
            'Expected to have date "' +
              expect.toISOString() +
              '" but got ' +
              '"' +
              actual.toISOString() +
              '" at path "' +
              path +
              '".'
          )
        }
      } else {
        errors.push(
          'Expected to have date "' +
            expect.toISOString() +
            '" but got ' +
            '"' +
            actual +
            '" at path "' +
            path +
            '".'
        )
      }
    }

    if (actual === null) {
      errors.push(
        `Expected to have an array/object but got null at path ${path}`
      )
      return false
    }

    // array/object description
    for (const prop in expect) {
      if (
        typeof actual[prop] == 'undefined' &&
        typeof expect[prop] != 'undefined'
      ) {
        errors.push(`Expected "${prop}" field to be defined at path ${path}`)
      } else {
        matchPattern(
          expect[prop],
          actual[prop],
          path + (path ? '.' : '') + prop,
          result,
          errors
        )
      }
    }
  }

  chai.Assertion.addMethod('matchPattern', function(expect) {
    const result = Array.isArray(expect) ? [] : {}
    const errors = []
    matchPattern(expect, this._obj, '', result, errors)
    if (errors.length > 0) {
      let msg = errors.shift()
      if (errors.length > 0) {
        msg += ` (+ ${errors.length} more)`
      }
      // this.assert(false, msg, undefined, expect, this._obj, true)
      this.assert(false, msg, undefined, result, this._obj, true)
    }
  })

  chai.assert.matchPattern = function(val, exp, msg) {
    new chai.Assertion(val, msg).to.be.matchPattern(exp)
  }
})

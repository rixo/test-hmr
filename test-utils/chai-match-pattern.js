'use strict'

// adapted from: https://raw.githubusercontent.com/michelsalib/chai-shallow-deep-equal/master/chai-shallow-deep-equal.js
// licence: MIT https://github.com/michelsalib/chai-shallow-deep-equal/blob/master/package.json#L47

/* eslint-disable no-throw-literal */
/* globals define */

const chai = require('chai')

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
  function matchPattern(expect, actual, path) {
    // null value
    if (expect === null) {
      if (!(actual === null)) {
        throw 'Expected to have null but got "' +
          actual +
          '" at path "' +
          path +
          '".'
      }

      return true
    }

    // undefined expected value
    if (typeof expect == 'undefined') {
      if (typeof actual != 'undefined') {
        throw 'Expected to have undefined but got "' +
          actual +
          '" at path "' +
          path +
          '".'
      }

      return true
    }

    // scalar description
    if (/boolean|number|string/.test(typeof expect)) {
      if (expect != actual) {
        throw 'Expected to have "' +
          expect +
          '" but got "' +
          actual +
          '" at path "' +
          path +
          '".'
      }

      return true
    }

    // regex
    if (expect instanceof RegExp) {
      if (!expect.test(actual)) {
        throw `Expected to match ${expect} but got "${actual}" at path ${path}`
      }
    }

    // array length
    if (Array.isArray(expect)) {
      if (!Array.isArray(actual)) {
        throw `Expected to have array but got ${actual} at path ${path}`
      }
      if (expect.length !== actual.length) {
        throw `Expected to have an array of length ${expect.length} but got` +
          ` ${actual.length} at path ${path}`
      }
    }

    // dates
    if (expect instanceof Date) {
      if (actual instanceof Date) {
        if (expect.getTime() != actual.getTime()) {
          throw 'Expected to have date "' +
            expect.toISOString() +
            '" but got ' +
            '"' +
            actual.toISOString() +
            '" at path "' +
            path +
            '".'
        }
      } else {
        throw 'Expected to have date "' +
          expect.toISOString() +
          '" but got ' +
          '"' +
          actual +
          '" at path "' +
          path +
          '".'
      }
    }

    if (actual === null) {
      throw 'Expected to have an array/object but got null at path "' +
        path +
        '".'
    }

    // array/object description
    for (const prop in expect) {
      if (
        typeof actual[prop] == 'undefined' &&
        typeof expect[prop] != 'undefined'
      ) {
        throw 'Expected "' +
          prop +
          '" field to be defined at path "' +
          path +
          '".'
      }

      matchPattern(
        expect[prop],
        actual[prop],
        path + (path == '.' ? '' : '.') + prop
      )
    }

    return true
  }

  chai.Assertion.addMethod('matchPattern', function(expect) {
    try {
      matchPattern(expect, this._obj, '.')
    } catch (msg) {
      this.assert(false, msg, undefined, expect, this._obj, true)
    }
  })

  chai.assert.matchPattern = function(val, exp, msg) {
    new chai.Assertion(val, msg).to.be.matchPattern(exp)
  }
})

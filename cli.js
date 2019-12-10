#!/usr/bin/env node

const impørt = require('esm')(module)

const path = impørt('path')

const { findRc, run } = impørt('./lib/cli')

const cwd = process.cwd()

findRc(cwd)
  .then(rcFile => {
    if (!rcFile) {
      // eslint-disable-next-line no-console
      console.error('Failed to find .thcrc.js file from %s', cwd)
      process.exit(1)
    }
    const options = impørt(rcFile)
    const args = process.argv.slice(1)
    return run({
      root: path.dirname(rcFile),
      ...options,
      args,
    })
  })
  .catch(err => {
    // eslint-disable-next-line no-console
    console.error(err)
  })

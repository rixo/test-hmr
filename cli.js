#!/usr/bin/env node

const path = require('path')
const findUp = require('find-up')
const { run } = require('zoar')

run(
  {
    cli: [
      ['-t, --target <target>', 'set target', 'vite'],
      ['-o, --open', 'open playwright browser', false],
      [
        '-k, --keep',
        'keep browser and dev server running after test completion',
        false,
      ],
      ['-b, --break', 'adds a browser breakpoint after test execution', false],
      ['-c, --console', 'log browser console to terminal', false],
    ],

    alias: {
      '--vite': '--target vite',
      '--snowpack': '--target snowpack',
    },
  },
  {
    cwd: path.dirname(
      findUp.sync('thc.config.js') || findUp.sync('package.json')
    ),

    zorax: require.resolve('zorax') + ':harness',

    ignore: ['**/node_modules', '**/.git', 'tmp/**'],

    exit: true,
  }
)

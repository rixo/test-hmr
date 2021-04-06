#!/usr/bin/env node

import path from 'path'
import findUp from 'find-up'
import { run } from 'zoar'
import relative from 'require-relative'

const thcConfig = findUp.sync('test-hmr.config.js') || findUp.sync('.thcrc.js')

const cwd = path.dirname(thcConfig || findUp.sync('package.json'))

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
      ['--cfg [config]', 'use config file', thcConfig],
      ['--fixtures <dir>', 'fixtures directory'],
    ],

    alias: {
      '--vite': '--target vite',
      '--snowpack': '--target snowpack',
    },
  },
  {
    cwd,

    zorax: relative.resolve('zorax', cwd) + '::harness',

    ignore: ['**/node_modules', '**/.git', '**/*.bak', 'tmp/**'],

    exit: true,
  }
)

/**
 * Singleton exposing this run's options & config, from config file and dynamic
 * options passed via ZOAR_OPTIONS (i.e. options that are sent via message to
 * the test runner process).
 */

import path from 'path'

const { cfg: thcConfigFile } = global.ZOAR_OPTIONS

const loadThcConfig = async () =>
  thcConfigFile && (await import(thcConfigFile)).default

const cast = ({
  cwd = process.cwd(),
  target = 'vite',
  console: logConsole = false,
  open = false,
  keep = false,
  break: brk = false,
  createServer = null,
  fixtures = 'fixtures',
  fixturesDir = path.resolve(cwd, fixtures),
}) => ({
  cwd,
  target,
  console: logConsole,
  open,
  keep,
  break: brk,
  createServer,
  fixturesDir,
})

export default async () =>
  cast({
    ...(await loadThcConfig()),
    ...global.ZOAR_OPTIONS,
  })

import * as path from 'path'
import * as fs from 'fs'
import glob from 'fast-glob'

import { dedentAll, readFile } from '../../util'

const readFixtures = async (source, fs) => {
  const files = await glob(`${source}/**/*`, { fs })
  const promises = files.map(async file => [
    path.relative(source, file),
    await readFile(file, 'utf8'),
  ])
  const entries = await Promise.all(promises)
  return Object.fromEntries(entries)
}

export const resolveFixtures = async ({
  fixturesSource,
  fixturesPath,
  fs: _fs = fs,
}) => ({
  ...(fixturesPath && (await readFixtures(fixturesPath, _fs))),
  ...(fixturesSource && dedentAll(fixturesSource)),
})

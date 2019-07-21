# test-hmr

Testbed for Webpack HMR.

Spins Puppeteer + Web Dev Server with a virtual in-memory file system.

Test utils let you pilot the virtual FS, and wait until HMR update has been applied (by detecting the console message: "[HMR] App is up to date.").

# Usage

Create a bootstrap file pointing to the app under test:

```js
// test/bootstrap.js
const { bootstrap } = require('test-hmr')

bootstrap()
```

Require `test-hmr` to run your tests:

```bash
npx mocha --require test-hmr test
```

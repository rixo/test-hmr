# test-hmr

Testbed for Webpack HMR.

# Usage

Create a bootstrap file pointing to the app under test:

```js
// test/bootstrap.js
const path = require('path')
const { bootstrap } = require('test-hmr')

bootstrap({
  appPath: path.join(__dirname, 'app'),
})
```

Require `test-hmr` to run your tests:

```bash
npx mocha --require test-hmr test
```

# TODO

- [ ] e2e self tests (needs a mock webpack app)

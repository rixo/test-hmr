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

Run tests with your bootstrap file first:

```bash
npx mocha test/bootstrap.js 'test/**/*.spec.js'
```

# TODO

- [ ] e2e tests (needs a mock webpack app)

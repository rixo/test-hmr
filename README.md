# Svelte HMR Test Suite

Test suite for Svelte 3 HMR.

## Tests

Default tests are those that target HMR proper (as "system under test").

Tests utils are pretty involved and have there own test suite (under `test-utils/test`). Those are called "self tests".

HMR tests spin a real webpack dev server and puppeteer, so they're definitely integration/e2e tests (and unfortunately, that comes with some latency).

The self tests suite however is more oriented toward unit test level. For this reason, self tests that uses the browser are disabled when watching. Because they're more integration than unit, and they're slowing everything down, which can be annoying during dev of test utils.

### HMR tests

```bash
npm test
npm run test

npm run test:debug

npm run test:watch
```

### Self tests

```bash
npm run test:self

npm run test:self:debug

npm run test:self:watch
```

### All tests = HMR + self tests

```bash
npm run test:all

npm run test:all:debug

npm run test:all:watch
```

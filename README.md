# Svelte HMR Test Suite

Test suite for Svelte 3 HMR.

## Quick start

### Run HMR tests

```bash
npm test
npm run test

npm run test:watch

npm run test:debug
```

### Self (test utils) tests

```bash
npm run test:self

npm run test:self:watch

npm run test:self:debug
```

### All tests = HMR + self tests

```bash
npm run test:all

npm run test:all:watch

npm run test:all:debug
```

### Play with demo app

Launch dev server on `localhost:8080`:

```bash
cd app
npm run dev
```

## Tests

Default tests are those that target HMR proper (as "system under test").

Tests utils are pretty involved and have their own test suite (under `test-utils/test`). Those are called "self tests".

HMR tests spin a real webpack dev server and puppeteer, so they're definitely integration/e2e tests (and unfortunately, that comes with some latency).

The self tests suite however is more oriented toward unit test level. For this reason, self tests that uses the browser are disabled when watching. Because they're more integration than unit, and they're slowing everything down, which can be annoying during dev of test utils.

## Structure

### `/app`

The system under test: webpack + svelte + hmr

### `/app/test-server`

Test utils "insider". It will launch the actual webpack-dev-server that is used for testing. The dev server and webpack are quite sensitive to their root directory, so it's easier to have it under the app directory.

### `/app/test` tests for the system under test

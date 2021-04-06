/** @type {import("snowpack").SnowpackUserConfig } */
module.exports = {
  mount: {
    public: '/',
    src: '/dist',
  },
  plugins: [],
  packageOptions: {
    knownEntrypoints: [],
  },
  devOptions: {
    open: 'none',
    // hmrErrorOverlay: false,
  },
  buildOptions: {},
  routes: [],
  alias: {},
}

export default {
  hmrReadyMessage: '[ESM-HMR] listening for file changes...',

  hmrStartMessage: (msg) => msg.startsWith('[ESM-HMR] message: update '),

  // hmrCompleteMessage: '[ESM-HMR] up to date', // NOTE not implemented in Snowpack
  hmrCompleteMessage: (msg) => msg.startsWith('[ESM-HMR] message: update '),
  hmrCompleteDelay: 100, // TODO this is undeterministic!
}

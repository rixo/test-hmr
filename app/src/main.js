import App from './App.svelte'

const app = new App({
  target: document.querySelector('#app'),
  props: {
    name: 'world',
  },
})

window.app = app

export default app

/**
 *     yield beforeLoad(function*() {
 *       // ...
 *     })
 */

const beforeLoad = sub => ({ type, sub })

const init = (state, command) => {
  state.beforeLoad = command.sub
}

const type = beforeLoad.name

module.exports = Object.assign(beforeLoad, {
  type,
  init,
})

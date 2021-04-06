document.querySelector('h1').innerHTML = 'bim!'

if (import.meta.hot) {
  import.meta.hot.accept()
}

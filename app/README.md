# Svelte 3 HMR experiment

This is a fork of Svelte's [template-webpack](https://github.com/sveltejs/template-webpack.) intended to play & experiment with HMR before it is officially supported.

It relies on forked versions of [svelte-loader](https://github.com/sveltejs/svelte-loader) ([fork](https://github.com/rixo/svelte-loader/tree/hmr)), and [svelte-dev-helper](https://github.com/ekhaled/svelte-dev-helper) ([fork](https://github.com/rixo/svelte-dev-helper/tree/hmr)).

**Disclaimer** I am not affiliated with `svelte-loader` team, so this may be completely different to what will eventually be implemented officially.

## Get started

```bash
npx degit rixo/demo-svelte3-hmr svelte-hmr
cd svelte-hmr

npm install

npm run dev
```

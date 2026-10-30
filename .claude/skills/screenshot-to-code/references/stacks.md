# Stacks — standalone single-file replicas

For the throwaway-replica destination only. Inside an existing codebase, follow that
repo's stack instead of anything on this page.

The main file is a single HTML file, `index.html` unless told otherwise. It has to
run by opening it — no build step, no bundler, no `npm install`.

Snippets below are taken verbatim from `abi/screenshot-to-code`
(`backend/prompts/system_prompt.py`). Version pins are load-bearing; do not "update"
them casually.

## Tailwind

```html
<script src="https://cdn.tailwindcss.com"></script>
```

## html_css

Only HTML, CSS and JS. Do **not** pull in Tailwind.

## Bootstrap

```html
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-T3c6CoIi6uLrA9TneNEoa7RxnatzjcDSCmG1MXxSR1GAsXEV/Dwwykc2MPK8M2HN" crossorigin="anonymous">
```

## React

```html
<script src="https://cdn.jsdelivr.net/npm/react@18.0.0/umd/react.development.js"></script>
<script src="https://cdn.jsdelivr.net/npm/react-dom@18.0.0/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone@7.25.6/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
```

Pin Babel to exactly `7.25.6`. The unversioned URL now resolves to Babel 8, whose
automatic JSX runtime injects an `import` that breaks in-browser transforms. Never
use `https://cdn.babeljs.io/babel.min.js` — wrong version, guaranteed errors.

## Vue

```html
<script src="https://registry.npmmirror.com/vue/3.3.11/files/dist/vue.global.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
```

Use the global build:

```html
<div id="app">{{ message }}</div>
<script>
  const { createApp, ref } = Vue
  createApp({
    setup() {
      const message = ref('Hello vue!')
      return { message }
    }
  }).mount('#app')
</script>
```

## Ionic

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@ionic/core/dist/ionic/ionic.esm.js"></script>
<script nomodule src="https://cdn.jsdelivr.net/npm/@ionic/core/dist/ionic/ionic.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@ionic/core/css/ionic.bundle.css" />
<script src="https://cdn.tailwindcss.com"></script>
```

Icons — ionicons, at the end of the page, right before `</body>`:

```html
<script type="module">
    import ionicons from 'https://cdn.jsdelivr.net/npm/ionicons/+esm'
</script>
<script nomodule src="https://cdn.jsdelivr.net/npm/ionicons/dist/esm/ionicons.min.js"></script>
<link href="https://cdn.jsdelivr.net/npm/ionicons/dist/collection/components/icon/icon.min.css" rel="stylesheet">
```

## All stacks

- Google Fonts and other publicly accessible fonts are fine — match the face in the
  screenshot rather than defaulting to Inter.
- Icons, except on Ionic:

```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css">
```

## If the replica is going to be published as an Artifact

The Artifact CSP is narrower than this list. Scripts load only from
`cdnjs.cloudflare.com`, `cdn.jsdelivr.net/npm/`, `cdn.tailwindcss.com` and
`code.jquery.com`; stylesheets only from `fonts.googleapis.com`. Everything else —
`unpkg.com`, `registry.npmmirror.com`, external images, the Font Awesome stylesheet —
is blocked silently. Inline the CSS, embed assets as `data:` URIs, and pick UMD
builds from an allowed host.

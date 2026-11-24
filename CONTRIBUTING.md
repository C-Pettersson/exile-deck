# Contributing

- Run `npm test` and, for visual changes, `npm run render` and look at the images in `tools/out/`.
- Keep the plugin free of runtime dependencies.
- Anything that sends input must need a key press, do one thing per press, and stay limited to the active game window.
- Do not add game icon files, or code that reads game memory or files.
- Network calls go through `bin/api.js`, which caches, revalidates and backs off.

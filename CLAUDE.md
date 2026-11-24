# Exile Deck: Stream Deck plugin for Path of Exile

Read `docs/DEVELOPMENT.md` for layout and commands.

- This repository is public; the poe.how backend is private. Never add backend code, internal routes, infrastructure
  details or private notes here. Only `https://poe.how/api/deck/v1` is called.
- If `docs/RELEASE_PLAN.md`, `docs/NOTES.md` or `docs/API.md` exist locally, they are private and git-ignored. Read
  them, never commit or quote them.
- No runtime dependencies. Must run on Stream Deck's bundled Node 20.
- One game action per key press, only while Path of Exile is the active window.
- Never change UUIDs after the first Marketplace release.
- Run `npm test` before finishing; for visual changes run `npm run render` and look at the images.

# Ferroprint

- To draw a diagram with the user in real time, use live mode. The user runs `npm run live` and keeps http://localhost:5173/ open. You edit `live/diagram.json` (or write Mermaid to `live/diagram.mmd` for a quick layout of the open sheet), then read `live/diagram.status.json`. [docs/LIVE.md](docs/LIVE.md) has the workflow, the project format and layout tips.
- You cannot see the tab. After a larger change, run `npm run export -- live/diagram.json --out <scratch dir>` and look at the PNG. Never export by opening the live server in a browser: that tab joins the live session.
- A change under `src/` reloads the user's live tab and clears its undo history. Tell the user before you change source code during a live session.
- Checks: `npm test` and `npm run lint`.

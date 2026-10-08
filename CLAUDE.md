# Ferroprint

- To draw a diagram with the user in real time, use live mode. The user runs `npm run live` and keeps http://localhost:5173/ open. You edit `live/diagram.json` (or write Mermaid to `live/diagram.mmd` for a quick layout of the open sheet), then read `live/diagram.status.json`. [docs/LIVE.md](docs/LIVE.md) has the workflow and the project format.
- Checks: `npm test` and `npm run lint`.

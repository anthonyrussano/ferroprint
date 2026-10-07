<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo-blueprint.svg" />
    <img alt="Ferroprint" src="docs/logo-whiteprint.svg" width="600" />
  </picture>
</p>

# Ferroprint

Ferroprint is a blueprint-style sketchpad for system diagrams, flows, interface wireframes and floor plans. It runs in the browser and saves your work in the browser's `localStorage`. No account and no server are necessary.

Open the app: https://bjarneo.github.io/ferroprint/

## What you can do

- Draw boxes, services, databases, queues, actors, zones, decisions, windows, buttons, inputs, images, rooms, doors, notes and text.
- Open the library (`/`) for 69 more symbols in 5 groups:
  - Plan: doors, double doors, sliding doors, wall windows, openings, stairs and columns.
  - Furniture: beds, sofas, tables, a desk, bathroom and kitchen fixtures, a closet, a washer, plants and a car.
  - System: servers, cloud, browser, phone, monitor, auth, functions, containers, internet, files, users, email, storage, firewall, scheduler and secrets.
  - Flow: data, document, subprocess, manual input, delay, preparation, manual step, data store and page links.
  - Interface: checkbox, radio, toggle, dropdown, search, slider, progress, avatar, card, nav bar, tabs, dialog, list, text block, table, chart and video.
- Use 2,000 cloud icons from AWS, Azure, Google Cloud and Alibaba Cloud. Ferroprint redraws them as line art, so they match the sheet.
- Search the library, click a symbol to place it, or drag a symbol onto the sheet. The palette keeps the last 3 symbols that you used.
- Pin any library shape or cloud icon to the toolbar with the pin on its tile. To unpin a shape, right-click it in the toolbar, or use its pin again.
- Rotate doors and furniture 90° with `Shift R`, and mirror them with `Shift H`. Plan symbols use real sizes: on a sheet in feet, one grid square is 1 ft.
- Frame cloud diagrams with boundary frames: AWS Cloud, Region, VPC and subnets, Azure subscriptions, resource groups and virtual networks, Google Cloud projects and VPC networks, and Alibaba Cloud regions, VPCs and vSwitches. Each frame shows the provider's group icon in its tab.
- Draw UML class diagrams with classes, abstract classes, interfaces, enums and packages from the library. A class box grows to fit its members. Double-click the name, the attributes or the operations to edit them in place. In the attributes and operations, Enter adds a line, and `Ctrl Enter` saves.
- Set a UML relation on a connector: association, inheritance, realization, dependency, aggregation or composition. Add a multiplicity at each end, such as `1` or `0..*`.
- Start a sheet from a template: an AWS three-tier web app, an Azure hub-and-spoke network, a Google Cloud data pipeline, an Alibaba Cloud web app, a class diagram, a furnished apartment, a checkout flow or a microservices overview.
- Connect shapes with elbow, straight or curved connectors. Drag from a port to fix the side where a connector leaves a shape, and release on a port to fix the side where it arrives. Drag the round handle on a selected connector to add a bend. Double-click a bend to remove it.
- Group shapes with `Ctrl G`, so they select and move as one. `Ctrl`-click selects one shape inside a group. Lock a shape with `Ctrl Shift L`, so it does not move. A locked background plan lets clicks through to the shapes on top.
- Turn on clean mode with **Clean** in the top bar or `Ctrl \` (`⌘\` on macOS). Clean mode shows only the toolbar and the drawing. A click on a shape opens the inspector, so you can still edit it. To show everything again, press the same keys or use **SHOW ALL** at the top of the toolbar.
- Share a project with a link. The link holds the whole project in its `#` part, which the browser does not send to a server.
- Draw freehand strokes and walls. Hold Shift to snap a wall to 45°.
- Organize a project in numbered sheets, each with its own title block and drawing units (px, ft or m).
- Switch between a blueprint (white on blue) and a whiteprint (blue on white) look.
- Export a sheet as PNG or SVG with a title block. Export the full project as JSON.

Press `?` in the app to see all keyboard shortcuts.

## How saving works

- Every change saves to `localStorage` in this browser after a short delay. The top bar shows `SAVED`, `SAVING` or `NOT SAVED`.
- Press `Ctrl S` (`⌘S` on macOS) to save at once.
- If the app is open in two tabs, each tab takes the changes that the other tab saves.
- `localStorage` belongs to one browser on one device. To move a project or keep a backup, use **Export JSON**, then **Open** the file on the other device.
- If the browser blocks storage or the storage is full, the top bar shows `NOT SAVED`. Export JSON to keep your work.
- A blank project from **New**, and **Open**, replace the current project. The message that follows has an **UNDO** button that brings the previous project back. A template or a blank sheet joins the current project.
- When you open a share link and you already have a project, Ferroprint asks if it adds the shared sheets to your project or replaces your project. On a first visit, the shared project opens at once.

## Cloud icons

The library holds the official architecture icons of 4 cloud providers:

| Provider | Icons | Source |
| --- | --- | --- |
| AWS | 806 | [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/), release 2026-07-31: services, resources, categories and groups |
| Azure | 637 | [Azure architecture icons](https://learn.microsoft.com/en-us/azure/architecture/icons/), V24 |
| Google Cloud | 251 | [Google Cloud icons](https://cloud.google.com/icons): products, core products and categories |
| Alibaba Cloud | 306 | [Alibaba Cloud Design Center](https://www.iconfont.cn/user/detail?uid=6856114), from the [alibaba-cloud-icons](https://github.com/mcsrainbow/alibaba-cloud-icons) collection |

`scripts/cloud-icons.mjs` converts each icon to ink line art. It writes one file per provider to `public/cloud/`. The app loads a provider file the first time that you open that provider, search in All, or open a sheet that uses its icons.

To rebuild the icon files, run:

```sh
npm run icons
```

The script needs `curl`, `unzip` and `git`. It keeps the downloads in `.icon-cache/`. To rebuild one provider, give its id: `npm run icons -- azure`.

The icons are trademarks of Amazon, Microsoft, Google and Alibaba. Each provider permits the use of its icons in architecture diagrams. Read the provider terms before you use the icons for a different purpose. Microsoft asks that Azure icons appear as they do in Azure. Ferroprint shows all cloud icons as monochrome line art, so that they match the drawing style.

## Run it locally

You need Node.js 20.19, or 22.12 or later.

```sh
npm install
npm run dev
```

To run the tests, run:

```sh
npm test
```

The tests are in `test/`. They use Vitest and run in Node.

To make a production build in `dist/`, run:

```sh
npm run build
npm run preview
```

## Deploy

The workflow in `.github/workflows/pages.yml` runs the tests, builds the app and publishes `dist/` to GitHub Pages on every push to `main`. If a test fails, the workflow stops and the site does not change. The build uses relative asset paths, so it works from any repository name.

## Project layout

| File | Purpose |
| --- | --- |
| `src/engine.js` | Shapes, themes, geometry, units, document validation and export helpers |
| `src/draw.jsx` | SVG drawing for shapes, connectors and dimension marks |
| `src/library.jsx` | Library symbols, their default sizes and label positions |
| `src/cloud.js` | Loads the cloud icon sets on demand, and holds the boundary frames |
| `src/templates.js` | Starter templates |
| `src/share.js` | Share links: the project compressed into the URL |
| `scripts/cloud-icons.mjs` | Converts the official cloud icons to line art |
| `src/Editor.jsx` | Editor state, pointer and keyboard input, history, sheets, files and autosave |
| `src/chrome.jsx` | Toolbars, inspector, panels, title block and status bar |
| `src/storage.js` | Safe access to `localStorage` |

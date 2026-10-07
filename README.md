<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo-blueprint.svg" />
    <img alt="Ferroprint" src="docs/logo-whiteprint.svg" width="600" />
  </picture>
</p>

# Ferroprint

Ferroprint is a blueprint-style sketchpad for system diagrams, flows, interface wireframes and floor plans. It runs in the browser and keeps your projects in the browser's IndexedDB. No account and no server are necessary.

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
- An elbow connector without bends goes around the shapes in its way. Zones, lines and freehand strokes are not in the way. A bend that you add on a route around shapes keeps the rest of the route.
- To move an end of a connector to a different shape, select the connector and drag the end. Release the end on a port to fix the side.
- Draw free arrows with the arrow tool (`A`). A line can have an arrowhead at its end or at both ends. **REVERSE** swaps the ends.
- Select more than one item to set the line, the fill, the text size, the arrows or the route of all of them at once. **TO FRONT** and **TO BACK** move all the selected shapes.
- Copy shapes with `Ctrl C` and paste them with `Ctrl V` in any tab and any project. The clipboard holds the shapes as JSON text.
- Paste an image or plain text, or drop an image file on the sheet. An image becomes an image shape, and text becomes a text label. To put a picture in an image shape, select the shape and use **CHOOSE IMAGE**. Ferroprint scales an image down to 1600 px on its longest side.
- Press `Shift C` to copy the selection as a PNG. With nothing selected, `Shift C` copies the whole sheet.
- Drop a Ferroprint JSON file on the sheet to open it as a new project.
- Group shapes with `Ctrl G`, so they select and move as one. `Ctrl`-click selects one shape inside a group. Lock a shape with `Ctrl Shift L`, so it does not move. A locked background plan lets clicks through to the shapes on top.
- Turn on clean mode with **Clean** in the top bar or `Ctrl \` (`⌘\` on macOS). Clean mode shows only the toolbar and the drawing. A click on a shape opens the inspector, so you can still edit it. To show everything again, press the same keys or use **SHOW ALL** at the top of the toolbar.
- Share a project with a link. The link holds the whole project in its `#` part, which the browser does not send to a server.
- Draw freehand strokes and walls. Hold Shift to snap a wall to 45°.
- Organize a project in numbered sheets, each with its own title block and drawing units (px, ft or m).
- Undo and redo every change to the project with `Ctrl Z` and `Ctrl Shift Z`: shapes, connectors, sheets, the title block and the setup. Undo goes back to the sheet where the change happened. It does not change the pan or the zoom.
- Switch between a blueprint (white on blue) and a whiteprint (blue on white) look.
- Export a sheet as PNG or SVG with a title block. Export all sheets as one PDF, with one sheet on each A3 page and a bookmark for each sheet. Export the full project as JSON.

Press `?` in the app to see all keyboard shortcuts.

## Offline and privacy

- After the first visit, Ferroprint opens without a network. A service worker keeps the app, the fonts and the 4 cloud icon sets in the browser.
- The fonts are part of the app. Ferroprint sends no request to a font service or to any other server.
- A new version replaces the old one when you open Ferroprint with a network.
- An exported SVG or PNG carries its fonts, so it looks the same on a computer without these fonts.

## How saving works

- Every change saves to IndexedDB in this browser after a short delay. The top bar shows `SAVED`, `SAVING` or `NOT SAVED`.
- Press `Ctrl S` (`⌘S` on macOS) to save at once.
- **Projects** lists every project in this browser. Click a project to open it. **COPY** makes a copy, and **DELETE** asks for a second click. The message after a delete has an **UNDO** button.
- **New**, **Open** and a share link make a new project. The open project stays in the list, so nothing is replaced.
- A template or a blank sheet joins the open project.
- Each tab remembers its open project, so a reload opens the same project. A new tab opens the last project that you opened.
- If 2 tabs show the same project, each tab takes the changes that the other tab saves.
- If a tab closes before a save ends, the tab keeps the changes in `localStorage`. The next start puts them into the project.
- The projects belong to one browser on one device. The browser can delete them when the disk is full, or when you clear the site data. To move a project or keep a backup, use **Export JSON**, then **Open** the file on the other device.
- If the browser has no IndexedDB, the projects go to `localStorage`, which holds about 5 MB. If the browser blocks all storage, the top bar shows `NOT SAVED`. Export JSON to keep your work.
- Ferroprint 1 kept one project in `localStorage`. The first start of this version moves that project into the list.
- When you open a share link, Ferroprint asks if it opens the shared project as a new project or adds its sheets to the open project. On a first visit, the shared project opens at once.

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

To run the tests and the linter, run:

```sh
npm test
npm run lint
```

The tests are in `test/`. They use Vitest and run in Node.

To make a production build in `dist/`, run:

```sh
npm run build
npm run preview
```

## Deploy

The workflow in `.github/workflows/pages.yml` runs the linter and the tests, builds the app and publishes `dist/` to GitHub Pages on every push to `main`. If a test fails, the workflow stops and the site does not change. The build uses relative asset paths, so it works from any repository name.

## Project layout

| File | Purpose |
| --- | --- |
| `src/engine.js` | Shapes, themes, geometry, units, document validation and export helpers |
| `src/draw.jsx` | SVG drawing for shapes, connectors and dimension marks |
| `src/library.jsx` | Library symbols, their default sizes and label positions |
| `src/pdf.js` | A small PDF writer for the PDF export |
| `src/route.js` | Routes for elbow connectors around shapes |
| `src/cloud.js` | Loads the cloud icon sets on demand, and holds the boundary frames |
| `src/templates.js` | Starter templates |
| `src/share.js` | Share links: the project compressed into the URL |
| `scripts/cloud-icons.mjs` | Converts the official cloud icons to line art |
| `src/Editor.jsx` | Editor state, lifecycle and layout |
| `src/editor/pointer.js` | Pan, zoom, select, move, resize, connect and draw with the pointer |
| `src/editor/commands.js` | Label editing, commands on the selection, and the keyboard |
| `src/editor/project.js` | Autosave, sheets, templates, share links and JSON files |
| `src/editor/history.js` | Undo and redo for the whole project |
| `src/editor/exporter.js` | PNG and SVG export |
| `src/editor/canvas.jsx` | The sheet, the selection overlay and the label editor |
| `src/chrome.jsx` | Toolbars, inspector, panels, title block and status bar |
| `src/fonts.js` | The bundled fonts, and the font files that an exported SVG carries |
| `scripts/service-worker.mjs` | A Vite plugin that writes `sw.js` with the files to keep for offline use |
| `src/storage.js` | The project store in IndexedDB, with `localStorage` when IndexedDB is missing |

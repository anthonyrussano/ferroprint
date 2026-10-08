# Live file

Live mode keeps the open tab and a project file on disk in step. An agent or a text editor writes the file, and the tab draws the change within a second. A change in the tab goes back to the file. Use it to draw a diagram together with an agent, for example in a meeting.

Live mode is for development only. The build and the published app do not have it.

## Start

```sh
npm run live
```

Open http://localhost:5173/. The tab opens the project **Live session** and follows `live/diagram.json`. If the file does not exist, the tab writes it.

To follow a different file, give its path:

```sh
FERROPRINT_LIVE=plans/network.json npm run dev
```

The `live/` folder is in `.gitignore`.

## The files

| File | Who writes it | What it does |
| --- | --- | --- |
| `live/diagram.json` | The agent and the tab | The whole project. A change to it redraws the tab. A change in the tab writes it again. |
| `live/diagram.mmd` | The agent | Mermaid text. A change to it lays out the open sheet again, with the shapes and connectors of the Mermaid diagram. |
| `live/diagram.status.json` | The tab | What the tab did with the last change: `ok`, a `message`, the shapes and connectors it `dropped`, the `active` sheet and a summary of each sheet. |

## How the tab takes a change

- The tab checks the file with the same rules as **Open**. It leaves out a shape or a connector that is not valid, and `diagram.status.json` gives the number that it left out.
- Then the tab writes the file again in its own form: each item gets all its fields and an id. Read the file again before the next change.
- If the file is not valid JSON, the tab keeps its drawing, and the status and a message in the tab give the error.
- `Ctrl Z` in the tab takes back a change from the file. The undo goes to the file too.
- A change waits while the user drags a shape or edits a label.
- The tab keeps its own pan and zoom. The file has no `view`, so a pan or a zoom does not change the file.
- The tab shows the sheet in `active` when `active` changes. To show a new sheet to the user, set `active` to its id.
- If the user opens a different project in the tab, the tab stops following the file. A change to the file then shows a message with **SHOW**.
- Take turns. If the user and the agent change the project at the same moment, the change that comes last replaces the other one.

## Workflow for agents

1. Read `live/diagram.json`.
2. To start a sheet with a good layout, write Mermaid to `live/diagram.mmd`. Ferroprint lays out the open sheet with dagre and routes the connectors.
3. To change details, edit `live/diagram.json`: add cloud icons, move shapes, add zones, sheets and notes. Make small edits, and keep the ids.
4. Wait about 1 second, then read `live/diagram.status.json`. If `ok` is `false`, fix the problem that `message` names.
5. Read `live/diagram.json` again before the next edit, because the tab can change it.

The user exports from the tab: PNG, SVG, PDF (all sheets) or JSON.

## Project format

```json
{
  "meta": { "project": "Payments platform", "drawnBy": "AR", "date": "2026-10-08", "rev": "A" },
  "settings": { "lettering": "hand", "caps": true, "grid": 20, "route": "elbow" },
  "active": "s1",
  "sheets": [
    {
      "id": "s1", "number": "A-101", "name": "Web tier", "unit": "px",
      "nodes": [
        { "id": "users", "type": "actor", "x": 0, "y": 40, "w": 60, "h": 90, "label": "Customers" },
        { "id": "alb", "type": "cloud", "icon": "aws/elastic-load-balancing", "x": 200, "y": 60, "w": 48, "h": 48, "label": "ALB" },
        { "id": "api", "type": "service", "x": 360, "y": 40, "w": 160, "h": 80, "label": "API", "sub": "ECS Fargate" }
      ],
      "edges": [
        { "id": "e1", "from": "users", "to": "alb" },
        { "id": "e2", "from": "alb", "to": "api", "label": "HTTPS" }
      ]
    }
  ]
}
```

- `settings.lettering` is `hand` or `technical`. `settings.grid` is 10, 20 or 25. `settings.route` is `elbow`, `straight` or `curve`.
- `x` and `y` are the top-left corner in pixels. Put shapes on the grid, at multiples of 20.
- Shapes draw in their order. Zones always draw behind the other shapes.
- Ids have 1 to 16 lowercase letters and digits. The ids of shapes and connectors in a sheet must be different.

### Shapes (`nodes`)

| Field | Values |
| --- | --- |
| `id`, `type`, `x`, `y`, `w`, `h` | Necessary. |
| `label`, `sub` | The text, and a second line in small type. `\n` breaks a line. |
| `dashed` | `true` for a dashed outline. |
| `fill` | `none`, `tint`, `hatch` or `paper`. |
| `size` | The text size: `s`, `m` or `l`. |
| `rot`, `flip` | Plan symbols and furniture: `rot` is 0, 90, 180 or 270. |
| `icon` | `cloud` shapes, and zones with a provider icon in the tab: `<provider>/<icon id>`. |
| `group` | Shapes with the same `group` id select and move as one. |
| `locked` | `true` stops the shape from moving. |

The palette types and their usual sizes:

| Type | Size | Type | Size |
| --- | --- | --- | --- |
| `box` | 160 × 80 | `terminal` | 140 × 56 |
| `service` | 160 × 80 | `window` | 360 × 260 |
| `database` | 120 × 110 | `button` | 120 × 40 |
| `queue` | 200 × 70 | `input` | 240 × 40 |
| `actor` | 60 × 90 | `image` | 160 × 120 |
| `zone` | 420 × 280 | `room` | 240 × 200 |
| `decision` | 160 × 100 | `note` | 200 × 120 |
| `text` | 160 × 40 | `cloud` | 48 × 48, the label goes below |

The library adds more types, for example `server`, `container`, `function`, `bucket`, `firewall`, `globe`, `users`, `browser`, `mobile`, `lock`, `key`, `clock`, `mail`, `file`, `data`, `fdoc`, `subproc`, `store`, `door`, `stairs` and `table`. To list each type with its size, run:

```sh
grep -oE "id: '[a-z0-9]+', name: '[^']+', w: [0-9]+, h: [0-9]+" src/library.jsx
```

`class` shapes are UML classes: `kind` is `class`, `abstract`, `interface` or `enum`, and `attrs` and `ops` hold one member on each line.

### Cloud icons

A cloud icon is a `cloud` shape with an `icon` key such as `aws/amazon-ec2`, `azure/virtual-machine`, `gcp/cloud-run` or `alibaba/ecs-elastic-compute-service`. To find a key, search the icon names:

```sh
node -e "const [p,q]=process.argv.slice(1),s=require('./public/cloud/'+p+'.json');for(const[k,v]of Object.entries(s.icons))if(new RegExp(q,'i').test(v.n+' '+k))console.log(p+'/'+k,'—',v.n)" aws lambda
```

The providers are `aws`, `azure`, `gcp` and `alibaba`. A key that does not exist draws a dashed placeholder, so check each key with the search.

### Zones and boundary frames

A `zone` is a labeled area behind other shapes, for a VPC, a subnet or a team. Zones of a size from 320 × 200 to 640 × 420 are usual. A zone with an `icon` is a boundary frame, with the provider's group icon in its tab:

| Frame | `icon` | `dashed` |
| --- | --- | --- |
| AWS Cloud | `aws/aws-cloud-group` | `false` |
| AWS Account | `aws/aws-account-group` | `false` |
| Region | `aws/region-group` | `true` |
| VPC | `aws/virtual-private-cloud-vpc-group` | `false` |
| Public subnet / private subnet | `aws/public-subnet-group`, `aws/private-subnet-group` | `false` |
| Auto Scaling group | `aws/auto-scaling-group-group` | `true` |
| Corporate data center | `aws/corporate-data-center-group` | `false` |
| Azure subscription / virtual network | `azure/subscriptions`, `azure/virtual-networks` | `false` |
| Azure resource group / subnet | `azure/resource-groups`, `azure/subnet` | `true` |
| Google Cloud project / VPC network | `gcp/project`, `gcp/virtual-private-cloud` | `false` |
| Alibaba Cloud VPC / vSwitch | `alibaba/vpc-virtual-private-cloud`, `alibaba/vswitch` | `false`, `true` |

A zone without an `icon`, such as an availability zone, is a plain dashed zone.

### Connectors (`edges`)

| Field | Values |
| --- | --- |
| `id`, `from`, `to` | Necessary. `from` and `to` are shape ids on the same sheet. |
| `label` | The text on the connector. |
| `route` | `elbow` (default), `straight` or `curve`. An elbow connector without bends goes around the shapes in its way. |
| `arrow` | `end` (default), `both` or `none`. |
| `dashed` | `true` for a dashed line, for example async calls. |
| `fromSide`, `toSide` | `top`, `right`, `bottom` or `left`, to fix where the connector meets the shape. |
| `rel` | UML: `assoc`, `inherit`, `realize`, `depend`, `aggregate` or `compose`. `m1` and `m2` are multiplicities such as `0..*`. |

Leave out `pts` (bends). The tab routes elbow connectors itself.

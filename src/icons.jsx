// Tool palette: groups, icons and tooltips.
const I = (children, sw = 1.4, extra) => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: sw, ...extra }}>{children}</svg>
);

export const ICONS = {
  select: I(<path d="M5 3 L5 16 L8.5 12.6 L11 18 L13 17 L10.6 11.7 L15 11.5 Z" />),
  hand: I(<path d="M10 2 V18 M2 10 H18 M7.5 4.5 L10 2 L12.5 4.5 M7.5 15.5 L10 18 L12.5 15.5 M4.5 7.5 L2 10 L4.5 12.5 M15.5 7.5 L18 10 L15.5 12.5" />),
  connector: I(<><path d="M3 5 H10 V15 H14" /><path d="M14 12.5 L17.5 15 L14 17.5 Z" style={{ fill: 'currentColor' }} /></>),
  pen: I(<path d="M3 14 C5 8 8 8 9 12 C10 16 13 15 15 9 L17 5" />, 1.4, { strokeLinecap: 'round' }),
  line: I(<path d="M4 16 L16 4" />, 3),
  arrow: I(<><path d="M4 16 L14.5 5.5" /><path d="M16.5 3.5 L9.5 5.6 L14.4 10.5 Z" style={{ fill: 'currentColor' }} /></>, 1.6),
  box: I(<rect x="2" y="5" width="16" height="10" />),
  service: I(<rect x="2" y="5" width="16" height="10" rx="3.5" />),
  database: I(<><path d="M4 5 V15 A6 2.4 0 0 0 16 15 V5" /><ellipse cx="10" cy="5" rx="6" ry="2.4" /></>),
  queue: I(<><path d="M15 5 H5 A2.4 5 0 0 0 5 15 H15" /><ellipse cx="15" cy="10" rx="2.4" ry="5" /></>),
  actor: I(<><circle cx="10" cy="4.5" r="2.5" /><path d="M10 7 V12.5 M5 9.5 H15 M10 12.5 L6 18 M10 12.5 L14 18" /></>),
  zone: I(<><rect x="2" y="3" width="16" height="14" style={{ strokeDasharray: '2.2 1.8' }} /><rect x="2" y="3" width="7" height="4" /></>),
  decision: I(<path d="M10 2 L18 10 L10 18 L2 10 Z" />),
  terminal: I(<rect x="2" y="6" width="16" height="8" rx="4" />),
  window: I(<><rect x="2" y="3" width="16" height="14" /><path d="M2 7 H18" /></>),
  button: I(<><rect x="3" y="6.5" width="14" height="7" rx="2" /><path d="M7.5 10 H12.5" /></>),
  input: I(<><rect x="2" y="6.5" width="16" height="7" /><path d="M5 8.5 V11.5" /></>),
  image: I(<><rect x="2" y="4" width="16" height="12" /><path d="M2 4 L18 16 M18 4 L2 16" /></>),
  room: I(<rect x="3" y="3" width="14" height="14" />, 2.6),
  door: I(<><path d="M4 17 V4" style={{ strokeWidth: 2.2 }} /><path d="M16 17 A12 13 0 0 0 4 4" style={{ strokeDasharray: '2 1.6' }} /></>, 1.2),
  note: I(<path d="M3 3 H13 L17 7 V17 H3 Z M13 3 V7 H17" />),
  text: I(<path d="M5 4 H15 M10 4 V16 M7.5 16 H12.5" />)
};

export const LIBRARY_ICON = I(<><rect x="3" y="3" width="6" height="6" /><rect x="11" y="3" width="6" height="6" /><rect x="3" y="11" width="6" height="6" /><path d="M14 11 V17 M11 14 H17" /></>);

export const PIN_ICON = <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 }}><path d="M4 1.5 H8 L7.4 5 L9.5 7 H2.5 L4.6 5 Z M6 7 V10.5" strokeLinejoin="round" /></svg>;

export const PALETTE = [
  { label: 'Draw', tools: ['select', 'hand', 'connector', 'arrow', 'pen', 'line'] },
  { label: 'System', tools: ['box', 'service', 'database', 'queue', 'actor', 'zone'] },
  { label: 'Flow', tools: ['decision', 'terminal'] },
  { label: 'Interface', tools: ['window', 'button', 'input', 'image'] },
  { label: 'Plan', tools: ['room', 'door'] },
  { label: 'Notes', tools: ['note', 'text'] }
];

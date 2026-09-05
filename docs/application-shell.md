# Authenticated application shell

The authenticated shell translates the approved layout in
`.model/piercingsys-finalmodelfornow.html` into the React Router application.
It preserves the existing feature routes and authorization model while providing
the shared visual frame for current and future pages.

## Design and behavior

- Desktop and tablet layouts use the approved outlined sidebar, warm paper
  palette, asymmetric radii, branded account card, route heading, and Manila
  date/location treatment.
- Navigation is derived from `routeAccess.ts`; the shell does not define another
  access matrix. Owner sees all eight routes and Staff sees Dashboard and Clients.
- Active destinations use React Router's `NavLink` state. Direct URL access
  remains protected by the independent route guards.
- The local Piercing Corner logo is reused from Login; no external image request
  or new asset is introduced.
- Small screens use a menu-controlled sidebar with explicit expanded state,
  close controls, scrim dismissal, and Escape-key support. This keeps every
  authorized route reachable where the static prototype hid its sidebar.
- The signed-in account panel shows display name, role, initials, and logout.

Placeholder feature cards now share the shell's visual language. This styling
does not implement or simulate their deferred domain behavior.

## Verification

Focused React Testing Library coverage verifies canonical Owner/Staff navigation,
active-route state, responsive menu interaction, route headings, account display,
and logout. The full frontend lint, build, and test checks remain required after
shell changes.

The reference HTML and context files remain unchanged.

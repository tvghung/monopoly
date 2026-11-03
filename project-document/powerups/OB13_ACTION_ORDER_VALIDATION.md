# OB-13 reward action order validation

CURRENT DEVELOPMENT — built on main452d9b58937713b7be0c47b00e59a8af4787e9bc (OB-12). Product1.11.2/protocol18/snapshot16 unchanged; no release publication.

## Change

RewardDecision footer DOM is Decline then Claim. Claim retains its original primary styling, callback and busy/disabled guards, and declares the shared Modal autofocus target. Restore/reconnect into a revealed decision focuses Claim rather than rejection. Wrapping follows DOM order; no global Enter shortcut, extra confirmation or gameplay command change. Full hand still hides Claim and uses existing REPLACE/DECLINE. Owned activation remains unchanged without a Decline-new-card action.

## Verification

- PowerUpPanel suite24 passed: existing selection lock, ACK gap, busy/double-submit, owner/reward/replace/decline/activation coverage plus new DOM order, safe initial/read-only focus and correct Decline callback assertions.
- Chromium production and packaged Electron acceptance exercise VI/EN at1440×900,1280×720,900×500,667×375,760×280. Ten action cases each assert DOM/visual order, viewport/footer bounds, no document overflow, Tab/Shift+Tab, actual CLAIM or DECLINE outcome and inventory; first case in each locale reconnects into a revealed reward and checks Claim autofocus and double-click. English runs with OS/game reduced motion. Full-hand case checks no fake Claim, three replacement actions and committed correct inventory.
- Typecheck through production build, full lint, docs validator and Windows package are checked; required CI/Docs on the final head are recorded in Jira. No backend/schema changes in OB-13.
- Wide and760×280 screenshots were inspected: the shared scrollable body keeps the sticky action footer reachable and both labels readable.

Reproduce after pnpm install --frozen-lockfile and pnpm desktop:package: node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/powerUpActionOrderAcceptance.check.mjs; add --native for packaged Electron. [Browser evidence](ob13-evidence/browser/evidence.json), [native evidence](ob13-evidence/native/evidence.json), [small English native](ob13-evidence/native/en-760x280.png).

## Owner UAT

Use the merge commit recorded in Jira, Node24/pnpm11.15.1; pnpm install --frozen-lockfile, pnpm desktop:package and pnpm desktop:run:packaged. Reveal two independent rewards and use left Decline/right Claim; check keyboard focus, Enter/Space, VI/EN, reconnect, busy/disconnected controls, full inventory REPLACE and existing owned activation. Stop by closing the app.

Owner UAT NOT RUN. Physical GPU/macOS/cross-device/full-match subjective acceptance remains manual; Dev browser/native checks are not Owner sign-off.

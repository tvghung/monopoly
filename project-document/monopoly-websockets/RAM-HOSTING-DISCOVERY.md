# RAM hosting migration — discovery record

## Findings

- The former desktop host started managed PostgreSQL, ran SQL migrations, then spawned an Electron utility process for the authoritative Express/Socket.IO server. Repository interfaces already separated game commands from storage.
- `InMemoryPersistenceStore` already implemented room, session and offer repositories with cloned transactions and aggregate version checks. Direct repository writes needed serialization with those transactions.
- LAN discovery used a Boolean room lookup and did not require PostgreSQL or Internet once connected to the active repository. The desktop shell already owned helper start, stop, health polling and port selection.
- Online hosting already had a Quick Tunnel adapter and optional registry. A full invitation URL supplies both public endpoint and room code, so the registry is unnecessary for link joining. Browser clients and Socket.IO can use the same HTTPS origin.
- The previous helper recovery path could start a replacement server under the old match identity. That behavior conflicts with volatile authority; a helper loss must terminate that match.

## Migration approach

Each `startAuthoritativeServer` call creates a fresh RAM store. Direct writes and room transactions use one queue. The desktop host owns one helper and, for Online mode, one bundled verified `cloudflared` process. The public link is exposed only after the HTTPS page and readiness route work; room readiness is checked through the public route. An unexpected helper exit stops the tunnel and reports a terminal failure. A replacement helper begins empty and rejects old room codes and tokens. SQL migrations, managed PostgreSQL, database environment variables and cloud gameplay deployment are removed from active startup/build paths.

## Risks and evidence boundary

Quick Tunnel hostnames are temporary and have no uptime guarantee. A changed hostname requires a new invitation; bare room-code lookup needs the optional registry. The packaged Windows proof exercises four clients, LAN discovery, reconnect, and process restart. The live public probe exercises the page, browser origin and WebSocket clients through Cloudflare from this machine. macOS packages, physical devices on independent networks, firewall behavior and signed/notarized distribution still require separate release checks. See [acceptance evidence](./testcase/http-runtime-and-deployment.md).

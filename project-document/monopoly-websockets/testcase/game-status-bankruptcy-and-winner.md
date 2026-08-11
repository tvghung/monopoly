# Checklist — roster, bankruptcy, leave và winner

## Automated evidence

`[AUTO]` Bankruptcy/winner domain assertions live in `apps/server/src/game.test.ts`.
`[SOCKET-INTEGRATION]` covers an in-game auction forfeit plus a two-player leave that
commits `FINISHED` without retaining an auction. UI reason and PostgreSQL retention
remain separate layers.

## Checklist

- [ ] Active roster uses stable IDs; temporary disconnect changes presence only.
- [ ] Balance `< 1` moves Player to finished with `BANKRUPT` and releases property to unowned.
- [ ] Released property is not automatically inserted into open market.
- [ ] Multiple players bankrupt in one check do not throw, skip or use deleted record.
- [ ] Explicit in-game leave records `LEFT` and cleans refs atomically.
- [ ] Finished record survives disconnect/restart and UI distinguishes reason.
- [ ] Winner includes stable player ID/name/color, is set once and room becomes `FINISHED`.
- [ ] Winner/finished/current/ownership references remain valid after leave/bankruptcy.
- [ ] Finished room is restored from DB and deleted only by configured retention.

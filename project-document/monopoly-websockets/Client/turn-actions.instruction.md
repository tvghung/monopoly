# Turn actions: dice, mua property và jail

## Định danh/code

Inline panels tại Board `/`; không có permission key. Code chính: `Dice.tsx`,
`Dashboard.tsx`, `BuyPrompt.tsx`, `JailPanel.tsx`, `App.tsx` typed command wrappers.

## Authority và action gating

- Stable `playerId` từ resume ACK được so với `currentPlayer.id`.
- Only active Player role may mutate; spectator/reconnecting clients are read-only.
- UI settled-position/current-turn guards improve UX; server repeats all guards.
- `roll dice`, `buy property`, `decline property`, `pay bail`, `use jail card` không
  mang dummy business payload và đều có typed ACK.
- UI does not advance turn/close a decision as success before ACK/committed update.

## Roll

Player can roll only after game start, on own turn, before `hasMoved` and after token
display positions settle. Dice/movement/tile resolution remain server-authoritative.
No doubles-extra-turn or three-doubles-to-jail rule is added.

## Buy/decline

When committed state sets `canBuyProp`, current Player sees buy/auction decision after
their token arrives. Buy revalidates tile ownership/price/balance. Decline starts a
durable auction. If the current Player disconnects here, configured persisted grace
(default 60 seconds) is armed; expiry revalidates and starts auction rather than
deadlocking the turn.

## Jail

Pay/card/roll actions derive actor server-side and revalidate jail/current-turn/card/
balance state. Refresh/reconnect preserves exact jail state and turn when within the
committed recovery grace.

## Required tests

- Wrong player, spectator, reconnecting, repeated roll and invalid state rejection.
- No dummy payload and typed ACK success/failure behavior.
- Animation settlement still gates UI without becoming authority.
- Disconnect/reconnect before grace preserves exact action state; expiry resolves it.
- Buy/decline/jail state remains durable across server restart.

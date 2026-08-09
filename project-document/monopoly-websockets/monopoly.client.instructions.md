# Rule nền Client

## Phạm vi

Áp dụng cho `apps/client/`. Đọc sau [monopoly.shared.instructions.md](./monopoly.shared.instructions.md), rồi mở [Client/README.md](./Client/README.md) và file màn hình/panel liên quan.

## Entry và navigation hiện tại

Luồng render:

`apps/client/index.html` → `apps/client/src/index.tsx` → `ToastProvider` → `App`.

Client không có React Router, route config, sidebar hoặc menu. URL chuẩn là `/`; production Express trả SPA fallback cho mọi `GET`, nhưng client không đọc pathname để chọn view.

`App` chọn view bằng local state:

- `joined === false` → `JoinForm`.
- `joined === true` → `Board`.

Vì vậy mọi file Client instruction phải ghi:

- `Menu`: không có, trừ khi code sau này thêm menu thật.
- `List route`: không có.
- `Detail route`: không có.
- `Route`: `/` hoặc “panel/modal trong Board trên `/`”.
- `Permission key`: không có.

Không dùng điều kiện hiển thị/current-player/owner làm permission key.

## Socket connection và state update

- Socket singleton được tạo ở module scope trong `apps/client/src/App.tsx` bằng `socket.io-client`.
- URL lấy từ global `__SOCKET_URL__`; Vite inject từ `VITE_SOCKET_URL`, mặc định same-origin.
- Dev proxy chuyển `/socket.io` tới `http://localhost:8080` với WebSocket enabled.
- `App` gom mọi outbound event trong object `socketFunctions`.
- Event `update` thay toàn bộ `GameState` qua reducer; client không merge từng entity.
- Event `connect` cập nhật `playerId` bằng `socket.id`.
- Private offer events được lắng nghe riêng trong `useIncomingOffers`.
- Không có REST service, `fetch`, Axios client hoặc interceptor.
- Không có ACK/error event cho join hoặc action; UI thường chuyển state hoặc đóng modal ngay sau emit.

Khi thêm/đổi event, phải cập nhật shared contract, `socketFunctions`, listener/hook, server handler, Api/Shared docs và testcase.

## State và context

| State/context | File | Trách nhiệm |
| --- | --- | --- |
| `stateContext` | `apps/client/src/internal.ts`, `apps/client/src/types.ts` | `GameState`, `socketFunctions`, `playerId`, typed socket |
| `displayPositionsContext` | `apps/client/src/displayPositionsContext.ts` | Vị trí token đang hiển thị, có thể trễ hơn server position |
| `cardFlipContext` | `apps/client/src/cardFlipContext.ts` | Trạng thái mặt trước/sau của 40 tile card |
| `sellPromptContext` | `apps/client/src/sellPromptContext.ts`, `apps/client/src/types.ts` | Modal listing/open-market và private offer |
| Toast context | `apps/client/src/components/Toast.tsx` | Thông báo kết quả private offer |
| Local component state | Các component/hook | Form values, modal values, animation counters và offer timer |

Server `GameState` vẫn là nguồn thẩm quyền. Không chuyển business decision sang local state mà không thay đổi kiến trúc được yêu cầu và cập nhật tài liệu.

## Guard hiển thị và action

- Dice chỉ bật khi đúng lượt, chưa move và mọi token đã dừng.
- Buy prompt đợi token của người chơi tới tile đích.
- Jail panel chỉ hiện cho current player đang jail.
- Property buttons mirror owner/group/house/mortgage/balance rule để enable/disable.
- Auction form dựa vào `auction.active`, `passed` và `highestBidder`.
- Start button hiện cho mọi client khi state loaded và game chưa start; không có host role.

Các guard này cải thiện UX. Server handler/game function mới là nơi quyết định mutation có được chấp nhận hay không.

## Animation và display state

- `useSteppedPositions` bước token mỗi 200 ms cho forward distance tối đa 12 tile.
- Teleport hoặc backward/long jump snap thẳng tới server position.
- Buy prompt, roll button và delayed turn marker phụ thuộc token đã settled.
- Framer Motion dùng `useReducedMotion` cho phần lớn transition, nhưng stepped-position interval vẫn chạy.
- Effect/listener/timer phải cleanup khi unmount; React root chạy dưới `StrictMode` trong development.

Khi sửa movement hoặc modal timing, phải test cả state server đến trước animation, nhiều token và reduced-motion setting.

## Board presentation data bị lặp

Ba nguồn phải được rà đồng thời khi sửa tile/card presentation:

- `packages/shared/src/tileState.ts`: data game dùng chung và luật server.
- `apps/client/src/components/BoardInitState.ts`: mặt tile trên board.
- `apps/client/src/components/backOfCards.ts`: nội dung property card.

Hiện có mismatch AS-IS ở tile 28: shared dùng `Water Company`, còn `BoardInitState.ts` và `backOfCards.ts` dùng `Water Works`. Không tự sửa mismatch này trong thay đổi không liên quan; nhưng không được bỏ qua khi tài liệu hoặc code đụng tile 28.

## Pattern UI hiện tại

- UI là component function và React context/local hooks; không có external state library.
- Dashboard chứa player list, jail, buy, sale, incoming offers, auction, winner và marketplace.
- Modal dùng Framer Motion/AnimatePresence và shared `useModalMotion`.
- Log render server-created HTML bằng `dangerouslySetInnerHTML`; server escaping là dependency an toàn bắt buộc.
- Form sell/offer và auction có HTML constraints nhưng server validation mới là nguồn quyết định.

Không tạo abstraction, router, permission framework hoặc service layer mới chỉ để phù hợp mẫu tài liệu.

## Quy tắc sửa Client

1. Đọc file màn hình trong [Client/README.md](./Client/README.md).
2. Theo cross-link tới Api/GameCore/Shared trước khi đổi event hoặc business-facing state.
3. Giữ listener cleanup, timer cleanup và typed event signatures.
4. Không đổi presentation data một nơi nếu giá trị có bản sao/consumer khác.
5. Cập nhật Client index, instruction và testcase trong cùng lần sửa.
6. Nếu thêm navigation thật, cập nhật ngay route/menu map, root README và `CLAUDE.md`.

## Kiểm tra bắt buộc

Client hiện không có test script hoặc test file. Tối thiểu chạy:

```bash
pnpm --filter @monopoly/client typecheck
pnpm lint
pnpm build
```

Sau đó thực hiện checklist liên quan trong [testcase/README.md](./testcase/README.md). Nếu thêm test automation, ghi đường dẫn thật vào checklist thay vì chỉ đổi nhãn.

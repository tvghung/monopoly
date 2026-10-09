# Cập nhật tự động (desktop)

## Phạm vi

Ứng dụng desktop tự biết khi có bản mới, tải bản cập nhật ngay trong game, kiểm tra tính toàn vẹn và áp dụng ở thời điểm an
toàn. Trình duyệt thường (guest vào bằng URL của Host) không có chức năng này. Không có thay đổi nào ở Socket protocol,
snapshot hay HTTP/Express: đây là tính năng của Electron shell và renderer.

Quyết định thiết kế, phương án đã loại và rủi ro nằm ở [../../auto-update/README.md](../../auto-update/README.md);
file này chỉ mô tả hành vi hiện tại (AS-IS).

## Code

| Phần | Đường dẫn |
| --- | --- |
| Trạng thái, kiểm tra, tải, áp dụng | `apps/desktop/src/update/updateService.ts` (`UpdateService`), `updateTypes.ts` |
| Manifest, so sánh phiên bản | `update/manifest.ts`, `update/version.ts` |
| Mạng (redirect, timeout), tải có xác minh | `update/http.ts`, `update/downloader.ts`, `update/stagedFiles.ts` |
| Áp dụng theo nền tảng | `update/installers.ts` |
| Hoàn tác khi `Update.exe --update` lỗi (Windows) | `update/squirrelGuard.ts` |
| Endpoint, hằng số, host tin cậy | `update/updateConfig.ts` |
| IPC + preload | `ipc/channels.ts`, `ipc/windowHandlers.ts`, `preload.ts` (nhóm `update`) |
| Nối vào app | `desktopBootstrap.ts` (`createUpdateService`) |
| Renderer | `apps/client/src/runtime/appUpdate.tsx` (`AppUpdateProvider`, `useAppUpdate`), `components/update/` |
| Phía release | `apps/desktop/scripts/updateManifest.mjs`, `stageReleaseAssets.mjs`, `apps/desktop/update-policy.json` |

## Nguồn thẩm quyền

- **Main process** giữ trạng thái (`AppUpdateState`) và là nơi duy nhất làm việc với mạng, đĩa và bộ cài. Renderer chỉ đọc
  trạng thái và xin bước tiếp theo; nó không bao giờ chọn URL, đường dẫn tệp hay phiên bản.
- Bridge `window.ownTheBlockDesktop.update` có đúng năm lời gọi không tham số (`getState`, `check`, `download`,
  `cancelDownload`, `install`) và một listener (`onStateChanged`). Mỗi channel `ownTheBlock:update:*` kiểm tra sender là cửa sổ
  chính, bỏ qua mọi payload (`windowHandlers.test.ts`, `preloadBridge.test.ts`). `download` và `install` trả về trạng thái lúc
  bắt đầu; các trạng thái sau đó được đẩy qua `ownTheBlock:update:state-changed`.
- Không có gameplay state được lưu vào file hay `localStorage`. Trạng thái "Để sau" chỉ sống trong phiên chạy (renderer). Các tệp đã
  tải nằm ở `<thư mục tạm của hệ điều hành>/OwnTheBlock-updates/<phiên bản>/<loại>/<tên tệp>` (không dùng `userData`: trên
  Windows đó là roaming profile). `<loại>` là `squirrel` (Windows cài bằng `Setup.exe`: tệp `RELEASES` và gói `.nupkg`, thư mục
  này chính là thư mục đưa cho `Update.exe`, nên không chứa gì khác) hoặc `installer` (macOS, hoặc Windows không cài bằng
  `Setup.exe`: chính bộ cài).

## Nguồn cập nhật và manifest

Mỗi GitHub Release có thêm asset `update-manifest.json` do `stageReleaseAssets.mjs` ghi từ chính các bộ cài đã stage:

```json
{
  "schemaVersion": 1,
  "app": "own-the-block",
  "version": "1.2.0",
  "minimumSupportedVersion": "1.0.0",
  "assets": {
    "win32-x64": {
      "name": "OwnTheBlock-1.2.0-win32-x64-Setup.exe", "size": 168398848, "sha256": "…",
      "squirrel": {
        "releases": { "name": "RELEASES", "size": 96, "sha256": "…" },
        "package": { "name": "own_the_block-1.2.0-full.nupkg", "size": 168283409, "sha256": "…" }
      }
    },
    "darwin-x64": { "name": "…", "size": 0, "sha256": "…" },
    "darwin-arm64": { "name": "…", "size": 0, "sha256": "…" }
  }
}
```

Asset là bộ cài của một đích (thứ người chơi tự chạy hoặc mở). Asset Windows có thêm khối `squirrel`: `RELEASES` và gói đầy đủ
`own_the_block-<phiên bản>-full.nupkg`, hai tệp mà `Update.exe --update` của Squirrel cần để cập nhật tại chỗ (tên `RELEASES` cố
định, tệp này tối đa 64 KiB; gói là `.nupkg`, 1 MiB đến 1 GiB). Release dựng khối này; app Windows cài bằng `Setup.exe` tải hai
tệp đó chứ **không** tải `Setup.exe`. Manifest của một release Windows thiếu khối `squirrel` là feed hỏng với bản cài kiểu đó
(`FEED_INVALID`, fail-open như mọi lỗi kiểm tra).

- App đọc `https://github.com/tvghung/monopoly/releases/latest/download/update-manifest.json`: URL web thường, không dính giới
  hạn GitHub API (người chơi chung một mạng LAN thường chung một IP công cộng). "Latest" là release mới nhất không phải
  pre-release, nên `v1.2.0-rc.1` không bao giờ được đẩy tới người chơi.
- Manifest **không chứa URL**. App tự dựng `https://github.com/tvghung/monopoly/releases/download/v<phiên bản>/<tên tệp>` từ
  phiên bản và tên tệp (tên chỉ gồm chữ, số, `.`, `_`, `-`, bắt đầu bằng chữ hoặc số). Chỉ `github.com` và
  `*.githubusercontent.com` qua HTTPS được tin: URL được yêu cầu luôn bị kiểm tra, URL sau redirect chỉ kiểm tra được khi
  stack mạng báo ra (`fetch` của Node có; `net.fetch` của Electron trả `url: ""` và `redirected: false` ngay cả sau redirect,
  nên trong app thật phần này không có tác dụng). Thứ bảo vệ các tệp tải về là kích thước và SHA-256 trong manifest, và
  manifest chỉ được tin khi đọc từ URL GitHub. Manifest tối đa 64 KiB; kích thước bộ cài và gói
  1 MiB đến 1 GiB; SHA-256 là 64 chữ số hex thường. Trường lạ bị bỏ qua; `schemaVersion` khác 1 là lỗi cố ý.
- `minimumSupportedVersion` lấy từ `apps/desktop/update-policy.json` lúc publish. Phiên bản đang chạy **thấp hơn** giá trị này
  thì bản cập nhật là **bắt buộc** (`AppUpdateInfo.mandatory`). Chỉ nâng nó khi bản cũ thật sự không chơi chung được với bản
  mới (ví dụ đổi Socket protocol), không nâng cho bản sửa lỗi nhỏ. `pnpm validate:v1-contract` đòi policy hợp lệ, không cao
  hơn phiên bản release, và đòi trường `reviewedForSocketProtocol` bằng `SOCKET_PROTOCOL_VERSION`: đổi protocol sẽ làm gate
  này đỏ cho đến khi có người quyết định `minimumSupportedVersion` cho lần đổi đó.
- Dev (chưa đóng gói) có thể trỏ vào feed trên máy qua `OWN_THE_BLOCK_UPDATE_MANIFEST_URL` (chỉ loopback; bản đóng gói bỏ qua
  biến này). Không có biến này thì bản dev báo `unsupported` và không hiện gì.

## Trạng thái (`AppUpdateState.phase`)

`unsupported` (không có kênh cập nhật) · `idle` · `checking` · `up-to-date` · `available` · `downloading` · `ready` ·
`installing` · `error` (`error.stage` là `check`, `download` hoặc `install`). `update` có từ `available` trở đi (kể cả khi
tải hoặc cài lỗi), `progress` khi đang tải. `installMode` là `restart` hoặc `open-installer`; `followUp` là
`installer-opened` hoặc `restart-manually`; `installBlocked: 'HOST_OPEN'` khi một phòng LAN của máy này đang mở.

- Kiểm tra: 2 giây sau khi cửa sổ mở, rồi mỗi 6 giờ, và khi người chơi bấm "Kiểm tra cập nhật". Chỉ chạy khi chưa biết bản
  mới nào (`idle`, `up-to-date`, hoặc lỗi kiểm tra trước đó); các lần gọi chồng nhau dùng chung một request; timeout 15 giây.
- **Kiểm tra thất bại không khóa gì**: trạng thái `error` (stage `check`), game vẫn chơi bình thường, không có hộp thoại.
  "Bắt buộc" chỉ được biết khi đã đọc được feed, và **không được lưu qua lần chạy sau**: một buổi LAN không có Internet không
  bao giờ bị khóa (server đã từ chối protocol không tương thích bằng `UPGRADE_REQUIRED`).
- Tải: chỉ bắt đầu khi người chơi bấm "Cập nhật". Từng tệp ghi vào `<tên>.part`, kiểm tra số byte và SHA-256 **trong lúc ghi**,
  đổi tên khi khớp; bất kỳ lỗi hay hủy nào cũng không để lại tệp dở. Hai tệp của Squirrel tải lần lượt, tiến trình là **một**
  thanh cho cả hai (không quay về 0 ở tệp thứ hai). Timeout kết nối 30 giây, không có byte nào trong 30 giây thì dừng. Cần trống
  đĩa ≥ số byte còn thiếu + 64 MiB (chỉ mở bộ cài) hoặc + 768 MiB (Squirrel cập nhật tại chỗ: bản mới giải nén ra 385 MiB và
  Squirrel giữ thêm một bản sao gói; đo trên bản cài thật). Tiến trình gửi tối đa 5 lần/giây.
- Các tệp đã tải và đã xác minh được giữ lại ("Để sau" kể cả sau khi đóng game): lần chạy sau, kiểm tra thấy đủ tệp đúng thì
  vào thẳng `ready`, không tải lại; còn thiếu hoặc sai tệp nào thì chỉ tải lại tệp đó. Trước khi áp dụng, mọi tệp được kiểm tra
  lại (đã nằm trên đĩa một lúc). Thư mục của phiên bản ≤ phiên bản đang chạy bị xóa khi khởi động; thư mục của release khác
  release trong feed bị xóa sau mỗi lần kiểm tra.

## Áp dụng bản cập nhật

| Máy | `installMode` | Việc thực hiện |
| --- | --- | --- |
| Windows cài bằng `Setup.exe` (Squirrel) | `restart` | Kiểm tra lại hai tệp, chụp trạng thái thư mục cài đặt (guard, xem dưới), chạy `Update.exe --update=<thư mục đã stage>` **khi game còn mở**: Squirrel giải nén vào thư mục `app-<phiên bản>` riêng (khoảng 12 giây cho gói 160 MiB), không đụng thư mục đang chạy, chuyển shortcut và mục gỡ cài đặt sang bản mới. Mã thoát 0 **và** `app-<phiên bản>/OwnTheBlock.exe` tồn tại thì chạy tách rời `Update.exe --processStartAndWait OwnTheBlock.exe` rồi thoát app bằng đường thoát thường (đã duyệt, không hỏi lần hai). Update.exe đợi tiến trình này thoát rồi mở phiên bản mới nhất. |
| macOS (bản chưa ký), Windows không có `Update.exe` | `open-installer` | Mở tệp đã xác minh (`shell.openPath`): ổ đĩa DMG để kéo vào Ứng dụng, hoặc trình cài Setup. App không tự thoát. |

- **Không bao giờ chạy `Setup.exe` đè lên bản đang chạy.** Đo trên bản cài thật: `Setup.exe` xóa cả thư mục cài đặt trước
  (Squirrel ghi "burning it to the ground"), kể cả phiên bản đang chạy, nên game chết sau khoảng 6 giây giữa chừng cập nhật và
  không có gì mở lại nó. Chỉ `Update.exe --update` mới cập nhật tại chỗ an toàn.
- **Guard (`squirrelGuard.ts`).** Cập nhật của Squirrel không có tính giao dịch: lỗi để lại rác nằm đúng chỗ lần mở sau tìm
  (thư mục `app-<mới>` rỗng khiến mọi shortcut không mở được game; nhánh "fall back to full updates" ghi đè `packages\RELEASES`
  thành phiên bản chưa từng cài và xóa gói của phiên bản đang chạy). Nên trước khi chạy, app ghi lại danh sách thư mục
  `app-*`, nội dung `RELEASES` và các gói (giữ bằng hard link, không sao chép 160 MiB khi hệ tệp cho phép; thư mục tạm
  `update-guard` trong thư mục cài đặt) và khi lỗi **trả lại đúng trạng thái đó**: xóa thư mục phiên bản mới, trả `RELEASES` nguyên
  từng byte (kể cả BOM), trả gói bị xóa, xóa gói Squirrel thêm vào. Quá 10 phút thì không hoàn tác (tiến trình có thể còn ghi);
  thư mục cài đặt đọc không được thì không chạy cập nhật. Bị kill giữa chừng (mất điện, kết thúc cả cây tiến trình) nằm ngoài
  guard: lần cập nhật kế tiếp sửa lại vì Squirrel tự xóa thư mục phiên bản dở của bản nó đang cài.
- Cài lỗi (không khởi động được, mã thoát khác 0, không thấy phiên bản mới, quá 10 phút) → `error` stage `install`, **game cũ
  vẫn chạy nguyên vẹn** (và mở lại được từ shortcut) và có "Thử lại". Nếu app không thoát trong 30 giây sau khi cài xong thì
  báo `restart-manually`.
- Windows: `--squirrel-firstrun` (Squirrel truyền sau khi cài không im lặng) là một lần chạy bình thường, không phải hook để
  thoát (`squirrelEvents.ts`). Đường dẫn thư mục stage có thể chứa dấu cách và chữ có dấu (tên người dùng Windows): đã chạy thật
  với `...\Temp\own the block tést\OwnTheBlock-updates\<phiên bản>\squirrel`.
- macOS: bản chưa ký/notarize không thể thay chính nó (Squirrel.Mac đòi chữ ký), nên đây là bán tự động: tải và kiểm tra trong
  app, người chơi kéo thả. Muốn tự động hoàn toàn cần chứng chỉ Apple Developer ID (xem tài liệu thiết kế).
- Phiên bản **không có** bộ cập nhật (1.1.1 trở về trước) không thể tự biết; người chơi cập nhật tay một lần, từ phiên bản có
  tính năng này trở đi mọi bản sau đều tự báo.

## Thời điểm an toàn

- Không bao giờ tự đóng hay khởi động lại giữa phòng/ván: nút khởi động lại chỉ bấm được ở màn hình bắt đầu khi **không** có
  phòng LAN nào của máy này đang mở. Renderer biết người chơi đang ở lobby/ván (`AppUpdateProvider.inSession`, tức là
  `launch !== null` trong `AppBootstrap`); main process biết phòng của Host (`installBlocked`) và **từ chối** `install` khi phòng
  đang mở. Tải xuống vẫn tiếp tục được trong ván.
- Trong lobby/ván không có hộp thoại nào: chỉ một toast "Bản cập nhật đã sẵn sàng. Bạn có thể cập nhật sau khi kết thúc ván
  chơi." (một lần cho mỗi bản, không nhắc người đã bấm "Để sau") hoặc "Cần cập nhật Own the Block. Bạn có thể cập nhật sau khi
  rời phòng." khi vừa biết có bản bắt buộc. Mục "Cập nhật" trong Cài đặt vẫn dùng được trong ván, nút khởi động lại bị tắt kèm
  lý do.

## Màn hình

Chọn bề mặt nào để hiện là hàm thuần `components/update/updateView.ts` (`promptKind`, `lineKind`); lời lẽ ở `updateCopy.ts`
(VI/EN theo preference, tiếng Việt mặc định; không địa chỉ/checksum/mã lỗi; mọi dòng lỗi nói việc cần làm và, với bản không bắt buộc, "Bạn vẫn có thể
tiếp tục chơi" / "You can keep playing").

- Hộp thoại `Modal` trung tâm (chỉ khi launcher đang ở menu, không phải form; không bao giờ trong lobby/ván):
  - **Có bản cập nhật mới** — "Own the Block v1.2.0 đã sẵn sàng. Bạn đang sử dụng v1.1.1." với "Cập nhật" và "Để sau"
    (focus ở "Để sau"; Escape/nút đóng cũng là "Để sau", nhớ theo phiên bản trong lần chạy này).
  - **Cần cập nhật Own the Block** — bản bắt buộc, xem dưới; **Bản cập nhật đã sẵn sàng** — "Khởi động lại và cập nhật" (hoặc
    "Mở bộ cài đặt") và "Để sau" (focus ở "Để sau"); **Đang cài đặt bản cập nhật** — không nút, không đóng được.
- Một dòng yên lặng trên menu: "Đang tải bản cập nhật — 42%" kèm thanh `role="progressbar"` và "Hủy"; tải/cài lỗi kèm "Thử
  lại"/"Đóng"; khi bản đã sẵn sàng mà phòng của máy đang mở thì nói rõ phải đóng phòng trước (hộp thoại không che nút "Đóng
  phòng").
- Cài đặt (chỉ desktop có bộ cập nhật): mục **Cập nhật** với "Phiên bản hiện tại: 1.1.1", một câu trạng thái (`aria-live`) và
  nút phù hợp ("Kiểm tra cập nhật", "Cập nhật", "Hủy", khởi động lại, "Thử lại").

### Bản bắt buộc

Hộp thoại "Cần cập nhật Own the Block — Phiên bản hiện tại của bạn không còn tương thích với phiên bản mới nhất. Vui lòng cập
nhật để tiếp tục chơi." không đóng được bằng Escape hay nút; chỉ có "Cập nhật" (đổi thành tiến trình, "Thử lại" khi lỗi, rồi
"Khởi động lại và cập nhật") và "Thoát game" (đi qua đúng luồng thoát của launcher, có xác nhận khi phòng đang mở). Trong lúc
đó **"Tạo phòng", "Tham gia phòng" và "Máy chủ riêng" bị vô hiệu**; "Vào lại phòng đang mở" và "Đóng phòng" vẫn dùng được vì
không bắt đầu hay vào phòng mới. Khóa chỉ là UX của renderer; thẩm quyền vẫn là server từ chối protocol không khớp.

## Quy tắc sửa

1. Đổi channel/payload: sửa `ipc/channels.ts`, `windowHandlers.ts`, `preload.ts`, `runtime/types.ts` của client, test
   `windowHandlers.test.ts` và `preloadBridge.test.ts`. `AppUpdateState` được lặp lại ở `apps/client/src/runtime/types.ts`.
2. Đổi manifest: sửa **cả** `apps/desktop/scripts/updateManifest.mjs` và `src/update/manifest.ts` (`updateManifestContract.test.ts` giữ hai
   bên bằng nhau, kể cả hàm so sánh phiên bản). Đổi tên gói Squirrel (`name` của maker trong `forge.config.cjs`) thì sửa
   `releaseTargets` trong `stageReleaseAssets.mjs`; test hợp đồng đọc `forge.config.cjs` để giữ hai bên khớp.
3. Không thêm đường để renderer chọn URL, tệp hay phiên bản; không bỏ kiểm tra SHA-256 hay danh sách host. Không chạy
   `Setup.exe` đè lên bản đang chạy và không bỏ guard quanh `Update.exe --update`.
4. Không lưu cờ "bắt buộc" qua lần chạy sau (sẽ khóa người chơi LAN không có Internet).
5. Thêm bề mặt mới thì thêm vào `updateView.ts` và bảng kiểm thử của nó; hộp thoại dùng `Modal`, không dùng `window.confirm`.

## Kiểm tra

```bash
pnpm --filter @monopoly/desktop test
pnpm --filter @monopoly/client test
pnpm test:v1-contract
pnpm validate:v1-contract
```

Checklist và nhãn bằng chứng ở [../testcase/http-runtime-and-deployment.md](../testcase/http-runtime-and-deployment.md#in-app-update-desktop).

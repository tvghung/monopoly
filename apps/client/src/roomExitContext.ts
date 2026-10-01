import { createContext, useContext } from 'react';

/**
 * How a dialog lets the viewer leave the room (plan 04 OD-04-8). `App` owns the real flow: for a player in a running game it
 * opens the central "Bỏ cuộc khỏi ván chơi?" confirmation, otherwise it leaves at once. Dialogs that cover the toolbar (the
 * debtor's "Cần thanh toán", the victory screen) call this instead of duplicating any socket command.
 */
export interface RoomExitContextValue {
  requestLeave: () => void;
  /** A leave request is in flight. */
  leaving: boolean;
  /** "Bỏ cuộc" for a player in a running game, "Rời phòng" otherwise. */
  label: 'Bỏ cuộc' | 'Rời phòng';
  /**
   * Why the last leave request failed. The toolbar message sits under the modal layer, so a dialog that offers the exit
   * shows this itself.
   */
  error?: string | null;
}

/** `null` outside the app shell (unit tests, Design Lab fixtures that do not provide it). */
export const roomExitContext = createContext<RoomExitContextValue | null>(null);

export function useRoomExit(): RoomExitContextValue | null {
  return useContext(roomExitContext);
}

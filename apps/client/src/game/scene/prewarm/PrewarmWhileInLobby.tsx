import { useEffect } from 'react';
import { useSettingsSelector } from '../../../settings/selectors';
import { startLobbyPrewarm } from './lobbyPrewarm';

/**
 * Prepares the board while the lobby is shown (08H Task 1). Renders nothing; mounting starts the preparation, unmounting (the room
 * started, or the player left) cancels what has not run, and a change of graphics tier starts it again for the new tier.
 */
export default function PrewarmWhileInLobby() {
  const graphicsQuality = useSettingsSelector(settings => settings.graphicsQuality);
  useEffect(() => startLobbyPrewarm(graphicsQuality), [graphicsQuality]);
  return null;
}

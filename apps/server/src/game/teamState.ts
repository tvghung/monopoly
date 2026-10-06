import type { TeamPlayState, TeamSettingsById } from '@monopoly/shared';

/** The names and colours a new room's lobby starts with: "Team 1" and "Team 2", always two different colours. */
export const createDefaultTeamSettings = (): TeamSettingsById => ({
  TEAM_1: { name: 'Team 1', color: 'red' },
  TEAM_2: { name: 'Team 2', color: 'blue' },
});

/** Match-level 2v2 state of a Solo game or a lobby: no slots, no revives, no windows. */
export const createEmptyTeamPlayState = (): TeamPlayState => ({
  slotOrder: [],
  revivedPlayerIds: [],
  reviveWindows: [],
});

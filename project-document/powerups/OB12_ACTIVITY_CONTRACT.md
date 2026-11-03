# OB-12 activity contract review

CURRENT DEVELOPMENT compatibility decision for the Power-up activity task.

Add two strict variants to the existing bounded public/persisted activityFeed:
- POWER_UP_RECEIVED: existing event identity/sequence/time plus playerId/playerName only. No card metadata.
- POWER_UP_USED: existing event identity/sequence/time plus playerId/playerName and official definitionId/cardName. VI/EN sentence templates preserve the official catalog proper card name in both languages.

Old renderers exhaustively handle existing activity variants and cannot safely render the new variants. Proposed: Socket protocol 18, RAM snapshot 16; reject protocol17/older peers and older envelopes using existing equality guards. Update LAN mirrored protocol and update-policy reviewedForSocketProtocol to18; retain product version1.11.2/minimum1.11.2, no tags/releases/publication. Update canonical history/validators and verify both mismatch directions.

Owner explicitly approved this proposal in the Codex chat. Product/minimum version remain1.11.2, with no release publication. Merge requires completed checks.

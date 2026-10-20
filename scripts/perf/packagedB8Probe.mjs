/** Read-only acceptance adapter for the shipped renderer; no game decisions or synthetic lifecycle events. */
export function installPackagedB8Probe() {
  if (window.__B8_PACKAGED_ACCEPTANCE__) return;
  const events = [];
  let controller = null;
  let unsubscribe = null;
  let rafSequence = 0;
  let lastDrawRaf = -1;
  const p = window.__B8_PACKAGED_ACCEPTANCE__ = {
    events, frames: 0, drawCalls: 0, lastDrawEpochMs: null, firstVisibleDrawEpochMs: null,
    findController() {
      const root = document.getElementById('root');
      const key = root && Object.keys(root).find(k => k.startsWith('__reactContainer$'));
      const initial = key && root[key];
      const pending = [initial?.stateNode?.current ?? initial];
      const visited = new Set();
      while (pending.length && visited.size < 30000) {
        const fiber = pending.pop();
        if (!fiber || visited.has(fiber)) continue;
        visited.add(fiber);
        const c = fiber.memoizedProps?.controller;
        if (c?.store?.getSnapshot && c?.queue?.getStatus && c.acceptRoomSnapshot) return c;
        pending.push(fiber.child, fiber.sibling);
      }
      return null;
    },
    attach() {
      const next = this.findController();
      if (!next) return false;
      if (next !== controller) {
        unsubscribe?.();
        controller = next;
        unsubscribe = controller.store.subscribe(() => {
          events.push({ kind: 'presentation', atEpochMs: performance.timeOrigin + performance.now(), ...this.sample() });
          if (events.length > 500) events.splice(0, events.length - 500);
        });
      }
      return true;
    },
    sample() {
      controller = this.findController() ?? controller;
      if (!controller) return null;
      const state = controller.store.getSnapshot();
      const room = controller.acceptedRoom;
      return {
        version: room?.version, roomId: room?.roomId, roomStatus: room?.status,
        currentPlayerId: room?.gameState.boardState.currentPlayer.id,
        authoritativePositions: Object.fromEntries(Object.entries(room?.gameState.players ?? {}).map(([id, value]) => [id, value.currentTile])),
        displayPositions: { ...state.displayPositions }, settledPositions: { ...state.settledPositions },
        authoritativeRollSequence: room?.gameState.boardState.rollSequence,
        displayRollSequence: state.displayRollSequence,
        displayDice: state.displayDice, authoritativeDice: room?.gameState.boardState.diceValue,
        queue: controller.queue.getStatus(), resetEpoch: state.presentationResetEpoch,
        diceRolling: Boolean(state.diceRoll),
        movements: state.characterMovements.map(s => ({ sequence:s.sequence,phase:s.phase,from:s.fromTileId,to:s.toTileId,durationMs:s.durationMs,startedAtMs:s.startedAtMs })),
        moneyTransfers: state.moneyTransfers.map(s => ({ id:s.id, sequence:s.sequence })),
        tileImpacts: state.tileImpacts.map(s => ({ sequence:s.sequence,tileId:s.tileId,kind:s.kind })),
        pendingCard: room?.gameState.turnInfo.pendingCardInteraction?.operationId ?? null,
        pendingLanding: Boolean(room?.gameState.turnInfo.pendingLandingDecision),
        reducedMotion: state.reducedMotion, animationSpeed: state.animationSpeedMultiplier,
        visibility: document.visibilityState, hidden: document.hidden,
      };
    },
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) p.firstVisibleDrawEpochMs = null;
    events.push({ kind:'visibility', atEpochMs:performance.timeOrigin+performance.now(), hidden:document.hidden,visibility:document.visibilityState });
  });
  const request = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => request(time => { rafSequence += 1; callback(time); });
  const draw = () => {
    p.drawCalls += 1;
    const at = performance.timeOrigin + performance.now();
    p.lastDrawEpochMs = at;
    if (!document.hidden && p.firstVisibleDrawEpochMs === null) p.firstVisibleDrawEpochMs = at;
    if (lastDrawRaf !== rafSequence) { p.frames += 1; lastDrawRaf = rafSequence; }
  };
  for (const Constructor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!Constructor) continue;
    for (const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {
      const original = Constructor.prototype[name];
      if (!original || original.__b8Wrapped) continue;
      const wrapped = function (...args) { draw(); return Reflect.apply(original,this,args); };
      wrapped.__b8Wrapped = true;
      Constructor.prototype[name] = wrapped;
    }
  }
}

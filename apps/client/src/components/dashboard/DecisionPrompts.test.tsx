import {
  act, cleanup, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import type { Ack, PublicGameState } from '@monopoly/shared';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../internal';
import type { SocketFunctions, StateContextValue } from '../../types';
import { makeRoom } from '../../game/presentation/testFixtures';
import BuyPrompt from './BuyPrompt';
import DevelopmentPrompt from './DevelopmentPrompt';
import JailPanel from './JailPanel';

afterEach(cleanup);

const failure: Ack = {
  ok: false,
  protocolVersion: SOCKET_PROTOCOL_VERSION,
  error: { code: 'CONFLICT', message: 'The decision is no longer available.', retryable: true },
};

function makeSocketFunctions(overrides: Partial<SocketFunctions> = {}): SocketFunctions {
  return {
    rollDice: vi.fn(),
    buyProperty: vi.fn(),
    doNotBuy: vi.fn(),
    resolveDevelopment: vi.fn(),
    waitInJail: vi.fn(),
    sendChat: vi.fn(),
    makeOffer: vi.fn(),
    acceptOffer: vi.fn(),
    declineOffer: vi.fn(),
    sellHouse: vi.fn(),
    payBail: vi.fn(),
    useJailCard: vi.fn(),
    ...overrides,
  };
}

function makeContext(state: PublicGameState, socketFunctions: SocketFunctions): StateContextValue {
  return {
    state,
    socketFunctions,
    playerId: 'player-a',
    role: 'PLAYER',
    connected: true,
    canMutate: true,
    privatePlayerState: null,
    privateOffers: [],
  };
}

function purchaseState(operationId = 'purchase-1'): PublicGameState {
  const room = makeRoom();
  room.gameState.turnInfo.pendingLandingDecision = {
    kind: 'PURCHASE',
    operationId,
    playerId: 'player-a',
    tileID: 1,
    price: 60,
  };
  return room.gameState;
}

function developmentState(operationId = 'development-1'): PublicGameState {
  const room = makeRoom();
  room.gameState.turnInfo.pendingLandingDecision = {
    kind: 'DEVELOP_HOUSES',
    operationId,
    playerId: 'player-a',
    tileID: 1,
    unitCost: 50,
    maxQuantity: 2,
  };
  return room.gameState;
}

function jailState(balance = 25): PublicGameState {
  const room = makeRoom();
  room.gameState.players['player-a'].accountBalance = balance;
  room.gameState.players['player-a'].isJail = true;
  return room.gameState;
}

describe('authoritative decision prompts', () => {
  it('allows only one purchase request while the ACK is in flight', () => {
    const buyProperty = vi.fn(() => new Promise<Ack>(() => {}));
    const socketFunctions = makeSocketFunctions({ buyProperty });
    render(
      <stateContext.Provider value={makeContext(purchaseState(), socketFunctions)}>
        <BuyPrompt tokenArrived />
      </stateContext.Provider>,
    );

    const button = screen.getByRole('button', { name: 'Mua tài sản' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(buyProperty).toHaveBeenCalledTimes(1);
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('re-enables purchase after an ACK failure and shows a localized error', async () => {
    const buyProperty = vi.fn(() => Promise.resolve(failure));
    const socketFunctions = makeSocketFunctions({ buyProperty });
    render(
      <stateContext.Provider value={makeContext(purchaseState(), socketFunctions)}>
        <BuyPrompt tokenArrived />
      </stateContext.Provider>,
    );

    const button = screen.getByRole('button', { name: 'Mua tài sản' });
    fireEvent.click(button);
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));

    expect(screen.getByRole('alert').textContent).toContain('Giao dịch chưa thể thực hiện.');
  });

  it('re-enables development after an ACK failure without changing authoritative state', async () => {
    const resolveDevelopment = vi.fn(() => Promise.resolve(failure));
    const socketFunctions = makeSocketFunctions({ resolveDevelopment });
    const state = developmentState();
    render(
      <stateContext.Provider value={makeContext(state, socketFunctions)}>
        <DevelopmentPrompt tokenArrived />
      </stateContext.Provider>,
    );

    const button = screen.getByRole('button', { name: /Xây 1 Nhà/ });
    fireEvent.click(button);
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));

    expect(resolveDevelopment).toHaveBeenCalledTimes(1);
    expect(resolveDevelopment).toHaveBeenCalledWith({
      operationId: 'development-1', action: 'BUILD_HOUSES', quantity: 1,
    });
    expect(state.turnInfo.pendingLandingDecision?.kind).toBe('DEVELOP_HOUSES');
    expect(screen.getByRole('alert').textContent).toContain('Giao dịch chưa thể thực hiện.');
  });

  it('clears a pending development click when the authoritative operation changes', () => {
    const resolveDevelopment = vi.fn(() => new Promise<Ack>(() => {}));
    const socketFunctions = makeSocketFunctions({ resolveDevelopment });
    const initial = developmentState('development-1');
    const view = render(
      <stateContext.Provider value={makeContext(initial, socketFunctions)}>
        <DevelopmentPrompt tokenArrived />
      </stateContext.Provider>,
    );

    const firstButton = screen.getByRole('button', { name: /Xây 1 Nhà/ });
    fireEvent.click(firstButton);
    expect(firstButton.hasAttribute('disabled')).toBe(true);

    const next = developmentState('development-2');
    act(() => {
      view.rerender(
        <stateContext.Provider value={makeContext(next, socketFunctions)}>
          <DevelopmentPrompt tokenArrived />
        </stateContext.Provider>,
      );
    });

    expect(screen.getByRole('button', { name: /Xây 1 Nhà/ }).hasAttribute('disabled')).toBe(false);
  });

  it('offers the canonical bail action without a manual wait action', () => {
    render(
      <stateContext.Provider value={makeContext(jailState(), makeSocketFunctions())}>
        <JailPanel />
      </stateContext.Provider>,
    );

    expect(screen.getByRole('button', { name: 'Trả 25.000 ₫' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Chờ hết lượt/ })).toBeNull();
  });

  it('guards duplicate bail clicks and shows a delayed-projection state after success', async () => {
    let resolveBail!: (acknowledgement: Ack) => void;
    const payBail = vi.fn(() => new Promise<Ack>(resolve => { resolveBail = resolve; }));
    const socketFunctions = makeSocketFunctions({ payBail });
    render(
      <stateContext.Provider value={makeContext(jailState(), socketFunctions)}>
        <JailPanel />
      </stateContext.Provider>,
    );

    const button = screen.getByRole('button', { name: 'Trả 25.000 ₫' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(payBail).toHaveBeenCalledTimes(1);

    act(() => {
      resolveBail({ ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION });
    });
    await waitFor(() => expect(screen.getByText('Đã xác nhận. Đang cập nhật ván chơi…')).toBeTruthy());
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('disables bail below the canonical amount', () => {
    render(
      <stateContext.Provider value={makeContext(jailState(24), makeSocketFunctions())}>
        <JailPanel />
      </stateContext.Provider>,
    );

    expect(screen.getByRole('button', { name: 'Trả 25.000 ₫' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Cần 25.000 ₫ để trả bảo lãnh.')).toBeTruthy();
  });

  it('re-enables bail after a stale ACK failure without changing projected jail state', async () => {
    const payBail = vi.fn(() => Promise.resolve(failure));
    const state = jailState();
    render(
      <stateContext.Provider value={makeContext(state, makeSocketFunctions({ payBail }))}>
        <JailPanel />
      </stateContext.Provider>,
    );

    const button = screen.getByRole('button', { name: 'Trả 25.000 ₫' });
    fireEvent.click(button);
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    expect(state.players['player-a'].isJail).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('Giao dịch chưa thể thực hiện.');
  });
});


function withContextCard(state:PublicGameState,id:'U03'|'U09',socketFunctions:SocketFunctions) {
  const value=makeContext(state,socketFunctions);value.privatePlayerState={playerId:'player-a',heldJailFreeCardIds:[],gameplayEvents:{sequence:0,events:[]},powerUps:{activeOfferId:null,offers:[],activeUsedThisTurn:false,inventory:{capacity:3,cards:[{instanceId:'context-card',definitionId:id,ownerPlayerId:'player-a',obtainedFromOfferId:'grant',definition:{definitionId:id,name:id,description:'Contextual effect',category:'UTILITY',rarity:'COMMON',activation:'ACTIVE',effectKey:id}}]}}};return value;
}
it.each(['U03','U09'] as const)('OB-11 %s uses the exact operation in one modal and skip leaves the original action',async id=>{
  const state=id==='U03'?purchaseState():developmentState();const activatePowerUp=vi.fn(()=>Promise.resolve({ok:true,protocolVersion:SOCKET_PROTOCOL_VERSION} as Ack));
  const value=withContextCard(state,id,makeSocketFunctions({activatePowerUp}));
  const view=render(<stateContext.Provider value={value}>{id==='U03'?<BuyPrompt tokenArrived/>:<DevelopmentPrompt tokenArrived/>}</stateContext.Provider>);
  expect(document.querySelectorAll('[role=dialog]')).toHaveLength(1);expect(activatePowerUp).not.toHaveBeenCalled();
  await act(()=>fireEvent.click(screen.getByRole('button',{name:'Không dùng thẻ / Bỏ qua'})));
  expect(activatePowerUp).not.toHaveBeenCalled();expect(screen.queryByRole('region',{name:'Power-up cho thao tác này'})).toBeNull();
  expect(screen.getByRole('dialog')).toBeTruthy();view.unmount();
  render(<stateContext.Provider value={value}>{id==='U03'?<BuyPrompt tokenArrived/>:<DevelopmentPrompt tokenArrived/>}</stateContext.Provider>);
  await act(()=>fireEvent.click(screen.getByRole('button',{name:'Dùng thẻ'})));
  expect(activatePowerUp).toHaveBeenCalledWith({instanceId:'context-card',operationId:id==='U03'?'purchase-1':'development-1',...(id==='U03'?{targetTileID:1}:{})});
});
it('OB-11 holds purchase while activation is pending, shows denial, and reads only server purchase price',async()=>{
  let resolve!:(ack:Ack)=>void;const activatePowerUp=vi.fn(()=>new Promise<Ack>(done=>{resolve=done}));const value=withContextCard(purchaseState(),'U03',makeSocketFunctions({activatePowerUp}));
  const rendered=render(<stateContext.Provider value={value}><BuyPrompt tokenArrived/></stateContext.Provider>);
  fireEvent.click(screen.getByRole('button',{name:'Dùng thẻ'}));fireEvent.click(screen.getByRole('button',{name:'Dùng thẻ'}));
  expect(activatePowerUp).toHaveBeenCalledTimes(1);expect(screen.getByRole('button',{name:'Mua tài sản'}).hasAttribute('disabled')).toBe(true);
  await act(async()=>{resolve(failure);await Promise.resolve()});expect(screen.getByRole('alert').textContent).toContain('Giao dịch chưa thể thực hiện.');
  expect(value.privatePlayerState!.powerUps!.inventory!.cards).toHaveLength(1);
  const next=structuredClone(value.state);next.turnInfo.pendingLandingDecision!.price=51;
  act(()=>rendered.rerender(<stateContext.Provider value={{...value,state:next}}><BuyPrompt tokenArrived/></stateContext.Provider>));
  expect(document.querySelector('.decision-sheet__price strong')?.textContent).toContain('51.000');expect(screen.getByRole('dialog')).toBeTruthy();
});
it('OB-11 development uses capped quantity quotes rather than multiplying the discounted unit',()=>{
  const state=developmentState();state.turnInfo.pendingLandingDecision!.unitCost=200;state.turnInfo.pendingLandingDecision!.maxQuantity=4;state.turnInfo.pendingLandingDecision!.quantityPrices={1:160,2:350,3:550,4:750};
  render(<stateContext.Provider value={makeContext(state,makeSocketFunctions())}><DevelopmentPrompt tokenArrived/></stateContext.Provider>);
  expect(screen.getByRole('button',{name:/Xây 4 Nhà.*750/})).toBeTruthy();expect(screen.queryByRole('button',{name:/Xây 4 Nhà.*640/})).toBeNull();
});
it.each(['spectator','foreign','used','none'] as const)('OB-11 hides optional card panel for %s',reason=>{
  const value=withContextCard(purchaseState(),'U03',makeSocketFunctions());
  if(reason==='spectator'){value.role='SPECTATOR';value.canMutate=false}
  if(reason==='foreign')value.privatePlayerState!.playerId='player-b';
  if(reason==='used')value.privatePlayerState!.powerUps!.activeUsedThisTurn=true;
  if(reason==='none')value.privatePlayerState!.powerUps!.inventory!.cards=[];
  render(<stateContext.Provider value={value}><BuyPrompt tokenArrived/></stateContext.Provider>);expect(document.querySelector('.contextual-powerups')).toBeNull();
});

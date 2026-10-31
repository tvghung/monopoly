import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SOCKET_PROTOCOL_VERSION, type Ack, type PowerUpOwnerState, type PowerUpDefinition } from '@monopoly/shared';
import stateContext from '../../../internal';
import type { StateContextValue } from '../../../types';
import { makeRoom } from '../../presentation/testFixtures';
import PowerUpPanel from './PowerUpPanel';

afterEach(cleanup);
const id='00000000-0000-4000-8000-000000000001';
const definitions:PowerUpDefinition[]=['ATTACK','DEFENSE','UTILITY'].map((category,index)=>({definitionId:'TEST-'+index,name:'Visible card '+index,description:'Registry effect '+index,category:category as PowerUpDefinition['category'],rarity:index===0?'LEGENDARY':'COMMON',activation:'ACTIVE',effectKey:'TEST'}));
const success:Ack={ok:true,protocolVersion:SOCKET_PROTOCOL_VERSION};
function context(stage: 'WAITING'|'REVEALED'|'INVENTORY_RESOLUTION'|'COMPLETED'='WAITING',full=false):StateContextValue {
  const powerUps:PowerUpOwnerState={activeOfferId:stage==='COMPLETED'?null:id,inventory:{capacity:3,cards:full?Array.from({length:3},(_,i)=>({instanceId:'held-'+i,definitionId:definitions[0].definitionId,ownerPlayerId:'player-a',obtainedFromOfferId:'old-'+i,definition:definitions[0]})):[]},offers:[{offerId:id,stage,selectedIndex:stage==='WAITING'?null:1,candidates:definitions.map(d=>({category:d.category,...(stage==='WAITING'?{}:{definition:d})})),...(stage==='COMPLETED'?{outcome:{kind:'GRANTED',automatic:false} as const}:{})}]};
  return {state:makeRoom().gameState,playerId:'player-a',role:'PLAYER',canMutate:true,connected:true,privateOffers:[],privatePlayerState:{playerId:'player-a',heldJailFreeCardIds:[],gameplayEvents:{sequence:0,events:[]},powerUps},socketFunctions:{rollDice:vi.fn(),buyProperty:vi.fn(),sendChat:vi.fn(),makeOffer:vi.fn(),acceptOffer:vi.fn(),declineOffer:vi.fn(),sellHouse:vi.fn(),payBail:vi.fn(),useJailCard:vi.fn(),selectPowerUp:vi.fn(()=>Promise.resolve(success)),resolvePowerUp:vi.fn(()=>Promise.resolve(success))}};
}
const view=(value:StateContextValue)=><stateContext.Provider value={value}><PowerUpPanel /></stateContext.Provider>;

describe('Power-up reward and inventory interface',()=>{
  it('renders exactly three category backs without rarity or registry details',()=>{
    render(view(context()));
    for(const label of ['Tấn công','Phòng thủ','Tiện ích'])expect(screen.getByRole('button',{name:label})).toBeTruthy();
    expect(screen.queryByText('Huyền thoại')).toBeNull();expect(screen.queryByText('Visible card 0')).toBeNull();expect(screen.queryByText('Registry effect 0')).toBeNull();
    expect(document.querySelectorAll('.power-up-card')).toHaveLength(3);
  });
  it('selects once, shows loading, and reveals only from a committed snapshot',async()=>{
    const value=context();let complete!:(ack:Ack)=>void;
    value.socketFunctions.selectPowerUp=vi.fn(()=>new Promise<Ack>(resolve=>{complete=resolve;}));
    const rendered=render(view(value));const button=screen.getByRole('button',{name:'Phòng thủ'});
    fireEvent.click(button);fireEvent.click(button);expect(value.socketFunctions.selectPowerUp).toHaveBeenCalledTimes(1);
    expect(value.socketFunctions.selectPowerUp).toHaveBeenCalledWith({offerId:id,selectedIndex:1});
    expect(screen.getByText('Đang xác nhận…')).toBeTruthy();expect(screen.queryByText('Visible card 1')).toBeNull();
    await act(async()=>{complete(success);await Promise.resolve();});rendered.rerender(view({...context('REVEALED'),socketFunctions:value.socketFunctions}));
    for(const definition of definitions){expect(screen.getByText(definition.name)).toBeTruthy();expect(screen.getByText(definition.description)).toBeTruthy();}
    expect(screen.queryByRole('button',{name:'Phòng thủ'})).toBeNull();
    expect(document.querySelectorAll('.power-up-card--selected')).toHaveLength(1);expect(document.querySelectorAll('.power-up-card--discarded')).toHaveLength(2);
  });
  it('claims once while waiting and never presents a completed offer as selectable',async()=>{
    const value=context('REVEALED');let complete!:(ack:Ack)=>void;value.socketFunctions.resolvePowerUp=vi.fn(()=>new Promise<Ack>(resolve=>{complete=resolve;}));
    const rendered=render(view(value));const claim=screen.getByRole('button',{name:'Nhận thẻ'});fireEvent.click(claim);fireEvent.click(claim);
    expect(value.socketFunctions.resolvePowerUp).toHaveBeenCalledTimes(1);expect(value.socketFunctions.resolvePowerUp).toHaveBeenCalledWith({offerId:id,action:'CLAIM'});
    await act(async()=>{complete(success);await Promise.resolve();});rendered.rerender(view(context('COMPLETED')));
    expect(screen.queryByRole('button',{name:'Nhận thẻ'})).toBeNull();expect(screen.queryByRole('dialog',{name:'Quà Xuất Phát'})).toBeNull();
    expect(screen.getByText('Đã nhận thẻ vào kho.')).toBeTruthy();
  });
  it('restores a full inventory decision with replace and decline, preserving all held cards until a command',async()=>{
    const value=context('INVENTORY_RESOLUTION',true);render(view(value));
    expect(screen.getByText(/Kho thẻ đã đầy/)).toBeTruthy();expect(screen.queryByRole('button',{name:'Nhận thẻ'})).toBeNull();
    expect(screen.getAllByRole('button',{name:/Thay thẻ này/})).toHaveLength(3);
    await act(()=>fireEvent.click(screen.getAllByRole('button',{name:/Thay thẻ này/})[1]));
    expect(value.socketFunctions.resolvePowerUp).toHaveBeenCalledWith({offerId:id,action:'REPLACE',replaceInstanceId:'held-1'});
    expect(value.privatePlayerState!.powerUps!.inventory!.cards).toHaveLength(3);
    await act(()=>fireEvent.click(screen.getByRole('button',{name:'Bỏ thẻ mới'})));
    expect(value.socketFunctions.resolvePowerUp).toHaveBeenLastCalledWith({offerId:id,action:'DECLINE'});
  });
  it('renders owned card details and only category summaries for other players',()=>{
    const value=context('COMPLETED',true);value.state.players['player-b'].powerUps={count:2,categories:{ATTACK:1,DEFENSE:1,UTILITY:0}};
    render(view(value));fireEvent.click(screen.getByRole('button',{name:/Kho Power-up/}));
    expect(screen.getAllByText('Visible card 0')).toHaveLength(3);expect(screen.getAllByText('Registry effect 0')).toHaveLength(3);
    expect(screen.getByText('Bình')).toBeTruthy();expect(screen.getByText('Tấn công: 1 · Phòng thủ: 1 · Tiện ích: 0')).toBeTruthy();
    expect(screen.queryByText(/Hiệu ứng Power-up sẽ có/)).toBeNull();expect(screen.getAllByRole('button',{name:'Dùng thẻ'})).toHaveLength(3);
  });
  it('submits a card activation with the selected owned property',async()=>{
    const value=context('COMPLETED');
    value.state.boardState.currentPlayer={id:'player-a',hasMoved:false};
    value.state.boardState.ownedProps[1]={id:'player-a',color:'red',houses:0};
    const card={instanceId:'active-1',definitionId:'A02',ownerPlayerId:'player-a',obtainedFromOfferId:'grant-active',
      definition:{...definitions[0],definitionId:'A02',name:'Rent bonus'}};
    value.privatePlayerState!.powerUps!.inventory={capacity:3,cards:[card]};
    value.socketFunctions.activatePowerUp=vi.fn(()=>Promise.resolve(success));
    render(view(value));
    fireEvent.click(screen.getByRole('button',{name:/Kho Power-up/}));
    fireEvent.click(screen.getByRole('button',{name:'Dùng thẻ'}));
    fireEvent.change(screen.getByLabelText('Chọn tài sản'),{target:{value:'1'}});
    await act(()=>{fireEvent.click(screen.getByRole('button',{name:'Dùng thẻ'}));return Promise.resolve();});
    expect(value.socketFunctions.activatePowerUp).toHaveBeenCalledWith({instanceId:'active-1',targetTileID:1});
  });
  it('shows why an Active card is unavailable',()=>{
    const value=context('COMPLETED');
    value.state.boardState.currentPlayer={id:'player-b',hasMoved:false};
    const activeCard={instanceId:'active-2',definitionId:'A02',ownerPlayerId:'player-a',obtainedFromOfferId:'grant-active-2',
      definition:{...definitions[0],definitionId:'A02',name:'Rent bonus'}};
    value.privatePlayerState!.powerUps!.inventory={capacity:3,cards:[activeCard]};
    render(view(value));
    fireEvent.click(screen.getByRole('button',{name:/Kho Power-up/}));
    expect(screen.getByRole<HTMLButtonElement>('button',{name:'Dùng thẻ'}).disabled).toBe(true);
    expect(screen.getByText('Chờ đến lượt của bạn.')).toBeTruthy();
  });
  it('renders a server-deadline reaction countdown and submits a selected Reaction card',async()=>{
    const value=context('COMPLETED');
    const reactionCard={instanceId:'reaction-1',definitionId:'D05',ownerPlayerId:'player-a',obtainedFromOfferId:'grant-reaction',
      definition:{...definitions[1],definitionId:'D05',name:'Phản Đòn'}};
    value.privatePlayerState!.powerUps!.inventory={capacity:3,cards:[reactionCard]};
    value.privatePlayerState!.powerUps!.reaction={eventId:id,kind:'ATTACK',attackerPlayerId:'player-b',attackerName:'Bình',
      attackDefinitionId:'A01',attackName:'Móc Túi',deadlineAt:new Date(Date.now()+15_000).toISOString(),eligibleInstanceIds:[reactionCard.instanceId]};
    value.socketFunctions.respondPowerUp=vi.fn(()=>Promise.resolve(success));
    render(view(value));
    expect(screen.getByRole('timer').textContent).toContain('Còn');
    expect(screen.getByText('Đòn Móc Túi của Bình đang nhắm tới bạn.')).toBeTruthy();
    await act(()=>{fireEvent.click(screen.getByRole('button',{name:'Dùng thẻ'}));return Promise.resolve();});
    expect(value.socketFunctions.respondPowerUp).toHaveBeenCalledWith({eventId:id,action:'REACT',instanceId:'reaction-1'});
  });
  it('reports a rejected selection and leaves the server offer hidden for a safe retry',async()=>{
    const value=context();value.socketFunctions.selectPowerUp=vi.fn(():Promise<Ack>=>Promise.resolve({ok:false,protocolVersion:SOCKET_PROTOCOL_VERSION,error:{code:'CONFLICT',message:'Server rejected choice',retryable:true}}));
    render(view(value));await act(()=>fireEvent.click(screen.getByRole('button',{name:'Tấn công'})));
    expect(screen.getByRole('alert').textContent).toBe('Server rejected choice');expect(screen.queryByText('Visible card 0')).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button',{name:'Tiện ích'}).disabled).toBe(false);
    expect(document.querySelector('.power-up-card--selected')).toBeNull();
    expect(document.querySelector('.power-up-picker-burst')).toBeNull();
    await act(()=>fireEvent.click(screen.getByRole('button',{name:'Tiện ích'})));
    expect(value.socketFunctions.selectPowerUp).toHaveBeenLastCalledWith({offerId:id,selectedIndex:2});
  });
  it('keeps the reward behind mandatory gameplay interactions and removes actions while disconnected',()=>{
    const value=context();value.state.turnInfo.pendingLandingDecision={kind:'PURCHASE',operationId:'purchase',playerId:'player-a',tileID:1};
    const rendered=render(view(value));expect(screen.queryByRole('dialog',{name:'Quà Xuất Phát'})).toBeNull();
    delete value.state.turnInfo.pendingLandingDecision;rendered.rerender(view({...value,connected:false}));expect(screen.queryByRole('dialog',{name:'Quà Xuất Phát'})).toBeNull();
    rendered.rerender(view({...value,connected:true}));expect(screen.getByRole('dialog',{name:'Quà Xuất Phát'})).toBeTruthy();
  });
  it('uses the existing modal peek/restore without changing the offer or sending a claim',async()=>{
    const value=context();render(view(value));fireEvent.click(screen.getByRole('button',{name:'Xem bàn cờ'}));
    expect(value.socketFunctions.selectPowerUp).not.toHaveBeenCalled();expect(value.socketFunctions.resolvePowerUp).not.toHaveBeenCalled();
    await act(async()=>fireEvent.click(await screen.findByRole('button',{name:'Hiện quyết định'})));
    expect(screen.getByRole('button',{name:'Tấn công'})).toBeTruthy();expect(screen.queryByText('Visible card 0')).toBeNull();
  });
});

it('opens full details without issuing gameplay commands and returns to inventory',()=>{
  const value=context('COMPLETED',true);value.privatePlayerState!.powerUps!.inventory!.cards=value.privatePlayerState!.powerUps!.inventory!.cards.slice(0,1);
  render(view(value));fireEvent.click(screen.getByRole('button',{name:/Kho Power-up/}));
  fireEvent.click(screen.getByRole('button',{name:'Xem chi tiết · Visible card 0'}));
  const detail=screen.getByRole('dialog',{name:'Visible card 0'});expect(detail.textContent).toContain('Registry effect 0');expect(detail.querySelector('.power-up-artwork img')).toBeTruthy();
  fireEvent.click(detail.querySelector('button[aria-label="Đóng"]')!);expect(screen.getByRole('dialog',{name:'Kho Power-up'})).toBeTruthy();expect(value.socketFunctions.selectPowerUp).not.toHaveBeenCalled();expect(value.socketFunctions.resolvePowerUp).not.toHaveBeenCalled();
});


describe('Picker selection authority and replay boundaries',()=>{
  it('keeps every candidate locked after a successful ACK while the snapshot is still hidden',async()=>{
    const value=context();const rendered=render(view(value));
    await act(()=>fireEvent.click(screen.getByRole('button',{name:'Tấn công'})));
    for(const label of ['Tấn công','Phòng thủ','Tiện ích']){
      const card=screen.getByRole<HTMLButtonElement>('button',{name:label});
      expect(card.disabled).toBe(true);fireEvent.click(card);
    }
    expect(value.socketFunctions.selectPowerUp).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Visible card 0')).toBeNull();
    rendered.rerender(view({...context('REVEALED'),socketFunctions:value.socketFunctions}));
    expect(document.querySelectorAll('.power-up-card--selected')).toHaveLength(1);
    expect(screen.getByRole('button',{name:'Nhận thẻ'})).toBeTruthy();
  });
  it('hydrates the authoritative selection after reconnect without replaying particles or a live flip',()=>{
    const value=context('REVEALED');const rendered=render(view(value));
    expect(document.querySelectorAll('.power-up-picker-card')).toHaveLength(3);
    expect(document.querySelectorAll('.power-up-card--selected')).toHaveLength(1);
    expect(document.querySelector('.power-up-picker-burst')).toBeNull();
    expect(document.querySelector('.power-up-card--reveal-motion')).toBeNull();
    rendered.rerender(view({...value,connected:false}));
    rendered.rerender(view({...value,connected:true}));
    expect(document.querySelector('.power-up-picker-burst')).toBeNull();
    expect(document.querySelector('.power-up-card--reveal-motion')).toBeNull();
    expect(value.socketFunctions.selectPowerUp).not.toHaveBeenCalled();
    expect(value.socketFunctions.resolvePowerUp).not.toHaveBeenCalled();
  });
  it('does not apply picker presentation to replacement cards or inventory details',()=>{
    const value=context('INVENTORY_RESOLUTION',true);render(view(value));
    const replacement=document.querySelector('.power-up-replacement')!;
    expect(replacement.querySelectorAll('.power-up-card')).toHaveLength(3);
    expect(replacement.querySelector('.power-up-picker-card')).toBeNull();
  });
});


it('clears the pending choice after a transport failure and retries only through the server command',async()=>{
  const value=context();value.socketFunctions.selectPowerUp=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(success);
  render(view(value));await act(()=>fireEvent.click(screen.getByRole('button',{name:'Tấn công'})));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(document.querySelector('.power-up-card--selected')).toBeNull();
  expect(document.querySelector('.power-up-picker-burst')).toBeNull();
  await act(()=>fireEvent.click(screen.getByRole('button',{name:'Tiện ích'})));
  expect(value.socketFunctions.selectPowerUp).toHaveBeenLastCalledWith({offerId:id,selectedIndex:2});
  expect(screen.queryByText('Visible card 2')).toBeNull();
});

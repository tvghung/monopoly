import {
  useCallback, useContext, useRef, useEffect, useState, type FormEvent,
} from 'react';
import './style/Log.css';
import stateContext from '../internal';

export const LOG_IDLE_TIMEOUT_MS = 3000;

export function getLogActivitySignature(logs: readonly string[]): string {
  return JSON.stringify([logs.length, logs.at(-1) ?? '']);
}

export default function Log() {
  const { state, socketFunctions, connected } = useContext(stateContext);
  const [chat, setChat] = useState('');
  const [idle, setIdle] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activitySignature = getLogActivitySignature(state.boardState.logs);

  const clearIdleTimeout = useCallback(() => {
    if (idleTimeoutRef.current !== null) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);

  const markActive = useCallback(() => {
    setIdle(false);
    clearIdleTimeout();
    idleTimeoutRef.current = setTimeout(() => {
      idleTimeoutRef.current = null;
      setIdle(true);
    }, LOG_IDLE_TIMEOUT_MS);
  }, [clearIdleTimeout]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activitySignature]);

  useEffect(() => {
    markActive();
    return clearIdleTimeout;
  }, [activitySignature, clearIdleTimeout, markActive]);

  const sendChat = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    markActive();
    if (chat) socketFunctions.sendChat(chat);
    setChat('');
    e.currentTarget.reset();
  };

  return (
    <section
      className={`center__room${idle ? ' center__room--idle' : ''}`}
      data-testid="board-log-overlay"
      data-idle={idle}
      aria-label="Nhật ký và trò chuyện"
      onPointerDown={markActive}
      onFocusCapture={markActive}
    >
      <section ref={scrollRef} className="center__log" role="log" aria-live="polite" aria-label="Nhật ký ván chơi">
        {state.loaded
          ? state.boardState.logs.map((e, i) => (
            <p
              key={i}
              dangerouslySetInnerHTML={{ __html: e }}
            />
          ))
          : <p>Đang tải…</p>}
      </section>
      <section className="center__chat">
        <form className="center__chat--form" onSubmit={sendChat}>
          <input
            className="center__chat--input"
            aria-label="Tin nhắn"
            disabled={!connected}
            onChange={e => {
              markActive();
              setChat(e.target.value);
            }}
            type="text"
            name="chat"
            id="chat"
            autoComplete="off"
            placeholder="Nhập tin nhắn…"
          />
          <button className="center__chat--button" type="submit" disabled={!connected}>Gửi</button>
        </form>
      </section>
    </section>
  );
}

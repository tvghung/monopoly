import {
  useContext, useRef, useEffect, useState, type FormEvent,
} from 'react';
import './style/Log.css';
import stateContext from '../internal';

export default function Log() {
  const { state, socketFunctions, connected } = useContext(stateContext);
  const [chat, setChat] = useState('');
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [state.boardState.logs]);

  const sendChat = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (chat) socketFunctions.sendChat(chat);
    setChat('');
    e.currentTarget.reset();
  };

  return (
    <section className="center__room" data-testid="board-log-overlay" aria-label="Nhật ký và trò chuyện">
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
          <input className="center__chat--input" aria-label="Tin nhắn" disabled={!connected} onChange={e => setChat(e.target.value)} type="text" name="chat" id="chat" autoComplete="off" placeholder="Nhập tin nhắn…" />
          <button className="center__chat--button" type="submit" disabled={!connected}>Gửi</button>
        </form>
      </section>
    </section>
  );
}

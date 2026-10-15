
'use client';

import { useEffect, useState } from 'react';

async function api(payload) {
  const response = await fetch('/api/quiz', {
    method: payload ? 'POST' : 'GET',
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить запрос');
  return data;
}

async function apiGetState(roomCode, playerId) {
  const query = new URLSearchParams({ code: roomCode });
  if (playerId) query.set('player_id', playerId);

  const response = await fetch('/api/quiz?' + query.toString(), {
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось обновить комнату');
  return data;
}

export default function Home() {
  const [mode, setMode] = useState('home');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [room, setRoom] = useState(null);
  const [player, setPlayer] = useState(null);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('code');

    if (invite) {
      setCode(invite.toUpperCase());
      setMode('join');
    }
  }, []);

  useEffect(() => {
    const activeCode = room?.room_code || code;
    if (!activeCode) return;

    const timer = setInterval(async () => {
      try {
        setState(await apiGetState(activeCode, player?.id));
      } catch (_) {}
    }, 2200);

    return () => clearInterval(timer);
  }, [room?.room_code, code, player?.id]);

  async function run(action) {
    setBusy(true);
    setError('');
    setNotice('');

    try {
      return await action();
    } catch (e) {
      setError(e.message || 'Что-то пошло не так');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createRoom() {
    const result = await run(() => api({ action: 'create_room', pin }));
    if (!result) return;

    setRoom(result.room);
    setCode(result.room.room_code);
    setPlayer(null);
    setMode('host');
    setState(await apiGetState(result.room.room_code));
    window.history.replaceState({}, '', '/?code=' + result.room.room_code);
  }

  async function loginHost() {
    const roomCode = code.trim().toUpperCase();

    const result = await run(() =>
      api({
        action: 'verify_host',
        room_code: roomCode,
        pin,
      })
    );
    if (!result) return;

    setRoom(result.room);
    setCode(result.room.room_code);
    setPlayer(null);
    setState(await apiGetState(result.room.room_code));
    setMode('host');
    window.history.replaceState({}, '', '/?code=' + result.room.room_code);
    setNotice('Вход ведущего выполнен. Продолжаем игру.');
  }

  async function joinRoom(role = 'guest') {
    const roomCode = code.trim().toUpperCase();

    const result = await run(() =>
      api({
        action: 'join',
        room_code: roomCode,
        display_name: name.trim(),
        role,
      })
    );
    if (!result) return;

    setPlayer(result.player);
    setRoom({ room_code: roomCode });
    setMode(role === 'nadya' ? 'nadya' : 'guest');
    setState(await apiGetState(roomCode, result.player.id));
    window.history.replaceState({}, '', '/?code=' + roomCode);
  }

  async function sendAnswer(optionIndex) {
    if (!player || !state?.question) return;

    const result = await run(async () => {
      await api({
        action: 'answer',
        room_code: room.room_code,
        player_id: player.id,
        question_number: state.question.question_number,
        selected_option: optionIndex,
      });

      setState(await apiGetState(room.room_code, player.id));
      return true;
    });

    if (result) setNotice('Ответ принят!');
  }

  async function hostAction(hostActionName) {
    const result = await run(() =>
      api({
        action: 'host_action',
        host_action: hostActionName,
        room_code: room.room_code,
        pin,
      })
    );

    if (result) setState(await apiGetState(room.room_code));
  }

  const question = state?.question;
  const myAnswer = state?.my_answer;
  const hasAnswered = !!player && myAnswer !== null && myAnswer !== undefined;

  const inviteUrl =
    typeof window !== 'undefined' && room?.room_code
      ? window.location.origin + '/?code=' + room.room_code
      : '';

  const qrUrl = inviteUrl
    ? 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' +
      encodeURIComponent(inviteUrl)
    : '';

  const waitingForStart =
    (mode === 'guest' || mode === 'nadya') &&
    (!state?.room || state.room.status === 'waiting');

  return (
    <main className="shell">
      <header className="brand">
        <div className="sparkle">✦</div>
        <div>
          <p className="eyebrow">БОЛЬШОЙ ПРАЗДНИЧНЫЙ КВИЗ</p>
          <h1>Надины <span>40</span></h1>
        </div>
      </header>

      {error && (
        <div className="alert error">
          {error}
          <button className="dismiss" onClick={() => setError('')}>×</button>
        </div>
      )}
      {notice && <div className="alert success">{notice}</div>}

      {mode === 'home' && (
        <section className="panel hero">
          <div className="hero-mark">40</div>
          <p className="eyebrow">СЕГОДНЯ ВСЁ О НАДЕ</p>
          <h2>Кто знает Надю лучше всех?</h2>
          <p className="muted">
            Выбирайте ответы, сравнивайте их с Надей и собирайте баллы.
          </p>
          <div className="actions">
            <button className="primary" onClick={() => setMode('create')}>
              Создать игру · ведущий
            </button>
            <button className="secondary" onClick={() => setMode('join')}>
              Войти в игру
            </button>
          </div>
        </section>
      )}

      {mode === 'create' && (
        <section className="panel form-panel">
          <button className="back" onClick={() => setMode('home')}>← Назад</button>
          <p className="eyebrow">ДЛЯ ВЕДУЩЕГО</p>
          <h2>Создать комнату</h2>
          <p className="muted">Введи секретный PIN ведущего из настроек Vercel.</p>
          <label>
            PIN ведущего
            <input
              value={pin}
              onChange={e => setPin(e.target.value)}
              type="password"
              placeholder="Секретный PIN"
              autoComplete="current-password"
            />
          </label>
          <button className="primary full" disabled={busy || !pin} onClick={createRoom}>
            {busy ? 'Создаём…' : 'Создать комнату'}
          </button>
          <button
            className="text-button full"
            onClick={() => { setError(''); setMode('host-login'); }}
          >
            Войти в существующую комнату
          </button>
        </section>
      )}

      {mode === 'join' && (
        <section className="panel form-panel">
          <button className="back" onClick={() => setMode('home')}>← Назад</button>
          <p className="eyebrow">ПОДКЛЮЧЕНИЕ</p>
          <h2>Войти в игру</h2>
          <label>
            Код комнаты
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="Например, H7QF7B"
              maxLength={6}
            />
          </label>
          <label>
            Как тебя зовут?
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Имя для таблицы результатов"
              maxLength={40}
            />
          </label>
          <button
            className="primary full"
            disabled={busy || !code.trim() || !name.trim()}
            onClick={() => joinRoom('guest')}
          >
            {busy ? 'Подключаем…' : 'Войти как участник'}
          </button>
          <button
            className="text-button full"
            disabled={busy || !code.trim() || !name.trim()}
            onClick={() => joinRoom('nadya')}
          >
            Я Надя — отвечать за именинницу
          </button>
          <button
            className="text-button full"
            onClick={() => { setError(''); setMode('host-login'); }}
          >
            Я ведущий
          </button>
        </section>
      )}

      {mode === 'host-login' && (
        <section className="panel form-panel">
          <button className="back" onClick={() => setMode('home')}>← Назад</button>
          <p className="eyebrow">ДЛЯ ВЕДУЩЕГО</p>
          <h2>Войти в существующую комнату</h2>
          <p className="muted">
            Введи код комнаты и PIN ведущего. Новая комната не создаётся.
          </p>
          <label>
            Код комнаты
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="Например, H7QF7B"
              maxLength={6}
              autoComplete="off"
            />
          </label>
          <label>
            PIN ведущего
            <input
              value={pin}
              onChange={e => setPin(e.target.value)}
              type="password"
              placeholder="Секретный PIN"
              autoComplete="current-password"
            />
          </label>
          <button
            className="primary full"
            disabled={busy || code.trim().length !== 6 || !pin}
            onClick={loginHost}
          >
            {busy ? 'Проверяем…' : 'Войти как ведущий'}
          </button>
        </section>
      )}

      {(mode === 'host' || mode === 'guest' || mode === 'nadya') && (
        <>
          <section className="panel room-head">
            <div>
              <p className="eyebrow">КОМНАТА</p>
              <h2 className="room-code">{room?.room_code || code}</h2>
              <p className="muted">{state?.players?.length || 0} участников</p>
            </div>
            {mode === 'host' && (
              <div className="qr">
                <img src={qrUrl} alt="QR-код для входа в игру" />
                <span>Сканируй, чтобы войти</span>
              </div>
            )}
          </section>

          {mode === 'host' && (
            <section className="panel">
              <p className="eyebrow">ПАНЕЛЬ ВЕДУЩЕГО</p>
              <h2>
                {state?.room?.status === 'finished'
                  ? 'Игра завершена'
                  : state?.room?.voting_open
                    ? 'Голосование открыто'
                    : 'Голосование закрыто'}
              </h2>
              <p className="muted">
                {state?.room?.voting_open
                  ? 'Гости отвечают. Закрой голосование, когда все готовы.'
                  : 'Ответы Нади будут показаны после закрытия голосования.'}
              </p>
              <div className="actions wrap">
                {!state?.room?.voting_open && state?.room?.status !== 'finished' && (
                  <button className="primary" disabled={busy} onClick={() => hostAction('open')}>
                    Открыть голосование
                  </button>
                )}
                {state?.room?.voting_open && (
                  <button className="primary" disabled={busy} onClick={() => hostAction('close')}>
                    Закрыть голосование
                  </button>
                )}
                {!state?.room?.voting_open && state?.room?.status !== 'finished' && (
                  <button
                    className="secondary"
                    disabled={busy || !state?.room?.current_question_number || state.room.current_question_number >= 22}
                    onClick={() => hostAction('next')}
                  >
                    Следующий вопрос →
                  </button>
                )}
                {state?.room?.status !== 'finished' && (
                  <button className="danger" disabled={busy} onClick={() => hostAction('finish')}>
                    Завершить игру
                  </button>
                )}
              </div>
            </section>
          )}

          {waitingForStart && (
            <section className="panel hero waiting-panel">
              <div className="hero-mark">✦</div>
              <p className="eyebrow">ТЫ В КОМНАТЕ!</p>
              <h2>Ждём начала игры 🎉</h2>
              <p className="muted">
                Когда ведущий откроет первый вопрос, он появится здесь автоматически.
              </p>
              <div className="waiting-indicator"><span>●</span> Ожидаем ведущего</div>
            </section>
          )}

          {question && !waitingForStart && (
            <section className="panel question-panel">
              <div className="question-top">
                <span className="pill">ВОПРОС {question.question_number} / 22</span>
                <span className={'status ' + (state?.room?.voting_open ? 'live' : '')}>
                  {state?.room?.voting_open ? '● Идёт голосование' : 'Голосование закрыто'}
                </span>
              </div>
              <h2>{question.question_text}</h2>
              <div className="options">
                {question.options.map((option, index) => (
                  <button
                    key={index}
                    className={'option ' + (hasAnswered && myAnswer === index ? 'selected' : '')}
                    disabled={mode === 'host' || !state?.room?.voting_open || hasAnswered || state?.room?.status === 'finished'}
                    onClick={() => sendAnswer(index)}
                  >
                    <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                    <span>{option}</span>
                    {hasAnswered && myAnswer === index && <span className="check">✓</span>}
                  </button>
                ))}
              </div>
              {mode !== 'host' && (
                <p className="muted small">
                  {state?.room?.voting_open
                    ? hasAnswered
                      ? 'Твой ответ принят. Ждём раскрытия ответов.'
                      : 'Выбери один вариант ответа.'
                    : 'Дождись, пока ведущий откроет голосование.'}
                </p>
              )}
              {state?.nadya_answer !== null &&
                state?.nadya_answer !== undefined &&
                !state?.room?.voting_open && (
                  <div className="reveal">
                    <span className="eyebrow">ОТВЕТ НАДИ</span>
                    <strong>
                      {String.fromCharCode(65 + state.nadya_answer)} · {question.options[state.nadya_answer]}
                    </strong>
                  </div>
                )}
            </section>
          )}

          {mode === 'host' && (
            <section className="panel">
              <p className="eyebrow">УЧАСТНИКИ</p>
              <div className="player-list">
                {(state?.players || []).map(p => (
                  <div className="player-row" key={p.id}>
                    <span className="avatar">{p.display_name.slice(0, 1).toUpperCase()}</span>
                    <span>{p.display_name}</span>
                    <span className="muted small">
                      {p.role === 'nadya' ? 'Именинница' : 'Участник'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {state?.show_scores && (
            <section className="panel">
              <p className="eyebrow">ТАБЛИЦА РЕЗУЛЬТАТОВ</p>
              <h2>Кто знает Надю лучше всех?</h2>
              <div className="scores">
                {(state?.scores || []).map((s, i) => (
                  <div className="score-row" key={s.player_id}>
                    <span className="rank">{i === 0 ? '🏆' : i + 1}</span>
                    <strong>{s.display_name}</strong>
                    <span className="points">
                      {s.points}{' '}
                      {s.points === 1 ? 'балл' : s.points > 1 && s.points < 5 ? 'балла' : 'баллов'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <footer>Сделано с любовью для Надиного юбилея <span>✦</span></footer>
    </main>
  );
}

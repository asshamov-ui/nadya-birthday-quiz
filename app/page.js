'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'nadya_quiz_session';

async function api(payload) {
  const response = await fetch('/api/quiz', {
    method: payload ? 'POST' : 'GET',
    headers: payload
      ? { 'Content-Type': 'application/json' }
      : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    cache: 'no-store'
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Не удалось выполнить запрос');
  }

  return data;
}

async function apiGetState(roomCode, playerId) {
  const query = new URLSearchParams({ code: roomCode });

  if (playerId) query.set('player_id', playerId);

  const response = await fetch('/api/quiz?' + query.toString(), {
    cache: 'no-store'
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Не удалось обновить комнату');
  }

  return data;
}

function saveSession(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (_) {}
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
}

export default function Home() {
  const [mode, setMode] = useState('home');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [nadyaPin, setNadyaPin] = useState('');
  const [room, setRoom] = useState(null);
  const [player, setPlayer] = useState(null);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [restoring, setRestoring] = useState(true);

  // Восстановление сессии при загрузке.
  useEffect(() => {
    const session = loadSession();
    const invite = new URLSearchParams(window.location.search).get('code');
    const urlCode = invite ? invite.toUpperCase() : '';

    if (!session) {
      if (urlCode) {
        setCode(urlCode);
        setMode('join');
      }
      setRestoring(false);
      return;
    }

    const savedCode = session.room_code;
    const savedRole = session.role;
    const savedPlayerId = session.player_id;

    if (!savedCode || !savedRole) {
      clearSession();
      setRestoring(false);
      return;
    }

    setCode(savedCode);
    setPin(session.host_pin || '');

    (async () => {
      try {
        const fresh = await apiGetState(
          savedCode,
          savedPlayerId || undefined
        );

        if (!fresh?.room) {
          clearSession();
          if (urlCode) {
            setCode(urlCode);
            setMode('join');
          }
          setRestoring(false);
          return;
        }

        setRoom({ room_code: savedCode });
        setState(fresh);

        if (savedRole === 'host') {
          setMode('host');
        } else if (savedRole === 'nadya') {
          const me = (fresh.players || []).find(
            (p) => p.role === 'nadya'
          );
          if (me) {
            setPlayer({
              id: me.id,
              display_name: me.display_name,
              role: me.role
            });
            setName(me.display_name);
            setMode('nadya');
          } else {
            clearSession();
            setMode('join');
          }
        } else {
          const me = (fresh.players || []).find(
            (p) => p.id === savedPlayerId
          );
          if (me) {
            setPlayer({
              id: me.id,
              display_name: me.display_name,
              role: me.role
            });
            setName(me.display_name);
            setMode('guest');
          } else {
            clearSession();
            setMode('join');
          }
        }
      } catch (_) {
        clearSession();
        if (urlCode) {
          setCode(urlCode);
          setMode('join');
        }
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  // Опрос состояния — только когда есть код и сессия восстановлена.
  useEffect(() => {
    const activeCode = room?.room_code || code;

    if (!activeCode || restoring) return;

    const timer = setInterval(async () => {
      try {
        const newState = await apiGetState(activeCode, player?.id);
        setState(newState);
      } catch (_) {
        // Временная ошибка сети не прерывает игру.
      }
    }, 2200);

    return () => clearInterval(timer);
  }, [room?.room_code, code, player?.id, restoring]);

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
    const result = await run(() =>
      api({
        action: 'create_room',
        pin
      })
    );

    if (!result) return;

    setRoom(result.room);
    setCode(result.room.room_code);
    setPlayer(null);
    setMode('host');

    saveSession({
      room_code: result.room.room_code,
      role: 'host',
      host_pin: pin,
      player_id: null
    });

    setState(await apiGetState(result.room.room_code));

    window.history.replaceState(
      {},
      '',
      '/?code=' + result.room.room_code
    );
  }

  async function loginHost() {
    const roomCode = code.trim().toUpperCase();

    const result = await run(() =>
      api({
        action: 'verify_host',
        room_code: roomCode,
        pin
      })
    );

    if (!result) return;

    setRoom(result.room);
    setCode(result.room.room_code);
    setPlayer(null);

    saveSession({
      room_code: result.room.room_code,
      role: 'host',
      host_pin: pin,
      player_id: null
    });

    setState(await apiGetState(result.room.room_code));
    setMode('host');

    window.history.replaceState(
      {},
      '',
      '/?code=' + result.room.room_code
    );

    setNotice('Вход ведущего выполнен.');
  }

  async function joinRoom(role = 'guest', nadyaPinValue = '') {
    const roomCode = code.trim().toUpperCase();

    const result = await run(() =>
      api({
        action: 'join',
        room_code: roomCode,
        display_name: name.trim(),
        role,
        nadya_pin: role === 'nadya' ? nadyaPinValue : undefined
      })
    );

    if (!result) return;

    setPlayer(result.player);
    setRoom({ room_code: roomCode });
    setMode(role === 'nadya' ? 'nadya' : 'guest');

    saveSession({
      room_code: roomCode,
      role: role === 'nadya' ? 'nadya' : 'guest',
      player_id: result.player.id
    });

    setState(await apiGetState(roomCode, result.player.id));

    window.history.replaceState(
      {},
      '',
      '/?code=' + roomCode
    );
  }

  async function sendAnswer(optionIndex) {
    if (!player || !state?.question || !state?.room?.voting_open) {
      return;
    }

    const result = await run(async () => {
      await api({
        action: 'answer',
        room_code: room.room_code,
        player_id: player.id,
        question_number: state.question.play_number,
        selected_option: optionIndex
      });

      setState(await apiGetState(room.room_code, player.id));

      return true;
    });

    if (result) {
      setNotice('Ответ принят. Его можно изменить до фиксации.');
    }
  }

  async function hostAction(hostActionName) {
    const result = await run(() =>
      api({
        action: 'host_action',
        host_action: hostActionName,
        room_code: room.room_code,
        pin
      })
    );

    if (result) {
      setState(await apiGetState(room.room_code));

      if (hostActionName === 'lock') {
        setNotice('Ответы зафиксированы.');
      }

      if (hostActionName === 'open') {
        setNotice('Игра началась!');
      }
    }
  }

  function leaveRoom() {
    clearSession();
    setRoom(null);
    setPlayer(null);
    setState(null);
    setMode('home');
    setCode('');
    setPin('');
    setName('');
    setNadyaPin('');
    setNotice('');
    setError('');
    window.history.replaceState({}, '', '/');
  }

  const question = state?.question;
  const rawMyAnswer = state?.my_answer;
  const myAnswer =
    rawMyAnswer === null || rawMyAnswer === undefined
      ? null
      : Number(rawMyAnswer);

  const hasAnswered =
    !!player &&
    myAnswer !== null &&
    Number.isInteger(myAnswer);

  const playNumber =
    question?.play_number ||
    state?.room?.current_question_number ||
    1;

  const answersLocked =
    !!state?.answers_locked ||
    (
      state?.room?.status === 'playing' &&
      !state?.room?.voting_open
    );

  const rawCorrectAnswer = answersLocked ? state?.nadya_answer : null;
  const correctAnswer =
    rawCorrectAnswer === null || rawCorrectAnswer === undefined
      ? null
      : Number(rawCorrectAnswer);

  const nadyaAnswered = !!state?.nadya_answered;

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

  const showRoomInfo = state?.room?.status === 'waiting';

  if (restoring) {
    return (
      <main className="shell">
        <div className="panel hero">
          <div className="hero-mark">✦</div>
          <p className="eyebrow">ПОДКЛЮЧАЕМСЯ</p>
          <h2>Секунду…</h2>
          <p className="muted">Восстанавливаем вашу сессию</p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="brand">
        <div className="sparkle">✦</div>

        <div>
          <p className="eyebrow">ПРАЗДНИЧНЫЙ КВИЗ</p>
          <h1>
            Надины <span>40</span>
          </h1>
        </div>
      </header>

      {(mode === 'guest' || mode === 'nadya') && player && (
        <div className="player-name-bar" aria-label="Имя участника">
          <span>Вы вошли как</span>
          <strong>{player.display_name || name || 'Участник'}</strong>
          <button className="leave-button" onClick={leaveRoom}>
            Выйти
          </button>
        </div>
      )}

      {mode === 'host' && (
        <div className="player-name-bar" aria-label="Панель ведущего">
          <span>Режим</span>
          <strong>Ведущий</strong>
          <button className="leave-button" onClick={leaveRoom}>
            Выйти
          </button>
        </div>
      )}

      {error && (
        <div className="alert error">
          {error}
          <button
            className="dismiss"
            onClick={() => setError('')}
          >
            ×
          </button>
        </div>
      )}

      {notice && (
        <div className="alert success">
          {notice}
        </div>
      )}

      {mode === 'home' && (
        <section className="panel hero">
          <div className="hero-mark">40</div>

          <p className="eyebrow">СЕГОДНЯ ВСЁ О НАДЕ</p>

          <h2>Кто знает Надю лучше всех?</h2>

          <p className="muted">
            Выбирайте ответы, сравнивайте их с Надей
            и собирайте баллы.
          </p>

          <div className="actions">
            <button
              className="primary"
              onClick={() => setMode('create')}
            >
              Создать игру · ведущий
            </button>

            <button
              className="secondary"
              onClick={() => setMode('join')}
            >
              Войти в игру
            </button>
          </div>
        </section>
      )}

      {mode === 'create' && (
        <section className="panel form-panel">
          <button
            className="back"
            onClick={() => setMode('home')}
          >
            ← Назад
          </button>

          <p className="eyebrow">ДЛЯ ВЕДУЩЕГО</p>
          <h2>Создать комнату</h2>

          <p className="muted">
            Введи секретный PIN ведущего из настроек Vercel.
          </p>

          <label>
            PIN ведущего
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              type="password"
              placeholder="Секретный PIN"
              autoComplete="current-password"
            />
          </label>

          <button
            className="primary full"
            disabled={busy || !pin}
            onClick={createRoom}
          >
            {busy ? 'Создаём…' : 'Создать комнату'}
          </button>

          <button
            className="text-button full"
            onClick={() => {
              setError('');
              setMode('host-login');
            }}
          >
            Войти в существующую комнату
          </button>
        </section>
      )}

      {mode === 'join' && (
        <section className="panel form-panel">
          <button
            className="back"
            onClick={() => setMode('home')}
          >
            ← Назад
          </button>

          <p className="eyebrow">ПОДКЛЮЧЕНИЕ</p>
          <h2>Войти в игру</h2>

          <label>
            Код комнаты
            <input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase())
              }
              placeholder="Например, H7QF7B"
              maxLength={6}
            />
          </label>

          <label>
            Как тебя зовут?
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
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
            onClick={() => {
              setError('');
              setNadyaPin('');
              setMode('nadya-pin');
            }}
          >
            Я Надя — отвечать за именинницу
          </button>

          <button
            className="text-button full"
            onClick={() => {
              setError('');
              setMode('host-login');
            }}
          >
            Я ведущий
          </button>
        </section>
      )}

      {mode === 'nadya-pin' && (
        <section className="panel form-panel">
          <button
            className="back"
            onClick={() => setMode('join')}
          >
            ← Назад
          </button>

          <p className="eyebrow">ВХОД ДЛЯ ИМЕНИННИЦЫ</p>
          <h2>Только для Нади</h2>

          <p className="muted">
            Введи секретный PIN именинницы.
          </p>

          <label>
            PIN именинницы
            <input
              value={nadyaPin}
              onChange={(e) =>
                setNadyaPin(e.target.value.replace(/\D/g, '').slice(0, 4))
              }
              type="password"
              inputMode="numeric"
              placeholder="4 цифры"
              maxLength={4}
              autoComplete="off"
            />
          </label>

          <button
            className="primary full"
            disabled={busy || nadyaPin.length !== 4}
            onClick={() => joinRoom('nadya', nadyaPin)}
          >
            {busy ? 'Проверяем…' : 'Войти как Надя'}
          </button>
        </section>
      )}

      {mode === 'host-login' && (
        <section className="panel form-panel">
          <button
            className="back"
            onClick={() => setMode('home')}
          >
            ← Назад
          </button>

          <p className="eyebrow">ДЛЯ ВЕДУЩЕГО</p>
          <h2>Войти в существующую комнату</h2>

          <p className="muted">
            Введи код комнаты и PIN ведущего.
            Новая комната не создаётся.
          </p>

          <label>
            Код комнаты
            <input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase())
              }
              placeholder="Например, H7QF7B"
              maxLength={6}
              autoComplete="off"
            />
          </label>

          <label>
            PIN ведущего
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              type="password"
              placeholder="Секретный PIN"
              autoComplete="current-password"
            />
          </label>

          <button
            className="primary full"
            disabled={
              busy ||
              code.trim().length !== 6 ||
              !pin
            }
            onClick={loginHost}
          >
            {busy ? 'Проверяем…' : 'Войти как ведущий'}
          </button>
        </section>
      )}

      {['host', 'guest', 'nadya'].includes(mode) && (
        <>
          {showRoomInfo && (
            <section className="panel room-head">
              <div>
                <p className="eyebrow">КОМНАТА</p>

                <h2 className="room-code">
                  {room?.room_code || code}
                </h2>

                <p className="muted">
                  {state?.players?.length || 0} участников
                </p>
              </div>

              {mode === 'host' && (
                <div className="qr">
                  <img
                    src={qrUrl}
                    alt="QR-код для входа в игру"
                  />
                  <span>Сканируй, чтобы войти</span>
                </div>
              )}
            </section>
          )}

          {mode === 'host' && (
            <section className="panel host-panel">
              <p className="eyebrow">ПАНЕЛЬ ВЕДУЩЕГО</p>

              <h2>
                {state?.room?.status === 'finished'
                  ? 'Игра завершена 🎉'
                  : state?.room?.status === 'waiting'
                    ? 'Готовы начинать?'
                    : `Вопрос ${playNumber} из 16 · ${
                        state?.room?.voting_open
                          ? 'голосование открыто'
                          : 'ответы зафиксированы'
                      }`}
              </h2>

              <p className="muted">
                {state?.room?.status === 'waiting'
                  ? 'Когда все гости подключатся, начинай игру.'
                  : state?.room?.status === 'finished'
                    ? 'Ниже — окончательный рейтинг участников.'
                    : (
                        <>
                          Ответили: {state?.answered_count || 0}
                          {' из '}
                          {(state?.players || []).filter(
                            (p) => p.role !== 'nadya'
                          ).length}
                          {' участников.'}
                        </>
                      )}
              </p>

              <div className="actions wrap">
                {state?.room?.status === 'waiting' && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => hostAction('open')}
                  >
                    Начать игру
                  </button>
                )}

                {state?.room?.status === 'playing' &&
                  state?.room?.voting_open && (
                    <button
                      className="primary"
                      disabled={busy || !nadyaAnswered}
                      onClick={() => hostAction('lock')}
                    >
                      {nadyaAnswered
                        ? 'Зафиксировать ответы'
                        : 'Ждём ответ Нади…'}
                    </button>
                  )}

                {state?.room?.status === 'playing' &&
                  !state?.room?.voting_open && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => hostAction('next')}
                    >
                      {playNumber >= 16
                        ? 'Завершить и показать результаты'
                        : 'Следующий вопрос →'}
                    </button>
                  )}

                {state?.room?.status !== 'finished' && (
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => hostAction('finish')}
                  >
                    Завершить игру досрочно
                  </button>
                )}
              </div>

              {state?.room?.status === 'playing' &&
                state?.room?.voting_open &&
                !nadyaAnswered && (
                  <p className="muted small">
                    Надя ещё не выбрала ответ. Как только она ответит,
                    кнопка фиксации станет активной.
                  </p>
                )}
            </section>
          )}

          {waitingForStart && (
            <section className="panel hero waiting-panel">
              <div className="hero-mark">✦</div>

              <p className="eyebrow">ТЫ В КОМНАТЕ!</p>

              <h2>Ждём начала игры 🎉</h2>

              <p className="muted">
                Когда ведущий начнёт игру, первый вопрос
                появится здесь автоматически.
              </p>

              <div className="waiting-indicator">
                <span>●</span> Ожидаем ведущего
              </div>
            </section>
          )}

          {question &&
            state?.room?.status !== 'waiting' &&
            state?.room?.status !== 'finished' && (
              <section className="panel question-panel">
                <div className="question-top">
                  <span className="pill">
                    ВОПРОС {playNumber} / 16
                  </span>

                  <span
                    className={
                      'status ' +
                      (state?.room?.voting_open ? 'live' : '')
                    }
                  >
                    {state?.room?.voting_open
                      ? '● Идёт голосование'
                      : 'Ответы зафиксированы'}
                  </span>
                </div>

                <h2>{question.question_text}</h2>

                <div className="options">
                  {question.options.map((option, index) => {
                    const isCorrect = correctAnswer === index;

                    const isMyWrong =
                      answersLocked &&
                      hasAnswered &&
                      myAnswer === index &&
                      myAnswer !== correctAnswer;

                    const classes = [
                      'option',
                      hasAnswered && myAnswer === index ? 'selected' : '',
                      isCorrect ? 'correct' : '',
                      isMyWrong ? 'incorrect' : ''
                    ]
                      .filter(Boolean)
                      .join(' ');

                    return (
                      <button
                        key={index}
                        className={classes}
                        disabled={
                          mode === 'host' ||
                          !state?.room?.voting_open ||
                          state?.room?.status !== 'playing'
                        }
                        onClick={() => sendAnswer(index)}
                      >
                        <span className="option-letter">
                          {String.fromCharCode(65 + index)}
                        </span>

                        <span>{option}</span>

                        {hasAnswered && myAnswer === index && (
                          <span className="check">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {mode !== 'host' && (
                  <p className="muted small">
                    {state?.room?.voting_open
                      ? hasAnswered
                        ? mode === 'nadya'
                          ? 'Твой ответ принят. Как только ты выберешь, ведущий сможет зафиксировать ответы.'
                          : 'Твой ответ принят. Его можно изменить до фиксации.'
                        : mode === 'nadya'
                          ? 'Выбери вариант — от твоего ответа зависит, когда ведущий сможет зафиксировать ответы.'
                          : 'Выбери вариант ответа.'
                      : 'Ответы зафиксированы.'}
                  </p>
                )}

                {correctAnswer !== null &&
                  correctAnswer !== undefined && (
                    <div className="reveal">
                      <span className="eyebrow">ОТВЕТ НАДИ</span>

                      <strong>
                        {String.fromCharCode(65 + correctAnswer)}
                        {' · '}
                        {question.options[correctAnswer]}
                      </strong>
                    </div>
                  )}
              </section>
            )}

          {mode === 'host' &&
            state?.room?.status === 'waiting' && (
              <section className="panel">
                <p className="eyebrow">ГОСТИ В КОМНАТЕ</p>

                <div className="player-list">
                  {(state?.players || []).map((p) => (
                    <div className="player-row" key={p.id}>
                      <span className="avatar">
                        {p.display_name.slice(0, 1).toUpperCase()}
                      </span>

                      <span>{p.display_name}</span>

                      <span className="muted small">
                        {p.role === 'nadya'
                          ? 'Именинница'
                          : 'Участник'}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

          {state?.show_scores && (
            <section
              className={
                'panel scores-panel ' +
                (state?.room?.status === 'finished'
                  ? 'final-scores'
                  : '')
              }
            >
              {state?.room?.status === 'finished' ? (
                <>
                  <div className="confetti" aria-hidden="true">
                    {Array.from({ length: 36 }, (_, i) => (
                      <span
                        key={i}
                        style={{ '--i': i }}
                      >
                        {['✦', '✧', '🎉', '★'][i % 4]}
                      </span>
                    ))}
                  </div>

                  <p className="eyebrow">
                    🎉 ВИКТОРИНА ЗАВЕРШЕНА 🎉
                  </p>

                  <h2>Кто знает Надю лучше всех?</h2>

                  <p className="muted">
                    Спасибо всем за игру и поздравления имениннице!
                  </p>
                </>
              ) : (
                <>
                  <p className="eyebrow">ТЕКУЩИЙ РЕЙТИНГ</p>
                  <h2>Кто впереди?</h2>
                </>
              )}

              <div className="scores">
                {(state?.scores || []).map((s, i) => (
                  <div className="score-row" key={s.player_id}>
                    <span className="rank">
                      {i === 0
                        ? '🏆'
                        : state?.room?.status === 'finished' && i === 1
                          ? '🥈'
                          : state?.room?.status === 'finished' && i === 2
                            ? '🥉'
                            : i + 1}
                    </span>

                    <strong>{s.display_name}</strong>

                    <span className="points">
                      {s.points}{' '}
                      {s.points === 1
                        ? 'балл'
                        : s.points > 1 && s.points < 5
                          ? 'балла'
                          : 'баллов'}
                    </span>
                  </div>
                ))}
              </div>

              {state?.room?.status === 'finished' &&
                state?.scores?.length > 0 && (
                  <div className="winner-message">
                    🥳 Победитель:{' '}
                    <strong>{state.scores[0].display_name}</strong>!
                  </div>
                )}
            </section>
          )}
        </>
      )}

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: #fff9f0;
          color: #30251f;
          font-family: Arial, Helvetica, sans-serif;
        }

        button,
        input {
          font: inherit;
        }

        button {
          cursor: pointer;
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .shell {
          width: min(760px, 100%);
          margin: 0 auto;
          padding: 24px 18px 36px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 14px;
          margin: 0 0 24px;
        }

        .sparkle {
          display: grid;
          place-items: center;
          width: 52px;
          height: 52px;
          border-radius: 16px;
          background: #f7dfaa;
          color: #81531a;
          font-size: 30px;
        }

        .brand h1 {
          margin: 0;
          font-size: clamp(28px, 6vw, 38px);
          letter-spacing: -1px;
        }

        .brand h1 span {
          color: #b77925;
        }

        .player-name-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: -8px 0 20px;
          padding: 12px 16px;
          border: 1px solid #ead8bb;
          border-radius: 14px;
          background: #fffaf1;
          color: #78572d;
        }

        .player-name-bar span {
          font-size: 13px;
        }

        .player-name-bar strong {
          color: #382b1b;
          font-size: 16px;
          overflow-wrap: anywhere;
          text-align: right;
          flex: 1;
        }

        .leave-button {
          padding: 6px 12px;
          border: 1px solid #ead8bb;
          border-radius: 10px;
          background: #fff;
          color: #9b713b;
          font-size: 12px;
          font-weight: 700;
        }

        .leave-button:hover {
          background: #fff4df;
        }

        .eyebrow {
          margin: 0 0 8px;
          color: #9b713b;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1.5px;
        }

        .panel {
          position: relative;
          margin-bottom: 16px;
          padding: 24px;
          border: 1px solid #eee0cc;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 8px 28px rgb(83 57 23 / 5%);
        }

        .panel h2 {
          margin: 0 0 12px;
          font-size: clamp(22px, 5vw, 30px);
          line-height: 1.2;
          letter-spacing: -0.5px;
        }

        .muted {
          color: #786f66;
          line-height: 1.5;
        }

        .small {
          font-size: 13px;
        }

        .hero {
          text-align: center;
          padding: 36px 24px;
        }

        .hero-mark {
          display: grid;
          place-items: center;
          width: 104px;
          height: 104px;
          margin: 0 auto 24px;
          border: 5px solid #f5d89d;
          border-radius: 50%;
          background: #fff4d8;
          color: #a66c1b;
          font-size: 46px;
          font-weight: 900;
        }

        .actions {
          display: flex;
          justify-content: center;
          gap: 10px;
          margin-top: 24px;
        }

        .actions.wrap {
          flex-wrap: wrap;
        }

        .primary,
        .secondary,
        .danger {
          min-height: 48px;
          padding: 13px 18px;
          border: 0;
          border-radius: 13px;
          font-weight: 750;
          transition: transform 0.15s ease, opacity 0.15s ease;
        }

        .primary {
          background: #a86e25;
          color: #fff;
        }

        .secondary {
          border: 1px solid #e6d6be;
          background: #fff9ef;
          color: #65451f;
        }

        .danger {
          border: 1px solid #f0c5c5;
          background: #fff0f0;
          color: #a12626;
        }

        .primary:hover,
        .secondary:hover,
        .danger:hover {
          transform: translateY(-1px);
        }

        .full {
          width: 100%;
          margin-top: 12px;
        }

        .form-panel {
          max-width: 520px;
          margin-right: auto;
          margin-left: auto;
        }

        .form-panel label {
          display: block;
          margin-top: 18px;
          color: #55463a;
          font-size: 14px;
          font-weight: 700;
        }

        .form-panel input {
          display: block;
          width: 100%;
          min-height: 48px;
          margin-top: 8px;
          padding: 12px 14px;
          border: 1px solid #ded0be;
          border-radius: 12px;
          outline: none;
          background: #fffdf9;
          color: #30251f;
        }

        .form-panel input:focus {
          border-color: #b9823b;
          box-shadow: 0 0 0 3px rgb(185 130 59 / 13%);
        }

        .back,
        .text-button {
          padding: 8px 0;
          border: 0;
          background: transparent;
          color: #916329;
          font-weight: 700;
        }

        .back {
          margin-bottom: 18px;
        }

        .room-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
        }

        .room-code {
          margin: 0;
          font-size: 32px;
          letter-spacing: 4px;
        }

        .qr {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          color: #786f66;
          font-size: 11px;
          text-align: center;
        }

        .qr img {
          display: block;
          width: 112px;
          height: 112px;
          border-radius: 10px;
        }

        .host-panel {
          border-color: #e5cfaa;
          background: #fffdf8;
        }

        .waiting-panel {
          padding-top: 32px;
          padding-bottom: 32px;
        }

        .waiting-indicator {
          margin-top: 24px;
          color: #8a765f;
          font-size: 13px;
        }

        .waiting-indicator span {
          margin-right: 7px;
          color: #d39b45;
          animation: pulse 1.4s ease-in-out infinite;
        }

        .question-panel h2 {
          margin-top: 22px;
          margin-bottom: 24px;
          font-size: clamp(23px, 5vw, 32px);
          line-height: 1.3;
        }

        .question-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
        }

        .pill {
          padding: 8px 11px;
          border-radius: 100px;
          background: #fff0d5;
          color: #895719;
          font-size: 11px;
          font-weight: 850;
          letter-spacing: 0.5px;
        }

        .status {
          color: #8b7e70;
          font-size: 12px;
        }

        .status.live {
          color: #24814a;
          font-weight: 750;
        }

        .options {
          display: grid;
          gap: 11px;
        }

        .option {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          min-height: 60px;
          padding: 13px 15px;
          border: 1px solid #e8dfd3;
          border-radius: 14px;
          background: #fffdfa;
          color: #352c25;
          text-align: left;
          transition: background 0.15s ease, border 0.15s ease;
        }

        .option:not(:disabled):hover {
          border-color: #c69a5d;
          background: #fff7e8;
        }

        .option.selected {
          border-color: #c18b40;
          background: #fff4df;
        }

        .option-letter {
          display: grid;
          flex: 0 0 32px;
          place-items: center;
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: #f5ead8;
          color: #8b5e27;
          font-size: 13px;
          font-weight: 850;
        }

        .check {
          margin-left: auto;
          color: #8b5e27;
          font-weight: 900;
        }

        .option.correct {
          border-color: #239653 !important;
          background: #d9f8e3 !important;
          color: #14532d !important;
          font-weight: 700;
        }

        .option.incorrect {
          border-color: #dc2626 !important;
          background: #ffe0e0 !important;
          color: #991b1b !important;
          font-weight: 700;
        }

        .reveal {
          display: grid;
          gap: 8px;
          margin-top: 22px;
          padding: 16px;
          border: 1px solid #a6d9b5;
          border-radius: 14px;
          background: #effbf2;
          color: #14532d;
        }

        .reveal .eyebrow {
          margin: 0;
          color: #287744;
        }

        .player-list {
          display: grid;
          gap: 12px;
        }

        .player-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .avatar {
          display: grid;
          flex: 0 0 34px;
          place-items: center;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: #f8ead2;
          color: #885b26;
          font-weight: 800;
        }

        .player-row .muted {
          margin-left: auto;
        }

        .scores-panel {
          position: relative;
          overflow: hidden;
        }

        .scores {
          display: grid;
          gap: 9px;
          margin-top: 18px;
        }

        .score-row {
          display: flex;
          align-items: center;
          gap: 12px;
          min-height: 52px;
          padding: 10px 13px;
          border: 1px solid #eee4d5;
          border-radius: 13px;
          background: #fffdf9;
        }

        .rank {
          display: grid;
          flex: 0 0 30px;
          place-items: center;
          width: 30px;
          font-size: 19px;
          font-weight: 800;
        }

        .score-row strong {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .points {
          margin-left: auto;
          white-space: nowrap;
          color: #8a5c22;
          font-size: 13px;
          font-weight: 800;
        }

        .final-scores {
          border: 2px solid #f4c95d;
          text-align: center;
          animation: finalAppear 0.7s ease-out both;
        }

        .final-scores .scores {
          text-align: left;
          margin-top: 24px;
        }

        .final-scores .score-row:first-child {
          border-color: #f4c95d;
          background: #fff3c4;
          transform: scale(1.02);
        }

        .winner-message {
          margin-top: 24px;
          padding: 18px;
          border-radius: 16px;
          background: #fff3c4;
          color: #754b00;
          font-size: 1.15rem;
        }

        .confetti {
          display: flex;
          justify-content: space-around;
          flex-wrap: wrap;
          pointer-events: none;
        }

        .confetti span {
          display: inline-block;
          padding: 4px;
          animation: confettiFall 2.8s ease-in-out infinite;
          animation-delay: calc(var(--i) * -0.13s);
        }

        .alert {
          position: relative;
          margin-bottom: 14px;
          padding: 13px 42px 13px 15px;
          border-radius: 12px;
          font-size: 14px;
          line-height: 1.5;
        }

        .alert.error {
          border: 1px solid #f0bcbc;
          background: #fff0f0;
          color: #962d2d;
        }

        .alert.success {
          border: 1px solid #b8dfc1;
          background: #f0fbf2;
          color: #246b39;
        }

        .dismiss {
          position: absolute;
          top: 6px;
          right: 10px;
          border: 0;
          background: transparent;
          color: inherit;
          font-size: 24px;
        }

        footer {
          padding: 24px 0 8px;
          color: #9b8c7a;
          font-size: 12px;
          text-align: center;
        }

        footer span {
          margin-left: 5px;
          color: #c18b40;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 0.45;
          }
          50% {
            opacity: 1;
          }
        }

        @keyframes finalAppear {
          from {
            opacity: 0;
            transform: translateY(18px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes confettiFall {
          0%, 100% {
            transform: translateY(-4px) rotate(0deg);
          }
          50% {
            transform: translateY(14px) rotate(20deg);
          }
        }

        @media (max-width: 520px) {
          .shell {
            padding: 16px 12px 28px;
          }

          .panel {
            padding: 19px;
            border-radius: 18px;
          }

          .hero {
            padding: 28px 18px;
          }

          .actions {
            flex-direction: column;
          }

          .actions button {
            width: 100%;
          }

          .room-head {
            align-items: flex-start;
          }

          .room-code {
            font-size: 25px;
            letter-spacing: 2px;
          }

          .qr img {
            width: 88px;
            height: 88px;
          }

          .question-top {
            align-items: flex-start;
            flex-direction: column;
          }

          .score-row {
            gap: 8px;
            padding: 10px;
          }

          .points {
            font-size: 12px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>

      <footer>
        Сделано с любовью для Надиного юбилея <span>✦</span>
      </footer>
    </main>
  );
}

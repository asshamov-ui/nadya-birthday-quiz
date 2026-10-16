'use client';

import { useEffect, useState } from 'react';

const POLL_INTERVAL = 2200;

// Через сколько секунд сменяется подсказка на экране ожидания.
const HINT_INTERVAL = 4200;

const WAITING_HINTS = [
  'Надя уже накрасилась? 💄',
  'Гости подтягиваются… 🚶‍♀️🚶',
  'Ставки сделаны? Скоро начнём 🎉',
  'Кто знает Надю лучше всех? Сейчас узнаем 🤔',
  'Ведущий что-то замышляет… 😏',
  'Ещё пара секунд — и начнём ✨'
];

async function apiGetState(roomCode) {
  const query = new URLSearchParams({ code: roomCode });

  const response = await fetch('/api/quiz?' + query.toString(), {
    cache: 'no-store'
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Не удалось получить состояние игры');
  }

  return data;
}

export default function ScreenPage() {
  const [code, setCode] = useState('');
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [hintIndex, setHintIndex] = useState(0);

  // Читаем код комнаты из URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get('code');

    if (c) setCode(c.trim().toUpperCase());
  }, []);

  // Поллинг состояния.
  useEffect(() => {
    if (!code) return;

    let cancelled = false;

    async function tick() {
      try {
        const next = await apiGetState(code);

        if (!cancelled) {
          setState(next);
          setError('');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Ошибка сети');
        }
      }
    }

    tick();

    const timer = setInterval(tick, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [code]);

  // Смена подсказок на экране ожидания.
  useEffect(() => {
    const timer = setInterval(() => {
      setHintIndex((i) => (i + 1) % WAITING_HINTS.length);
    }, HINT_INTERVAL);

    return () => clearInterval(timer);
  }, []);

  // Автоперезагрузка, если потеряли связь дольше 30 сек.
  useEffect(() => {
    if (!error) return;

    const timer = setTimeout(() => {
      window.location.reload();
    }, 30000);

    return () => clearTimeout(timer);
  }, [error]);

  // Если код не задан — показываем инструкцию.
  if (!code) {
    return <ScreenShell><NoCodeScreen /></ScreenShell>;
  }

  if (error && !state) {
    return (
      <ScreenShell>
        <div className="state-message">
          <h1>Что-то не так с сетью</h1>
          <p>{error}</p>
          <p className="muted">
            Проверь интернет на телевизоре. Через 30 секунд
            попробуем перезагрузить автоматически.
          </p>
        </div>
      </ScreenShell>
    );
  }

  if (!state) {
    return (
      <ScreenShell>
        <div className="state-message">
          <h1>Загружаем…</h1>
        </div>
      </ScreenShell>
    );
  }

  const room = state.room;

  // Комната не найдена.
  if (!room) {
    return (
      <ScreenShell>
        <div className="state-message">
          <h1>Комната не найдена</h1>
          <p className="muted">
            Проверь код: <strong>{code}</strong>
          </p>
        </div>
      </ScreenShell>
    );
  }

  const question = state.question;
  const playNumber = question?.play_number || room.current_question_number || 1;
  const votingOpen = !!room.voting_open;
  const isFinished = room.status === 'finished';
  const isWaiting = room.status === 'waiting';

  const answersLocked =
    !!state.answers_locked ||
    (room.status === 'playing' && !room.voting_open);

  const rawCorrect = answersLocked ? state.nadya_answer : null;
  const correctAnswer =
    rawCorrect === null || rawCorrect === undefined
      ? null
      : Number(rawCorrect);

  // Рейтинг показываем после 5 и 10 вопросов, а также в конце.
  const showIntermediateScores =
    !isFinished &&
    answersLocked &&
    (playNumber === 5 || playNumber === 10);

  const scores = state.scores || [];
  const top3 = scores.slice(0, 3);

  return (
    <ScreenShell>
      {/* ОЖИДАНИЕ */}
      {isWaiting && (
        <WaitingScreen
          code={code}
          players={state.players || []}
          hint={WAITING_HINTS[hintIndex]}
        />
      )}

      {/* ФИНАЛ */}
      {isFinished && (
        <FinalScreen top3={top3} scores={scores} />
      )}

      {/* ПРОМЕЖУТОЧНЫЙ РЕЙТИНГ (после 5 и 10) */}
      {showIntermediateScores && (
        <IntermediateScoresScreen
          playNumber={playNumber}
          top3={top3}
        />
      )}

      {/* ВОПРОС */}
      {!isWaiting && !isFinished && !showIntermediateScores && question && (
        <QuestionScreen
          playNumber={playNumber}
          totalQuestions={16}
          question={question}
          votingOpen={votingOpen}
          correctAnswer={correctAnswer}
        />
      )}
    </ScreenShell>
  );
}

/* ---------------- Оболочка ---------------- */

function ScreenShell({ children }) {
  return (
    <>
      <main className="tv-shell">{children}</main>
      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
          background: #fff9f0;
          color: #30251f;
          font-family: Arial, Helvetica, sans-serif;
          overflow: hidden;
        }

        .tv-shell {
          width: 100vw;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4vh 4vw;
          background:
            radial-gradient(circle at 50% 0%, #fff4d8 0%, #fff9f0 55%, #fff9f0 100%);
        }

        .state-message {
          text-align: center;
        }

        .state-message h1 {
          margin: 0 0 1.2rem;
          font-size: clamp(2rem, 4vw, 3.4rem);
          color: #7a4a12;
        }

        .state-message p {
          margin: 0.4rem 0;
          font-size: clamp(1rem, 1.6vw, 1.4rem);
        }

        .muted {
          color: #786f66;
        }

        /* ОБЩИЕ ЗАГОЛОВКИ И ЭЛЕМЕНТЫ */
        .eyebrow {
          margin: 0 0 0.6rem;
          color: #9b713b;
          font-size: clamp(0.75rem, 1vw, 1rem);
          font-weight: 800;
          letter-spacing: 0.15em;
        }

        .card {
          width: min(92vw, 1400px);
          padding: 5vh 5vw;
          border: 1px solid #eee0cc;
          border-radius: 36px;
          background: #ffffff;
          box-shadow: 0 20px 60px rgb(83 57 23 / 8%);
          text-align: center;
        }

        /* ОЖИДАНИЕ */
        .waiting {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 5vw;
          align-items: center;
          text-align: left;
        }

        .waiting-left h1 {
          margin: 0;
          font-size: clamp(2.4rem, 6vw, 5.4rem);
          line-height: 1.05;
          letter-spacing: -0.02em;
          color: #3b2a17;
        }

        .waiting-left h1 span {
          color: #b77925;
        }

        .waiting-left .tagline {
          margin: 1.5rem 0 0;
          font-size: clamp(1.1rem, 2vw, 1.8rem);
          color: #786f66;
        }

        .waiting-hint {
          margin-top: 3rem;
          padding: 1.2rem 1.6rem;
          border-radius: 20px;
          background: #fff4d8;
          color: #7a4a12;
          font-size: clamp(1.1rem, 2vw, 1.6rem);
          font-weight: 700;
          transition: opacity 0.4s ease;
        }

        .waiting-right {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.4rem;
        }

        .room-label {
          margin: 0;
          color: #9b713b;
          font-size: clamp(0.8rem, 1.1vw, 1rem);
          font-weight: 800;
          letter-spacing: 0.15em;
        }

        .room-code {
          margin: 0;
          font-size: clamp(2.6rem, 5vw, 5rem);
          letter-spacing: 0.18em;
          color: #7a4a12;
        }

        .qr-wrap {
          padding: 1.4rem;
          border-radius: 24px;
          background: #fffdf7;
          border: 1px solid #ead8bb;
        }

        .qr-wrap img {
          display: block;
          width: clamp(180px, 20vw, 320px);
          height: clamp(180px, 20vw, 320px);
        }

        .join-instruction {
          margin: 0;
          color: #786f66;
          font-size: clamp(0.9rem, 1.2vw, 1.15rem);
          text-align: center;
        }

        .join-instruction strong {
          color: #7a4a12;
        }

        .player-counter {
          margin-top: 0.5rem;
          padding: 0.7rem 1.2rem;
          border-radius: 999px;
          background: #f0fbf2;
          color: #246b39;
          font-size: clamp(1rem, 1.4vw, 1.3rem);
          font-weight: 700;
        }

        /* ВОПРОС */
        .q-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2.2rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .q-pill {
          padding: 0.8rem 1.3rem;
          border-radius: 999px;
          background: #fff0d5;
          color: #895719;
          font-size: clamp(0.85rem, 1.2vw, 1.1rem);
          font-weight: 850;
          letter-spacing: 0.1em;
        }

        .q-status {
          color: #24814a;
          font-size: clamp(0.85rem, 1.2vw, 1.1rem);
          font-weight: 700;
        }

        .q-status.locked {
          color: #9b713b;
        }

        .q-text {
          margin: 0 0 3rem;
          font-size: clamp(1.6rem, 3.4vw, 3.2rem);
          line-height: 1.25;
          color: #2c1f12;
        }

        .q-options {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.4rem;
        }

        .q-option {
          display: flex;
          align-items: center;
          gap: 1.2rem;
          padding: 1.6rem 1.8rem;
          border: 2px solid #e8dfd3;
          border-radius: 22px;
          background: #fffdfa;
          font-size: clamp(1rem, 1.6vw, 1.5rem);
          color: #352c25;
          text-align: left;
          transition: all 0.2s ease;
        }

        .q-option-letter {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          width: clamp(40px, 3vw, 60px);
          height: clamp(40px, 3vw, 60px);
          border-radius: 16px;
          background: #f5ead8;
          color: #8b5e27;
          font-weight: 850;
          font-size: clamp(1rem, 1.4vw, 1.3rem);
        }

        .q-option.correct {
          border-color: #239653;
          background: #d9f8e3;
          color: #14532d;
          font-weight: 700;
        }

        .q-option.dim {
          opacity: 0.55;
        }

        .reveal-badge {
          margin-top: 2.4rem;
          padding: 1.2rem 1.6rem;
          border-radius: 20px;
          background: #effbf2;
          border: 1px solid #a6d9b5;
          color: #14532d;
          font-size: clamp(1rem, 1.5vw, 1.4rem);
        }

        .reveal-badge strong {
          color: #0f3d22;
        }

        .voting-pulse {
          margin-top: 2rem;
          color: #8b7e70;
          font-size: clamp(0.95rem, 1.3vw, 1.2rem);
        }

        .voting-pulse span {
          display: inline-block;
          margin-right: 0.6rem;
          color: #24814a;
          animation: pulse 1.4s ease-in-out infinite;
        }

        /* РЕЙТИНГ */
        .scores-title {
          margin: 0 0 0.5rem;
          font-size: clamp(1.4rem, 2.6vw, 2.4rem);
          color: #7a4a12;
        }

        .scores-sub {
          margin: 0 0 2.5rem;
          color: #786f66;
          font-size: clamp(0.95rem, 1.4vw, 1.2rem);
        }

        .scores-list {
          display: grid;
          gap: 1.2rem;
          max-width: 720px;
          margin: 0 auto;
        }

        .score-item {
          display: flex;
          align-items: center;
          gap: 1.4rem;
          padding: 1.4rem 1.8rem;
          border: 2px solid #eee4d5;
          border-radius: 22px;
          background: #fffdf9;
          font-size: clamp(1.1rem, 1.8vw, 1.6rem);
        }

        .score-item.first {
          border-color: #f4c95d;
          background: #fff3c4;
        }

        .score-rank {
          font-size: clamp(1.6rem, 2.4vw, 2.2rem);
          font-weight: 800;
          width: 2.5rem;
          text-align: center;
        }

        .score-name {
          font-weight: 800;
          color: #2c1f12;
        }

        .score-points {
          margin-left: auto;
          color: #8a5c22;
          font-weight: 800;
        }

        /* ФИНАЛ */
        .final-wrap {
          position: relative;
          width: min(92vw, 1400px);
          padding: 4vh 5vw;
          border: 3px solid #f4c95d;
          border-radius: 40px;
          background: #ffffff;
          box-shadow: 0 30px 80px rgb(83 57 23 / 12%);
          text-align: center;
          overflow: hidden;
          animation: finalAppear 0.8s ease-out both;
        }

        .final-eyebrow {
          margin: 0 0 1rem;
          color: #9b713b;
          font-size: clamp(0.9rem, 1.4vw, 1.2rem);
          font-weight: 800;
          letter-spacing: 0.2em;
        }

        .final-h2 {
          margin: 0 0 1.5rem;
          font-size: clamp(1.6rem, 3vw, 2.6rem);
          color: #7a4a12;
        }

        .final-hero {
          margin: 0 0 2.5rem;
          font-size: clamp(2rem, 4.4vw, 4rem);
          line-height: 1.1;
          color: #3b2a17;
        }

        .final-hero span {
          color: #b77925;
        }

        .final-cake {
          font-size: clamp(4rem, 10vw, 9rem);
          line-height: 1;
          margin: 0.5rem 0 1.5rem;
          display: inline-block;
          animation: cakeWobble 2.4s ease-in-out infinite;
        }

        .final-balloons {
          margin-top: 2rem;
          font-size: clamp(1.6rem, 3vw, 3rem);
          letter-spacing: 0.6rem;
        }

        .final-balloons span {
          display: inline-block;
          animation: floatUp 3.4s ease-in-out infinite;
        }

        .final-balloons span:nth-child(2) {
          animation-delay: -0.6s;
        }

        .final-balloons span:nth-child(3) {
          animation-delay: -1.2s;
        }

        .final-balloons span:nth-child(4) {
          animation-delay: -1.8s;
        }

        .final-top3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 1.5rem;
          margin: 3rem auto 0;
          max-width: 1000px;
        }

        .podium-item {
          padding: 1.6rem 1.2rem;
          border-radius: 22px;
          background: #fffdf7;
          border: 2px solid #eee4d5;
          text-align: center;
        }

        .podium-item.gold {
          border-color: #f4c95d;
          background: #fff3c4;
          transform: translateY(-10px);
        }

        .podium-medal {
          font-size: clamp(2rem, 3vw, 3rem);
          display: block;
          margin-bottom: 0.6rem;
        }

        .podium-name {
          font-weight: 800;
          font-size: clamp(1rem, 1.6vw, 1.4rem);
          color: #2c1f12;
          margin-bottom: 0.4rem;
          overflow-wrap: anywhere;
        }

        .podium-points {
          color: #8a5c22;
          font-size: clamp(0.9rem, 1.3vw, 1.15rem);
        }

        .final-all {
          margin: 3.5rem auto 0;
          max-width: 720px;
          display: grid;
          gap: 0.8rem;
          text-align: left;
        }

        .final-all-title {
          margin: 0 0 0.6rem;
          color: #9b713b;
          font-size: clamp(0.85rem, 1.2vw, 1rem);
          font-weight: 800;
          letter-spacing: 0.15em;
          text-align: center;
        }

        .final-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.8rem 1.2rem;
          border-radius: 14px;
          background: #fffdf9;
          border: 1px solid #eee4d5;
          font-size: clamp(0.95rem, 1.3vw, 1.15rem);
        }

        .final-row .rank {
          width: 2rem;
          color: #8a5c22;
          font-weight: 800;
        }

        .final-row .name {
          font-weight: 700;
          overflow-wrap: anywhere;
        }

        .final-row .pts {
          margin-left: auto;
          color: #8a5c22;
          font-weight: 800;
        }

        /* КОНФЕТТИ */
        .confetti {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .confetti span {
          position: absolute;
          top: -8%;
          font-size: clamp(1rem, 1.6vw, 1.6rem);
          animation: confettiFall 4.4s linear infinite;
          animation-delay: calc(var(--i) * -0.35s);
          left: calc(var(--i) * 5.2%);
        }

        /* KEYFRAMES */
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }

        @keyframes floatUp {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-14px); }
        }

        @keyframes cakeWobble {
          0%, 100% { transform: rotate(-4deg); }
          50% { transform: rotate(4deg); }
        }

        @keyframes confettiFall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(120vh) rotate(720deg);
            opacity: 0.6;
          }
        }

        @keyframes finalAppear {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* АДАПТАЦИЯ ПОД УЗКИЕ ЭКРАНЫ */
        @media (max-width: 900px) {
          .waiting {
            grid-template-columns: 1fr;
            text-align: center;
          }

          .waiting-right {
            order: -1;
          }

          .q-options {
            grid-template-columns: 1fr;
          }

          .final-top3 {
            grid-template-columns: 1fr;
          }

          .podium-item.gold {
            transform: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      `}</style>
    </>
  );
}

/* ---------------- ЭКРАН: НЕТ КОДА ---------------- */

function NoCodeScreen() {
  return (
    <div className="card">
      <p className="eyebrow">ЭКРАН ДЛЯ ГОСТЕЙ</p>
      <h1 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.6rem)', margin: '0 0 1.2rem', color: '#7a4a12' }}>
        Открой этот экран с кодом комнаты
      </h1>
      <p className="muted" style={{ fontSize: 'clamp(1rem, 1.4vw, 1.2rem)' }}>
        В адресной строке добавь в конце <strong>?code=XXXXXX</strong>,
        где XXXXXX — код комнаты.
      </p>
      <p className="muted" style={{ fontSize: 'clamp(1rem, 1.4vw, 1.2rem)' }}>
        Пример: <strong>.../screen?code=H7QF7B</strong>
      </p>
    </div>
  );
}

/* ---------------- ЭКРАН: ОЖИДАНИЕ ---------------- */

function WaitingScreen({ code, players, hint }) {
  const inviteBase =
    typeof window !== 'undefined'
      ? window.location.origin
      : '';

  const inviteUrl = inviteBase + '/?code=' + code;

  const qrUrl =
    'https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=' +
    encodeURIComponent(inviteUrl);

  const guests = (players || []).filter((p) => p.role !== 'nadya');
  const nadyaConnected = (players || []).some((p) => p.role === 'nadya');

  return (
    <div className="card waiting">
      <div className="waiting-left">
        <p className="eyebrow">ПРАЗДНИЧНЫЙ КВИЗ</p>
        <h1>
          Надины <span>40</span>
        </h1>

        <p className="tagline">
          Кто знает Надю лучше всех?
        </p>

        <div className="waiting-hint" key={hint}>
          {hint}
        </div>

        <div className="player-counter">
          Уже в комнате: {guests.length}{' '}
          {guests.length === 1 ? 'гость' : 'гостей'}
          {nadyaConnected ? ' · Надя на месте 👑' : ''}
        </div>
      </div>

      <div className="waiting-right">
        <p className="room-label">КОД КОМНАТЫ</p>
        <h2 className="room-code">{code}</h2>

        <div className="qr-wrap">
          <img src={qrUrl} alt="QR-код для входа" />
        </div>

        <p className="join-instruction">
          Открой камеру на телефоне и наведи на QR —
          <br />
          или зайди на <strong>{inviteBase.replace(/^https?:\/\//, '')}</strong>
          <br />
          и введи код <strong>{code}</strong>
        </p>
      </div>
    </div>
  );
}

/* ---------------- ЭКРАН: ВОПРОС ---------------- */

function QuestionScreen({
  playNumber,
  totalQuestions,
  question,
  votingOpen,
  correctAnswer
}) {
  const locked = correctAnswer !== null && correctAnswer !== undefined;

  return (
    <div className="card">
      <div className="q-top">
        <span className="q-pill">
          ВОПРОС {playNumber} / {totalQuestions}
        </span>

        <span className={'q-status ' + (locked ? 'locked' : '')}>
          {votingOpen ? '● Идёт голосование' : 'Ответы зафиксированы'}
        </span>
      </div>

      <h1 className="q-text">{question.question_text}</h1>

      <div className="q-options">
        {question.options.map((option, index) => {
          const isCorrect = correctAnswer === index;
          const dim = locked && !isCorrect;

          const classes =
            'q-option' +
            (isCorrect ? ' correct' : '') +
            (dim ? ' dim' : '');

          return (
            <div key={index} className={classes}>
              <span className="q-option-letter">
                {String.fromCharCode(65 + index)}
              </span>
              <span>{option}</span>
            </div>
          );
        })}
      </div>

      {locked && (
        <div className="reveal-badge">
          <strong>ОТВЕТ НАДИ:</strong>{' '}
          {String.fromCharCode(65 + correctAnswer)}
          {' · '}
          {question.options[correctAnswer]}
        </div>
      )}

      {votingOpen && (
        <p className="voting-pulse">
          <span>●</span>
          Ведущий ждёт, пока все ответят…
        </p>
      )}
    </div>
  );
}

/* ---------------- ЭКРАН: ПРОМЕЖУТОЧНЫЙ РЕЙТИНГ ---------------- */

function IntermediateScoresScreen({ playNumber, top3 }) {
  return (
    <div className="card">
      <p className="eyebrow">ПОСЛЕ {playNumber} ВОПРОСОВ</p>
      <h1 className="scores-title">Кто впереди?</h1>
      <p className="scores-sub">Топ-3 на данный момент</p>

      <div className="scores-list">
        {top3.length === 0 && (
          <p className="muted">Пока никто не набрал баллов.</p>
        )}

        {top3.map((s, i) => (
          <div
            key={s.player_id}
            className={'score-item ' + (i === 0 ? 'first' : '')}
          >
            <span className="score-rank">
              {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
            </span>
            <span className="score-name">{s.display_name}</span>
            <span className="score-points">
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
    </div>
  );
}

/* ---------------- ЭКРАН: ФИНАЛ ---------------- */

function FinalScreen({ top3, scores }) {
  return (
    <div className="final-wrap">
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 20 }, (_, i) => (
          <span key={i} style={{ '--i': i }}>
            {['✦', '✧', '🎉', '★', '🎈'][i % 5]}
          </span>
        ))}
      </div>

      <p className="final-eyebrow">🎉 ВИКТОРИНА ЗАВЕРШЕНА 🎉</p>

      <h2 className="final-h2">Кто знает Надю лучше всех?</h2>

      <p className="final-hero">
        Спасибо, <span>Надя</span>!
        <br />
        С днём рождения! 🎂
      </p>

      <div className="final-cake" aria-hidden="true">🎂</div>

      <div className="final-balloons" aria-hidden="true">
        <span>🎈</span><span>🎈</span><span>🎈</span><span>🎈</span>
      </div>

      {top3.length > 0 && (
        <div className="final-top3">
          {top3.map((s, i) => (
            <div
              key={s.player_id}
              className={'podium-item ' + (i === 0 ? 'gold' : '')}
            >
              <span className="podium-medal">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
              </span>
              <div className="podium-name">{s.display_name}</div>
              <div className="podium-points">
                {s.points}{' '}
                {s.points === 1
                  ? 'балл'
                  : s.points > 1 && s.points < 5
                    ? 'балла'
                    : 'баллов'}
              </div>
            </div>
          ))}
        </div>
      )}

      {scores.length > 3 && (
        <div className="final-all">
          <p className="final-all-title">ВСЕ УЧАСТНИКИ</p>

          {scores.map((s, i) => (
            <div key={s.player_id} className="final-row">
              <span className="rank">{i + 1}</span>
              <span className="name">{s.display_name}</span>
              <span className="pts">
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
      )}
    </div>
  );
}

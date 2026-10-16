'use client';

import { useEffect, useState } from 'react';

const POLL_INTERVAL = 2200;
const HINT_INTERVAL = 4200;

// Сколько миллисекунд показывать ответ Нади, прежде чем
// переключиться на промежуточный рейтинг (после 5 и 10 вопроса).
const SCORES_DELAY_MS = 8000;

// Сколько мест показываем в рейтинге.
const TOP_PLACES = 5;

const WAITING_HINTS = [
  'Надя уже накрасилась? 💄',
  'Гости подтягиваются… 🚶‍♀️🚶',
  'Ставки сделаны? Скоро начнём 🎉',
  'Кто знает Надю лучше всех? Сейчас узнаем 🤔',
  'Ведущий что-то замышляет… 😏',
  'Ещё пара секунд — и начнём ✨',
  'Надя волнуется. Или притворяется 😅',
  'Проверьте, что телефон заряжен 🔋',
  'Сейчас будет очень интересно 🔥',
  'А вы точно знаете Надю? Сейчас проверим 🧐',
  'Отвечать честно, не подглядывать! 🙈',
  'Кто первый угадает — тому слава 🏆',
  'Этот квиз одобрен самой именинницей 👑',
  'Готовьтесь удивляться 🤯',
  'Один вопрос — один шанс 🎯',
  'Не переживайте, будет весело 🎈',
  'Надя уже готовит правильные ответы ✍️',
  'Если не знаете — угадывайте 😄',
  'Сегодня всё по-честному 🍀',
  'Уважаемые гости, пристегнитесь 🚀',
  'На счёт три… ещё не сейчас 😜',
  'Кто-то уже придумал свою стратегию 🧠',
  'Осталось совсем чуть-чуть ⏳',
  'Именинница, ваша партия! 👸',
  'Проверяем, кто тут настоящий друг Нади 💛',
  'Начинаем, как только все усядутся 🪑',
  'В воздухе витает интрига 🎭',
  'Один из вас станет легендой 🌟',
  'Ведущий репетирует драматическую паузу 🎬',
  'Держите напитки — сейчас начнётся 🥂',
  'Надя уже знает ответы. А вы? 😎',
  'Скоро. Очень скоро. Даже быстрее 🕐'
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

/**
 * Группирует игроков по очкам и возвращает список «мест».
 * Если у нескольких игроков одинаковые очки — они делят место.
 */
function groupByRank(scores) {
  if (!Array.isArray(scores) || scores.length === 0) return [];

  const sorted = [...scores].sort(
    (a, b) =>
      b.points - a.points ||
      a.display_name.localeCompare(b.display_name, 'ru')
  );

  const groups = [];
  let placeIndex = 0;
  let lastPoints = null;

  for (const s of sorted) {
    if (lastPoints === null || s.points !== lastPoints) {
      placeIndex += 1;
      lastPoints = s.points;

      groups.push({
        rank: placeIndex,
        points: s.points,
        players: [s]
      });
    } else {
      groups[groups.length - 1].players.push(s);
    }
  }

  return groups.slice(0, TOP_PLACES);
}

export default function ScreenPage() {
  const [code, setCode] = useState('');
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [hintIndex, setHintIndex] = useState(0);

  const [scoresReadyAt, setScoresReadyAt] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get('code');

    if (c) setCode(c.trim().toUpperCase());
  }, []);

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

  useEffect(() => {
    const timer = setInterval(() => {
      setHintIndex((i) => (i + 1) % WAITING_HINTS.length);
    }, HINT_INTERVAL);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!error) return;

    const timer = setTimeout(() => {
      window.location.reload();
    }, 30000);

    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    const lockedNow =
      !!state?.answers_locked ||
      (state?.room?.status === 'playing' && !state?.room?.voting_open);

    const play = state?.question?.play_number;

    if (
      lockedNow &&
      (play === 5 || play === 10) &&
      scoresReadyAt === 0
    ) {
      setScoresReadyAt(Date.now() + SCORES_DELAY_MS);
    }

    if (play !== 5 && play !== 10) {
      setScoresReadyAt(0);
    }
  }, [
    state?.question?.play_number,
    state?.answers_locked,
    state?.room?.voting_open,
    state?.room?.status,
    scoresReadyAt
  ]);

  useEffect(() => {
    if (scoresReadyAt === 0) return;

    const timer = setInterval(() => setNow(Date.now()), 500);

    return () => clearInterval(timer);
  }, [scoresReadyAt]);

  if (!code) {
    return (
      <ScreenShell>
        <NoCodeScreen />
      </ScreenShell>
    );
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

  const isScoresQuestion = playNumber === 5 || playNumber === 10;

  const scoresDelayPassed =
    scoresReadyAt !== 0 && now >= scoresReadyAt;

  const showIntermediateScores =
    !isFinished &&
    answersLocked &&
    isScoresQuestion &&
    scoresDelayPassed;

  const secondsLeft =
    scoresReadyAt !== 0 && !scoresDelayPassed
      ? Math.max(0, Math.ceil((scoresReadyAt - now) / 1000))
      : 0;

  const scores = state.scores || [];
  const ranked = groupByRank(scores);

  return (
    <ScreenShell>
      {isWaiting && (
        <WaitingScreen
          code={code}
          players={state.players || []}
          hint={WAITING_HINTS[hintIndex]}
        />
      )}

      {isFinished && (
        <FinalScreen ranked={ranked} scores={scores} />
      )}

      {showIntermediateScores && (
        <IntermediateScoresScreen
          playNumber={playNumber}
          ranked={ranked}
        />
      )}

      {!isWaiting && !isFinished && !showIntermediateScores && question && (
        <QuestionScreen
          playNumber={playNumber}
          totalQuestions={16}
          question={question}
          votingOpen={votingOpen}
          correctAnswer={correctAnswer}
          secondsLeft={secondsLeft}
          isScoresQuestion={isScoresQuestion}
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
          min-height: 4rem;
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

        .scores-countdown {
          margin-top: 1.5rem;
          color: #895719;
          font-size: clamp(0.95rem, 1.3vw, 1.2rem);
          font-weight: 700;
        }

        /* ПРОМЕЖУТОЧНЫЙ РЕЙТИНГ */
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
          max-width: 960px;
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
          width: 2.8rem;
          text-align: center;
          flex: 0 0 auto;
        }

        .score-names {
          flex: 1;
          font-weight: 800;
          color: #2c1f12;
          text-align: left;
          overflow-wrap: anywhere;
        }

        .score-names .sep {
          color: #9b713b;
          font-weight: 600;
          margin: 0 0.4rem;
        }

        .score-points {
          color: #8a5c22;
          font-weight: 800;
          white-space: nowrap;
        }

        /* ФИНАЛ */
        .final-wrap {
          position: relative;
          width: min(94vw, 1500px);
          max-height: 94vh;
          overflow-y: auto;
          padding: 5vh 4vw;
          border-radius: 44px;
          background:
            radial-gradient(circle at 20% 0%, #fff7e0 0%, transparent 45%),
            radial-gradient(circle at 80% 100%, #ffe9c2 0%, transparent 50%),
            linear-gradient(160deg, #ffffff 0%, #fffdf7 55%, #fff5df 100%);
          box-shadow:
            0 30px 90px rgb(122 74 18 / 18%),
            0 0 0 1px #f4d9a0 inset,
            0 0 0 6px #fff7e0 inset;
          text-align: center;
          animation: finalAppear 0.9s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
        }

        .final-wrap::-webkit-scrollbar {
          width: 8px;
        }

        .final-wrap::-webkit-scrollbar-thumb {
          background: #ead8bb;
          border-radius: 8px;
        }

        .final-header {
          margin: 0 0 3rem;
        }

        .final-eyebrow {
          display: inline-block;
          margin: 0 0 1.2rem;
          padding: 0.6rem 1.4rem;
          border-radius: 999px;
          background: linear-gradient(135deg, #ffe9b8, #ffd27a);
          color: #7a4a12;
          font-size: clamp(0.85rem, 1.2vw, 1.05rem);
          font-weight: 850;
          letter-spacing: 0.22em;
          box-shadow: 0 6px 20px rgb(244 201 93 / 35%);
        }

        .final-h2 {
          margin: 0 0 0.6rem;
          font-size: clamp(1.8rem, 3.6vw, 3.2rem);
          line-height: 1.1;
          background: linear-gradient(135deg, #7a4a12 0%, #b77925 60%, #f4c95d 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: #7a4a12;
        }

        .final-sub {
          margin: 0;
          color: #9b713b;
          font-size: clamp(0.95rem, 1.4vw, 1.2rem);
          font-weight: 600;
        }

        .final-top {
          margin: 0 auto;
          max-width: 1000px;
          display: grid;
          gap: 1.2rem;
        }

        .podium-item {
          display: flex;
          align-items: center;
          gap: 1.4rem;
          padding: 1.4rem 1.8rem;
          border-radius: 24px;
          background: #fffefb;
          border: 2px solid #f0e3cb;
          text-align: left;
          box-shadow: 0 8px 24px rgb(122 74 18 / 6%);
          transition: transform 0.3s ease;
        }

        .podium-item.gold {
          position: relative;
          background:
            linear-gradient(#fffefb, #fffefb) padding-box,
            linear-gradient(135deg, #f4c95d, #ffb347, #f4c95d) border-box;
          border: 3px solid transparent;
          box-shadow:
            0 14px 40px rgb(244 201 93 / 40%),
            0 0 0 1px #fff3c4 inset;
          transform: scale(1.03);
        }

        .podium-item.gold::before {
          content: '';
          position: absolute;
          inset: -8px;
          border-radius: 30px;
          background: radial-gradient(circle, rgb(244 201 93 / 25), transparent 70%);
          z-index: -1;
          animation: goldGlow 2.6s ease-in-out infinite;
        }

        .podium-item.silver {
          border-color: #d8dde3;
          background: linear-gradient(135deg, #ffffff, #f4f6f8);
        }

        .podium-item.bronze {
          border-color: #e8c9a8;
          background: linear-gradient(135deg, #fffaf3, #fbeedb);
        }

        .podium-medal {
          font-size: clamp(1.8rem, 3vw, 2.8rem);
          flex: 0 0 auto;
          filter: drop-shadow(0 4px 10px rgb(122 74 18 / 25%));
        }

        .podium-names {
          flex: 1;
          font-weight: 850;
          font-size: clamp(1.05rem, 1.8vw, 1.55rem);
          color: #2c1f12;
          overflow-wrap: anywhere;
          line-height: 1.25;
        }

        .podium-names .sep {
          color: #c18b40;
          font-weight: 600;
          margin: 0 0.5rem;
        }

        .podium-points {
          color: #8a5c22;
          font-size: clamp(0.95rem, 1.4vw, 1.2rem);
          font-weight: 850;
          white-space: nowrap;
          padding: 0.5rem 1rem;
          border-radius: 999px;
          background: #fff3c4;
        }

        .podium-item.gold .podium-points {
          background: linear-gradient(135deg, #ffe9b8, #f4c95d);
          color: #5a3508;
          box-shadow: 0 4px 14px rgb(244 201 93 / 40%);
        }

        .final-congrats {
          position: relative;
          margin: 4rem auto 0;
          max-width: 900px;
          padding: 3rem 2rem;
          border-radius: 32px;
          background:
            radial-gradient(circle at 50% 0%, #fff7e0 0%, transparent 60%),
            linear-gradient(160deg, #fffefb, #fff6e0);
          border: 2px solid #f4d9a0;
          box-shadow: 0 20px 60px rgb(122 74 18 / 10%);
          animation: finalAppear 1.1s ease-out both;
        }

        .final-congrats-eyebrow {
          margin: 0 0 1.2rem;
          color: #b77925;
          font-size: clamp(0.8rem, 1.1vw, 0.95rem);
          font-weight: 850;
          letter-spacing: 0.24em;
        }

        .final-congrats-text {
          margin: 0 0 1.2rem;
          font-size: clamp(2rem, 4.4vw, 4rem);
          line-height: 1.05;
          font-weight: 900;
          letter-spacing: -0.02em;
          background: linear-gradient(135deg, #7a4a12 0%, #b77925 55%, #e8b15e 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: #7a4a12;
        }

        .final-congrats-text span {
          display: inline-block;
          animation: nameFloat 3.2s ease-in-out infinite;
        }

        .final-congrats-sub {
          margin: 0;
          color: #8a5c22;
          font-size: clamp(1rem, 1.6vw, 1.35rem);
          font-weight: 600;
        }

        .final-cake {
          display: inline-block;
          margin: 2rem 0 0.5rem;
          font-size: clamp(3.5rem, 8vw, 7rem);
          line-height: 1;
          animation: cakeWobble 2.6s ease-in-out infinite;
          filter: drop-shadow(0 12px 24px rgb(244 201 93 / 40%));
        }

        .final-balloons {
          margin-top: 1.2rem;
          font-size: clamp(1.6rem, 3vw, 2.8rem);
          letter-spacing: 0.7rem;
        }

        .final-balloons span {
          display: inline-block;
          animation: floatUp 3.6s ease-in-out infinite;
          filter: drop-shadow(0 6px 14px rgb(122 74 18 / 20%));
        }

        .final-balloons span:nth-child(2) { animation-delay: -0.7s; }
        .final-balloons span:nth-child(3) { animation-delay: -1.4s; }
        .final-balloons span:nth-child(4) { animation-delay: -2.1s; }

        .final-all {
          margin: 3.5rem auto 0;
          max-width: 720px;
          display: grid;
          gap: 0.7rem;
          text-align: left;
        }

        .final-all-title {
          margin: 0 0 0.6rem;
          color: #9b713b;
          font-size: clamp(0.85rem, 1.2vw, 1rem);
          font-weight: 850;
          letter-spacing: 0.2em;
          text-align: center;
        }

        .final-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 1.2rem;
          border-radius: 14px;
          background: #fffefb;
          border: 1px solid #f0e3cb;
          font-size: clamp(0.95rem, 1.3vw, 1.15rem);
        }

        .final-row .rank {
          width: 2rem;
          color: #8a5c22;
          font-weight: 850;
        }

        .final-row .name {
          font-weight: 700;
          overflow-wrap: anywhere;
        }

        .final-row .pts {
          margin-left: auto;
          color: #8a5c22;
          font-weight: 850;
          white-space: nowrap;
        }

        .confetti {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          border-radius: 44px;
        }

        .confetti span {
          position: absolute;
          top: -10%;
          font-size: clamp(1rem, 1.6vw, 1.6rem);
          animation: confettiFall 4.6s linear infinite;
          animation-delay: calc(var(--i) * -0.3s);
          left: calc(var(--i) * 5.2%);
          filter: drop-shadow(0 4px 6px rgb(122 74 18 / 15%));
        }

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

        @keyframes goldGlow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.04); }
        }

        @keyframes nameFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
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

          .podium-item {
            flex-wrap: wrap;
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
  correctAnswer,
  secondsLeft,
  isScoresQuestion
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

      {locked && isScoresQuestion && secondsLeft > 0 && (
        <p className="scores-countdown">
          Рейтинг после {playNumber}-го вопроса — через {secondsLeft}…
        </p>
      )}
    </div>
  );
}

/* ---------------- ЭКРАН: ПРОМЕЖУТОЧНЫЙ РЕЙТИНГ ---------------- */

function IntermediateScoresScreen({ playNumber, ranked }) {
  const medals = ['🥇', '🥈', '🥉', '4', '5'];

  return (
    <div className="card">
      <p className="eyebrow">ПОСЛЕ {playNumber} ВОПРОСОВ</p>
      <h1 className="scores-title">Кто впереди?</h1>
      <p className="scores-sub">Топ-5 на данный момент</p>

      <div className="scores-list">
        {ranked.length === 0 && (
          <p className="muted">Пока никто не набрал баллов.</p>
        )}

        {ranked.map((group) => (
          <div
            key={group.rank}
            className={'score-item ' + (group.rank === 1 ? 'first' : '')}
          >
            <span className="score-rank">
              {medals[group.rank - 1] || group.rank}
            </span>

            <span className="score-names">
              {group.players.map((p, i) => (
                <span key={p.player_id}>
                  {i > 0 && <span className="sep">·</span>}
                  {p.display_name}
                </span>
              ))}
            </span>

            <span className="score-points">
              {group.points}{' '}
              {group.points === 1
                ? 'балл'
                : group.points > 1 && group.points < 5
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

function FinalScreen({ ranked, scores }) {
  const medals = ['🥇', '🥈', '🥉', '4', '5'];
  const podiumClass = ['gold', 'silver', 'bronze', '', ''];

  return (
    <div className="final-wrap">
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 20 }, (_, i) => (
          <span key={i} style={{ '--i': i }}>
            {['✦', '✧', '🎉', '★', '🎈'][i % 5]}
          </span>
        ))}
      </div>

      {/* ШАПКА + РЕЙТИНГ */}
      <div className="final-header">
        <p className="final-eyebrow">🎉 ВИКТОРИНА ЗАВЕРШЕНА</p>
        <h2 className="final-h2">Кто знает Надю лучше всех?</h2>
        <p className="final-sub">Барабанная дробь…</p>
      </div>

      {ranked.length > 0 && (
        <div className="final-top">
          {ranked.map((group, i) => (
            <div
              key={group.rank}
              className={'podium-item ' + (podiumClass[i] || '')}
            >
              <span className="podium-medal">
                {medals[group.rank - 1] || group.rank}
              </span>

              <span className="podium-names">
                {group.players.map((p, idx) => (
                  <span key={p.player_id}>
                    {idx > 0 && <span className="sep">·</span>}
                    {p.display_name}
                  </span>
                ))}
              </span>

              <span className="podium-points">
                {group.points}{' '}
                {group.points === 1
                  ? 'балл'
                  : group.points > 1 && group.points < 5
                    ? 'балла'
                    : 'баллов'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ПОЗДРАВЛЕНИЕ */}
      <div className="final-congrats">
        <p className="final-congrats-eyebrow">ОТ ВСЕХ ГОСТЕЙ</p>

        <h3 className="final-congrats-text">
          Спасибо, <span>Надя</span>!
        </h3>

        <p className="final-congrats-sub">
          С днём рождения! Пусть каждый день будет
          таким же тёплым, как этот вечер 🎂
        </p>

        <div className="final-cake" aria-hidden="true">🎂</div>

        <div className="final-balloons" aria-hidden="true">
          <span>🎈</span><span>🎈</span><span>🎈</span><span>🎈</span>
        </div>
      </div>

      {/* ПОЛНЫЙ СПИСОК */}
      {scores.length > 5 && (
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

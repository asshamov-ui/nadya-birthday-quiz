
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('На сервере не настроены переменные Supabase. Проверь Environment Variables в Vercel.');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

const fail = (message, status = 400) =>
  NextResponse.json({ error: message }, { status });

const ok = (data) =>
  NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

// Порядок показа вопросов по исходным номерам в Supabase.
// Последний вопрос №22 — отдельный финал.
const PLAY_ORDER = [
  1, 2,
  14, 15, 16, 17, 18,
  12, 19, 20, 21,
  3, 5, 6, 7, 8, 11,
  4, 9, 10, 13,
  22
];

const ROUND_INFO = [
  { title: 'Откуда начиналась Надя', start: 1, end: 2 },
  { title: 'Надя и её люди', start: 3, end: 7 },
  { title: 'Надя в повседневной жизни', start: 8, end: 11 },
  { title: 'Работа, увлечения и отдых', start: 12, end: 17 },
  { title: 'Надя без фильтров', start: 18, end: 21 },
  { title: 'Главное о Наде', start: 22, end: 22 }
];

function roundForStep(step) {
  return ROUND_INFO.find(
    round => step >= round.start && step <= round.end
  ) || ROUND_INFO[ROUND_INFO.length - 1];
}

export async function GET(request) {
  try {
    const supabase = db();
    const searchParams = new URL(request.url).searchParams;
    const code = searchParams.get('code')?.trim().toUpperCase();
    const playerId = searchParams.get('player_id');

    if (!code) return fail('Укажи код комнаты.');

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('room_code', code)
      .maybeSingle();

    if (roomError) throw roomError;
    if (!room) return fail('Комната не найдена. Проверь код.', 404);

    const playStep = Number(room.current_question_number) || 1;
    const actualQuestionNumber = PLAY_ORDER[playStep - 1];

    const { data: question, error: questionError } = await supabase
      .from('questions')
      .select('*')
      .eq('question_number', actualQuestionNumber)
      .maybeSingle();

    if (questionError) throw questionError;

    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id, display_name, role, joined_at')
      .eq('room_id', room.id)
      .order('joined_at');

    if (playersError) throw playersError;

    const currentAnswers = question
      ? await supabase
          .from('answers')
          .select('player_id, selected_option')
          .eq('question_id', question.id)
      : { data: [], error: null };

    if (currentAnswers.error) throw currentAnswers.error;

    const nadya = players.find(p => p.role === 'nadya');
    const nadyaRow = (currentAnswers.data || []).find(
      a => a.player_id === nadya?.id
    );

    const answersLocked =
  room.status === 'playing' && !room.voting_open;

const nadyaAnswer = answersLocked || room.status === 'finished'
  ? (nadyaRow?.selected_option ?? null)
  : null;

    const myRow =
      playerId && question
        ? (currentAnswers.data || []).find(a => a.player_id === playerId)
        : null;

    const myAnswer = myRow?.selected_option ?? null;

    const { data: allAnswers, error: allAnswersError } = await supabase
      .from('answers')
      .select('player_id, question_id, selected_option');

    if (allAnswersError) throw allAnswersError;

    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('id, question_number');

    if (questionsError) throw questionsError;

    const qNumById = Object.fromEntries(
      questions.map(q => [q.id, q.question_number])
    );

    const nadyaByQuestion = {};

    for (const answer of allAnswers) {
      if (answer.player_id === nadya?.id) {
        nadyaByQuestion[qNumById[answer.question_id]] =
          answer.selected_option;
      }
    }
const playStepByQuestion = Object.fromEntries(
  PLAY_ORDER.map((questionNumber, index) => [questionNumber, index + 1])
);

const lockedThrough =
  room.status === 'finished'
    ? 22
    : room.status !== 'playing'
      ? 0
      : room.voting_open
        ? playStep - 1
        : playStep;
    const scores = players
      .filter(p => p.role !== 'nadya')
      .map(p => {
        const playerAnswers = allAnswers.filter(
          a => a.player_id === p.id
        );

        let points = 0;

        for (const answer of playerAnswers) {
          const questionNumber = qNumById[answer.question_id];
const answeredStep = playStepByQuestion[questionNumber];

if (
  answeredStep !== undefined &&
  answeredStep <= lockedThrough &&
  nadyaByQuestion[questionNumber] !== undefined &&
  nadyaByQuestion[questionNumber] === answer.selected_option
) {
  points++;
}

        return {
          player_id: p.id,
          display_name: p.display_name,
          points
        };
      })
      .sort(
        (a, b) =>
          b.points - a.points ||
          a.display_name.localeCompare(b.display_name, 'ru')
      );

    const answeredCount = (currentAnswers.data || []).filter(answer =>
      players.some(
        p => p.id === answer.player_id && p.role !== 'nadya'
      )
    ).length;

    

    return ok({
      room,
      answers_locked: answersLocked,
      question: question
        ? {
            id: question.id,
            question_number: question.question_number,
            play_number: playStep,
            question_text: question.question_text,
            options: question.options
          }
        : null,
      players,
      nadya_answer: nadyaAnswer,
      my_answer: myAnswer,
      answered_count: answeredCount,
      
      show_scores: room.status === 'playing' || room.status === 'finished',
scores,
    });
  } catch (e) {
    return fail(e.message || 'Ошибка сервера.', 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const supabase = db();

    if (body.action === 'create_room') {
      if (
        !process.env.HOST_PIN ||
        body.pin !== process.env.HOST_PIN
      ) {
        return fail('Неверный PIN ведущего.', 401);
      }

      let room;
      let error;

      for (let i = 0; i < 5; i++) {
        const result = await supabase
          .from('rooms')
          .insert({
            room_code: makeCode(),
            title: 'Надины 40',
            status: 'waiting',
            current_question_number: 1,
            voting_open: false
          })
          .select('*')
          .single();

        room = result.data;
        error = result.error;

        if (!error) break;
        if (error.code !== '23505') throw error;
      }

      if (error || !room) {
        throw error || new Error('Не удалось создать комнату.');
      }

      return ok({ room });
    }

    const code = String(body.room_code || '')
      .trim()
      .toUpperCase();

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('room_code', code)
      .maybeSingle();

    if (roomError) throw roomError;
    if (!room) return fail('Комната не найдена. Проверь код.', 404);

    if (body.action === 'verify_host') {
      if (
        !process.env.HOST_PIN ||
        body.pin !== process.env.HOST_PIN
      ) {
        return fail('Неверный PIN ведущего.', 401);
      }

      if (room.status === 'finished') {
        return fail('Эта игра уже завершена.');
      }

      return ok({ room });
    }

    if (body.action === 'join') {
      const displayName = String(body.display_name || '')
        .trim()
        .slice(0, 40);

      const role = body.role === 'nadya' ? 'nadya' : 'guest';

      if (!displayName) return fail('Введи имя.');
      if (room.status === 'finished') {
        return fail('Игра уже завершена.');
      }

      if (role === 'nadya') {
        const { data: existing } = await supabase
          .from('players')
          .select('id')
          .eq('room_id', room.id)
          .eq('role', 'nadya')
          .maybeSingle();

        if (existing) {
          return fail('Надя уже подключилась к этой комнате.');
        }
      }

      const { data: player, error } = await supabase
        .from('players')
        .insert({
          room_id: room.id,
          display_name: displayName,
          role
        })
        .select('id, display_name, role')
        .single();

      if (error) {
        if (error.code === '23505') {
          return fail('Надя уже подключилась к этой комнате.');
        }
        throw error;
      }

      return ok({ player });
    }

    if (body.action === 'answer') {
      const { data: player, error: playerError } = await supabase
        .from('players')
        .select('*')
        .eq('id', body.player_id)
        .eq('room_id', room.id)
        .maybeSingle();

      if (playerError) throw playerError;
      if (!player) {
        return fail('Участник не найден. Зайди в комнату заново.', 404);
      }

      if (!room.voting_open || room.status !== 'playing') {
        return fail('Голосование сейчас закрыто.');
      }

      // Клиент передаёт номер шага игры, а не исходный номер вопроса.
      const playStep = Number(body.question_number);

      if (
        !Number.isInteger(playStep) ||
        playStep !== room.current_question_number
      ) {
        return fail('Этот вопрос уже сменился. Обнови страницу.');
      }

      const actualQuestionNumber = PLAY_ORDER[playStep - 1];

      if (!actualQuestionNumber) {
        return fail('Некорректный номер вопроса.');
      }

      const option = Number(body.selected_option);

      if (!Number.isInteger(option) || option < 0 || option > 3) {
        return fail('Некорректный вариант ответа.');
      }

      const { data: question, error: qError } = await supabase
        .from('questions')
        .select('id')
        .eq('question_number', actualQuestionNumber)
        .single();

      if (qError) throw qError;

      // Upsert позволяет менять ответ, пока текущий вопрос открыт.
      const { error } = await supabase
        .from('answers')
        .upsert(
          {
            player_id: player.id,
            question_id: question.id,
            selected_option: option
          },
          { onConflict: 'player_id,question_id' }
        );

      if (error) throw error;

      return ok({ success: true });
    }

    if (body.action === 'host_action') {
      if (
        !process.env.HOST_PIN ||
        body.pin !== process.env.HOST_PIN
      ) {
        return fail('Неверный PIN ведущего.', 401);
      }

      if (body.host_action === 'open') {
  if (room.status !== 'waiting') {
    return fail('Игра уже началась.');
  }

  const { error } = await supabase
    .from('rooms')
    .update({
      status: 'playing',
      voting_open: true
    })
    .eq('id', room.id);

  if (error) throw error;

} else if (body.host_action === 'lock') {
  if (room.status !== 'playing' || !room.voting_open) {
    return fail('Сейчас нечего фиксировать.');
  }

  const { error } = await supabase
    .from('rooms')
    .update({ voting_open: false })
    .eq('id', room.id);

  if (error) throw error;

} else if (body.host_action === 'next') {
  if (room.status !== 'playing') {
    return fail('Игра ещё не началась.');
  }

  if (room.voting_open) {
    return fail('Сначала нажми «Зафиксировать».');
  }

  if (room.current_question_number >= 22) {
    const { error } = await supabase
      .from('rooms')
      .update({
        status: 'finished',
        voting_open: false
      })
      .eq('id', room.id);

    if (error) throw error;

  } else {
    const { error } = await supabase
      .from('rooms')
      .update({
        current_question_number: room.current_question_number + 1,
        voting_open: true,
        status: 'playing'
      })
      .eq('id', room.id);

    if (error) throw error;
  }

} else if (body.host_action === 'finish') {
        const { error } = await supabase
          .from('rooms')
          .update({
            status: 'finished',
            voting_open: false
          })
          .eq('id', room.id);

        if (error) throw error;
      } else {
        return fail('Неизвестная команда ведущего.');
      }

      return ok({ success: true });
    }

    return fail('Неизвестная операция.');
  } catch (e) {
    return fail(e.message || 'Ошибка сервера.', 500);
  }
}

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('На сервере не настроены переменные Supabase. Проверь Environment Variables в Vercel.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const fail = (message, status = 400) => NextResponse.json({ error: message }, { status });
const ok = (data) => NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode() { let code = ''; for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)]; return code; }

export async function GET(request) {
  try {
    const supabase = db();
    const searchParams = new URL(request.url).searchParams;
    const code = searchParams.get('code')?.trim().toUpperCase();
    const playerId = searchParams.get('player_id');
    if (!code) return fail('Укажи код комнаты.');
    const { data: room, error: roomError } = await supabase.from('rooms').select('*').eq('room_code', code).maybeSingle();
    if (roomError) throw roomError;
    if (!room) return fail('Комната не найдена. Проверь код.', 404);
    const { data: question, error: questionError } = await supabase.from('questions').select('*').eq('question_number', room.current_question_number).maybeSingle();
    if (questionError) throw questionError;
    const { data: players, error: playersError } = await supabase.from('players').select('id, display_name, role, joined_at').eq('room_id', room.id).order('joined_at');
    if (playersError) throw playersError;
    const currentAnswers = question ? await supabase.from('answers').select('player_id, selected_option').eq('question_id', question.id) : { data: [], error: null };
    if (currentAnswers.error) throw currentAnswers.error;
    const nadya = players.find(p => p.role === 'nadya');
    const nadyaRow = (currentAnswers.data || []).find(a => a.player_id === nadya?.id);
    const nadyaAnswer = !room.voting_open ? (nadyaRow?.selected_option ?? null) : null;
    const myRow = playerId && question ? (currentAnswers.data || []).find(a => a.player_id === playerId) : null;
    const myAnswer = myRow?.selected_option ?? null;
    const { data: allAnswers, error: allAnswersError } = await supabase.from('answers').select('player_id, question_id, selected_option');
    if (allAnswersError) throw allAnswersError;
    const { data: questions, error: questionsError } = await supabase.from('questions').select('id, question_number');
    if (questionsError) throw questionsError;
    const qNumById = Object.fromEntries(questions.map(q => [q.id, q.question_number]));
    const nadyaByQuestion = {};
    for (const a of allAnswers) if (a.player_id === nadya?.id) nadyaByQuestion[qNumById[a.question_id]] = a.selected_option;
    const scores = players.filter(p => p.role !== 'nadya').map(p => {
      const playerAnswers = allAnswers.filter(a => a.player_id === p.id);
      let points = 0;
      for (const a of playerAnswers) {
        const qn = qNumById[a.question_id];
        if (nadyaByQuestion[qn] !== undefined && nadyaByQuestion[qn] === a.selected_option) points++;
      }
      return { player_id: p.id, display_name: p.display_name, points };
    }).sort((a, b) => b.points - a.points || a.display_name.localeCompare(b.display_name, 'ru'));
    const showScores = !room.voting_open && !!nadyaRow;
    return ok({ room, question: question ? { id: question.id, question_number: question.question_number, question_text: question.question_text, options: question.options } : null, players, nadya_answer: nadyaAnswer, my_answer: myAnswer, show_scores: showScores, scores: showScores ? scores : [] });
  } catch (e) { return fail(e.message || 'Ошибка сервера.', 500); }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const supabase = db();
    if (body.action === 'create_room') {
      if (!process.env.HOST_PIN || body.pin !== process.env.HOST_PIN) return fail('Неверный PIN ведущего.', 401);
      let room, error;
      for (let i = 0; i < 5; i++) {
        const result = await supabase.from('rooms').insert({ room_code: makeCode(), title: 'Надины 40', status: 'waiting', current_question_number: 1, voting_open: false }).select('*').single();
        room = result.data; error = result.error;
        if (!error) break;
        if (error.code !== '23505') throw error;
      }
      if (error || !room) throw error || new Error('Не удалось создать комнату.');
      return ok({ room });
    }
    const code = String(body.room_code || '').trim().toUpperCase();
    const { data: room, error: roomError } = await supabase.from('rooms').select('*').eq('room_code', code).maybeSingle();
    if (roomError) throw roomError;
    if (!room) return fail('Комната не найдена. Проверь код.', 404);

    if (body.action === 'join') {
      const displayName = String(body.display_name || '').trim().slice(0, 40);
      const role = body.role === 'nadya' ? 'nadya' : 'guest';
      if (!displayName) return fail('Введи имя.');
      if (room.status === 'finished') return fail('Игра уже завершена.');
      if (role === 'nadya') {
        const { data: existing } = await supabase.from('players').select('id').eq('room_id', room.id).eq('role', 'nadya').maybeSingle();
        if (existing) return fail('Надя уже подключилась к этой комнате.');
      }
      const { data: player, error } = await supabase.from('players').insert({ room_id: room.id, display_name: displayName, role }).select('id, display_name, role').single();
      if (error) { if (error.code === '23505') return fail('Надя уже подключилась к этой комнате.'); throw error; }
      return ok({ player });
    }

    if (body.action === 'answer') {
      const { data: player, error: playerError } = await supabase.from('players').select('*').eq('id', body.player_id).eq('room_id', room.id).maybeSingle();
      if (playerError) throw playerError;
      if (!player) return fail('Участник не найден. Зайди в комнату заново.', 404);
      if (!room.voting_open || room.status !== 'playing') return fail('Голосование сейчас закрыто.');
      const questionNumber = Number(body.question_number);
      if (questionNumber !== room.current_question_number) return fail('Этот вопрос уже сменился. Обнови страницу.');
      const option = Number(body.selected_option);
      if (!Number.isInteger(option) || option < 0 || option > 3) return fail('Некорректный вариант ответа.');
      const { data: question, error: qError } = await supabase.from('questions').select('id').eq('question_number', questionNumber).single();
      if (qError) throw qError;
      const { error } = await supabase.from('answers').upsert({ player_id: player.id, question_id: question.id, selected_option: option }, { onConflict: 'player_id,question_id' });
      if (error) throw error;
      return ok({ success: true });
    }

    if (body.action === 'host_action') {
      if (!process.env.HOST_PIN || body.pin !== process.env.HOST_PIN) return fail('Неверный PIN ведущего.', 401);
      if (body.host_action === 'open') {
        if (room.status === 'finished') return fail('Игра уже завершена.');
        const { error } = await supabase.from('rooms').update({ status: 'playing', voting_open: true }).eq('id', room.id);
        if (error) throw error;
      } else if (body.host_action === 'close') {
        const { error } = await supabase.from('rooms').update({ voting_open: false }).eq('id', room.id);
        if (error) throw error;
      } else if (body.host_action === 'next') {
        if (room.voting_open) return fail('Сначала закрой голосование.');
        if (room.current_question_number >= 22) return fail('Это последний вопрос. Заверши игру.');
        const { error } = await supabase.from('rooms').update({ current_question_number: room.current_question_number + 1, voting_open: false, status: 'playing' }).eq('id', room.id);
        if (error) throw error;
      } else if (body.host_action === 'finish') {
        const { error } = await supabase.from('rooms').update({ status: 'finished', voting_open: false }).eq('id', room.id);
        if (error) throw error;
      } else return fail('Неизвестная команда ведущего.');
      return ok({ success: true });
    }
    return fail('Неизвестная операция.');
  } catch (e) { return fail(e.message || 'Ошибка сервера.', 500); }
}

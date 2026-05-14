import { supabase } from './supabase';

const NUM_ITEMS = 10; // Exactly 10 questions per quiz

/**
 * Normalise a string for loose answer comparison.
 * Strips punctuation, collapses whitespace, lowercases.
 * Allows numeric answers like "50000" to match "50,000".
 */
export function normalizeAnswer(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[,.\-–—]/g, '')   // remove commas, periods, dashes
    .replace(/\s+/g, ' ')        // collapse whitespace
    .trim();
}

/**
 * Remove duplicate questions from an array (case-insensitive on question_text).
 */
function deduplicateQuestions(questions: any[]): any[] {
  const seen = new Set<string>();
  return questions.filter(q => {
    const key = q.question_text?.toLowerCase().trim() ?? '';
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Calls Groq to generate NUM_ITEMS UNIQUE questions with a RANDOM MIX of
 * "identification" and "multiple_choice" types, then saves them to Supabase.
 * Returns the new quiz ID on success, or throws on error.
 */
export async function generateQuizForNote(
  noteId: string,
  title: string,
  subject: string,
  userId: string,
): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    throw new Error('Groq API key is missing.');
  }

  const prompt = `Generate exactly ${NUM_ITEMS} quiz questions based on the text below.

STRICT RULES — follow every rule exactly:
1. Use a random mix of "identification" and "multiple_choice" types.
2. Every question MUST be UNIQUE — do NOT repeat or paraphrase the same question twice.
3. For "multiple_choice": provide exactly 4 distinct answer options as an array of strings.
4. For "identification": the options field MUST be null. The correct_answer may be a word, phrase, number, or symbol found in the text.
5. The correct_answer for multiple_choice MUST exactly match one of the 4 options.
6. Do NOT include numbering (1., 2., Q1:) inside question_text.
7. Respond ONLY with a valid JSON object in this exact structure — no extra text:
{"questions":[{"question_text":"...","type":"multiple_choice","options":["A","B","C","D"],"correct_answer":"A"},{"question_text":"...","type":"identification","options":null,"correct_answer":"..."}]}

Text to quiz:
${subject}`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,           // slightly higher for more variety
      response_format: { type: 'json_object' },
    }),
  });

  const result = await res.json();
  if (!res.ok) {
    throw new Error(`Groq API error (${res.status}): ${result.error?.message ?? JSON.stringify(result)}`);
  }

  const rawContent = result?.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error('Groq returned an empty response.');

  const parsed = JSON.parse(rawContent);
  const rawQuestions: any[] = parsed.questions ?? [];
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new Error('AI returned no questions. Try again or use a longer note.');
  }

  // Deduplicate then hard-cap to exactly NUM_ITEMS
  const unique = deduplicateQuestions(rawQuestions);
  const questions = unique.slice(0, NUM_ITEMS);

  // ── Save quiz record ──────────────────────────────────────────────────────
  const preview = subject.length > 150
    ? subject.substring(0, 150) + '…'
    : subject;

  const { data: quizData, error: quizError } = await supabase
    .from('quizzes')
    .insert([{
      user_id: userId,
      note_id: noteId,
      title,
      preview_content: preview,
    }])
    .select()
    .single();

  if (quizError) throw new Error(`Failed to save quiz: ${quizError.message}`);

  // ── Save exactly NUM_ITEMS unique questions ───────────────────────────────
  const questionsToInsert = questions.map((q: any, i: number) => ({
    quiz_id: quizData.id,
    question_text: q.question_text,
    type: q.type === 'multiple_choice' ? 'multiple_choice' : 'identification',
    options: q.options ?? null,
    correct_answer: String(q.correct_answer ?? ''),
    order_index: i + 1,
  }));

  const { error: qErr } = await supabase.from('questions').insert(questionsToInsert);
  if (qErr) throw new Error(`Failed to save questions: ${qErr.message}`);

  return quizData.id as string;
}

/**
 * Deletes the existing quiz (and its questions) for a note, then generates
 * a fresh one. Safe to call even if no quiz exists yet.
 */
export async function regenerateQuizForNote(
  noteId: string,
  title: string,
  subject: string,
  userId: string,
): Promise<string> {
  // Find existing quizzes for this note
  const { data: existing } = await supabase
    .from('quizzes')
    .select('id')
    .eq('note_id', noteId);

  if (existing && existing.length > 0) {
    const ids = existing.map((q: any) => q.id);
    // Delete questions first (in case no DB-level cascade is set)
    await supabase.from('questions').delete().in('quiz_id', ids);
    await supabase.from('quizzes').delete().eq('note_id', noteId);
  }

  return generateQuizForNote(noteId, title, subject, userId);
}

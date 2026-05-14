import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { NotasTheme } from '../../../constants/NotasTheme';
import { supabase } from '../../../lib/supabase';
import { normalizeAnswer } from '../../../lib/quizGenerator';

const PASS_THRESHOLD = 0.75;

export default function QuizResultsScreen() {
  const { id, answers } = useLocalSearchParams<{ id: string; answers: string }>();
  const [quiz, setQuiz] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const parsedAnswers: Record<string, string> = answers ? JSON.parse(answers) : {};

  useEffect(() => { fetchData(); }, [id]);

  const fetchData = async () => {
    try {
      const { data: quizData, error: qErr } = await supabase
        .from('quizzes').select('*').eq('id', id).single();
      if (qErr) throw qErr;
      setQuiz(quizData);

      const { data: questionsData, error: qsErr } = await supabase
        .from('questions').select('*').eq('quiz_id', id).order('order_index');
      if (qsErr) throw qsErr;
      setQuestions(questionsData || []);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRetake = () => {
    router.replace({
      pathname: `/quiz/${id}` as any,
      params: { retake: Date.now().toString() },
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={NotasTheme.colors.primary} />
      </View>
    );
  }

  if (!quiz || questions.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Results not found.</Text>
      </View>
    );
  }

  let score = 0;
  const total = questions.length;
  questions.forEach(q => {
    const ua = normalizeAnswer(parsedAnswers[q.id] || '');
    const ca = normalizeAnswer(q.correct_answer || '');
    if (ua === ca) score++;
  });

  const percentage = Math.round((score / total) * 100);
  const passed = percentage >= PASS_THRESHOLD * 100;
  const cardBg = passed ? NotasTheme.colors.resultPass : NotasTheme.colors.resultFail;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.replace('/(tabs)/quiz' as any)}
        >
          <Feather name="arrow-left" size={20} color={NotasTheme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{quiz.title}</Text>
      </View>

      {/* Thin full-width bar (score color) */}
      <View style={[styles.progressBar, { backgroundColor: cardBg }]} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Score Card ──────────────────────────────────────────────── */}
        <View style={[styles.scoreCard, { backgroundColor: cardBg }]}>
          <Text style={styles.totalScoreLabel}>Total Score</Text>
          <Text style={styles.scoreNumber}>{score}/{total}</Text>
          <Text style={styles.scoreStatus}>
            {passed ? 'Passed the quiz!' : 'Failed the quiz'}
          </Text>

          {/* Retake button inside card */}
          <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake} activeOpacity={0.85}>
            <MaterialCommunityIcons
              name="lightbulb-outline"
              size={16}
              color={NotasTheme.colors.text}
            />
            <Text style={styles.retakeBtnText}>Retake quiz</Text>
          </TouchableOpacity>
        </View>

        {/* ── Results breakdown ────────────────────────────────────────── */}
        <Text style={styles.resultsTitle}>Results</Text>

        <View style={styles.breakdownContainer}>
          {questions.map((q, index) => {
            const userAnswer = parsedAnswers[q.id] || '';
            const isCorrect =
              userAnswer.toLowerCase().trim() === (q.correct_answer || '').toLowerCase().trim();

            return (
              <View
                key={q.id}
                style={[
                  styles.resultCard,
                  index < questions.length - 1 && styles.resultCardBorder,
                ]}
              >
                {/* Question label + status icon */}
                <View style={styles.resultHeader}>
                  <Text style={styles.questionLabel}>Question {index + 1}</Text>
                  <MaterialCommunityIcons
                    name={isCorrect ? 'check-circle' : 'close-circle'}
                    size={22}
                    color={isCorrect ? NotasTheme.colors.resultPass : NotasTheme.colors.resultFail}
                  />
                </View>

                {/* Question text */}
                <Text style={styles.resultQuestion}>{q.question_text}</Text>

                {/* User's answer pill — green if correct, red if wrong */}
                <View style={[
                  styles.answerPill,
                  { backgroundColor: isCorrect ? NotasTheme.colors.resultPass : NotasTheme.colors.resultFail },
                ]}>
                  <Text style={styles.answerPillText} numberOfLines={2}>
                    {userAnswer || '(no answer)'}
                  </Text>
                </View>

                {/* Correct answer pill — shown only when user was wrong */}
                {!isCorrect && (
                  <View style={[styles.answerPill, { backgroundColor: NotasTheme.colors.resultPass, marginTop: 8 }]}>
                    <Text style={styles.answerPillText} numberOfLines={2}>
                      {q.correct_answer}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NotasTheme.colors.background },
  centered: { justifyContent: 'center', alignItems: 'center' },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 14,
  },
  backBtn: {
    width: 38,
    height: 38,
    backgroundColor: NotasTheme.colors.inputBackground,
    borderWidth: 1,
    borderColor: NotasTheme.colors.border,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 17,
    color: NotasTheme.colors.text,
  },
  progressBar: {
    height: 3,
    width: '100%',
  },

  // ── Scroll content ────────────────────────────────────────────────────────
  scrollContent: { padding: 20, paddingBottom: 60 },

  // ── Score card ────────────────────────────────────────────────────────────
  scoreCard: {
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    marginBottom: 24,
  },
  totalScoreLabel: {
    fontFamily: NotasTheme.typography.serif,
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 6,
  },
  scoreNumber: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 52,
    color: '#fff',
    lineHeight: 60,
  },
  scoreStatus: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 16,
    color: '#fff',
    marginBottom: 20,
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 25,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  retakeBtnText: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 14,
    color: NotasTheme.colors.text,
  },

  // ── Results section ───────────────────────────────────────────────────────
  resultsTitle: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 20,
    color: NotasTheme.colors.text,
    marginBottom: 14,
  },
  breakdownContainer: {
    backgroundColor: NotasTheme.colors.inputBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NotasTheme.colors.border,
    overflow: 'hidden',
  },
  resultCard: { padding: 16 },
  resultCardBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#e0d6c8',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  questionLabel: {
    fontFamily: NotasTheme.typography.serif,
    fontSize: 13,
    color: NotasTheme.colors.primary,
  },
  resultQuestion: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 14,
    color: NotasTheme.colors.text,
    lineHeight: 20,
    marginBottom: 12,
  },
  answerPill: {
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  answerPillText: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 14,
    color: '#fff',
    textAlign: 'center',
  },
  errorText: {
    fontFamily: NotasTheme.typography.serif,
    fontSize: 15,
    color: NotasTheme.colors.text,
    textAlign: 'center',
  },
});

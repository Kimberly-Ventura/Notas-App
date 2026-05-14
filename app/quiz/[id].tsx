import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { NotasTheme } from '../../constants/NotasTheme';
import { supabase } from '../../lib/supabase';

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

export default function QuizScreen() {
  const { id, retake } = useLocalSearchParams<{ id: string; retake?: string }>();
  const [quiz, setQuiz] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => { fetchQuiz(); }, [id]);

  // Re-shuffle on retake
  useEffect(() => {
    if (questions.length > 0) {
      setQuestions(q => shuffle(q));
      setCurrentIndex(0);
      setAnswers({});
    }
  }, [retake]);

  const fetchQuiz = async () => {
    try {
      const { data: quizData, error: qErr } = await supabase
        .from('quizzes').select('*').eq('id', id).single();
      if (qErr) throw qErr;
      setQuiz(quizData);

      const { data: questionsData, error: qsErr } = await supabase
        .from('questions').select('*').eq('quiz_id', id).order('order_index');
      if (qsErr) throw qsErr;
      setQuestions(shuffle(questionsData || []));
    } catch (error: any) {
      Alert.alert('Error', error.message);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const currentQ = questions[currentIndex];
  const hasAnswer = currentQ && !!answers[currentQ.id]?.trim();
  const isLast = currentIndex === questions.length - 1;
  const progress = questions.length > 0 ? (currentIndex + 1) / questions.length : 0;

  const handleNext = () => { if (hasAnswer) setCurrentIndex(i => i + 1); };
  const handlePrevious = () => { if (currentIndex > 0) setCurrentIndex(i => i - 1); };

  const handleSubmit = () => {
    if (!hasAnswer) return;
    router.replace({
      pathname: `/quiz/results/${id}` as any,
      params: { answers: JSON.stringify(answers) },
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
        <Text style={styles.errorText}>Quiz not found or has no questions.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={NotasTheme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{quiz.title}</Text>
      </View>

      {/* Full-width progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Question counter */}
        <Text style={styles.questionCounter}>
          Question {currentIndex + 1} of {questions.length}
        </Text>

        {/* Question text */}
        <Text style={styles.questionText}>{currentQ.question_text}</Text>

        {/* ── Multiple Choice ─────────────────────────────────────────── */}
        {currentQ.type === 'multiple_choice' && (
          <View style={styles.optionsContainer}>
            {(currentQ.options || []).map((option: string, idx: number) => {
              const isSelected = answers[currentQ.id] === option;
              return (
                <TouchableOpacity
                  key={idx}
                  style={styles.optionRow}
                  onPress={() => setAnswers(prev => ({ ...prev, [currentQ.id]: option }))}
                  activeOpacity={0.75}
                >
                  <View style={[
                    styles.radioCircle,
                    isSelected && styles.radioCircleSelected,
                  ]} />
                  <Text style={[
                    styles.optionText,
                    isSelected && styles.optionTextSelected,
                  ]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Identification ──────────────────────────────────────────── */}
        {currentQ.type === 'identification' && (
          <TextInput
            style={styles.answerInput}
            placeholder="Answer here"
            placeholderTextColor="#aaa"
            value={answers[currentQ.id] || ''}
            onChangeText={text => setAnswers(prev => ({ ...prev, [currentQ.id]: text }))}
          />
        )}
      </ScrollView>

      {/* Navigation footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.navBtn, currentIndex === 0 && styles.navBtnDisabled]}
          onPress={handlePrevious}
          disabled={currentIndex === 0}
        >
          <Text style={styles.navBtnText}>Previous</Text>
        </TouchableOpacity>

        {isLast ? (
          <TouchableOpacity
            style={[styles.navBtn, styles.navBtnSubmit, !hasAnswer && styles.navBtnDisabled]}
            onPress={handleSubmit}
            disabled={!hasAnswer}
          >
            <Text style={[styles.navBtnText, styles.navBtnSubmitText]}>Submit</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.navBtn, !hasAnswer && styles.navBtnDisabled]}
            onPress={handleNext}
            disabled={!hasAnswer}
          >
            <Text style={styles.navBtnText}>Next</Text>
          </TouchableOpacity>
        )}
      </View>
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

  // ── Progress bar ──────────────────────────────────────────────────────────
  progressTrack: {
    height: 3,
    backgroundColor: '#d5c4b0',
    width: '100%',
  },
  progressFill: {
    height: '100%' as any,
    backgroundColor: NotasTheme.colors.primary,
  },

  // ── Scroll content ────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 24,
  },
  questionCounter: {
    fontFamily: NotasTheme.typography.serif,
    fontSize: 13,
    color: NotasTheme.colors.primary,
    marginBottom: 12,
  },
  questionText: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 17,
    color: NotasTheme.colors.text,
    lineHeight: 26,
    marginBottom: 24,
  },

  // ── Multiple choice ───────────────────────────────────────────────────────
  optionsContainer: { gap: 10 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NotasTheme.colors.inputBackground,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ccc',
  },
  radioCircleSelected: {
    backgroundColor: NotasTheme.colors.primary,
  },
  optionText: {
    flex: 1,
    fontFamily: NotasTheme.typography.serif,
    fontSize: 15,
    color: NotasTheme.colors.text,
  },
  optionTextSelected: {
    fontFamily: NotasTheme.typography.serifBold,
  },

  // ── Identification input ──────────────────────────────────────────────────
  answerInput: {
    backgroundColor: NotasTheme.colors.inputBackground,
    borderWidth: 1,
    borderColor: NotasTheme.colors.border,
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontFamily: NotasTheme.typography.serif,
    fontSize: 15,
    color: NotasTheme.colors.text,
    outlineStyle: 'none' as any,
  },

  // ── Footer navigation ─────────────────────────────────────────────────────
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 16,
  },
  navBtn: {
    flex: 1,
    backgroundColor: NotasTheme.colors.inputBackground,
    borderWidth: 1,
    borderColor: NotasTheme.colors.border,
    borderRadius: 25,
    paddingVertical: 13,
    alignItems: 'center',
  },
  navBtnSubmit: {
    backgroundColor: NotasTheme.colors.primary,
    borderColor: NotasTheme.colors.primary,
  },
  navBtnDisabled: { opacity: 0.35 },
  navBtnText: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 15,
    color: NotasTheme.colors.text,
  },
  navBtnSubmitText: {
    color: '#fff',
  },

  errorText: {
    fontFamily: NotasTheme.typography.serif,
    fontSize: 15,
    color: NotasTheme.colors.text,
    textAlign: 'center',
  },
});

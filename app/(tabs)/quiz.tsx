import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NotasTheme } from '../../constants/NotasTheme';
import { supabase } from '../../lib/supabase';

const MIN_CHARS = 100;

type NoteStatus = 'ready' | 'insufficient';
type NoteCard = {
  id: string;
  title: string;
  status: NoteStatus;
  quizId: string | null;
};

export default function QuizDashboardScreen() {
  const [cards, setCards] = useState<NoteCard[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => { loadData(); }, [])
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: notesData }, { data: quizzesData }] = await Promise.all([
        supabase
          .from('notes')
          .select('id, title, subject')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('quizzes')
          .select('id, note_id')
          .eq('user_id', user.id),
      ]);

      const quizMap: Record<string, string> = {};
      (quizzesData || []).forEach((q: any) => { quizMap[q.note_id] = q.id; });

      const processed: NoteCard[] = (notesData || []).map((note: any) => ({
        id: note.id,
        title: note.title,
        status: note.subject?.length >= MIN_CHARS && quizMap[note.id] ? 'ready' : 'insufficient',
        quizId: quizMap[note.id] || null,
      }));

      setCards(processed);
    } catch (err: any) {
      console.error('[QuizDash]', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadData();
  };

  const renderCard = ({ item }: { item: NoteCard }) => {
    const isReady = item.status === 'ready';
    const btnColor = isReady ? NotasTheme.colors.quizReady : NotasTheme.colors.quizInsufficient;

    return (
      <View style={styles.card}>
        {/* Status icon */}
        <MaterialCommunityIcons
          name={isReady ? 'check-circle' : 'alert'}
          size={24}
          color={btnColor}
          style={styles.cardIcon}
        />

        {/* Note title */}
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>

        {/* Action button */}
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: btnColor }]}
          onPress={() => {
            if (isReady && item.quizId) {
              router.push(`/quiz/${item.quizId}` as any);
            } else {
              router.push(`/note/${item.id}` as any);
            }
          }}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name={isReady ? 'lightbulb-outline' : 'pencil-outline'}
            size={15}
            color="#fff"
          />
          <Text style={styles.actionBtnText}>
            {isReady ? 'Take Quiz' : 'Add Details'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <MaterialCommunityIcons
            name="lightbulb-outline"
            size={28}
            color={NotasTheme.colors.primary}
          />
          <Text style={styles.headerTitle}>My Quizzes</Text>
        </View>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
          <MaterialCommunityIcons name="refresh" size={24} color={NotasTheme.colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={NotasTheme.colors.primary}
          style={{ marginTop: 40 }}
        />
      ) : cards.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons
            name="file-question-outline"
            size={52}
            color="#bbb"
            style={{ marginBottom: 14 }}
          />
          <Text style={styles.emptyTitle}>No notes yet</Text>
          <Text style={styles.emptySubtext}>
            Create a note from the dashboard and a quiz will be automatically generated!
          </Text>
        </View>
      ) : (
        <FlatList
          data={cards}
          renderItem={renderCard}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NotasTheme.colors.background,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 24,
    color: NotasTheme.colors.text,
  },
  refreshBtn: {
    padding: 4,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 40,
  },
  row: {
    gap: 12,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    backgroundColor: NotasTheme.colors.inputBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NotasTheme.colors.border,
    padding: 14,
    minHeight: 140,
    justifyContent: 'space-between',
  },
  cardIcon: {
    marginBottom: 8,
  },
  cardTitle: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 14,
    color: NotasTheme.colors.text,
    marginBottom: 12,
    flex: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 25,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  actionBtnText: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 12,
    color: '#fff',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    marginTop: -60,
  },
  emptyTitle: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 16,
    color: NotasTheme.colors.text,
    marginBottom: 8,
  },
  emptySubtext: {
    fontFamily: NotasTheme.typography.serif,
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
  },
});

import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View,
} from 'react-native';
import { NotasTheme } from '../../constants/NotasTheme';
import { regenerateQuizForNote } from '../../lib/quizGenerator';
import { supabase } from '../../lib/supabase';

export default function NoteViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [note, setNote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [titleText, setTitleText] = useState('');
  const [subjectText, setSubjectText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => { fetchNote(); }, [id]);

  const fetchNote = async () => {
    try {
      const { data, error } = await supabase.from('notes').select('*').eq('id', id).single();
      if (error) throw error;
      setNote(data);
      setTitleText(data.title);
      setSubjectText(data.subject);

      // Check for existing quiz
      const { data: qData } = await supabase
        .from('quizzes')
        .select('id')
        .eq('note_id', id)
        .maybeSingle();
      if (qData) setQuizId(qData.id);
    } catch (error: any) {
      Alert.alert('Error', error.message);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (subjectText.trim().length < 10) {
      Alert.alert('Error', 'Note content is too short.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('notes')
        .update({ title: titleText, subject: subjectText })
        .eq('id', id);
      if (error) throw error;
      setNote({ ...note, title: titleText, subject: subjectText });
      setIsEditing(false);
      Alert.alert('Saved', 'Note updated successfully.');

      // Fire-and-forget: re-generate quiz in background
      regenerateQuizForNote(id, titleText, subjectText, note.user_id)
        .catch(err => console.error('[RegenQuiz] Failed:', err));
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setTitleText(note.title);
    setSubjectText(note.subject);
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (Platform.OS === 'web') {
      console.log('[Delete] Button clicked on web');
    }

    if (!id) {
      Alert.alert('Error', 'Note ID not found.');
      return;
    }

    const performDelete = async () => {
      setDeleting(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        console.log('[Delete] Starting deletion process for note:', id, 'by user:', user.id);

        // 1. Fetch quizzes to get their IDs
        const { data: quizzes, error: qFetchError } = await supabase
          .from('quizzes')
          .select('id')
          .eq('note_id', id)
          .eq('user_id', user.id); // Ensure we only see our own quizzes

        if (qFetchError) {
          console.error('[Delete] Quiz fetch error:', qFetchError);
          throw qFetchError;
        }

        if (quizzes && quizzes.length > 0) {
          const quizIds = quizzes.map(q => q.id);
          console.log('[Delete] Found quizzes to delete:', quizIds);

          // 2. Delete questions
          const { error: qsDeleteError } = await supabase
            .from('questions')
            .delete()
            .in('quiz_id', quizIds);
          if (qsDeleteError) throw qsDeleteError;

          // 3. Delete quizzes
          const { error: qDeleteError } = await supabase
            .from('quizzes')
            .delete()
            .in('id', quizIds)
            .eq('user_id', user.id);
          if (qDeleteError) throw qDeleteError;
        }

        // 4. Delete the note
        console.log('[Delete] Deleting note from Supabase:', id);
        const { error: noteDeleteError } = await supabase
          .from('notes')
          .delete()
          .match({ id: id, user_id: user.id });

        if (noteDeleteError) {
          console.error('[Delete] Note delete error:', noteDeleteError);
          throw noteDeleteError;
        }

        console.log('[Delete] Deletion successful');
        router.replace('/(tabs)/dashboard');
      } catch (error: any) {
        console.error('[Delete] Deletion failed:', error);
        if (Platform.OS === 'web') {
          window.alert('Delete Failed: ' + (error.message || 'Unknown error'));
        } else {
          Alert.alert('Delete Failed', error.message || 'Unknown error');
        }
        setDeleting(false);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure? This will also delete any generated quizzes for this note. This cannot be undone.');
      if (confirmed) performDelete();
    } else {
      Alert.alert(
        'Delete Note',
        'Are you sure? This will also delete any generated quizzes for this note. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: performDelete },
        ]
      );
    }
  };

  const handleGenerateManual = async () => {
    if (!note || generating) return;
    setGenerating(true);
    try {
      const newId = await regenerateQuizForNote(id, note.title, note.subject, note.user_id);
      setQuizId(newId);
      Alert.alert('Success', 'Quiz generated! You can take it now.');
    } catch (error: any) {
      Alert.alert('Generation Failed', error.message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading || deleting) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={NotasTheme.colors.primary} />
      </View>
    );
  }

  if (!note) return null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={NotasTheme.colors.text} />
        </TouchableOpacity>
        {isEditing ? (
          <TextInput
            style={styles.titleInput}
            value={titleText}
            onChangeText={setTitleText}
            placeholder="Note title"
            placeholderTextColor="#aaa"
          />
        ) : (
          <Text style={styles.headerTitle} numberOfLines={1}>{note.title}</Text>
        )}
      </View>

      {/* Body */}
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.noteBox, isEditing && styles.noteBoxEditing]}>
          <TextInput
            style={styles.noteText}
            multiline
            editable={isEditing}
            value={subjectText}
            onChangeText={setSubjectText}
            scrollEnabled={false}
            placeholder="Note content..."
            placeholderTextColor="#aaa"
          />
        </View>

        {/* Char count hint when editing */}
        {isEditing && (
          <Text style={styles.charCount}>
            {subjectText.length} characters
            {subjectText.length < 100 ? ` (${100 - subjectText.length} more for quiz eligibility)` : ' ✓ Quiz eligible'}
          </Text>
        )}
      </ScrollView>

      {/* Footer actions */}
      <View style={styles.footer}>
        {!isEditing ? (
          <>
            {/* Take Quiz / Generate Quiz Button */}
            {quizId ? (
              <TouchableOpacity
                style={styles.takeQuizBtn}
                onPress={() => router.push(`/quiz/${quizId}` as any)}
              >
                <MaterialCommunityIcons name="lightbulb-outline" size={15} color="#fff" />
                <Text style={styles.takeQuizBtnText}>Take Quiz</Text>
              </TouchableOpacity>
            ) : note.subject?.length >= 100 ? (
              <TouchableOpacity
                style={[styles.generateBtn, generating && { opacity: 0.6 }]}
                onPress={handleGenerateManual}
                disabled={generating}
              >
                {generating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="auto-fix" size={15} color="#fff" />
                    <Text style={styles.takeQuizBtnText}>Generate Quiz</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.editBtn} onPress={() => setIsEditing(true)}>
              <Feather name="edit-2" size={15} color="#fff" />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={handleDelete}
            >
              <Feather name="trash-2" size={18} color="#fff" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelEdit}>
              <Feather name="x" size={15} color="#fff" />
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                  <Feather name="save" size={15} color="#fff" />
                  <Text style={styles.saveBtnText}>Save</Text>
                </>
              }
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NotasTheme.colors.background },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: NotasTheme.colors.border,
  },
  backBtn: {
    width: 40, height: 40,
    borderWidth: 1, borderColor: NotasTheme.colors.border,
    borderRadius: 4, justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  headerTitle: {
    flex: 1,
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 18,
    color: NotasTheme.colors.text,
  },
  titleInput: {
    flex: 1,
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 18,
    color: NotasTheme.colors.text,
    borderBottomWidth: 1,
    borderBottomColor: NotasTheme.colors.primary,
    paddingVertical: 4,
    outlineStyle: 'none' as any,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 150,
    flexGrow: 1
  },
  noteBox: {
    backgroundColor: NotasTheme.colors.inputBackground,
    borderWidth: 1,
    borderColor: NotasTheme.colors.border,
    borderRadius: 20,
    padding: 24,
    minHeight: 550,
  },
  noteBoxEditing: { borderColor: NotasTheme.colors.primary, borderWidth: 2 },
  noteText: {
    fontFamily: NotasTheme.typography.serif,
    fontSize: 15,
    color: NotasTheme.colors.text,
    lineHeight: 24,
    textAlignVertical: 'top',
    outlineStyle: 'none' as any,
    minHeight: 450,
    width: '100%',
    wordBreak: 'break-word' as any,
  },
  charCount: {
    fontFamily: NotasTheme.typography.serif,
    fontSize: 12,
    color: '#888',
    textAlign: 'right',
    marginTop: 8,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0d6c8',
    backgroundColor: NotasTheme.colors.inputBackground,
    alignItems: 'center',
    zIndex: 10,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 25,
    backgroundColor: NotasTheme.colors.primary,
  },
  editBtnText: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 14,
    color: '#fff',
  },
  deleteBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: NotasTheme.colors.resultFail,
    justifyContent: 'center',
    alignItems: 'center',
  },
  takeQuizBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 25,
    backgroundColor: NotasTheme.colors.quizReady,
  },
  generateBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 25,
    backgroundColor: NotasTheme.colors.primary,
  },
  takeQuizBtnText: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 14,
    color: '#fff',
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 25,
    backgroundColor: NotasTheme.colors.primary,
  },
  saveBtnText: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 14,
    color: '#fff',
  },
  cancelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 25,
    backgroundColor: NotasTheme.colors.resultFail,
  },
  cancelBtnText: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 14,
    color: '#fff',
  },
  footerBtnText: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 14,
    color: NotasTheme.colors.text,
  },
});

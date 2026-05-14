import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
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

  // Audio Recording State
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  // Initialize Web Speech API on Web
  useEffect(() => {
    if (Platform.OS === 'web' && (window.hasOwnProperty('SpeechRecognition') || window.hasOwnProperty('webkitSpeechRecognition'))) {
      // @ts-ignore
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setSubjectText((prev) => {
            const trimmedPrev = prev.trim();
            const newText = finalTranscript.trim();
            if (trimmedPrev.endsWith(newText)) return prev;
            return trimmedPrev ? trimmedPrev + ' ' + newText : newText;
          });
        }
      };

      rec.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') setIsRecording(false);
      };

      setRecognition(rec);
    }
  }, []);

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

  const recordingRef = React.useRef<Audio.Recording | null>(null);
  const isRotating = React.useRef(false);

  const startRecording = async () => {
    try {
      if (Platform.OS === 'web' && recognition) {
        recognition.start();
        setIsRecording(true);
      } else {
        await startAudioRecording();
      }
    } catch (err: any) {
      console.error('Failed to start recording', err);
      Alert.alert('Recording Error', err.message || 'Check microphone permissions');
    }
  };

  const startAudioRecording = async () => {
    if (Platform.OS !== 'web') {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission Denied', 'Please grant microphone access.');
        return;
      }
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      staysActiveInBackground: true,
      // @ts-ignore
      interruptionModeAndroid: 1, // DoNotMix
      // @ts-ignore
      interruptionModeIOS: 1, // DoNotMix
    });

        const recordingOptions = {
          android: {
            extension: '.m4a',
            outputFormat: 2, // MPEG_4
            audioEncoder: 3, // AAC
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 128000,
          },
          ios: {
            extension: '.m4a',
            outputFormat: 'aac ', // MPEG4AAC
            audioQuality: 96, // HIGH
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 128000,
          },
        } as any;

    const { recording } = await Audio.Recording.createAsync(recordingOptions as any);
    recordingRef.current = recording;
    setRecording(recording);
    setIsRecording(true);
  };

  // Pulse/Chunked recording for Mobile "near real-time"
  useEffect(() => {
    let interval: any;
    if (isRecording && Platform.OS !== 'web') {
      interval = setInterval(async () => {
        if (isRotating.current || !isRecording) return;
        isRotating.current = true;
        
        const oldRecording = recordingRef.current;
        if (!oldRecording) {
          isRotating.current = false;
          return;
        }

        try {
          // Stop and transcribe old first to free up the recorder
          await oldRecording.stopAndUnloadAsync();

          // Wait a tiny bit for native resources to free up
          await new Promise(resolve => setTimeout(resolve, 300));

          // Check again if we should still be recording
          if (!isRecording) {
            isRotating.current = false;
            return;
          }

          const uri = oldRecording.getURI();
          if (uri) transcribeAudio(uri);

          // Start new recording
          const { recording: newRecording } = await Audio.Recording.createAsync({
            android: { extension: '.m4a', outputFormat: 2, audioEncoder: 3, sampleRate: 44100, numberOfChannels: 1, bitRate: 128000 },
            ios: { extension: '.m4a', outputFormat: 'aac ', audioQuality: 96, sampleRate: 44100, numberOfChannels: 1, bitRate: 128000 },
          } as any);
          
          // Double check if user stopped while we were creating
          if (!isRecording) {
            await newRecording.stopAndUnloadAsync();
            isRotating.current = false;
            return;
          }

          recordingRef.current = newRecording;
          setRecording(newRecording);
        } catch (e) {
          console.error('Pulse error:', e);
        } finally {
          isRotating.current = false;
        }
      }, 4000); // Pulse every 4 seconds for better real-time feel
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  const stopRecording = async () => {
    setIsRecording(false);
    if (Platform.OS === 'web' && recognition) {
      try { recognition.stop(); } catch (e) {}
      return;
    }
    
    const finalRecording = recordingRef.current;
    recordingRef.current = null;
    setRecording(null);

    if (!finalRecording) return;
    try {
      setIsTranscribing(true);
      await finalRecording.stopAndUnloadAsync();
      const uri = finalRecording.getURI();
      if (uri) await transcribeAudio(uri);
    } catch (error: any) {
      console.error('Failed to stop recording', error);
    } finally {
      setIsTranscribing(false);
    }
  };

  const transcribeAudio = async (uri: string) => {
    try {
      const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
      if (!apiKey) return;

      if (Platform.OS === 'web') {
        const audioResponse = await fetch(uri);
        const audioBlob = await audioResponse.blob();
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.m4a');
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('response_format', 'json');
        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          body: formData,
        });
        const result = await response.json();
        if (result.text) {
          setSubjectText(prev => {
            const trimmed = prev.trim();
            return trimmed ? trimmed + ' ' + result.text.trim() : result.text.trim();
          });
        }
      } else {
        const response = await FileSystem.uploadAsync(
          'https://api.groq.com/openai/v1/audio/transcriptions',
          uri,
          {
            httpMethod: 'POST',
            uploadType: 1 as any, // MULTIPART
            fieldName: 'file',
            parameters: {
              model: 'whisper-large-v3-turbo',
              response_format: 'json'
            },
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          }
        );

        if (response.status !== 200) {
          const errorData = JSON.parse(response.body);
          console.error('Groq API Error:', errorData);
          throw new Error(errorData.error?.message || `Transcription failed (${response.status})`);
        }

        const result = JSON.parse(response.body);
        if (result.text && result.text.trim()) {
          setSubjectText(prev => {
            const trimmed = prev.trim();
            const newText = result.text.trim();
            return trimmed ? trimmed + ' ' + newText : newText;
          });
        }
      }
    } catch (error) {
      console.error('Transcription error:', error);
    } finally {
      setIsTranscribing(false);
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
        <View style={[styles.noteBox, isEditing && styles.noteBoxEditing, isRecording && styles.noteBoxRecording]}>
          <TextInput
            style={styles.noteText}
            multiline
            editable={isEditing}
            value={subjectText}
            onChangeText={setSubjectText}
            scrollEnabled={false}
            placeholder={isTranscribing ? "Transcribing..." : "Note content..."}
            placeholderTextColor="#aaa"
          />
          {isEditing && (
            <TouchableOpacity
              style={[styles.micButton, isRecording && styles.micButtonActive]}
              onPress={isRecording ? stopRecording : startRecording}
              disabled={isTranscribing}
            >
              {isTranscribing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name={isRecording ? "square" : "mic"} size={20} color="#fff" />
              )}
            </TouchableOpacity>
          )}
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
  noteBoxRecording: { borderColor: '#EE6A34', borderWidth: 2, backgroundColor: '#fff' },
  micButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: NotasTheme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  micButtonActive: {
    backgroundColor: '#d95a2b',
    transform: [{ scale: 1.1 }],
  },
  noteText: {
    fontFamily: NotasTheme.typography.serif,
    fontSize: 15,
    color: NotasTheme.colors.text,
    lineHeight: 24,
    textAlignVertical: 'top',
    outlineStyle: 'none' as any,
    minHeight: 450,
    width: '100%',
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

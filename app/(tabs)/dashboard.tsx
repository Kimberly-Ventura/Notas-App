import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { router } from 'expo-router';
import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NotasTheme } from '../../constants/NotasTheme';
import { supabase } from '../../lib/supabase';
import { generateQuizForNote } from '../../lib/quizGenerator';

export default function DashboardScreen() {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Audio Recording State
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchNotes();
    }, [])
  );

  const fetchNotes = async () => {
    try {
      setFetching(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('notes')
        .select('id, title, subject, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }
      if (data) {
        setNotes(data);
      }
    } catch (error: any) {
      Alert.alert('Error fetching notes', error.message);
    } finally {
      setFetching(false);
    }
  };

  const startRecording = async () => {
    try {
      if (Platform.OS !== 'web') {
        const permission = await Audio.requestPermissionsAsync();
        if (permission.status !== 'granted') {
          Alert.alert('Permission Denied', 'Please grant microphone access to record voice notes.');
          return;
        }
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    if (!recording) return;

    try {
      setIsTranscribing(true);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (uri) {
        await transcribeAudio(uri);
      }
    } catch (error) {
      console.error('Failed to stop recording', error);
      Alert.alert('Error', 'Failed to stop recording');
      setIsTranscribing(false);
    }
  };

  const transcribeAudio = async (uri: string) => {
    try {
      const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
      if (!apiKey || apiKey === 'your_groq_api_key_here') {
        Alert.alert('Missing API Key', 'Please add your Groq API Key to the .env file to use Speech-to-Text.');
        setIsTranscribing(false);
        return;
      }

      if (Platform.OS === 'web') {
        // Web requires fetching the blob first and using standard fetch
        const audioResponse = await fetch(uri);
        const audioBlob = await audioResponse.blob();

        const formData = new FormData();
        // @ts-ignore
        formData.append('file', audioBlob, 'audio.m4a');
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('response_format', 'json');
        formData.append('language', 'en');

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
          body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error?.message || 'Transcription failed');
        }

        if (result.text) {
          setSubject((prev) => {
            const trimmedPrev = prev.trim();
            return trimmedPrev ? trimmedPrev + ' ' + result.text.trim() : result.text.trim();
          });
        }
      } else {
        // Mobile uses expo-file-system to completely bypass React Native's buggy fetch for file uploads
        const response = await FileSystem.uploadAsync(
          'https://api.groq.com/openai/v1/audio/transcriptions',
          uri,
          {
            httpMethod: 'POST',
            uploadType: 1 as any, // FileSystemUploadType.MULTIPART
            fieldName: 'file',
            mimeType: 'audio/m4a',
            parameters: {
              model: 'whisper-large-v3-turbo',
              response_format: 'json',
              language: 'en',
            },
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          }
        );

        const result = JSON.parse(response.body);

        if (response.status !== 200) {
          throw new Error(result.error?.message || 'Transcription failed');
        }

        if (result.text) {
          setSubject((prev) => {
            const trimmedPrev = prev.trim();
            return trimmedPrev ? trimmedPrev + ' ' + result.text.trim() : result.text.trim();
          });
        }
      }
    } catch (error: any) {
      console.error('Transcription error:', error);
      Alert.alert('Transcription Error', error.message);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleAddNote = async () => {
    if (!title.trim()) {
      Alert.alert('Validation Error', 'Title is required');
      return;
    }
    if (subject.length < 100) {
      Alert.alert('Validation Error', 'Subject must be at least 100 characters');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to add a note.');
        return;
      }

      const { data, error } = await supabase.from('notes').insert([
        {
          user_id: user.id,
          title: title.trim(),
          subject: subject.trim()
        }
      ]).select();

      if (error) {
        throw error;
      }

      if (data && data[0]) {
        const newNote = data[0];
        setNotes([newNote, ...notes]);
        const savedTitle = title.trim();
        const savedSubject = subject.trim();
        setTitle('');
        setSubject('');

        // Fire-and-forget: generate quiz in background
        generateQuizForNote(newNote.id, savedTitle, savedSubject, user.id)
          .catch(err => console.error('[AutoQuiz] Generation failed:', err));
      }
    } catch (error: any) {
      Alert.alert('Error saving note', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.mainContent}>
        {/* Header */}
        <Text style={styles.headerTitle}>NOTAS</Text>

        {/* Inputs */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.titleInput}
            placeholder="Title"
            placeholderTextColor="#888"
            value={title}
            onChangeText={setTitle}
            textAlign="center"
          />

          <View style={[styles.textAreaContainer, isRecording && styles.textAreaRecording]}>
            <TextInput
              style={styles.textArea}
              placeholder={isTranscribing ? "Transcribing audio..." : "Subject (minimum 100 characters)"}
              placeholderTextColor="#888"
              multiline
              value={subject}
              onChangeText={setSubject}
              editable={!isTranscribing && !isRecording}
            />
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
          </View>
        </View>

        <Pressable
          style={({ hovered, pressed }) => [
            styles.addButton,
            hovered && styles.addButtonHovered,
            pressed && styles.addButtonPressed,
            (loading || !title.trim()) && styles.addButtonDisabled
          ]}
          onPress={handleAddNote}
          disabled={loading || !title.trim()}
        >
          <Feather name="plus-circle" size={20} color={NotasTheme.colors.text} style={styles.addIcon} />
          <Text style={styles.addButtonText}>Add Notes</Text>
        </Pressable>

        <View style={styles.notesSection}>
          <Text style={styles.sectionTitle}>My Notes</Text>
          <View style={styles.separator} />

          <ScrollView style={styles.notesScrollView} contentContainerStyle={styles.notesScrollContent}>
            {notes.length === 0 && !fetching && (
              <Text style={{ textAlign: 'center', color: '#888', marginTop: 16 }}>No notes yet. Create one above!</Text>
            )}

            {notes.map((note) => {
              const dateStr = note.created_at
                ? new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '';
              const timeStr = note.created_at
                ? new Date(note.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                : '';
              return (
                <View key={note.id} style={styles.noteCard}>
                  <View style={styles.noteCardBody}>
                    <Text style={styles.noteCardTitle}>{note.title}</Text>
                    <Text style={styles.noteCardPreview} numberOfLines={2}>
                      {note.subject}
                    </Text>
                    {dateStr ? (
                      <Text style={styles.noteCardDate}>{dateStr}{' '}{timeStr}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push(`/note/${note.id}` as any)}
                    style={styles.noteEditBtn}
                  >
                    <MaterialCommunityIcons name="chevron-right" size={22} color={NotasTheme.colors.primary} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NotasTheme.colors.background,
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  headerTitle: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 28,
    color: NotasTheme.colors.text,
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 2,
  },
  inputContainer: {
    marginBottom: 16,
  },
  titleInput: {
    backgroundColor: NotasTheme.colors.inputBackground,
    borderWidth: 1,
    borderColor: NotasTheme.colors.border,
    borderRadius: NotasTheme.borderRadius.input,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontFamily: NotasTheme.typography.serif,
    fontSize: 16,
    color: NotasTheme.colors.text,
    marginBottom: 16,
  },
  textAreaContainer: {
    backgroundColor: NotasTheme.colors.inputBackground,
    borderWidth: 1,
    borderColor: NotasTheme.colors.border,
    borderRadius: NotasTheme.borderRadius.input,
    height: 200,
    position: 'relative',
  },
  textAreaRecording: {
    borderColor: '#EE6A34',
    borderWidth: 2,
    backgroundColor: '#fff',
  },
  textArea: {
    flex: 1,
    padding: 16,
    fontFamily: NotasTheme.typography.serif,
    fontSize: 16,
    color: NotasTheme.colors.text,
    textAlignVertical: 'top',
  },
  micButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#888',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: NotasTheme.colors.primary,
    ...Platform.select({
      web: {
        transition: 'all 0.2s ease' as any,
      },
    }),
  },
  micButtonActive: {
    backgroundColor: '#d95a2b',
    transform: [{ scale: 1.1 }],
  },
  addButton: {
    backgroundColor: NotasTheme.colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: NotasTheme.colors.border,
    borderRadius: 0, // Flat corners based on image
    marginBottom: 32,
    ...Platform.select({
      web: {
        transition: 'all 0.2s ease' as any,
      },
    }),
  },
  addButtonHovered: {
    backgroundColor: '#d95a2b', // Slightly darker orange
  },
  addButtonPressed: {
    backgroundColor: '#c44e23', // Even darker for click
    transform: [{ scale: 0.98 }],
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addIcon: {
    marginRight: 8,
  },
  addButtonText: {
    fontFamily: NotasTheme.typography.serif,
    fontSize: 16,
    color: NotasTheme.colors.text,
  },
  notesSection: {
    flex: 1,
    marginTop: 10,
  },
  notesScrollView: {
    flex: 1,
  },
  notesScrollContent: {
    paddingBottom: 40,
  },
  sectionTitle: {
    fontFamily: NotasTheme.typography.serif,
    fontSize: 18,
    color: NotasTheme.colors.text,
    marginBottom: 4,
  },
  separator: {
    height: 1,
    backgroundColor: NotasTheme.colors.border,
    marginBottom: 16,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NotasTheme.colors.inputBackground,
    borderWidth: 1,
    borderColor: NotasTheme.colors.border,
    borderRadius: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 10,
  },
  noteCardBody: {
    flex: 1,
  },
  noteCardTitle: {
    fontFamily: NotasTheme.typography.serifBold,
    fontSize: 14,
    color: NotasTheme.colors.text,
    marginBottom: 2,
  },
  noteCardPreview: {
    fontFamily: NotasTheme.typography.serif,
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
    marginBottom: 4,
  },
  noteCardDate: {
    fontFamily: NotasTheme.typography.serif,
    fontSize: 11,
    color: '#999',
  },
  noteEditBtn: {
    padding: 4,
  },
});

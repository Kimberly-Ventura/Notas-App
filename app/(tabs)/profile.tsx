import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NotasTheme } from '../../constants/NotasTheme';
import { supabase } from '../../lib/supabase';
import { router } from 'expo-router';

export default function ProfileScreen() {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/(auth)/sign-in');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Profile Screen</Text>
      <TouchableOpacity style={styles.button} onPress={handleSignOut}>
        <Text style={styles.buttonText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: NotasTheme.colors.background,
  },
  text: {
    fontFamily: NotasTheme.typography.serif,
    fontSize: 18,
    color: NotasTheme.colors.text,
    marginBottom: 20,
  },
  button: {
    backgroundColor: NotasTheme.colors.border,
    padding: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: NotasTheme.colors.white,
    fontFamily: NotasTheme.typography.serif,
  }
});

import { View, Text, StyleSheet } from 'react-native';
import { NotasTheme } from '../../constants/NotasTheme';

export default function BookmarksScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Bookmarks Screen (Coming Soon)</Text>
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
  },
});

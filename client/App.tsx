import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/store/auth';
import { EventsProvider } from './src/store/events';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App(): React.ReactElement {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <EventsProvider>
          <AppNavigator />
          <StatusBar style="light" />
        </EventsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

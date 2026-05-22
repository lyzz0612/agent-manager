import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform, StyleSheet, View } from 'react-native';
import { LoginScreen } from '../screens/LoginScreen';
import { MachinesScreen } from '../screens/MachinesScreen';
import { MachineDetailScreen } from '../screens/MachineDetailScreen';
import { AgentDetailScreen } from '../screens/AgentDetailScreen';
import { ActionResultScreen } from '../screens/ActionResultScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useAuth } from '../store/auth';
import { colors, typography } from '../theme';
import { linking } from './linking';
import type {
  MachinesStackParamList,
  MainTabParamList,
  RootStackParamList,
  SettingsStackParamList,
} from './types';

const navigationTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
    notification: colors.primary,
  },
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();
const MachinesStack = createNativeStackNavigator<MachinesStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

function MachinesNavigator(): React.ReactElement {
  return (
    <MachinesStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text, ...typography.heading },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <MachinesStack.Screen
        name="Machines"
        component={MachinesScreen}
        options={{ title: '机器' }}
      />
      <MachinesStack.Screen
        name="MachineDetail"
        component={MachineDetailScreen}
        options={{ title: '机器详情' }}
      />
      <MachinesStack.Screen
        name="AgentDetail"
        component={AgentDetailScreen}
        options={{ title: 'Agent 详情' }}
      />
      <MachinesStack.Screen
        name="ActionResult"
        component={ActionResultScreen}
        options={{ title: '动作结果' }}
      />
    </MachinesStack.Navigator>
  );
}

function SettingsNavigator(): React.ReactElement {
  return (
    <SettingsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text, ...typography.heading },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <SettingsStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: '设置' }}
      />
    </SettingsStack.Navigator>
  );
}

function MainTabs(): React.ReactElement {
  return (
    <MainTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      }}
    >
      <MainTab.Screen
        name="MachinesTab"
        component={MachinesNavigator}
        options={{ title: '机器', tabBarIcon: tabIcon('machines') }}
      />
      <MainTab.Screen
        name="SettingsTab"
        component={SettingsNavigator}
        options={{ title: '设置', tabBarIcon: tabIcon('settings') }}
      />
    </MainTab.Navigator>
  );
}

function tabIcon(kind: 'machines' | 'settings') {
  return ({ color }: { color: string }) => (
    <View
      style={[
        iconStyles.dot,
        { backgroundColor: color, opacity: kind === 'machines' ? 1 : 0.7 },
      ]}
    />
  );
}

const iconStyles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

export function AppNavigator(): React.ReactElement | null {
  const { loading, session } = useAuth();
  if (loading) return null;

  return (
    <NavigationContainer
      theme={navigationTheme}
      linking={Platform.OS === 'web' ? linking : undefined}
    >
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <RootStack.Screen name="Main" component={MainTabs} />
        ) : (
          <RootStack.Screen name="Login" component={LoginScreen} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

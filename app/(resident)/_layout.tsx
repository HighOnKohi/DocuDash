import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';

export default function ResidentLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.surfaceMuted },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inkSubtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ focused, size }) => (
            <MaterialIcons
              name="dashboard"
              size={size}
              color={focused ? colors.primary : colors.inkSubtle}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="request-new"
        options={{
          title: 'New Request',
          tabBarIcon: ({ focused, size }) => (
            <MaterialIcons
              name="post-add"
              size={size}
              color={focused ? colors.primary : colors.inkSubtle}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused, size }) => (
            <MaterialIcons
              name="person"
              size={size}
              color={focused ? colors.primary : colors.inkSubtle}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="request/[id]"
        options={{
          href: null,
          title: 'Request Details',
        }}
      />
    </Tabs>
  );
}

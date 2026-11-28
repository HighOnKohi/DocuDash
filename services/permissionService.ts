import AsyncStorage from '@react-native-async-storage/async-storage';
import { Camera } from 'expo-camera';
import { Linking, Platform } from 'react-native';

import {
  getNotificationPermissionDetails,
  type NotificationPermissionDetails,
} from './notificationService';

const PERMISSIONS_PROMPT_DISMISSED_KEY = 'docudash.permissions.prompt_dismissed';

export type DevicePermissionState = 'granted' | 'undetermined' | 'denied' | 'unsupported';

export interface DevicePermissionDetail {
  status: DevicePermissionState;
  canAskAgain: boolean;
}

export interface PermissionGuide {
  heading: string;
  steps: string[];
  note?: string;
}

export function isNativePermissionsSupported(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

function mapCameraPermission(response: {
  granted: boolean;
  status: string;
  canAskAgain: boolean;
}): DevicePermissionDetail {
  if (response.granted) {
    return { status: 'granted', canAskAgain: true };
  }
  if (response.status === 'denied' || !response.canAskAgain) {
    return { status: 'denied', canAskAgain: response.canAskAgain };
  }
  return { status: 'undetermined', canAskAgain: response.canAskAgain };
}

export async function getCameraPermissionDetails(): Promise<DevicePermissionDetail> {
  if (!isNativePermissionsSupported()) {
    return { status: 'unsupported', canAskAgain: false };
  }

  const response = await Camera.getCameraPermissionsAsync();
  return mapCameraPermission(response);
}

export async function requestCameraPermission(): Promise<DevicePermissionDetail> {
  if (!isNativePermissionsSupported()) {
    return { status: 'unsupported', canAskAgain: false };
  }

  const response = await Camera.requestCameraPermissionsAsync();
  return mapCameraPermission(response);
}

export async function getNotificationPermissionStatusDetails(): Promise<NotificationPermissionDetails> {
  return getNotificationPermissionDetails();
}

export async function openDeviceAppSettings(): Promise<void> {
  if (!isNativePermissionsSupported()) {
    return;
  }

  await Linking.openSettings();
}

export async function getPermissionPromptDismissed(): Promise<boolean> {
  if (!isNativePermissionsSupported()) {
    return true;
  }

  try {
    const value = await AsyncStorage.getItem(PERMISSIONS_PROMPT_DISMISSED_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function setPermissionPromptDismissed(dismissed: boolean): Promise<void> {
  if (!isNativePermissionsSupported()) {
    return;
  }

  await AsyncStorage.setItem(PERMISSIONS_PROMPT_DISMISSED_KEY, dismissed ? 'true' : 'false');
}

export function getPermissionEnableSteps(kind: 'notifications' | 'camera'): PermissionGuide {
  if (Platform.OS === 'android') {
    if (kind === 'notifications') {
      return {
        heading: 'How to enable Notifications on Android',
        steps: [
          'Tap "Open Device Settings" below to open DocuDash App Info.',
          'Tap Notifications (or Permissions -> Notifications).',
          'Turn ON "Allow notifications" and "Request & Pickup Updates".',
          'Return to DocuDash — status updates automatically.',
        ],
        note: 'Android 13+ sideloaded APK tip: If the toggle is greyed out, tap the 3-dot menu in the top-right corner of App Info, choose "Allow restricted settings", then turn on Notifications.',
      };
    }

    return {
      heading: 'How to enable Camera on Android',
      steps: [
        'Tap "Open Device Settings" below to open DocuDash App Info.',
        'Tap Permissions -> Camera.',
        'Choose "Allow only while using the app".',
        'Return to DocuDash to scan QR pickup passes.',
      ],
    };
  }

  if (Platform.OS === 'ios') {
    if (kind === 'notifications') {
      return {
        heading: 'How to enable Notifications on iPhone / iPad',
        steps: [
          'Tap "Open Device Settings" below.',
          'Tap Notifications.',
          'Turn ON Allow Notifications, Banners, and Sounds.',
          'Return to DocuDash.',
        ],
      };
    }

    return {
      heading: 'How to enable Camera on iPhone / iPad',
      steps: [
        'Tap "Open Device Settings" below.',
        'Toggle Camera ON.',
        'Return to DocuDash to scan QR pickup passes.',
      ],
    };
  }

  return { heading: '', steps: [] };
}

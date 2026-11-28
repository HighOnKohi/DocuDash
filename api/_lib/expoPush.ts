export const EXPO_PUSH_CHANNEL_ID = 'docudash-updates-v2';
const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

export interface SendExpoPushParams {
  tokens: string[];
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface SendExpoPushResult {
  sentCount: number;
  invalidTokens: string[];
}

interface ExpoPushTicket {
  status?: 'ok' | 'error';
  details?: { error?: string };
}

/**
 * Sends remote push alerts via the Expo Push API to all registered device tokens
 * for a resident. Gracefully handles dead tokens (`DeviceNotRegistered`) and
 * transient network failures without throwing.
 */
export async function sendExpoPushNotifications(
  params: SendExpoPushParams
): Promise<SendExpoPushResult> {
  const uniqueTokens = Array.from(
    new Set(params.tokens.map((t) => t.trim()).filter(Boolean))
  );
  if (uniqueTokens.length === 0) {
    return { sentCount: 0, invalidTokens: [] };
  }

  const messages = uniqueTokens.map((token) => ({
    to: token,
    title: params.title,
    body: params.body,
    sound: 'default',
    priority: 'high',
    channelId: EXPO_PUSH_CHANNEL_ID,
    data: params.data,
  }));

  try {
    const response = await fetch(EXPO_PUSH_API_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      return { sentCount: 0, invalidTokens: [] };
    }

    const parsed = (await response.json()) as { data?: ExpoPushTicket[] };
    const tickets = Array.isArray(parsed.data) ? parsed.data : [];

    let sentCount = 0;
    const invalidTokens: string[] = [];

    tickets.forEach((ticket, index) => {
      const token = uniqueTokens[index];
      if (!token) return;
      if (ticket.status === 'ok') {
        sentCount += 1;
      } else if (ticket.details?.error === 'DeviceNotRegistered') {
        invalidTokens.push(token);
      }
    });

    return { sentCount, invalidTokens };
  } catch {
    return { sentCount: 0, invalidTokens: [] };
  }
}

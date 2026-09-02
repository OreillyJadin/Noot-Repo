// Report and block prompts, shared by both 1:1 chat screens.
//
// App Store Guideline 1.2: an app with user-generated content must let people report offensive
// content, block abusive users, and get a timely response. noot has chat messages and tutor
// reviews, and had none of it — while /terms already promised all three.
//
// Blocking is enforced by the database (migration 0028 extends messages_insert), so these
// helpers are the affordance, not the security boundary. A hostile client that skipped them
// still cannot post to a blocked conversation.
import { Alert } from 'react-native';
import { api, type ReportReason } from '@noot/core';
import { errText } from './errText';

const REASONS: { key: ReportReason; label: string }[] = [
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'inappropriate', label: 'Inappropriate content' },
  { key: 'spam', label: 'Spam or scam' },
  { key: 'academic_dishonesty', label: 'Cheating / academic dishonesty' },
  { key: 'other', label: 'Something else' },
];

/** Ask why, then submit. Resolves true if a report was filed. */
function pickReason(title: string, message: string): Promise<ReportReason | null> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      ...REASONS.map((r) => ({ text: r.label, onPress: () => resolve(r.key) })),
      { text: 'Cancel', style: 'cancel' as const, onPress: () => resolve(null) },
    ]);
  });
}

/** Report a single chat message. */
export async function reportMessage(messageId: string): Promise<boolean> {
  const reason = await pickReason('Report this message', 'What’s wrong with it?');
  if (!reason) return false;
  try {
    await api.moderation.reportMessage(messageId, reason);
    Alert.alert('Report sent', 'Thanks — our team reviews reports within 24 hours.');
    return true;
  } catch (e) {
    Alert.alert('Could not send the report', errText(e, 'Please try again.'));
    return false;
  }
}

/** Report a person's conduct rather than one message. */
export async function reportUser(userId: string, name: string): Promise<boolean> {
  const reason = await pickReason(`Report ${name}`, 'What’s the problem?');
  if (!reason) return false;
  try {
    await api.moderation.reportUser(userId, reason);
    Alert.alert('Report sent', 'Thanks — our team reviews reports within 24 hours.');
    return true;
  } catch (e) {
    Alert.alert('Could not send the report', errText(e, 'Please try again.'));
    return false;
  }
}

/**
 * Block, with a confirm that states the consequence honestly — it is symmetric, so the user
 * loses the ability to message this person too, not just the reverse.
 */
export async function blockUser(userId: string, name: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      `Block ${name}?`,
      `Neither of you will be able to message the other, and ${name} won't appear in your search results. You can undo this from your profile.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.moderation.blockUser(userId);
              Alert.alert('Blocked', `${name} can no longer message you.`);
              resolve(true);
            } catch (e) {
              Alert.alert('Could not block', errText(e, 'Please try again.'));
              resolve(false);
            }
          },
        },
      ],
    );
  });
}

/** The chat header's safety menu: report the person, or block them. */
export async function openSafetyMenu(
  userId: string,
  name: string,
  onBlocked: () => void,
): Promise<void> {
  Alert.alert('Safety', `Options for your conversation with ${name}.`, [
    { text: `Report ${name}`, onPress: () => void reportUser(userId, name) },
    {
      text: `Block ${name}`,
      style: 'destructive',
      onPress: async () => {
        if (await blockUser(userId, name)) onBlocked();
      },
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

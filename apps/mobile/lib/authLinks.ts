// The app's auth-link ledger (see lib/authLinkOnce.ts), persisted in AsyncStorage. Holds
// only spent one-time codes and their state — nothing that can sign anyone in.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAuthLinks } from './authLinkOnce';

export const authLinks = createAuthLinks(AsyncStorage);

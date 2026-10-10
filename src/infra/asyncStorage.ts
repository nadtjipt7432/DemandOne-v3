import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KeyValueStorage } from './storage';

/** The app's real storage: localStorage on web, native key-value storage on iOS/Android. */
export const asyncStorage: KeyValueStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

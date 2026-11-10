import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'badminton_auth_token';

async function webGet(key: string): Promise<string | null> {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(key);
}

async function webSet(key: string, value: string): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, value);
}

async function webRemove(key: string): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(key);
}

export async function getAuthToken(): Promise<string | null> {
  if (Platform.OS === 'web') return webGet(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setAuthToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    await webSet(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
  if (Platform.OS === 'web') {
    await webRemove(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

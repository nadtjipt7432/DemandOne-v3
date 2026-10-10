import type { KeyValueStorage } from '@/infra/storage';
import { getState, hydrateStore } from '@/state/store';
import { applyThemeMode } from '@/theme';

/** App startup: load the saved session and apply its saved theme before anything renders. */
export async function bootstrap(storage: KeyValueStorage): Promise<void> {
  await hydrateStore(storage);
  applyThemeMode(getState().themeMode);
}

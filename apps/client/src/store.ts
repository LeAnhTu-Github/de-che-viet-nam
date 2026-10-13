import { create } from 'zustand';

export type Screen = 'menu' | 'lobby' | 'game';

interface UiState {
  screen: Screen;
  playerName: string;
  setScreen: (s: Screen) => void;
  setPlayerName: (name: string) => void;
}

/** State UI toàn cục: màn hình hiện tại + tên người chơi. */
export const useUiStore = create<UiState>((set) => ({
  screen: 'menu',
  playerName: 'Tướng quân',
  setScreen: (screen) => set({ screen }),
  setPlayerName: (playerName) => set({ playerName }),
}));

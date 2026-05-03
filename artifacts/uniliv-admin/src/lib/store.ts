import { create } from 'zustand';

interface AuthState {
  token: string | null;
  setToken: (token: string | null) => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('uniliv_token'),
  setToken: (token) => {
    if (token) {
      localStorage.setItem('uniliv_token', token);
    } else {
      localStorage.removeItem('uniliv_token');
    }
    set({ token });
  },
  isAuthenticated: () => !!get().token,
}));

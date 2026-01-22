import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme, CssBaseline } from '@mui/material';
import api from '../lib/api';

type ThemeMode = 'light' | 'dark' | 'auto';

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  effectiveMode: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useThemeMode() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within a ThemeProvider');
  }
  return context;
}

function getSystemPreference(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

// Get initial mode from localStorage immediately (no async)
function getInitialMode(): ThemeMode {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark' || stored === 'auto') {
      return stored;
    }
  }
  return 'auto';
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Initialize from localStorage immediately to prevent flash
  const [mode, setModeState] = useState<ThemeMode>(getInitialMode);
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>(getSystemPreference());
  const [hasSyncedWithServer, setHasSyncedWithServer] = useState(false);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemPreference(e.matches ? 'dark' : 'light');
    };
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Sync with server on mount (only if authenticated)
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || hasSyncedWithServer) return;

    (async () => {
      try {
        const response = await api.get('/me');
        const serverTheme = response.data?.theme;
        if (serverTheme && (serverTheme === 'light' || serverTheme === 'dark' || serverTheme === 'auto')) {
          // Update local state and storage if server has different value
          if (serverTheme !== mode) {
            setModeState(serverTheme);
            localStorage.setItem('theme', serverTheme);
          }
        }
      } catch (err) {
        // Ignore errors - keep using local value
      } finally {
        setHasSyncedWithServer(true);
      }
    })();
  }, [hasSyncedWithServer, mode]);

  // Set mode and persist to both localStorage and server
  const setMode = async (newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem('theme', newMode);
    
    // Save to server in background
    const token = localStorage.getItem('token');
    if (token) {
      try {
        await api.patch('/me', { theme: newMode });
      } catch (err) {
        console.error('Failed to save theme to server:', err);
      }
    }
  };

  const effectiveMode = mode === 'auto' ? systemPreference : mode;

  // Apply dark mode class to document immediately for any CSS that needs it
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveMode);
    // Also set a class for CSS targeting
    if (effectiveMode === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  }, [effectiveMode]);

  const theme = useMemo(() => createTheme({
    palette: {
      mode: effectiveMode,
      ...(effectiveMode === 'dark' ? {
        background: {
          default: '#121212',
          paper: '#1e1e1e',
        },
        primary: {
          main: '#90caf9',
        },
        secondary: {
          main: '#ce93d8',
        },
      } : {
        background: {
          default: '#f5f5f5',
          paper: '#ffffff',
        },
        primary: {
          main: '#1976d2',
        },
        secondary: {
          main: '#9c27b0',
        },
      }),
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            scrollbarColor: effectiveMode === 'dark' ? '#6b6b6b #2b2b2b' : '#c1c1c1 #f1f1f1',
            '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
              width: 8,
              height: 8,
            },
            '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
              borderRadius: 8,
              backgroundColor: effectiveMode === 'dark' ? '#6b6b6b' : '#c1c1c1',
            },
            '&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track': {
              backgroundColor: effectiveMode === 'dark' ? '#2b2b2b' : '#f1f1f1',
            },
          },
        },
      },
    },
  }), [effectiveMode]);

  return (
    <ThemeContext.Provider value={{ mode, setMode, effectiveMode }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

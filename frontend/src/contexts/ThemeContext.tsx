import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme, CssBaseline } from '@mui/material';

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

interface ThemeProviderProps {
  children: ReactNode;
  initialMode?: ThemeMode;
}

export function ThemeProvider({ children, initialMode = 'auto' }: ThemeProviderProps) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>(getSystemPreference());

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemPreference(e.matches ? 'dark' : 'light');
    };
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const effectiveMode = mode === 'auto' ? systemPreference : mode;

  const theme = createTheme({
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
  });

  return (
    <ThemeContext.Provider value={{ mode, setMode, effectiveMode }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

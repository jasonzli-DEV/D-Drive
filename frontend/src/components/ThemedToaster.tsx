import { Toaster } from 'react-hot-toast';
import { useThemeMode } from '../contexts/ThemeContext';

export default function ThemedToaster() {
  const { effectiveMode } = useThemeMode();
  
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: effectiveMode === 'dark' ? '#333' : '#fff',
          color: effectiveMode === 'dark' ? '#fff' : '#333',
          borderRadius: '8px',
          border: effectiveMode === 'dark' ? '1px solid #444' : '1px solid #e0e0e0',
        },
        success: {
          iconTheme: {
            primary: effectiveMode === 'dark' ? '#4caf50' : '#2e7d32',
            secondary: effectiveMode === 'dark' ? '#333' : '#fff',
          },
        },
        error: {
          iconTheme: {
            primary: effectiveMode === 'dark' ? '#f44336' : '#d32f2f',
            secondary: effectiveMode === 'dark' ? '#333' : '#fff',
          },
        },
      }}
    />
  );
}

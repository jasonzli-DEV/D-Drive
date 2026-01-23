import React from 'react';
import { Box, Button, Typography } from '@mui/material';

interface State {
  hasError: boolean;
  error?: Error | null;
}

export default class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, State> {
  constructor(props: {}) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    // Log to console for now; can be sent to remote logging later
    // eslint-disable-next-line no-console
    console.error('Uncaught error:', error, info);
  }

  handleReload = () => {
    // A simple reload may recover from extension-injected errors
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h5" gutterBottom>
              Sorry — something went wrong.
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              The app encountered an unexpected error. You can try reloading the page.
            </Typography>
            <Button variant="contained" onClick={this.handleReload}>
              Reload
            </Button>
          </Box>
        </Box>
      );
    }

    return this.props.children as React.ReactNode;
  }
}

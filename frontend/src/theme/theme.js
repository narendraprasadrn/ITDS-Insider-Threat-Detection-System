// frontend/src/theme/theme.js
import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#0288d1',
      light: '#35baf6',
      dark: '#01579b',
      contrastText: '#ffffff'
    },
    secondary: {
      main: '#7c4dff',
      light: '#9e79ff',
      dark: '#5328c6',
      contrastText: '#ffffff'
    },
    background: {
      default: '#0a0f1d',
      paper: '#10182b'
    },
    error: {
      main: '#f44336',
      light: '#e57373',
      dark: '#d32f2f'
    },
    warning: {
      main: '#ffa726',
      light: '#ffb74d',
      dark: '#f57c00'
    },
    info: {
      main: '#29b6f6',
      light: '#4fc3f7',
      dark: '#0288d1'
    },
    success: {
      main: '#66bb6a',
      light: '#81c784',
      dark: '#388e3c'
    },
    text: {
      primary: '#f1f5f9',
      secondary: '#94a3b8'
    },
    divider: 'rgba(255, 255, 255, 0.08)'
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h5: {
      fontWeight: 600,
      letterSpacing: '-0.02em'
    },
    h6: {
      fontWeight: 600
    },
    subtitle1: {
      color: '#94a3b8'
    },
    code: {
      fontFamily: '"JetBrains Mono", monospace'
    }
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#0f172a',
          backgroundImage: 'none',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }
      }
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#0b1120',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)'
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#11192e',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: 8
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none'
        }
      }
    }
  }
});

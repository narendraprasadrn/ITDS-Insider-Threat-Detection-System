// frontend/src/theme/theme.js
import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#55E6C1', // Primary accent: Mint
      light: '#7AF0D3', // Hover accent
      dark: '#30BA97',
      contrastText: '#0C1E1B' // Dark charcoal text for crisp contrast on bright mint
    },
    secondary: {
      main: '#AAB8BC', // Neutral secondary text/accent
      light: '#D1D5DB',
      dark: '#6B7280',
      contrastText: '#171B1C'
    },
    background: {
      default: '#171B1C', // Main background: Charcoal
      paper: '#252E30'    // Cards and panels
    },
    text: {
      primary: '#F5F7F7',
      secondary: '#AAB8BC',
      disabled: '#64748B'
    },
    divider: '#364345', // Borders
    action: {
      active: '#55E6C1',
      hover: 'rgba(255, 255, 255, 0.04)',
      selected: '#243D37',
      disabled: '#64748B',
      disabledBackground: 'rgba(54, 67, 69, 0.4)',
      focus: 'rgba(85, 230, 193, 0.25)'
    },
    // Distinct semantic status colors (distinguishable from Mint accent)
    success: {
      main: '#10B981', // True emerald green
      light: '#34D399',
      dark: '#059669',
      contrastText: '#FFFFFF'
    },
    warning: {
      main: '#F59E0B', // Amber
      light: '#FBBF24',
      dark: '#D97706',
      contrastText: '#0C1E1B'
    },
    error: {
      main: '#EF4444', // Red
      light: '#F87171',
      dark: '#DC2626',
      contrastText: '#FFFFFF'
    },
    info: {
      main: '#38BDF8', // Clear Sky Blue
      light: '#7DD3FC',
      dark: '#0284C7',
      contrastText: '#0C1E1B'
    }
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    h4: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: '#F5F7F7'
    },
    h5: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: '#F5F7F7'
    },
    h6: {
      fontWeight: 600,
      letterSpacing: '-0.01em',
      color: '#F5F7F7'
    },
    subtitle1: {
      color: '#AAB8BC',
      fontWeight: 500
    },
    subtitle2: {
      color: '#F5F7F7',
      fontWeight: 600
    },
    body1: {
      color: '#F5F7F7'
    },
    body2: {
      color: '#AAB8BC'
    },
    caption: {
      color: '#AAB8BC'
    }
  },
  shape: {
    borderRadius: 8
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#171B1C',
          color: '#F5F7F7'
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#1F292B', // Header: Neutral Charcoal
          backgroundImage: 'none',
          borderBottom: '1px solid #364345',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.35)'
        }
      }
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#1F292B', // Sidebar: Neutral Charcoal
          borderRight: '1px solid #364345',
          boxShadow: 'none'
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#252E30', // Cards and panels
          backgroundImage: 'none',
          border: '1px solid #364345',
          borderRadius: 8,
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: '#252E30',
          backgroundImage: 'none'
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 600,
          textTransform: 'none',
          transition: 'all 0.15s ease-in-out'
        },
        containedPrimary: {
          backgroundColor: '#55E6C1',
          color: '#0C1E1B',
          boxShadow: '0 2px 8px rgba(85, 230, 193, 0.25)',
          '&:hover': {
            backgroundColor: '#7AF0D3',
            boxShadow: '0 4px 14px rgba(85, 230, 193, 0.35)'
          },
          '&.Mui-disabled': {
            backgroundColor: 'rgba(54, 67, 69, 0.5)',
            color: '#64748B'
          }
        },
        outlinedPrimary: {
          borderColor: '#55E6C1',
          color: '#55E6C1',
          '&:hover': {
            borderColor: '#7AF0D3',
            backgroundColor: 'rgba(85, 230, 193, 0.08)'
          }
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 600
        },
        colorPrimary: {
          backgroundColor: 'rgba(85, 230, 193, 0.12)',
          color: '#55E6C1',
          border: '1px solid rgba(85, 230, 193, 0.3)'
        },
        outlinedPrimary: {
          borderColor: 'rgba(85, 230, 193, 0.4)',
          color: '#55E6C1'
        }
      }
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: '#55E6C1',
          height: 3,
          borderRadius: '3px 3px 0 0'
        }
      }
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.875rem',
          color: '#AAB8BC',
          transition: 'color 0.15s ease',
          '&.Mui-selected': {
            color: '#55E6C1'
          },
          '&:hover': {
            color: '#F5F7F7'
          }
        }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid #364345',
          color: '#F5F7F7',
          padding: '10px 16px'
        },
        head: {
          backgroundColor: '#1F292B',
          color: '#AAB8BC',
          fontWeight: 700,
          letterSpacing: '0.04em',
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          borderBottom: '1px solid #364345'
        }
      }
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.03) !important'
          }
        }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: '#171B1C', // Input backgrounds and SQL editor
          borderRadius: 6,
          color: '#F5F7F7',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#364345'
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#AAB8BC'
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#55E6C1',
            borderWidth: '2px'
          }
        },
        input: {
          '&::placeholder': {
            color: '#64748B',
            opacity: 1
          }
        }
      }
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: '#AAB8BC',
          '&.Mui-focused': {
            color: '#55E6C1'
          }
        }
      }
    },
    MuiSelect: {
      styleOverrides: {
        icon: {
          color: '#AAB8BC'
        }
      }
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: '#252E30', // Elevated cards and dialogs
          border: '1px solid #364345',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)'
        }
      }
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          color: '#F5F7F7',
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)'
          },
          '&.Mui-selected': {
            backgroundColor: '#243D37',
            color: '#55E6C1',
            '&:hover': {
              backgroundColor: '#2d4d45'
            }
          }
        }
      }
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: '#252E30', // Cards and panels
          border: '1px solid #364345',
          borderRadius: 10,
          boxShadow: '0 16px 32px rgba(0, 0, 0, 0.5)'
        }
      }
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          border: '1px solid'
        },
        standardSuccess: {
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          borderColor: 'rgba(16, 185, 129, 0.3)',
          color: '#6EE7B7'
        },
        standardWarning: {
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          borderColor: 'rgba(245, 158, 11, 0.3)',
          color: '#FCD34D'
        },
        standardError: {
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
          borderColor: 'rgba(239, 68, 68, 0.3)',
          color: '#FCA5A5'
        },
        standardInfo: {
          backgroundColor: 'rgba(56, 189, 248, 0.08)',
          borderColor: 'rgba(56, 189, 248, 0.3)',
          color: '#BAE6FD'
        }
      }
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          color: '#55E6C1'
        },
        thumb: {
          '&:hover, &.Mui-focusVisible': {
            boxShadow: '0 0 0 8px rgba(85, 230, 193, 0.2)'
          }
        }
      }
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          '&.Mui-checked': {
            color: '#55E6C1',
            '& + .MuiSwitch-track': {
              backgroundColor: '#7AF0D3',
              opacity: 0.6
            }
          }
        },
        track: {
          backgroundColor: '#364345'
        }
      }
    }
  }
});

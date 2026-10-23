// frontend/src/components/common/BootstrapIcon.jsx
import React from 'react';
import { Box } from '@mui/material';

/**
 * Enterprise Bootstrap Icon wrapper with consistent alignment, sizing, accessible semantics, and styling.
 * @param {string} name - e.g. "bi-shield-lock-fill" or "shield-lock-fill"
 * @param {string|number} size - font size or pixel size (e.g. 16, '1rem', '1.1rem')
 * @param {string} color - CSS color string (defaults to 'inherit')
 * @param {string} label - Accessible screen-reader label (optional). When omitted, aria-hidden="true" is set.
 * @param {object} sx - MUI sx props
 * @param {string} className - extra CSS classes
 */
export default function BootstrapIcon({
  name,
  size = '1.1rem',
  color = 'inherit',
  label,
  sx = {},
  className = '',
  ...props
}) {
  if (!name) return null;
  const iconClass = name.startsWith('bi-') ? name : `bi-${name}`;
  
  return (
    <Box
      component="i"
      className={`bi ${iconClass} ${className}`.trim()}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
      sx={{
        fontSize: typeof size === 'number' ? `${size}px` : size,
        color: color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        verticalAlign: 'middle',
        flexShrink: 0,
        ...sx
      }}
      {...props}
    />
  );
}

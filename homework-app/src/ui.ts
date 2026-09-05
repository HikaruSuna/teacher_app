import type { CSSProperties } from 'react';

export const inputStyle: CSSProperties = {
  width: '100%', padding: '10px', marginBottom: '10px',
  boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc',
};

export const btnStyle: CSSProperties = {
  width: '100%', padding: '10px', backgroundColor: '#007bff',
  color: 'white', border: 'none', borderRadius: '4px',
  cursor: 'pointer', fontWeight: 'bold',
};

export const secondaryBtnStyle: CSSProperties = {
  ...btnStyle, backgroundColor: '#6c757d',
};

export const cardStyle: CSSProperties = {
  border: '1px solid #ddd', padding: '15px', borderRadius: '8px',
};

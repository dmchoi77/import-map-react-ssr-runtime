import React from 'react';

if (!React.version.startsWith('18.')) {
  throw new Error(`React 18 compatibility tests expected React 18, received ${React.version}.`);
}

process.env.MFE_REACT_18_FIXTURE = '1';

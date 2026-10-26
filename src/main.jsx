import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/500.css';
import '@phosphor-icons/web/regular';
import '@phosphor-icons/web/fill';
import './styles.css';
import App from './App.jsx';

document.documentElement.dataset.build = __COMMIT__;

createRoot(document.getElementById('root')).render(<App />);

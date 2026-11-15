import React from 'react';
import { createRoot } from 'react-dom/client';
import Jukebox from './Jukebox.jsx';
import './styles.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><Jukebox /></React.StrictMode>);

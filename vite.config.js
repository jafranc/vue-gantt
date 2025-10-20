import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue'; // Importation du plugin Vue

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        vue(), // Activation du plugin pour gérer les fichiers .vue
    ],
    // Configuration pour le serveur de développement
    server: {
        // Le port 5173 est le port par défaut de Vite
        port: 5173,
        open: true, // Ouvre automatiquement le navigateur
    }
});
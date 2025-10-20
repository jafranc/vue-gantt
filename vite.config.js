import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

// Obtenir le chemin absolu vers le point d'entrée de la librairie
const libraryEntryPoint = path.resolve(__dirname, 'gantt-library.js');

export default defineConfig({
    plugins: [
        // Nécessaire pour analyser et compiler les fichiers .vue
        vue(),
    ],

    build: {
        // Dossier de sortie (généralement 'dist')
        outDir: 'dist',

        // Configuration spécifique pour la construction d'une librairie
        lib: {
            // Point d'entrée de la librairie (le fichier que vous venez de créer)
            entry: libraryEntryPoint,

            // Nom global de la variable qui contiendra les exports en mode UMD (ex: window.GanttLib)
            name: 'GanttLib',

            // Nom du fichier de sortie (générera dist/gantt-chart.umd.js et dist/gantt-chart.es.js)
            fileName: (format) => `gantt-chart.${format}.js`,

            // Formats de module à générer
            formats: ['es', 'umd'],
        },

        // Règle pour exclure Vue et D3 du bundle final (Dépendances externes)
        // C'est CRUCIAL pour que l'utilisateur final charge Vue et D3 une seule fois.
        rollupOptions: {
            external: ['vue', 'd3'],
            output: {
                // Fournit des noms de variables globales pour l'accès UMD (si Vue et D3 sont chargés par CDN)
                globals: {
                    vue: 'Vue',
                    d3: 'd3',
                },
            },
        },
    },
});

<script setup>
import { ref } from 'vue';
import GanttChart from './components/GanttChart.vue';

// --- 1. Déclaration de Données (Input Uniquement) ---
// Ces données sont transmises au composant enfant qui gère les modifications en interne.
const sampleTasks = ref([
  { id: 1, name: 'Initialisation du projet', start: '2024-03-01', end: '2024-03-05', color: '#4A90E2' },
  { id: 2, name: 'Analyse des besoins', start: '2024-03-04', end: '2024-03-12', color: '#F5A623' },
  { id: 3, name: 'Conception de l\'architecture', start: '2024-03-13', end: '2024-03-25', color: '#7ED321' },
  { id: 4, name: 'Développement du module A', start: '2024-03-26', end: '2024-04-05', color: '#BD10E0' },
  { id: 5, name: 'Tests unitaires & intégration', start: '2024-04-06', end: '2024-04-10', color: '#50E3C2' },
  { id: 6, name: 'Déploiement initial', start: '2024-04-11', end: '2024-04-15', color: '#9013FE' },
]);

const projectStart = '2024-03-01';
const projectEnd = '2024-04-20';


</script>

<template>
  <div class="p-6 md:p-10 min-h-screen bg-gray-50 font-sans">
    <h1 class="text-3xl font-bold text-gray-800 mb-6">Tableau de Gantt Interactif</h1>
    <div class="bg-white p-6 rounded-xl shadow-lg relative">

      <!-- GanttChart Component: Reçoit les données et gère l'état et l'interaction -->
      <GanttChart
          :tasks="sampleTasks"
          :start-date="projectStart"
          :end-date="projectEnd"
      />


    </div>
  </div>
</template>

<style scoped>
/* Styles spécifiques pour App.vue (minimal) */
</style>
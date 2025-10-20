<script setup>
import { ref } from 'vue';
import GanttChart from './components/GanttChart.vue';

// Données de démonstration
const sampleTasks = ref([
  { id: 1, name: 'Planification Projet', start: '2025-10-01', end: '2025-10-15', color: '#EF4444' }, // red-500
  { id: 2, name: 'Maquettes Design', start: '2025-10-10', end: '2025-10-25', color: '#F97316' }, // orange-500
  { id: 3, name: 'Développement Phase 1', start: '2025-10-20', end: '2025-11-10', color: '#10B981' }, // emerald-500
  { id: 4, name: 'Tests & QA', start: '2025-11-05', end: '2025-11-20', color: '#3B82F6' } // blue-500
]);

const projectStart = ref('2025-09-25');
const projectEnd = ref('2025-11-25');
const selectedTaskName = ref(null);

// Gestionnaire d'événement
const handleTaskSelected = (task) => {
  selectedTaskName.value = task.name;
  console.log("Tâche sélectionnée:", task.name);
};
</script>

<template>
  <div class="max-w-7xl mx-auto p-4 sm:p-8">
    <div class="bg-white p-6 shadow-xl rounded-xl">
      <h1 class="text-3xl font-extrabold mb-8 text-gray-900 border-b pb-2">
        Graphique de Gantt Vue 3 & D3
      </h1>

      <div class="bg-indigo-50 p-4 rounded-lg mb-6 text-sm text-indigo-700">
        <p>Cliquez sur une barre de tâche pour la sélectionner.</p>
      </div>

      <!-- Utilisation du composant GanttChart -->
      <GanttChart
          :tasks="sampleTasks"
          :start-date="projectStart"
          :end-date="projectEnd"
          @task-selected="handleTaskSelected"
      />

      <div class="mt-8 p-4 bg-gray-50 shadow-inner rounded-lg border border-gray-200">
        <p class="text-gray-700 font-medium">
          Dernière tâche sélectionnée :
          <span :class="{'text-blue-600 font-bold': selectedTaskName, 'text-gray-400': !selectedTaskName}">
                    {{ selectedTaskName || 'Aucune' }}
                </span>
        </p>
      </div>
    </div>
  </div>
</template>

<style>
/* Styles globaux pour l'application */
body {
  background-color: #f3f4f6; /* gray-100 */
  font-family: 'Inter', sans-serif;
}
</style>

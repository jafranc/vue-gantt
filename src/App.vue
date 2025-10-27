<script setup>
import { ref, watch, computed } from 'vue';
import GanttChart from './components/GanttChart.vue';

// ... existing tasks array ...

const tasks = ref([
  { id: 1, name: 'Initialisation du Projet', start: '2013-01-01', end: '2013-01-15', color: '#4F46E5', isNew: false },
  { id: 2, name: 'Analyse des Besoins', start: '2013-01-16', end: '2013-02-10', color: '#10B981', isNew: false },
  { id: 3, name: 'Phase de Développement', start: '2013-02-11', end: '2013-04-20', color: '#EF4444', isNew: false },
]);

// ... existing computed properties projectStart and projectEnd ...

// --- HANDLERS POUR L'AJOUT/SUPPRESSION DE TÂCHES ---

// const handleAddTask = () => {
//   // 3. Ajouter la nouvelle tâche au tableau
//   console.log(`Tâche ajoutée avec ID`);
// };
//
// const handleDeleteTask = (taskIdToRemove) => {
//   // Filtrer le tableau pour retirer la tâche avec l'ID spécifié
//   tasks.value = tasks.value.filter(t => t.id !== taskIdToRemove);
//   console.log(`Tâche supprimée avec ID: ${taskIdToRemove}`);
// };

// ... existing state and watch logic ...
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto">
    <GanttChart
        v-model:tasks="tasks"
        :startDate="projectStart"
        :endDate="projectEnd"
        class="bg-white p-4 shadow-lg rounded-lg relative"
    />

  </div>
</template>
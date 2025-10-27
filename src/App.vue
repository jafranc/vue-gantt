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

const handleAddTask = () => {
  // 1. Déterminer le prochain ID disponible
  const maxId = tasks.value.length > 0 ? Math.max(...tasks.value.map(t => t.id)) : 0;
  const newId = maxId + 1;

  // 2. Définir des dates initiales pour la nouvelle tâche (ex: un jour après la fin du projet)
  const defaultStart = new Date(projectEnd.value);
  defaultStart.setDate(defaultStart.getDate() + 1); // Start 1 day after the current end

  const defaultEnd = new Date(defaultStart);
  defaultEnd.setDate(defaultEnd.getDate() + 5); // Default duration of 5 days

  const formatDate = (date) => date.toISOString().split('T')[0];

  const newTask = {
    id: newId,
    name: `Nouvelle Tâche ${newId}`,
    start: formatDate(defaultStart),
    end: formatDate(defaultEnd),
    color: `#${Math.floor(Math.random()*16777215).toString(16)}`, // Random color
    isNew: true,
  };

  // 3. Ajouter la nouvelle tâche au tableau
  tasks.value.push(newTask);
  console.log(`Tâche ajoutée avec ID: ${newId}`);
};

const handleDeleteTask = (taskIdToRemove) => {
  // Filtrer le tableau pour retirer la tâche avec l'ID spécifié
  tasks.value = tasks.value.filter(t => t.id !== taskIdToRemove);
  console.log(`Tâche supprimée avec ID: ${taskIdToRemove}`);
};

// ... existing state and watch logic ...
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto">
    <GanttChart
        v-model:tasks="tasks"
        :startDate="projectStart"
        :endDate="projectEnd"
        @addTask="handleAddTask"       @deleteTask="handleDeleteTask" class="bg-white p-4 shadow-lg rounded-lg relative"
    />

  </div>
</template>
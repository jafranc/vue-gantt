<script setup>
import { ref, computed } from 'vue';
import GanttChart from './components/GanttChart.vue';

// --- Fonction de Calcul de Durée ---

/**
 * Calcule la durée entre les dates de début et de fin d'une tâche.
 */
function calculateDuration(task) {
  const startDate = new Date(task.start);
  const endDate = new Date(task.end);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return { days: 0, hours: 0, totalHours: 0 };
  }

  const diffMs = Math.abs(endDate.getTime() - startDate.getTime());
  const totalHours = diffMs / (1000 * 60 * 60);
  const totalDays = totalHours / 24;

  const days = Math.floor(totalDays);
  const hours = Math.round((totalDays - days) * 24);

  return {
    days: days,
    hours: hours,
    totalHours: parseFloat(totalHours.toFixed(2))
  };
}

// --- Données d'état du Projet ---
const projectStart = '2025-10-15';
const projectEnd = '2025-12-30';

// Liste réactive des tâches
const sampleTasks = ref([
  { id: 1, name: 'Analyse des Besoins', start: '2025-10-20', end: '2025-10-30', category: 'Phase 1', progress: 100, color: '#FF7F50' },
  { id: 2, name: 'Conception du Schéma', start: '2025-10-25', end: '2025-11-05', category: 'Phase 1', progress: 75, color: '#3CB371' },
  { id: 3, name: 'Développement Backend', start: '2025-11-01', end: '2025-11-25', category: 'Phase 2', progress: 40, color: '#4682B4' },
  { id: 4, name: 'Développement Frontend', start: '2025-11-10', end: '2025-12-05', category: 'Phase 2', progress: 10, color: '#DAA520' },
  { id: 5, name: 'Tests et Recette', start: '2025-12-01', end: '2025-12-20', category: 'Phase 3', progress: 0, color: '#9370DB' },
]);

// --- Gestion des événements et de l'Infobulle (Tooltip) ---
const hoveredTaskData = ref(null);
const ganttRect = ref(null);

/**
 * Gère l'événement task-hovered émis par GanttChart.vue
 * @param {{ task: Object, isHovering: boolean, x: number, y: number }} data
 */
const handleTaskHover = (data) => {
  if (data.isHovering) {
    // Stocke la tâche et les coordonnées X/Y relatives au SVG
    hoveredTaskData.value = {
      task: data.task,
      x: data.x,
      y: data.y
    };
  } else {
    hoveredTaskData.value = null;
  }
};

/**
 * Gère l'événement task-moved émis par GanttChart.vue après un drag
 * Met à jour les dates de la tâche dans l'état réactif (sampleTasks).
 * @param {{ id: number, newStart: string, newEnd: string }} movedTask
 */
const handleTaskMoved = (movedTask) => {
  const taskIndex = sampleTasks.value.findIndex(t => t.id === movedTask.id);

  if (taskIndex !== -1) {
    // Créer une nouvelle copie de l'objet tâche
    const updatedTask = {
      ...sampleTasks.value[taskIndex],
      start: movedTask.newStart,
      end: movedTask.newEnd
    };

    // Remplacer l'ancienne tâche dans l'array réactif
    // La réactivité de Vue va déclencher le re-rendu dans GanttChart
    sampleTasks.value[taskIndex] = updatedTask;

    console.log(`Tâche ${movedTask.id} déplacée vers: ${movedTask.newStart} - ${movedTask.newEnd}`);
  }
}


// Propriété calculée pour formater les données de l'infobulle
const tooltipData = computed(() => {
  if (!hoveredTaskData.value) return null;

  const task = hoveredTaskData.value.task;
  const duration = calculateDuration(task);

  return {
    name: task.name,
    dates: `${task.start} à ${task.end}`,
    duration: `${duration.days}j, ${duration.hours}h`,
    category: task.category,
    progress: task.progress ? `${task.progress}%` : '0%'
  };
});

// Propriété calculée pour positionner l'infobulle
const tooltipStyle = computed(() => {
  if (!hoveredTaskData.value) return {};

  // Marges définies dans GanttChart.vue pour les axes
  const offsetX = 50;
  const offsetY = 40;

  // Position absolue dans #gantt-container, ajustée par les marges du SVG
  return {
    left: `${hoveredTaskData.value.x + offsetX + 15}px`,
    top: `${hoveredTaskData.value.y + offsetY + 10}px`,
    opacity: 1,
    display: 'block',
  };
});
</script>

<template>
  <div class="p-6 bg-gray-50 min-h-screen">
    <h1 class="text-3xl font-bold mb-4 text-indigo-700">Vue 3 / D3 Gantt Chart</h1>
    <p class="mb-4 text-gray-600">Cliquez sur une barre pour sélectionner une tâche. Survolez-la pour voir les détails (tooltip). **Glissez les barres pour les déplacer.**</p>

    <!-- Affichage de la tâche sélectionnée -->
    <div class="mb-6 p-4 bg-white shadow rounded-lg border-l-4 border-indigo-500">
      <p class="font-medium text-sm text-gray-700">
        Dernière tâche sélectionnée :
        <span class="font-semibold text-indigo-600">
          {{ selectedTaskName || 'Aucune' }}
        </span>
      </p>
    </div>

    <!-- Conteneur principal du graphique de Gantt -->
    <div ref="ganttRect" id="gantt-container" class="relative bg-white p-4 shadow-xl rounded-xl">
      <GanttChart
          :tasks="sampleTasks"
          :start-date="projectStart"
          :end-date="projectEnd"
          @task-hovered="handleTaskHover"
          @task-moved="handleTaskMoved"
      />

      <!-- TOOLTIP (Infobulle) -->
      <div
          v-if="tooltipData"
          class="absolute z-10 p-3 text-xs bg-gray-800 text-white rounded-lg shadow-2xl transition-opacity duration-200 pointer-events-none"
          :style="tooltipStyle"
      >
        <div class="font-bold mb-1">{{ tooltipData.name }}</div>
        <div class="text-gray-400">Période: {{ tooltipData.dates }}</div>
        <div class="text-gray-400">Durée: {{ tooltipData.duration }}</div>
        <div class="text-gray-400">Progression: {{ tooltipData.progress }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Assure le positionnement relatif pour l'absolu du tooltip */
#gantt-container {
  position: relative;
  overflow: visible;
}

/* Styles de base pour le corps principal */
body {
  font-family: 'Inter', sans-serif;
}
</style>

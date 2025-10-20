<script setup>
import {hydrateOnVisible, ref, computed} from 'vue';
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
const hoveredTaskData = ref(null);

// Gestionnaire d'événement
const handleTaskSelected = (task) => {
  selectedTaskName.value = task.name;
  console.log("Tâche sélectionnée:", task.name);
};
function calculateDuration(task) {
  // 1. Convertir les entrées en objets Date pour garantir la compatibilité
  const startDate = new Date(task.start);
  const endDate = new Date(task.end);

  // Vérification de la validité des dates
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    console.error("Erreur: Les dates de début ou de fin de la tâche ne sont pas valides.");
    return { days: 0, hours: 0, totalHours: 0 };
  }

  // 2. Calculer la différence totale en millisecondes
  // Math.abs est utilisé pour s'assurer que le résultat est positif, même si les dates sont inversées.
  const diffMs = Math.abs(endDate.getTime() - startDate.getTime());

  // 3. Conversion en unités de temps

  // Total des heures
  const totalHours = diffMs / (1000 * 60 * 60);

  // Total des jours
  const totalDays = totalHours / 24;

  // Durée en jours et heures fractionnaires (pour le format Jours + Heures)
  const days = Math.floor(totalDays);
  const hours = Math.round((totalDays - days) * 24); // Reste des heures

  return {
    days: days,
    hours: hours,
    totalHours: parseFloat(totalHours.toFixed(2)) // Retourne le total des heures avec 2 décimales
  };
}
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

  // Le tooltip sera positionné par rapport à l'élément #gantt-container
  const offsetX = 50; // Marge de l'axe Y dans le SVG (50px dans GanttChart.vue)
  const offsetY = 40; // Marge du haut du SVG (40px dans GanttChart.vue)

  // Position absolue dans #gantt-container
  // hoveredTaskData.value.x et y sont relatifs au contenu D3
  return {
    // x est la coordonnée D3 + la marge de l'axe Y
    left: `${hoveredTaskData.value.x + offsetX + 15}px`,
    // y est la coordonnée D3 + la marge du haut + un léger décalage (10px)
    top: `${hoveredTaskData.value.y + offsetY + 10}px`,
    opacity: 1,
    display: 'block',
  };
});
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
          @task-hovered="handleTaskHover"
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

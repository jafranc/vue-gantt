<script setup>
import { ref, computed } from 'vue';
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

// --- 2. Logique du Tooltip (Affichage, non modification) ---
// Le tooltip est conservé ici pour pouvoir se superposer au GanttChart.
const hoveredTask = ref(null);
const tooltipPosition = ref({ x: 0, y: 0 });

const handleTaskHover = (data) => {
  if (data.isHovering) {
    hoveredTask.value = data.task;
    tooltipPosition.value = { x: data.x, y: data.y };
  } else {
    hoveredTask.value = null;
  }
};

const tooltipStyle = computed(() => ({
  position: 'absolute',
  left: `${tooltipPosition.value.x}px`,
  top: `${tooltipPosition.value.y}px`,
  // Légers décalages pour ne pas masquer le curseur
  transform: 'translateY(-100%) translateX(-50%)',
  pointerEvents: 'none',
}));

// Calcule la durée en jours entre deux dates (intervalle inclusif)
const getDurationInDays = (start, end) => {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (startDate.getTime() > endDate.getTime()) return 0;
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

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
          @task-hovered="handleTaskHover"
      />

      <!-- Tooltip pour le survol -->
      <div v-if="hoveredTask"
           :style="tooltipStyle"
           class="bg-gray-800 text-white text-xs p-2 rounded-lg shadow-xl opacity-90 transition duration-150 z-40">
        <div class="font-bold mb-1">{{ hoveredTask.name }}</div>
        <div>Début: {{ hoveredTask.start }}</div>
        <div>Fin: {{ hoveredTask.end }}</div>
        <div class="mt-1 font-medium">Durée: {{ getDurationInDays(hoveredTask.start, hoveredTask.end) }} jours</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Styles spécifiques pour App.vue (minimal) */
</style>
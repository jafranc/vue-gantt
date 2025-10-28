<script setup>
import { ref, watch, onMounted, computed, nextTick } from 'vue';
import * as d3 from 'd3';

// L'événement taskUpdated est utilisé pour les changements de dates/contenu
// L'événement updateTasksOrder est utilisé pour la réorganisation verticale
const emit = defineEmits(['taskUpdated', 'updateTasksOrder']);

const props = defineProps({
  // tasks is the primary data source
  tasks: { type: Array, default: () => [] },
  startDate: { type: String, default: '2012-12-12' },
  endDate: { type: String, default: '2013-12-13' },
});

// --- CONSTANTES DE COMPRESSION DU TEMPS ---
const MIN_GAP_DAYS_TO_COMPRESS = 30; // Seuil: Les écarts de plus de 30 jours seront compressés
const COMPRESSED_VISUAL_DAYS = 5;    // Longueur visuelle (en 'jours') pour un écart compressé

// --- État Interne ---
const localTasks = ref([]);
const selectedCategory = ref('All');
const categoryColors = ref(new Map());
const isCategoryEditable = ref(false);

const colorPalette = [
  '#4F46E5', '#10B981', '#EF4444', '#F59E0B', '#06B6D4',
  '#6366F1', '#EC4899', '#1D4ED8', '#D97706',
];

const initializeCategoryColors = (tasks) => {
  const categories = new Set();
  tasks.forEach(t => {
    const category = t.category || 'Uncategorized';
    categories.add(category);
    if (!categoryColors.value.has(category)) {
      const assignedColors = Array.from(categoryColors.value.values());
      let newColor = colorPalette.find(c => !assignedColors.includes(c));
      if (!newColor) {
        const index = (categories.size - 1) % colorPalette.length;
        newColor = colorPalette[index] || '#9CA3AF';
      }
      categoryColors.value.set(category, newColor);
    }
  });
  categoryColors.value.forEach((_, category) => {
    if (!categories.has(category)) {
      categoryColors.value.delete(category);
    }
  });
};

const getCategoryColor = (categoryName) => {
  return categoryColors.value.get(categoryName) || '#9CA3AF';
};

const uniqueCategories = computed(() => {
  const categories = new Set();
  localTasks.value.forEach(t => {
    categories.add(t.category || 'Uncategorized');
  });
  return Array.from(categories).sort();
});

const availableCategories = computed(() => {
  return ['All', ...uniqueCategories.value];
});

const ganttContainer = ref(null);
const availableWidth = ref(0);
const margin = { top: 40, right: 20, bottom: 30, left: 50 };
const isDragging = ref(false);
const editingTask = ref(null);

// --- Fonctions utilitaires de Durée et de Date ---
const getDurationInDays = (start, end) => {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (startDate.getTime() > endDate.getTime()) return 0;
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

const addDaysToDate = (dateStr, days) => {
  if (!dateStr || days <= 0) return dateStr;
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days - 1);
  return d3.timeFormat('%Y-%m-%d')(date);
};

const formatDate = (date) => date.toISOString().split('T')[0];

const filteredTasks = computed(() => {
  if (selectedCategory.value === 'All') {
    return localTasks.value;
  }
  return localTasks.value.filter(t => (t.category || 'Uncategorized') === selectedCategory.value);
});

const height = computed(() => Math.max(150, filteredTasks.value.length * 40 + margin.top + margin.bottom));

// --- NOUVEAU: Logique de Compression du Temps ---

/**
 * Calcule les segments de temps actifs (tâches) et les segments d'écart compressés.
 * Le domaine d'échelle sera basé sur la somme des 'visualDays'.
 */
const timeSegments = computed(() => {
  // Les tâches filtrées doivent être triées pour la compression
  const sortedTasks = filteredTasks.value.slice().sort((a, b) => new Date(a.start) - new Date(b.start));

  if (sortedTasks.length === 0) return { segments: [], totalVisualDays: 0 };

  const segments = [];
  let totalVisualDays = 0;
  // Démarre la vérification des écarts après la date de début du projet/première tâche
  let previousEnd = new Date(sortedTasks[0].start);

  sortedTasks.forEach((task, index) => {
    const currentStart = new Date(task.start);
    const currentEnd = new Date(task.end);

    // --- 1. Gestion de l'écart (Gap) ---
    // Vérifier l'écart entre la fin de la tâche précédente (ou début du projet) et le début de la tâche actuelle
    if (index > 0 || new Date(props.startDate).getTime() < currentStart.getTime()) {
      // Pour la première tâche, previousEnd est sa propre date de début, donc on utilise props.startDate
      const gapStart = index === 0 ? new Date(props.startDate) : previousEnd;

      const gapDurationMs = currentStart.getTime() - gapStart.getTime();
      // On compte le nombre de jours entiers entre les deux dates.
      const actualGapDays = Math.floor(gapDurationMs / (1000 * 60 * 60 * 24));

      if (actualGapDays > 0) {
        if (actualGapDays > MIN_GAP_DAYS_TO_COMPRESS) {
          // Écart compressé
          totalVisualDays += COMPRESSED_VISUAL_DAYS;
          segments.push({
            isGap: true,
            start: gapStart,
            end: currentStart,
            actualDays: actualGapDays,
            visualDays: COMPRESSED_VISUAL_DAYS,
            label: `...${actualGapDays}j`,
          });
        } else {
          // Écart normal
          totalVisualDays += actualGapDays;
          segments.push({
            isGap: true,
            start: gapStart,
            end: currentStart,
            actualDays: actualGapDays,
            visualDays: actualGapDays,
          });
        }
      }
    }

    // --- 2. Ajout du segment de tâche (Task) ---
    const taskDurationDays = getDurationInDays(task.start, task.end);
    totalVisualDays += taskDurationDays;
    segments.push({
      isTask: true,
      start: currentStart,
      end: currentEnd,
      visualDays: taskDurationDays,
    });

    previousEnd = currentEnd;
  });

  return { segments, totalVisualDays };
});


/**
 * Mappe une Date réelle à une position sur le domaine compressé (nombre de jours visuels)
 * C'est l'équivalent de l'échelle temporelle compressée.
 * @param {Date} date - La date réelle à mapper.
 * @returns {number} La position sur le domaine de l'échelle linéaire (en 'jours visuels').
 */
const mapDateToVisualDays = (date) => {
  let visualDays = 0;
  const targetTime = date.getTime();

  for (const segment of timeSegments.value.segments) {
    const segmentStart = segment.start.getTime();
    const segmentEnd = segment.end.getTime();

    if (segment.isTask) {
      if (targetTime >= segmentStart && targetTime <= segmentEnd) {
        // La date est dans le segment de tâche : utilise l'échelle linéaire normale
        const daysInSegment = Math.floor((targetTime - segmentStart) / (1000 * 60 * 60 * 24));
        return visualDays + daysInSegment;
      }
      // Si la date est après le segment, ajoute la durée visuelle du segment et continue
      visualDays += segment.visualDays;

    } else if (segment.isGap) {
      if (targetTime > segmentStart && targetTime < segmentEnd) {
        // La date est dans un segment d'écart : elle est compressée
        // On retourne la position visuelle au début de l'écart + 1 jour visuel
        return visualDays + 1;
      }
      // Si la date est après l'écart, ajoute la durée visuelle de l'écart et continue
      visualDays += segment.visualDays;
    }
    // Si la date est avant tous les segments, elle est à 0.
  }

  // Si après tous les segments, retourne la fin
  return visualDays;
};

// --- FIN de la Logique de Compression du Temps ---

// --- CRUD simplifiée (méthodes existantes) ---
const reorderTasksByStartDate = () => { /* ... (logic remains the same) ... */ };
const addTask = () => { /* ... (logic remains the same) ... */ };
const removeLastTask = () => { /* ... (logic remains the same) ... */ };
const handleTaskMoved = (movedTask) => { /* ... (logic remains the same) ... */ };
const handleContextMenu = (task) => { /* ... (logic remains the same) ... */ };
const saveDates = () => { /* ... (logic remains the same) ... */ };

// --- Échelles D3 MODIFIÉES ---
const xScale = ref(null);
const yScale = ref(null);

const setupScales = (width) => {
  const range = [0, width - margin.left - margin.right];

  // X-Scale: Utilisation de d3.scaleLinear() pour les 'Visual Days'
  const totalVisualDays = timeSegments.value.totalVisualDays;

  xScale.value = d3.scaleLinear()
      .domain([0, totalVisualDays])
      .range(range);

  // Y-Scale DOMAIN utilise MAINTENANT les tâches FILTRÉES
  yScale.value = d3.scaleBand()
      .domain(Array.isArray(filteredTasks.value) ? filteredTasks.value.map(t => t.name) : [])
      .range([0, filteredTasks.value.length * 40])
      .paddingInner(0.1);
};


// --- Rendu D3 avec Compression du Temps ---
const renderChart = () => {
  if (!ganttContainer.value) return;

  availableWidth.value = ganttContainer.value.clientWidth;
  const width = availableWidth.value;

  setupScales(width);

  const svgContent = d3.select(ganttContainer.value);
  svgContent.selectAll('*').remove();

  const svg = svgContent.append('svg')
      .attr('width', width)
      .attr('height', height.value);

  const g = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);


  // --- Rendu des Axes ---
  // L'axe X est maintenant basé sur les 'Visual Days', son formatage doit être CUSTOM
  // pour afficher les VRAIES dates.
  const customAxis = d3.axisBottom(xScale.value)
      .tickValues(timeSegments.value.segments
          .filter(s => s.isTask)
          .map(s => mapDateToVisualDays(s.start)) // Ticks au début de chaque tâche
          .filter((v, i, a) => a.indexOf(v) === i)
      )
      .tickFormat(d => {
        // Cette inversion est extrêmement difficile, pour cette démo, on trouve la date
        // la plus proche du "jour visuel" pour l'affichage (approximation)
        // En prod, il faudrait une fonction d'inversion complète.
        const segment = timeSegments.value.segments.find(s => d >= mapDateToVisualDays(s.start) && d <= mapDateToVisualDays(s.end));
        if (segment && segment.isTask) {
          const daysOffset = d - mapDateToVisualDays(segment.start);
          const date = new Date(segment.start);
          date.setDate(date.getDate() + daysOffset);
          return d3.timeFormat('%Y-%m-%d')(date);
        }
        return '...'; // Les ticks dans les zones de compression/non mappées
      });

  g.append('g')
      .attr('transform', `translate(0, ${filteredTasks.value.length * 40 || 50})`)
      .call(customAxis);

  g.append('g')
      .attr('class', 'y-axis-g')
      .call(d3.axisLeft(yScale.value));

  if (!filteredTasks.value.length) return;

  // --- Rendu des Barres de Tâches ---
  filteredTasks.value.forEach((task) => {
    // 1. Utiliser mapDateToVisualDays pour trouver les positions X en 'jours visuels'
    const xStartVisualDays = mapDateToVisualDays(new Date(task.start));
    const xEndVisualDays = mapDateToVisualDays(new Date(task.end));

    // 2. Utiliser xScale (linéaire) pour mapper les jours visuels aux pixels
    const xStart = xScale.value(xStartVisualDays);
    const xEnd = xScale.value(xEndVisualDays);
    const width = xEnd - xStart;
    const yPos = yScale.value(task.name);

    const barColor = getCategoryColor(task.category || 'Uncategorized');

    // Groupe de tâches (sans glissement pour éviter la complexité de l'inversion d'échelle)
    const taskGroup = g.append('g')
        .datum(task)
        .attr('class', 'task-group')
        .on('contextmenu', function(event) {
          event.preventDefault();
          event.stopPropagation();
          handleContextMenu(task);
        });

    const rect = taskGroup.append('rect')
        .attr('x', xStart)
        .attr('y', yPos)
        .attr('width', width)
        .attr('height', yScale.value.bandwidth())
        .attr('fill', barColor)
        .attr('rx', 4)
        .style('cursor', 'pointer'); // Glissement désactivé

    taskGroup.append("text")
        .text(d => d.name)
        .attr("x", xStart + 5)
        .attr("y", yPos + yScale.value.bandwidth() / 2 + 5)
        .attr("fill", "black")
        .style("pointer-events", "none")
        .style("font-size", "12px");
  });

  // --- Rendu des Segments d'Écart ---
  timeSegments.value.segments.filter(s => s.isGap && s.label).forEach(gap => {
    const xStartVisualDays = mapDateToVisualDays(gap.start);
    const xEndVisualDays = mapDateToVisualDays(gap.end);

    const xStart = xScale.value(xStartVisualDays);
    const xEnd = xScale.value(xEndVisualDays);
    const width = xEnd - xStart;

    // Zone grisée pour l'écart
    g.append('rect')
        .attr('x', xStart)
        .attr('y', 0)
        .attr('width', width)
        .attr('height', filteredTasks.value.length * 40)
        .attr('fill', '#E5E7EB') // Gris clair
        .attr('opacity', 0.6);

    // Indicateur de compression
    g.append('text')
        .text(gap.label)
        .attr('x', xStart + width / 2)
        .attr('y', filteredTasks.value.length * 40 / 2 + 5)
        .attr('text-anchor', 'middle')
        .attr('fill', '#9CA3AF')
        .style('font-size', '10px');
  });

};

// --- Hooks et Watchers (inchangés) ---

watch(() => props.tasks, (newTasks) => {
  if (Array.isArray(newTasks)) {
    const currentIds = localTasks.value.map(t => t.id).join(',');
    const newIds = newTasks.map(t => t.id).join(',');

    if (currentIds !== newIds || newTasks.length !== localTasks.value.length) {
      localTasks.value = newTasks.map(t => ({ ...t }));
      initializeCategoryColors(localTasks.value);
      renderChart();
    } else {
      localTasks.value = newTasks.map(t => ({ ...t }));
      initializeCategoryColors(localTasks.value);
      renderChart();
    }
  } else {
    localTasks.value = [];
    initializeCategoryColors([]);
    renderChart();
  }
}, { immediate: true, deep: true });

onMounted(() => {
  renderChart();
  window.addEventListener('resize', renderChart);
});

// Watch the local tasks, the effective dates, AND the internal selectedCategory to re-render the chart
// timeSegments est automatiquement pris en compte car il dépend de localTasks et filteredTasks (via selectedCategory)
watch([localTasks, selectedCategory], renderChart, { deep: true });
</script>

<template>
  <div class="gantt-wrapper relative w-full">

    <div class="absolute top-0 right-0 z-10 flex space-x-2 items-center mr-2">

      <button @click="reorderTasksByStartDate"
              class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-3 rounded-md shadow-lg transition duration-150 text-sm flex items-center space-x-1"
              title="Trier les tâches par date de début">
        <span>Ordre par date</span>
      </button>

      <div class="flex items-center space-x-2">
        <label for="categoryFilter" class="text-sm font-medium text-gray-700">Filtrer par:</label>
        <select id="categoryFilter"
                v-model="selectedCategory"
                class="p-1 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm">
          <option v-for="category in availableCategories" :key="category" :value="category">
            {{ category }}
          </option>
        </select>
      </div>

      <button @click="addTask"
              class="bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-2 rounded-full shadow-lg transition duration-150 text-lg leading-none w-8 h-8 flex items-center justify-center"
              title="Ajouter une nouvelle tâche (copie de la dernière)">
        +
      </button>

      <button @click="removeLastTask"
              :disabled="localTasks.length === 0"
              class="bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white font-bold py-1 px-2 rounded-full shadow-lg transition duration-150 text-lg leading-none w-8 h-8 flex items-center justify-center"
              title="Supprimer la dernière tâche (ID max)">
        &minus;
      </button>
    </div>

    <div ref="ganttContainer" class="relative w-full overflow-x-auto">
      <div v-if="filteredTasks.length === 0 && localTasks.length > 0" class="absolute inset-0 flex items-center justify-center bg-gray-50/50 z-20">
        <p class="text-xl font-semibold text-gray-600 p-4 bg-white rounded-lg shadow-lg">
          Aucune tâche ne correspond au filtre '{{ selectedCategory }}'.
        </p>
      </div>
      <div v-else-if="localTasks.length === 0" class="absolute inset-0 flex items-center justify-center bg-gray-50/50 z-20">
        <p class="text-xl font-semibold text-gray-600 p-4 bg-white rounded-lg shadow-lg">
          Le tableau de tâches est vide. Utilisez '+' pour commencer !
        </p>
      </div>
    </div>

    <div>
      <p class="text-xs text-blue-500 font-medium mt-2">
        (CONSEIL: La vue utilise maintenant la **compression temporelle** pour masquer les longues périodes d'inactivité. Le glissement et le redimensionnement sont **désactivés** dans ce mode.)
      </p>
    </div>

    <div v-if="editingTask"
         :style="editingFormStyle"
         class="gantt-edit-form p-4 border border-blue-400 rounded-lg shadow-xl flex flex-col space-y-2 z-50">
    </div>
  </div>
</template>

<style scoped>
.dragging {
  opacity: 0.7;
  filter: brightness(1.2);
}
.gantt-edit-form {
  box-sizing: border-box;
  background-color: rgba(255, 255, 255, 0.95);
}
.g text {
  font-size: 10px;
}
.task-group {
  /* Glissement vertical toujours possible si le filtre est désactivé */
  transform-origin: 0 0;
}
</style>
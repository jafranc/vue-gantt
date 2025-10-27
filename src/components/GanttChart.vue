<script setup>
import { ref, watch, onMounted, computed, nextTick } from 'vue';
import * as d3 from 'd3';

// CORRECTION: Changement de 'task-moved' à 'taskUpdated'
const emit = defineEmits(['taskUpdated']);

const props = defineProps({
  // tasks is the primary data source
  tasks: { type: Array, default: () => [] },
  // These props are now effectively ignored for scale calculation, but kept for interface consistency
  startDate: { type: String, default: '2012-12-12' },
  endDate: { type: String, default: '2013-12-13' },
});

// L'état principal des tâches est conservé localement
const localTasks = ref([]);

const ganttContainer = ref(null);
const availableWidth = ref(0);
const margin = { top: 40, right: 20, bottom: 30, left: 50 };
const height = computed(() => Math.max(150, localTasks.value.length * 40 + margin.top + margin.bottom));
const isDragging = ref(false);
const editingTask = ref(null);

// --- Logique interne du Tooltip ---
const hoveredTask = ref(null);
const tooltipPosition = ref({ x: 0, y: 0 });

const tooltipStyle = computed(() => ({
  position: 'absolute',
  left: `${tooltipPosition.value.x}px`,
  top: `${tooltipPosition.value.y}px`,
  // Légers décalages pour ne pas masquer le curseur
  transform: 'translateY(-100%) translateX(-50%)',
  pointerEvents: 'none',
}));


// --- Fonctions utilitaires de Durée et de Date ---
// Calcule la durée en jours entre deux dates (intervalle inclusif)
const getDurationInDays = (start, end) => {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (startDate.getTime() > endDate.getTime()) return 0;
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

// Ajoute un certain nombre de jours à une date (soustrait 1 jour pour l'intervalle inclusif)
const addDaysToDate = (dateStr, days) => {
  if (!dateStr || days <= 0) return dateStr;
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days - 1);
  return d3.timeFormat('%Y-%m-%d')(date);
};

// --- CALCUL DES ÉCHELLES DYNAMIQUES ---
// Calcule la date de début la plus précoce parmi toutes les tâches
const effectiveStartDate = computed(() => {
  if (localTasks.value.length === 0) return new Date(props.startDate); // Fallback to prop default

  const dates = localTasks.value.map(t => new Date(t.start));
  return new Date(Math.min(...dates));
});

// Calcule la date de fin la plus tardive parmi toutes les tâches, avec un tampon
const effectiveEndDate = computed(() => {
  if (localTasks.value.length === 0) return new Date(props.endDate); // Fallback to prop default

  const dates = localTasks.value.map(t => new Date(t.end));
  const maxDate = new Date(Math.max(...dates));

  // Ajout d'un tampon (par exemple, 10 jours) pour l'espace visuel
  maxDate.setDate(maxDate.getDate() + 10);

  return maxDate;
});

// --- Logique de Mise à Jour Interne (handleTaskMoved) ---
const handleTaskMoved = (movedTask) => {
  const taskIndex = localTasks.value.findIndex(t => t.id === movedTask.id);

  if (taskIndex !== -1) {
    const updatedTask = {
      ...localTasks.value[taskIndex],
      start: movedTask.newStart,
      end: movedTask.newEnd,
    };

    const newTasks = [...localTasks.value];
    newTasks[taskIndex] = updatedTask;

    // 1. Mise à jour de l'état local pour le rendu D3
    localTasks.value = newTasks;

    // 2. Émission de l'objet de tâche complet mis à jour
    // CORRECTION: Utilisation de 'taskUpdated'
    emit('taskUpdated', localTasks.value);
  }
};


// --- Fonctions d'édition/Glissement ---

const displayDurationInDays = computed(() => {
  if (!editingTask.value) return 0;
  return getDurationInDays(editingTask.value.start, editingTask.value.end);
});

const editingFormStyle = computed(() => {
  if (!editingTask.value || !editingTask.value.x || !editingTask.value.y) return {};

  const xOffset = margin.left;

  return {
    position: 'absolute',
    left: `${editingTask.value.x + xOffset}px`,
    top: `${editingTask.value.y + margin.top + 5}px`,
    transform: 'translateX(-50%)',
    zIndex: 30,
    minWidth: '320px',
  };
});

const xScale = ref(null);
const yScale = ref(null);

const handleDblClick = (task) => {
  if (isDragging.value || editingTask.value) return;

  // Assurez-vous que les échelles sont définies avant de calculer les positions
  if (!xScale.value || !yScale.value) return;

  const xPos = xScale.value(new Date(task.start));
  const yPos = yScale.value(task.name);

  editingTask.value = {
    id: task.id,
    name: task.name,
    start: task.start,
    end: task.end,
    durationDays: getDurationInDays(task.start, task.end),
    x: xPos,
    y: yPos,
  };

  nextTick(() => {
    // Tente de cibler n'importe quel input dans le formulaire d'édition
    const inputElement = document.querySelector('.gantt-edit-form input');
    if (inputElement) {
      inputElement.focus();
    }
  });
};

watch(() => editingTask.value?.durationDays, (newDuration, oldDuration) => {
  if (editingTask.value && newDuration && newDuration !== oldDuration) {
    editingTask.value.end = addDaysToDate(editingTask.value.start, newDuration);
  }
});

watch(() => editingTask.value?.start, (newStart, oldStart) => {
  if (editingTask.value && newStart && newStart !== oldStart) {
    // Met à jour la date de fin et la durée
    editingTask.value.durationDays = getDurationInDays(newStart, editingTask.value.end);
  }
  // Mettre à jour la date de fin (nécessaire si seule la date de début est modifiée)
  if (editingTask.value && newStart) {
    editingTask.value.end = addDaysToDate(newStart, editingTask.value.durationDays);
  }
});

const saveDates = () => {
  const { id, name, start, end } = editingTask.value;

  const newStart = new Date(start);
  const newEnd = new Date(end);

  if (newStart.getTime() >= newEnd.getTime()) {
    console.error("La date de début doit être strictement antérieure à la date de fin.");
    // Remplacer l'alerte par une notification UI dans un vrai projet
    alert("Erreur: La date de début doit être antérieure à la date de fin.");
    return;
  }

  // Le formulaire d'édition utilise handleTaskMoved, qui émettra la tâche mise à jour.
  handleTaskMoved({
    id,
    name,
    newStart: start,
    newEnd: end,
  });

  editingTask.value = null;
};

// --- Échelles D3 ---
const setupScales = (width) => {
  // Utilisation des dates effectives calculées
  const start = effectiveStartDate.value;
  const end = effectiveEndDate.value;

  xScale.value = d3.scaleTime()
      .domain([start, end])
      .range([0, width - margin.left - margin.right]);

  yScale.value = d3.scaleBand()
      .domain(Array.isArray(localTasks.value) ? localTasks.value.map(t => t.name) : [])
      .range([0, localTasks.value.length * 40])
      .paddingInner(0.1);
};

// --- Rendu D3 ---
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

  // Rendu des axes
  g.append('g')
      .attr('transform', `translate(0, ${localTasks.value.length * 40 || 50})`)
      .call(d3.axisBottom(xScale.value));

  g.append('g')
      .call(d3.axisLeft(yScale.value));

  if (!localTasks.value.length) return;

  const dragHandler = d3.drag()
      .on('start', function(event, d) {
        isDragging.value = false;
        d3.select(this).raise().classed('dragging', true);
      })
      .on('drag', function(event, d) {
        isDragging.value = true;
        const newX = event.x;
        d3.select(this).attr('x', newX);
      })
      .on('end', function(event, d) {
        d3.select(this).classed('dragging', false);

        if (isDragging.value) {
          const newStartDate = xScale.value.invert(event.x);
          const originalDuration = new Date(d.end).getTime() - new Date(d.start).getTime();
          const newEndDate = new Date(newStartDate.getTime() + originalDuration);

          const newStartFormatted = d3.timeFormat('%Y-%m-%d')(newStartDate);
          const newEndFormatted = d3.timeFormat('%Y-%m-%d')(newEndDate);

          handleTaskMoved({
            id: d.id,
            name: d.name,
            newStart: newStartFormatted,
            newEnd: newEndFormatted,
          });
        }
        isDragging.value = false;
      });

  localTasks.value.forEach((task) => {
    const xStart = xScale.value(new Date(task.start));
    const xEnd = xScale.value(new Date(task.end));
    const width = xEnd - xStart;
    const yPos = yScale.value(task.name);

    const rect = g.append('rect')
        .datum(task)
        .attr('x', xStart)
        .attr('y', yPos)
        .attr('width', width)
        .attr('height', yScale.value.bandwidth())
        .attr('fill', task.color)
        .attr('rx', 4)
        .style('cursor', 'grab')
        .on('mouseenter', (event, d) => {
          const [x, y] = d3.pointer(event);
          hoveredTask.value = d;
          tooltipPosition.value = { x: x + margin.left, y: y + margin.top };
          d3.select(event.currentTarget).style('filter', 'brightness(1.1)');
        })
        .on('mouseleave', (event) => {
          hoveredTask.value = null;
          d3.select(event.currentTarget).style('filter', 'none');
        })
        .on('dblclick', function(event) {
          handleDblClick(task, event);
        });

    dragHandler(rect);
  });

  g.selectAll(".task-label")
      .data(localTasks.value)
      .enter()
      .append("text")
      .text(d => d.name)
      .attr("x", d => xScale.value(new Date(d.start)) + 5)
      .attr("y", d => yScale.value(d.name) + yScale.value.bandwidth() / 2 + 5)
      .attr("fill", "black")
      .style("pointer-events", "none")
      .style("font-size", "12px");
};

// --- Hooks et Watchers ---

watch(() => props.tasks, (newTasks) => {
  if (Array.isArray(newTasks)) {
    localTasks.value = newTasks.map(t => ({ ...t }));
    renderChart();
  } else {
    localTasks.value = [];
    renderChart();
  }
}, { immediate: true, deep: true });

onMounted(() => {
  renderChart();
  window.addEventListener('resize', renderChart);
});

// Watch the local tasks and the effective dates to re-render the chart
watch([() => localTasks.value, effectiveStartDate, effectiveEndDate], renderChart, { deep: true });

</script>

<template>
  <div class="gantt-wrapper relative w-full">
    <div ref="ganttContainer" class="relative w-full overflow-x-auto">
    </div>

    <div>
      <p>Debug (Dates calculées):</p>
      <p>Début: {{ d3.timeFormat('%Y-%m-%d')(effectiveStartDate) }} | Fin: {{ d3.timeFormat('%Y-%m-%d')(effectiveEndDate) }}</p>
    </div>

    <div v-if="hoveredTask"
         :style="tooltipStyle"
         class="bg-gray-800 text-white text-xs p-2 rounded-lg shadow-xl opacity-90 transition duration-150 z-40">
      <div class="font-bold mb-1">{{ hoveredTask.name }}</div>
      <div>Début: {{ hoveredTask.start }}</div>
      <div>Fin: {{ hoveredTask.end }}</div>
      <div class="mt-1 font-medium">Durée: {{ getDurationInDays(hoveredTask.start, hoveredTask.end) }} jours</div>
    </div>

    <div v-if="editingTask"
         :style="editingFormStyle"
         class="gantt-edit-form p-4 border border-blue-400 rounded-lg shadow-xl flex flex-col space-y-2 z-50">
      <div class="text-sm font-semibold text-gray-700 mb-2">Éditer: {{ editingTask.name }}</div>

      <label class="text-xs font-medium text-gray-600">
        Durée (jours):
        <input type="number"
               v-model.number="editingTask.durationDays"
               min="1"
               class="mt-1 p-1 border rounded-md w-full text-sm focus:ring-blue-500 focus:border-blue-500" />
      </label>

      <hr class="border-gray-200 my-1">

      <label class="text-xs font-medium text-gray-600">
        Début:
        <input type="date" v-model="editingTask.start"
               class="mt-1 p-1 border rounded-md w-full text-sm focus:ring-blue-500 focus:border-blue-500" />
      </label>

      <label class="text-xs font-medium text-gray-600">
        Fin:
        <input type="date" v-model="editingTask.end"
               class="mt-1 p-1 border rounded-md w-full text-sm focus:ring-blue-500 focus:border-blue-500" />
      </label>

      <div class="mt-3 flex justify-between items-center">
            <span class="text-xs font-bold text-blue-600">
                Durée effective: {{ displayDurationInDays }} j.
            </span>
      </div>

      <button @click="saveDates"
              class="bg-blue-600 hover:bg-blue-700 text-gray-500 text-xs font-bold py-1 px-3 rounded-md transition duration-150">
        Valider
      </button>
      <button @click="editingTask = null" class="absolute top-1 right-1 text-gray-500 hover:text-gray-800 text-xs">
        &times;
      </button>
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
</style>
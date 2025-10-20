<script setup>
import { ref, watch, onMounted, computed, nextTick } from 'vue';
import * as d3 from 'd3';

const props = defineProps({
  tasks: Array,
  startDate: String,
  endDate: String,
});

const emit = defineEmits(['task-hovered', 'task-moved']);

const ganttContainer = ref(null);
const availableWidth = ref(0);
const margin = { top: 40, right: 20, bottom: 30, left: 50 };
const height = computed(() => props.tasks.length * 40 + margin.top + margin.bottom);
const isDragging = ref(false); // Flag pour éviter le clic après le drag

// --- Fonctions utilitaires de Durée (Déplacées ici pour la réutilisation) ---

// Calcule la durée en jours entre deux dates (intervalle inclusif)
const getDurationInDays = (start, end) => {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (startDate.getTime() > endDate.getTime()) return 0;
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  // Ajoute +1 jour pour inclure les jours de début et de fin
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

// Ajoute un certain nombre de jours à une date (soustrait 1 jour pour l'intervalle inclusif)
const addDaysToDate = (dateStr, days) => {
  if (!dateStr || days <= 0) return dateStr;
  const date = new Date(dateStr);
  // days - 1 car la durée de 1 jour (ex: 1er au 1er) est une différence de 0 jour.
  date.setDate(date.getDate() + days - 1);
  return d3.timeFormat('%Y-%m-%d')(date);
};

// --- État d'Édition de Tâche (CONSOLIDÉ) ---
// Contient les métadonnées (x, y), les dates (start, end) ET la durée (durationDays)
const editingTask = ref(null);

// Durée calculée à afficher (se met à jour quand start ou end changent)
const displayDurationInDays = computed(() => {
  if (!editingTask.value) return 0;
  return getDurationInDays(editingTask.value.start, editingTask.value.end);
});

// Style du formulaire d'édition (positionné absolument sur la barre)
const editingFormStyle = computed(() => {
  // Nécessite l'existence de la tâche ET de ses coordonnées
  if (!editingTask.value || !editingTask.value.x || !editingTask.value.y) return {};

  // Les coordonnées x et y sont relatives au SVG.
  const xOffset = margin.left;

  return {
    position: 'absolute',
    left: `${editingTask.value.x + xOffset}px`,
    top: `${editingTask.value.y + margin.top + 5}px`, // Place sous la barre
    transform: 'translateX(-50%)',
    zIndex: 30,
    minWidth: '320px', // Agrandir le formulaire pour les 3 champs
  };
});

// --- Gestionnaire de Double-Clic ---
const handleDblClick = (task, event) => {
  const xPos = xScale.value(new Date(task.start));
  const yPos = yScale.value(task.name);

  // CONSOLIDATION: Toutes les données nécessaires sont stockées ici.
  editingTask.value = {
    id: task.id,
    name: task.name,
    start: task.start,
    end: task.end,
    // Initialiser la durée à partir des dates actuelles
    durationDays: getDurationInDays(task.start, task.end),
    x: xPos,
    y: yPos,
  };

  // Met le focus sur le premier champ de saisie
  nextTick(() => {
    document.querySelector('.gantt-edit-form input').focus();
  });
};

// --- Watcher pour la durée ---
watch(() => editingTask.value?.durationDays, (newDuration, oldDuration) => {
  // S'assure que nous ne sommes pas en mode initialisation et que la durée est valide
  if (editingTask.value && newDuration && newDuration !== oldDuration) {
    // La modification de la durée recalcule la date de fin
    editingTask.value.end = addDaysToDate(editingTask.value.start, newDuration);
  }
});

// --- Watcher pour la date de début ---
watch(() => editingTask.value?.start, (newStart, oldStart) => {
  // Si la date de début change, la date de fin est recalculee
  if (editingTask.value && newStart && newStart !== oldStart) {
    editingTask.value.end = addDaysToDate(newStart, editingTask.value.durationDays);
  }
});

// --- Logique de Sauvegarde (Submit) ---
const saveDates = () => {
  const { id, name, start, end } = editingTask.value;

  // Validation simple
  const newStart = new Date(start);
  const newEnd = new Date(end);

  if (newStart.getTime() >= newEnd.getTime()) { // Utilise >= pour éviter les chevauchements ou durée nulle
    console.error("La date de début doit être strictement antérieure à la date de fin.");
    alert("La date de début doit être strictement antérieure à la date de fin.");
    return;
  }

  emit('task-moved', {
    id,
    name,
    newStart: start,
    newEnd: end,
  });

  // Ferme le formulaire d'édition
  editingTask.value = null;
};

// --- Échelles D3 (restent inchangées) ---
const xScale = ref(null);
const yScale = ref(null);

const setupScales = (width) => {
  const start = new Date(props.startDate);
  const end = new Date(props.endDate);

  xScale.value = d3.scaleTime()
      .domain([start, end])
      .range([0, width - margin.left - margin.right]);

  yScale.value = d3.scaleBand()
      .domain(props.tasks.map(t => t.name))
      .range([0, props.tasks.length * 40])
      .paddingInner(0.1);
};

// --- Rendu D3 (reste inchangé) ---
const renderChart = () => {
  if (!props.tasks.length || !ganttContainer.value) return;

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

  g.append('g')
      .attr('transform', `translate(0, ${props.tasks.length * 40})`)
      .call(d3.axisBottom(xScale.value));

  g.append('g')
      .call(d3.axisLeft(yScale.value));

  const dragHandler = d3.drag()
      .on('start', function(event, d) {
        isDragging.value = false;
        d3.select(this).raise().classed('dragging', true);
        console.log(`DRAG START: Tentative de glisser la tâche: ${d.name}`);
      })
      .on('drag', function(event, d) {
        isDragging.value = true;
        const newX = event.x;
        d3.select(this).attr('x', newX);
        console.log(`DRAG: Position X: ${newX}`);
      })
      .on('end', function(event, d) {
        d3.select(this).classed('dragging', false);

        if (isDragging.value) {
          const newStartDate = xScale.value.invert(event.x);
          const originalDuration = new Date(d.end).getTime() - new Date(d.start).getTime();
          const newEndDate = new Date(newStartDate.getTime() + originalDuration);

          const newStartFormatted = d3.timeFormat('%Y-%m-%d')(newStartDate);
          const newEndFormatted = d3.timeFormat('%Y-%m-%d')(newEndDate);

          console.log(`DRAG END: Nouvelle date de début calculée: ${newStartFormatted}`);

          emit('task-moved', {
            id: d.id,
            name: d.name,
            newStart: newStartFormatted,
            newEnd: newEndFormatted,
          });
        }
        isDragging.value = false;
      });

  props.tasks.forEach((task) => {
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
        .on('mouseenter', (event) => {
          const [x, y] = d3.pointer(event);
          emit('task-hovered', { task: task, isHovering: true, x: x + margin.left, y: y + margin.top });
          d3.select(event.currentTarget).style('filter', 'brightness(1.1)');
        })
        .on('mouseleave', (event) => {
          emit('task-hovered', { task: task, isHovering: false });
          d3.select(event.currentTarget).style('filter', 'none');
        })
        .on('dblclick', function(event) {
          handleDblClick(task, event);
        });

    dragHandler(rect);
  });

  g.selectAll(".task-label")
      .data(props.tasks)
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
onMounted(() => {
  window.addEventListener('resize', renderChart);
  renderChart();
});

watch(
    () => props.tasks,
    () => {
      renderChart();
    },
    { deep: true }
);

</script>

<template>
  <div ref="ganttContainer" class="relative w-full overflow-x-auto">
    <!-- Le SVG du graphique sera rendu ici par D3 -->
  </div>

  <!-- Formulaire d'édition (visible seulement en cas de double-clic) -->
  <div v-if="editingTask"
       :style="editingFormStyle"
       class="gantt-edit-form p-4 border border-blue-400 rounded-lg shadow-xl flex flex-col space-y-2 z-50">
    <div class="text-sm font-semibold text-gray-700 mb-2">Éditer: {{ editingTask.name }}</div>

    <!-- NOUVEAU: Champ d'édition de la durée -->
    <label class="text-xs font-medium text-gray-600">
      Durée (jours):
      <input type="number"
             v-model.number="editingTask.durationDays"
             min="1"
             class="mt-1 p-1 border rounded-md w-full text-sm focus:ring-blue-500 focus:border-blue-500" />
    </label>

    <hr class="border-gray-200 my-1">

    <!-- Champ de Date de Début -->
    <label class="text-xs font-medium text-gray-600">
      Début:
      <input type="date" v-model="editingTask.start"
             class="mt-1 p-1 border rounded-md w-full text-sm focus:ring-blue-500 focus:border-blue-500" />
    </label>

    <!-- Champ de Date de Fin (Mise à jour automatique par le watch ou éditable manuellement) -->
    <label class="text-xs font-medium text-gray-600">
      Fin:
      <input type="date" v-model="editingTask.end"
             class="mt-1 p-1 border rounded-md w-full text-sm focus:ring-blue-500 focus:border-blue-500" />
    </label>

    <div class="mt-3 flex justify-between items-center">
        <span class="text-xs font-bold text-blue-600">
            Durée effective: {{ displayDurationInDays }} j.
        </span>
      <button @click="saveDates"
              class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1 px-3 rounded-md transition duration-150">
        Valider
      </button>
    </div>

    <!-- Bouton pour annuler -->
    <button @click="editingTask = null" class="absolute top-1 right-1 text-gray-500 hover:text-gray-800 text-xs">
      &times;
    </button>
  </div>
</template>

<style scoped>
.dragging {
  opacity: 0.7;
  filter: brightness(1.2);
}
.gantt-edit-form {
  /* Style pour s'assurer que le formulaire flotte bien */
  box-sizing: border-box;
  /* NOUVEAU: Arrière-plan blanc avec 90% d'opacité */
  background-color: rgba(255, 255, 255, 0.9);
}

</style>

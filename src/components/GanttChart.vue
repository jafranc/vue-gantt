<script setup>
import * as d3 from 'd3';
import { ref, watch, onMounted, computed, nextTick } from 'vue';

const props = defineProps({
  tasks: Array,
  startDate: String,
  endDate: String,
});

// Événements émis : nous conservons 'task-hovered' et 'task-moved'
const emit = defineEmits(['task-hovered', 'task-moved']);

const ganttContainer = ref(null);
const availableWidth = computed(() => ganttContainer.value ? ganttContainer.value.clientWidth : 0);
const availableHeight = computed(() => props.tasks.length * 40 + 60);

// État pour l'édition de la durée au double-clic
const editingTask = ref(null); // { task: {}, x: 0, y: 0, duration: 0, newDuration: 0 }

// Les autres calculs (scales, margins, etc.) restent les mêmes.
const xScale = computed(() => {
  if (!availableWidth.value || !props.startDate || !props.endDate) return null;
  const start = new Date(props.startDate);
  const end = new Date(props.endDate);
  end.setDate(end.getDate() + 1);
  return d3.scaleTime()
      .domain([start, end])
      .range([50, availableWidth.value - 20]);
});

const yScale = computed(() => {
  return d3.scaleBand()
      .domain(props.tasks.map(t => t.name))
      .range([40, availableHeight.value - 20])
      .padding(0.2);
});

// --- LOGIQUE DE DUREE ET D'EDITION ---

// Calcule la durée en jours, y compris le jour de fin (si startDate='2025-01-01', endDate='2025-01-01', durée=1 jour)
const calculateDurationInDays = (start, end) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  // Ajoute +1 jour pour rendre l'intervalle inclusif
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

const saveDuration = () => {
  if (!editingTask.value) return;

  const task = editingTask.value.task;
  const newDays = parseInt(editingTask.value.newDuration);
  const originalDuration = editingTask.value.duration;

  // Si la valeur est invalide ou n'a pas changé, on annule.
  if (isNaN(newDays) || newDays <= 0 || newDays === originalDuration) {
    editingTask.value = null;
    return;
  }

  // Calculer la nouvelle date de fin: date de début + (newDays - 1) jours
  // -1 jour car le calcul ci-dessus ajoute +1 pour être inclusif.
  const newEndDate = new Date(task.start);
  newEndDate.setDate(newEndDate.getDate() + newDays - 1);

  // Émettre l'événement de mouvement/changement de durée
  emit('task-moved', {
    id: task.id,
    newStart: task.start, // La date de début ne change pas
    newEnd: newEndDate.toISOString().split('T')[0] // Nouvelle date de fin
  });

  // Cacher le champ d'édition
  editingTask.value = null;
};

// --- LOGIQUE DE POSITIONNEMENT DU CHAMP D'EDITION ---

const tooltipStyle = computed(() => {
  if (!editingTask.value) return {};
  // 50px correspond à la marge de l'axe Y dans D3 (translate(50, 0))
  const xOffset = 50;

  return {
    position: 'absolute',
    left: `${editingTask.value.x + xOffset - 10}px`, // Petit décalage à gauche
    top: `${editingTask.value.y - 12}px`, // -12px pour centrer verticalement le champ
  };
});


// --- LOGIQUE DE DRAG D3 ---

let taskDurationMs = 0;
let isDragging = false;

const renderChart = () => {
  if (!ganttContainer.value || !xScale.value || !yScale.value) return;

  d3.select(ganttContainer.value).selectAll('*').remove();

  const svg = d3.select(ganttContainer.value)
      .append('svg')
      .attr('width', availableWidth.value)
      .attr('height', availableHeight.value);

  // Helper pour gérer le double-clic
  const handleDblClick = function(event, d) {
    // Cacher le tooltip si visible
    emit('task-hovered', { task: d, isHovering: false, x: 0, y: 0 });

    const currentDuration = calculateDurationInDays(d.start, d.end);

    editingTask.value = {
      task: d,
      // Positionner au début de la barre + 5px
      x: xScale.value(new Date(d.start)) + 5,
      y: yScale.value(d.name) + yScale.value.bandwidth() / 2,
      duration: currentDuration,
      newDuration: currentDuration
    };

    // Focus sur l'input après le rendu DOM
    nextTick(() => {
      const input = document.querySelector('.duration-editor input');
      if (input) {
        input.focus();
        input.select();
      }
    });
  };

  // 1. Définir le comportement de Drag
  const dragHandler = d3.drag()
      .on('start', function(event, d) {
        isDragging = false;
        console.log("DRAG START: Tentative de glisser la tâche:", d.name);

        // Cacher l'éditeur si visible
        editingTask.value = null;
        // Cacher le tooltip
        emit('task-hovered', { task: d, isHovering: false, x: 0, y: 0 });

        const startDate = new Date(d.start);
        const endDate = new Date(d.end);
        taskDurationMs = endDate.getTime() - startDate.getTime();

        d3.select(this)
            .style('filter', 'url(#glow)')
            .style('cursor', 'grabbing');
      })
      .on('drag', function(event, d) {
        // Confirmer qu'un glissement a eu lieu après un petit mouvement
        if (Math.abs(event.dx) > 2 || Math.abs(event.dy) > 2) {
          isDragging = true;
        }

        const newX = event.x;
        // Déplacer visuellement la barre
        d3.select(this).attr('x', newX);
        console.log(`DRAG: Position X: ${newX}`);
      })
      .on('end', function(event, d) {
        d3.select(this)
            .style('filter', null)
            .style('cursor', 'grab');

        if (!isDragging) {
          console.log("DRAG END: Non glissé (simple clic ou immobilité)");
          return;
        }

        const newStartDate = xScale.value.invert(event.x);
        const newEndDate = new Date(newStartDate.getTime() + taskDurationMs);

        console.log(`DRAG END: Nouvelle date de début calculée: ${newStartDate}`);

        // 4. Émettre l'événement pour la mise à jour de l'état du parent
        emit('task-moved', {
          id: d.id,
          newStart: newStartDate.toISOString().split('T')[0],
          newEnd: newEndDate.toISOString().split('T')[0]
        });

        isDragging = false;
      });

  // 2. Dessiner l'axe X (Dates)
  const xAxis = d3.axisBottom(xScale.value)
      .ticks(d3.timeWeek.every(1))
      .tickFormat(d3.timeFormat("%b %d"));

  svg.append('g')
      .attr('transform', `translate(0, ${availableHeight.value - 20})`)
      .call(xAxis)
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

  // 3. Dessiner l'axe Y (Noms des Tâches)
  const yAxis = d3.axisLeft(yScale.value).tickSize(0);

  svg.append('g')
      .attr('transform', `translate(50, 0)`)
      .call(yAxis)
      .select('.domain').remove();

  // 4. Définir un filtre pour l'effet de surbrillance pendant le drag
  const defs = svg.append('defs');
  defs.append('filter')
      .attr('id', 'glow')
      .append('feGaussianBlur')
      .attr('stdDeviation', 2.5)
      .attr('result', 'coloredBlur');
  defs.select('#glow')
      .append('feMerge')
      .append('feMergeNode')
      .attr('in', 'coloredBlur');
  defs.select('#glow')
      .select('feMerge')
      .append('feMergeNode')
      .attr('in', 'SourceGraphic');

  // 5. Dessiner les barres de tâches
  props.tasks.forEach((task) => {
    const startX = xScale.value(new Date(task.start));
    const endX = xScale.value(new Date(task.end));
    const barWidth = endX - startX;
    const barY = yScale.value(task.name);
    const barHeight = yScale.value.bandwidth();

    // Barre de tâche (élément <rect>)
    svg.append('rect')
        .datum(task)
        .attr('x', startX)
        .attr('y', barY)
        .attr('width', barWidth > 0 ? barWidth : 0)
        .attr('height', barHeight)
        .attr('rx', 3)
        .style('fill', task.color || '#4A90E2')
        .style('opacity', 0.8)
        .style('cursor', 'grab')
        // Attacher le comportement de drag
        .call(dragHandler)
        // NOUVEL ÉVÉNEMENT : Double-clic
        .on('dblclick', handleDblClick)
        // Événements de survol (mouseenter/mouseleave)
        .on('mouseenter', (event, d) => {
          if (isDragging || editingTask.value) return; // Ignorer si drag ou édition

          const [mouseX] = d3.pointer(event);
          d3.select(event.currentTarget).style('opacity', 1.0);
          emit('task-hovered', {
            task: d,
            isHovering: true,
            x: mouseX,
            y: barY
          });
        })
        .on('mouseleave', (event) => {
          if (isDragging || editingTask.value) return; // Ignorer si drag ou édition

          d3.select(event.currentTarget).style('opacity', 0.8);
          emit('task-hovered', {
            task: task,
            isHovering: false,
            x: 0,
            y: 0
          });
        });
  });
};

onMounted(() => {
  renderChart();
  window.addEventListener('resize', renderChart);
});

watch([() => props.tasks, availableWidth], renderChart, { deep: true });
</script>

<template>
  <div ref="ganttContainer" class="gantt-chart-container">
    <!-- Le graphique SVG sera injecté ici par D3 -->
  </div>

  <!-- Éditeur de Durée au Double-Clic -->
  <div
      v-if="editingTask"
      class="duration-editor"
      :style="tooltipStyle"
  >
    <input
        type="number"
        v-model.number="editingTask.newDuration"
        min="1"
        @keydown.enter="saveDuration"
        @blur="saveDuration"
        class="border rounded px-1 w-16 text-sm"
    />
    <span class="text-xs ml-1 font-semibold text-gray-700">jours</span>
  </div>
</template>

<style scoped>
.gantt-chart-container {
  width: 100%;
  overflow-x: auto;
  min-height: 200px;
  position: relative; /* Nécessaire pour positionner l'éditeur absolument */
}
.duration-editor {
  z-index: 10;
  display: flex;
  align-items: center;
  background-color: white;
  padding: 4px;
  border-radius: 4px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
}
:deep(svg text) {
  font-family: 'Inter', sans-serif;
  font-size: 10px;
}
:deep(svg .tick line) {
  stroke: #ccc;
  stroke-dasharray: 2,2;
}
:deep(svg .task-group rect) {
  transition: opacity 0.2s ease;
}
</style>

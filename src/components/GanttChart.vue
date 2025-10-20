<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import * as d3 from 'd3';

// Définition des propriétés (Props)
const props = defineProps({
  tasks: {
    type: Array,
    required: true,
    default: () => []
  },
  startDate: {
    type: [String, Date],
    default: () => new Date()
  },
  endDate: {
    type: [String, Date],
    default: () => new Date(new Date().setMonth(new Date().getMonth() + 1))
  },
  options: {
    type: Object,
    default: () => ({
      barHeight: 30,
      margin: { top: 20, right: 20, bottom: 20, left: 150 }
    })
  }
});

// Définition des événements
const emit = defineEmits(['task-selected']);

// Référence au conteneur DOM pour D3
const ganttContainer = ref(null);
const chartWidth = ref(0);
const chartHeight = ref(400);

// Propriétés calculées pour les échelles D3
const availableWidth = computed(() => chartWidth.value - props.options.margin.left - props.options.margin.right);

const xScale = computed(() => {
  if (availableWidth.value <= 0 || !props.startDate || !props.endDate) return null;

  return d3.scaleTime()
      .domain([new Date(props.startDate), new Date(props.endDate)])
      .range([0, availableWidth.value]);
});

// Fonction principale de rendu D3
const renderChart = () => {
  if (!ganttContainer.value || !props.tasks.length || !xScale.value) return;

  // Calculer la hauteur requise pour toutes les tâches
  const requiredHeight = props.tasks.length * (props.options.barHeight + 15) + props.options.margin.top + props.options.margin.bottom + 20;
  chartHeight.value = requiredHeight > 300 ? requiredHeight : 300; // Hauteur minimale

  // Nettoyer le SVG précédent
  d3.select(ganttContainer.value).selectAll('*').remove();

  // Créer le conteneur SVG principal
  const svg = d3.select(ganttContainer.value)
      .append('svg')
      .attr('width', chartWidth.value)
      .attr('height', chartHeight.value)
      .append('g')
      .attr('transform', `translate(${props.options.margin.left}, ${props.options.margin.top})`);

  // Dessiner l'axe X (échelle de temps)
  const xAxisGroup = svg.append("g")
      .attr("transform", `translate(0, ${chartHeight.value - props.options.margin.top - props.options.margin.bottom})`)
      .call(d3.axisBottom(xScale.value));

  // Styles Tailwind pour l'axe (simulés)
  xAxisGroup.selectAll("path, line").attr("stroke", "#94a3b8");
  xAxisGroup.selectAll("text").attr("fill", "#64748b");

  // Dessiner les barres de tâches
  props.tasks.forEach((task, index) => {
    const barY = index * (props.options.barHeight + 15);
    const barStart = xScale.value(new Date(task.start));
    const barEnd = xScale.value(new Date(task.end));

    // Barre de tâche
    svg.append('rect')
        .attr('x', barStart)
        .attr('y', barY)
        .attr('width', barEnd - barStart)
        .attr('height', props.options.barHeight)
        .attr('fill', task.color || '#4c7f9f')
        .attr('rx', 6).attr('ry', 6)
        .style('cursor', 'pointer')
        .on('click', () => {
          emit('task-selected', task);
        });

    // Nom de la tâche (à gauche)
    svg.append('text')
        .attr('x', -10)
        .attr('y', barY + props.options.barHeight / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#334155')
        .style('font-weight', '600')
        .style('font-size', '14px')
        .text(task.name);
  });
};

// Logique de montage et redimensionnement
onMounted(() => {
  // Observer les changements de taille du conteneur parent
  const resizeObserver = new ResizeObserver(entries => {
    if (entries.length > 0) {
      // Mettre à jour la largeur et re-rendre
      chartWidth.value = entries[0].contentRect.width;
      renderChart();
    }
  });

  // Assurez-vous d'observer le parent du conteneur D3 pour obtenir la largeur réelle
  if (ganttContainer.value && ganttContainer.value.parentElement) {
    resizeObserver.observe(ganttContainer.value.parentElement);
  }
});

// Écouter les changements des props pour re-rendre
watch([() => props.tasks, () => props.startDate, () => props.endDate], renderChart, { deep: true });

</script>

<template>
  <div class="gantt-chart-wrapper w-full overflow-x-auto p-4 bg-white rounded-lg shadow-lg">
    <!-- Le conteneur D3 est mis à jour dynamiquement -->
    <div ref="ganttContainer" class="gantt-container" :style="{ minHeight: chartHeight + 'px' }">
      <div v-if="!tasks || tasks.length === 0" class="text-center p-8 text-gray-500">
        Aucune tâche à afficher.
      </div>
    </div>
  </div>
</template>
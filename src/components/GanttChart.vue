<script setup>
import { ref, watch, onMounted, computed, nextTick } from 'vue';
import * as d3 from 'd3';

// L'événement taskUpdated est utilisé pour les changements de dates/contenu
const emit = defineEmits(['taskUpdated']);

const props = defineProps({
  // tasks is the primary data source
  tasks: { type: Array, default: () => [] },
  startDate: { type: String, default: '2012-12-12' },
  endDate: { type: String, default: '2013-12-13' },
});

// --- État Interne pour le Filtrage ---
const localTasks = ref([]);
const selectedCategory = ref('All');

// --- VARIABLES POUR L'AUTO-ATTRIBUTION DE COULEURS ---
const COLOR_PALETTE = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#EC4899', '#06B6D4'];
const categoryColorMap = ref({});

// --- CONSTANTES ET ÉTAT POUR LE TIME-FOLDING ---
const FOLD_MULTIPLIER = 5; // Tâche est un "whale" si sa durée est > 5 * durée médiane
const FOLD_COMPRESSION_FACTOR = 0.2; // La durée excédentaire est affichée à 20% de sa taille réelle

/**
 * Calcule la médiane d'un tableau de nombres.
 */
const calculateMedian = (arr) => {
  if (arr.length === 0) return 1;

  const sorted = [...arr].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  } else {
    return sorted[middle];
  }
};

/**
 * Fonction pour initialiser ou mettre à jour la carte de couleurs des catégories.
 */
const initializeColorMap = (tasks) => {
  const allCategories = new Set();
  tasks.forEach(t => {
    if (t.category && t.category.trim()) {
      allCategories.add(t.category);
    }
  });

  let newMap = { ...categoryColorMap.value };
  let colorIndex = 0;

  allCategories.forEach(cat => {
    if (!newMap[cat]) {
      let color = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
      newMap[cat] = color;
    }
    colorIndex++;
  });

  categoryColorMap.value = newMap;
};

/**
 * Récupère la couleur pour une catégorie donnée à partir de la carte.
 */
const getCategoryColor = (category) => {
  if (!category || category === 'Uncategorized') return '#9CA3AF'; // Gris par défaut
  return categoryColorMap.value[category] || '#9CA3AF';
};


// --- ÉTAT D'ÉDITION ET CATÉGORIE ---
const newCategoryInput = ref(false);

const uniqueExistingCategories = computed(() => {
  const categories = new Set();
  localTasks.value.forEach(t => {
    if (t.category && t.category.trim()) {
      categories.add(t.category);
    }
  });
  return Array.from(categories).sort();
});

const availableCategories = computed(() => {
  const categories = new Set(['All']);
  localTasks.value.forEach(t => {
    if (t.category && t.category.trim()) {
      categories.add(t.category);
    }
  });
  return Array.from(categories).sort();
});


const ganttContainer = ref(null);
const availableWidth = ref(0);
const margin = { top: 40, right: 20, bottom: 30, left: 50 };
const isDragging = ref(false);
const editingTask = ref(null);

// --- Fonctions utilitaires de Durée et de Date ---
const getDurationInDays = (start, end) => {
  if (!start || !end) return 1;
  const startDate = new Date(start);
  const endDate = new Date(end);
  // if (startDate.getTime() > endDate.getTime()) return 0;
  const diffTime = endDate.getTime() - startDate.getTime();
  if (diffTime<0) return 1;
  const durationInDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  return Math.max(1,durationInDays);
};

// Détermine la durée réelle en jours pour une tâche (utilisé pour la médiane)
const getTaskDuration = (task) => getDurationInDays(task.start, task.end);

// Calcul de la durée **médiane** des tâches
const medianTaskDuration = computed(() => {
  if (localTasks.value.length === 0) return 1;

  const durations = localTasks.value
      .filter(t => t.start && t.end)
      .map(getTaskDuration);

  return Math.max(1, calculateMedian(durations));
});

const addDaysToDate = (dateStr, days) => {
  if (!dateStr || days <= 0) return dateStr;
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days - 1);
  return d3.timeFormat('%Y-%m-%d')(date);
};

const formatDate = (date) => date.toISOString().split('T')[0];

// --- CALCUL DES TÂCHES FILTRÉES ---
const filteredTasks = computed(() => {
  if (selectedCategory.value === 'All') {
    return localTasks.value;
  }
  return localTasks.value.filter(t => t.category === selectedCategory.value);
});

const height = computed(() => Math.max(150, filteredTasks.value.length * 40 + margin.top + margin.bottom));


// --- CALCUL DES ÉCHELLES DYNAMIQUES ---
const effectiveStartDate = computed(() => {
  if (localTasks.value.length === 0) return new Date(props.startDate);
  const dates = localTasks.value.map(t => new Date(t.start));
  return new Date(Math.min(...dates));
});

const effectiveEndDate = computed(() => {
  if (localTasks.value.length === 0) return new Date(props.endDate);
  const dates = localTasks.value.map(t => new Date(t.end));
  const maxDate = new Date(Math.max(...dates));
  maxDate.setDate(maxDate.getDate() + 10);
  return maxDate;
});

// --- FONCTIONS D'AJOUT/SUPPRESSION/TRI DE TÂCHES ---
const addTask = () => {
  const maxId = localTasks.value.length > 0 ? Math.max(...localTasks.value.map(t => t.id)) : 0;
  const newId = maxId + 1;

  let newTask;
  const defaultCategory = (localTasks.value.length > 0 ? localTasks.value[localTasks.value.length - 1].category : 'Planning') || 'Uncategorized';

  if (localTasks.value.length > 0) {
    const lastTask = localTasks.value[localTasks.value.length - 1];
    const durationMs = new Date(lastTask.end).getTime() - new Date(lastTask.start).getTime();
    const newStart = new Date(lastTask.end);
    newStart.setDate(newStart.getDate() + 1);
    const newEnd = new Date(newStart.getTime() + durationMs);

    newTask = {
      id: newId,
      name: `Tâche Copiée ${newId}`,
      start: formatDate(newStart),
      end: formatDate(newEnd),
      category: defaultCategory,
      isNew: true,
    };
  } else {
    const defaultStart = new Date();
    const defaultEnd = new Date();
    defaultEnd.setDate(defaultEnd.getDate() + 10);

    newTask = {
      id: newId,
      name: `Première Tâche ${newId}`,
      start: formatDate(defaultStart),
      end: formatDate(defaultEnd),
      category: defaultCategory,
      isNew: true,
    };
  }

  localTasks.value.push(newTask);

  initializeColorMap(localTasks.value);

  emit('taskUpdated', localTasks.value);
};

const removeLastTask = () => {
  if (localTasks.value.length === 0) return;
  const maxId = Math.max(...localTasks.value.map(t => t.id));
  const newTasks = localTasks.value.filter(t => t.id !== maxId);
  localTasks.value = newTasks;
  emit('taskUpdated', localTasks.value);
}

const refreshSorting = () => {
  const sortedTasks = [...localTasks.value].sort((a, b) => {
    const dateA = new Date(a.start);
    const dateB = new Date(b.start);

    if (dateA < dateB) return -1;
    if (dateA > dateB) return 1;

    return a.id - b.id;
  });

  localTasks.value = sortedTasks;
  emit('taskUpdated', localTasks.value);
};

const handleTaskMoved = (movedTask) => {
  const taskIndex = localTasks.value.findIndex(t => t.id === movedTask.id);

  if (taskIndex !== -1) {
    const updatedTask = {
      ...localTasks.value[taskIndex],
      start: movedTask.newStart,
      end: movedTask.newEnd,
      category: localTasks.value[taskIndex].category,
      name: movedTask.name || localTasks.value[taskIndex].name,
    };

    const newTasks = [...localTasks.value];
    newTasks[taskIndex] = updatedTask;

    localTasks.value = newTasks;
    emit('taskUpdated', localTasks.value);
  }
};


const displayDurationInDays = computed(() => {
  if (!editingTask.value) return 0;
  return getDurationInDays(editingTask.value.start, editingTask.value.end);
});

const editingFormStyle = computed(() => {
  if (!editingTask.value || !editingTask.value.y || !ganttContainer.value) return {};

  const containerWidth = ganttContainer.value.clientWidth;

  return {
    position: 'absolute',
    left: `${containerWidth / 2}px`,
    top: `${editingTask.value.y + margin.top + 5}px`,
    transform: 'translateX(-50%)',
    zIndex: 30,
    minWidth: '320px',
  };
});

const xScale = ref(null);
const yScale = ref(null);

const handleContextMenu = (task) => {
  isDragging.value = false;

  if (editingTask.value && editingTask.value.id === task.id) {
    editingTask.value = null;
    newCategoryInput.value = false;
    return;
  }

  if (!xScale.value || !yScale.value) return;

  const xPos = xScale.value(new Date(task.start));
  const yPos = yScale.value(task.name);

  if (yPos === undefined) return;

  editingTask.value = {
    id: task.id,
    name: task.name,
    start: task.start,
    end: task.end,
    durationDays: getDurationInDays(task.start, task.end),
    x: xPos,
    y: yPos,
    category: task.category || 'Uncategorized',
    newCategory: null,
    // La fréquence est importante pour les tâches récurrentes
    freq: task.freq || null,
  };

  newCategoryInput.value = false;

  nextTick(() => {
    const inputElement = document.querySelector('.gantt-edit-form input');
    if (inputElement) {
      inputElement.focus();
    }
  });
};

watch(() => editingTask.value?.durationDays, (newDuration, oldDuration) => {
  if (editingTask.value && newDuration) {
    if (newDuration !== oldDuration) {
      editingTask.value.end = addDaysToDate(editingTask.value.start, newDuration);
    }
    // S'assurer que la durée est au moins 1
    const safeDuration = Math.max(1, newDuration);
    editingTask.value.durationDays = safeDuration; // Force la valeur dans le modèle si < 1

    // Si la durée a été changée, on ajuste la date de fin
    editingTask.value.end = addDaysToDate(editingTask.value.start, safeDuration);
  }
});

watch(() => editingTask.value?.start, (newStart, oldStart) => {
  if (editingTask.value && newStart){
    editingTask.value.end = addDaysToDate(newStart, Math.max(1,editingTask.value.durationDays));
    if(newStart !== oldStart) {
      editingTask.value.durationDays = getDurationInDays(newStart, editingTask.value.end);
    }
  }
});

const saveDates = () => {
  const { id, name, start, end, freq } = editingTask.value; // Ajout de freq
  const taskIndex = localTasks.value.findIndex(t => t.id === id);
  if (taskIndex === -1) return;
  const originalTask = localTasks.value[taskIndex];

  let { category } = editingTask.value;
  let newCategory = category;

  if (newCategoryInput.value && editingTask.value.newCategory) {
    const newCat = editingTask.value.newCategory.trim();
    if (newCat) {
      newCategory = newCat;
    }
  }

  if (newCategory !== originalTask.category) {
    initializeColorMap(localTasks.value.concat([{ category: newCategory }]));
  }

  newCategoryInput.value = false;

  const newStart = new Date(start);
  const newEnd = new Date(end);

  // Vérification ajustée (Line 377):
  if (newStart.getTime() >= newEnd.getTime()) {
    console.error("La tâche doit avoir une durée d'au moins un jour (date de début < date de fin).");
    console.warn("Erreur: La date de début doit être strictement antérieure à la date de fin pour garantir une durée positive. Opération annulée.");
    return;
  }

  const updatedTask = {
    ...originalTask,
    name,
    start,
    end,
    category: newCategory,
    freq: freq || null, // Sauvegarde de la fréquence (peut être gérée par un autre champ du form si nécessaire)
  };

  const newTasks = [...localTasks.value];
  newTasks[taskIndex] = updatedTask;

  localTasks.value = newTasks;
  emit('taskUpdated', localTasks.value);

  editingTask.value = null;
};

// Calcule la couleur à afficher dans le formulaire d'édition
const editingCategoryColor = computed(() => {
  return editingTask.value
      ? getCategoryColor(editingTask.value.category)
      : '#9CA3AF'; // Couleur de secours
});

// --- Échelles D3 ---
const setupScales = (width) => {
  const start = effectiveStartDate.value;
  const end = effectiveEndDate.value;

  xScale.value = d3.scaleTime()
      .domain([start, end])
      .range([0, width - margin.left - margin.right]);

  yScale.value = d3.scaleBand()
      .domain(Array.isArray(filteredTasks.value) ? filteredTasks.value.map(t => t.name) : [])
      .range([0, filteredTasks.value.length * 40])
      .paddingInner(0.1);
};

// --- Rendu D3 avec Drag-Reorder et Time-Folding ---
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
      .attr('transform', `translate(0, ${filteredTasks.value.length * 40 || 50})`)
      .call(d3.axisBottom(xScale.value));

  const yAxisG = g.append('g')
      .attr('class', 'y-axis-g')
      .call(d3.axisLeft(yScale.value));

  // --- NOUVEAU: Rendre les libellés de l'axe Y cliquables pour ouvrir le menu contextuel ---
  yAxisG.selectAll('.tick text')
      .style('cursor', 'pointer') // Indique que le texte est cliquable
      .on('contextmenu', function(event, d) {
        event.preventDefault();
        event.stopPropagation(); // Empêche la propagation de l'événement

        // 'd' contient le nom de la tâche (le domaine de yScale)
        const taskName = d;
        const clickedTask = filteredTasks.value.find(t => t.name === taskName);

        if (clickedTask) {
          // Utiliser la fonction existante pour ouvrir le formulaire d'édition
          handleContextMenu(clickedTask);
        }
      });
  // -----------------------------------------------------------------------------------------

  if (!filteredTasks.value.length) return;

  // UTILISATION DE LA MÉDIANE
  const medianDuration = medianTaskDuration.value;
  const threshold = medianDuration * FOLD_MULTIPLIER;

  const oneDayAfterStart = d3.timeDay.offset(effectiveStartDate.value, 1);
  const oneDayInPixels = xScale.value(oneDayAfterStart) - xScale.value(effectiveStartDate.value);

  let isReordering = false;
  let initialX, initialY;
  let originalTaskIndex = -1;
  const rowHeight = yScale.value.step();
  const isFilterActive = selectedCategory.value !== 'All';

  const dragHandler = d3.drag()
      .on('start', function(event, d) {
        if (editingTask.value) {
          d3.select(this).style('cursor', 'pointer');
          event.sourceEvent.stopPropagation();
          return;
        }

        isDragging.value = false;
        isReordering = false;
        initialX = event.x;
        initialY = event.y;
        originalTaskIndex = filteredTasks.value.findIndex(t => t.id === d.id);

        d3.select(this)
            .raise()
            .classed('dragging', true)
            .style('cursor', 'grabbing');
      })
      .on('drag', function(event, d) {
        if (editingTask.value) return;

        const dx = event.x - initialX;
        const dy = event.y - initialY;

        if (Math.abs(dy) > 5 && !isFilterActive) {
          isReordering = true;
          d3.select(this)
              .attr('transform', `translate(0, ${dy})`);

        } else if (Math.abs(dx) > 5 || isFilterActive) {
          isDragging.value = true;
          isReordering = false;
          const newX = xScale.value(new Date(d.start)) + dx;
          d3.select(this).select('rect').attr('x', newX);
          d3.select(this).select('text').attr('x', newX + 5);
          d3.select(this).attr('transform', null);
        }
      })
      .on('end', function(event, d) {
        d3.select(this).style('cursor', 'grab');

        if (editingTask.value) {
          d3.select(this).classed('dragging', false).attr('transform', null);
          return;
        }

        d3.select(this)
            .classed('dragging', false)
            .attr('transform', null);

        if (isReordering && !isFilterActive) {
          const finalY = yScale.value(d.name) + (event.y - initialY);
          const newRowIndex = Math.round(finalY / rowHeight);
          const newFilteredIndex = Math.max(0, Math.min(filteredTasks.value.length - 1, newRowIndex));

          if (newFilteredIndex !== originalTaskIndex) {

            const taskIdToMove = filteredTasks.value[originalTaskIndex].id;
            const globalIndexToMove = localTasks.value.findIndex(t => t.id === taskIdToMove);

            const targetTaskId = filteredTasks.value[newFilteredIndex].id;
            const globalTargetIndex = localTasks.value.findIndex(t => t.id === targetTaskId);

            const newTasksArray = [...localTasks.value];
            const [movedTask] = newTasksArray.splice(globalIndexToMove, 1);
            newTasksArray.splice(globalTargetIndex, 0, movedTask);

            localTasks.value = newTasksArray;
            emit('taskUpdated', localTasks.value);
          } else {
            renderChart();
          }
        } else if (isDragging.value) {
          const finalBarX = xScale.value(new Date(d.start)) + (event.x - initialX);

          const newStartDate = xScale.value.invert(finalBarX);
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
        } else {
          renderChart();
        }

        isDragging.value = false;
        isReordering = false;
      });

  // Itérer sur filteredTasks pour le rendu
  filteredTasks.value.forEach((task) => {
    const xStart = xScale.value(new Date(task.start));
    const yPos = yScale.value(task.name);
    const barHeight = yScale.value.bandwidth();

    // NOUVEAU: Logique pour la fréquence
    const hasFrequency = task.freq && task.freq > 0;

    if (hasFrequency) {
      // --- TÂCHE RÉCURRENTE (DIAMANTS + LIGNE POINTILLÉE) ---

      const frequencyDays = task.freq;
      const startDate = new Date(task.start);
      const endDate = new Date(task.end);

      let recurrenceDates = [];
      let currentDate = new Date(startDate);

      // Calcul des dates récurrentes
      while (currentDate.getTime() <= endDate.getTime()) {
        recurrenceDates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + frequencyDays);
      }

      if (recurrenceDates.length === 0) return;

      const taskGroup = g.append('g')
          .datum(task)
          .attr('class', 'task-group task-freq');
      // Le dragHandler n'est pas appliqué pour les tâches récurrentes

      const categoryColor = getCategoryColor(task.category);

      // A. Dessiner la Ligne Pointillée
      const xFirst = xScale.value(recurrenceDates[0]);
      const xLast = xScale.value(recurrenceDates[recurrenceDates.length - 1]);
      const lineY = yPos + barHeight / 10;

      taskGroup.append('line')
          .attr('x1', xFirst)
          .attr('y1', lineY)
          .attr('x2', xLast)
          .attr('y2', lineY)
          .attr('stroke', categoryColor)
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5, 5') // Ligne pointillée
          .attr('opacity', 0.6);

      // B. Dessiner les Diamants
      const diamondSize = barHeight / 5;
      const halfSize = diamondSize / 2;

      recurrenceDates.forEach(date => {
        const dateFormatted = d3.timeFormat('%Y-%m-%d')(date);
        const xCenter = xScale.value(date);
        const diamondX = xCenter - halfSize;
        const diamondY = yPos;

        // 2. Le Diamant (Carré tourné)
        taskGroup.append('rect')
            .attr('x', diamondX)
            .attr('y', diamondY)
            .attr('width', diamondSize)
            .attr('height', diamondSize)
            .attr('transform', `rotate(45, ${diamondX + halfSize}, ${diamondY + halfSize})`)
            .attr('rx', 2)
            .attr('fill', categoryColor)
            .attr('stroke', 'black')
            .attr('stroke-width', 1);
      });

      // C. Ajouter le Nom de la Tâche (à côté du premier diamant)
      taskGroup.append("text")
          .text(`🔁: ${task.name}`)
          .attr("x", xFirst + diamondSize + 5)
          .attr("y", yPos + barHeight / 2 + 5)
          .attr("fill", "black")
          .style("pointer-events", "none")
          .style("font-size", "12px")
          .style("font-weight", "bold");

      return; // Passe à la tâche suivante
    }

    // --- LOGIQUE EXISTANTE POUR LES TÂCHES NON RÉCURRENTES (Barre ou Diamant Unique) ---

    // 1. Calcul des durées et de la largeur finale (avec pliage)
    const realDuration = getTaskDuration(task);
    let finalWidth;
    let isFolded = false;

    // NOUVEAU: Détermine si la tâche est un diamant
    const isSingleDay = realDuration <= 1;

    // Ajuster la logique de pliage pour ignorer les tâches d'un seul jour
    if (!isSingleDay && realDuration > threshold) {
      isFolded = true;

      const nonFoldedWidth = threshold * oneDayInPixels;

      const excessDuration = realDuration - threshold;
      const compressedExcessWidth = excessDuration * FOLD_COMPRESSION_FACTOR * oneDayInPixels;

      finalWidth = nonFoldedWidth + compressedExcessWidth;
    } else if (!isSingleDay) { // Calcul de la largeur standard pour les tâches > 1 jour
      const xEndReal = xScale.value(new Date(task.end));
      finalWidth = xEndReal - xStart;
    }


    const taskGroup = g.append('g')
        .datum(task)
        .attr('class', 'task-group')
        .on('contextmenu', function(event) {
          event.preventDefault();
          if (event.sourceEvent) {
            event.sourceEvent.stopPropagation();
          } else {
            event.stopPropagation();
          }
          handleContextMenu(task);
        });

    // 2. Dessiner le rectangle ou le diamant de la tâche
    let rect;
    let textX;

    if (isSingleDay) {
      // CAS DIAMANT UNIQUE
      const diamondSize = barHeight;
      const halfSize = diamondSize / 2;

      // Centrer la forme sur la position de début (xStart)
      const diamondX = xStart - halfSize;
      const diamondY = yPos;

      rect = taskGroup.append('rect')
          .attr('x', diamondX)
          .attr('y', diamondY)
          .attr('width', diamondSize)
          .attr('height', diamondSize)
          // Rotation 45deg autour du centre du carré
          .attr('transform', `rotate(45, ${diamondX + halfSize}, ${diamondY + halfSize})`)
          .attr('rx', 2);

      // Positionner le texte après le diamant
      textX = xStart + halfSize + 5;

    } else {
      // CAS RECTANGLE (Plié ou Standard)
      rect = taskGroup.append('rect')
          .attr('x', xStart)
          .attr('y', yPos)
          .attr('width', finalWidth)
          .attr('height', barHeight)
          .attr('rx', 4);

      // Positionner le texte dans le rectangle
      textX = xStart + 5;
    }

    // Remplissage standard avec la couleur de catégorie
    rect.attr('fill', getCategoryColor(task.category))
        .style('cursor', 'grab');

    // 3. Indicateur de pliage
    if (isFolded) {
      rect.attr('stroke', 'black')
          .attr('stroke-width', 2);

      taskGroup.append('title')
          .text(`Durée réelle: ${realDuration} jours. Affiché plié (Whale Task) car > ${threshold} jours (${FOLD_MULTIPLIER}x la médiane).`);
    }

    dragHandler(taskGroup);

    // 4. Ajout du préfixe au nom de la tâche si elle est pliée
    const displayName = isFolded ? `📐: ${task.name}` : task.name;
    // NOUVEAU: Si c'est un diamant, ajouter un préfixe différent pour le signaler
    const finalDisplayName = isSingleDay ? `◆: ${displayName}` : displayName;


    taskGroup.append("text")
        .text(finalDisplayName) // Utilisation du nom modifié
        // Utiliser la position X calculée ci-dessus
        .attr("x", textX)
        .attr("y", yPos + barHeight / 2 + 5)
        .attr("fill", "black")
        .style("pointer-events", "none")
        .style("font-size", "12px")
        // Rendre le texte en gras pour les tâches pliées/diamants
        .style("font-weight", (isFolded || isSingleDay) ? "bold" : "normal");

    if (isFilterActive) {
      taskGroup.append("text")
          .text("🚫")
          .attr("x", -margin.left + 5)
          .attr("y", yPos + yScale.value.bandwidth() / 2 + 5)
          .attr("fill", "gray")
          .style("font-size", "14px")
          .style("cursor", "help")
          .attr("title", "Réorganisation désactivée en mode filtré");
    }
  });
};

// --- Hooks et Watchers ---

watch(() => props.tasks, (newTasks) => {
  if (Array.isArray(newTasks)) {

    localTasks.value = newTasks.map(t => {
      const { color, ...taskWithoutColor } = t;
      return { ...taskWithoutColor };
    });

    initializeColorMap(localTasks.value);

    renderChart();
  } else {
    localTasks.value = [];
    categoryColorMap.value = {};
    renderChart();
  }
}, { immediate: true, deep: true });

onMounted(() => {
  renderChart();
  window.addEventListener('resize', renderChart);
});

watch([() => localTasks.value, effectiveStartDate, effectiveEndDate, selectedCategory], renderChart, { deep: true });
</script>

<template>
  <div class="gantt-wrapper relative w-full">

    <div class="absolute top-0 right-0 z-10 flex space-x-4 items-center mr-2">

      <div class="flex items-center space-x-2">
        <label for="categoryFilter" class="text-sm font-medium text-gray-700">Filtrer par:</label>
        <select id="categoryFilter"
                v-model="selectedCategory"
                class="p-1 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm">
          <option v-for="category in availableCategories"
                  :key="category"
                  :value="category"
                  :style="{
                      color: category === 'All' ? 'inherit' : getCategoryColor(category),
                      fontWeight: 'bold'
                  }">
            {{ category }}
          </option>
        </select>
      </div>

      <button @click="addTask"
              class="bg-green-500 hover:bg-green-600 text-gray-500 font-bold py-1 px-2 rounded-full shadow-lg transition duration-150 text-lg leading-none w-8 h-8 flex items-center justify-center"
              title="Ajouter une nouvelle tâche (copie de la dernière)">
        +
      </button>

      <button @click="refreshSorting"
              class="bg-blue-500 hover:bg-blue-600 text-gray-500 font-bold py-1 px-2 rounded-full shadow-lg transition duration-150 text-sm leading-none w-8 h-8 flex items-center justify-center"
              title="Trier par date de début">
        &#8645;
      </button>

      <button @click="removeLastTask"
              :disabled="localTasks.length === 0"
              class="bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-gray-500 font-bold py-1 px-2 rounded-full shadow-lg transition duration-150 text-lg leading-none w-8 h-8 flex items-center justify-center"
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
      <p class="text-xs text-gray-500 mt-2">
        Dates du graphique calculées :
        {{ d3.timeFormat('%Y-%m-%d')(effectiveStartDate) }} à
        {{ d3.timeFormat('%Y-%m-%d')(effectiveEndDate) }}
      </p>
      <p class="text-xs text-blue-500 font-medium">
        (CONSEIL: **Cliquez-droit** sur une barre de tâche ou un jalon pour l'éditer. Les tâches **Whales** (durée > 5x médiane) sont **compressées** et marquées par un **📐: **. Les tâches courtes d'un jour sont des **◆: diamants**. Les tâches **récurrentes** sont des séries de **🔁: diamants**.)
      </p>
    </div>

    <div v-if="editingTask"
         :style="editingFormStyle"
         class="gantt-edit-form p-4 border border-blue-400 rounded-lg shadow-xl flex flex-col space-y-2 z-50">
      <div class="text-sm font-semibold text-gray-700 mb-2">Éditer</div>

      <label class="text-xs font-medium text-gray-600">
        Nom:
        <input type="text"
               v-model="editingTask.name"
               class="mt-1 p-1 border rounded-md w-full text-sm focus:ring-blue-500 focus:border-blue-500" />
      </label>

      <label class="text-xs font-medium text-gray-600">
        <div class="flex justify-between items-center mb-1">
          <span>Catégorie:</span>
          <span :style="{ backgroundColor: editingCategoryColor }"
                class="w-6 h-6 rounded-full border border-gray-400 inline-block">
          </span>
        </div>

        <div class="flex items-center space-x-1 mt-1">
          <select v-if="!newCategoryInput"
                  v-model="editingTask.category"
                  class="p-1 border rounded-md w-full text-sm focus:ring-blue-500 focus:border-blue-500 flex-grow">
            <option v-for="category in uniqueExistingCategories" :key="category" :value="category">
              {{ category }}
            </option>
          </select>

          <input v-else
                 type="text"
                 v-model="editingTask.newCategory"
                 placeholder="Nouvelle catégorie..."
                 class="p-1 border border-blue-500 rounded-md w-full text-sm focus:ring-blue-500 focus:border-blue-500 flex-grow" />

          <button @click="newCategoryInput = !newCategoryInput"
                  type="button"
                  class="text-gray-500 hover:text-blue-600 font-bold w-6 h-6 flex items-center justify-center border rounded-full transition duration-150 flex-shrink-0"
                  :title="newCategoryInput ? 'Annuler l\'entrée' : 'Créer une nouvelle catégorie'">
            {{ newCategoryInput ? '&times;' : '+' }}
          </button>
        </div>
      </label>
      <hr class="border-gray-200 my-1">

      <label class="text-xs font-medium text-gray-600">
        Durée (jours):
        <input type="number"
               v-model.number="editingTask.durationDays"
               min="1"
               class="mt-1 p-1 border rounded-md w-full text-sm focus:ring-blue-500 focus:border-blue-500" />
      </label>

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

/* NOUVEAUX STYLES CSS POUR LE FORMULAIRE D'ÉDITION */
.gantt-edit-form {
  box-sizing: border-box;
  background-color: rgba(255, 255, 255, 0.9);

  /* Ajout de l'effet "Verre Dépoli" (Frosted Glass) */
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px); /* Pour la compatibilité Safari */

  /* Amélioration de l'ombre/profondeur */
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1),
  0 4px 6px -2px rgba(0, 0, 0, 0.05);

  /* S'assure que tout est bien centré et réactif */
  min-width: 300px;
  max-width: 90vw; /* Empêche de déborder sur les petits écrans */
}

.g text {
  font-size: 10px;
}
.task-group {
  /* Assure que le glissement vertical fonctionne */
  transform-origin: 0 0;
}
</style>
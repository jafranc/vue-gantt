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

// --- État Interne pour le Filtrage et la Couleur des Catégories ---
const localTasks = ref([]);
const selectedCategory = ref('All'); // Variable d'état interne pour le filtre

// NOUVEAU: Map pour stocker les couleurs attribuées aux catégories
// Clé: Nom de la catégorie, Valeur: Code hexadécimal de la couleur
const categoryColors = ref(new Map());

// NOUVEAU: État pour contrôler l'édition de la catégorie (sélection vs saisie)
const isCategoryEditable = ref(false);


// Palette de couleurs de base pour attribuer de nouvelles couleurs
const colorPalette = [
  '#4F46E5', // Indigo
  '#10B981', // Emerald
  '#EF4444', // Red
  '#F59E0B', // Amber
  '#06B6D4', // Cyan
  '#6366F1', // Violet
  '#EC4899', // Pink
  '#1D4ED8', // Blue
  '#D97706', // Orange
];

// NOUVEAU: Fonction pour initialiser et synchroniser les couleurs des catégories
const initializeCategoryColors = (tasks) => {
  // Ne pas appeler .clear() ici pour préserver les couleurs existantes

  const categories = new Set();
  tasks.forEach(t => {
    const category = t.category || 'Uncategorized';
    categories.add(category);
    // Assurer que chaque catégorie a une couleur attribuée
    if (!categoryColors.value.has(category)) {
      // Logique d'attribution de couleur (basée sur l'index actuel)
      const assignedColors = Array.from(categoryColors.value.values());
      let newColor = colorPalette.find(c => !assignedColors.includes(c));
      if (!newColor) {
        const index = (categories.size - 1) % colorPalette.length;
        newColor = colorPalette[index] || '#9CA3AF';
      }
      categoryColors.value.set(category, newColor);
    }
  });

  // On peut optionnellement nettoyer les couleurs des catégories qui n'existent plus
  categoryColors.value.forEach((_, category) => {
    if (!categories.has(category)) {
      categoryColors.value.delete(category);
    }
  });
};


/**
 * Fonction pour obtenir la couleur d'une catégorie.
 * Elle ne doit PAS muter categoryColors.value.
 * @param {string} categoryName - Le nom de la catégorie.
 * @returns {string} Le code couleur hexadécimal.
 */
const getCategoryColor = (categoryName) => {
  return categoryColors.value.get(categoryName) || '#9CA3AF'; // Fallback gris
};

// --- CALCUL des Catégories Uniques pour le sélecteur et l'édition ---
// Ce computed ne fait QUE calculer l'ARRAY des noms, sans muter categoryColors
const uniqueCategories = computed(() => {
  const categories = new Set();
  localTasks.value.forEach(t => {
    categories.add(t.category || 'Uncategorized');
  });
  // Retourne un tableau trié des noms de catégories uniques
  return Array.from(categories).sort();
});


// Catégories pour le FILTRE ('All' + catégories uniques)
const availableCategories = computed(() => {
  return ['All', ...uniqueCategories.value];
});


const ganttContainer = ref(null);
const availableWidth = ref(0);
const margin = { top: 40, right: 20, bottom: 30, left: 50 };
const isDragging = ref(false); // Glissement horizontal (date)
const editingTask = ref(null);

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

// Fonction utilitaire pour formater une date en YYYY-MM-DD
const formatDate = (date) => date.toISOString().split('T')[0];

// --- CALCUL DES TÂCHES FILTRÉES ---
const filteredTasks = computed(() => {
  // Utilise l'état interne selectedCategory
  if (selectedCategory.value === 'All') {
    return localTasks.value;
  }
  // Filtrage basé sur la propriété 'category' de la tâche
  return localTasks.value.filter(t => (t.category || 'Uncategorized') === selectedCategory.value);
});

// La hauteur dépend maintenant du nombre de tâches FILTRÉES
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

  // Ajout d'un tampon (par exemple, 10 jours) pour l'espace visuel
  maxDate.setDate(maxDate.getDate() + 10);

  return maxDate;
});

// --- FONCTIONS D'AJOUT/SUPPRESSION DE TÂCHES ---
const addTask = () => {
  const maxId = localTasks.value.length > 0 ? Math.max(...localTasks.value.map(t => t.id)) : 0;
  const newId = maxId + 1;

  let newTask;
  // Utilisation de la liste des catégories uniques du computed pour le défaut
  const defaultCategory = uniqueCategories.value.length > 0 ? uniqueCategories.value[0] : 'Planning';

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
      category: lastTask.category || defaultCategory,
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
      category: defaultCategory, // Catégorie par défaut
      isNew: true,
    };
  }

  localTasks.value.push(newTask);
  initializeCategoryColors(localTasks.value); // Initialiser la couleur pour la nouvelle tâche/catégorie

  emit('updateTasksOrder', localTasks.value);
};

const removeLastTask = () => {
  if (localTasks.value.length === 0) return;

  const maxId = Math.max(...localTasks.value.map(t => t.id));

  const newTasks = localTasks.value.filter(t => t.id !== maxId);
  localTasks.value = newTasks;

  initializeCategoryColors(localTasks.value); // Mettre à jour les couleurs après suppression
  emit('updateTasksOrder', localTasks.value);
}

// --- Logique de Mise à Jour Interne (handleTaskMoved) ---
const handleTaskMoved = (movedTask) => {
  const taskIndex = localTasks.value.findIndex(t => t.id === movedTask.id);

  if (taskIndex !== -1) {
    const originalTask = localTasks.value[taskIndex];

    const updatedTask = {
      ...originalTask,
      start: movedTask.newStart,
      end: movedTask.newEnd,
      category: movedTask.category || originalTask.category || 'Uncategorized', // Utiliser la catégorie mise à jour
      name: movedTask.name || originalTask.name,
    };

    const newTasks = [...localTasks.value];
    newTasks[taskIndex] = updatedTask;

    // 1. Mise à jour de l'état local pour le rendu D3
    localTasks.value = newTasks;

    // 2. Assurer que la couleur de la catégorie est à jour
    initializeCategoryColors(localTasks.value);

    // 3. Émission de l'objet de tâche complet mis à jour
    emit('taskUpdated', localTasks.value);
  }
};


// --- Fonctions d'édition/Glissement ---
const displayDurationInDays = computed(() => {
  if (!editingTask.value) return 0;
  return getDurationInDays(editingTask.value.start, editingTask.value.end);
});

// Le style est conservé pour centrer le formulaire
const editingFormStyle = computed(() => {
  if (!editingTask.value || !ganttContainer.value) return {};

  // Calculer yPos basé sur la tâche d'origine dans localTasks (non filtré)
  const task = localTasks.value.find(t => t.id === editingTask.value.id);

  if (!task || !yScale.value) return {};

  const yPos = yScale.value(task.name) || 0; // Utiliser yScale pour trouver la position verticale
  const containerWidth = ganttContainer.value.clientWidth;

  return {
    position: 'absolute',
    // Centre horizontal du conteneur (décalage de 50% du formulaire via transform)
    left: `${containerWidth / 2}px`,
    // Position verticale basée sur la tâche, ajustée par la marge du haut
    top: `${yPos + margin.top + 5}px`,
    // Centrer le formulaire sur le point 'left'
    transform: 'translateX(-50%)',
    zIndex: 30,
    minWidth: '320px',
  };
});

const xScale = ref(null);
const yScale = ref(null);

// NOUVELLE FONCTION: handleContextMenu
const handleContextMenu = (task) => {
  isDragging.value = false;

  if (editingTask.value && editingTask.value.id === task.id) {
    editingTask.value = null;
    isCategoryEditable.value = false; // Réinitialiser l'état
    return;
  }

  // Si on ouvre le formulaire, on prend la position Y de la tâche filtrée
  const yPos = yScale.value(task.name);

  if (!xScale.value || yPos === undefined) return;

  const xPos = xScale.value(new Date(task.start));

  editingTask.value = {
    id: task.id,
    name: task.name,
    start: task.start,
    end: task.end,
    durationDays: getDurationInDays(task.start, task.end),
    x: xPos,
    y: yPos,
    category: task.category || 'Uncategorized',
  };

  // Réinitialiser le mode d'édition de la catégorie à chaque ouverture
  isCategoryEditable.value = false;

  nextTick(() => {
    const inputElement = document.querySelector('.gantt-edit-form input');
    if (inputElement) {
      inputElement.focus();
    }
  });
};

watch(() => editingTask.value?.durationDays, (newDuration) => {
  if (editingTask.value && newDuration) {
    editingTask.value.end = addDaysToDate(editingTask.value.start, newDuration);
  }
});

watch(() => editingTask.value?.start, (newStart) => {
  if (editingTask.value && newStart) {
    editingTask.value.durationDays = getDurationInDays(newStart, editingTask.value.end);
    // Assurer que la fin est toujours calculée si la durée est valide
    editingTask.value.end = addDaysToDate(newStart, editingTask.value.durationDays);
  }
});

const saveDates = () => {
  // Récupérer les propriétés pertinentes du formulaire
  const { id, name, start, end, category } = editingTask.value;

  const newStart = new Date(start);
  const newEnd = new Date(end);

  if (newStart.getTime() >= newEnd.getTime()) {
    console.error("La date de début doit être strictement antérieure à la date de fin. Opération annulée.");
    return;
  }

  const taskIndex = localTasks.value.findIndex(t => t.id === id);

  if (taskIndex !== -1) {
    const updatedTask = {
      ...localTasks.value[taskIndex],
      name,
      start,
      end,
      category: category || 'Uncategorized', // Assure qu'une catégorie est toujours définie
    };

    const newTasks = [...localTasks.value];
    newTasks[taskIndex] = updatedTask;

    localTasks.value = newTasks;
    // CORRECTION CRITIQUE: Appeler la fonction d'initialisation des couleurs
    // Ici on s'assure que la nouvelle catégorie (si elle existe) a une couleur
    initializeCategoryColors(localTasks.value);

    emit('taskUpdated', localTasks.value);
  }

  editingTask.value = null;
  isCategoryEditable.value = false; // Réinitialiser l'état après la sauvegarde
};

// --- Échelles D3 ---
const setupScales = (width) => {
  const start = effectiveStartDate.value;
  const end = effectiveEndDate.value;

  xScale.value = d3.scaleTime()
      .domain([start, end])
      .range([0, width - margin.left - margin.right]);

  // Y-Scale DOMAIN utilise MAINTENANT les tâches FILTRÉES
  yScale.value = d3.scaleBand()
      .domain(Array.isArray(filteredTasks.value) ? filteredTasks.value.map(t => t.name) : [])
      .range([0, filteredTasks.value.length * 40])
      .paddingInner(0.1);
};

// --- Rendu D3 avec Drag-Reorder ---
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

  g.append('g')
      .attr('class', 'y-axis-g')
      .call(d3.axisLeft(yScale.value));

  if (!filteredTasks.value.length) return;

  // Variables pour le glissement vertical/horizontal
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
            emit('updateTasksOrder', localTasks.value);
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
            category: d.category
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
    const xEnd = xScale.value(new Date(task.end));
    const width = xEnd - xStart;
    const yPos = yScale.value(task.name);

    // NOUVEAU: Récupérer la couleur de la catégorie
    const barColor = getCategoryColor(task.category || 'Uncategorized');

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

    const rect = taskGroup.append('rect')
        .attr('x', xStart)
        .attr('y', yPos)
        .attr('width', width)
        .attr('height', yScale.value.bandwidth())
        // MODIFICATION: Utilisation de la couleur de la catégorie
        .attr('fill', barColor)
        .attr('rx', 4)
        .style('cursor', 'grab');

    dragHandler(taskGroup);

    taskGroup.append("text")
        .text(d => d.name)
        .attr("x", xStart + 5)
        .attr("y", yPos + yScale.value.bandwidth() / 2 + 5)
        .attr("fill", "black")
        .style("pointer-events", "none")
        .style("font-size", "12px");

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
    const currentIds = localTasks.value.map(t => t.id).join(',');
    const newIds = newTasks.map(t => t.id).join(',');

    // Si l'ordre ou le nombre d'éléments a changé
    if (currentIds !== newIds || newTasks.length !== localTasks.value.length) {
      localTasks.value = newTasks.map(t => ({ ...t }));
      // NOUVEAU: Appeler la fonction d'initialisation des couleurs ici
      initializeCategoryColors(localTasks.value);
      renderChart();
    } else {
      localTasks.value = newTasks.map(t => ({ ...t }));
      // NOUVEAU: Appeler la fonction d'initialisation des couleurs ici
      initializeCategoryColors(localTasks.value);
      renderChart();
    }
  } else {
    localTasks.value = [];
    initializeCategoryColors([]); // Mettre à jour les couleurs même si vide
    renderChart();
  }
}, { immediate: true, deep: true });

onMounted(() => {
  renderChart();
  window.addEventListener('resize', renderChart);
});

// Watch the local tasks, the effective dates, AND the internal selectedCategory to re-render the chart
// Retrait de 'uniqueCategories' de ce watcher, car il est un Computed qui dépend déjà de localTasks
watch([localTasks, effectiveStartDate, effectiveEndDate, selectedCategory], renderChart, { deep: true });
</script>

<template>
  <div class="gantt-wrapper relative w-full">

    <!-- Zone de contrôle des tâches et du filtre -->
    <div class="absolute top-0 right-0 z-10 flex space-x-4 items-center mr-2">

      <!-- SÉLECTEUR DE FILTRE DE CATÉGORIE -->
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

      <!-- Boutons d'Action (Ajouter/Supprimer) -->
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
      <!-- Le SVG du graphique sera rendu ici par D3 -->
      <div v-if="filteredTasks.length === 0 && localTasks.length > 0" class="absolute inset-0 flex items-center justify-center bg-gray-50/50 z-20">
        <p class="text-xl font-semibold text-gray-600 p-4 bg-white rounded-lg shadow-lg">
          Aucune tâche ne correspond au filtre '{{ selectedCategory }}'.
        </p>
      </div>
      <!-- Si le tableau local est complètement vide -->
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
        (CONSEIL: **Cliquez-droit** sur une barre de tâche pour l'éditer. **Glissez verticalement** pour réordonner (désactivé si un filtre est appliqué).)
      </p>
    </div>

    <!-- Formulaire d'édition -->
    <div v-if="editingTask"
         :style="editingFormStyle"
         class="gantt-edit-form p-4 border border-blue-400 rounded-lg shadow-xl flex flex-col space-y-2 z-50">
      <div class="text-sm font-semibold text-gray-700 mb-2">Éditer (Couleur dérivée de la Catégorie)</div>

      <label class="text-xs font-medium text-gray-600">
        Nom:
        <input type="text"
               v-model="editingTask.name"
               class="mt-1 p-1 border rounded-md w-full text-sm focus:ring-blue-500 focus:border-blue-500" />
      </label>

      <!-- CHAMP DE CATÉGORIE MODIFIÉ -->
      <label class="text-xs font-medium text-gray-600">
        Catégorie:
        <div class="flex items-center space-x-2">
          <!-- Si non éditable (par défaut): Menu Déroulant -->
          <select v-if="!isCategoryEditable"
                  v-model="editingTask.category"
                  class="mt-1 p-1 border rounded-md w-full text-sm focus:ring-blue-500 focus:border-blue-500">
            <option v-for="category in uniqueCategories" :key="category" :value="category">
              {{ category }}
            </option>
          </select>

          <!-- Si éditable (après clic sur +): Champ de Saisie Libre -->
          <input v-else
                 type="text"
                 v-model="editingTask.category"
                 class="mt-1 p-1 border rounded-md w-full text-sm focus:ring-blue-500 focus:border-blue-500"
                 placeholder="Nouvelle catégorie" />

          <!-- Bouton pour basculer en mode de saisie libre (Ajouter une nouvelle catégorie) -->
          <button v-if="!isCategoryEditable"
                  @click="isCategoryEditable = true"
                  type="button"
                  class="bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs p-1 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0"
                  title="Ajouter une nouvelle catégorie">
            +
          </button>

          <!-- Bouton pour revenir au menu déroulant -->
          <button v-else
                  @click="isCategoryEditable = false; editingTask.category = uniqueCategories.includes(editingTask.category) ? editingTask.category : uniqueCategories[0] || 'Uncategorized';"
                  type="button"
                  class="bg-gray-400 hover:bg-gray-500 text-white font-bold text-xs p-1 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0"
                  title="Retour à la sélection">
            &times;
          </button>
        </div>

        <span class="text-xs text-gray-500 mt-1 block">
            Couleur de la catégorie :
            <span class="font-bold" :style="{ color: getCategoryColor(editingTask.category || 'Uncategorized') }">
                {{ getCategoryColor(editingTask.category || 'Uncategorized') }}
            </span>
        </span>
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
        <button @click="saveDates"
                class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1 px-3 rounded-md transition duration-150">
          Valider
        </button>
      </div>

      <button @click="editingTask = null; isCategoryEditable = false" class="absolute top-1 right-1 text-gray-500 hover:text-gray-800 text-xs">
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
.task-group {
  /* Assure que le glissement vertical fonctionne */
  transform-origin: 0 0;
}
</style>

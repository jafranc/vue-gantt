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
  // Catégorie de filtre sélectionnée
  filterCategory: { type: String, default: 'All' },
});

// L'état principal des tâches est conservé localement
const localTasks = ref([]);

const ganttContainer = ref(null);
const availableWidth = ref(0);
const margin = { top: 40, right: 20, bottom: 30, left: 50 };
const isDragging = ref(false); // Glissement horizontal (date)
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

// Fonction utilitaire pour formater une date en YYYY-MM-DD
const formatDate = (date) => date.toISOString().split('T')[0];

// --- CALCUL DES TÂCHES FILTRÉES ---
const filteredTasks = computed(() => {
  if (props.filterCategory === 'All') {
    return localTasks.value;
  }
  // Filtrage basé sur la propriété 'category' de la tâche
  return localTasks.value.filter(t => t.category === props.filterCategory);
});

// La hauteur dépend maintenant du nombre de tâches FILTRÉES
const height = computed(() => Math.max(150, filteredTasks.value.length * 40 + margin.top + margin.bottom));


// --- CALCUL DES ÉCHELLES DYNAMIQUES ---
// Ces calculs restent basés sur TOUTES les tâches pour avoir une plage de temps complète
const effectiveStartDate = computed(() => {
  if (localTasks.value.length === 0) return new Date(props.startDate); // Fallback to prop default

  const dates = localTasks.value.map(t => new Date(t.start));
  return new Date(Math.min(...dates));
});

const effectiveEndDate = computed(() => {
  if (localTasks.value.length === 0) return new Date(props.endDate); // Fallback to prop default

  const dates = localTasks.value.map(t => new Date(t.end));
  const maxDate = new Date(Math.max(...dates));

  // Ajout d'un tampon (par exemple, 10 jours) pour l'espace visuel
  maxDate.setDate(maxDate.getDate() + 10);

  return maxDate;
});

// --- FONCTIONS D'AJOUT/SUPPRESSION DE TÂCHES ---
const addTask = () => {
  // 1. Déterminer le prochain ID disponible (maxId + 1)
  const maxId = localTasks.value.length > 0 ? Math.max(...localTasks.value.map(t => t.id)) : 0;
  const newId = maxId + 1;

  let newTask;

  if (localTasks.value.length > 0) {
    const lastTask = localTasks.value.find(t => t.id === maxId);

    const durationMs = new Date(lastTask.end).getTime() - new Date(lastTask.start).getTime();

    const newStart = new Date(lastTask.end);
    newStart.setDate(newStart.getDate() + 1);

    const newEnd = new Date(newStart.getTime() + durationMs);

    // Assurez-vous que la nouvelle tâche hérite des propriétés importantes mais pas de l'ID
    newTask = {
      // L'ID est garanti d'être unique (maxId + 1)
      id: newId,
      name: `Tâche Copiée ${newId}`,
      start: formatDate(newStart),
      end: formatDate(newEnd),
      color: lastTask.color || '#4F46E5', // Hériter de la couleur
      category: lastTask.category || 'Uncategorized',
      isNew: true,
    };
  } else {
    // Cas par défaut si aucune tâche n'existe
    const defaultStart = new Date();
    const defaultEnd = new Date();
    defaultEnd.setDate(defaultEnd.getDate() + 10);

    newTask = {
      id: newId,
      name: `Première Tâche ${newId}`,
      start: formatDate(defaultStart),
      end: formatDate(defaultEnd),
      color: '#4F46E5',
      category: 'Planning', // Catégorie par défaut
      isNew: true,
    };
  }

  // Mettre à jour localement l'ordre (la nouvelle tâche est ajoutée à la fin)
  localTasks.value.push(newTask);

  // Émettre le tableau complet mis à jour pour le parent
  emit('taskUpdated', localTasks.value);
};

const removeLastTask = () => {
  if (localTasks.value.length === 0) return;

  // Trouver l'ID maximum (le plus récent)
  const maxId = Math.max(...localTasks.value.map(t => t.id));

  // Mettre à jour localement
  const newTasks = localTasks.value.filter(t => t.id !== maxId);
  localTasks.value = newTasks;

  // Émettre le tableau complet mis à jour pour le parent
  emit('taskUpdated', localTasks.value);
}

// --- Logique de Mise à Jour Interne (handleTaskMoved) ---
const handleTaskMoved = (movedTask) => {
  const taskIndex = localTasks.value.findIndex(t => t.id === movedTask.id);

  if (taskIndex !== -1) {
    const updatedTask = {
      ...localTasks.value[taskIndex],
      name: movedTask.newName,
      start: movedTask.newStart,
      end: movedTask.newEnd,
    };

    const newTasks = [...localTasks.value];
    newTasks[taskIndex] = updatedTask;

    // 1. Mise à jour de l'état local pour le rendu D3
    localTasks.value = newTasks;

    // 2. Émission de l'objet de tâche complet mis à jour
    // taskUpdated est utilisé pour les changements de date/contenu
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

// NOUVELLE FONCTION: handleContextMenu (remplace handleDblClick)
const handleContextMenu = (task) => {
  // Annuler tout état de glissement possible
  isDragging.value = false;

  if (editingTask.value && editingTask.value.id === task.id) {
    editingTask.value = null; // Fermer si déjà ouvert pour la même tâche
    return;
  }

  // Assurez-vous que les échelles sont définies avant de calculer les positions
  if (!xScale.value || !yScale.value) return;

  const xPos = xScale.value(new Date(task.start));
  const yPos = yScale.value(task.name);

  // Si la tâche n'est pas dans le domaine Y (car elle est filtrée), ne pas ouvrir l'édition
  if (yPos === undefined) return;

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

watch(() => editingTask.value?.name, (newName, oldName) => {
  if (editingTask.value && newName && newName !== oldName) {
    editingTask.value.name = newName;
    // console.log(`changed name from ${oldName} to ${newName}`)
  }
});

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
    // Utiliser un message box ou un toast au lieu d'alert()
    console.warn("Erreur: La date de début doit être antérieure à la date de fin. Opération annulée.");
    return;
  }

  // Le formulaire d'édition utilise handleTaskMoved, qui émettra la tâche mise à jour.
  handleTaskMoved({
    id,
    newName: name,
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
      .attr('transform', `translate(0, ${filteredTasks.value.length * 40 || 50})`) // utilise filteredTasks.length
      .call(d3.axisBottom(xScale.value));

  // L'axe Y utilise le domaine actuel de filteredTasks.value
  g.append('g')
      .attr('class', 'y-axis-g')
      .call(d3.axisLeft(yScale.value));

  if (!filteredTasks.value.length) return;

  // Variables pour le glissement vertical/horizontal
  let isReordering = false;
  let initialX, initialY;
  let originalTaskIndex = -1; // Index dans le tableau FILTRÉ
  const rowHeight = yScale.value.step(); // Hauteur d'une ligne
  const isFilterActive = props.filterCategory !== 'All'; // Condition de filtre

  const dragHandler = d3.drag()
      .on('start', function(event, d) {
        // Empêcher le glissement si le formulaire d'édition est visible
        if (editingTask.value) {
          // S'assurer que le glissement est ignoré et que le curseur n'est pas "grabbing"
          d3.select(this).style('cursor', 'pointer');
          event.sourceEvent.stopPropagation();
          return;
        }

        isDragging.value = false;
        isReordering = false;
        initialX = event.x;
        initialY = event.y;
        // L'index d'origine est MAINTENANT dans le tableau FILTRÉ
        originalTaskIndex = filteredTasks.value.findIndex(t => t.id === d.id);

        d3.select(this)
            .raise()
            .classed('dragging', true)
            .style('cursor', 'grabbing');
      })
      .on('drag', function(event, d) {
        if (editingTask.value) return; // Empêcher le glissement si édition active

        const dx = event.x - initialX;
        const dy = event.y - initialY;

        // Déterminer le mode de glissement (date ou réorganisation)
        // La réorganisation est UNIQUEMENT possible si AUCUN filtre n'est actif
        if (Math.abs(dy) > 5 && !isFilterActive) {
          isReordering = true;
          // Déplacer la barre verticalement pour l'effet de réorganisation
          d3.select(this)
              .attr('transform', `translate(0, ${dy})`);

        } else if (Math.abs(dx) > 5 || isFilterActive) {
          // Si filtre actif, le glissement vertical est ignoré, on passe au horizontal
          isDragging.value = true;
          isReordering = false;
          // Déplacer la barre horizontalement
          const newX = xScale.value(new Date(d.start)) + dx;
          d3.select(this).select('rect').attr('x', newX);
          // Le texte doit suivre la barre
          d3.select(this).select('text').attr('x', newX + 5);
          d3.select(this).attr('transform', null);
        }
      })
      .on('end', function(event, d) {
        // Remettre le curseur à 'grab' par défaut
        d3.select(this).style('cursor', 'grab');

        if (editingTask.value) {
          // Si on termine un glissement pendant l'édition, on s'assure juste de nettoyer les classes
          d3.select(this).classed('dragging', false).attr('transform', null);
          return;
        }

        d3.select(this)
            .classed('dragging', false)
            .attr('transform', null); // Retirer la transformation de glissement

        if (isReordering && !isFilterActive) {
          // --- Logique de Réorganisation Verticale (Corrigée) ---

          // Calcul de l'index de ligne cible dans le domaine Y D3
          const finalY = yScale.value(d.name) + (event.y - initialY);
          const newRowIndex = Math.round(finalY / rowHeight);

          // Assurer que l'index reste dans les limites (index dans le tableau filteredTasks)
          const newFilteredIndex = Math.max(0, Math.min(filteredTasks.value.length - 1, newRowIndex));

          if (newFilteredIndex !== originalTaskIndex) {

            // Trouver les IDs pour la manipulation dans le tableau local (source de vérité)
            const taskIdToMove = filteredTasks.value[originalTaskIndex].id;
            const globalIndexToMove = localTasks.value.findIndex(t => t.id === taskIdToMove);

            // L'ID cible est celui qui se trouve à la nouvelle position dans le tableau FILTRÉ
            const targetTaskId = filteredTasks.value[newFilteredIndex].id;
            const globalTargetIndex = localTasks.value.findIndex(t => t.id === targetTaskId);

            const newTasksArray = [...localTasks.value];

            // 1. Extraire la tâche de son emplacement d'origine
            const [movedTask] = newTasksArray.splice(globalIndexToMove, 1);

            // 2. Insérer la tâche (avec son ID d'origine) à l'emplacement de l'ID cible
            // On insère *avant* l'élément cible, sauf si on déplace vers le bas et que l'index cible a été décalé.
            // Une simple insertion à l'index global cible est le plus sûr.
            newTasksArray.splice(globalTargetIndex, 0, movedTask);

            // 3. Mettre à jour l'état local et émettre le tableau complet
            localTasks.value = newTasksArray;
            // updateTasksOrder est émis pour signaler un changement d'ordre
            emit('updateTasksOrder', localTasks.value);
          } else {
            // Si aucune réorganisation effective, forcer le re-rendu pour remettre la barre en place
            renderChart();
          }
        } else if (isDragging.value) {
          // --- Logique de Changement de Date Horizontale ---
          const finalBarX = xScale.value(new Date(d.start)) + (event.x - initialX);

          const newStartDate = xScale.value.invert(finalBarX);
          const originalDuration = new Date(d.end).getTime() - new Date(d.start).getTime();
          const newEndDate = new Date(newStartDate.getTime() + originalDuration);

          const newStartFormatted = d3.timeFormat('%Y-%m-%d')(newStartDate);
          const newEndFormatted = d3.timeFormat('%Y-%m-%d')(newEndDate);

          handleTaskMoved({
            id: d.id,
            newName: d.name,
            newStart: newStartFormatted,
            newEnd: newEndFormatted,
          });
        } else {
          // Forcer le re-rendu si le glissement était minime pour réinitialiser la position
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
    // La position Y est calculée à l'intérieur du groupe 'g', basé sur la position dans le domaine Y
    const yPos = yScale.value(task.name);

    // Créer un groupe pour la tâche pour appliquer la transformation de réorganisation
    const taskGroup = g.append('g')
        .datum(task)
        .attr('class', 'task-group')
        // Remplacement de dblclick par contextmenu (clic droit)
        .on('contextmenu', function(event) {
          event.preventDefault(); // Empêcher le menu contextuel du navigateur
          // Stopper la propagation de l'événement natif pour D3
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
        });

    dragHandler(taskGroup); // Appliquer le drag au groupe

    taskGroup.append("text")
        .text(d => d.name)
        .attr("x", xStart + 5)
        .attr("y", yPos + yScale.value.bandwidth() / 2 + 5)
        .attr("fill", "black")
        .style("pointer-events", "none")
        .style("font-size", "12px");

    // Afficher l'icône de réorganisation désactivée si le filtre est actif
    if (isFilterActive) {
      taskGroup.append("text")
          .text("🚫")
          .attr("x", -margin.left + 5) // Positionner à gauche de l'axe Y
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
    // Si l'ordre des IDs ou le nombre de tâches change, forcer la mise à jour locale et le rendu
    const currentIds = localTasks.value.map(t => t.id).join(',');
    const newIds = newTasks.map(t => t.id).join(',');

    // Test simple pour voir si l'ordre ou le nombre d'éléments a changé
    if (currentIds !== newIds || newTasks.length !== localTasks.value.length) {
      localTasks.value = newTasks.map(t => ({ ...t }));
      renderChart();
    } else {
      // Si seul le contenu (dates, noms) a changé, mettre à jour localTasks et le rendu
      localTasks.value = newTasks.map(t => ({ ...t }));
      renderChart();
    }
  } else {
    localTasks.value = [];
    renderChart();
  }
}, { immediate: true, deep: true });

onMounted(() => {
  renderChart();
  window.addEventListener('resize', renderChart);
});

// Watch the local tasks, the effective dates, AND the filterCategory to re-render the chart
watch([() => localTasks.value, effectiveStartDate, effectiveEndDate, () => props.filterCategory], renderChart, { deep: true });
</script>

<template>
  <div class="gantt-wrapper relative w-full">

    <!-- ZONE DES BOUTONS D'ACTION (Ajouter/Supprimer) -->
    <div class="absolute top-0 right-0 z-10 flex space-x-2 mr-2">
      <!-- Bouton Ajouter (Plus) -->
      <button @click="addTask"
              class="bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-2 rounded-full shadow-lg transition duration-150 text-lg leading-none w-8 h-8 flex items-center justify-center"
              title="Ajouter une nouvelle tâche (copie de la dernière)">
        +
      </button>

      <!-- Bouton Supprimer (Moins) - Supprime la tâche avec l'ID max -->
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
        <p class="text-xl font-semibold text-gray-600 p-4 bg-white rounded-lg shadow-lg">Aucune tâche ne correspond au filtre sélectionné.</p>
      </div>
    </div>

    <div>
      <p class="text-xs text-gray-500 mt-2">
        Dates du graphique calculées :
        {{ d3.timeFormat('%Y-%m-%d')(effectiveStartDate) }} à
        {{ d3.timeFormat('%Y-%m-%d')(effectiveEndDate) }}
      </p>
      <p class="text-xs text-blue-500 font-medium">
        (CONSEIL: **Cliquez-droit** sur une barre de tâche pour l'éditer. **Glissez verticalement** pour réordonner.)
      </p>
    </div>

    <!-- Tooltip pour le survol (Géré en interne) -->
<!--    <div v-if="hoveredTask"-->
<!--         :style="tooltipStyle"-->
<!--         class="bg-gray-800 text-white text-xs p-2 rounded-lg shadow-xl opacity-90 transition duration-150 z-40">-->
<!--      <div class="font-bold mb-1">{{ hoveredTask.name }}</div>-->
<!--      <div>Catégorie: {{ hoveredTask.category || 'N/A' }}</div>-->
<!--      <div>Début: {{ hoveredTask.start }}</div>-->
<!--      <div>Fin: {{ hoveredTask.end }}</div>-->
<!--      <div class="mt-1 font-medium">Durée: {{ getDurationInDays(hoveredTask.start, hoveredTask.end) }} jours</div>-->
<!--    </div>-->

    <!-- Formulaire d'édition -->
    <div v-if="editingTask"
         :style="editingFormStyle"
         class="gantt-edit-form p-4 border border-blue-400 rounded-lg shadow-xl flex flex-col space-y-2 z-50">
      <div class="text-sm font-semibold text-gray-700 mb-2">Éditer: {{ editingTask.name }}</div>
<!--      <div class="text-sm font-semibold text-gray-700 mb-2">Éditer: {{ editingTask.name }}</div>-->

      <label class="text-xs font-medium text-gray-600">
        Nom:
        <input type="text"
               v-model.trim="editingTask.name"
               class="mt-1 p-1 border rounded-md w-full text-sm focus:ring-blue-500 focus:border-blue-500" />
      </label>

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
.task-group {
  /* Assure que le glissement vertical fonctionne */
  transform-origin: 0 0;
}
</style>
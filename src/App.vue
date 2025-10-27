<script setup>
import { ref, watch, computed } from 'vue';
import GanttChart from './components/GanttChart.vue';

// 1. Déclarez le tableau de tâches réactif, c'est la source de vérité.
const tasks = ref([
  { id: 1, name: 'Initialisation du Projet', start: '2013-01-01', end: '2013-01-15', color: '#4F46E5', isNew: false, category: 'Planning' },
  { id: 2, name: 'Analyse des Besoins', start: '2013-01-16', end: '2013-02-10', color: '#10B981', isNew: false, category: 'Planning' },
  { id: 3, name: 'Phase de Développement', start: '2013-02-11', end: '2013-04-20', color: '#EF4444', isNew: false, category: 'Execution' },
  { id: 4, name: 'Tests Unitaires', start: '2013-04-21', end: '2013-05-15', color: '#F59E0B', isNew: false, category: 'Quality' },
  { id: 5, name: 'Déploiement en Production', start: '2013-05-16', end: '2013-05-25', color: '#3B82F6', isNew: false, category: 'Execution' },
  { id: 6, name: 'Documentation', start: '2013-05-26', end: '2013-06-05', color: '#A855F7', isNew: false, category: 'Quality' },
]);

// NOUVEL ÉTAT DE FILTRE
const filterCategory = ref('All'); // 'All' par défaut

const availableCategories = computed(() => {
  const categories = new Set(tasks.value.map(t => t.category).filter(c => c));
  return ['All', ...Array.from(categories)].sort();
});

// Fonction utilitaire pour formater une date en YYYY-MM-DD
const formatDate = (date) => date.toISOString().split('T')[0];

// --- PROPRIÉTÉS CALCULÉES POUR LA PLAGE DE DATES DU GRAPHIQUE ---
const projectStart = computed(() => {
  if (tasks.value.length === 0) return '2013-01-01';
  const dates = tasks.value.map(t => new Date(t.start));
  const minDate = new Date(Math.min(...dates));
  return formatDate(minDate);
});

const projectEnd = computed(() => {
  if (tasks.value.length === 0) return '2013-05-01';
  const dates = tasks.value.map(t => new Date(t.end));
  const maxDate = new Date(Math.max(...dates));
  // Ajouter un tampon (e.g., 10 jours) pour la visibilité
  maxDate.setDate(maxDate.getDate() + 10);
  return formatDate(maxDate);
});


// --- HANDLERS POUR L'AJOUT/SUPPRESSION/RÉORGANISATION DE TÂCHES ---

// Gestionnaire unique pour toutes les modifications d'array (Ajout, Suppression, Réorganisation)
const handleTaskUpdate = (newTasks) => {
  // Le GanttChart effectue la modification et nous envoie le nouvel array complet.
  if (Array.isArray(newTasks)) {

    // Mettre à jour l'état local du parent avec le nouvel array provenant du GanttChart
    tasks.value = newTasks;

    // Log pour le débogage
    console.log(`Mise à jour de l'état des tâches reçue. Nouvelle taille: ${newTasks.length}`);
  }
};

// État pour stocker et afficher toutes les tâches mises à jour (démo)
const allTasksState = ref(tasks.value);

// État pour mettre en évidence la dernière tâche modifiée (par ID)
const lastModifiedTaskId = ref(null);

/**
 * Logique de détection des modifications : elle s'exécute automatiquement
 * après que v-model:tasks ait mis à jour tasks.value.
 */
watch(tasks, (newTasks, oldTasks) => {
  // 1. Mettre à jour l'état de la démo/affichage
  allTasksState.value = newTasks;

  // Logique pour détecter l'ID modifié et déclencher l'effet visuel
  const oldTaskMap = new Map(oldTasks.map(t => [t.id, JSON.stringify({ name: t.name, start: t.start, end: t.end, category: t.category })]));
  let modifiedId = null;

  for (const newTask of newTasks) {
    const newTaskString = JSON.stringify({ name: newTask.name, start: newTask.start, end: newTask.end, category: newTask.category });

    // Vérifier si les données d'une tâche existante ont changé
    if (oldTaskMap.has(newTask.id) && oldTaskMap.get(newTask.id) !== newTaskString) {
      modifiedId = newTask.id;
      break;
    }
    // Tâche ajoutée
    else if (!oldTaskMap.has(newTask.id) && newTask.id > 0) {
      modifiedId = newTask.id;
      break;
    }
  }

  // Tâche supprimée
  if (oldTasks.length > newTasks.length) {
    const oldIds = oldTasks.map(t => t.id);
    const newIds = newTasks.map(t => t.id);
    modifiedId = oldIds.find(id => !newIds.includes(id));
  }

  // Tâche réorganisée (si rien d'autre n'a été détecté)
  const oldIdOrder = oldTasks.map(t => t.id).join(',');
  const newIdOrder = newTasks.map(t => t.id).join(',');
  if (oldTasks.length === newTasks.length && oldIdOrder !== newIdOrder && modifiedId === null) {
    // Pour la réorganisation, marquer simplement la première tâche déplacée
    modifiedId = newTasks[0]?.id || null;
    if (modifiedId) console.log("Réorganisation d'ordre détectée.");
  }


  lastModifiedTaskId.value = modifiedId;

  console.log(`Synchronisation réussie via v-model. Tâche mise à jour ID: ${modifiedId}`);
}, { deep: true }); // Ensure deep watch for array changes

// Réinitialiser la mise en évidence après un court délai pour l'effet visuel
watch(lastModifiedTaskId, (newId) => {
  if (newId !== null) {
    setTimeout(() => {
      lastModifiedTaskId.value = null;
    }, 3000);
  }
});
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-3xl font-bold mb-6 text-gray-800">Diagramme de Gantt (Parent App)</h1>

    <!-- ZONE DE FILTRAGE -->
    <div class="mb-4 flex items-center space-x-3">
      <label for="category-filter" class="text-sm font-medium text-gray-700">Filtrer par Catégorie:</label>
      <select id="category-filter"
              v-model="filterCategory"
              class="mt-1 block w-48 py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
        <option v-for="cat in availableCategories" :key="cat" :value="cat">
          {{ cat }}
        </option>
      </select>
      <p class="text-xs text-gray-500" v-if="filterCategory !== 'All'">
        Réorganisation (drag-reorder) est désactivée en mode filtré.
      </p>
    </div>

    <!-- Passer filterCategory à GanttChart -->
    <GanttChart
        :tasks="tasks"
        :startDate="projectStart"
        :endDate="projectEnd"
        :filterCategory="filterCategory"
        @taskUpdated="handleTaskUpdate"
        class="bg-white p-4 shadow-lg rounded-lg relative"
    />

    <!-- Affichage de l'état actuel de toutes les tâches (pour le débogage) -->
    <div class="mt-8 p-4 border-l-4 border-blue-500 bg-blue-50 rounded-r-lg">
      <h2 class="text-xl font-semibold text-blue-800 mb-4">Statut de la Source de Données (Synchronisé avec le Gantt)</h2>
      <!-- Afficher les dates calculées pour le débogage -->
      <p class="mb-4 text-sm text-blue-700 font-medium">
        Période calculée : {{ projectStart }} à {{ projectEnd }}
      </p>

      <div class="space-y-4">
        <div
            v-for="task in allTasksState"
            :key="task.id"
            :class="[
            'p-3 rounded-lg flex justify-between items-center transition-all duration-300 shadow-md',
            task.id === lastModifiedTaskId
              ? 'bg-yellow-300 border-yellow-500 border-2 scale-[1.01]'
              : 'bg-white border border-gray-200'
          ]"
        >
          <div class="font-bold text-gray-700 w-1/4">{{ task.id }} - {{ task.name }}</div>
          <div class="text-sm font-medium w-1/4 text-gray-500">
            Catégorie: {{ task.category || 'N/A' }}
          </div>
          <div class="flex flex-col text-sm w-1/2 ml-4">
            <div class="text-green-600">
              Début : <span :class="{'font-extrabold': task.id === lastModifiedTaskId}">{{ task.start }}</span>
            </div>
            <div class="text-red-600">
              Fin : <span :class="{'font-extrabold': task.id === lastModifiedTaskId}">{{ task.end }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>
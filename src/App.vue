<script setup>
import { ref, watch } from 'vue';
// Assurez-vous que le chemin d'importation est correct
import GanttChart from './components/GanttChart.vue';

// 1. Déclarez le tableau de tâches réactif, c'est la source de vérité.
const tasks = ref([
  { id: 1, name: 'Initialisation du Projet', start: '2013-01-01', end: '2013-01-15', color: '#4F46E5', isNew: false },
  { id: 2, name: 'Analyse des Besoins', start: '2013-01-16', end: '2013-02-10', color: '#10B981', isNew: false },
  { id: 3, name: 'Phase de Développement', start: '2013-02-11', end: '2013-04-20', color: '#EF4444', isNew: false },
]);

const projectStart = ref('2013-01-01');
const projectEnd = ref('2013-05-01');

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

  // Détecter quelle tâche a été modifiée (simple comparaison de tableau)
  // On utilise oldTasks (l'ancienne référence du tableau) pour la comparaison.
  const oldTaskMap = new Map(oldTasks.map(t => [t.id, t.start + t.end]));
  let modifiedId = null;

  for (const newTask of newTasks) {
    if (oldTaskMap.get(newTask.id) !== (newTask.start + newTask.end)) {
      modifiedId = newTask.id;
      break;
    }
  }

  // Mettre à jour l'ID modifié pour la mise en évidence visuelle
  lastModifiedTaskId.value = modifiedId;

  console.log(`Synchronisation réussie via v-model. Tâche modifiée ID: ${modifiedId}`);
});

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

    <!-- Utilisation de v-model:tasks pour lier les données bidirectionnellement. -->
    <GanttChart
        v-model:tasks="tasks"
        :startDate="projectStart"
        :endDate="projectEnd"
        class="bg-white p-4 shadow-lg rounded-lg"
    />

    <!-- Affichage de l'état actuel de toutes les tâches (pour le débogage) -->
    <div class="mt-8 p-4 border-l-4 border-blue-500 bg-blue-50 rounded-r-lg">
      <h2 class="text-xl font-semibold text-blue-800 mb-4">Statut de la Source de Données (Synchronisé avec le Gantt)</h2>

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
          <div class="font-bold text-gray-700 w-1/3">{{ task.id }} - {{ task.name }}</div>
          <div class="flex flex-col text-sm w-2/3 ml-4">
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
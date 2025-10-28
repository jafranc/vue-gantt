<script setup>
import { ref, watch } from 'vue';
// Assurez-vous que le chemin d'importation est correct
import GanttChart from './components/GanttChart.vue';

// 1. Déclarez le tableau de tâches réactif, c'est la source de vérité.
const tasks = ref([
  { id: 1, name: 'Initialisation du Projet', start: '2013-01-01', end: '2013-01-15', category: 'Planning', isNew: false },
  { id: 2, name: 'Analyse des Besoins', start: '2013-01-16', end: '2013-02-10', category: 'Planning', isNew: false },
  { id: 3, name: 'Phase de Développement', start: '2013-02-11', end: '2013-04-20', category: 'Dev', isNew: false },
  { id: 4, name: 'Tests Unitaires', start: '2013-04-21', end: '2013-04-30', category: 'QA', isNew: false },
  { id: 5, name: 'Déploiement Initial', start: '2013-05-01', end: '2013-05-15', category: 'Livrable', isNew: false },
  { id: 6, name: 'Documentation Finale', start: '2013-04-10', end: '2013-05-10', category: 'QA', isNew: false },
  { id: 7, name: 'Recette Client', start: '2013-05-16', end: '2013-05-30', category: 'Livrable', isNew: false },
]);

const projectStart = ref('2013-01-01');
const projectEnd = ref('2013-06-15'); // Étend la date de fin pour l'exemple

// État pour stocker et afficher toutes les tâches mises à jour (démo)
const allTasksState = ref(tasks.value);

// État pour mettre en évidence la dernière tâche modifiée (par ID)
const lastModifiedTaskId = ref(null);

/**
 * Logique de détection des modifications : elle s'exécute automatiquement
 * après que v-model:tasks ait mis à jour tasks.
 */
watch(tasks, (newTasks, oldTasks) => {
  // 1. Mise à jour de l'état affiché pour le débogage
  allTasksState.value = newTasks;

  // 2. Détection du changement de contenu (Date/Nom/Couleur)
  // On compare les tâches une par une pour trouver la dernière modifiée
  let modifiedId = null;

  // Si le nombre de tâches est différent (ajout/suppression), on ne peut pas comparer facilement,
  // donc on met en évidence la dernière tâche du nouveau tableau
  if (newTasks.length !== oldTasks.length) {
    modifiedId = newTasks[newTasks.length - 1]?.id || null;
  } else {
    // Parcours les nouveaux éléments pour trouver celui qui a changé (même ID, contenu différent)
    for (let i = 0; i < newTasks.length; i++) {
      const newTask = newTasks[i];
      const oldTask = oldTasks.find(t => t.id === newTask.id);

      // Vérifie si la tâche existe et si son contenu (hors isNew) a changé
      if (oldTask && (
          newTask.name !== oldTask.name ||
          newTask.start !== oldTask.start ||
          newTask.end !== oldTask.end ||
          newTask.category !== oldTask.category
      )) {
        modifiedId = newTask.id;
        break;
      }
    }

    // Détection de réorganisation : l'ID de la tâche à l'index i a changé
    // Cela signifie qu'une réorganisation verticale a eu lieu.
    if (!modifiedId) {
      for (let i = 0; i < newTasks.length; i++) {
        if (newTasks[i].id !== oldTasks[i]?.id) {
          // Si l'ordre a changé, on met en évidence la tâche qui a été déplacée (ici, on prend la première différente)
          modifiedId = newTasks[i].id;
          break;
        }
      }
    }
  }

  lastModifiedTaskId.value = modifiedId;
}, { deep: true });


</script>

<template>
  <div class="min-h-screen bg-gray-100 p-8 font-sans antialiased">
    <header class="mb-8 text-center">
      <h1 class="text-4xl font-extrabold text-gray-800 tracking-tight">
        Planificateur de Projet Interactif (Gantt D3)
      </h1>
      <p class="text-lg text-gray-500 mt-2">
        Vue 3, D3.js et Tailwind CSS
      </p>
    </header>

    <main class="max-w-7xl mx-auto bg-white p-6 rounded-xl shadow-2xl">
      <!--
        Le composant GanttChart utilise v-model:tasks pour lier les données bidirectionnellement.

        Lorsque GanttChart émet 'update:tasks', il met à jour ce tableau 'tasks.value'.
        Lorsque GanttChart émet 'taskUpdated' ou 'updateTasksOrder', il met à jour le tableau complet
        et le watcher ci-dessus est activé pour détecter la modification.
      -->
      <GanttChart
          v-model:tasks="tasks"
          :startDate="projectStart"
          :endDate="projectEnd"
          class="p-4 rounded-lg"
      />

    </main>
  </div>
</template>

<style>
/* Styles globaux pour l'application, utilisant la police par défaut
  (Inter via Tailwind)
*/
</style>
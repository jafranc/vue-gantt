// import Vue from 'vue'
// import AppVue from './App.vue.kp'
// import flatPickr from 'vue-flatpickr-component'
//
// import './styles/app.scss'
// import 'flatpickr/dist/flatpickr.css'
//
// Vue.config.productionTip = false
//
// Vue.use(require('vue-moment'))
//
// Vue.component('flatPickr', flatPickr)
//
// new Vue({
// 	render: h => h(AppVue)
// }).$mount('#app')
import { createApp } from 'vue'
import App from './App.vue'

// Crée et monte l'application racine
createApp(App).mount('#app')

import { createRouter, createWebHashHistory } from 'vue-router'
import Settings from './components/Settings.vue'
import Backup from './components/Backup.vue'
import Download from './components/Download.vue'
import DownloadManager from './components/DownloadManager.vue'
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/settings'
    },
    {
      path: '/settings',
      name: 'settings',
      component: Settings
    },
    {
      path: '/backup',
      name: 'backup',
      component: Backup
    },
    {
      path: '/download',
      name: 'download',
      component: Download
    },
    {
      path: '/download-manager',
      name: 'download-manager',
      component: DownloadManager
    }
  ]
})

export default router

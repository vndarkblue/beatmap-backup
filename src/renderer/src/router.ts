import { createRouter, createWebHashHistory } from 'vue-router'
import Settings from './components/Settings.vue'
// import BeatmapFilter from './components/BeatmapFilter.vue'

// Define route types
export interface RouteItem {
  title: string
  icon: string
  to: string
  name: string
}

// Define routes with metadata
export const routes: RouteItem[] = [
  {
    title: 'navigation.settings',
    icon: 'mdi-cog',
    to: '/settings',
    name: 'settings'
  },
  {
    title: 'navigation.backup',
    icon: 'mdi-export',
    to: '/backup',
    name: 'backup'
  },
  {
    title: 'navigation.download',
    icon: 'mdi-download',
    to: '/download',
    name: 'download'
  }
  // {
  //   title: 'navigation.beatmapFilter',
  //   icon: 'mdi-filter-variant',
  //   to: '/filter',
  //   name: 'filter'
  // }
]

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
      component: () => import('./components/Backup.vue')
    },
    {
      path: '/download',
      name: 'download',
      component: () => import('./components/Download.vue')
    }
    // {
    //   path: '/filter',
    //   name: 'filter',
    //   component: BeatmapFilter
    // }
  ]
})

// Add navigation guard to ensure proper route handling
router.beforeEach((_to, _from, next) => {
  // Force a small delay to ensure proper state updates
  setTimeout(() => {
    next()
  }, 0)
})

export default router

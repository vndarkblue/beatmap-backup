import { setupPortableUserData } from './portable'

// Execute immediately when imported to ensure userData is configured
// before subsequent static module imports initialize electron-store
setupPortableUserData()

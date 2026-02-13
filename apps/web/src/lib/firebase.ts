import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyD4ANubVvLyLj7-X7RYxuXpTyFZxxR8aB4',
  authDomain: 'fitness-tracker-app-54933.firebaseapp.com',
  projectId: 'fitness-tracker-app-54933',
  storageBucket: 'fitness-tracker-app-54933.firebasestorage.app',
  messagingSenderId: '500892781819',
  appId: '1:500892781819:web:e4ff8e8ba16d40ac0a345e',
  measurementId: 'G-XT8RLJ7YF7',
} as const

let app: FirebaseApp

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig)
} else {
  app = getApp()
}

export const firebaseApp = app
export const auth: Auth = getAuth(app)
export const db: Firestore = getFirestore(app)

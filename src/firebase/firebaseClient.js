import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

/**
 * Firebase Web configuration identifies this public client application. These
 * values are not administrator credentials; Firebase Auth and Firestore Rules
 * remain the authorization boundaries for remote data access.
 */
const FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyB02b9MveXGa_3m4E2VgJKGF76bz4gN0dI',
  authDomain: 'fit5032-7b50f.firebaseapp.com',
  projectId: 'fit5032-7b50f',
  storageBucket: 'fit5032-7b50f.firebasestorage.app',
  messagingSenderId: '308362338146',
  appId: '1:308362338146:web:7629d332404108796cd63b',
})

const firebaseApp = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp()

export const firebaseAuth = getAuth(firebaseApp)
export const firestore = getFirestore(firebaseApp)

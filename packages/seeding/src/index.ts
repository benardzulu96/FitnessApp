import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

async function main(): Promise<void> {
  const app = initializeApp({
    credential: applicationDefault(),
  })

  const db = getFirestore(app)

  // TODO: Implement fitness tracker seed data
  console.log('Seeding script placeholder. Firestore project ID:', db.projectId)
}

void main().catch(error => {
  console.error('Seeding failed', error)
  process.exitCode = 1
})


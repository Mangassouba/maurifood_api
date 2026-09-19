require('dotenv').config({ quiet: true })
const app = require('./app')
const { expireOverdueSubscriptions } = require('./jobs/subscriptionExpiry')

const PORT = process.env.PORT || 4000
const SUBSCRIPTION_CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 heure

app.listen(PORT, () => {
  console.log(`API MauriFood lancée sur http://localhost:${PORT}`)
})

expireOverdueSubscriptions().catch((err) =>
  console.error('[subscriptions] Échec de la vérification des abonnements expirés', err),
)
setInterval(() => {
  expireOverdueSubscriptions().catch((err) =>
    console.error('[subscriptions] Échec de la vérification des abonnements expirés', err),
  )
}, SUBSCRIPTION_CHECK_INTERVAL_MS)

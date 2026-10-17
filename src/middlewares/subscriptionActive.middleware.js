const { eq } = require('drizzle-orm')
const db = require('../config/db')
const { subscriptions } = require('../db/schema')

// Bloque l'accès au dashboard quand l'abonnement du restaurant est expiré.
// Un restaurant sans abonnement (nouvelle inscription en attente de validation)
// garde l'accès pour pouvoir préparer son menu.
async function subscriptionActive(req, res, next) {
  const [subscription] = await db
    .select({ status: subscriptions.status, currentPeriodEnd: subscriptions.currentPeriodEnd })
    .from(subscriptions)
    .where(eq(subscriptions.restaurantId, req.restaurantId))

  // Comparaison sur la date en plus du statut : le job d'expiration ne tourne
  // qu'une fois par heure et ne traite pas les abonnements à l'essai.
  const expired =
    subscription &&
    (['past_due', 'cancelled'].includes(subscription.status) ||
      (subscription.currentPeriodEnd && subscription.currentPeriodEnd < new Date()))

  if (expired) {
    return res.status(402).json({
      error: 'Votre abonnement a expiré. Renouvelez-le pour accéder au tableau de bord.',
      code: 'SUBSCRIPTION_EXPIRED',
    })
  }
  next()
}

module.exports = subscriptionActive

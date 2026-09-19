const { and, eq, lt } = require('drizzle-orm')
const db = require('../config/db')
const { subscriptions, restaurants } = require('../db/schema')
const { logActivity } = require('../lib/activityLog')

// Désactive automatiquement les restaurants dont l'abonnement est arrivé à
// échéance (currentPeriodEnd dépassé) sans avoir été renouvelé.
async function expireOverdueSubscriptions() {
  const now = new Date()

  const overdue = await db
    .select({
      id: subscriptions.id,
      restaurantId: subscriptions.restaurantId,
      restaurantName: restaurants.name,
    })
    .from(subscriptions)
    .innerJoin(restaurants, eq(restaurants.id, subscriptions.restaurantId))
    .where(and(eq(subscriptions.status, 'active'), lt(subscriptions.currentPeriodEnd, now)))

  for (const sub of overdue) {
    await db.update(subscriptions).set({ status: 'past_due' }).where(eq(subscriptions.id, sub.id))
    await db
      .update(restaurants)
      .set({ isActive: false })
      .where(eq(restaurants.id, sub.restaurantId))
    await logActivity({
      action: 'subscription.expired',
      message: `Abonnement expiré — ${sub.restaurantName} désactivé automatiquement`,
      restaurantId: sub.restaurantId,
    })
  }

  if (overdue.length > 0) {
    console.log(
      `[subscriptions] ${overdue.length} abonnement(s) expiré(s) — restaurant(s) désactivé(s).`,
    )
  }
}

module.exports = { expireOverdueSubscriptions }

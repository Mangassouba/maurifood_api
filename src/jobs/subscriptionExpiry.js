const { and, eq, inArray, lt } = require('drizzle-orm')
const db = require('../config/db')
const { subscriptions, restaurants } = require('../db/schema')
const { logActivity } = require('../lib/activityLog')
const { notifyRestaurant } = require('../lib/restaurantNotify')

// Désactive automatiquement les restaurants dont l'abonnement ou l'essai
// gratuit est arrivé à échéance (currentPeriodEnd dépassé) sans avoir été renouvelé.
async function expireOverdueSubscriptions() {
  const now = new Date()

  const overdue = await db
    .select({
      id: subscriptions.id,
      restaurantId: subscriptions.restaurantId,
      restaurantName: restaurants.name,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .innerJoin(restaurants, eq(restaurants.id, subscriptions.restaurantId))
    .where(
      and(
        inArray(subscriptions.status, ['active', 'trialing']),
        lt(subscriptions.currentPeriodEnd, now),
      ),
    )

  for (const sub of overdue) {
    const isTrial = sub.status === 'trialing'
    await db.update(subscriptions).set({ status: 'past_due' }).where(eq(subscriptions.id, sub.id))
    await db
      .update(restaurants)
      .set({ isActive: false })
      .where(eq(restaurants.id, sub.restaurantId))
    await logActivity({
      action: 'subscription.expired',
      message: isTrial
        ? `Essai gratuit terminé — ${sub.restaurantName} désactivé automatiquement`
        : `Abonnement expiré — ${sub.restaurantName} désactivé automatiquement`,
      restaurantId: sub.restaurantId,
    })
    await notifyRestaurant({
      restaurantId: sub.restaurantId,
      type: 'subscription.expired',
      message: isTrial
        ? 'Votre essai gratuit est terminé. Choisissez une formule pour rendre votre restaurant à nouveau visible.'
        : 'Votre abonnement a expiré. Renouvelez-le pour rendre votre restaurant à nouveau visible.',
      link: '/dashboard/subscription',
    })
  }

  if (overdue.length > 0) {
    console.log(
      `[subscriptions] ${overdue.length} abonnement(s) expiré(s) — restaurant(s) désactivé(s).`,
    )
  }
}

module.exports = { expireOverdueSubscriptions }

const { eq, and } = require('drizzle-orm')
const db = require('../config/db')
const { restaurants, subscriptions, notifications, plans } = require('../db/schema')
const { logActivity } = require('../lib/activityLog')

async function listRestaurants(req, res) {
  const items = await db.query.restaurants.findMany({
    with: { subscription: { with: { plan: true } } },
    orderBy: (restaurants, { desc }) => [desc(restaurants.createdAt)],
  })
  res.json(items)
}

async function setRestaurantActive(req, res) {
  const [restaurant] = await db
    .update(restaurants)
    .set({ isActive: req.body.isActive })
    .where(eq(restaurants.id, Number(req.params.id)))
    .returning()

  await logActivity({
    action: restaurant.isActive ? 'restaurant.activated' : 'restaurant.deactivated',
    message: `${restaurant.name} ${restaurant.isActive ? 'activé' : 'désactivé'}`,
    restaurantId: restaurant.id,
    actorId: req.user.id,
  })

  res.json(restaurant)
}

// Activation manuelle de l'abonnement après paiement hors-ligne (virement, cash...)
async function upsertSubscription(req, res) {
  const restaurantId = Number(req.params.id)
  const { planId, status, currentPeriodStart, currentPeriodEnd } = req.body
  const data = {
    restaurantId,
    planId,
    status,
    currentPeriodStart: currentPeriodStart ? new Date(currentPeriodStart) : null,
    currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null,
  }

  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.restaurantId, restaurantId))

  const [subscription] = existing
    ? await db
        .update(subscriptions)
        .set(data)
        .where(eq(subscriptions.restaurantId, restaurantId))
        .returning()
    : await db.insert(subscriptions).values(data).returning()

  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId))
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId))
  await logActivity({
    action: 'subscription.updated',
    message: `Abonnement de ${restaurant?.name} mis à jour : formule ${plan?.name}, statut ${status}`,
    restaurantId,
    actorId: req.user.id,
  })

  // Un abonnement réactivé rouvre automatiquement le restaurant au public
  // et solde les demandes de renouvellement en attente.
  if (status === 'active') {
    await db.update(restaurants).set({ isActive: true }).where(eq(restaurants.id, restaurantId))
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.restaurantId, restaurantId), eq(notifications.isRead, false)))
  }

  res.json(subscription)
}

async function listActivityLogs(req, res) {
  const items = await db.query.activityLogs.findMany({
    orderBy: (activityLogs, { desc }) => [desc(activityLogs.createdAt)],
    limit: 100,
    with: { restaurant: { columns: { id: true, name: true, slug: true } } },
  })
  res.json(items)
}

module.exports = {
  listRestaurants,
  setRestaurantActive,
  upsertSubscription,
  listActivityLogs,
}

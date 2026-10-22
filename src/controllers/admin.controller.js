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

// Ajoute des mois en restant sur le dernier jour du mois si besoin
// (31 janvier + 1 mois = 28/29 février, et non 3 mars).
function addMonths(date, months) {
  const result = new Date(date)
  const day = result.getDate()
  result.setDate(1)
  result.setMonth(result.getMonth() + months)
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(day, lastDay))
  return result
}

// Activation manuelle de l'abonnement après paiement hors-ligne (virement, cash...)
async function upsertSubscription(req, res) {
  const restaurantId = Number(req.params.id)
  const { planId, status, renew, currentPeriodStart, currentPeriodEnd } = req.body

  const [plan] = await db.select().from(plans).where(eq(plans.id, planId))
  if (!plan) {
    return res.status(400).json({ error: 'Formule introuvable' })
  }

  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.restaurantId, restaurantId))

  const data = { restaurantId, planId, status }
  if (currentPeriodStart || currentPeriodEnd) {
    data.currentPeriodStart = currentPeriodStart ? new Date(currentPeriodStart) : null
    data.currentPeriodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null
  } else if (status === 'active' && renew) {
    // Nouvelle période calculée selon la durée de la formule choisie. Sans
    // `renew`, les dates actuelles sont conservées (simple changement de
    // formule ou de statut). Un
    // renouvellement anticipé prolonge la période en cours au lieu de repartir
    // d'aujourd'hui, pour que le restaurant ne perde pas ses jours restants.
    const now = new Date()
    const stillRunning = existing?.currentPeriodEnd && existing.currentPeriodEnd > now
    data.currentPeriodStart = stillRunning ? existing.currentPeriodStart : now
    data.currentPeriodEnd = addMonths(
      stillRunning ? existing.currentPeriodEnd : now,
      plan.durationMonths,
    )
  }

  const [subscription] = existing
    ? await db
        .update(subscriptions)
        .set(data)
        .where(eq(subscriptions.restaurantId, restaurantId))
        .returning()
    : await db.insert(subscriptions).values(data).returning()

  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId))
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

  // À l'inverse, un abonnement suspendu ou annulé retire le restaurant du public,
  // comme le fait le job d'expiration automatique.
  if (['past_due', 'cancelled'].includes(status)) {
    await db.update(restaurants).set({ isActive: false }).where(eq(restaurants.id, restaurantId))
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

const { and, eq, desc } = require('drizzle-orm')
const db = require('../config/db')
const { notifications, restaurantNotifications, restaurants, plans } = require('../db/schema')
const { logActivity } = require('../lib/activityLog')

// --- Côté restaurant (dashboard) ---

async function createRenewalRequest(req, res) {
  const { planId } = req.body
  if (!planId) {
    return res.status(400).json({ error: 'Formule requise' })
  }

  const [restaurant] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, req.restaurantId))
  const [plan] = await db.select().from(plans).where(eq(plans.id, Number(planId)))
  if (!plan) {
    return res.status(400).json({ error: 'Formule introuvable' })
  }

  const message = `${restaurant.name} demande l'activation de la formule ${plan.name} (${plan.price} MRU).`

  const [created] = await db
    .insert(notifications)
    .values({ restaurantId: req.restaurantId, planId: plan.id, message })
    .returning()

  await logActivity({
    action: 'renewal.requested',
    message,
    restaurantId: req.restaurantId,
    actorId: req.user.id,
  })

  res.status(201).json(created)
}

async function listForRestaurant(req, res) {
  const items = await db
    .select()
    .from(restaurantNotifications)
    .where(eq(restaurantNotifications.restaurantId, req.restaurantId))
    .orderBy(desc(restaurantNotifications.createdAt))
    .limit(50)
  res.json(items)
}

async function markReadForRestaurant(req, res) {
  const [updated] = await db
    .update(restaurantNotifications)
    .set({ isRead: true })
    .where(
      and(
        eq(restaurantNotifications.id, Number(req.params.id)),
        eq(restaurantNotifications.restaurantId, req.restaurantId),
      ),
    )
    .returning()

  if (!updated) return res.status(404).json({ error: 'Notification introuvable' })
  res.json(updated)
}

async function markAllReadForRestaurant(req, res) {
  await db
    .update(restaurantNotifications)
    .set({ isRead: true })
    .where(
      and(
        eq(restaurantNotifications.restaurantId, req.restaurantId),
        eq(restaurantNotifications.isRead, false),
      ),
    )
  res.status(204).end()
}

// --- Côté super admin ---

async function listForAdmin(req, res) {
  const items = await db.query.notifications.findMany({
    orderBy: [desc(notifications.isRead), desc(notifications.createdAt)],
    with: {
      restaurant: { columns: { id: true, name: true, slug: true } },
      plan: { columns: { id: true, name: true, price: true } },
    },
  })
  res.json(items)
}

async function markRead(req, res) {
  const [updated] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.id, Number(req.params.id)))
    .returning()

  if (!updated) return res.status(404).json({ error: 'Notification introuvable' })
  res.json(updated)
}

module.exports = {
  createRenewalRequest,
  listForRestaurant,
  markReadForRestaurant,
  markAllReadForRestaurant,
  listForAdmin,
  markRead,
}

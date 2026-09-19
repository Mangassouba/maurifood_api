const { eq, desc } = require('drizzle-orm')
const db = require('../config/db')
const { notifications, restaurants, plans } = require('../db/schema')
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

module.exports = { createRenewalRequest, listForAdmin, markRead }

const { eq, and, desc } = require('drizzle-orm')
const db = require('../config/db')
const { dishes } = require('../db/schema')
const { logActivity } = require('../lib/activityLog')

async function list(req, res) {
  const items = await db
    .select()
    .from(dishes)
    .where(eq(dishes.restaurantId, req.restaurantId))
    .orderBy(desc(dishes.createdAt))
  res.json(items)
}

async function create(req, res) {
  const { name, description, price, categoryId, imageUrl } = req.body
  const [dish] = await db
    .insert(dishes)
    .values({ restaurantId: req.restaurantId, name, description, price, categoryId, imageUrl })
    .returning()

  await logActivity({
    action: 'dish.created',
    message: `Plat ajouté : ${dish.name}`,
    restaurantId: req.restaurantId,
    actorId: req.user.id,
  })

  res.status(201).json(dish)
}

async function update(req, res) {
  const [existing] = await db
    .select()
    .from(dishes)
    .where(and(eq(dishes.id, Number(req.params.id)), eq(dishes.restaurantId, req.restaurantId)))
  if (!existing) return res.status(404).json({ error: 'Plat introuvable' })

  const [updated] = await db
    .update(dishes)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(dishes.id, existing.id))
    .returning()

  await logActivity({
    action: 'dish.updated',
    message: `Plat modifié : ${updated.name}`,
    restaurantId: req.restaurantId,
    actorId: req.user.id,
  })

  res.json(updated)
}

async function remove(req, res) {
  const [existing] = await db
    .select()
    .from(dishes)
    .where(and(eq(dishes.id, Number(req.params.id)), eq(dishes.restaurantId, req.restaurantId)))
  if (!existing) return res.status(404).json({ error: 'Plat introuvable' })

  await db.delete(dishes).where(eq(dishes.id, existing.id))

  await logActivity({
    action: 'dish.deleted',
    message: `Plat supprimé : ${existing.name}`,
    restaurantId: req.restaurantId,
    actorId: req.user.id,
  })

  res.status(204).send()
}

module.exports = { list, create, update, remove }

const { eq, and } = require('drizzle-orm')
const db = require('../config/db')
const { categories } = require('../db/schema')
const { logActivity } = require('../lib/activityLog')

async function list(req, res) {
  const items = await db
    .select()
    .from(categories)
    .where(eq(categories.restaurantId, req.restaurantId))
  res.json(items)
}

async function create(req, res) {
  const { name, position } = req.body
  if (!name) return res.status(400).json({ error: 'Le nom est requis' })

  const [category] = await db
    .insert(categories)
    .values({ restaurantId: req.restaurantId, name, position: position ?? 0 })
    .returning()

  await logActivity({
    action: 'category.created',
    message: `Catégorie ajoutée : ${category.name}`,
    restaurantId: req.restaurantId,
    actorId: req.user.id,
  })

  res.status(201).json(category)
}

async function remove(req, res) {
  const [existing] = await db
    .select()
    .from(categories)
    .where(
      and(eq(categories.id, Number(req.params.id)), eq(categories.restaurantId, req.restaurantId)),
    )
  if (!existing) return res.status(404).json({ error: 'Catégorie introuvable' })

  await db.delete(categories).where(eq(categories.id, existing.id))

  await logActivity({
    action: 'category.deleted',
    message: `Catégorie supprimée : ${existing.name}`,
    restaurantId: req.restaurantId,
    actorId: req.user.id,
  })

  res.status(204).send()
}

module.exports = { list, create, remove }

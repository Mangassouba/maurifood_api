const bcrypt = require('bcryptjs')
const { eq, and } = require('drizzle-orm')
const db = require('../config/db')
const { users } = require('../db/schema')
const { logActivity } = require('../lib/activityLog')

async function list(req, res) {
  const items = await db
    .select({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.restaurantId, req.restaurantId), eq(users.role, 'staff')))
    .orderBy(users.createdAt)

  res.json(items)
}

async function create(req, res) {
  const { email, password, name } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' })
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email))
  if (existing) {
    return res.status(409).json({ error: 'Cet email est déjà utilisé' })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const [created] = await db
    .insert(users)
    .values({ email, passwordHash, name, role: 'staff', restaurantId: req.restaurantId })
    .returning({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt })

  await logActivity({
    action: 'staff.created',
    message: `Membre d'équipe ajouté : ${created.email}`,
    restaurantId: req.restaurantId,
    actorId: req.user.id,
  })

  res.status(201).json(created)
}

async function remove(req, res) {
  const [deleted] = await db
    .delete(users)
    .where(
      and(
        eq(users.id, Number(req.params.id)),
        eq(users.restaurantId, req.restaurantId),
        eq(users.role, 'staff'),
      ),
    )
    .returning()

  if (!deleted) return res.status(404).json({ error: 'Utilisateur introuvable' })

  await logActivity({
    action: 'staff.deleted',
    message: `Membre d'équipe retiré : ${deleted.email}`,
    restaurantId: req.restaurantId,
    actorId: req.user.id,
  })

  res.status(204).end()
}

module.exports = { list, create, remove }

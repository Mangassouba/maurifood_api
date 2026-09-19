const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { eq, sql } = require('drizzle-orm')
const db = require('../config/db')
const { users, restaurants } = require('../db/schema')
const { logActivity } = require('../lib/activityLog')

async function login(req, res) {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' })
  }

  const [user] = await db.select().from(users).where(eq(users.email, email))
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Identifiants invalides' })
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, restaurantId: user.restaurantId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' },
  )

  await logActivity({
    action: 'auth.login',
    message: `Connexion (${user.role})`,
    restaurantId: user.restaurantId,
    actorId: user.id,
  })

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      restaurantId: user.restaurantId,
    },
  })
}

async function logout(req, res) {
  await logActivity({
    action: 'auth.logout',
    message: `Déconnexion (${req.user.role})`,
    restaurantId: req.user.restaurantId,
    actorId: req.user.id,
  })
  res.status(204).end()
}

async function register(req, res) {
  const { email, password, name, restaurantName } = req.body
  if (!email || !password || !restaurantName) {
    return res.status(400).json({ error: 'Champs requis manquants' })
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email))
  if (existing) {
    return res.status(409).json({ error: 'Cet email est déjà utilisé' })
  }

  const baseSlug =
    restaurantName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'restaurant'

  const existingSlugs = await db
    .select({ slug: restaurants.slug })
    .from(restaurants)
    .where(sql`${restaurants.slug} = ${baseSlug} or ${restaurants.slug} like ${baseSlug + '-%'}`)
  const takenSlugs = new Set(existingSlugs.map((r) => r.slug))
  let slug = baseSlug
  let suffix = 2
  while (takenSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`
    suffix += 1
  }

  const passwordHash = await bcrypt.hash(password, 10)

  const { user, restaurant } = await db.transaction(async (tx) => {
    const [restaurant] = await tx
      .insert(restaurants)
      .values({ name: restaurantName, slug, isActive: false })
      .returning()

    const [newUser] = await tx
      .insert(users)
      .values({
        email,
        passwordHash,
        name,
        role: 'restaurant_owner',
        restaurantId: restaurant.id,
      })
      .returning()

    return { user: newUser, restaurant }
  })

  await logActivity({
    action: 'restaurant.registered',
    message: `Nouveau restaurant inscrit : ${restaurant.name}`,
    restaurantId: restaurant.id,
    actorId: user.id,
  })

  res.status(201).json({
    message:
      'Compte créé. Votre restaurant sera activé après validation par un administrateur.',
    userId: user.id,
  })
}

module.exports = { login, register, logout }

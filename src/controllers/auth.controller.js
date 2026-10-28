const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { asc, eq, sql } = require('drizzle-orm')
const db = require('../config/db')
const { users, restaurants, plans, subscriptions } = require('../db/schema')
const { logActivity } = require('../lib/activityLog')

const TRIAL_DAYS = 15

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

  // L'essai gratuit est rattaché à la formule la moins chère : c'est celle que
  // le restaurant retrouve dans son espace abonnement à la fin de l'essai.
  const [trialPlan] = await db.select().from(plans).orderBy(asc(plans.price)).limit(1)
  if (!trialPlan) {
    return res.status(500).json({ error: 'Aucune formule disponible pour l’essai gratuit' })
  }

  const { user, restaurant } = await db.transaction(async (tx) => {
    // Le restaurant est activé immédiatement pour la durée de l'essai gratuit.
    const [restaurant] = await tx
      .insert(restaurants)
      .values({ name: restaurantName, slug, isActive: true })
      .returning()

    const now = new Date()
    await tx.insert(subscriptions).values({
      restaurantId: restaurant.id,
      planId: trialPlan.id,
      status: 'trialing',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
    })

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
    message: `Nouveau restaurant inscrit : ${restaurant.name} (essai gratuit de ${TRIAL_DAYS} jours)`,
    restaurantId: restaurant.id,
    actorId: user.id,
  })

  res.status(201).json({
    message: `Compte créé. Votre restaurant est actif avec un essai gratuit de ${TRIAL_DAYS} jours.`,
    userId: user.id,
  })
}

module.exports = { login, register, logout }

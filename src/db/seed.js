require('dotenv').config({ quiet: true })
const bcrypt = require('bcryptjs')
const { eq, inArray } = require('drizzle-orm')
const db = require('../config/db')
const { plans, users, restaurants, subscriptions, categories, dishes } = require('./schema')

async function upsertPlan(plan) {
  const [existing] = await db.select().from(plans).where(eq(plans.name, plan.name))
  if (existing) return existing
  const [created] = await db.insert(plans).values(plan).returning()
  return created
}

async function upsertUser(user) {
  const [existing] = await db.select().from(users).where(eq(users.email, user.email))
  if (existing) return existing
  const [created] = await db.insert(users).values(user).returning()
  return created
}

async function seedRestaurant(def, planId) {
  let [restaurant] = await db.select().from(restaurants).where(eq(restaurants.slug, def.slug))
  if (!restaurant) {
    ;[restaurant] = await db
      .insert(restaurants)
      .values({
        name: def.name,
        slug: def.slug,
        description: def.description,
        isActive: true,
      })
      .returning()
  }

  const [existingSubscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.restaurantId, restaurant.id))
  if (!existingSubscription) {
    await db.insert(subscriptions).values({
      restaurantId: restaurant.id,
      planId,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
  }

  const ownerPasswordHash = await bcrypt.hash(def.ownerPassword, 10)
  await upsertUser({
    email: def.ownerEmail,
    passwordHash: ownerPasswordHash,
    name: def.ownerName,
    role: 'restaurant_owner',
    restaurantId: restaurant.id,
  })

  let [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.restaurantId, restaurant.id))
  if (!category) {
    ;[category] = await db
      .insert(categories)
      .values({ restaurantId: restaurant.id, name: def.categoryName })
      .returning()
  }

  const existingDishes = await db.select().from(dishes).where(eq(dishes.restaurantId, restaurant.id))
  if (existingDishes.length === 0) {
    await db.insert(dishes).values(
      def.dishes.map((dish) => ({
        restaurantId: restaurant.id,
        categoryId: category.id,
        ...dish,
      })),
    )
  }

  return restaurant
}

async function main() {
  const MONTHLY_PRICE = 1500
  const planDefs = [
    { name: '1 mois', durationMonths: 1, billingCycle: 'monthly' },
    { name: '3 mois', durationMonths: 3, billingCycle: 'monthly' },
    { name: '6 mois', durationMonths: 6, billingCycle: 'monthly' },
    { name: '12 mois', durationMonths: 12, billingCycle: 'monthly' },
  ].map((def) => ({ ...def, price: String(MONTHLY_PRICE * def.durationMonths) }))

  const createdPlans = []
  for (const plan of planDefs) {
    createdPlans.push(await upsertPlan(plan))
  }
  const defaultPlan = createdPlans.find((p) => p.name === '1 mois')

  // Anciennes formules (Starter/Pro/Premium) : on bascule les abonnements existants
  // sur la formule "1 mois" puis on supprime les anciennes formules.
  const legacyPlans = await db
    .select()
    .from(plans)
    .where(inArray(plans.name, ['Starter', 'Pro', 'Premium']))
  for (const legacyPlan of legacyPlans) {
    await db
      .update(subscriptions)
      .set({ planId: defaultPlan.id })
      .where(eq(subscriptions.planId, legacyPlan.id))
    await db.delete(plans).where(eq(plans.id, legacyPlan.id))
  }

  const adminPasswordHash = await bcrypt.hash('admin1234', 10)
  await upsertUser({
    email: 'admin@maurifood.com',
    passwordHash: adminPasswordHash,
    name: 'Super Admin',
    role: 'super_admin',
  })

  const restaurantDefs = [
    {
      slug: 'chez-demo',
      name: 'Chez Demo',
      description: 'Restaurant de démonstration',
      ownerEmail: 'owner@chezdemo.com',
      ownerPassword: 'owner1234',
      ownerName: 'Propriétaire Demo',
      categoryName: 'Plats principaux',
      dishes: [
        {
          name: 'Thieboudienne',
          description: 'Riz au poisson traditionnel',
          price: '1500',
        },
        {
          name: 'Méchoui',
          description: 'Agneau grillé',
          price: '3000',
        },
      ],
    },
    {
      slug: 'le-bledi',
      name: 'Le Bledi',
      description: 'Cuisine traditionnelle mauritanienne et maghrébine',
      ownerEmail: 'owner@lebledi.com',
      ownerPassword: 'owner1234',
      ownerName: 'Propriétaire Le Bledi',
      categoryName: 'Plats traditionnels',
      dishes: [
        {
          name: 'Riz au poisson épicé',
          description: 'Riz parfumé, poisson mariné, crevettes et citron confit.',
          price: '1800',
          imageUrl:
            'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80',
        },
        {
          name: 'Chorba maison',
          description: 'Soupe tomate mijotée aux amandes, servie avec des herbes fraîches.',
          price: '700',
          imageUrl:
            'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=600&q=80',
        },
        {
          name: 'Pizza du chef',
          description: 'Pâte fine, pepperoni, tomates fraîches, basilic et olives noires.',
          price: '1600',
          imageUrl:
            'https://images.unsplash.com/photo-1585238342024-78d387f4a707?auto=format&fit=crop&w=600&q=80',
        },
      ],
    },
    {
      slug: 'nouakchott-grill',
      name: 'Nouakchott Grill',
      description: 'Grillades, burgers et viandes au charbon de bois',
      ownerEmail: 'owner@nouakchottgrill.com',
      ownerPassword: 'owner1234',
      ownerName: 'Propriétaire Nouakchott Grill',
      categoryName: 'Grillades',
      dishes: [
        {
          name: 'Burger signature',
          description: 'Steak haché grillé, cheddar fondant, pickles et sauce maison.',
          price: '1500',
          imageUrl:
            'https://images.unsplash.com/photo-1607013251379-e6eecfffe234?auto=format&fit=crop&w=600&q=80',
        },
        {
          name: "Travers d'agneau grillés",
          description: 'Travers d\'agneau marinés, grillés au charbon de bois.',
          price: '2400',
          imageUrl:
            'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=600&q=80',
        },
        {
          name: 'Steak frites',
          description: 'Pièce de bœuf grillée, frites maison et beurre aux herbes.',
          price: '2200',
          imageUrl:
            'https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&w=600&q=80',
        },
      ],
    },
  ]

  for (const def of restaurantDefs) {
    await seedRestaurant(def, defaultPlan.id)
  }

  console.log('Seed terminé.')
  console.log('Super admin : admin@maurifood.com / admin1234')
  for (const def of restaurantDefs) {
    console.log(`Propriétaire ${def.name} : ${def.ownerEmail} / ${def.ownerPassword}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })

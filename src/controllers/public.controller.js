const db = require('../config/db')

async function listDishes(req, res) {
  const { search, restaurant } = req.query

  const items = await db.query.dishes.findMany({
    where: (dishes, { eq, and, ilike }) =>
      and(eq(dishes.isAvailable, true), search ? ilike(dishes.name, `%${search}%`) : undefined),
    with: {
      restaurant: { columns: { name: true, slug: true, isActive: true } },
      category: { columns: { id: true, name: true } },
    },
    orderBy: (dishes, { desc }) => [desc(dishes.createdAt)],
  })

  const filtered = items.filter(
    (dish) => dish.restaurant?.isActive && (!restaurant || dish.restaurant.slug === restaurant),
  )

  res.json({ items: filtered })
}

async function getDish(req, res) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    return res.status(404).json({ error: 'Plat introuvable' })
  }

  const dish = await db.query.dishes.findFirst({
    where: (dishes, { eq, and }) => and(eq(dishes.id, id), eq(dishes.isAvailable, true)),
    with: {
      restaurant: { columns: { id: true, name: true, slug: true, isActive: true, logoUrl: true } },
      category: { columns: { id: true, name: true } },
    },
  })

  if (!dish || !dish.restaurant?.isActive) {
    return res.status(404).json({ error: 'Plat introuvable' })
  }

  res.json(dish)
}

async function listRestaurants(req, res) {
  const items = await db.query.restaurants.findMany({
    where: (restaurants, { eq }) => eq(restaurants.isActive, true),
    orderBy: (restaurants, { asc }) => [asc(restaurants.name)],
    with: {
      dishes: { where: (dishes, { eq }) => eq(dishes.isAvailable, true), columns: { id: true } },
    },
  })

  res.json(
    items.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      logoUrl: r.logoUrl,
      address: r.address,
      dishCount: r.dishes.length,
    })),
  )
}

async function getRestaurant(req, res) {
  const restaurant = await db.query.restaurants.findFirst({
    where: (restaurants, { eq, and }) =>
      and(eq(restaurants.slug, req.params.slug), eq(restaurants.isActive, true)),
    with: {
      dishes: { where: (dishes, { eq }) => eq(dishes.isAvailable, true) },
      categories: true,
    },
  })

  if (!restaurant) {
    return res.status(404).json({ error: 'Restaurant introuvable' })
  }

  res.json(restaurant)
}

module.exports = { listDishes, getDish, listRestaurants, getRestaurant }

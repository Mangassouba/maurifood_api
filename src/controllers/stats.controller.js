const db = require('../config/db')

const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'out_for_delivery']
const STATUS_ORDER = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled']
const SUBSCRIPTION_STATUS_ORDER = ['trialing', 'active', 'past_due', 'cancelled', 'none']
const DAYS_IN_TREND = 14
const MONTHS_IN_TREND = 12

function dayKey(date) {
  return date.toISOString().slice(0, 10)
}

function monthKey(date) {
  return date.toISOString().slice(0, 7)
}

function buildRevenueByDay(billableOrders) {
  const since = new Date()
  since.setDate(since.getDate() - (DAYS_IN_TREND - 1))
  since.setHours(0, 0, 0, 0)

  const map = new Map()
  for (let i = 0; i < DAYS_IN_TREND; i += 1) {
    const d = new Date(since)
    d.setDate(d.getDate() + i)
    map.set(dayKey(d), { date: dayKey(d), revenue: 0, orders: 0 })
  }
  for (const order of billableOrders) {
    const bucket = map.get(dayKey(new Date(order.createdAt)))
    if (bucket) {
      bucket.revenue += Number(order.total)
      bucket.orders += 1
    }
  }
  return [...map.values()]
}

function buildRevenueByMonthAndYear(billableOrders) {
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  monthStart.setMonth(monthStart.getMonth() - (MONTHS_IN_TREND - 1))

  const monthMap = new Map()
  for (let i = 0; i < MONTHS_IN_TREND; i += 1) {
    const d = new Date(monthStart)
    d.setMonth(d.getMonth() + i)
    monthMap.set(monthKey(d), { month: monthKey(d), revenue: 0, orders: 0 })
  }

  const yearMap = new Map()
  for (const order of billableOrders) {
    const createdAt = new Date(order.createdAt)
    const monthBucket = monthMap.get(monthKey(createdAt))
    if (monthBucket) {
      monthBucket.revenue += Number(order.total)
      monthBucket.orders += 1
    }

    const year = createdAt.getFullYear()
    const yearBucket = yearMap.get(year) ?? { year, revenue: 0, orders: 0 }
    yearBucket.revenue += Number(order.total)
    yearBucket.orders += 1
    yearMap.set(year, yearBucket)
  }

  return {
    revenueByMonth: [...monthMap.values()],
    revenueByYear: [...yearMap.values()].sort((a, b) => a.year - b.year),
  }
}

function buildOrdersByStatus(orders) {
  const counts = new Map(STATUS_ORDER.map((s) => [s, 0]))
  for (const order of orders) {
    counts.set(order.status, (counts.get(order.status) ?? 0) + 1)
  }
  return STATUS_ORDER.map((status) => ({ status, count: counts.get(status) ?? 0 }))
}

async function getDashboardStats(req, res) {
  const orders = await db.query.orders.findMany({
    where: (orders, { eq }) => eq(orders.restaurantId, req.restaurantId),
    with: { items: { with: { dish: true } } },
  })

  const billable = orders.filter((o) => o.status !== 'cancelled')
  const totalRevenue = billable.reduce((sum, o) => sum + Number(o.total), 0)
  const pendingOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length

  const dishStats = new Map()
  for (const order of billable) {
    for (const item of order.items) {
      const name = item.dish?.name ?? 'Plat supprimé'
      const entry = dishStats.get(name) ?? { name, quantity: 0, revenue: 0 }
      entry.quantity += item.quantity
      entry.revenue += Number(item.unitPrice) * item.quantity
      dishStats.set(name, entry)
    }
  }
  const topDishes = [...dishStats.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5)

  res.json({
    summary: {
      totalOrders: orders.length,
      totalRevenue,
      avgOrderValue: billable.length ? totalRevenue / billable.length : 0,
      pendingOrders,
    },
    revenueByDay: buildRevenueByDay(billable),
    ...buildRevenueByMonthAndYear(billable),
    ordersByStatus: buildOrdersByStatus(orders),
    topDishes,
  })
}

async function getAdminStats(req, res) {
  const [restaurantList, orders] = await Promise.all([
    db.query.restaurants.findMany({ with: { subscription: true } }),
    db.query.orders.findMany({ with: { restaurant: { columns: { id: true, name: true } } } }),
  ])

  const billable = orders.filter((o) => o.status !== 'cancelled')
  const totalRevenue = billable.reduce((sum, o) => sum + Number(o.total), 0)
  const activeRestaurants = restaurantList.filter((r) => r.isActive).length

  const subscriptionCounts = new Map(SUBSCRIPTION_STATUS_ORDER.map((s) => [s, 0]))
  for (const restaurant of restaurantList) {
    const status = restaurant.subscription?.status ?? 'none'
    subscriptionCounts.set(status, (subscriptionCounts.get(status) ?? 0) + 1)
  }

  const restaurantStats = new Map()
  for (const order of billable) {
    const name = order.restaurant?.name ?? 'Restaurant supprimé'
    const entry = restaurantStats.get(name) ?? { name, quantity: 0, revenue: 0 }
    entry.quantity += 1
    entry.revenue += Number(order.total)
    restaurantStats.set(name, entry)
  }
  const topRestaurants = [...restaurantStats.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  res.json({
    summary: {
      totalRestaurants: restaurantList.length,
      activeRestaurants,
      totalOrders: orders.length,
      totalRevenue,
    },
    revenueByDay: buildRevenueByDay(billable),
    ...buildRevenueByMonthAndYear(billable),
    ordersByStatus: buildOrdersByStatus(orders),
    subscriptionsByStatus: SUBSCRIPTION_STATUS_ORDER.map((status) => ({
      status,
      count: subscriptionCounts.get(status) ?? 0,
    })),
    topRestaurants,
  })
}

module.exports = { getDashboardStats, getAdminStats }

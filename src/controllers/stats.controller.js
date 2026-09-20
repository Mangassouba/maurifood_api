const db = require('../config/db')

const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'out_for_delivery']
const STATUS_ORDER = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled']
const DAYS_IN_TREND = 14
const MONTHS_IN_TREND = 12

function dayKey(date) {
  return date.toISOString().slice(0, 10)
}

function monthKey(date) {
  return date.toISOString().slice(0, 7)
}

async function getDashboardStats(req, res) {
  const since = new Date()
  since.setDate(since.getDate() - (DAYS_IN_TREND - 1))
  since.setHours(0, 0, 0, 0)

  const orders = await db.query.orders.findMany({
    where: (orders, { eq }) => eq(orders.restaurantId, req.restaurantId),
    with: { items: { with: { dish: true } } },
  })

  const billable = orders.filter((o) => o.status !== 'cancelled')
  const totalRevenue = billable.reduce((sum, o) => sum + Number(o.total), 0)
  const totalOrders = orders.length
  const pendingOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length
  const avgOrderValue = billable.length ? totalRevenue / billable.length : 0

  const revenueByDayMap = new Map()
  for (let i = 0; i < DAYS_IN_TREND; i += 1) {
    const d = new Date(since)
    d.setDate(d.getDate() + i)
    revenueByDayMap.set(dayKey(d), { date: dayKey(d), revenue: 0, orders: 0 })
  }
  for (const order of billable) {
    const key = dayKey(new Date(order.createdAt))
    const bucket = revenueByDayMap.get(key)
    if (bucket) {
      bucket.revenue += Number(order.total)
      bucket.orders += 1
    }
  }

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  monthStart.setMonth(monthStart.getMonth() - (MONTHS_IN_TREND - 1))

  const revenueByMonthMap = new Map()
  for (let i = 0; i < MONTHS_IN_TREND; i += 1) {
    const d = new Date(monthStart)
    d.setMonth(d.getMonth() + i)
    revenueByMonthMap.set(monthKey(d), { month: monthKey(d), revenue: 0, orders: 0 })
  }
  const revenueByYearMap = new Map()
  for (const order of billable) {
    const createdAt = new Date(order.createdAt)
    const mKey = monthKey(createdAt)
    const monthBucket = revenueByMonthMap.get(mKey)
    if (monthBucket) {
      monthBucket.revenue += Number(order.total)
      monthBucket.orders += 1
    }

    const year = createdAt.getFullYear()
    const yearBucket = revenueByYearMap.get(year) ?? { year, revenue: 0, orders: 0 }
    yearBucket.revenue += Number(order.total)
    yearBucket.orders += 1
    revenueByYearMap.set(year, yearBucket)
  }
  const revenueByYear = [...revenueByYearMap.values()].sort((a, b) => a.year - b.year)

  const statusCounts = new Map(STATUS_ORDER.map((s) => [s, 0]))
  for (const order of orders) {
    statusCounts.set(order.status, (statusCounts.get(order.status) ?? 0) + 1)
  }

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
      totalOrders,
      totalRevenue,
      avgOrderValue,
      pendingOrders,
    },
    revenueByDay: [...revenueByDayMap.values()],
    revenueByMonth: [...revenueByMonthMap.values()],
    revenueByYear,
    ordersByStatus: STATUS_ORDER.map((status) => ({ status, count: statusCounts.get(status) ?? 0 })),
    topDishes,
  })
}

module.exports = { getDashboardStats }

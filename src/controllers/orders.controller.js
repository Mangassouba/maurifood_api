const { eq, and, inArray } = require('drizzle-orm')
const db = require('../config/db')
const {
  orders,
  orderItems,
  dishes,
  deliveryZones,
  drivers,
  restaurants,
  orderStatus,
} = require('../db/schema')
const { notifyRestaurant } = require('../lib/restaurantNotify')

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateOrderCode() {
  let code = 'MF-'
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

// --- Côté client (invité, sans compte) ---

async function createOrder(req, res) {
  const { restaurantId, orderType, items, guestName, guestPhone, guestAddress } = req.body

  if (!restaurantId || !orderType || !items?.length) {
    return res.status(400).json({ error: 'Champs requis manquants' })
  }
  if (!guestName?.trim() || !guestPhone?.trim()) {
    return res.status(400).json({ error: 'Nom et téléphone requis' })
  }
  if (orderType === 'delivery' && !guestAddress?.trim()) {
    return res.status(400).json({ error: "L'adresse de livraison est requise" })
  }
  const [restaurant] = await db
    .select({ isActive: restaurants.isActive, offersDelivery: restaurants.offersDelivery })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
  if (!restaurant?.isActive) {
    return res.status(400).json({ error: "Ce restaurant n'accepte pas de commandes actuellement" })
  }
  if (orderType === 'delivery' && !restaurant.offersDelivery) {
    return res.status(400).json({ error: 'Ce restaurant ne propose pas la livraison' })
  }

  const dishRows = await db
    .select()
    .from(dishes)
    .where(
      and(
        inArray(
          dishes.id,
          items.map((i) => i.dishId),
        ),
        eq(dishes.restaurantId, restaurantId),
      ),
    )
  if (dishRows.length !== items.length) {
    return res.status(400).json({ error: 'Un ou plusieurs plats sont invalides' })
  }

  let deliveryFee = 0
  if (orderType === 'delivery') {
    const [zone] = await db
      .select()
      .from(deliveryZones)
      .where(eq(deliveryZones.restaurantId, restaurantId))
    deliveryFee = zone ? Number(zone.fee) : 0
  }

  const subtotal = items.reduce((sum, item) => {
    const dish = dishRows.find((d) => d.id === item.dishId)
    return sum + Number(dish.price) * item.quantity
  }, 0)

  const order = await db.transaction(async (tx) => {
    let newOrder
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        ;[newOrder] = await tx
          .insert(orders)
          .values({
            restaurantId,
            customerId: null,
            code: generateOrderCode(),
            guestName: guestName.trim(),
            guestPhone: guestPhone.trim(),
            guestAddress: orderType === 'delivery' ? guestAddress.trim() : null,
            orderType,
            subtotal: subtotal.toFixed(2),
            deliveryFee: deliveryFee.toFixed(2),
            total: (subtotal + deliveryFee).toFixed(2),
            paymentMethod: 'cash',
          })
          .returning()
        break
      } catch (err) {
        const isDuplicateCode = err.code === '23505' && err.constraint === 'orders_code_unique'
        if (!isDuplicateCode || attempt === 4) throw err
      }
    }

    const newItems = await tx
      .insert(orderItems)
      .values(
        items.map((item) => {
          const dish = dishRows.find((d) => d.id === item.dishId)
          return {
            orderId: newOrder.id,
            dishId: item.dishId,
            quantity: item.quantity,
            unitPrice: dish.price,
            notes: item.notes,
          }
        }),
      )
      .returning()

    return { ...newOrder, items: newItems }
  })

  await notifyRestaurant({
    restaurantId,
    type: 'order.created',
    message: `Nouvelle commande ${order.code} — ${Number(order.total)} MRU (${
      order.orderType === 'delivery' ? 'livraison' : 'à emporter'
    })`,
    link: '/dashboard/orders',
  })

  res.status(201).json(order)
}

async function getOrderByCode(req, res) {
  const order = await db.query.orders.findFirst({
    where: (orders, { eq }) => eq(orders.code, req.params.code.toUpperCase()),
    with: {
      items: { with: { dish: true } },
      restaurant: { columns: { name: true, phone: true, address: true } },
      driver: { columns: { name: true, phone: true } },
    },
  })
  if (!order) return res.status(404).json({ error: 'Commande introuvable' })
  res.json(order)
}

// --- Côté restaurant (dashboard) ---

const PAYMENT_METHODS = ['cash', 'card', 'mobile_money']

// Vente au comptoir : le client paie et repart tout de suite, la commande est
// donc enregistrée directement comme retirée et payée.
async function createPosSale(req, res) {
  const { items, paymentMethod = 'cash', customerName, customerPhone } = req.body

  if (!items?.length || items.some((i) => !i.dishId || !(i.quantity > 0))) {
    return res.status(400).json({ error: 'Ajoutez au moins un plat' })
  }
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({ error: 'Moyen de paiement invalide' })
  }

  const dishIds = [...new Set(items.map((i) => i.dishId))]
  const dishRows = await db
    .select()
    .from(dishes)
    .where(and(inArray(dishes.id, dishIds), eq(dishes.restaurantId, req.restaurantId)))
  if (dishRows.length !== dishIds.length) {
    return res.status(400).json({ error: 'Un ou plusieurs plats sont invalides' })
  }

  const subtotal = items.reduce((sum, item) => {
    const dish = dishRows.find((d) => d.id === item.dishId)
    return sum + Number(dish.price) * item.quantity
  }, 0)

  const order = await db.transaction(async (tx) => {
    let newOrder
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        ;[newOrder] = await tx
          .insert(orders)
          .values({
            restaurantId: req.restaurantId,
            code: generateOrderCode(),
            guestName: customerName?.trim() || 'Client comptoir',
            guestPhone: customerPhone?.trim() || null,
            orderType: 'pickup',
            status: 'delivered',
            subtotal: subtotal.toFixed(2),
            deliveryFee: '0',
            total: subtotal.toFixed(2),
            paymentStatus: 'paid',
            paymentMethod,
            source: 'pos',
          })
          .returning()
        break
      } catch (err) {
        const isDuplicateCode = err.code === '23505' && err.constraint === 'orders_code_unique'
        if (!isDuplicateCode || attempt === 4) throw err
      }
    }

    await tx.insert(orderItems).values(
      items.map((item) => ({
        orderId: newOrder.id,
        dishId: item.dishId,
        quantity: item.quantity,
        unitPrice: dishRows.find((d) => d.id === item.dishId).price,
        notes: item.notes,
      })),
    )

    return newOrder
  })

  const full = await db.query.orders.findFirst({
    where: (orders, { eq }) => eq(orders.id, order.id),
    with: { items: { with: { dish: true } }, restaurant: { columns: { name: true } } },
  })
  res.status(201).json(full)
}

async function listForRestaurant(req, res) {
  const items = await db.query.orders.findMany({
    where: (orders, { eq }) => eq(orders.restaurantId, req.restaurantId),
    orderBy: (orders, { desc }) => [desc(orders.createdAt)],
    with: { items: { with: { dish: true } }, deliveryAddress: true, driver: true },
  })
  res.json(items)
}

async function updateStatus(req, res) {
  const { status } = req.body
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, Number(req.params.id)), eq(orders.restaurantId, req.restaurantId)))
  if (!order) return res.status(404).json({ error: 'Commande introuvable' })

  if (!orderStatus.enumValues.includes(status)) {
    return res.status(400).json({ error: 'Statut invalide' })
  }
  if (status === 'out_for_delivery' && order.orderType !== 'delivery') {
    return res.status(400).json({ error: 'Une commande à emporter ne peut pas être en livraison' })
  }
  if (status === 'out_for_delivery' && !order.driverId) {
    return res.status(400).json({ error: 'Assignez un livreur avant de lancer la livraison' })
  }

  const [updated] = await db
    .update(orders)
    .set({
      status,
      paymentStatus: status === 'delivered' ? 'paid' : order.paymentStatus,
    })
    .where(eq(orders.id, order.id))
    .returning()

  res.json(updated)
}

async function assignDriver(req, res) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, Number(req.params.id)), eq(orders.restaurantId, req.restaurantId)))
  if (!order) return res.status(404).json({ error: 'Commande introuvable' })
  if (order.orderType !== 'delivery') {
    return res.status(400).json({ error: 'Seules les commandes en livraison ont un livreur' })
  }

  const driverId = req.body.driverId ? Number(req.body.driverId) : null
  if (driverId) {
    const [driver] = await db
      .select()
      .from(drivers)
      .where(and(eq(drivers.id, driverId), eq(drivers.restaurantId, req.restaurantId)))
    if (!driver || !driver.isActive) {
      return res.status(400).json({ error: 'Livreur introuvable ou inactif' })
    }
  }

  const [updated] = await db
    .update(orders)
    .set({ driverId })
    .where(eq(orders.id, order.id))
    .returning()

  res.json(updated)
}

module.exports = {
  assignDriver,
  createOrder,
  createPosSale,
  getOrderByCode,
  listForRestaurant,
  updateStatus,
}

const { eq, and, inArray } = require('drizzle-orm')
const db = require('../config/db')
const { orders, orderItems, dishes, deliveryZones } = require('../db/schema')

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

  res.status(201).json(order)
}

async function getOrderByCode(req, res) {
  const order = await db.query.orders.findFirst({
    where: (orders, { eq }) => eq(orders.code, req.params.code.toUpperCase()),
    with: {
      items: { with: { dish: true } },
      restaurant: { columns: { name: true, phone: true, address: true } },
    },
  })
  if (!order) return res.status(404).json({ error: 'Commande introuvable' })
  res.json(order)
}

// --- Côté restaurant (dashboard) ---

async function listForRestaurant(req, res) {
  const items = await db.query.orders.findMany({
    where: (orders, { eq }) => eq(orders.restaurantId, req.restaurantId),
    orderBy: (orders, { desc }) => [desc(orders.createdAt)],
    with: { items: { with: { dish: true } }, deliveryAddress: true },
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

module.exports = {
  createOrder,
  getOrderByCode,
  listForRestaurant,
  updateStatus,
}

const {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  varchar,
  boolean,
  timestamp,
  numeric,
  doublePrecision,
} = require('drizzle-orm/pg-core')
const { relations } = require('drizzle-orm')

const userRole = pgEnum('user_role', ['super_admin', 'restaurant_owner', 'staff'])
const subscriptionStatus = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'cancelled',
])
const billingCycle = pgEnum('billing_cycle', ['monthly', 'yearly'])
const orderType = pgEnum('order_type', ['delivery', 'pickup'])
const orderStatus = pgEnum('order_status', [
  'pending',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'delivered',
  'cancelled',
])
const paymentStatus = pgEnum('payment_status', ['unpaid', 'paid', 'refunded'])
const paymentMethod = pgEnum('payment_method', ['cash', 'card', 'mobile_money'])

const restaurants = pgTable('restaurants', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  logoUrl: text('logo_url'),
  address: text('address'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  phone: varchar('phone', { length: 50 }),
  isActive: boolean('is_active').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  role: userRole('role').notNull(),
  restaurantId: integer('restaurant_id').references(() => restaurants.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  restaurantId: integer('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: integer('position').notNull().default(0),
})

const dishes = pgTable('dishes', {
  id: serial('id').primaryKey(),
  restaurantId: integer('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  categoryId: integer('category_id').references(() => categories.id),
  name: text('name').notNull(),
  description: text('description'),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  imageUrl: text('image_url'),
  isAvailable: boolean('is_available').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  phone: varchar('phone', { length: 50 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

const addresses = pgTable('addresses', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  label: text('label'),
  addressLine: text('address_line').notNull(),
  city: text('city'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
})

const deliveryZones = pgTable('delivery_zones', {
  id: serial('id').primaryKey(),
  restaurantId: integer('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  zoneName: text('zone_name').notNull(),
  fee: numeric('fee', { precision: 10, scale: 2 }).notNull(),
  estimatedTimeMinutes: integer('estimated_time_minutes'),
})

const drivers = pgTable('drivers', {
  id: serial('id').primaryKey(),
  restaurantId: integer('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: varchar('phone', { length: 50 }),
  isActive: boolean('is_active').notNull().default(true),
})

const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  restaurantId: integer('restaurant_id')
    .notNull()
    .references(() => restaurants.id),
  customerId: integer('customer_id').references(() => customers.id),
  code: varchar('code', { length: 12 }).notNull().unique(),
  guestName: text('guest_name'),
  guestPhone: varchar('guest_phone', { length: 50 }),
  guestAddress: text('guest_address'),
  orderType: orderType('order_type').notNull(),
  status: orderStatus('status').notNull().default('pending'),
  deliveryAddressId: integer('delivery_address_id').references(() => addresses.id),
  driverId: integer('driver_id').references(() => drivers.id),
  deliveryFee: numeric('delivery_fee', { precision: 10, scale: 2 }).notNull().default('0'),
  subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
  total: numeric('total', { precision: 10, scale: 2 }).notNull(),
  paymentStatus: paymentStatus('payment_status').notNull().default('unpaid'),
  paymentMethod: paymentMethod('payment_method').notNull().default('cash'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  dishId: integer('dish_id')
    .notNull()
    .references(() => dishes.id),
  quantity: integer('quantity').notNull(),
  unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  notes: text('notes'),
})

const plans = pgTable('plans', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  billingCycle: billingCycle('billing_cycle').notNull(),
  durationMonths: integer('duration_months').notNull().default(1),
  maxDishes: integer('max_dishes'),
  commissionRate: numeric('commission_rate', { precision: 5, scale: 2 }),
})

const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  restaurantId: integer('restaurant_id')
    .notNull()
    .unique()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  planId: integer('plan_id')
    .notNull()
    .references(() => plans.id),
  status: subscriptionStatus('status').notNull().default('trialing'),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  restaurantId: integer('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  planId: integer('plan_id').references(() => plans.id),
  message: text('message').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  action: varchar('action', { length: 100 }).notNull(),
  message: text('message').notNull(),
  actorEmail: varchar('actor_email', { length: 255 }),
  actorRole: userRole('actor_role'),
  restaurantId: integer('restaurant_id').references(() => restaurants.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

const restaurantsRelations = relations(restaurants, ({ many, one }) => ({
  users: many(users),
  categories: many(categories),
  dishes: many(dishes),
  orders: many(orders),
  deliveryZones: many(deliveryZones),
  drivers: many(drivers),
  notifications: many(notifications),
  activityLogs: many(activityLogs),
  subscription: one(subscriptions, {
    fields: [restaurants.id],
    references: [subscriptions.restaurantId],
  }),
}))

const usersRelations = relations(users, ({ one }) => ({
  restaurant: one(restaurants, { fields: [users.restaurantId], references: [restaurants.id] }),
}))

const categoriesRelations = relations(categories, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [categories.restaurantId],
    references: [restaurants.id],
  }),
  dishes: many(dishes),
}))

const dishesRelations = relations(dishes, ({ one, many }) => ({
  restaurant: one(restaurants, { fields: [dishes.restaurantId], references: [restaurants.id] }),
  category: one(categories, { fields: [dishes.categoryId], references: [categories.id] }),
  orderItems: many(orderItems),
}))

const customersRelations = relations(customers, ({ many }) => ({
  addresses: many(addresses),
  orders: many(orders),
}))

const addressesRelations = relations(addresses, ({ one }) => ({
  customer: one(customers, { fields: [addresses.customerId], references: [customers.id] }),
}))

const deliveryZonesRelations = relations(deliveryZones, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [deliveryZones.restaurantId],
    references: [restaurants.id],
  }),
}))

const driversRelations = relations(drivers, ({ one, many }) => ({
  restaurant: one(restaurants, { fields: [drivers.restaurantId], references: [restaurants.id] }),
  orders: many(orders),
}))

const ordersRelations = relations(orders, ({ one, many }) => ({
  restaurant: one(restaurants, { fields: [orders.restaurantId], references: [restaurants.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  deliveryAddress: one(addresses, {
    fields: [orders.deliveryAddressId],
    references: [addresses.id],
  }),
  driver: one(drivers, { fields: [orders.driverId], references: [drivers.id] }),
  items: many(orderItems),
}))

const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  dish: one(dishes, { fields: [orderItems.dishId], references: [dishes.id] }),
}))

const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions),
}))

const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [subscriptions.restaurantId],
    references: [restaurants.id],
  }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
}))

const notificationsRelations = relations(notifications, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [notifications.restaurantId],
    references: [restaurants.id],
  }),
  plan: one(plans, { fields: [notifications.planId], references: [plans.id] }),
}))

const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [activityLogs.restaurantId],
    references: [restaurants.id],
  }),
}))

module.exports = {
  userRole,
  subscriptionStatus,
  billingCycle,
  orderType,
  orderStatus,
  paymentStatus,
  paymentMethod,
  restaurants,
  users,
  categories,
  dishes,
  customers,
  addresses,
  deliveryZones,
  drivers,
  orders,
  orderItems,
  plans,
  subscriptions,
  notifications,
  activityLogs,
  restaurantsRelations,
  usersRelations,
  categoriesRelations,
  dishesRelations,
  customersRelations,
  addressesRelations,
  deliveryZonesRelations,
  driversRelations,
  ordersRelations,
  orderItemsRelations,
  plansRelations,
  subscriptionsRelations,
  notificationsRelations,
  activityLogsRelations,
}

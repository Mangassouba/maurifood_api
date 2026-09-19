const express = require('express')
const cors = require('cors')

const authRoutes = require('./routes/auth.routes')
const publicRoutes = require('./routes/public.routes')
const dashboardRoutes = require('./routes/dashboard.routes')
const customerRoutes = require('./routes/customer.routes')
const adminRoutes = require('./routes/admin.routes')
const plansRoutes = require('./routes/plans.routes')

const app = express()

app.use(cors())
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/public', publicRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/plans', plansRoutes)
app.use('/api', customerRoutes)
app.use('/api/admin', adminRoutes)

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Erreur serveur' })
})

module.exports = app

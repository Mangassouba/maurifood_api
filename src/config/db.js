const { Pool } = require('pg')
const { drizzle } = require('drizzle-orm/node-postgres')
const schema = require('../db/schema')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const db = drizzle(pool, { schema })

module.exports = db
module.exports.pool = pool

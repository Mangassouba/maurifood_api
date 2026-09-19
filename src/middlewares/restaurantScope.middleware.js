// Force le scope des requêtes du dashboard au restaurant de l'utilisateur connecté,
// pour empêcher un restaurant d'accéder/modifier les données d'un autre.
function restaurantScope(req, res, next) {
  if (!req.user.restaurantId) {
    return res.status(403).json({ error: 'Aucun restaurant associé à ce compte' })
  }
  req.restaurantId = req.user.restaurantId
  next()
}

module.exports = restaurantScope

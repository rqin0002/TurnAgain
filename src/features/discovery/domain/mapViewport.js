/**
 * The viewport reducer (spec 6.4, D2, M4-D1): `mapBounds` follows every `moveend`, while
 * `appliedViewport`, the filter the results pipeline uses, changes only on "Search this area" or
 * on a user move with "Update as map moves" on. A programmatic move never applies and never
 * offers "Search this area". Pure: the component reports the events, the view dispatches them.
 */

/** @returns {{ mapBounds: object | null, appliedViewport: object | null, searchAreaAvailable: boolean, lastUserMoveAt: number | null }} */
export function createViewportState() {
  return {
    mapBounds: null,
    appliedViewport: null,
    searchAreaAvailable: false,
    lastUserMoveAt: null,
  }
}

const KEYS = ['south', 'west', 'north', 'east']

export function boundsEqual(left, right, toleranceDeg = 1e-6) {
  if (!left || !right) return left === right
  return KEYS.every((key) => Math.abs(left[key] - right[key]) <= toleranceDeg)
}

const KM_PER_DEGREE = 111.32

/**
 * The box a radius choice frames: the dashed ring around the origin (FW-R4). A flat
 * approximation, fine at Victorian latitudes for 2 to 20 km.
 *
 * @returns {{ south: number, west: number, north: number, east: number }}
 */
export function boundsAround({ latitude, longitude }, radiusKm) {
  const dLat = radiusKm / KM_PER_DEGREE
  const dLng = radiusKm / (KM_PER_DEGREE * Math.cos((latitude * Math.PI) / 180))
  return {
    south: latitude - dLat,
    west: longitude - dLng,
    north: latitude + dLat,
    east: longitude + dLng,
  }
}

const copy = (bounds) =>
  bounds ? { south: bounds.south, west: bounds.west, north: bounds.north, east: bounds.east } : null

/**
 * @param {ReturnType<typeof createViewportState>} state
 * @param {{ type: 'user-move-end', bounds: object, follow: boolean, at?: number }
 *   | { type: 'programmatic-move-end', bounds: object }
 *   | { type: 'search-this-area' }
 *   | { type: 'radius-chosen' }
 *   | { type: 'clear-viewport' }
 *   | { type: 'view-changed', view: 'list' | 'map' }} event
 */
export function reduceViewport(state, event) {
  const next = { ...state }
  switch (event.type) {
    case 'user-move-end': {
      next.mapBounds = copy(event.bounds)
      next.lastUserMoveAt = event.at ?? Date.now()
      if (event.follow) {
        next.appliedViewport = copy(event.bounds)
        next.searchAreaAvailable = false
      } else {
        next.searchAreaAvailable = !boundsEqual(next.mapBounds, state.appliedViewport)
      }
      return next
    }
    case 'programmatic-move-end':
      next.mapBounds = copy(event.bounds)
      return next
    case 'search-this-area':
      next.appliedViewport = copy(state.mapBounds)
      next.searchAreaAvailable = false
      return next
    case 'radius-chosen':
    case 'clear-viewport':
      next.appliedViewport = null
      next.searchAreaAvailable = false
      return next
    case 'view-changed':
      if (event.view === 'list') {
        next.appliedViewport = null
        next.mapBounds = null
        next.searchAreaAvailable = false
      }
      return next
    default:
      return next
  }
}

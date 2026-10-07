/**
 * No-op prediction for the three programmatic map moves (spec 6.4 L882, decisions R18 and R21,
 * amended by M4-D1). Pure: the functions take a map *interface*, the subset of a Leaflet 1.9.4
 * Map that `NearbyMap.vue` passes through unchanged (`getCenter`, `getZoom`, `getSize`,
 * `project`, `unproject`, `getBoundsZoom`, `latLngToContainerPoint`, `distance`), so they are
 * tested with hand-built numbers and never import `leaflet` (`boundaries/domain-pure`).
 * Bounds are plain `{ south, west, north, east }`; points are `{ x, y }`; latlngs `{ lat, lng }`.
 *
 * Under M4-D1 a `setView`/`fitBounds` at an unchanged view still fires one synchronous `moveend`
 * (facts F1), which the component classifies as the programmatic move's own; these predicates let
 * it skip the call entirely so nothing is emitted. `panInside` is the one truly silent call.
 */

const toPoint = (value) =>
  Array.isArray(value) ? { x: value[0], y: value[1] } : { x: value.x, y: value.y }

export const toLeafletBounds = (bounds) => [
  [bounds.south, bounds.west],
  [bounds.north, bounds.east],
]

export const fromLeafletBounds = (latLngBounds) => ({
  south: latLngBounds.getSouth(),
  west: latLngBounds.getWest(),
  north: latLngBounds.getNorth(),
  east: latLngBounds.getEast(),
})

/**
 * Leaflet 1.9.4 `Map._getBoundsCenterZoom` replicated: the zoom from `getBoundsZoom` with the
 * SUM of both paddings, the projected midpoint of the bounds shifted by half the padding
 * difference, and the geographic centre when the zoom is Infinity (a map with no size yet).
 *
 * @param {object} map the map interface
 * @param {{ south: number, west: number, north: number, east: number }} bounds
 * @param {{ padding?: number[], paddingTopLeft?: number[], paddingBottomRight?: number[], maxZoom?: number }} [options]
 * @returns {{ center: { lat: number, lng: number }, zoom: number }}
 */
export function fitBoundsTarget(map, bounds, options = {}) {
  const paddingTL = toPoint(options.paddingTopLeft ?? options.padding ?? [0, 0])
  const paddingBR = toPoint(options.paddingBottomRight ?? options.padding ?? [0, 0])
  const zoom = Math.min(
    options.maxZoom ?? Infinity,
    map.getBoundsZoom(toLeafletBounds(bounds), false, {
      x: paddingTL.x + paddingBR.x,
      y: paddingTL.y + paddingBR.y,
    }),
  )
  if (zoom === Infinity) {
    return {
      center: { lat: (bounds.south + bounds.north) / 2, lng: (bounds.west + bounds.east) / 2 },
      zoom,
    }
  }
  const sw = map.project([bounds.south, bounds.west], zoom)
  const ne = map.project([bounds.north, bounds.east], zoom)
  const center = map.unproject(
    {
      x: (sw.x + ne.x) / 2 + (paddingBR.x - paddingTL.x) / 2,
      y: (sw.y + ne.y) / 2 + (paddingBR.y - paddingTL.y) / 2,
    },
    zoom,
  )
  return { center: { lat: center.lat, lng: center.lng }, zoom }
}

/** `setView(center, zoom)` moves nothing when the zoom is unchanged and the centre is under 1 m away. */
export const isSetViewNoop = (map, center, zoom) =>
  map.getZoom() === zoom && map.distance(map.getCenter(), center) < 1

/** `fitBounds(bounds, options)` moves nothing when its computed target is the current view. */
export function isFitBoundsNoop(map, bounds, options = {}) {
  const target = fitBoundsTarget(map, bounds, options)
  return target.zoom === map.getZoom() && map.distance(map.getCenter(), target.center) < 1
}

/** `panInside(latlng, options)` moves nothing when the point lies inside the padded container. */
export function isPanInsideNoop(
  map,
  latlng,
  { padding = [0, 0], paddingTopLeft, paddingBottomRight } = {},
) {
  const tl = toPoint(paddingTopLeft ?? padding)
  const br = toPoint(paddingBottomRight ?? padding)
  const point = map.latLngToContainerPoint(latlng)
  const size = map.getSize()
  return tl.x <= point.x && point.x <= size.x - br.x && tl.y <= point.y && point.y <= size.y - br.y
}

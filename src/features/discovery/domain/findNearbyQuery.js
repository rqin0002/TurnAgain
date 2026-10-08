import { normalizePagination } from '@/shared/domain/pagination.js'

import { validateSearchInput } from './searchValidation.js'

/**
 * The `/find-nearby` URL contract, one serialiser. On the Find nearby page,
 * `parseFindNearbyQuery` is the only reader of the route query and `toFindNearbyQuery` the only
 * writer (Home and the guides only link in with a starting query); the in-memory state below is
 * the single truth every discovery composable and component works from. Invalid values are
 * dropped in memory (the form shows the field error), nothing ever redirects, coordinates never
 * appear, and `radius: null` means "not chosen" (the origin's default, `effectiveRadius`).
 */

export const FIND_NEARBY_SORTS = Object.freeze([
  'name-asc',
  'name-desc',
  'nearest',
  'highest-rated',
])
export const FIND_NEARBY_RADII = Object.freeze([2, 5, 10, 20, 0])
export const FIND_NEARBY_VIEWS = Object.freeze(['list', 'map'])
export const FIND_NEARBY_ACTIONS = Object.freeze(['repair', 'reuse', 'recycle'])

const first = (value) => (Array.isArray(value) ? value[0] : value)
const firstString = (value) => (typeof first(value) === 'string' ? first(value) : '')
const list = (value) => (Array.isArray(value) ? value : value === undefined ? [] : [value])

/**
 * @typedef {object} FindNearbyState
 * @property {string} item
 * @property {string} location
 * @property {boolean} near
 * @property {Array<'repair' | 'reuse' | 'recycle'>} actionTypes
 * @property {boolean} open   the "Open now" chip: `open=1` in the URL
 * @property {'name-asc' | 'name-desc' | 'nearest' | 'highest-rated'} sort
 * @property {2 | 5 | 10 | 20 | 0 | null} radius
 * @property {'list' | 'map'} view
 * @property {boolean} follow
 * @property {number} page
 * @property {10 | 20} pageSize
 * @property {{ item: string, location: string }} errors
 */

/** @returns {FindNearbyState} */
export function parseFindNearbyQuery(query = {}) {
  const source = query && typeof query === 'object' ? query : {}
  const checked = validateSearchInput({
    item: firstString(source.item),
    location: firstString(source.location),
  })
  const actions = list(source.action).filter((value) => FIND_NEARBY_ACTIONS.includes(value))
  const sort = firstString(source.sort)
  const radius = Number(firstString(source.radius))
  const pagination = normalizePagination(source)
  return {
    item: checked.errors.item ? '' : checked.values.item,
    location: checked.errors.location ? '' : checked.values.location,
    near: firstString(source.near) === 'me',
    actionTypes: FIND_NEARBY_ACTIONS.filter((action) => actions.includes(action)),
    open: firstString(source.open) === '1',
    sort: FIND_NEARBY_SORTS.includes(sort) ? sort : 'name-asc',
    radius:
      /^(?:2|5|10|20|0)$/u.test(firstString(source.radius)) && FIND_NEARBY_RADII.includes(radius)
        ? radius
        : null,
    view: firstString(source.view) === 'map' ? 'map' : 'list',
    follow: firstString(source.follow) === '1',
    page: pagination.page,
    pageSize: pagination.pageSize,
    errors: { item: checked.errors.item, location: checked.errors.location },
  }
}

/** The query for a state, keys in the URL contract's order, defaults omitted, every value a string. */
export function toFindNearbyQuery(state) {
  const query = {}
  if (state.item) query.item = state.item
  if (state.location) query.location = state.location
  if (state.near) query.near = 'me'
  if (state.actionTypes.length > 0) query.action = [...state.actionTypes]
  if (state.open) query.open = '1'
  if (state.sort !== 'name-asc') query.sort = state.sort
  if (state.radius !== null) query.radius = String(state.radius)
  if (state.view !== 'list') query.view = state.view
  if (state.follow) query.follow = '1'
  if (state.page !== 1) query.page = String(state.page)
  if (state.pageSize !== 10) query.pageSize = String(state.pageSize)
  return query
}

const COMPARED_KEYS = [
  'item',
  'location',
  'near',
  'open',
  'sort',
  'radius',
  'view',
  'follow',
  'page',
  'pageSize',
]

/** Deep equality of two states, ignoring `errors` (parsed state against parsed state, never strings). */
export function isSameFindNearbyState(left, right) {
  return (
    COMPARED_KEYS.every((key) => left[key] === right[key]) &&
    left.actionTypes.length === right.actionTypes.length &&
    left.actionTypes.every((action, index) => action === right.actionTypes[index])
  )
}

/** The radius the pipeline uses: the chosen one, else 5 km for a device fix and 10 km for a typed place. */
export function effectiveRadius(state, origin) {
  return state.radius ?? (origin?.source === 'geolocation' ? 5 : 10)
}

// The device answers `useLocationOrigin().deviceStatus` reports as a refusal or a failure.
const DEVICE_FAILURES = Object.freeze(['denied', 'timeout', 'unavailable', 'unsupported'])

/**
 * The URL after the origin status is known: `near=me` goes when the permission is denied or the
 * device cannot locate, read from the origin status or, when a typed place kept the
 * origin `ready`, from the device's own answer (`deviceStatus`); and
 * `sort=nearest` survives only while an origin exists or is being acquired. The page is not touched here.
 */
export function canonicalizeFindNearbyState(state, { originStatus, deviceStatus = null }) {
  const next = { ...state, actionTypes: [...state.actionTypes], errors: { ...state.errors } }
  if (
    originStatus === 'denied' ||
    originStatus === 'unavailable' ||
    DEVICE_FAILURES.includes(deviceStatus)
  ) {
    next.near = false
  }
  if (next.sort === 'nearest' && originStatus !== 'ready' && originStatus !== 'pending') {
    next.sort = 'name-asc'
  }
  return next
}

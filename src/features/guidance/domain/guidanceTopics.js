import { deepFreeze } from '@/shared/domain/deepFreeze.js'

/**
 * Source-backed public guidance for high-risk or commonly misunderstood items.
 *
 * This is deliberately a small editorial dataset, not a second service catalogue. Content stays
 * as plain text so Vue's normal escaping remains the rendering boundary, while time-sensitive
 * decisions remain with the linked government or council source.
 */

/**
 * @typedef {object} GuidanceSource
 * @property {string} title
 * @property {string} organisation
 * @property {string} url
 * @property {string} checkedAt ISO calendar date in YYYY-MM-DD form.
 */

/**
 * @typedef {object} GuidanceTerm
 * @property {string} term
 * @property {string} definition
 */

/**
 * @typedef {object} GuidanceTopic
 * @property {string} id
 * @property {string} scope
 * @property {string} title
 * @property {string} summary
 * @property {readonly string[]} [steps] A guide's ordered advice (absent on the glossary).
 * @property {readonly GuidanceTerm[]} [terms] The glossary's entries, sorted by term.
 * @property {readonly GuidanceSource[]} sources
 * @property {{ label: string, to: { name: string, query?: Record<string, string> } }} [action]
 */

/** The glossary is rendered as a definition list, not a card of steps. */
export const WASTE_TERMS_ID = 'waste-terms-glossary'

/** @type {readonly GuidanceTopic[]} */
export const GUIDANCE_TOPICS = deepFreeze([
  {
    id: 'electronics-and-batteries',
    scope: 'Victoria wide safety guidance',
    title: 'Electronics & batteries',
    summary:
      'E-waste and batteries should not go in household bins. Incorrect disposal can cause fires in collection trucks and resource-recovery facilities.',
    steps: [
      'Keep the device or battery out of every household bin.',
      'Use a council or specialist drop-off point that accepts the exact item.',
      'Confirm accepted device and battery types before travelling.',
    ],
    sources: [
      {
        title: 'Fire Prevention Program',
        organisation: 'Victorian Government',
        url: 'https://www.vic.gov.au/fire-prevention-program',
        checkedAt: '2026-09-03',
      },
    ],
    action: {
      label: 'Search for e-waste options',
      to: { name: 'find-nearby', query: { item: 'e-waste' } },
    },
  },
  {
    id: 'household-chemicals',
    scope: 'Victoria wide disposal guidance',
    title: 'Household chemicals',
    summary:
      'Hazardous household chemicals need product-specific handling. Do not place them in household rubbish or pour them down a drain.',
    steps: [
      'Read the product label and keep the chemical safely stored until disposal.',
      'Never mix chemicals during use or storage.',
      'Use the official disposal list to find the pathway for that exact product.',
    ],
    sources: [
      {
        title: 'How to dispose of hazardous household chemicals',
        organisation: 'Department of Energy, Environment and Climate Action',
        url: 'https://www.environment.vic.gov.au/hazardous-household-chemicals/how-to-dispose-of-hazardous-household-chemicals',
        checkedAt: '2026-09-03',
      },
      {
        title: 'Safe management of hazardous household chemicals',
        organisation: 'Department of Energy, Environment and Climate Action',
        url: 'https://www.environment.vic.gov.au/hazardous-household-chemicals/safe-management-of-hazardous-household-chemicals',
        checkedAt: '2026-09-03',
      },
    ],
  },
  {
    id: 'household-recycling',
    scope: 'Statewide framework with local delivery',
    title: 'Household recycling',
    summary:
      'Victoria is transitioning to four household streams, but the service available today still depends on the council or collection provider for the property.',
    steps: [
      'The four streams are glass, FOGO, mixed recycling and general rubbish.',
      'Check the local service before relying on a bin colour, collection schedule or accepted-item list.',
      'For shared or privately collected bins, also check the building-specific rules.',
    ],
    sources: [
      {
        title: 'Standardising household recycling across Victoria',
        organisation: 'Victorian Government',
        url: 'https://www.vic.gov.au/Standardising-household-recycling-across-Victoria',
        checkedAt: '2026-09-03',
      },
      {
        title: 'Know Your Council',
        organisation: 'Victorian Government',
        url: 'https://www.vic.gov.au/know-your-council/',
        checkedAt: '2026-09-03',
      },
    ],
    action: {
      label: 'Find recycling options',
      to: { name: 'find-nearby', query: { action: 'recycle' } },
    },
  },
  {
    id: 'repair-or-reuse',
    scope: 'Deciding before you travel',
    title: 'Repair, reuse or recycle?',
    summary:
      'Most items have more than one possible next step. Working through condition, safety and demand in that order usually points to the pathway that keeps the item useful longest.',
    steps: [
      'Start with condition: if the item worked until one part failed (a cable, a zip, a wheel, a switch), repair is usually the cheapest and least wasteful step. Community repair sessions assess small appliances, bikes, clothing and furniture; bring the charger or parts that belong with it.',
      'Rule out safety first: anything with a lithium battery, a gas cylinder, a cracked heating element or exposed wiring goes to a specialist or council drop-off, not to a general reuse shop and never to a household bin.',
      'If it still works, ask who could use it: reuse shops, toy and tool libraries and donation points take items in working, clean and complete condition. Check quantity limits and whether the provider accepts the exact category before you load the car.',
      'If nobody can use it as it is, recycle by material: check the council’s accepted list for the exact item, and use the deposit scheme for eligible drink containers.',
      'Whatever the pathway, confirm opening hours, fees and residency rules on the linked source on the day you travel.',
    ],
    sources: [
      {
        title: 'Know Your Council',
        organisation: 'Victorian Government',
        url: 'https://www.vic.gov.au/know-your-council/',
        checkedAt: '2026-10-01',
      },
      {
        title: 'Fire Prevention Program',
        organisation: 'Victorian Government',
        url: 'https://www.vic.gov.au/fire-prevention-program',
        checkedAt: '2026-10-01',
      },
      {
        title: 'Victoria’s Container Deposit Scheme',
        organisation: 'CDS Vic',
        url: 'https://cdsvic.org.au/',
        checkedAt: '2026-10-01',
      },
    ],
    action: {
      label: 'Search for repair options',
      to: { name: 'find-nearby', query: { action: 'repair' } },
    },
  },
  {
    id: WASTE_TERMS_ID,
    scope: 'Words used on listings and council pages',
    title: 'Waste terms glossary',
    summary:
      'Listings and council pages use words that mean something specific. These are the terms TurnAgain uses, in the sense the Victorian services use them.',
    terms: [
      {
        term: 'Container deposit scheme (CDS)',
        definition:
          'Victoria’s refund scheme that pays 10 cents for each eligible drink container returned to a refund point. Eligibility depends on the container, not on the brand.',
      },
      {
        term: 'Drop-off point',
        definition:
          'A place that accepts a specific category of item, such as batteries or small e-waste, often a library, council office or shop counter with a marked bin. Accepted items are listed per point.',
      },
      {
        term: 'E-waste',
        definition:
          'Anything with a plug, battery or cord that has reached the end of its use: phones, chargers, appliances, cables and batteries. It must not go in any household bin because batteries can start fires in trucks and facilities.',
      },
      {
        term: 'FOGO',
        definition:
          'Food organics and garden organics: the lime-green-lid stream for food scraps and garden waste under Victoria’s four-stream household system. Which items a council accepts in it is set locally.',
      },
      {
        term: 'General rubbish',
        definition:
          'The red-lid stream for household waste that no other stream accepts. It goes to landfill, so it is the last option TurnAgain suggests, never the first.',
      },
      {
        term: 'Glass recycling',
        definition:
          'The purple-lid stream for glass bottles and jars only, separated so that broken glass does not contaminate paper and plastics in mixed recycling.',
      },
      {
        term: 'Hard waste',
        definition:
          'Large household items such as furniture, mattresses and white goods that a council collects from the kerb by booking or on a schedule. Rules on what may be left out and when vary by council.',
      },
      {
        term: 'Mixed recycling',
        definition:
          'The yellow-lid stream for paper, cardboard, plastic containers and metals. Glass is no longer part of it once a council has moved to the four-stream system.',
      },
      {
        term: 'Repair café',
        definition:
          'A community session where volunteers help diagnose and repair items alongside their owners. Sessions are usually free, run on fixed dates and cannot promise that every item can be fixed.',
      },
      {
        term: 'Resource recovery centre',
        definition:
          'A staffed site, often called a transfer station, that accepts sorted waste and recycling in larger quantities than a kerbside bin. Many charge by load and require proof of address for free categories.',
      },
      {
        term: 'Reuse shop',
        definition:
          'A shop, often on a council site or run by a charity, that resells usable donated items. Donations are checked for condition and completeness at the door.',
      },
      {
        term: 'Tool or toy library',
        definition:
          'A membership library that lends tools or toys instead of selling them, keeping one item in use by many households.',
      },
    ],
    sources: [
      {
        title: 'Standardising household recycling across Victoria',
        organisation: 'Victorian Government',
        url: 'https://www.vic.gov.au/Standardising-household-recycling-across-Victoria',
        checkedAt: '2026-10-01',
      },
      {
        title: 'Fire Prevention Program',
        organisation: 'Victorian Government',
        url: 'https://www.vic.gov.au/fire-prevention-program',
        checkedAt: '2026-10-01',
      },
      {
        title: 'Victoria’s Container Deposit Scheme',
        organisation: 'CDS Vic',
        url: 'https://cdsvic.org.au/',
        checkedAt: '2026-10-01',
      },
    ],
  },
])

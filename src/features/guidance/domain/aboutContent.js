import { deepFreeze } from '@/shared/domain/deepFreeze.js'

/**
 * Static content of the About page. Plain data so Vue's escaping stays the
 * rendering boundary; the four ids (`checked`, `contact`, `privacy`, `api`) are the
 * footer and route anchors, so they are constants here and not typed twice.
 */

export const API_BASE_URL = 'https://australia-southeast1-fit5032-7b50f.cloudfunctions.net/api'
export const API_DOCS_URL = 'https://github.com/rqin0002/TurnAgain/blob/main/docs/API.md'
export const CONTACT_URL = 'https://github.com/rqin0002/TurnAgain/issues'

export const ABOUT_ANCHORS = Object.freeze(['checked', 'contact', 'privacy', 'api'])

/**
 * Every string leaf of a content object, depth first. The copy tests scan the result for words
 * that must not appear and sentences that must.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
export function collectStrings(value) {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(collectStrings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectStrings)
  return []
}

export const ABOUT_CONTENT = deepFreeze({
  hero: {
    eyebrow: 'About & help',
    title: 'A clearer next step for things you no longer need.',
    lead: 'TurnAgain brings repair, reuse and recycling options together, so you can compare the pathway before you travel.',
    promises: ['Provider source linked', 'Repair, reuse and recycling'],
  },

  navigation: {
    ariaLabel: 'About page sections',
    items: [
      { label: 'About', href: '#about-turnagain' },
      { label: 'How it works', href: '#how-it-works' },
      { label: 'How information is checked', href: '#checked' },
      { label: 'Before you go', href: '#before-you-go' },
      { label: 'Using TurnAgain', href: '#using-turnagain' },
      { label: 'Help', href: '#help' },
      { label: 'Contact and corrections', href: '#contact' },
      { label: 'Privacy', href: '#privacy' },
      { label: 'Public API', href: '#api' },
    ],
  },

  about: {
    id: 'about-turnagain',
    titleId: 'about-title',
    eyebrow: 'Why TurnAgain',
    title: 'Turn an unwanted item into a local action.',
    paragraphs: [
      'An unwanted or broken item rarely comes with one obvious answer. Its condition, your council area, service eligibility, fees, booking rules and transport needs can all change the right next step.',
      'TurnAgain is a Melbourne-focused community project designed to make waste reduction, repair and reuse easier to navigate. It is intended to reduce information friction for residents who may face language, digital confidence, transport or service access barriers.',
      'TurnAgain keeps three pathways: repair what can keep working, reuse what can serve someone else, and recycle what has reached the end of its useful life.',
    ],
  },

  howItWorks: {
    id: 'how-it-works',
    titleId: 'pathway-title',
    eyebrow: 'How it works',
    title: 'Choose the pathway that fits the item.',
    pathways: [
      {
        number: '01',
        title: 'Repair',
        copy: 'Look for community repair services that may help diagnose or fix a broken item.',
        note: 'Check session dates, booking rules and the types of items volunteers can assess.',
      },
      {
        number: '02',
        title: 'Reuse or donate',
        copy: 'Keep a usable item in circulation through an eligible reuse or donation service.',
        note: 'Check the item condition, quantity limits and any resident or drop-off requirements.',
      },
      {
        number: '03',
        title: 'Recycle',
        copy: 'Find a selected drop-off or resource-recovery option when repair or reuse is not suitable.',
        note: 'Check fees, accepted materials, residency rules and safe handling before you travel.',
      },
    ],
    steps: {
      titleId: 'search-steps-title',
      title: 'From item to next step',
      items: [
        {
          number: '1',
          title: 'Describe the item',
          body: 'Use a familiar name such as laptop, bicycle, clothing or battery.',
        },
        {
          number: '2',
          title: 'Add a location if useful',
          body: 'Enter a Victorian suburb or postcode, or leave it blank to browse all records.',
        },
        {
          number: '3',
          title: 'Compare the pathways',
          body: 'Filter the matching options by repair, reuse or recycling.',
        },
        {
          number: '4',
          title: 'Confirm before you act',
          body: 'Open the linked source and check the provider’s latest conditions.',
        },
      ],
    },
  },

  checked: {
    id: 'checked',
    titleId: 'checked-title',
    eyebrow: 'How information is checked',
    title: 'What a result can—and cannot—tell you.',
    intro:
      'Every record links to the council or provider page it was taken from and shows the date TurnAgain last checked that page. The catalogue is checked by people, not scraped, and the limits of that check are visible on every listing.',
    items: [
      {
        term: 'Source',
        description:
          'The council or provider page linked to a record. Use it to confirm current eligibility, accepted items, dates, fees and booking requirements.',
      },
      {
        term: 'Catalogue checked',
        description:
          'The date TurnAgain last checked the linked source. It is not a live-status indicator and does not mean the service is open now.',
      },
      {
        term: 'Listed items',
        description:
          'Searchable examples recorded in the catalogue—not a promise that every item, size, quantity or condition will be accepted.',
      },
      {
        term: 'Community ratings',
        description:
          'User feedback about a service. Ratings do not verify provider information or replace the conditions published by the provider.',
      },
      {
        term: 'Corrections',
        description:
          'When a listing is wrong, tell us (see Contact and corrections below). Staff check the source again and update the record; nothing is changed on a report alone.',
      },
    ],
  },

  beforeTravel: {
    id: 'before-you-go',
    titleId: 'before-title',
    eyebrow: 'Before you travel',
    title: 'Five checks can prevent a wasted trip.',
    intro:
      'Service details can change after a catalogue check. If anything is unclear, contact the provider before travelling or carrying a difficult item.',
    checks: [
      { number: '1', body: 'Is this exact item—and its current condition—accepted?' },
      { number: '2', body: 'Do I need to book, pay a fee or show proof of address?' },
      { number: '3', body: 'Are there quantity, size or preparation limits?' },
      {
        number: '4',
        body: 'Are the opening time, session date and location still current?',
      },
      {
        number: '5',
        body: 'Can I transport the item safely, and is the site accessible for me?',
      },
    ],
  },

  using: {
    id: 'using-turnagain',
    titleId: 'using-title',
    eyebrow: 'Using TurnAgain',
    title: 'What you can do here.',
    groups: [
      {
        key: 'available',
        titleId: 'available-title',
        title: 'Available now',
        items: [
          'Search by item name, suburb or Victorian postcode—or browse without entering either.',
          'Filter selected services by repair, reuse or recycling and sort results by name.',
          'Open a service record to see listed items, its linked source and catalogue check date.',
          'View community rating summaries and, after signing in, add or update your own rating.',
          'Save a service to your account so you can find it again.',
          'Browse repair and reuse activities, session information and linked provider sources, as a list or in a calendar.',
          'Signed in, book a place in a TurnAgain repair session (or join its waitlist when it is full), add it to your calendar, and see or cancel your bookings from your Account page.',
          "TurnAgain follows your device's light or dark setting; signed in, you can choose one on your Account page.",
        ],
      },
      {
        key: 'limits',
        titleId: 'limits-title',
        title: 'Current limits',
        items: [
          'The catalogue covers selected services and activities, so a search may not include every local option.',
          'TurnAgain takes bookings only for the repair sessions it runs; other sessions, and any fees, are handled through the provider’s own process.',
          'Capacity is shown only when published; provider-managed availability must be checked with the provider.',
          'TurnAgain does not arrange collections or confirm that an item will be accepted.',
          'Offline, TurnAgain is cached browsing of already-loaded pages: pages and results you opened in this session keep working without a connection, but a page you have not opened yet, and a fresh start, need a connection. There is no service worker.',
        ],
      },
    ],
  },

  contact: {
    id: 'contact',
    titleId: 'contact-title',
    eyebrow: 'Contact and corrections',
    title: 'Tell us when a listing is wrong.',
    paragraphs: [
      'TurnAgain is a community project maintained in the open. Questions, accessibility problems and corrections to a listing are welcome through the project’s issue tracker; include the service or activity name and what you found on the provider’s page.',
      'Each service listing has a “Something wrong with this listing?” form: staff check the source again before they change anything. The issue tracker stays open for everything else, and the provider source linked on every listing is the place to confirm details today.',
    ],
    link: { label: 'Open the TurnAgain issue tracker', href: CONTACT_URL },
  },

  privacy: {
    id: 'privacy',
    titleId: 'privacy-title',
    eyebrow: 'Privacy',
    title: 'What TurnAgain stores, and what it never does.',
    stored: {
      title: 'What is stored',
      items: [
        'Your account: the display name and email you registered with, your role, and the services you save. Your email is used to verify the account and to send you the emails you ask for.',
        'Your ratings: one score per service and, if you write one, a private note that only you can read.',
        'A booking holds the name you give for the session register, your account’s email address at the time you book and, if you add one, a short note about what you are bringing. The name and email let TurnAgain send your confirmation and let staff see who is coming; the note is for staff only and is never put in an email.',
        'A correction holds your message and, only if you give it, an email address for follow-up; only staff see it, in their corrections queue, and it is never exported.',
      ],
    },
    never: {
      title: 'What is never stored',
      items: [
        'Your device location coordinates, the position of the map or any route. If you ask for directions, the start point you chose is sent to the routing provider (FOSSGIS OSRM) for that request; TurnAgain does not keep it, and the routing provider logs requests.',
        'A suburb or postcode you type is a search criterion like the item name: it is part of the results page address and may be remembered in this browser only, where you can clear it. It is never sent to a server on its own.',
      ],
    },
    handling: {
      title: 'How data moves',
      items: [
        'Emails TurnAgain sends go through Brevo, an email delivery service, using the address on your account or booking. TurnAgain keeps a record of each send (its status and the names and sizes of any attachments), never the message itself.',
        'Staff can export participant lists for the sessions they run, and nothing else about members.',
        'Nothing is sold or shared for advertising. Sign in is by email and password through Firebase Authentication.',
      ],
    },
  },

  api: {
    id: 'api',
    titleId: 'api-title',
    eyebrow: 'Public API',
    title: 'The published catalogue, as data.',
    intro:
      'The service catalogue that this site shows is also available as a JSON API for anyone who wants to build on it. It returns only published services and their public fields.',
    baseUrlLabel: 'Base URL',
    baseUrl: API_BASE_URL,
    curl: `curl "${API_BASE_URL}/services?q=repair&pageSize=1"`,
    docs: { label: 'Read the API documentation (docs/API.md)', href: API_DOCS_URL },
  },

  help: {
    id: 'help',
    titleId: 'help-title',
    eyebrow: 'Help',
    title: 'Questions people need answered.',
    items: [
      {
        question: 'How do I start a search?',
        answer:
          'Enter an item name, a Victorian suburb or postcode, or both. You can also leave both fields blank to browse the complete catalogue. Use everyday item names rather than long descriptions.',
        action: { label: 'Go to the search', to: { name: 'home' } },
      },
      {
        question: 'Why did I get no matching options?',
        answer:
          'The catalogue covers selected services only. Try a broader item name, remove the location, or clear an action filter. No result does not mean that no suitable service exists outside TurnAgain.',
      },
      {
        question: 'Do I need an account?',
        answer:
          'No account is needed to search, browse, filter or open provider sources. Signing in is needed to rate a service, to save services to your account and to book a TurnAgain session.',
      },
      {
        question: 'Can I book a repair activity through TurnAgain?',
        answer:
          'Yes, for the repair sessions TurnAgain runs: open the activity, choose a session and press Book this session, or Join waitlist when it is full. Other providers’ sessions are booked through their own source. A booking does not, by itself, guarantee that an item can be repaired.',
      },
      {
        question: 'Does “catalogue checked” mean the service is open?',
        answer:
          'No. It records when the linked source was checked for the catalogue. Opening hours, event dates, fees and eligibility can change independently, so check the provider source before travelling.',
      },
      {
        question: 'Can TurnAgain guarantee that my item will be accepted?',
        answer:
          'No. Acceptance can depend on the exact item, condition, size, quantity, residency, available capacity and provider judgement. The provider’s current rules and final decision apply.',
      },
      {
        question: 'Does TurnAgain work without a connection?',
        answer:
          'Partly. Pages and results you have already opened in this session keep working, and a banner tells you when you may be offline. Anything you have not opened yet needs a connection.',
      },
    ],
  },

  callToAction: {
    titleId: 'cta-title',
    eyebrow: 'Start with what you have',
    title: 'Give it another turn.',
    action: 'Find an option for your item',
  },
})

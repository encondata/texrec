import { query } from '../db.js';

// Every editable piece of copy/imagery on the public site. The admin "Site Content" page
// renders a form from this schema; the public API returns defaults merged with overrides.
export const CONTENT_SCHEMA = [
  // ---- site-wide ----
  { section: 'Site', key: 'site.name', label: 'Business name', type: 'text', default: 'Tex Rec Scuba Training' },
  { section: 'Site', key: 'site.tagline', label: 'Tagline', type: 'text', default: 'Training · Community · Exploration' },
  { section: 'Site', key: 'site.phone', label: 'Phone', type: 'text', default: '(817) 555-0123' },
  { section: 'Site', key: 'site.email', label: 'Public email', type: 'text', default: 'info@texrec.com' },
  { section: 'Site', key: 'site.address', label: 'Street address', type: 'text', default: '123 Main St' },
  { section: 'Site', key: 'site.city', label: 'City, State ZIP', type: 'text', default: 'Burleson, TX 76028' },
  { section: 'Site', key: 'site.hours', label: 'Hours', type: 'textarea', default: 'Tue–Fri 10am–6pm\nSat 9am–4pm' },
  { section: 'Site', key: 'site.facebook', label: 'Facebook URL', type: 'text', default: '' },
  { section: 'Site', key: 'site.instagram', label: 'Instagram URL', type: 'text', default: '' },
  { section: 'Site', key: 'site.youtube', label: 'YouTube URL', type: 'text', default: '' },
  { section: 'Site', key: 'site.footer', label: 'Footer blurb', type: 'textarea', default: 'Scuba training in Burleson, Texas through SDI, TDI and RAID. Small classes — six students max per instructor — and private classes for every course.' },

  // ---- home ----
  { section: 'Home', key: 'home.hero.eyebrow', label: 'Hero eyebrow line', type: 'text', default: 'Training · Community · Exploration' },
  { section: 'Home', key: 'home.hero.title', label: 'Hero headline (one line per row)', type: 'textarea', default: 'EXPLORE\nLEARN\nDIVE MORE' },
  { section: 'Home', key: 'home.hero.subtitle', label: 'Hero subtitle', type: 'textarea', default: 'Scuba training in Burleson, TX through SDI/TDI and RAID.' },
  { section: 'Home', key: 'home.hero.image', label: 'Hero image', type: 'image', default: '' },
  { section: 'Home', key: 'home.hero.ctaPrimary', label: 'Primary button', type: 'text', default: 'View Classes' },
  { section: 'Home', key: 'home.hero.ctaSecondary', label: 'Secondary button', type: 'text', default: 'Upcoming Events' },
  { section: 'Home', key: 'home.features', label: 'Feature cards', type: 'list',
    itemFields: [{ key: 'icon', label: 'Icon', type: 'icon' }, { key: 'title', label: 'Title', type: 'text' }, { key: 'text', label: 'Text', type: 'text' }],
    default: [
      { icon: 'map-pin', title: 'World-Class Training', text: 'SDI/TDI & RAID programs' },
      { icon: 'compass', title: 'Local & Travel Diving', text: 'From Texas springs to global dive destinations' },
      { icon: 'users', title: 'Experienced Instructors', text: 'Real-world experience. Real passion.' },
      { icon: 'heart-handshake', title: 'Supportive Community', text: 'Training, trips, and a lifetime of dive buddies.' },
    ] },
  { section: 'Home', key: 'home.featured.title', label: 'Featured classes heading', type: 'text', default: 'Featured Classes' },
  { section: 'Home', key: 'home.nextEvent.label', label: 'Next event banner label', type: 'text', default: 'Next Local Event' },
  { section: 'Home', key: 'home.nextEvent.image', label: 'Next event banner image', type: 'image', default: '' },
  { section: 'Home', key: 'home.stats', label: 'Stats band', type: 'list',
    itemFields: [{ key: 'value', label: 'Value', type: 'text' }, { key: 'label', label: 'Label', type: 'text' }],
    default: [{ value: '6', label: 'Students max per instructor' }, { value: '3', label: 'Training agencies' }, { value: '1,000+', label: 'Divers certified' }, { value: '100%', label: 'Courses available privately' }] },
  { section: 'Home', key: 'home.instructors.title', label: 'Instructors section heading', type: 'text', default: 'Learn from divers who live this' },
  { section: 'Home', key: 'home.instructors.text', label: 'Instructors section blurb', type: 'textarea', default: 'Every Tex Rec instructor teaches small classes by choice. Real experience, real patience, and a student-first approach in every course.' },
  { section: 'Home', key: 'home.blog.title', label: 'Blog section heading', type: 'text', default: 'News, Stories & Updates' },
  { section: 'Home', key: 'home.cta.title', label: 'Bottom call-to-action headline', type: 'text', default: 'Ready to dive?' },
  { section: 'Home', key: 'home.cta.text', label: 'Bottom call-to-action text', type: 'textarea', default: 'Pick a class, grab a spot on the calendar, and we’ll see you in the water. Private classes available for every course.' },
  { section: 'Home', key: 'home.cta.button', label: 'Bottom call-to-action button', type: 'text', default: 'Book a Class' },
  { section: 'Home', key: 'home.cta.image', label: 'Bottom call-to-action background', type: 'image', default: '' },

  // ---- pages ----
  { section: 'Training', key: 'training.title', label: 'Heading', type: 'text', default: 'Dive Training Classes' },
  { section: 'Training', key: 'training.subtitle', label: 'Subheading', type: 'text', default: 'Build your skills. Explore new environments. Become the diver you want to be.' },
  { section: 'Calendar', key: 'calendar.title', label: 'Heading', type: 'text', default: 'Class Calendar' },
  { section: 'Calendar', key: 'calendar.subtitle', label: 'Subheading', type: 'text', default: 'See all upcoming classes, training dives, and events. Click an event to view details and sign up.' },
  { section: 'Instructors', key: 'instructors.title', label: 'Heading', type: 'text', default: 'Our Instructors' },
  { section: 'Instructors', key: 'instructors.subtitle', label: 'Subheading', type: 'text', default: 'Passionate. Experienced. Here to help you dive further.' },
  { section: 'Blog', key: 'blog.title', label: 'Heading', type: 'text', default: 'News, Stories & Updates' },
  { section: 'Blog', key: 'blog.subtitle', label: 'Subheading', type: 'text', default: "Class updates, dive travel, training tips, and what's happening at Tex Rec." },
  { section: 'Media', key: 'media.title', label: 'Heading', type: 'text', default: 'Media Gallery' },
  { section: 'Media', key: 'media.subtitle', label: 'Subheading', type: 'text', default: 'Photos and videos from classes, dive trips, and our amazing community.' },
  { section: 'About', key: 'about.title', label: 'Heading', type: 'text', default: 'About Tex Rec' },
  { section: 'About', key: 'about.intro', label: 'Intro', type: 'textarea', default: 'We are a Burleson, Texas dive shop and training center built around one idea: small classes, real instructors, and a community that keeps diving together long after certification.' },
  { section: 'About', key: 'about.body', label: 'Body (Markdown)', type: 'markdown', default: '## Small classes, by design\n\nEvery course is capped at **six students per instructor**, and every course is available as a private class. You get real attention, real feedback, and real confidence in the water.\n\n## SDI, TDI and RAID\n\nWe teach recreational diving through SDI and RAID and technical diving through TDI — from your first breath underwater to cave and decompression training.\n\n## Local water, global trips\n\nWe train in North Texas lakes and springs and lead trips to the Gulf, the Caribbean and beyond.' },
  { section: 'About', key: 'about.image', label: 'About image', type: 'image', default: '' },
  { section: 'About', key: 'about.stats', label: 'Stats', type: 'list',
    itemFields: [{ key: 'value', label: 'Value', type: 'text' }, { key: 'label', label: 'Label', type: 'text' }],
    default: [{ value: '6', label: 'Students max per instructor' }, { value: '3', label: 'Training agencies' }, { value: '1,000+', label: 'Divers certified' }] },
  { section: 'Student portal', key: 'portal.welcome', label: 'Dashboard welcome line', type: 'text', default: 'Manage your classes, check upcoming events, and keep track of your progress.' },
];

const defaults = Object.fromEntries(CONTENT_SCHEMA.map((f) => [f.key, f.default]));

export async function getContent() {
  const { rows } = await query('SELECT key, value FROM content_blocks');
  const out = { ...defaults };
  for (const r of rows) if (r.key in defaults) out[r.key] = r.value;
  return out;
}

export async function setContent(key, value) {
  if (!(key in defaults)) return false;
  await query(`INSERT INTO content_blocks (key, value) VALUES ($1,$2)
               ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [key, JSON.stringify(value)]);
  return true;
}

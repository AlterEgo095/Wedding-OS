// ══════════════════════════════════════════════════════════════════════════════
// JsonLd.tsx — Schema.org Structured Data (Mission 5.9.4 SEO)
// ══════════════════════════════════════════════════════════════════════════════
// Injects JSON-LD structured data for Google rich snippets:
//   - Organization (AENEWS — the company behind the platform)
//   - WebApplication (the SaaS platform itself)
//   - Service (wedding/event experience creation service)
//   - BreadcrumbList (site hierarchy)
//
// These scripts are rendered server-side in <head> via <script type="application/ld+json">.
// They are NOT executed by the browser — only parsed by search engine crawlers.
//
// Reference: https://schema.org/docs/full
// ══════════════════════════════════════════════════════════════════════════════

import React from 'react';

const BASE_URL = 'https://wedding.hpph.net';
const LOGO_URL = `${BASE_URL}/icons/icon-512x512.png`;
const OG_IMAGE_URL = `${BASE_URL}/og-banner.png`;

// ─── Organization schema ─────────────────────────────────────────────────────
// Describes the company (AENEWS) for Google's Knowledge Graph.
const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${BASE_URL}#organization`,
  name: 'AENEWS',
  alternateName: 'AENEWS Event Experience Platform',
  url: BASE_URL,
  logo: {
    '@type': 'ImageObject',
    url: LOGO_URL,
    width: 512,
    height: 512,
  },
  description:
    "Plateforme numérique de création d'expériences événementielles premium — mariages, anniversaires, conférences. Basée en RDC (Kinshasa), au service de l'Afrique et de la diaspora.",
  foundingDate: '2024',
  areaServed: [
    { '@type': 'Country', name: 'République Démocratique du Congo' },
    { '@type': 'Country', name: 'Congo' },
    { '@type': 'Country', name: 'France' },
    { '@type': 'Continent', name: 'Afrique' },
  ],
  knowsLanguage: ['fr', 'en'],
  sameAs: [
    'https://wedding.hpph.net',
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    url: `${BASE_URL}/onboarding`,
    availableLanguage: ['French', 'English'],
  },
};

// ─── WebApplication schema ───────────────────────────────────────────────────
// Describes the SaaS platform (helps Google understand it's a software product).
const webApplicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  '@id': `${BASE_URL}#webapp`,
  name: 'AENEWS Event Experience Platform',
  alternateName: 'Heureux Mariage',
  url: BASE_URL,
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Event Management Software',
  operatingSystem: 'Web',
  browserRequirements: 'Requires JavaScript. Requires HTML5.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Essai gratuit — créez votre première expérience événementielle sans carte bancaire.',
  },
  featureList: [
    'Création de mariages numériques',
    'Collections premium de design (15 styles)',
    'Invitations personnalisées par invité',
    'Gestion d\'invités et tables',
    'QR codes de suivi RSVP',
    'Livre d\'or interactif',
    'Galerie photos multi-emplacements',
    'Partage WhatsApp',
    'Multi-tenant (agences & entreprises)',
    'PWA installable (offline-first)',
  ],
  screenshot: `${BASE_URL}/icons/screenshot-desktop.png`,
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    ratingCount: '127',
    reviewCount: '127',
    bestRating: '5',
    worstRating: '1',
  },
};

// ─── Service schema ──────────────────────────────────────────────────────────
// Describes the service offered (event experience creation).
const serviceSchema = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  '@id': `${BASE_URL}#service`,
  name: "Création d'expériences événementielles numériques premium",
  serviceType: 'Event Experience Design',
  provider: { '@id': `${BASE_URL}#organization` },
  areaServed: [
    { '@type': 'Country', name: 'République Démocratique du Congo' },
    { '@type': 'Country', name: 'Congo' },
    { '@type': 'Country', name: 'France' },
    { '@type': 'Continent', name: 'Afrique' },
  ],
  description:
    "Conception, personnalisation et déploiement d'expériences événementielles numériques premium : mariages, anniversaires, conférences. Invitations digitales personnalisées, QR codes RSVP, livre d'or, galerie photos — sans coder.",
  offers: [
    {
      '@type': 'Offer',
      name: 'Gratuit',
      price: '0',
      priceCurrency: 'USD',
      description: 'Créez votre première expérience événementielle gratuitement.',
    },
    {
      '@type': 'Offer',
      name: 'Standard',
      price: '49',
      priceCurrency: 'USD',
      description: 'Collection Standard — invitations premium avec personnalisation.',
    },
    {
      '@type': 'Offer',
      name: 'Premium',
      price: '149',
      priceCurrency: 'USD',
      description: 'Collection Premium — design sur-mesure, designer dédié, support prioritaire.',
    },
  ],
};

// ─── WebSite schema (with SearchAction) ──────────────────────────────────────
// Helps Google understand the site structure + enables sitelinks search box.
const webSiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${BASE_URL}#website`,
  url: BASE_URL,
  name: 'AENEWS Event Experience Platform',
  alternateName: 'Heureux Mariage',
  publisher: { '@id': `${BASE_URL}#organization` },
  inLanguage: 'fr-FR',
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${BASE_URL}/w/{search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
};

// ─── BreadcrumbList schema ───────────────────────────────────────────────────
// Site hierarchy for the homepage (single crumb).
const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Accueil',
      item: BASE_URL,
    },
  ],
};

type JsonLdProps = {
  /** Which schemas to render. Defaults to all platform-level schemas. */
  schemas?: ('organization' | 'webApplication' | 'service' | 'webSite' | 'breadcrumb')[];
};

/**
 * Renders JSON-LD structured data scripts in <head>.
 *
 * Usage:
 *   <JsonLd />                              // all schemas
 *   <JsonLd schemas={['organization']} />   // only Organization
 *
 * Place inside <head> (or anywhere in a Server Component — Next.js hoists
 * <script> tags with type="application/ld+json" to <head> automatically).
 */
export default function JsonLd({ schemas }: JsonLdProps) {
  const selected = schemas ?? ['organization', 'webApplication', 'service', 'webSite', 'breadcrumb'];
  const allSchemas = {
    organization: organizationSchema,
    webApplication: webApplicationSchema,
    service: serviceSchema,
    webSite: webSiteSchema,
    breadcrumb: breadcrumbSchema,
  };

  return (
    <>
      {selected.map((key) => (
        <script
          key={key}
          type="application/ld+json"
          // dangerouslySetInnerHTML is the React-idiomatic way to inject JSON-LD.
          // The content is server-generated, static, and contains no user input.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(allSchemas[key]) }}
        />
      ))}
    </>
  );
}

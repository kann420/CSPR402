// Single source of truth for the docs sidebar navigation.
//
// Each docs page declares its sections here grouped under a short label.
// The DocsSidebar (app/components/DocsSidebar.tsx) reads this to render the
// page switcher + the "On this page" anchor list, and the section `id`s here
// MUST match the `id` on the <section> rendered in the page so the anchor
// links resolve. When you add a section to a docs page, add it here too.

export type DocSection = { id: string; label: string };
export type DocGroup = { group: string; items: DocSection[] };
export type DocPage = {
  href: string;
  label: string;
  description: string;
  groups: DocGroup[];
};

export const DOCS_PAGES: DocPage[] = [
  {
    href: '/docs',
    label: 'API Reference',
    description: 'HTTP reference for the CSPR402 order flow.',
    groups: [
      {
        group: 'Getting started',
        items: [
          { id: 'auth', label: 'Authentication' },
          { id: 'create-order', label: 'Create order' },
        ],
      },
      {
        group: 'Verify',
        items: [
          { id: 'verify', label: 'Verify deploy' },
          { id: 'poll', label: 'Poll' },
        ],
      },
      {
        group: 'Reference',
        items: [
          { id: 'rules', label: 'Verification rules' },
          { id: 'statuses', label: 'Order statuses' },
          { id: 'errors', label: 'Error codes' },
        ],
      },
    ],
  },
  {
    href: '/docs/quickstart',
    label: 'Quickstart',
    description: 'Five minutes from cold clone to a verified deploy.',
    groups: [
      {
        group: 'Steps',
        items: [
          { id: 'step-01', label: 'Set local env' },
          { id: 'step-02', label: 'Prepare wallets' },
          { id: 'step-03', label: 'Boot backend and web' },
          { id: 'step-04', label: 'Create order and send CSPR' },
          { id: 'step-05', label: 'Verify deploy' },
        ],
      },
    ],
  },
];

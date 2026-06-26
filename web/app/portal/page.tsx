import type { Metadata } from 'next';
import { PortalDemoClient } from './PortalDemoClient';

export const metadata: Metadata = {
  title: 'Portal Demo',
  description:
    'Interactive local demo for CSPR402: create an order, inspect Casper payment instructions, and verify a deploy hash.',
};

export default function PortalPage() {
  return <PortalDemoClient />;
}

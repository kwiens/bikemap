/* THIS FILE IS PART OF PAYLOAD'S ADMIN SCAFFOLDING — see docs/adr/0001. */
import config from '@payload-config';
import { GRAPHQL_POST } from '@payloadcms/next/routes';

export const POST = GRAPHQL_POST(config);

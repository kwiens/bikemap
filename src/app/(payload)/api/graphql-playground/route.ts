/* THIS FILE IS PART OF PAYLOAD'S ADMIN SCAFFOLDING — see docs/adr/0001. */
import config from '@payload-config';
import { GRAPHQL_PLAYGROUND_GET } from '@payloadcms/next/routes';

export const GET = GRAPHQL_PLAYGROUND_GET(config);

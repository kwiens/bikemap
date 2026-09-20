import { redirect } from 'next/navigation';
import { cityIdForQuery } from '@/config/map.config';

export default async function SvgPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string | string[] }>;
}) {
  const query = await searchParams;
  const cityId = cityIdForQuery(query.city);
  redirect(cityId ? `/export?city=${cityId}` : '/export');
}

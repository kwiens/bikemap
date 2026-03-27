export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[/&]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

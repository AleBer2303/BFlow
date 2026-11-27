/**
 * src/domain/text/slug.ts
 *
 * Slug used to build the ids of new objects from the name the user typed (concepts, debts,
 * savings buckets, provisions). One implementation for every place (CC-02).
 *
 * Accents are folded (`normalize('NFD')`), so "Niño" gives "nino" instead of "ni_o". Only ids
 * created from now on change: existing objects keep the id they were stored with.
 */
export function toSlugId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

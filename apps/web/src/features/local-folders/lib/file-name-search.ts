/** 현재 읽은 이름만 필터링한다. 원본 이름/순서와 목록의 일부 표시 여부는 호출자가 보존한다. */
export function filterFolderEntries<T extends { readonly name: string }>(entries: readonly T[], query: string): readonly T[] {
  const needle = query.trim().normalize("NFC").toLowerCase();
  if (!needle) return entries;
  return entries.filter(entry => entry.name.normalize("NFC").toLowerCase().includes(needle));
}

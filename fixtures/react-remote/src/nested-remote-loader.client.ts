export function importNestedRemote<TModule>(specifier: string): Promise<TModule> {
  return import(/* @vite-ignore */ specifier) as Promise<TModule>;
}

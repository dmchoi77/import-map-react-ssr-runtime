export function importNestedRemote<TModule>(specifier: string): Promise<TModule> {
  switch (specifier) {
    case '@mfe/fixture/counter':
      return import('@mfe/fixture/counter') as Promise<TModule>;
    case '@mfe/fixture/profile':
      return import('@mfe/fixture/profile') as Promise<TModule>;
    default:
      return Promise.reject(new Error(`Unknown nested remote: ${specifier}`));
  }
}

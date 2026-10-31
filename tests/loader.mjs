export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('firebase.js') && !specifier.includes('fixtures')) {
    return nextResolve(new URL('./fixtures/firebase.js', import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
}


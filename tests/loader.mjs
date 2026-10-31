export async function resolve(specifier, context, nextResolve) {
  const clean = specifier.split('?')[0];
  if (clean.endsWith('firebase.js') && !clean.includes('fixtures')) {
    return nextResolve(new URL('./fixtures/firebase.js', import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
}

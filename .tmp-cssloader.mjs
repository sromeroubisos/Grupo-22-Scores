// Los CSS modules no existen fuera del bundler: se resuelven a un Proxy que
// devuelve el nombre de la clase, que es todo lo que el test necesita mirar.
export function resolve(spec, ctx, next) {
  if (spec.endsWith('.css')) return { url: 'data:text/javascript,' + encodeURIComponent(
    'export default new Proxy({}, { get: (_, k) => String(k) });'
  ), shortCircuit: true };
  return next(spec, ctx);
}

// Keep the offline experiment zero-install in both Node and the browser.
export async function resolve(specifier, context, nextResolve) {
  if(specifier==='three') return {url:new URL('../public/vendor/three.module.js',import.meta.url).href,shortCircuit:true};
  return nextResolve(specifier,context);
}

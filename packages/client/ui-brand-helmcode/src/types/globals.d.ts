/**
 * Local CSS-inline import shape. The root client program already declares the
 * shared `*.css` and `*.module.css` patterns through ui-theme's own declaration
 * file, so this package declares only its own `?inline` form — under a filename
 * outside the glob that pulls that file into the root program — to avoid a
 * duplicate ambient declaration.
 */
declare module '*.css?inline' {
  const css: string
  export default css
}

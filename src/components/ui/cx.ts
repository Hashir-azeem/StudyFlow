/**
 * Class joiner used across components. Backed by clsx + tailwind-merge (lib/cn),
 * so a `className` passed to a primitive overrides its defaults instead of
 * fighting them (e.g. <Button className="h-12"> wins over the built-in h-10).
 */
export { cn as cx } from "../../lib/cn";

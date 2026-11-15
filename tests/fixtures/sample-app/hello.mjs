export function greet(name) {
  const clean = typeof name === "string" ? name.trim() : "";
  return clean ? `Hello, ${clean}!` : "Hello, world!";
}
